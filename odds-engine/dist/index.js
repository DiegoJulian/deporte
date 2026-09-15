/**
 * @deportes/odds-engine
 *
 * Motor de cuotas -> probabilidad implicita -> semaforo -> combinaciones.
 *
 * PRINCIPIO QUE GOBIERNA TODO EL PAQUETE:
 * la cuota es informacion del mercado, no una certeza. El motor convierte
 * cuotas en una estimacion probabilistica estructurada, retira el margen cuando
 * puede, evalua calidad, consenso, correlacion e incertidumbre, y solo entonces
 * aplica el semaforo. Cuando la informacion no da para justificar un resultado,
 * la salida es que no da: no se inventa precision.
 */
export * from './core/types.js';
export * from './core/numeric.js';
export * from './config/index.js';
export * from './devig/methods.js';
export * from './devig/singleOdds.js';
export * from './market/validator.js';
export * from './market/coherence.js';
export * from './market/fairProbability.js';
export * from './consensus/index.js';
export * from './quality/index.js';
export * from './classify/index.js';
export * from './correlation/predicates.js';
export * from './correlation/scoreGrid.js';
export * from './correlation/engine.js';
export * from './combine/index.js';
export * from './combine/generator.js';
export * from './confidence/index.js';
export * from './rank/index.js';
export * from './optimize/index.js';
export * from './calibration/index.js';
export * from './calibration/clv.js';
export * from './adapters/flashscore.js';
export * from './adapters/analysis.js';
export * from './adapters/panel.js';
export * from './pipeline.js';
//# sourceMappingURL=index.js.map