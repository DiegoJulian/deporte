/**
 * Tipos del dominio.
 *
 * REGLA DE ORO DEL PROYECTO (seccion 25 del encargo):
 * `odds`, `rawImpliedProbability`, `fairImpliedProbability`,
 * `marketConsensusProbability`, `adjustedJointProbability` y `confidenceScore`
 * son SEIS magnitudes distintas. El sistema de tipos las mantiene separadas a
 * proposito: cada una lleva su propio tipo nominal para que el compilador
 * impida usar una donde va otra.
 */
export const asOdds = (n) => {
    if (!Number.isFinite(n) || n <= 1)
        throw new RangeError(`Cuota decimal invalida: ${n}`);
    return n;
};
export const asRaw = (n) => n;
export const asFair = (n) => n;
export const asConsensus = (n) => n;
export const asAdjusted = (n) => n;
//# sourceMappingURL=types.js.map