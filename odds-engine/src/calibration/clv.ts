/**
 * Closing Line Value (secciones 18 y 19).
 *
 * El CLV compara la cuota tomada con la cuota de cierre del mismo mercado. Es
 * el indicador que antes detecta si una ventaja es real: converge con muchas
 * menos apuestas que el ROI, porque no depende de que los resultados caigan de
 * un lado.
 *
 *   CLV bruto  = cuota_tomada / cuota_cierre - 1
 *   CLV limpio = p_cierre_fair * cuota_tomada - 1
 *
 * El limpio es el bueno: compara contra la probabilidad de cierre SIN margen.
 * El bruto arrastra la comision de la casa y sale negativo aunque se acierte.
 */
import { normalCdf, mean, stdev } from '../core/numeric.js';

export interface ClvRecord {
  readonly id: string;
  readonly takenOdds: number;
  readonly closingOdds: number;
  /** Probabilidad fair de cierre, si se pudo desmarginar el mercado al cerrar. */
  readonly closingFairProbability?: number;
  readonly openingOdds?: number;
}

export interface ClvResult {
  readonly n: number;
  readonly meanRawClv: number;
  readonly meanCleanClv: number | null;
  readonly stdev: number;
  readonly standardError: number;
  readonly tStatistic: number;
  readonly pValue: number;
  readonly beatsClosing: boolean;
  readonly message: string;
}

export function analyseClv(records: readonly ClvRecord[]): ClvResult {
  const n = records.length;
  if (n === 0) {
    return { n: 0, meanRawClv: NaN, meanCleanClv: null, stdev: NaN, standardError: NaN, tStatistic: NaN, pValue: NaN, beatsClosing: false, message: 'Sin apuestas cerradas: no hay CLV que medir.' };
  }
  const raw = records.map((r) => r.takenOdds / r.closingOdds - 1);
  const clean = records.filter((r) => typeof r.closingFairProbability === 'number')
    .map((r) => (r.closingFairProbability as number) * r.takenOdds - 1);

  const series = clean.length === n ? clean : raw;
  const m = mean(series);
  const sd = stdev(series);
  const se = sd / Math.sqrt(n);
  const t = se < 1e-12 ? 0 : m / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(t)));

  const label = clean.length === n ? 'limpio (contra la probabilidad de cierre desmarginada)' : 'bruto (contra la cuota de cierre, con margen dentro)';
  const message = n < 50
    ? `${n} apuestas: el CLV ${label} es ${(m * 100).toFixed(2)} % pero con esta muestra no significa nada todavia (hacen falta unas 100).`
    : Math.abs(t) < 1.96
      ? `CLV ${label} de ${(m * 100).toFixed(2)} % ± ${(se * 100).toFixed(2)} sobre ${n} apuestas: no se distingue de cero.`
      : m > 0
        ? `CLV ${label} de ${(m * 100).toFixed(2)} % ± ${(se * 100).toFixed(2)} sobre ${n} apuestas: se le gana a la linea de cierre de forma sistematica.`
        : `CLV ${label} de ${(m * 100).toFixed(2)} % ± ${(se * 100).toFixed(2)} sobre ${n} apuestas: se pierde contra el cierre de forma sistematica. Ninguna estrategia con CLV negativo es rentable a largo plazo.`;

  return {
    n, meanRawClv: mean(raw), meanCleanClv: clean.length === n ? mean(clean) : null,
    stdev: sd, standardError: se, tStatistic: t, pValue,
    beatsClosing: m > 0 && Math.abs(t) >= 1.96 && n >= 50,
    message,
  };
}

/** Movimiento de la linea. Senal, no veredicto. */
export interface OddsMovement {
  readonly openingProbability: number;
  readonly currentProbability: number;
  readonly deltaPoints: number;
  readonly direction: 'ACORTA' | 'ALARGA' | 'QUIETA';
  readonly note: string;
}

export function analyseMovement(openingOdds: number, currentOdds: number, threshold = 0.005): OddsMovement {
  const p0 = 1 / openingOdds;
  const p1 = 1 / currentOdds;
  const d = p1 - p0;
  const direction: OddsMovement['direction'] = Math.abs(d) < threshold ? 'QUIETA' : d > 0 ? 'ACORTA' : 'ALARGA';
  return {
    openingProbability: p0, currentProbability: p1, deltaPoints: d, direction,
    note: direction === 'QUIETA'
      ? 'La linea no se ha movido.'
      : `La probabilidad implicita ha ${direction === 'ACORTA' ? 'subido' : 'bajado'} ${(Math.abs(d) * 100).toFixed(2)} puntos. Es informacion sobre donde va el dinero, NO una confirmacion de que la seleccion sea correcta.`,
  };
}
