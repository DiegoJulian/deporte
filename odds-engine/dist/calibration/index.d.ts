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
export declare const brierScore: (ps: readonly Prediction[]) => number;
/** Log loss. Castiga mucho mas la confianza equivocada. */
export declare function logLoss(ps: readonly Prediction[], eps?: number): number;
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
export declare function wilsonInterval(successes: number, n: number, alpha?: number): {
    low: number;
    high: number;
};
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
export declare function reliabilityDiagram(ps: readonly Prediction[], edges?: readonly number[]): ReliabilityResult;
/**
 * Test Z de Spiegelhalter. Contrasta la hipotesis de que las probabilidades
 * anunciadas estan bien calibradas, sin necesidad de agrupar en cajas.
 * |Z| > 1,96 => calibracion rechazada al 5 %.
 */
export declare function spiegelhalterZ(ps: readonly Prediction[]): {
    z: number;
    pValue: number;
    calibrated: boolean;
};
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
export declare function checkClaim(ps: readonly Prediction[], claimed: number, label?: string): GroupCheck;
/** Muestra necesaria para distinguir p0 de p1 (dos colas, alpha 5 %, potencia 80 %). */
export declare function requiredSampleSize(p0: number, p1: number, alpha?: number, power?: number): number;
/**
 * ¿Discrimina el confidenceScore? Se agrupa por decil de confianza y se mide el
 * error de calibracion en cada uno. Si el error NO baja al subir la confianza,
 * el confidenceScore es decoracion y hay que decirlo en voz alta.
 */
export interface ConfidenceValidation {
    readonly deciles: readonly {
        readonly decile: number;
        readonly n: number;
        readonly meanConfidence: number;
        readonly ece: number;
        readonly brier: number;
    }[];
    /** Correlacion de rangos entre confianza y error. Negativa = el score sirve. */
    readonly rankCorrelation: number;
    readonly discriminates: boolean;
    readonly message: string;
}
export declare function validateConfidence(ps: readonly Prediction[]): ConfidenceValidation;
