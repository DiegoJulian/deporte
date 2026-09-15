/**
 * Combination Optimizer (seccion 11).
 *
 * No busca "la combinada con mas patas" ni "la de mas probabilidad": busca la
 * mejor relacion entre probabilidad ajustada, numero de patas, cuota, margen,
 * correlacion e incertidumbre, con la cuota objetivo como restriccion.
 *
 * PRINCIPIO DE CONSERVADURISMO (seccion 27): si despues de todo esto ninguna
 * combinada supera los filtros, la salida es "NO EXISTE COMBINACION VERDE CON
 * SUFICIENTE CONFIANZA". El motor no baja el liston para tener algo que
 * ensenar.
 */
import type { CombinationLight, CorrelationRisk, Selection } from '../core/types.js';
import type { EngineConfig } from '../config/index.js';
import type { ScoreGrid } from '../correlation/scoreGrid.js';
import type { CandidateLeg, GeneratorOptions, GeneratorStats } from '../combine/generator.js';
import { generateCombinations } from '../combine/generator.js';
import { jointProbability, type JointProbabilityResult } from '../combine/index.js';
import { confidenceScore } from '../confidence/index.js';
import { classifyCombination, type CombinationClassification } from '../classify/index.js';
import { compareCombinations, rankCombination, type RankResult } from '../rank/index.js';

export interface EvaluatedCombination {
  readonly selections: readonly Selection[];
  readonly combinedOdds: number;
  readonly joint: JointProbabilityResult;
  readonly confidence: number;
  readonly confidenceReasons: readonly string[];
  readonly correlationRisk: CorrelationRisk;
  readonly rank: RankResult;
  readonly classification: CombinationClassification;
  readonly legs: number;
  readonly warnings: readonly string[];
}

export interface OptimizerResult {
  readonly candidates: readonly EvaluatedCombination[];
  readonly best: EvaluatedCombination | null;
  readonly bestAttainableProbability: number | null;
  readonly verdict: string;
  readonly anyEdge: boolean;
  readonly stats: GeneratorStats;
  readonly rejected: { readonly reason: string; readonly count: number }[];
  readonly warnings: readonly string[];
}

export interface OptimizerOptions extends GeneratorOptions {
  readonly grids?: ReadonlyMap<string, ScoreGrid>;
  readonly gridMaxErrors?: ReadonlyMap<string, number>;
  readonly conservative?: boolean;
  readonly universe?: 'all' | 'top';
  /** Aplicar los filtros duros de configuracion. */
  readonly applyFilters?: boolean;
}

