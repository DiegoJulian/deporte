/**
 * Toda la parametrizacion del motor. Nada esta escrito a fuego en los modulos:
 * cada umbral, cada penalizacion y cada limite vive aqui (seccion 24 del encargo).
 */

export type DevigMethod = 'POWER' | 'SHIN' | 'PROPORTIONAL' | 'ADDITIVE' | 'ODDS_RATIO';

export interface ThreeWayThresholds {
  /** Por debajo: MUY_BAJA. */
  readonly veryLowMax: number;
  readonly redMin: number; readonly redMax: number;
  /** Hueco entre redMax y yellowMin: NEUTRAL. */
  readonly yellowMin: number; readonly yellowMax: number;
  readonly greenMin: number; readonly greenMax: number;
  /** Por encima: EXTREMA (revisar origen de la cuota). */
  readonly extremeMin: number;
}

export interface BinaryThresholds {
  readonly discardMax: number;
  readonly redMin: number; readonly redMax: number;
  readonly yellowMin: number; readonly yellowMax: number;
  readonly neutralMin: number; readonly neutralMax: number;
  readonly greenMin: number;
  readonly extremeMin: number;
}

export interface CombinationThresholds {
  /**
   * ABSOLUTE aplica los umbrales sobre la probabilidad conjunta ajustada.
   * RELATIVE_TO_TARGET los aplica sobre `P_adj / P_mejor_alcanzable` para la
   * cuota objetivo. Ver `docs`: con cuota objetivo 2,5120 (39,81 %) el modo
   * absoluto marca DESCARTAR siempre.
   */
  readonly mode: 'ABSOLUTE' | 'RELATIVE_TO_TARGET';
  readonly discardMax: number;
  readonly redMin: number;
  readonly yellowMin: number;
  readonly greenMin: number;
  readonly maxCombinationSize: number;
  readonly minCombinationSize: number;
}

export interface ValueThresholds {
  /** EV por euro a partir del cual el eje de valor es POSITIVO. */
  readonly positiveMin: number;
  /** EV por debajo del cual es NEGATIVO. Entre ambos: NEUTRO. */
  readonly negativeMax: number;
  /**
   * EV tan alto que lo mas probable es que el dato este mal, no que haya
   * un regalo. Marca SOSPECHOSO en vez de POSITIVO.
   */
  readonly suspiciousMin: number;
}

export interface ConfidenceWeights {
  /** Sobrerredondeo de referencia: por debajo no penaliza. */
  readonly overroundReference: number;
  readonly overroundDecay: number;
  readonly booksFloor: number;
  readonly booksScale: number;
  readonly dispersionReference: number;
  /** Semivida de la cuota en ms: prepartido y en vivo. */
  readonly staleHalfLifePrematch: number;
  readonly staleHalfLifeLive: number;
  readonly staleFloor: number;
  readonly movementReference: number;
  readonly movementMaxPenalty: number;
  readonly correlationFactor: Readonly<Record<'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME', number>>;
  readonly sourceFactor: Readonly<Record<string, number>>;
}

export interface EngineConfig {
  readonly devigMethod: DevigMethod;
  /** Metodos alternativos que se calculan siempre para poder comparar calibracion. */
  readonly devigShadowMethods: readonly DevigMethod[];
  readonly individual: { readonly threeWay: ThreeWayThresholds; readonly binary: BinaryThresholds };
  readonly combination: CombinationThresholds;
  readonly value: ValueThresholds;
  readonly confidence: ConfidenceWeights;
  readonly filters: {
    readonly maxOverround: number;
    readonly minOverround: number;
    readonly maxCorrelation: number;
    readonly minimumConfidenceScore: number;
    readonly minimumOddsQuality: number;
    readonly maximumMarketDispersion: number;
    /** Confianza exigida para poder decir VERDE DE ALTA CONFIANZA (seccion 26). */
    readonly greenValidationConfidence: number;
    /** Maximo de patas del mismo partido dentro de una combinada. */
    readonly maxLegsPerMatch: number;
  };
  readonly optimizer: {
    readonly targetOdds: number;
    /** Margen por arriba admitido sobre la cuota objetivo. */
    readonly targetTolerance: number;
    readonly maxCandidatesReturned: number;
    /** Tope duro de nodos explorados: protege el backend. */
    readonly maxNodesExplored: number;
  };
}

export const DEFAULT_CONFIG: EngineConfig = {
  devigMethod: 'POWER',
  devigShadowMethods: ['SHIN', 'PROPORTIONAL', 'ADDITIVE', 'ODDS_RATIO'],
  individual: {
    threeWay: {
      veryLowMax: 0.25,
      redMin: 0.25, redMax: 0.40,
      yellowMin: 0.45, yellowMax: 0.65,
      greenMin: 0.65, greenMax: 0.95,
      extremeMin: 0.95,
    },
    binary: {
      discardMax: 0.25,
      redMin: 0.25, redMax: 0.40,
      yellowMin: 0.40, yellowMax: 0.55,
      neutralMin: 0.55, neutralMax: 0.65,
      greenMin: 0.65,
      extremeMin: 0.95,
    },
  },
  combination: {
    mode: 'RELATIVE_TO_TARGET',
    discardMax: 0.55,
    redMin: 0.55,
    yellowMin: 0.65,
    greenMin: 0.85,
    maxCombinationSize: 6,
    minCombinationSize: 1,
  },
  value: { positiveMin: 0.02, negativeMax: 0.0, suspiciousMin: 0.15 },
  confidence: {
    overroundReference: 0.05,
    overroundDecay: 8,
    booksFloor: 0.55,
    booksScale: 3,
    dispersionReference: 0.025,
    staleHalfLifePrematch: 6 * 3600_000,
    staleHalfLifeLive: 60_000,
    staleFloor: 0.15,
    movementReference: 0.10,
    movementMaxPenalty: 0.30,
    correlationFactor: { LOW: 1.0, MEDIUM: 0.85, HIGH: 0.60, EXTREME: 0.30 },
    sourceFactor: {
      RAW_ODDS: 0.55,
      RAW_ODDS_BAND_ADJUSTED: 0.70,
      FAIR_SINGLE_BOOK: 0.90,
      MARKET_CONSENSUS: 1.0,
      SCORE_MODEL: 0.95,
    },
  },
  filters: {
    maxOverround: 0.35,
    minOverround: 0.001,
    maxCorrelation: 0.35,
    minimumConfidenceScore: 50,
    minimumOddsQuality: 40,
    maximumMarketDispersion: 0.06,
    greenValidationConfidence: 85,
    maxLegsPerMatch: 3,
  },
  optimizer: {
    targetOdds: 2.5120,
    targetTolerance: 0.06,
    maxCandidatesReturned: 25,
    maxNodesExplored: 2_000_000,
  },
};

export function withConfig(patch: DeepPartial<EngineConfig>): EngineConfig {
  return mergeDeep(DEFAULT_CONFIG, patch) as EngineConfig;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function mergeDeep(base: unknown, patch: unknown): unknown {
  if (patch === undefined) return base;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return patch;
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return patch;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    out[k] = mergeDeep((base as Record<string, unknown>)[k], v);
  }
  return out;
}
