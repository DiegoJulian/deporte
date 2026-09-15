/**
 * Market Consensus Engine + Market Dispersion (secciones 16 y 17).
 *
 * El error que hay que evitar es promediar 1/cuota entre casas. Eso promedia
 * probabilidades infladas cada una con un margen distinto, y el resultado
 * no suma 1 ni significa nada. La secuencia correcta es:
 *
 *   1. quedarse SOLO con las casas que cotizan el mercado COMPLETO;
 *   2. desmarginar cada casa por separado;
 *   3. detectar atipicas con mediana + MAD sobre el logit;
 *   4. ponderar: menos margen y mas frescura pesan mas;
 *   5. agregar EN ESPACIO LOGIT y renormalizar a 1.
 *
 * Se agrega en logit y no en probabilidad porque la media aritmetica de
 * probabilidades esta sesgada hacia el centro en los extremos y rompe la
 * estructura de momios que es justo lo que las casas cotizan.
 */
import type { Market } from '../core/types.js';
import type { EngineConfig } from '../config/index.js';
import { devig } from '../devig/methods.js';
import { brent, mad, median, stdev, sum } from '../core/numeric.js';

export interface BookFair {
  readonly bookmaker: string;
  readonly fair: readonly number[];
  readonly overround: number;
  readonly observedAt: number;
  readonly weight: number;
  readonly outlier: boolean;
  /** z robusto sobre el logit de la salida mas discrepante. */
  readonly maxRobustZ: number;
}

export interface ConsensusResult {
  readonly outcomeIds: readonly string[];
  readonly consensus: readonly number[];
  readonly books: readonly BookFair[];
  readonly booksUsed: number;
  readonly booksExcluded: number;
  /** Tamano de muestra efectivo de Kish: (sum w)^2 / sum w^2. */
  readonly effectiveBooks: number;
  /** Dispersion por salida, en puntos de probabilidad (desv. tipica ponderada). */
  readonly dispersion: readonly number[];
  /** Dispersion robusta por salida (MAD escalado). */
  readonly dispersionRobust: readonly number[];
  readonly range: readonly number[];
  readonly warnings: readonly string[];
}

const logit = (p: number): number => Math.log(p / (1 - p));
const expit = (x: number): number => 1 / (1 + Math.exp(-x));
const EPS = 1e-9;

export interface ConsensusOptions {
  /** Peso de reputacion por casa. Ausente => 1. */
  readonly bookWeights?: Readonly<Record<string, number>>;
  /** Semivida de frescura en ms. */
  readonly freshnessHalfLife?: number;
  /** Umbral de z robusto para marcar atipica. */
  readonly outlierZ?: number;
  readonly now?: number;
}

