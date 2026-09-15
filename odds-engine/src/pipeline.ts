/**
 * Orquestador. Es la arquitectura de la seccion 23 del encargo, cableada:
 *
 *   Odds Collector -> Odds Normalizer -> Market Validator -> Overround
 *   -> Fair Probability -> Market Consensus -> Semaforo individual
 *   -> Correlation (rejilla de marcadores) -> Combination Generator
 *   -> Combined Odds -> Joint Probability -> Optimizer -> Confidence
 *   -> Ranking -> API
 *
 * El colector no vive aqui: entra `Market[]` ya normalizado por el backend.
 */
import type { Market, MatchContext, Selection } from './core/types.js';
import { asFair, asOdds, asRaw, asConsensus } from './core/types.js';
import type { EngineConfig } from './config/index.js';
import { DEFAULT_CONFIG } from './config/index.js';
import { computeMarketProbabilities } from './market/fairProbability.js';
import { computeConsensus } from './consensus/index.js';
import { oddsQualityScore } from './quality/index.js';
import { classifyBinary, classifyThreeWay, classifyValue } from './classify/index.js';
import { fitGridFromMarkets, type FitTarget, type GridFit, type ScoreGrid } from './correlation/scoreGrid.js';
import { parsePredicate } from './correlation/predicates.js';
import { checkCoherence, type CoherenceInput, type CoherenceReport } from './market/coherence.js';
import type { CandidateLeg } from './combine/generator.js';
import { optimiseCombinations, type OptimizerResult, type OptimizerOptions } from './optimize/index.js';

export interface AnalyseInput {
  readonly matches: readonly MatchContext[];
  readonly markets: readonly Market[];
  /** Casa en la que se apuesta. Su precio es el que se toma. */
  readonly bookmaker: string;
  /** Casas usadas SOLO como referencia de consenso. */
  readonly referenceBookmakers?: readonly string[];
  readonly now?: number;
  readonly universe?: 'all' | 'top';
}

export interface AnalyseResult {
  readonly selections: readonly Selection[];
  readonly grids: ReadonlyMap<string, ScoreGrid>;
  readonly gridFits: ReadonlyMap<string, GridFit>;
  /**
   * Coherencia entre 1X2, doble oportunidad y empate no valido, partido a
   * partido. Solo aparece el partido que traiga al menos dos de las tres.
   */
  readonly coherence: ReadonlyMap<string, CoherenceReport>;
  readonly warnings: readonly string[];
}

/**
 * 1X2, doble oportunidad y empate no valido NO son tres mercados: son la MISMA
 * distribucion del resultado escrita de tres maneras.
 *
 *   DC(1X) = P(1) + P(X)      DC(12) = P(1) + P(2)     DC(X2) = P(X) + P(2)
 *   DNB(1) = P(1) / (P(1) + P(2))
 *
 * Consecuencia para el ajuste de la rejilla de marcadores: las tres juntas
 * aportan como mucho DOS ecuaciones independientes sobre (lambda, mu, rho),
 * exactamente las mismas dos que aporta el 1X2 solo. Contarlas por separado
 * haria creer al motor que tiene cuatro o cinco restricciones cuando tiene dos,
 * y volveria a ajustar tres parametros con informacion para menos: es el mismo
 * fallo que el deduplicado roto, en version mas dificil de ver.
 *
 * Lo que SI aportan es otra cosa, y es valiosa: como la casa las cotiza por
 * separado, la discrepancia entre ellas delata un precio mal puesto SIN
 * necesidad de una segunda casa. Eso lo mide `checkCoherence`, no el ajuste.
 */
export const FAMILIAS_DEL_RESULTADO: ReadonlySet<string> = new Set(['1X2', 'DC', 'DNB']);
const CUPO_RESULTADO = 2;

/**
 * Clave canonica de la salida, para construir el predicado sobre el marcador.
 *
 * OJO con el handicap: la `line` del mercado va SIEMPRE en perspectiva del
 * local (asi la normaliza el adaptador). La pata del visitante necesita el
 * signo cambiado, o se evalua un mercado distinto del que se apuesta.
 */
