/**
 * Toda la parametrizacion del motor. Nada esta escrito a fuego en los modulos:
 * cada umbral, cada penalizacion y cada limite vive aqui (seccion 24 del encargo).
 */
export type DevigMethod = 'POWER' | 'SHIN' | 'PROPORTIONAL' | 'ADDITIVE' | 'ODDS_RATIO';
export interface ThreeWayThresholds {
    /** Por debajo: MUY_BAJA. */
    readonly veryLowMax: number;
    readonly redMin: number;
    readonly redMax: number;
    /** Hueco entre redMax y yellowMin: NEUTRAL. */
    readonly yellowMin: number;
    readonly yellowMax: number;
    readonly greenMin: number;
    readonly greenMax: number;
    /** Por encima: EXTREMA (revisar origen de la cuota). */
    readonly extremeMin: number;
}
export interface BinaryThresholds {
    readonly discardMax: number;
    readonly redMin: number;
    readonly redMax: number;
    readonly yellowMin: number;
    readonly yellowMax: number;
    readonly neutralMin: number;
    readonly neutralMax: number;
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
    readonly individual: {
        readonly threeWay: ThreeWayThresholds;
        readonly binary: BinaryThresholds;
    };
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
export declare const DEFAULT_CONFIG: EngineConfig;
export declare function withConfig(patch: DeepPartial<EngineConfig>): EngineConfig;
export type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
