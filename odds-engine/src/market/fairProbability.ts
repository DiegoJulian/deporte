/**
 * Fair Probability Engine. Convierte un Market en probabilidades, manteniendo
 * SIEMPRE separadas raw y fair, y etiquetando el origen.
 */
import type { Market, ProbabilitySource } from '../core/types.js';
import type { EngineConfig, DevigMethod } from '../config/index.js';
import { devig, devigAll, type DevigResult } from '../devig/methods.js';
import { estimateFromSingleOdds } from '../devig/singleOdds.js';
import { validateMarket, type ValidationReport } from './validator.js';

export interface OutcomeProbability {
  readonly outcomeId: string;
  readonly label: string;
  readonly odds: number;
  readonly raw: number;
  readonly fair: number;
  readonly source: ProbabilitySource;
  readonly uncertainty: number;
  readonly warnings: readonly string[];
}

export interface MarketProbabilities {
  readonly marketId: string;
  readonly matchId: string;
  readonly bookmaker: string;
  readonly overround: number | null;
  readonly method: DevigMethod;
  readonly methodParameter: number | null;
  readonly outcomes: readonly OutcomeProbability[];
  readonly validation: ValidationReport;
  /** Dispersion entre los cinco metodos de devig, por salida. Incertidumbre de modelo. */
  readonly methodSpread: readonly number[];
  readonly shadows: Readonly<Partial<Record<DevigMethod, DevigResult>>>;
}

export interface FairProbabilityOptions {
  readonly universe?: 'all' | 'top';
}

export function computeMarketProbabilities(
  market: Market,
  bookmaker: string,
  cfg: EngineConfig,
  opts: FairProbabilityOptions = {},
): MarketProbabilities {
  const validation = validateMarket(market, cfg, bookmaker);
  const quotes = market.outcomes.map((o) => ({ o, q: o.quotes.find((x) => x.bookmaker === bookmaker) }));
  const present = quotes.filter((x) => x.q !== undefined);

  // --- Camino degradado: no hay mercado completo de esa casa ---
  if (!validation.usable || present.length < 2 || present.length !== market.outcomes.length) {
    const outcomes: OutcomeProbability[] = present.map(({ o, q }) => {
      const odds = q!.odds as number;
      const est = estimateFromSingleOdds(odds, {
        ...(opts.universe !== undefined ? { universe: opts.universe } : {}),
        extrapolatedFamily: market.family !== '1X2',
      });
      return {
        outcomeId: o.id, label: o.label, odds,
        raw: est.raw, fair: est.estimated, source: est.source,
        uncertainty: est.uncertainty, warnings: est.warnings,
      };
    });
    return {
      marketId: market.id, matchId: market.matchId, bookmaker,
      overround: validation.overround, method: cfg.devigMethod, methodParameter: null,
      outcomes, validation, methodSpread: outcomes.map(() => 0), shadows: {},
    };
  }

  // --- Camino normal: mercado completo, se retira el margen ---
  const target = market.normalisationTarget ?? 1;
  const odds = present.map((x) => x.q!.odds as number);
  const raw = odds.map((c) => 1 / c);
  const main = devig(raw, cfg.devigMethod, target);
  const all = devigAll(raw, target);
  const shadows: Partial<Record<DevigMethod, DevigResult>> = {};
  for (const m of cfg.devigShadowMethods) shadows[m] = all[m];

  const spread = raw.map((_, i) => {
    const vals = Object.values(all).filter((r) => r.converged).map((r) => r.fair[i] as number);
    return vals.length < 2 ? 0 : Math.max(...vals) - Math.min(...vals);
  });

  const fair = main.converged ? main.fair : all.PROPORTIONAL.fair;
  const outcomes: OutcomeProbability[] = present.map(({ o }, i) => {
    const warnings: string[] = [...main.warnings];
    if ((spread[i] as number) > 0.02) warnings.push(`Los metodos de devig discrepan en ${(((spread[i] as number)) * 100).toFixed(1)} puntos: el reparto del margen es una eleccion, no un dato.`);
    return {
      outcomeId: o.id, label: o.label, odds: odds[i] as number,
      raw: raw[i] as number, fair: fair[i] as number,
      source: 'FAIR_SINGLE_BOOK',
      // Incertidumbre = mitad de la horquilla entre metodos (incertidumbre de modelo)
      uncertainty: Math.max((spread[i] as number) / 2, 0.002),
      warnings,
    };
  });

  return {
    marketId: market.id, matchId: market.matchId, bookmaker,
    overround: validation.overround, method: main.method, methodParameter: main.parameter,
    outcomes, validation, methodSpread: spread, shadows,
  };
}
