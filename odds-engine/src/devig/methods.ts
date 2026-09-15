/**
 * Eliminacion del margen (devig).
 *
 * Punto de partida: 1/cuota NO es una probabilidad. La suma de las inversas de
 * las cuotas de un mercado completo vale siempre mas de 1; ese exceso es el
 * overround.
 *
 *     overround = sum(1/c_i) - 1
 *
 * Repartirlo es un problema SUBDETERMINADO: hay infinitas distribuciones que
 * suman 1 y son compatibles con esas cuotas. Cada metodo es una hipotesis
 * distinta sobre COMO carga la casa el margen, y dan resultados distintos.
 * Por eso el motor calcula varios y guarda todos: cual acierta es una pregunta
 * empirica que se contesta con el arnes de calibracion, no de palabra.
 */
import { brent, sum } from '../core/numeric.js';
import type { DevigMethod } from '../config/index.js';

export interface DevigResult {
  readonly method: DevigMethod;
  readonly fair: readonly number[];
  readonly overround: number;
  /** Parametro estimado: k en potencia, z en Shin, c en odds-ratio. */
  readonly parameter: number | null;
  readonly converged: boolean;
  /**
   * A cuanto tienen que sumar las probabilidades fair de este mercado.
   * Es 1 en casi todos, pero NO en doble oportunidad: 1X + 12 + X2 cubre cada
   * resultado dos veces, asi que suma 2. Normalizar a 1 un bloque de doble
   * oportunidad da probabilidades a la mitad de lo que valen.
   * (Comprobado contra la respuesta real del feed, `ampliacion-de-mercados.md`.)
   */
  readonly target: number;
  readonly warnings: readonly string[];
}

const EPS = 1e-10;

/** Reparto proporcional: p_i = T · r_i / S. Asume margen uniforme EN PROBABILIDAD. */
export function devigProportional(raw: readonly number[], target = 1): DevigResult {
  const S = sum(raw);
  return {
    method: 'PROPORTIONAL', fair: raw.map((r) => (target * r) / S),
    overround: S / target - 1, parameter: null, converged: true, target, warnings: [],
  };
}

/**
 * Reparto aditivo (Vovk): p_i = r_i - (S-1)/n. Asume margen uniforme EN PUNTOS.
 * Puede dar probabilidades negativas en mercados muy desequilibrados; cuando
 * pasa, `converged` es false y el resultado NO debe usarse.
 */
export function devigAdditive(raw: readonly number[], target = 1): DevigResult {
  const S = sum(raw);
  const n = raw.length;
  const fair = raw.map((r) => r - (S - target) / n);
  return {
    method: 'ADDITIVE', fair, overround: S / target - 1, parameter: null,
    converged: fair.every((p) => p > 0 && p < 1), target, warnings: [],
  };
}

/**
 * Metodo de potencia (Clarke): p_i = r_i^k con sum(p_i) = 1, k > 1.
 * Quita proporcionalmente MAS margen a las cuotas altas, que es donde la casa
 * lo carga de verdad (sesgo favorito-longshot, medido en este proyecto:
 * -0,5 % de peaje a cuota 1,30 frente a -13,5 % a cuota 5). Es el que usa el
 * panel por defecto.
 */
export function devigPower(raw: readonly number[], target = 1): DevigResult {
  const S = sum(raw);
  const over = S / target - 1;
  const f = (k: number): number => sum(raw.map((r) => r ** k)) - target;
  const k = brent(f, 0.05, 20, 1e-14);
  if (k === null) {
    return {
      method: 'POWER', fair: raw.map((r) => (target * r) / S), overround: over,
      parameter: null, converged: false, target,
      warnings: ['El metodo de potencia no convergio; se usa el reparto proporcional.'],
    };
  }
  return { method: 'POWER', fair: raw.map((r) => r ** k), overround: over, parameter: k, converged: true, target, warnings: [] };
}

/**
 * Odds-ratio (Cheung): mantiene constante la razon de momios entre la cuota
 * publicada y la justa:  r/(1-r) = c * p/(1-p)  =>  p = r / (c(1-r) + r).
 */
