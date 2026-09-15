import { clamp } from '../core/numeric.js';
export function confidenceScore(input, cfg) {
    const factors = {};
    const reasons = [];
    // 1. Calidad del dato: media geometrica de la calidad de las patas.
    //    Geometrica y no aritmetica: una pata pesima hunde la combinada entera,
    //    que es exactamente lo que pasa de verdad.
    const q = input.legQuality.map((x) => clamp(x / 100, 0.01, 1));
    factors.dataQuality = Math.exp(q.reduce((a, x) => a + Math.log(x), 0) / Math.max(q.length, 1));
    const worst = Math.min(...input.legQuality);
    if (worst < 50)
        reasons.push(`La peor pata tiene calidad de cuota ${worst.toFixed(0)}/100.`);
    // 2. Origen de la probabilidad: la peor pata manda.
    const sf = input.sources.map((s) => cfg.confidence.sourceFactor[s] ?? 0.5);
    factors.source = sf.length === 0 ? 1 : Math.min(...sf);
    if (input.sources.some((s) => s === 'RAW_ODDS'))
        reasons.push('Alguna pata sale de una sola cuota sin mercado completo: su margen es desconocido.');
    // 3. Correlacion.
    factors.correlation = cfg.confidence.correlationFactor[input.correlationRisk];
    if (input.correlationRisk !== 'LOW')
        reasons.push(`Riesgo de correlacion ${input.correlationRisk}.`);
    if (!input.correlationModelled) {
        factors.correlationModel = 0.6;
        reasons.push('Hay patas del mismo partido sin modelo de marcadores: la correlacion se acota, no se calcula.');
    }
    else
        factors.correlationModel = 1;
    // 4. Incertidumbre relativa de la conjunta.
    const rel = input.adjustedJointProbability > 1e-9 ? input.jointUncertainty / input.adjustedJointProbability : 1;
    factors.precision = 1 / (1 + (rel / 0.10) ** 2);
    if (rel > 0.10)
        reasons.push(`La probabilidad conjunta tiene un ${(rel * 100).toFixed(0)} % de error relativo.`);
    // 5. Ajuste del modelo de marcadores a las cuotas del partido.
    if (input.gridMaxError !== undefined) {
        factors.modelFit = Math.exp(-input.gridMaxError / 0.02);
        if (input.gridMaxError > 0.02)
            reasons.push(`El modelo de marcadores se separa ${(input.gridMaxError * 100).toFixed(1)} puntos de las cuotas del partido.`);
    }
    else
        factors.modelFit = 1;
    return {
        score: clamp(100 * Object.values(factors).reduce((a, b) => a * b, 1), 0, 100),
        factors,
        reasons,
    };
}
//# sourceMappingURL=index.js.map