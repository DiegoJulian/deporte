/**
 * Arnes de calibracion (secciones 22 y 23).
 *
 * La pregunta es: cuando el motor dice 85 %, ¿ocurre el 85 % de las veces?
 * Sin esto, todo lo anterior es aritmetica bonita sin verificar.
 *
 * Nada de lo que hay aqui mira la cuota: mira las predicciones frente a lo que
 * paso. Es el unico juez.
 */
import { normalCdf, normalQuantile, sum } from '../core/numeric.js';

export interface Prediction {
  readonly id: string;
  /** Probabilidad que el motor anuncio. */
  readonly probability: number;
  /** 1 si ocurrio, 0 si no. */
  readonly outcome: 0 | 1;
  readonly confidence?: number;
  readonly odds?: number;
  readonly closingOdds?: number;
  readonly group?: string;
}

/** Brier: error cuadratico medio de la probabilidad. Mas bajo, mejor. */
export const brierScore = (ps: readonly Prediction[]): number =>
  ps.length === 0 ? NaN : sum(ps.map((p) => (p.probability - p.outcome) ** 2)) / ps.length;

/** Log loss. Castiga mucho mas la confianza equivocada. */
export function logLoss(ps: readonly Prediction[], eps = 1e-15): number {
  if (ps.length === 0) return NaN;
  return -sum(ps.map((p) => {
    const q = Math.min(1 - eps, Math.max(eps, p.probability));
    return p.outcome === 1 ? Math.log(q) : Math.log(1 - q);
  })) / ps.length;
}

export interface Bin {
  readonly lower: number;
  readonly upper: number;
  readonly n: number;
  readonly meanPredicted: number;
  readonly observed: number;
  readonly wilsonLow: number;
  readonly wilsonHigh: number;
  /** true si la probabilidad anunciada cae fuera del intervalo observado. */
  readonly miscalibrated: boolean;
}

/** Intervalo de Wilson: el correcto para proporciones con n pequeno. */
export function wilsonInterval(successes: number, n: number, alpha = 0.05): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 1 };
  const z = normalQuantile(1 - alpha / 2);
  const phat = successes / n;
  const d = 1 + (z * z) / n;
  const centre = phat + (z * z) / (2 * n);
  const half = z * Math.sqrt((phat * (1 - phat)) / n + (z * z) / (4 * n * n));
  return { low: Math.max(0, (centre - half) / d), high: Math.min(1, (centre + half) / d) };
}

export interface ReliabilityResult {
  readonly bins: readonly Bin[];
  /** Expected Calibration Error: desviacion media ponderada. */
  readonly ece: number;
  /** Maximum Calibration Error. */
  readonly mce: number;
  readonly brier: number;
  readonly logLoss: number;
  /** Descomposicion de Murphy: brier = reliability - resolution + uncertainty. */
  readonly reliability: number;
  readonly resolution: number;
  readonly uncertainty: number;
  readonly n: number;
}

export function reliabilityDiagram(
  ps: readonly Prediction[],
  edges: readonly number[] = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0],
): ReliabilityResult {
  const n = ps.length;
  const base = n === 0 ? NaN : sum(ps.map((p) => p.outcome)) / n;
  const bins: Bin[] = [];
  let ece = 0;
  let mce = 0;
  let reliability = 0;
  let resolution = 0;

  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i] as number;
    const hi = edges[i + 1] as number;
    const inBin = ps.filter((p) => (i === edges.length - 2 ? p.probability >= lo && p.probability <= hi : p.probability >= lo && p.probability < hi));
    if (inBin.length === 0) continue;
    const k = sum(inBin.map((p) => p.outcome));
    const observed = k / inBin.length;
    const meanPredicted = sum(inBin.map((p) => p.probability)) / inBin.length;
    const w = inBin.length / n;
    const gap = Math.abs(meanPredicted - observed);
    ece += w * gap;
    mce = Math.max(mce, gap);
    reliability += w * (meanPredicted - observed) ** 2;
    resolution += w * (observed - base) ** 2;
    const ci = wilsonInterval(k, inBin.length);
    bins.push({
      lower: lo, upper: hi, n: inBin.length, meanPredicted, observed,
      wilsonLow: ci.low, wilsonHigh: ci.high,
      miscalibrated: meanPredicted < ci.low || meanPredicted > ci.high,
    });
  }

  return {
    bins, ece, mce,
    brier: brierScore(ps), logLoss: logLoss(ps),
    reliability, resolution, uncertainty: base * (1 - base), n,
  };
}

/**
 * Test Z de Spiegelhalter. Contrasta la hipotesis de que las probabilidades
 * anunciadas estan bien calibradas, sin necesidad de agrupar en cajas.
 * |Z| > 1,96 => calibracion rechazada al 5 %.
 */
export function spiegelhalterZ(ps: readonly Prediction[]): { z: number; pValue: number; calibrated: boolean } {
  const valid = ps.filter((p) => p.probability > 0 && p.probability < 1);
  if (valid.length < 2) return { z: NaN, pValue: NaN, calibrated: true };
  const num = sum(valid.map((p) => (p.outcome - p.probability) * (1 - 2 * p.probability)));
  const den = Math.sqrt(sum(valid.map((p) => (1 - 2 * p.probability) ** 2 * p.probability * (1 - p.probability))));
  const z = den < 1e-12 ? 0 : num / den;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return { z, pValue, calibrated: Math.abs(z) <= 1.959963985 };
}

/**
 * La pregunta directa del encargo: lo clasificado como VERDE (>85 %),
 * ¿se cumple aproximadamente en esa proporcion?
 */
