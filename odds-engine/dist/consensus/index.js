import { devig } from '../devig/methods.js';
import { brent, mad, median, stdev, sum } from '../core/numeric.js';
const logit = (p) => Math.log(p / (1 - p));
const expit = (x) => 1 / (1 + Math.exp(-x));
const EPS = 1e-9;
export function computeConsensus(market, cfg, opts = {}) {
    const now = opts.now ?? Date.now();
    const halfLife = opts.freshnessHalfLife ?? 6 * 3600_000;
    const outlierZ = opts.outlierZ ?? 3;
    const warnings = [];
    const bookNames = [...new Set(market.outcomes.flatMap((o) => o.quotes.map((q) => q.bookmaker)))];
    const complete = [];
    for (const b of bookNames) {
        const odds = [];
        let observedAt = 0;
        let ok = true;
        for (const o of market.outcomes) {
            const q = o.quotes.find((x) => x.bookmaker === b);
            if (q === undefined || !(q.odds > 1)) {
                ok = false;
                break;
            }
            odds.push(q.odds);
            observedAt = Math.max(observedAt, q.observedAt);
        }
        if (ok && odds.length === market.outcomes.length)
            complete.push({ bookmaker: b, odds, observedAt });
    }
    const excluded = bookNames.length - complete.length;
    if (excluded > 0)
        warnings.push(`${excluded} casa(s) descartadas del consenso por no cotizar el mercado completo: sin todas las salidas no se puede quitar el margen.`);
    const n = market.outcomes.length;
    const outcomeIds = market.outcomes.map((o) => o.id);
    const target = market.normalisationTarget ?? 1;
    if (complete.length === 0) {
        return {
            outcomeIds, consensus: new Array(n).fill(NaN), books: [], booksUsed: 0,
            booksExcluded: excluded, effectiveBooks: 0,
            dispersion: new Array(n).fill(NaN), dispersionRobust: new Array(n).fill(NaN),
            range: new Array(n).fill(NaN),
            warnings: [...warnings, 'Ninguna casa cotiza el mercado completo: no hay consenso posible.'],
        };
    }
    const fairs = complete.map((c) => {
        const raw = c.odds.map((o) => 1 / o);
        const d = devig(raw, cfg.devigMethod, target);
        const S = sum(raw);
        return { ...c, fair: d.converged ? d.fair : raw.map((r) => (target * r) / S), overround: d.overround };
    });
    // --- Atipicas: mediana + MAD sobre el logit, salida a salida ---
    const logits = fairs.map((f) => f.fair.map((p) => logit(Math.min(1 - EPS, Math.max(EPS, p)))));
    const robustZ = fairs.map(() => 0);
    for (let i = 0; i < n; i++) {
        const col = logits.map((L) => L[i]);
        const m = median(col);
        const s = mad(col);
        col.forEach((v, b) => {
            const z = s > 1e-9 ? Math.abs(v - m) / s : 0;
            robustZ[b] = Math.max(robustZ[b], z);
        });
    }
    const books = fairs.map((f, b) => {
        const outlier = robustZ[b] > outlierZ;
        const rep = opts.bookWeights?.[f.bookmaker] ?? 1;
        // Menos margen => casa mas afilada => mas peso. Frescura decae por semivida.
        const marginWeight = 1 / (Math.max(f.overround, 0.002) + 0.01);
        const freshness = Math.pow(0.5, Math.max(0, now - f.observedAt) / halfLife);
        const weight = outlier ? 0 : rep * marginWeight * Math.max(freshness, 0.05);
        return {
            bookmaker: f.bookmaker, fair: f.fair, overround: f.overround, observedAt: f.observedAt,
            weight, outlier, maxRobustZ: robustZ[b],
        };
    });
    const used = books.filter((b) => b.weight > 0);
    if (used.length === 0) {
        warnings.push('Todas las casas quedaron marcadas como atipicas: se usa la mediana sin ponderar.');
        const consensusMed = Array.from({ length: n }, (_, i) => median(books.map((b) => b.fair[i])));
        const S = sum(consensusMed);
        return {
            outcomeIds, consensus: consensusMed.map((p) => (target * p) / S), books, booksUsed: 0, booksExcluded: excluded,
            effectiveBooks: 0,
            dispersion: Array.from({ length: n }, (_, i) => stdev(books.map((b) => b.fair[i]))),
            dispersionRobust: Array.from({ length: n }, (_, i) => mad(books.map((b) => b.fair[i]))),
            range: Array.from({ length: n }, (_, i) => {
                const col = books.map((b) => b.fair[i]);
                return Math.max(...col) - Math.min(...col);
            }),
            warnings,
        };
    }
    const W = sum(used.map((b) => b.weight));
    const effectiveBooks = W ** 2 / sum(used.map((b) => b.weight ** 2));
    // --- Agregacion en logit + renormalizacion por potencia ---
    const meanLogit = Array.from({ length: n }, (_, i) => sum(used.map((b) => b.weight * logit(Math.min(1 - EPS, Math.max(EPS, b.fair[i]))))) / W);
    const provisional = meanLogit.map(expit);
    const Sp = sum(provisional);
    let consensus;
    if (Math.abs(Sp - target) < 1e-12) {
        consensus = provisional;
    }
    else {
        const k = brent((kk) => sum(provisional.map((p) => p ** kk)) - target, 0.05, 20, 1e-14);
        consensus = k === null ? provisional.map((p) => (target * p) / Sp) : provisional.map((p) => p ** k);
    }
    const dispersion = Array.from({ length: n }, (_, i) => {
        const col = used.map((b) => b.fair[i]);
        const mu = sum(used.map((b) => b.weight * b.fair[i])) / W;
        return Math.sqrt(sum(used.map((b) => b.weight * (b.fair[i] - mu) ** 2)) / W) * (col.length > 1 ? Math.sqrt(col.length / (col.length - 1)) : 1);
    });
    const dispersionRobust = Array.from({ length: n }, (_, i) => mad(used.map((b) => b.fair[i])));
    const range = Array.from({ length: n }, (_, i) => {
        const col = used.map((b) => b.fair[i]);
        return Math.max(...col) - Math.min(...col);
    });
    if (used.length === 1)
        warnings.push('Consenso con una sola casa: no es un consenso, es un precio. No sirve para medir valor.');
    else if (used.length < 4)
        warnings.push(`Consenso con solo ${used.length} casas: la estimacion arrastra mucho error.`);
    if (Math.max(...dispersion) > cfg.filters.maximumMarketDispersion) {
        warnings.push(`Dispersion de ${(Math.max(...dispersion) * 100).toFixed(1)} puntos entre casas: el mercado no esta de acuerdo consigo mismo.`);
    }
    return { outcomeIds, consensus, books, booksUsed: used.length, booksExcluded: excluded, effectiveBooks, dispersion, dispersionRobust, range, warnings };
}
//# sourceMappingURL=index.js.map