/**
 * Distribucion de marcadores ajustada A LAS PROPIAS CUOTAS del partido.
 *
 * Esta es la pieza que resuelve la seccion 12 del encargo sin inventarse nada.
 * En vez de asignar a mano correlaciones "altas" o "bajas", se reconstruye la
 * distribucion conjunta de goles (local, visitante) que mejor reproduce las
 * probabilidades fair que la casa YA esta cotizando en varios mercados del
 * mismo partido (1X2, over/under, ambos marcan, handicaps...). Con esa
 * distribucion, la probabilidad conjunta de cualquier combinacion de patas del
 * mismo partido es una suma sobre la rejilla: exacta, no estimada.
 *
 * Modelo: Poisson bivariante con la correccion de Dixon-Coles para los
 * marcadores bajos, que es donde la Poisson independiente falla.
 *
 *   P(x,y) = tau(x,y) * Pois(x; lambda) * Pois(y; mu)
 *   tau(0,0) = 1 - lambda*mu*rho   tau(0,1) = 1 + lambda*rho
 *   tau(1,0) = 1 + mu*rho          tau(1,1) = 1 - rho     resto = 1
 *
 * Tres parametros. Con cuatro o mas mercados el ajuste esta sobredeterminado,
 * y el error residual es una medida honesta de cuanto NO explica el modelo:
 * si es grande, la incertidumbre sube, no se disimula.
 */
import { nelderMead, poissonPmf } from '../core/numeric.js';
export const MAX_GOALS = 12;
export function buildGrid(lambda, mu, rho, maxGoals = MAX_GOALS) {
    // Los dos marginales de Poisson se calculan UNA vez, no una por celda: el
    // ajuste llama a buildGrid miles de veces y las exponenciales dominaban.
    const px = new Array(maxGoals + 1);
    const py = new Array(maxGoals + 1);
    for (let k = 0; k <= maxGoals; k++) {
        px[k] = poissonPmf(k, lambda);
        py[k] = poissonPmf(k, mu);
    }
    const m = new Array(maxGoals + 1);
    let total = 0;
    for (let x = 0; x <= maxGoals; x++) {
        const row = new Array(maxGoals + 1);
        const pxv = px[x];
        for (let y = 0; y <= maxGoals; y++) {
            let tau = 1;
            if (x === 0 && y === 0)
                tau = 1 - lambda * mu * rho;
            else if (x === 0 && y === 1)
                tau = 1 + lambda * rho;
            else if (x === 1 && y === 0)
                tau = 1 + mu * rho;
            else if (x === 1 && y === 1)
                tau = 1 - rho;
            const v = (tau > 1e-12 ? tau : 1e-12) * pxv * py[y];
            row[y] = v;
            total += v;
        }
        m[x] = row;
    }
    const inv = 1 / total;
    for (let x = 0; x <= maxGoals; x++) {
        const row = m[x];
        for (let y = 0; y <= maxGoals; y++)
            row[y] = row[y] * inv;
    }
    return { lambda, mu, rho, matrix: m, maxGoals };
}
/** P(WIN) y P(PUSH) de un predicado sobre la rejilla. */
export function evaluate(grid, predicate) {
    let win = 0, push = 0, loss = 0;
    for (let x = 0; x <= grid.maxGoals; x++) {
        const row = grid.matrix[x];
        for (let y = 0; y <= grid.maxGoals; y++) {
            const p = row[y];
            const r = predicate(x, y);
            if (r === 'WIN')
                win += p;
            else if (r === 'PUSH')
                push += p;
            else
                loss += p;
        }
    }
    return { win, push, loss };
}
/**
 * Ajusta (lambda, mu, rho) a las probabilidades fair observadas.
 * Necesita al menos 3 objetivos independientes; con menos devuelve null y el
 * motor cae a las cotas de Frechet. Nunca extrapola con un ajuste que no tiene
 * grados de libertad.
 */
