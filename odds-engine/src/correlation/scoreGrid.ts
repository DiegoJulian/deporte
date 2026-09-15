/**
 * Distribucion de marcadores ajustada A LAS PROPIAS CUOTAS del partido.
 *
 * Esta es la pieza que resuelve la seccion 12 del encargo sin inventarse nada.
 * En vez de asignar a mano correlaciones "altas" o "bajas", se reconstruye la
 * distribucion conjunta de goles (local, visitante) que mejor reproduce las
 * probabilidades fair que la casa YA esta cotizando en varios mercados del
 * mismo partido (1X2, over/under, ambos marcan, handicaps...). Con esa
 * distribucion, la probabilidad conjunta de cualquier combinacion de patas del
 * mismo partido es una suma sobre la rejilla: exacta, no estimada.
 *
 * Modelo: Poisson bivariante con la correccion de Dixon-Coles para los
 * marcadores bajos, que es donde la Poisson independiente falla.
 *
 *   P(x,y) = tau(x,y) * Pois(x; lambda) * Pois(y; mu)
 *   tau(0,0) = 1 - lambda*mu*rho   tau(0,1) = 1 + lambda*rho
 *   tau(1,0) = 1 + mu*rho          tau(1,1) = 1 - rho     resto = 1
 *
 * Tres parametros. Con cuatro o mas mercados el ajuste esta sobredeterminado,
 * y el error residual es una medida honesta de cuanto NO explica el modelo:
 * si es grande, la incertidumbre sube, no se disimula.
 */
import { nelderMead, poissonPmf } from '../core/numeric.js';
import type { LegOutcome, ScorePredicate } from './predicates.js';

export const MAX_GOALS = 12;

export interface ScoreGrid {
  readonly lambda: number;
  readonly mu: number;
  readonly rho: number;
  /** matrix[x][y] = P(local = x, visitante = y). Suma 1. */
  readonly matrix: readonly (readonly number[])[];
  readonly maxGoals: number;
}

export function buildGrid(lambda: number, mu: number, rho: number, maxGoals = MAX_GOALS): ScoreGrid {
  // Los dos marginales de Poisson se calculan UNA vez, no una por celda: el
  // ajuste llama a buildGrid miles de veces y las exponenciales dominaban.
  const px = new Array<number>(maxGoals + 1);
  const py = new Array<number>(maxGoals + 1);
  for (let k = 0; k <= maxGoals; k++) { px[k] = poissonPmf(k, lambda); py[k] = poissonPmf(k, mu); }

  const m: number[][] = new Array<number[]>(maxGoals + 1);
  let total = 0;
  for (let x = 0; x <= maxGoals; x++) {
    const row = new Array<number>(maxGoals + 1);
    const pxv = px[x] as number;
    for (let y = 0; y <= maxGoals; y++) {
      let tau = 1;
      if (x === 0 && y === 0) tau = 1 - lambda * mu * rho;
      else if (x === 0 && y === 1) tau = 1 + lambda * rho;
      else if (x === 1 && y === 0) tau = 1 + mu * rho;
      else if (x === 1 && y === 1) tau = 1 - rho;
      const v = (tau > 1e-12 ? tau : 1e-12) * pxv * (py[y] as number);
      row[y] = v;
      total += v;
    }
    m[x] = row;
  }
  const inv = 1 / total;
  for (let x = 0; x <= maxGoals; x++) {
    const row = m[x] as number[];
    for (let y = 0; y <= maxGoals; y++) row[y] = (row[y] as number) * inv;
  }
  return { lambda, mu, rho, matrix: m, maxGoals };
}

/** P(WIN) y P(PUSH) de un predicado sobre la rejilla. */
export function evaluate(grid: ScoreGrid, predicate: ScorePredicate): { win: number; push: number; loss: number } {
  let win = 0, push = 0, loss = 0;
  for (let x = 0; x <= grid.maxGoals; x++) {
    const row = grid.matrix[x] as readonly number[];
    for (let y = 0; y <= grid.maxGoals; y++) {
      const p = row[y] as number;
      const r: LegOutcome = predicate(x, y);
      if (r === 'WIN') win += p; else if (r === 'PUSH') push += p; else loss += p;
    }
  }
  return { win, push, loss };
}

export interface FitTarget {
  readonly key: string;
  readonly predicate: ScorePredicate;
  /** Probabilidad fair observada (ya desmarginada). */
  readonly probability: number;
  readonly weight?: number;
}

export interface GridFit {
  readonly grid: ScoreGrid;
  /** Raiz del error cuadratico medio ponderado, en puntos de probabilidad. */
  readonly rmse: number;
  readonly maxAbsError: number;
  readonly residuals: readonly { key: string; target: number; fitted: number; error: number }[];
  readonly converged: boolean;
  readonly targetsUsed: number;
  readonly warnings: readonly string[];
}

