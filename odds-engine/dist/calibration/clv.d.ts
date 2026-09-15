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
export declare function analyseClv(records: readonly ClvRecord[]): ClvResult;
/** Movimiento de la linea. Senal, no veredicto. */
export interface OddsMovement {
    readonly openingProbability: number;
    readonly currentProbability: number;
    readonly deltaPoints: number;
    readonly direction: 'ACORTA' | 'ALARGA' | 'QUIETA';
    readonly note: string;
}
export declare function analyseMovement(openingOdds: number, currentOdds: number, threshold?: number): OddsMovement;