export function optimiseCombinations(
  candidates: readonly CandidateLeg[],
  cfg: EngineConfig,
  opts: OptimizerOptions = {},
): OptimizerResult {
  const grids = opts.grids ?? new Map<string, ScoreGrid>();
  const gen = generateCombinations(candidates, cfg, { ...opts, grids });
  const warnings = [...gen.warnings];
  const rejectionCounts = new Map<string, number>();
  const reject = (r: string): void => { rejectionCounts.set(r, (rejectionCounts.get(r) ?? 0) + 1); };

  const evaluated: EvaluatedCombination[] = [];

  for (const combo of gen.combinations) {
    const legs = combo.indices.map((i) => candidates[i] as CandidateLeg);
    const sels = legs.map((l) => l.selection);

    const joint = jointProbability({
      legs: legs.map((l) => ({
        selectionId: l.selection.selectionId,
        matchId: l.selection.matchId,
        marketId: l.selection.marketId,
        fair: l.selection.fair,
        odds: l.selection.odds as number,
        ...(l.predicate !== undefined ? { predicate: l.predicate } : {}),
      })),
      uncertainties: sels.map((s) => s.uncertainty),
      grids,
    });

    const modelled = Object.values(joint.regimes).every((r) => r !== 'BOUNDS');
    // El ajuste de la rejilla solo importa cuando la rejilla se usa: si todas
    // las patas son de partidos distintos, la conjunta no pasa por el modelo y
    // su error no tiene por que castigar la confianza.
    const matchesConVariasPatas = [...new Set(sels.map((s) => s.matchId))]
      .filter((m) => sels.filter((s) => s.matchId === m).length > 1);
    const gridErr = matchesConVariasPatas
      .map((m) => opts.gridMaxErrors?.get(m))
      .filter((x): x is number => x !== undefined);

    const conf = confidenceScore({
      legQuality: sels.map((s) => s.oddsQuality),
      sources: sels.map((s) => s.source),
      correlationRisk: joint.correlation.risk,
      correlationModelled: modelled,
      jointUncertainty: joint.uncertainty,
      adjustedJointProbability: joint.adjustedJointProbability,
      ...(gridErr.length > 0 ? { gridMaxError: Math.max(...gridErr) } : {}),
    }, cfg);

    const rank = rankCombination({
      adjustedJointProbability: joint.adjustedJointProbability,
      adjustedLowerBound: joint.adjustedLowerBound,
      combinedOdds: joint.combinedOdds,
      confidence: conf.score,
      correlationRisk: joint.correlation.risk,
      legs: sels.length,
      compoundMargin: joint.compoundMargin,
      ...(opts.conservative !== undefined ? { conservative: opts.conservative } : {}),
      ...(opts.universe !== undefined ? { universe: opts.universe } : {}),
    });

    if (opts.applyFilters !== false) {
      if (conf.score < cfg.filters.minimumConfidenceScore) { reject(`confianza < ${cfg.filters.minimumConfidenceScore}`); continue; }
      if (Math.min(...sels.map((s) => s.oddsQuality)) < cfg.filters.minimumOddsQuality) { reject(`calidad de cuota < ${cfg.filters.minimumOddsQuality}`); continue; }
      if (joint.correlation.maxAbsCoefficient > cfg.filters.maxCorrelation) { reject(`correlacion > ${cfg.filters.maxCorrelation}`); continue; }
      if (joint.correlation.hasIncompatibility) { reject('patas incompatibles'); continue; }
      if (joint.correlation.hasRedundancy) { reject('patas redundantes (la casa no suele dejar combinarlas)'); continue; }
    }

    evaluated.push({
      selections: sels,
      combinedOdds: joint.combinedOdds,
      joint,
      confidence: conf.score,
      confidenceReasons: conf.reasons,
      correlationRisk: joint.correlation.risk,
      rank,
      classification: classifyCombination(joint.adjustedJointProbability, conf.score, cfg),
      legs: sels.length,
      warnings: joint.warnings,
    });
  }

  const bestAttainable = evaluated.length === 0 ? null
    : Math.max(...evaluated.map((e) => e.joint.adjustedJointProbability));

  const reclassified = evaluated.map((e) => ({
    ...e,
    classification: classifyCombination(e.joint.adjustedJointProbability, e.confidence, cfg, bestAttainable ?? undefined),
  }));

  reclassified.sort(compareCombinations);
  const top = reclassified.slice(0, cfg.optimizer.maxCandidatesReturned);
  const anyEdge = reclassified.some((e) => e.rank.hasEdge);
  const best = top[0] ?? null;

  let verdict: string;
  if (best === null) {
    verdict = 'NO EXISTE COMBINACION QUE ALCANCE LA CUOTA OBJETIVO CON LOS FILTROS ACTUALES.';
  } else if (!anyEdge) {
    const validated = reclassified.find((e) => e.classification.validated);
    verdict = validated === undefined
      ? `NO EXISTE COMBINACION VERDE CON SUFICIENTE CONFIANZA. Ninguna candidata tiene valor esperado positivo: la menos mala paga un peaje del ${(best.rank.tollScore * 100).toFixed(2)} % con ${best.legs} pata(s).`
      : `Ninguna candidata tiene valor esperado positivo. La mejor por peaje es VERDE relativo con confianza ${best.confidence.toFixed(0)}/100 y paga ${(best.rank.tollScore * 100).toFixed(2)} %.`;
  } else {
    const light: CombinationLight = best.classification.light;
    verdict = `${best.classification.label} — ${best.rank.explanation}${light === 'VERDE' ? '' : ' (el semaforo relativo no es VERDE: hay opciones mas probables para la misma cuota)'}`;
  }

  return {
    candidates: top,
    best,
    bestAttainableProbability: bestAttainable,
    verdict,
    anyEdge,
    stats: gen.stats,
    rejected: [...rejectionCounts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    warnings,
  };
}
