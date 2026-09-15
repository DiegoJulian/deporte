/** Utilidades numericas. Sin dependencias externas: el backend no tiene ninguna. */
export const clamp = (x, lo, hi) => x < lo ? lo : x > hi ? hi : x;
export const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs) => (xs.length === 0 ? NaN : sum(xs) / xs.length);
export function median(xs) {
    if (xs.length === 0)
        return NaN;
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function stdev(xs) {
    if (xs.length < 2)
        return 0;
    const mu = mean(xs);
    return Math.sqrt(sum(xs.map((x) => (x - mu) ** 2)) / (xs.length - 1));
}
/** Desviacion absoluta mediana, escalada para ser comparable a la desv. tipica. */
export function mad(xs) {
    if (xs.length === 0)
        return 0;
    const m = median(xs);
    return 1.4826 * median(xs.map((x) => Math.abs(x - m)));
}
/**
 * Busqueda de raiz por Brent. Requiere que f(a) y f(b) tengan signo opuesto.
 * Devuelve null si no hay cambio de signo o no converge: el llamante decide,
 * el motor NUNCA devuelve un numero inventado.
 */
export function brent(f, a, b, tol = 1e-12, maxIter = 200) {
    let fa = f(a);
    let fb = f(b);
    if (!Number.isFinite(fa) || !Number.isFinite(fb))
        return null;
    if (fa === 0)
        return a;
    if (fb === 0)
        return b;
    if (fa * fb > 0)
        return null;
    let c = a;
    let fc = fa;
    let d = b - a;
    let e = d;
    for (let i = 0; i < maxIter; i++) {
        if (fb * fc > 0) {
            c = a;
            fc = fa;
            d = b - a;
            e = d;
        }
        if (Math.abs(fc) < Math.abs(fb)) {
            a = b;
            b = c;
            c = a;
            fa = fb;
            fb = fc;
            fc = fa;
        }
        const tol1 = 2 * Number.EPSILON * Math.abs(b) + tol / 2;
        const xm = (c - b) / 2;
        if (Math.abs(xm) <= tol1 || fb === 0)
            return b;
        if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
            const s = fb / fa;
            let p;
            let q;
            if (a === c) {
                p = 2 * xm * s;
                q = 1 - s;
            }
            else {
                const qq = fa / fc;
                const r = fb / fc;
                p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
                q = (qq - 1) * (r - 1) * (s - 1);
            }
            if (p > 0)
                q = -q;
            p = Math.abs(p);
            if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
                e = d;
                d = p / q;
            }
            else {
                d = xm;
                e = d;
            }
        }
        else {
            d = xm;
            e = d;
        }
        a = b;
        fa = fb;
        b += Math.abs(d) > tol1 ? d : xm > 0 ? tol1 : -tol1;
        fb = f(b);
        if (!Number.isFinite(fb))
            return null;
    }
    return null;
}
/** Nelder-Mead para el ajuste de la distribucion de marcadores (3 parametros). */
export function nelderMead(f, x0, opts = {}) {
    const n = x0.length;
    const step = opts.step ?? 0.15;
    const maxIter = opts.maxIter ?? 2000;
    const tol = opts.tol ?? 1e-12;
    const simplex = [[...x0]];
    for (let i = 0; i < n; i++) {
        const p = [...x0];
        p[i] = p[i] + (p[i] === 0 ? step : step * Math.abs(p[i]));
        simplex.push(p);
    }
    let fv = simplex.map((p) => f(p));
    let iterations = 0;
    const order = () => {
        const idx = fv.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
        const ns = idx.map(([, i]) => simplex[i]);
        const nf = idx.map(([v]) => v);
        for (let i = 0; i < simplex.length; i++) {
            simplex[i] = ns[i];
            fv[i] = nf[i];
        }
    };
    order();
    for (; iterations < maxIter; iterations++) {
        const best = fv[0];
        const worst = fv[n];
        if (Math.abs(worst - best) <= tol * (Math.abs(best) + Math.abs(worst) + tol))
            break;
        const centroid = new Array(n).fill(0);
        for (let i = 0; i < n; i++)
            for (let j = 0; j < n; j++)
                centroid[j] = centroid[j] + simplex[i][j] / n;
        const worstP = simplex[n];
        const reflect = centroid.map((c, j) => c + 1 * (c - worstP[j]));
        const fr = f(reflect);
        if (fr < fv[0]) {
            const expand = centroid.map((c, j) => c + 2 * (c - worstP[j]));
            const fe = f(expand);
            if (fe < fr) {
                simplex[n] = expand;
                fv[n] = fe;
            }
            else {
                simplex[n] = reflect;
                fv[n] = fr;
            }
        }
        else if (fr < fv[n - 1]) {
            simplex[n] = reflect;
            fv[n] = fr;
        }
        else {
            const contract = centroid.map((c, j) => c + 0.5 * (worstP[j] - c));
            const fc = f(contract);
            if (fc < worst) {
                simplex[n] = contract;
                fv[n] = fc;
            }
            else {
                const p0 = simplex[0];
                for (let i = 1; i <= n; i++) {
                    simplex[i] = simplex[i].map((v, j) => p0[j] + 0.5 * (v - p0[j]));
                    fv[i] = f(simplex[i]);
                }
            }
        }
        order();
    }
    return { x: [...simplex[0]], fx: fv[0], iterations, converged: iterations < maxIter };
}
/** log(n!) por Lanczos, para Poisson sin desbordar. */
const LN_FACT = [0];
export function lnFactorial(n) {
    for (let i = LN_FACT.length; i <= n; i++)
        LN_FACT[i] = LN_FACT[i - 1] + Math.log(i);
    return LN_FACT[n];
}
export const poissonPmf = (k, lambda) => lambda <= 0 ? (k === 0 ? 1 : 0) : Math.exp(-lambda + k * Math.log(lambda) - lnFactorial(k));
/** Funcion de distribucion normal estandar (Abramowitz & Stegun 26.2.17). */
export function normalCdf(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989422804014337 * Math.exp(-(z * z) / 2);
    const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return z > 0 ? 1 - p : p;
}
/** Cuantil normal estandar (algoritmo de Acklam). */
export function normalQuantile(p) {
    if (p <= 0)
        return -Infinity;
    if (p >= 1)
        return Infinity;
    const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
        1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
    const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
        6.680131188771972e1, -1.328068155288572e1];
    const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
        -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
        3.754408661907416];
    const pLow = 0.02425;
    if (p < pLow) {
        const q = Math.sqrt(-2 * Math.log(p));
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > 1 - pLow) {
        const q = Math.sqrt(-2 * Math.log(1 - p));
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    const q = p - 0.5;
    const r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
//# sourceMappingURL=numeric.js.map