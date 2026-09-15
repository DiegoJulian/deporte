/**
 * Odds Quality Score (0-100). Mide la calidad del DATO, nunca la bondad de la
 * apuesta. No modifica jamas la cuota original: solo alimenta el
 * confidenceScore.
 *
 * Es un producto de factores en (0,1]: cada defecto multiplica. Un producto y
 * no una suma ponderada a proposito — con una suma, un dato excelente en cinco
 * factores compensa uno inservible en el sexto, y eso es exactamente lo que no
 * queremos.
 */
import type { EngineConfig } from '../config/index.js';
import { clamp } from '../core/numeric.js';

export interface OddsQualityInput {
  /** Margen del mercado, o null si no se pudo calcular. */
  readonly overround: number | null;
  readonly marketComplete: boolean;
  readonly booksUsed: number;
  readonly dispersion: number | null;
  readonly ageMs: number;
  readonly live: boolean;
  /** |cambio de probabilidad implicita| desde la apertura. */
  readonly movement?: number;
  readonly liquidity?: number;
  /** Reputacion de la casa en (0,1]. */
  readonly bookReputation?: number;
}

export interface OddsQualityResult {
  readonly score: number;
  readonly factors: Readonly<Record<string, number>>;
  readonly reasons: readonly string[];
}

export function oddsQualityScore(input: OddsQualityInput, cfg: EngineConfig): OddsQualityResult {
  const c = cfg.confidence;
  const reasons: string[] = [];
  const factors: Record<string, number> = {};

  factors.completeness = input.marketComplete ? 1 : 0.7;
  if (!input.marketComplete) reasons.push('Mercado incompleto: el margen no es observable.');

  if (input.overround === null) {
    factors.overround = 0.6;
    reasons.push('Sin margen calculable.');
  } else {
    factors.overround = Math.exp(-c.overroundDecay * Math.max(0, input.overround - c.overroundReference));
    if (input.overround > 0.10) reasons.push(`Margen alto: ${(input.overround * 100).toFixed(1)} %.`);
  }

  factors.books = c.booksFloor + (1 - c.booksFloor) * (1 - Math.exp(-Math.max(0, input.booksUsed - 1) / c.booksScale));
  if (input.booksUsed <= 1) reasons.push('Una sola casa: sin referencia externa.');

  if (input.dispersion === null) factors.dispersion = 0.85;
  else {
    factors.dispersion = 1 / (1 + (input.dispersion / c.dispersionReference) ** 2);
    if (input.dispersion > c.dispersionReference) reasons.push(`Dispersion entre casas de ${(input.dispersion * 100).toFixed(1)} puntos.`);
  }

  const halfLife = input.live ? c.staleHalfLifeLive : c.staleHalfLifePrematch;
  factors.freshness = Math.max(c.staleFloor, Math.pow(0.5, Math.max(0, input.ageMs) / halfLife));
  if (factors.freshness < 0.5) reasons.push(`Cuota de hace ${(input.ageMs / 60000).toFixed(0)} min: puede estar desfasada.`);

  const mv = input.movement ?? 0;
  factors.stability = 1 - Math.min(c.movementMaxPenalty, (Math.abs(mv) / c.movementReference) * c.movementMaxPenalty);
  if (Math.abs(mv) > c.movementReference / 2) reasons.push(`La linea se ha movido ${(Math.abs(mv) * 100).toFixed(1)} puntos desde la apertura.`);

  factors.liquidity = input.liquidity === undefined ? 0.95 : clamp(0.6 + 0.4 * Math.tanh(input.liquidity / 10000), 0.6, 1);
  factors.reputation = clamp(input.bookReputation ?? 1, 0.1, 1);

  const score = 100 * Object.values(factors).reduce((a, b) => a * b, 1);
  return { score: clamp(score, 0, 100), factors, reasons };
}
