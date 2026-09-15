/**
 * Una pata, expresada como funcion del marcador final.
 *
 * Todo mercado de futbol de resultado (1X2, over/under, ambos marcan, doble
 * oportunidad, hándicap, par/impar, marcador correcto, totales de equipo) es
 * una funcion del par (goles local, goles visitante). Expresarlas asi es lo que
 * permite calcular CUALQUIER probabilidad conjunta de patas del mismo partido
 * de forma exacta, en vez de multiplicar como si fueran independientes.
 */
export type LegOutcome = 'WIN' | 'LOSS' | 'PUSH';
export type ScorePredicate = (home: number, away: number) => LegOutcome;
export declare const P: {
    readonly homeWin: () => ScorePredicate;
    readonly draw: () => ScorePredicate;
    readonly awayWin: () => ScorePredicate;
    readonly doubleChanceHomeDraw: () => ScorePredicate;
    readonly doubleChanceHomeAway: () => ScorePredicate;
    readonly doubleChanceDrawAway: () => ScorePredicate;
    /** Empate no valido: el empate devuelve la apuesta. */
    readonly drawNoBetHome: () => ScorePredicate;
    readonly drawNoBetAway: () => ScorePredicate;
    readonly over: (line: number) => ScorePredicate;
    readonly under: (line: number) => ScorePredicate;
    readonly bttsYes: () => ScorePredicate;
    readonly bttsNo: () => ScorePredicate;
    readonly teamOver: (team: "HOME" | "AWAY", line: number) => ScorePredicate;
    readonly teamUnder: (team: "HOME" | "AWAY", line: number) => ScorePredicate;
    readonly totalOdd: () => ScorePredicate;
    readonly totalEven: () => ScorePredicate;
    readonly correctScore: (x: number, y: number) => ScorePredicate;
    /**
     * Handicap asiatico entero o de media. Las lineas de cuarto (-0.25, -0.75)
     * se resuelven partiendo la apuesta en dos mitades; se modela componiendo
     * dos predicados, no aqui.
     */
    readonly asianHandicap: (team: "HOME" | "AWAY", line: number) => ScorePredicate;
    readonly europeanHandicap: (team: "HOME" | "AWAY", line: number) => ScorePredicate;
    /** Empate con handicap europeo: el marcador corregido queda igualado. */
    readonly europeanHandicapDraw: (line: number) => ScorePredicate;
};
/** Linea de cuarto: media apuesta a cada linea contigua. */
export declare function isQuarterLine(line: number): boolean;
export interface NamedPredicate {
    readonly key: string;
    readonly label: string;
    readonly predicate: ScorePredicate;
}
/**
 * Traduce una clave canonica a predicado. Formato:
 *   1X2:HOME | 1X2:DRAW | 1X2:AWAY
 *   OU:OVER@2.5 | OU:UNDER@2.5
 *   BTTS:YES | BTTS:NO
 *   DC:1X | DC:12 | DC:X2
 *   DNB:HOME | DNB:AWAY
 *   AH:HOME@-0.5 | AH:AWAY@1
 *   EH:HOME@-1
 *   TT:HOME:OVER@1.5
 *   ODDEVEN:ODD | ODDEVEN:EVEN
 *   CS:2-1
 */
export declare function parsePredicate(key: string): NamedPredicate | null;