function predicateKey(family: string, outcomeId: string, line?: number): string {
  const flip = (family === 'AH' || family === 'EH') && outcomeId === 'AWAY';
  const effective = line === undefined ? undefined : flip ? -line : line;
  const l = effective === undefined ? '' : `@${effective}`;
  switch (family) {
    case '1X2': return `1X2:${outcomeId}`;
    case 'OU': return `OU:${outcomeId}${l}`;
    case 'BTTS': return `BTTS:${outcomeId}`;
    case 'DC': return `DC:${outcomeId}`;
    case 'DNB': return `DNB:${outcomeId}`;
    case 'AH': return `AH:${outcomeId}${l}`;
    case 'EH': return `EH:${outcomeId}${l}`;   // la DRAW usa la linea del local
    case 'ODDEVEN': return `ODDEVEN:${outcomeId}`;
    case 'CS': return `CS:${outcomeId}`;
    case 'TT': return `TT:${outcomeId}${l}`;
    default: return `${family}:${outcomeId}${l}`;
  }
}

export function analyse(input: AnalyseInput, cfg: EngineConfig = DEFAULT_CONFIG): AnalyseResult {
  const now = input.now ?? Date.now();
  const warnings: string[] = [];
  const selections: Selection[] = [];
  const fitTargets = new Map<string, FitTarget[]>();
  /** Probabilidades fair del bloque del resultado, para el control de coherencia. */
  const resultado = new Map<string, { threeWay?: { home: number; draw: number; away: number };
    doubleChance: { homeOrDraw?: number; homeOrAway?: number; drawOrAway?: number };
    drawNoBet: { home?: number; away?: number } }>();
  const bloqueDe = (matchId: string) => {
    let b = resultado.get(matchId);
    if (b === undefined) { b = { doubleChance: {}, drawNoBet: {} }; resultado.set(matchId, b); }
    return b;
  };

  for (const market of input.markets) {
    const probs = computeMarketProbabilities(market, input.bookmaker, cfg, {
      ...(input.universe !== undefined ? { universe: input.universe } : {}),
    });
    const consensus = computeConsensus(market, cfg, { now });
    const live = market.live === true;

    probs.outcomes.forEach((o, i) => {
      const idx = consensus.outcomeIds.indexOf(o.outcomeId);
      const consensusP = idx >= 0 ? consensus.consensus[idx] : undefined;
      const dispersion = idx >= 0 ? consensus.dispersion[idx] : undefined;
      const quote = market.outcomes.find((x) => x.id === o.outcomeId)?.quotes.find((q) => q.bookmaker === input.bookmaker);
      const ageMs = quote === undefined ? 0 : Math.max(0, now - quote.observedAt);
      const movement = quote?.openingOdds === undefined ? undefined : Math.abs(1 / o.odds - 1 / (quote.openingOdds as number));

      const quality = oddsQualityScore({
        overround: probs.overround,
        marketComplete: market.complete && probs.validation.usable,
        booksUsed: consensus.booksUsed,
        dispersion: dispersion === undefined || Number.isNaN(dispersion) ? null : dispersion,
        ageMs, live,
        ...(movement !== undefined ? { movement } : {}),
        ...(quote?.liquidity !== undefined ? { liquidity: quote.liquidity } : {}),
      }, cfg);

      // El consenso solo sirve como referencia de valor si excluye a la casa propia.
      const externalBooks = consensus.books.filter((b) => b.bookmaker !== input.bookmaker && b.weight > 0).length;
      const hasExternalReference = externalBooks >= 2 && consensusP !== undefined && Number.isFinite(consensusP);

      const value = classifyValue({
        odds: o.odds,
        reference: hasExternalReference ? (consensusP as number) : null,
        basis: hasExternalReference ? 'consensus' : externalBooks === 0 ? 'self' : null,
        ...(dispersion !== undefined && Number.isFinite(dispersion)
          ? { referenceUncertainty: dispersion / Math.sqrt(Math.max(consensus.effectiveBooks, 1)) }
          : {}),
      }, cfg);

      const riskLight = market.kind === 'THREE_WAY'
        ? classifyThreeWay(o.fair, cfg)
        : classifyBinary(o.fair, cfg);

      const selWarnings = [
        ...o.warnings,
        ...probs.validation.issues.filter((x) => x.severity !== 'INFO').map((x) => x.message),
        ...quality.reasons,
      ];
      if (riskLight === 'EXTREMA') selWarnings.push('Probabilidad por encima del 95 %: revisar el origen de la cuota antes de usarla. A esta altura el margen relativo se dispara y un error palpable de la casa es anulable.');

      selections.push({
        selectionId: `${market.id}::${o.outcomeId}`,
        matchId: market.matchId,
        marketId: market.id,
        family: market.family,
        outcomeId: o.outcomeId,
        label: o.label,
        period: market.period ?? 'FULL_TIME',
        odds: asOdds(o.odds),
        bookmaker: input.bookmaker,
        raw: asRaw(o.raw),
        fair: asFair(o.fair),
        source: o.source,
        uncertainty: o.uncertainty,
        overround: probs.overround,
        consensus: hasExternalReference ? asConsensus(consensusP as number) : null,
        dispersion: dispersion === undefined || Number.isNaN(dispersion) ? null : dispersion,
        oddsQuality: quality.score,
        confidence: quality.score,
        riskLight,
        valueLight: value.light,
        expectedValue: value.expectedValue,
        evBasis: value.basis,
        warnings: selWarnings,
      });

      // Bloque del resultado, para contrastar 1X2 contra DC y DNB despues.
      if (probs.validation.usable && (market.period ?? 'FULL_TIME') === 'FULL_TIME') {
        const b = bloqueDe(market.matchId);
        if (market.family === '1X2') {
          const t = b.threeWay ?? { home: NaN, draw: NaN, away: NaN };
          if (o.outcomeId === 'HOME') t.home = o.fair;
          if (o.outcomeId === 'DRAW') t.draw = o.fair;
          if (o.outcomeId === 'AWAY') t.away = o.fair;
          b.threeWay = t;
        } else if (market.family === 'DC') {
          if (o.outcomeId === '1X') b.doubleChance.homeOrDraw = o.fair;
          if (o.outcomeId === '12') b.doubleChance.homeOrAway = o.fair;
          if (o.outcomeId === 'X2') b.doubleChance.drawOrAway = o.fair;
        } else if (market.family === 'DNB') {
          if (o.outcomeId === 'HOME') b.drawNoBet.home = o.fair;
          if (o.outcomeId === 'AWAY') b.drawNoBet.away = o.fair;
        }
      }

      // Objetivo para ajustar la rejilla de marcadores del partido.
      // SOLO mercados de partido completo: la rejilla modela el marcador final.
      // Un mercado de 1a parte NO se puede evaluar sobre ella, y meterlo en el
      // ajuste corrompe los parametros.
      if (probs.validation.usable && (market.period ?? 'FULL_TIME') === 'FULL_TIME') {
        const np = parsePredicate(predicateKey(market.family, o.outcomeId, market.line));
        if (np !== null) {
          const list = fitTargets.get(market.matchId) ?? [];
          list.push({ key: np.key, predicate: np.predicate, probability: o.fair });
          fitTargets.set(market.matchId, list);
        }
      }
    });

    warnings.push(...consensus.warnings.map((w) => `[${market.id}] ${w}`));
  }

  // --- Ajuste de la distribucion de marcadores, un partido cada vez ---
  const grids = new Map<string, ScoreGrid>();
  const gridFits = new Map<string, GridFit>();
  for (const [matchId, targets] of fitTargets) {
    // Se quita una salida por mercado para no meter ecuaciones redundantes
    // (en un 1X2 desmarginado, la tercera sale de las otras dos).
    //
    // OJO CON EL CONTADOR: esto llevaba un Set y `[...seen].filter(...).length`,
    // que en un Set vale SIEMPRE 0 o 1 y nunca 2. Con eso la condicion del 1X2
    // (`count < 2`) se cumplia siempre y pasaban las TRES salidas, asi que un
    // partido con solo 1X2 llegaba al ajuste con 3 objetivos —dos de ellos
    // independientes— y salia una rejilla de 3 parametros con residuo cero y
    // nota maxima de ajuste. Es decir: el motor se inventaba la precision que
    // dice no inventarse nunca. Hace falta un multiconjunto, no un conjunto.
    const seen = new Map<string, number>();
    const independent = targets.filter((t) => {
      const fam = t.key.split(':')[0] as string;
      const line = t.key.includes('@') ? t.key.slice(t.key.indexOf('@')) : '';
      // 1X2, DC y DNB comparten cupo: son la misma distribucion del resultado
      // escrita de tres formas, y entre las tres no pasan de dos ecuaciones.
      const enBloque = FAMILIAS_DEL_RESULTADO.has(fam);
      const k = enBloque ? 'RESULTADO' : `${fam}${line}`;
      const count = seen.get(k) ?? 0;
      seen.set(k, count + 1);
      return count < (enBloque ? CUPO_RESULTADO : 1);
    });
    const fit = fitGridFromMarkets(independent);
    if (fit !== null && fit.converged) {
      grids.set(matchId, fit.grid);
      gridFits.set(matchId, fit);
      warnings.push(...fit.warnings.map((w) => `[${matchId}] ${w}`));
    } else {
      warnings.push(`[${matchId}] No se pudo ajustar la distribucion de marcadores (${independent.length} mercados independientes, hacen falta 3). Las combinadas de este partido usaran cotas, no calculo.`);
    }
  }

  // --- Coherencia del bloque del resultado ---
  // Es la unica deteccion de precios mal puestos que NO necesita una segunda
  // casa: si 1X2, doble oportunidad y empate no valido no dan las mismas
  // probabilidades, una de las tres esta mal cotizada.
  const coherence = new Map<string, CoherenceReport>();
  for (const [matchId, b] of resultado) {
    const t = b.threeWay;
    if (t === undefined || !Number.isFinite(t.home + t.draw + t.away)) continue;
    const tieneDC = Object.values(b.doubleChance).some((x) => x !== undefined);
    const tieneDNB = Object.values(b.drawNoBet).some((x) => x !== undefined);
    if (!tieneDC && !tieneDNB) continue;
    const input: CoherenceInput = {
      threeWay: t,
      ...(tieneDC ? { doubleChance: b.doubleChance } : {}),
      ...(tieneDNB ? { drawNoBet: b.drawNoBet } : {}),
    };
    const rep = checkCoherence(input);
    coherence.set(matchId, rep);
    if (rep.incoherent) {
      const peor = [...rep.checks].sort((x, y) => Math.abs(y.deltaPoints) - Math.abs(x.deltaPoints))[0];
      warnings.push(`[${matchId}] Los mercados del resultado no cuadran entre si: ${(rep.maxDeltaPoints * 100).toFixed(1)} puntos de diferencia` +
        (peor === undefined ? '.' : ` en ${peor.market} ${peor.outcome} (el 1X2 implica ${(peor.implied * 100).toFixed(1)} % y ese mercado cotiza ${(peor.observed * 100).toFixed(1)} %). Uno de los dos precios esta mal puesto.`));
    }
  }

  return { selections, grids, gridFits, coherence, warnings };
}