export function computeConsensus(market: Market, cfg: EngineConfig, opts: ConsensusOptions = {}): ConsensusResult {
  const now = opts.now ?? Date.now();
  const halfLife = opts.freshnessHalfLife ?? 6 * 3600_000;
  const outlierZ = opts.outlierZ ?? 3;
  const warnings: string[] = [];

  const bookNames = [...new Set(market.outcomes.flatMap((o) => o.quotes.map((q) => q.bookmaker)))];
  const complete: { bookmaker: string; odds: number[]; observedAt: number }[] = [];

  for (const b of bookNames) {
    const odds: number[] = [];
    let observedAt = 0;
    let ok = true;
    for (const o of market.outcomes) {
      const q = o.quotes.find((x) => x.bookmaker === b);
      if (q === undefined || !((q.odds as number) > 1)) { ok = false; break; }
      odds.push(q.odds as number);
      observedAt = Math.max(observedAt, q.observedAt);
    }
    if (ok && odds.length === market.outcomes.length) complete.push({ bookmaker: b, odds, observedAt });
  }

  const excluded = bookNames.length - complete.length;
  if (excluded > 0) warnings.push(`${excluded} casa(s) descartadas del consenso por no cotizar el mercado completo: sin todas las salidas no se puede quitar el margen.`);

  const n = market.outcomes.length;
  const outcomeIds = market.outcomes.map((o) => o.id);
  const target = market.normalisationTarget ?? 1;

  if (complete.length === 0) {
    return {
      outcomeIds, consensus: new Array<number>(n).fill(NaN), books: [], booksUsed: 0,
      booksExcluded: excluded, effectiveBooks: 0,
      dispersion: new Array<number>(n).fill(NaN), dispersionRobust: new Array<number>(n).fill(NaN),
      range: new Array<number>(n).fill(NaN),
      warnings: [...warnings, 'Ninguna casa cotiza el mercado completo: no hay consenso posible.'],
    };
  }

  const fairs = complete.map((c) => {
    const raw = c.odds.map((o) => 1 / o);
    const d = devig(raw, cfg.devigMethod, target);
    const S = sum(raw);
    return { ...c, fair: d.converged ? d.fair : raw.map((r) => (target * r) / S), overround: d.overround };
  });

  // --- Atipicas: mediana + MAD sobre el logit, salida a salida ---
  const logits: number[][] = fairs.map((f) => f.fair.map((p) => logit(Math.min(1 - EPS, Math.max(EPS, p)))));
  const robustZ: number[] = fairs.map(() => 0);
  for (let i = 0; i < n; i++) {
    const col = logits.map((L) => L[i] as number);
    const m = median(col);
    const s = mad(col);
    col.forEach((v, b) => {
      const z = s > 1e-9 ? Math.abs(v - m) / s : 0;
      robustZ[b] = Math.max(robustZ[b] as number, z);
    });
  }

  const books: BookFair[] = fairs.map((f, b) => {
    const outlier = (robustZ[b] as number) > outlierZ;
    const rep = opts.bookWeights?.[f.bookmaker] ?? 1;
    // Menos margen => casa mas afilada => mas peso. Frescura decae por semivida.
    const marginWeight = 1 / (Math.max(f.overround, 0.002) + 0.01);
    const freshness = Math.pow(0.5, Math.max(0, now - f.observedAt) / halfLife);
    const weight = outlier ? 0 : rep * marginWeight * Math.max(freshness, 0.05);
    return {
      bookmaker: f.bookmaker, fair: f.fair, overround: f.overround, observedAt: f.observedAt,
      weight, outlier, maxRobustZ: robustZ[b] as number,
    };
  });

  const used = books.filter((b) => b.weight > 0);
  if (used.length === 0) {
    warnings.push('Todas las casas quedaron marcadas como atipicas: se usa la mediana sin ponderar.');
    const consensusMed = Array.from({ length: n }, (_, i) => median(books.map((b) => b.fair[i] as number)));
    const S = sum(consensusMed);
    return {
      outcomeIds, consensus: consensusMed.map((p) => (target * p) / S), books, booksUsed: 0, booksExcluded: excluded,
      effectiveBooks: 0,
      dispersion: Array.from({ length: n }, (_, i) => stdev(books.map((b) => b.fair[i] as number))),
      dispersionRobust: Array.from({ length: n }, (_, i) => mad(books.map((b) => b.fair[i] as number))),
      range: Array.from({ length: n }, (_, i) => {
        const col = books.map((b) => b.fair[i] as number);
        return Math.max(...col) - Math.min(...col);
      }),
      warnings,
    };
  }

  const W = sum(used.map((b) => b.weight));
  const effectiveBooks = W ** 2 / sum(used.map((b) => b.weight ** 2));

  // --- Agregacion en logit + renormalizacion por potencia ---
  const meanLogit = Array.from({ length: n }, (_, i) =>
    sum(used.map((b) => b.weight * logit(Math.min(1 - EPS, Math.max(EPS, b.fair[i] as number))))) / W);
  const provisional = meanLogit.map(expit);
  const Sp = sum(provisional);
  let consensus: number[];
  if (Math.abs(Sp - target) < 1e-12) {
    consensus = provisional;
  } else {
    const k = brent((kk) => sum(provisional.map((p) => p ** kk)) - target, 0.05, 20, 1e-14);
    consensus = k === null ? provisional.map((p) => (target * p) / Sp) : provisional.map((p) => p ** k);
  }

  const dispersion = Array.from({ length: n }, (_, i) => {
    const col = used.map((b) => b.fair[i] as number);
    const mu = sum(used.map((b) => b.weight * (b.fair[i] as number))) / W;
    return Math.sqrt(sum(used.map((b) => b.weight * ((b.fair[i] as number) - mu) ** 2)) / W) * (col.length > 1 ? Math.sqrt(col.length / (col.length - 1)) : 1);
  });
  const dispersionRobust = Array.from({ length: n }, (_, i) => mad(used.map((b) => b.fair[i] as number)));
  const range = Array.from({ length: n }, (_, i) => {
    const col = used.map((b) => b.fair[i] as number);
    return Math.max(...col) - Math.min(...col);
  });

  if (used.length === 1) warnings.push('Consenso con una sola casa: no es un consenso, es un precio. No sirve para medir valor.');
  else if (used.length < 4) warnings.push(`Consenso con solo ${used.length} casas: la estimacion arrastra mucho error.`);
  if (Math.max(...dispersion) > cfg.filters.maximumMarketDispersion) {
    warnings.push(`Dispersion de ${(Math.max(...dispersion) * 100).toFixed(1)} puntos entre casas: el mercado no esta de acuerdo consigo mismo.`);
  }

  return { outcomeIds, consensus, books, booksUsed: used.length, booksExcluded: excluded, effectiveBooks, dispersion, dispersionRobust, range, warnings };
}
