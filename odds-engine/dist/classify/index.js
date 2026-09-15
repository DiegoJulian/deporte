export function classifyThreeWay(fair, cfg) {
    const t = cfg.individual.threeWay;
    if (fair > t.extremeMin)
        return 'EXTREMA';
    if (fair < t.veryLowMax)
        return 'MUY_BAJA';
    if (fair >= t.greenMin && fair <= t.greenMax)
        return 'VERDE';
    if (fair >= t.yellowMin && fair < t.yellowMax)
        return 'AMARILLO';
    if (fair >= t.redMin && fair <= t.redMax)
        return 'ROJO';
    return 'NEUTRAL';
}
export function classifyBinary(fair, cfg) {
    const t = cfg.individual.binary;
    if (fair > t.extremeMin)
        return 'EXTREMA';
    if (fair < t.discardMax)
        return 'MUY_BAJA';
    if (fair >= t.greenMin)
        return 'VERDE';
    if (fair >= t.neutralMin && fair < t.neutralMax)
        return 'NEUTRAL';
    if (fair >= t.yellowMin && fair < t.yellowMax)
        return 'AMARILLO';
    if (fair >= t.redMin && fair < t.redMax)
        return 'ROJO';
    return 'NEUTRAL';
}
export function classifyValue(input, cfg) {
    if (input.reference === null || input.basis === null || input.basis === 'self') {
        return {
            light: 'SIN_REFERENCIA', expectedValue: null, expectedValueLcb: null, basis: null,
            reason: input.basis === 'self'
                ? 'La unica referencia disponible es el propio precio desmarginado de esta casa. Medir valor contra uno mismo da siempre el margen cambiado de signo: no es informacion.'
                : 'No hay referencia externa con la que medir valor.',
        };
    }
    const ev = input.reference * input.odds - 1;
    const sigma = input.referenceUncertainty ?? 0;
    const evLcb = (input.reference - 1.96 * sigma) * input.odds - 1;
    const t = cfg.value;
    if (ev >= t.suspiciousMin) {
        return { light: 'SOSPECHOSO', expectedValue: ev, expectedValueLcb: evLcb, basis: input.basis,
            reason: `EV de ${(ev * 100).toFixed(1)} %. A ese tamano lo probable es que el dato este mal (cuota vieja, mercado distinto, linea cambiada), no que haya un regalo.` };
    }
    if (evLcb > t.positiveMin) {
        return { light: 'POSITIVO', expectedValue: ev, expectedValueLcb: evLcb, basis: input.basis,
            reason: `EV de ${(ev * 100).toFixed(2)} % y la cota inferior al 95 % sigue por encima del umbral.` };
    }
    if (ev <= t.negativeMax) {
        return { light: 'NEGATIVO', expectedValue: ev, expectedValueLcb: evLcb, basis: input.basis,
            reason: `EV de ${(ev * 100).toFixed(2)} %: se paga peaje.` };
    }
    return { light: 'NEUTRO', expectedValue: ev, expectedValueLcb: evLcb, basis: input.basis,
        reason: `EV de ${(ev * 100).toFixed(2)} %, pero la cota inferior (${(evLcb * 100).toFixed(2)} %) no descarta el cero.` };
}
/**
 * Semaforo de combinada.
 *
 * En modo RELATIVE_TO_TARGET la escala no es la probabilidad absoluta sino
 * `P_adj / P_mejor_alcanzable` para la cuota objetivo. Motivo, con numeros:
 * una combinada que paga 2,5120 tiene como mucho 39,81 % de probabilidad
 * (1/2,5120) y eso es ANTES de margen; con los umbrales absolutos del encargo
 * (VERDE > 85 %, DESCARTAR < 55 %) toda combinada que llegue a esa cuota sale
 * DESCARTAR, siempre, por aritmetica. El modo relativo conserva los mismos
 * numeros pero midiendo lo que si se puede comparar: como de buena es esta
 * combinada frente a la mejor posible para el mismo objetivo.
 */
export function classifyCombination(adjustedJointProbability, confidence, cfg, bestAttainable) {
    const t = cfg.combination;
    const relative = t.mode === 'RELATIVE_TO_TARGET' && bestAttainable !== undefined && bestAttainable > 0;
    const scale = relative ? adjustedJointProbability / bestAttainable : adjustedJointProbability;
    let light;
    if (scale >= t.greenMin)
        light = 'VERDE';
    else if (scale >= t.yellowMin)
        light = 'AMARILLO';
    else if (scale >= t.redMin)
        light = 'ROJO';
    else
        light = 'DESCARTAR';
    const validated = light === 'VERDE' && confidence >= cfg.filters.greenValidationConfidence;
    const label = light !== 'VERDE' ? light
        : validated ? 'VERDE DE ALTA CONFIANZA'
            : `VERDE NO VALIDADO (confianza ${confidence.toFixed(0)}/100 < ${cfg.filters.greenValidationConfidence})`;
    return { light, validated, label, basis: relative ? 'RELATIVE_TO_TARGET' : 'ABSOLUTE', scale };
}
//# sourceMappingURL=index.js.map