export function fitGridFromMarkets(targets, maxGoals = MAX_GOALS) {
    const usable = targets.filter((t) => Number.isFinite(t.probability) && t.probability > 0 && t.probability < 1);
    if (usable.length < 3)
        return null;
    // Defensa en profundidad: contar OBJETIVOS INDEPENDIENTES, no objetivos.
    // Un 1X2 desmarginado aporta como mucho dos ecuaciones (la tercera sale de
    // las otras dos); cualquier otra familia y linea, una. Si el llamante manda
    // las tres salidas de un 1X2 y nada mas, esto son dos ecuaciones para tres
    // parametros: el ajuste saldria con residuo cero y no significaria nada.
    // Antes esto se confiaba al deduplicado de `pipeline.ts`, que estaba roto.
    const perFamily = new Map();
    for (const t of usable) {
        const fam = t.key.split(':')[0];
        const line = t.key.includes('@') ? t.key.slice(t.key.indexOf('@')) : '';
        // 1X2, doble oportunidad y empate no valido son la misma distribucion del
        // resultado escrita de tres formas: comparten cupo y entre las tres no
        // pasan de dos ecuaciones independientes sobre (lambda, mu, rho).
        const k = fam === '1X2' || fam === 'DC' || fam === 'DNB' ? 'RESULTADO' : `${fam}${line}`;
        perFamily.set(k, (perFamily.get(k) ?? 0) + 1);
    }
    let independentEquations = 0;
    for (const [k, n] of perFamily)
        independentEquations += Math.min(n, k === 'RESULTADO' ? 2 : 1);
    if (independentEquations < 3)
        return null;
    const loss = (par) => {
        const [l, m, r] = par;
        if (!(l > 0.03) || !(m > 0.03) || l > 8 || m > 8)
            return 1e9;
        if (r < -0.35 || r > 0.35)
            return 1e9;
        if (1 - l * m * r <= 1e-6)
            return 1e9;
        const g = buildGrid(l, m, r, maxGoals);
        let s = 0;
        for (const t of usable) {
            const w = t.weight ?? 1;
            const got = evaluate(g, t.predicate).win;
            s += w * (got - t.probability) ** 2;
        }
        return s * 1e4;
    };
    let best = null;
    for (const l0 of [0.8, 1.2, 1.6, 2.0]) {
        for (const m0 of [0.6, 1.0, 1.4]) {
            const r = nelderMead(loss, [l0, m0, 0], { step: 0.2, maxIter: 3000, tol: 1e-14 });
            if (best === null || r.fx < best.fx)
                best = { x: r.x, fx: r.fx };
        }
    }
    if (best === null)
        return null;
    const [l, m, r] = best.x;
    const grid = buildGrid(l, m, r, maxGoals);
    const residuals = usable.map((t) => {
        const fitted = evaluate(grid, t.predicate).win;
        return { key: t.key, target: t.probability, fitted, error: fitted - t.probability };
    });
    const rmse = Math.sqrt(residuals.reduce((a, x) => a + x.error ** 2, 0) / residuals.length);
    const maxAbsError = Math.max(...residuals.map((x) => Math.abs(x.error)));
    const warnings = [];
    if (maxAbsError > 0.02)
        warnings.push(`El modelo de marcadores no reproduce las cuotas del partido: error maximo de ${(maxAbsError * 100).toFixed(1)} puntos. O el modelo se queda corto o alguno de esos precios esta mal puesto.`);
    if (usable.length === 3)
        warnings.push('Ajuste con exactamente 3 objetivos y 3 parametros: el error residual sera cero por construccion y no valida nada.');
    return { grid, rmse, maxAbsError, residuals, converged: best.fx < 1e9, targetsUsed: usable.length, warnings };
}
/**
 * Probabilidad conjunta exacta de varias patas del MISMO partido.
 * `mode`:
 *  - 'STRICT'  : todas WIN (el push cuenta como fallo)
 *  - 'PUSH_OK' : las patas en PUSH se anulan y no rompen la combinada
 */
export function jointOnGrid(grid, predicates, mode = 'PUSH_OK') {
    let p = 0;
    for (let x = 0; x <= grid.maxGoals; x++) {
        const row = grid.matrix[x];
        for (let y = 0; y <= grid.maxGoals; y++) {
            let ok = true;
            for (const f of predicates) {
                const r = f(x, y);
                if (r === 'LOSS' || (mode === 'STRICT' && r === 'PUSH')) {
                    ok = false;
                    break;
                }
            }
            if (ok)
                p += row[y];
        }
    }
    return p;
}
/**
 * Valor esperado exacto de una combinada del mismo partido, teniendo en cuenta
 * que una pata en PUSH se anula y su cuota sale del producto.
 * Devuelve el retorno medio por euro apostado (1 = devolver lo apostado).
 */
export function expectedReturnOnGrid(grid, legs) {
    let ev = 0;
    for (let x = 0; x <= grid.maxGoals; x++) {
        const row = grid.matrix[x];
        for (let y = 0; y <= grid.maxGoals; y++) {
            const p = row[y];
            if (p === 0)
                continue;
            let payout = 1;
            let alive = true;
            for (const l of legs) {
                const r = l.predicate(x, y);
                if (r === 'LOSS') {
                    alive = false;
                    break;
                }
                if (r === 'WIN')
                    payout *= l.odds;
            }
            if (alive)
                ev += p * payout;
        }
    }
    return ev;
}
//# sourceMappingURL=scoreGrid.js.map