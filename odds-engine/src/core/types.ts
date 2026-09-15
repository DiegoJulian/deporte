/**
 * Tipos del dominio.
 *
 * REGLA DE ORO DEL PROYECTO (seccion 25 del encargo):
 * `odds`, `rawImpliedProbability`, `fairImpliedProbability`,
 * `marketConsensusProbability`, `adjustedJointProbability` y `confidenceScore`
 * son SEIS magnitudes distintas. El sistema de tipos las mantiene separadas a
 * proposito: cada una lleva su propio tipo nominal para que el compilador
 * impida usar una donde va otra.
 */

/** Marca nominal: impide asignar un number suelto donde va una probabilidad tipada. */
declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

/** Cuota decimal europea. Siempre > 1. */
export type DecimalOdds = Brand<number, 'DecimalOdds'>;
/** 1 / cuota. INCLUYE el margen de la casa. Nunca es una probabilidad real. */
export type RawProbability = Brand<number, 'RawProbability'>;
/** Probabilidad tras retirar el margen de un mercado COMPLETO de una casa. */
export type FairProbability = Brand<number, 'FairProbability'>;
/** Probabilidad de consenso entre varias casas, cada una desmarginada aparte. */
export type ConsensusProbability = Brand<number, 'ConsensusProbability'>;
/** Probabilidad conjunta de una combinada, ya ajustada por correlacion. */
export type AdjustedProbability = Brand<number, 'AdjustedProbability'>;

export const asOdds = (n: number): DecimalOdds => {
  if (!Number.isFinite(n) || n <= 1) throw new RangeError(`Cuota decimal invalida: ${n}`);
  return n as DecimalOdds;
};
export const asRaw = (n: number): RawProbability => n as RawProbability;
export const asFair = (n: number): FairProbability => n as FairProbability;
export const asConsensus = (n: number): ConsensusProbability => n as ConsensusProbability;
export const asAdjusted = (n: number): AdjustedProbability => n as AdjustedProbability;

/**
 * De donde sale una probabilidad. Es el campo mas importante del sistema:
 * gobierna cuanta incertidumbre se le asigna y si se le permite emitir
 * veredicto de valor.
 */
export type ProbabilitySource =
  /** 1/cuota, sin mercado completo. NO es fair. Maxima incertidumbre. */
  | 'RAW_ODDS'
  /** 1/cuota corregida por el margen medio medido de su banda de cuota. */
  | 'RAW_ODDS_BAND_ADJUSTED'
  /** Mercado completo de UNA casa, desmarginado. */
  | 'FAIR_SINGLE_BOOK'
  /** Varias casas desmarginadas por separado y agregadas. */
  | 'MARKET_CONSENSUS'
  /** Derivada de la distribucion de marcadores ajustada a las cuotas del partido. */
  | 'SCORE_MODEL';

export type MarketKind = 'THREE_WAY' | 'BINARY' | 'MULTI_WAY';

/** Etiquetas del semaforo de RIESGO (probabilidad). No dicen nada del precio. */
export type RiskLight = 'MUY_BAJA' | 'ROJO' | 'NEUTRAL' | 'AMARILLO' | 'VERDE' | 'EXTREMA';
/** Etiquetas del semaforo de VALOR (precio frente a una referencia externa). */
export type ValueLight = 'SIN_REFERENCIA' | 'NEGATIVO' | 'NEUTRO' | 'POSITIVO' | 'SOSPECHOSO';
/** Semaforo de combinada. */
export type CombinationLight = 'DESCARTAR' | 'ROJO' | 'AMARILLO' | 'VERDE';

export type CorrelationRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

/** Una cuota publicada por una casa en un instante. */
export interface OddsQuote {
  readonly bookmaker: string;
  readonly odds: DecimalOdds;
  /** Epoch ms de la lectura. */
  readonly observedAt: number;
  /** Cuota de apertura, si se conoce. */
  readonly openingOdds?: DecimalOdds;
  /** Cuota de cierre, si el evento ya empezo. */
  readonly closingOdds?: DecimalOdds;
  /** Liquidez/volumen, si el proveedor lo da. */
  readonly liquidity?: number;
}

/** Una salida concreta de un mercado ("Local", "Mas de 2.5", "SI"). */
export interface Outcome {
  readonly id: string;
  readonly label: string;
  readonly quotes: readonly OddsQuote[];
}

/** Periodo al que se refiere el mercado. */
export type Period = 'FULL_TIME' | 'FIRST_HALF' | 'SECOND_HALF' | 'OTHER';

/** Un mercado: el conjunto de salidas mutuamente excluyentes y exhaustivas. */
export interface Market {
  readonly id: string;
  readonly matchId: string;
  readonly kind: MarketKind;
  /** Clave canonica del mercado: '1X2', 'OU', 'BTTS', 'AH', 'DC', 'ODDEVEN'... */
  readonly family: string;
  /** Linea del mercado cuando aplica (2.5 en Mas de 2.5). */
  readonly line?: number;
  readonly outcomes: readonly Outcome[];
  /** true cuando el feed garantiza que estan TODAS las salidas. */
  readonly complete: boolean;
  readonly live?: boolean;
  /** Periodo. Por defecto FULL_TIME. */
  readonly period?: Period;
  /**
   * A cuanto suman las probabilidades fair de este mercado. 1 casi siempre;
   * 2 en doble oportunidad (1X + 12 + X2 cubre cada resultado dos veces).
   */
  readonly normalisationTarget?: number;
}

export interface MatchContext {
  readonly matchId: string;
  readonly league: string;
  readonly home: string;
  readonly away: string;
  readonly startsAt: number;
  readonly live?: boolean;
}

/** Una pata candidata, ya evaluada. */
export interface Selection {
  readonly selectionId: string;
  readonly matchId: string;
  readonly marketId: string;
  readonly family: string;
  readonly outcomeId: string;
  readonly label: string;
  readonly period: Period;
  readonly odds: DecimalOdds;
  readonly bookmaker: string;
  readonly raw: RawProbability;
  readonly fair: FairProbability;
  readonly source: ProbabilitySource;
  /** Desviacion tipica aproximada de `fair`, en puntos de probabilidad. */
  readonly uncertainty: number;
  readonly overround: number | null;
  readonly consensus: ConsensusProbability | null;
  readonly dispersion: number | null;
  readonly oddsQuality: number;
  readonly confidence: number;
  readonly riskLight: RiskLight;
  readonly valueLight: ValueLight;
  /** EV por euro usando la referencia EXTERNA. null si no hay referencia valida. */
  readonly expectedValue: number | null;
  readonly evBasis: 'consensus' | 'model' | null;
  readonly warnings: readonly string[];
}
