import { sum } from '../core/numeric.js';
/** Mejor cuota por salida entre todas las casas presentes. */
export function bestOddsPerOutcome(market) {
    return market.outcomes.map((o) => Math.max(...o.quotes.map((q) => q.odds)));
}
export function validateMarket(market, cfg, bookmaker) {
    const issues = [];
    const push = (code, severity, message) => { issues.push({ code, severity, message }); };
    if (market.outcomes.length === 0) {
        push('SIN_SALIDAS', 'ERROR', 'El mercado no trae ninguna salida.');
        return { ok: false, usable: false, overround: null, issues };
    }
    const ids = new Set();
    for (const o of market.outcomes) {
        if (ids.has(o.id))
            push('SALIDA_DUPLICADA', 'ERROR', `Salida repetida: ${o.id}`);
        ids.add(o.id);
    }
    if (market.normalisationTarget !== undefined && !(market.normalisationTarget > 0)) {
        push('OBJETIVO_INVALIDO', 'ERROR', `normalisationTarget invalido: ${market.normalisationTarget}`);
    }
    if (market.kind === 'THREE_WAY' && market.outcomes.length !== 3) {
        push('1X2_INCOMPLETO', 'ERROR', `Mercado 1X2 con ${market.outcomes.length} salidas en vez de 3.`);
    }
    if (market.kind === 'BINARY' && market.outcomes.length !== 2) {
        push('BINARIO_INCOMPLETO', 'ERROR', `Mercado binario con ${market.outcomes.length} salidas en vez de 2.`);
    }
    const picked = market.outcomes.map((o) => bookmaker === undefined
        ? Math.max(...o.quotes.map((q) => q.odds))
        : o.quotes.find((q) => q.bookmaker === bookmaker)?.odds);
    if (picked.some((x) => x === undefined)) {
        push('CASA_PARCIAL', 'WARN', `La casa ${bookmaker ?? '(mejor precio)'} no cotiza todas las salidas: el margen no se puede calcular.`);
        return { ok: false, usable: false, overround: null, issues };
    }
    const odds = picked;
    if (odds.some((c) => !(c > 1) || !Number.isFinite(c))) {
        push('CUOTA_INVALIDA', 'ERROR', `Cuota fuera de rango: ${odds.join(' / ')}`);
        return { ok: false, usable: false, overround: null, issues };
    }
    const target = market.normalisationTarget ?? 1;
    const S = sum(odds.map((c) => 1 / c));
    const overround = S / target - 1;
    if (!market.complete) {
        push('MERCADO_NO_COMPLETO', 'WARN', 'El feed no garantiza que esten todas las salidas: el margen calculado es un limite inferior.');
    }
    if (overround < 0) {
        push('MARGEN_NEGATIVO', 'ERROR', `Suma de probabilidades ${(S * 100).toFixed(2)} % por debajo del ${(target * 100).toFixed(0)} % que le corresponde a este mercado: arbitraje dentro de la misma casa. Es un error palpable de precio, no una oportunidad: las condiciones de la casa permiten anular la apuesta.`);
    }
    else if (overround < cfg.filters.minOverround) {
        push('MARGEN_SOSPECHOSAMENTE_BAJO', 'WARN', `Margen ${(overround * 100).toFixed(3)} %: por debajo de lo que cobra cualquier casa. Revisar el origen del dato.`);
    }
    else if (overround > cfg.filters.maxOverround) {
        push('MARGEN_EXCESIVO', 'WARN', `Margen ${(overround * 100).toFixed(2)} % por encima del tope configurado (${(cfg.filters.maxOverround * 100).toFixed(0)} %).`);
    }
    const hasError = issues.some((i) => i.severity === 'ERROR');
    return { ok: !hasError && issues.length === 0, usable: !hasError, overround, issues };
}
//# sourceMappingURL=validator.js.map