/**
 * Coherencia entre mercados del mismo partido.
 *
 * 1X2, doble oportunidad y empate no valido no son mercados independientes:
 * son la MISMA distribucion escrita de tres maneras. Si las tres no dan las
 * mismas probabilidades, una esta mal puesta. Es la via de deteccion de errores
 * de precio que no necesita una segunda casa (objetivo fijado el 13-09-2026).
 *
 *   DC(1X) = P(1) + P(X)        DC(12) = P(1) + P(2)       DC(X2) = P(X) + P(2)
 *   DNB(1) = P(1) / (P(1)+P(2))
 */
export interface ThreeWayFair {
    readonly home: number;
    readonly draw: number;
    readonly away: number;
}
export interface CoherenceCheck {
    readonly market: string;
    readonly outcome: string;
    readonly implied: number;
    readonly observed: number;
    readonly deltaPoints: number;
    /** El signo dice a favor de quien esta el desajuste si apostamos ese precio. */
    readonly edgeIfObservedIsRight: number;
}
export interface CoherenceReport {
    readonly checks: readonly CoherenceCheck[];
    readonly maxDeltaPoints: number;
    readonly incoherent: boolean;
}
export interface CoherenceInput {
    readonly threeWay: ThreeWayFair;
    /** Probabilidades fair observadas en otros mercados del mismo partido. */
    readonly doubleChance?: {
        readonly homeOrDraw?: number;
        readonly homeOrAway?: number;
        readonly drawOrAway?: number;
    };
    readonly drawNoBet?: {
        readonly home?: number;
        readonly away?: number;
    };
}
export declare function checkCoherence(input: CoherenceInput, tolerancePoints?: number): CoherenceReport;
