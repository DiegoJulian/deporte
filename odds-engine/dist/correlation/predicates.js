/**
 * Una pata, expresada como funcion del marcador final.
 *
 * Todo mercado de futbol de resultado (1X2, over/under, ambos marcan, doble
 * oportunidad, hándicap, par/impar, marcador correcto, totales de equipo) es
 * una funcion del par (goles local, goles visitante). Expresarlas asi es lo que
 * permite calcular CUALQUIER probabilidad conjunta de patas del mismo partido
 * de forma exacta, en vez de multiplicar como si fueran independientes.
 */
const W = (b) => (b ? 'WIN' : 'LOSS');
export const P = {
    homeWin: () => (h, a) => W(h > a),
    draw: () => (h, a) => W(h === a),
    awayWin: () => (h, a) => W(h < a),
    doubleChanceHomeDraw: () => (h, a) => W(h >= a),
    doubleChanceHomeAway: () => (h, a) => W(h !== a),
    doubleChanceDrawAway: () => (h, a) => W(h <= a),
    /** Empate no valido: el empate devuelve la apuesta. */
    drawNoBetHome: () => (h, a) => (h === a ? 'PUSH' : W(h > a)),
    drawNoBetAway: () => (h, a) => (h === a ? 'PUSH' : W(h < a)),
    over: (line) => (h, a) => (h + a === line ? 'PUSH' : W(h + a > line)),
    under: (line) => (h, a) => (h + a === line ? 'PUSH' : W(h + a < line)),
    bttsYes: () => (h, a) => W(h >= 1 && a >= 1),
    bttsNo: () => (h, a) => W(h === 0 || a === 0),
    teamOver: (team, line) => (h, a) => {
        const g = team === 'HOME' ? h : a;
        return g === line ? 'PUSH' : W(g > line);
    },
    teamUnder: (team, line) => (h, a) => {
        const g = team === 'HOME' ? h : a;
        return g === line ? 'PUSH' : W(g < line);
    },
    totalOdd: () => (h, a) => W((h + a) % 2 === 1),
    totalEven: () => (h, a) => W((h + a) % 2 === 0),
    correctScore: (x, y) => (h, a) => W(h === x && a === y),
    /**
     * Handicap asiatico entero o de media. Las lineas de cuarto (-0.25, -0.75)
     * se resuelven partiendo la apuesta en dos mitades; se modela componiendo
     * dos predicados, no aqui.
     */
    asianHandicap: (team, line) => (h, a) => {
        const diff = team === 'HOME' ? h - a + line : a - h + line;
        if (diff === 0)
            return 'PUSH';
        return W(diff > 0);
    },
    europeanHandicap: (team, line) => (h, a) => {
        const diff = team === 'HOME' ? h - a + line : a - h + line;
        return W(diff > 0);
    },
    /** Empate con handicap europeo: el marcador corregido queda igualado. */
    europeanHandicapDraw: (line) => (h, a) => W(h - a + line === 0),
};
/** Linea de cuarto: media apuesta a cada linea contigua. */
export function isQuarterLine(line) {
    return Math.abs(line * 4 - Math.round(line * 4)) < 1e-9 && Math.abs(line * 2 - Math.round(line * 2)) > 1e-9;
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
export function parsePredicate(key) {
    const at = key.indexOf('@');
    const line = at >= 0 ? Number(key.slice(at + 1)) : NaN;
    const head = at >= 0 ? key.slice(0, at) : key;
    const parts = head.split(':');
    const fam = parts[0];
    const sel = parts[1];
    const mk = (p) => ({ key, label: key, predicate: p });
    switch (fam) {
        case '1X2':
            if (sel === 'HOME')
                return mk(P.homeWin());
            if (sel === 'DRAW')
                return mk(P.draw());
            if (sel === 'AWAY')
                return mk(P.awayWin());
            return null;
        case 'OU':
            if (!Number.isFinite(line))
                return null;
            if (sel === 'OVER')
                return mk(P.over(line));
            if (sel === 'UNDER')
                return mk(P.under(line));
            return null;
        case 'BTTS':
            if (sel === 'YES')
                return mk(P.bttsYes());
            if (sel === 'NO')
                return mk(P.bttsNo());
            return null;
        case 'DC':
            if (sel === '1X')
                return mk(P.doubleChanceHomeDraw());
            if (sel === '12')
                return mk(P.doubleChanceHomeAway());
            if (sel === 'X2')
                return mk(P.doubleChanceDrawAway());
            return null;
        case 'DNB':
            if (sel === 'HOME')
                return mk(P.drawNoBetHome());
            if (sel === 'AWAY')
                return mk(P.drawNoBetAway());
            return null;
        case 'AH':
            if (!Number.isFinite(line) || (sel !== 'HOME' && sel !== 'AWAY'))
                return null;
            return mk(P.asianHandicap(sel, line));
        case 'EH':
            if (!Number.isFinite(line))
                return null;
            if (sel === 'DRAW')
                return mk(P.europeanHandicapDraw(line));
            if (sel !== 'HOME' && sel !== 'AWAY')
                return null;
            return mk(P.europeanHandicap(sel, line));
        case 'TT': {
            const side = parts[1];
            const dir = parts[2];
            if (!Number.isFinite(line) || (side !== 'HOME' && side !== 'AWAY'))
                return null;
            if (dir === 'OVER')
                return mk(P.teamOver(side, line));
            if (dir === 'UNDER')
                return mk(P.teamUnder(side, line));
            return null;
        }
        case 'ODDEVEN':
            if (sel === 'ODD')
                return mk(P.totalOdd());
            if (sel === 'EVEN')
                return mk(P.totalEven());
            return null;
        case 'CS': {
            const m = /^(\d+)-(\d+)$/.exec(sel ?? '');
            if (m === null)
                return null;
            return mk(P.correctScore(Number(m[1]), Number(m[2])));
        }
        default:
            return null;
    }
}
//# sourceMappingURL=predicates.js.map