/**
 * Ajusta (lambda, mu, rho) a las probabilidades fair observadas.
 * Necesita al menos 3 objetivos independientes; con menos devuelve null y el
 * motor cae a las cotas de Frechet. Nunca extrapola con un ajuste que no tiene
 * grados de libertad.
 */
export function fitGridFromMarkets(targets: readonly FitTarget[], maxGoals = MAX_GOALS): GridFit | null {
  const usable = targets.filter((t) => Number.isFinite(t.probability) && t.probability > 0 && t.probability < 1);
  if (usable.length < 3) return null;

  const loss = (par: readonly number[]): number => {
    const [l, m, r] = par as [number, number, number];
    if (!(l > 0.03) || !(m > 0.03) || l > 8 || m > 8) return 1e9;
    if (r < -0.35 || r > 0.35) return 1e9;
    if (1 - l * m * r <= 1e-6) return 1e9;
    const g = buildGrid(l, m, r, maxGoals);
    let s = 0;
    for (const t of usable) {
      const w = t.weight ?? 1;
      const got = evaluate(g, t.predicate).win;
      s += w * (got - t.probability) ** 2;
    }
    return s * 1e4;
  };

  let best: { x: number[]; fx: number } | null = null;
  for (const l0 of [0.8, 1.2, 1.6, 2.0]) {
    for (const m0 of [0.6, 1.0, 1.4]) {
      const r = nelderMead(loss, [l0, m0, 0], { step: 0.2, maxIter: 3000, tol: 1e-14 });
      if (best === null || r.fx < best.fx) best = { x: r.x, fx: r.fx };
    }
  }
  if (best === null) return null;

  const [l, m, r] = best.x as [number, number, number];
  const grid = buildGrid(l, m, r, maxGoals);
  const residuals = usable.map((t) => {
    const fitted = evaluate(grid, t.predicate).win;
    return { key: t.key, target: t.probability, fitted, error: fitted - t.probability };
  });
  const rmse = Math.sqrt(residuals.reduce((a, x) => a + x.error ** 2, 0) / residuals.length);
  const maxAbsError = Math.max(...residuals.map((x) => Math.abs(x.error)));

  const warnings: string[] = [];
  if (maxAbsError > 0.02) warnings.push(`El modelo de marcadores no reproduce las cuotas del partido: error maximo de ${(maxAbsError * 100).toFixed(1)} puntos. O el modelo se queda corto o alguno de esos precios esta mal puesto.`);
  if (usable.length === 3) warnings.push('Ajuste con exactamente 3 objetivos y 3 parametros: el error residual sera cero por construccion y no valida nada.');

  return { grid, rmse, maxAbsError, residuals, converged: best.fx < 1e9, targetsUsed: usable.length, warnings };
}

/**
 * Probabilidad conjunta exacta de varias patas del MISMO partido.
 * `mode`:
 *  - 'STRICT'  : todas WIN (el push cuenta como fallo)
 *  - 'PUSH_OK' : las patas en PUSH se anulan y no rompen la combinada
 */
export function jointOnGrid(
  grid: ScoreGrid,
  predicates: readonly ScorePredicate[],
  mode: 'STRICT' | 'PUSH_OK' = 'PUSH_OK',
): number {
  let p = 0;
  for (let x = 0; x <= grid.maxGoals; x++) {
    const row = grid.matrix[x] as readonly number[];
    for (let y = 0; y <= grid.maxGoals; y++) {
      let ok = true;
      for (const f of predicates) {
        const r = f(x, y);
        if (r === 'LOSS' || (mode === 'STRICT' && r === 'PUSH')) { ok = false; break; }
      }
      if (ok) p += row[y] as number;
    }
  }
  return p;
}

/**
 * Valor esperado exacto de una combinada del mismo partido, teniendo en cuenta
 * que una pata en PUSH se anula y su cuota sale del producto.
 * Devuelve el retorno medio por euro apostado (1 = devolver lo apostado).
 */
export function expectedReturnOnGrid(
  grid: ScoreGrid,
  legs: readonly { predicate: ScorePredicate; odds: number }[],
): number {
  let ev = 0;
  for (let x = 0; x <= grid.maxGoals; x++) {
    const row = grid.matrix[x] as readonly number[];
    for (let y = 0; y <= grid.maxGoals; y++) {
      const p = row[y] as number;
      if (p === 0) continue;
      let payout = 1;
      let alive = true;
      for (const l of legs) {
        const r = l.predicate(x, y);
        if (r === 'LOSS') { alive = false; break; }
        if (r === 'WIN') payout *= l.odds;
      }
      if (alive) ev += p * payout;
    }
  }
  return ev;
}