export function devigOddsRatio(raw: readonly number[], target = 1): DevigResult {
  const S = sum(raw);
  const over = S / target - 1;
  const p = (c: number, r: number): number => r / (c * (1 - r) + r);
  const f = (c: number): number => sum(raw.map((r) => p(c, r))) - target;
  const c = brent(f, 1e-4, 1e4, 1e-14);
  if (c === null) {
    return {
      method: 'ODDS_RATIO', fair: raw.map((r) => (target * r) / S), overround: over,
      parameter: null, converged: false, target, warnings: ['Odds-ratio no convergio; se usa el reparto proporcional.'],
    };
  }
  return { method: 'ODDS_RATIO', fair: raw.map((r) => p(c, r)), overround: over, parameter: c, converged: true, target, warnings: [] };
}

/**
 * Shin. Es el unico con un modelo economico detras: supone que una fraccion z
 * del dinero apostado viene de gente con informacion privilegiada, y que la
 * casa ensancha el precio para protegerse de ella. Como los informados apuestan
 * sobre todo a cuotas altas, Shin tambien carga mas margen ahi.
 *
 *     p_i = ( sqrt(z^2 + 4(1-z) r_i^2 / S) - z ) / (2(1-z))
 */
export function devigShin(raw: readonly number[], target = 1): DevigResult {
  const S = sum(raw);
  const over = S / target - 1;
  // El modelo de Shin esta derivado para un libro que suma 1. Con objetivo
  // distinto (doble oportunidad) no hay version publicada, y el motor NO se
  // inventa una: cae al proporcional y lo dice.
  if (Math.abs(target - 1) > 1e-12) {
    return {
      method: 'SHIN', fair: raw.map((r) => (target * r) / S), overround: over,
      parameter: null, converged: false, target,
      warnings: [`Shin no esta definido para mercados que suman ${target}; se usa el reparto proporcional.`],
    };
  }
  const pi = (z: number, r: number): number => (Math.sqrt(z * z + 4 * (1 - z) * (r * r) / S) - z) / (2 * (1 - z));
  const f = (z: number): number => sum(raw.map((r) => pi(z, r))) - 1;
  const z = brent(f, EPS, 0.5 - EPS, 1e-14);
  if (z === null) {
    return {
      method: 'SHIN', fair: raw.map((r) => r / S), overround: over, parameter: null,
      converged: false, target, warnings: ['Shin no convergio; se usa el reparto proporcional.'],
    };
  }
  return { method: 'SHIN', fair: raw.map((r) => pi(z, r)), overround: over, parameter: z, converged: true, target, warnings: [] };
}

const TABLE: Record<DevigMethod, (raw: readonly number[], target?: number) => DevigResult> = {
  POWER: devigPower,
  SHIN: devigShin,
  PROPORTIONAL: devigProportional,
  ADDITIVE: devigAdditive,
  ODDS_RATIO: devigOddsRatio,
};

export function devig(raw: readonly number[], method: DevigMethod, target = 1): DevigResult {
  if (raw.length < 2) throw new RangeError('devig necesita al menos dos salidas: con una sola no hay margen que repartir');
  if (raw.some((r) => !(r > 0 && r < 1))) throw new RangeError('probabilidades brutas fuera de (0,1)');
  if (!(target > 0)) throw new RangeError(`objetivo de normalizacion invalido: ${target}`);
  return (TABLE[method] as (r: readonly number[], t?: number) => DevigResult)(raw, target);
}

/** Ejecuta todos los metodos. Sirve para medir cuanto discrepan entre si. */
export function devigAll(raw: readonly number[], target = 1): Record<DevigMethod, DevigResult> {
  return {
    POWER: devigPower(raw, target), SHIN: devigShin(raw, target), PROPORTIONAL: devigProportional(raw, target),
    ADDITIVE: devigAdditive(raw, target), ODDS_RATIO: devigOddsRatio(raw, target),
  };
}

/**
 * Cuanto se separan los metodos entre si para la misma salida. Es una medida de
 * incertidumbre de MODELO: si los cinco coinciden, el reparto del margen apenas
 * importa; si discrepan, la probabilidad "fair" es una eleccion nuestra y hay
 * que decirlo.
 */
export function devigModelSpread(raw: readonly number[], index: number, target = 1): number {
  const all = devigAll(raw, target);
  const vals = Object.values(all).filter((r) => r.converged).map((r) => r.fair[index] as number);
  return vals.length < 2 ? 0 : Math.max(...vals) - Math.min(...vals);
}
