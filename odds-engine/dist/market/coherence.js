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
export function checkCoherence(input, tolerancePoints = 0.015) {
    const { home, draw, away } = input.threeWay;
    const checks = [];
    const add = (market, outcome, implied, observed) => {
        if (observed === undefined)
            return;
        const delta = observed - implied;
        checks.push({
            market, outcome, implied, observed,
            deltaPoints: delta,
            // Si el precio observado se cotiza a 1/observed y la verdad es `implied`:
            edgeIfObservedIsRight: implied / observed - 1,
        });
    };
    add('DC', '1X', home + draw, input.doubleChance?.homeOrDraw);
    add('DC', '12', home + away, input.doubleChance?.homeOrAway);
    add('DC', 'X2', draw + away, input.doubleChance?.drawOrAway);
    const denom = home + away;
    if (denom > 0) {
        add('DNB', '1', home / denom, input.drawNoBet?.home);
        add('DNB', '2', away / denom, input.drawNoBet?.away);
    }
    const maxDelta = checks.length === 0 ? 0 : Math.max(...checks.map((c) => Math.abs(c.deltaPoints)));
    return { checks, maxDeltaPoints: maxDelta, incoherent: maxDelta > tolerancePoints };
}
//# sourceMappingURL=coherence.js.map