export interface BuildResult extends AnalyseResult {
  readonly optimisation: OptimizerResult;
}

/** Analisis completo + construccion de la combinada. */
export function buildCombinations(
  input: AnalyseInput,
  cfg: EngineConfig = DEFAULT_CONFIG,
  opts: OptimizerOptions = {},
): BuildResult {
  const analysis = analyse(input, cfg);
  const candidates: CandidateLeg[] = analysis.selections.map((s) => {
    // Sin predicado -> la pata no se puede evaluar sobre la rejilla y su
    // correlacion se acota en vez de calcularse. Es el caso de los mercados que
    // no son de partido completo, y de cualquier familia sin traduccion a
    // marcador (corners, tarjetas, jugador).
    if (s.period !== 'FULL_TIME') return { selection: s };
    const market = input.markets.find((m) => m.id === s.marketId);
    const np = parsePredicate(predicateKey(s.family, s.outcomeId, market?.line));
    return np === null ? { selection: s } : { selection: s, predicate: np.predicate };
  });

  const gridMaxErrors = new Map<string, number>();
  for (const [matchId, fit] of analysis.gridFits) gridMaxErrors.set(matchId, fit.maxAbsError);

  const optimisation = optimiseCombinations(candidates, cfg, {
    ...opts,
    grids: analysis.grids,
    gridMaxErrors,
    ...(input.universe !== undefined ? { universe: input.universe } : {}),
  });

  return { ...analysis, optimisation };
}