export interface GroupCheck {
  readonly group: string;
  readonly n: number;
  readonly hits: number;
  readonly claimed: number;
  readonly observed: number;
  readonly wilsonLow: number;
  readonly wilsonHigh: number;
  readonly verdict: 'CUMPLE' | 'NO_CUMPLE' | 'SIN_MUESTRA_SUFICIENTE';
  readonly shortfallPoints: number;
  readonly message: string;
}

export function checkClaim(ps: readonly Prediction[], claimed: number, label = 'VERDE'): GroupCheck {
  const n = ps.length;
  const hits = sum(ps.map((p) => p.outcome));
  const observed = n === 0 ? NaN : hits / n;
  const ci = wilsonInterval(hits, n);
  const needed = requiredSampleSize(claimed, claimed - 0.05);

  let verdict: GroupCheck['verdict'];
  let message: string;
  if (n < needed) {
    verdict = 'SIN_MUESTRA_SUFICIENTE';
    message = `${n} casos. Para distinguir ${(claimed * 100).toFixed(0)} % de ${((claimed - 0.05) * 100).toFixed(0)} % con 80 % de potencia hacen falta ${needed}. Con esta muestra no se puede decir nada.`;
  } else if (claimed >= ci.low && claimed <= ci.high) {
    verdict = 'CUMPLE';
    message = `${label}: anunciado ${(claimed * 100).toFixed(1)} %, observado ${(observed * 100).toFixed(1)} % (IC 95 % ${(ci.low * 100).toFixed(1)}–${(ci.high * 100).toFixed(1)} %) sobre ${n} casos. Compatible.`;
  } else {
    verdict = 'NO_CUMPLE';
    message = `${label}: anunciado ${(claimed * 100).toFixed(1)} %, observado ${(observed * 100).toFixed(1)} % (IC 95 % ${(ci.low * 100).toFixed(1)}–${(ci.high * 100).toFixed(1)} %) sobre ${n} casos. El anuncio queda FUERA del intervalo: el motor no esta calibrado en esta banda.`;
  }

  return { group: label, n, hits, claimed, observed, wilsonLow: ci.low, wilsonHigh: ci.high, verdict, shortfallPoints: observed - claimed, message };
}

/** Muestra necesaria para distinguir p0 de p1 (dos colas, alpha 5 %, potencia 80 %). */
export function requiredSampleSize(p0: number, p1: number, alpha = 0.05, power = 0.8): number {
  if (p0 === p1) return Infinity;
  const za = normalQuantile(1 - alpha / 2);
  const zb = normalQuantile(power);
  const num = (za * Math.sqrt(p0 * (1 - p0)) + zb * Math.sqrt(p1 * (1 - p1))) ** 2;
  return Math.ceil(num / (p1 - p0) ** 2);
}

/**
 * ¿Discrimina el confidenceScore? Se agrupa por decil de confianza y se mide el
 * error de calibracion en cada uno. Si el error NO baja al subir la confianza,
 * el confidenceScore es decoracion y hay que decirlo en voz alta.
 */
export interface ConfidenceValidation {
  readonly deciles: readonly { readonly decile: number; readonly n: number; readonly meanConfidence: number; readonly ece: number; readonly brier: number }[];
  /** Correlacion de rangos entre confianza y error. Negativa = el score sirve. */
  readonly rankCorrelation: number;
  readonly discriminates: boolean;
  readonly message: string;
}

export function validateConfidence(ps: readonly Prediction[]): ConfidenceValidation {
  const withConf = ps.filter((p) => typeof p.confidence === 'number');
  if (withConf.length < 50) {
    return { deciles: [], rankCorrelation: NaN, discriminates: false, message: `Solo ${withConf.length} predicciones con confianza: hacen falta bastantes mas para validar el score.` };
  }
  const sorted = [...withConf].sort((a, b) => (a.confidence as number) - (b.confidence as number));
  const size = Math.floor(sorted.length / 10);
  const deciles: { decile: number; n: number; meanConfidence: number; ece: number; brier: number }[] = [];
  for (let d = 0; d < 10; d++) {
    const slice = sorted.slice(d * size, d === 9 ? sorted.length : (d + 1) * size);
    if (slice.length === 0) continue;
    deciles.push({
      decile: d + 1, n: slice.length,
      meanConfidence: sum(slice.map((p) => p.confidence as number)) / slice.length,
      ece: reliabilityDiagram(slice).ece,
      brier: brierScore(slice),
    });
  }
  const rho = spearman(deciles.map((d) => d.meanConfidence), deciles.map((d) => d.ece));
  const discriminates = rho < -0.5;
  return {
    deciles, rankCorrelation: rho, discriminates,
    message: discriminates
      ? `El confidenceScore discrimina: correlacion de rangos ${rho.toFixed(2)} entre confianza y error de calibracion.`
      : `El confidenceScore NO discrimina (correlacion de rangos ${rho.toFixed(2)}). Mientras siga asi, es un numero decorativo y no debe filtrar nada.`,
  };
}

function spearman(a: readonly number[], b: readonly number[]): number {
  const rank = (xs: readonly number[]): number[] => {
    const idx = xs.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(xs.length);
    idx.forEach(([, i], k) => { r[i] = k + 1; });
    return r;
  };
  const ra = rank(a); const rb = rank(b);
  const n = a.length;
  if (n < 2) return NaN;
  const ma = sum(ra) / n; const mb = sum(rb) / n;
  const cov = sum(ra.map((v, i) => (v - ma) * ((rb[i] as number) - mb)));
  const sa = Math.sqrt(sum(ra.map((v) => (v - ma) ** 2)));
  const sb = Math.sqrt(sum(rb.map((v) => (v - mb) ** 2)));
  return sa * sb < 1e-12 ? 0 : cov / (sa * sb);
}
