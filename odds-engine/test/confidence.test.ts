import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/config/index.js';
import { confidenceScore, type ConfidenceInput } from '../src/confidence/index.js';

const cfg = DEFAULT_CONFIG;
const base: ConfidenceInput = {
  legQuality: [85, 85, 85],
  sources: ['MARKET_CONSENSUS', 'MARKET_CONSENSUS', 'MARKET_CONSENSUS'],
  correlationRisk: 'LOW',
  correlationModelled: true,
  jointUncertainty: 0.005,
  adjustedJointProbability: 0.40,
};

test('la confianza NO es la probabilidad por cien: misma probabilidad, confianza distinta', () => {
  const p = 0.88;
  const buena = confidenceScore({ ...base, adjustedJointProbability: p }, cfg).score;
  const mala = confidenceScore({
    ...base, adjustedJointProbability: p,
    legQuality: [35, 40, 38], sources: ['RAW_ODDS', 'FAIR_SINGLE_BOOK', 'FAIR_SINGLE_BOOK'],
    correlationRisk: 'HIGH', correlationModelled: false, jointUncertainty: 0.09,
  }, cfg).score;
  assert.ok(buena > 3 * mala, `${buena} frente a ${mala}: la misma probabilidad con dato pesimo tiene que hundirse`);
  assert.ok(mala < 20);
});

test('el caso del encargo: probabilidad 88 % con confianza 74 es un estado posible', () => {
  const r = confidenceScore({
    ...base, adjustedJointProbability: 0.88,
    legQuality: [86, 85, 84], jointUncertainty: 0.034,
  }, cfg);
  assert.ok(Math.abs(r.score - 74) < 2, `confianza ${r.score.toFixed(1)}, se esperaba ~74`);
  assert.ok(Math.abs(r.score - 88) > 10, 'confianza y probabilidad son numeros distintos');
});

test('cuando la confianza se recorta, se dice por que', () => {
  const r = confidenceScore({
    ...base, adjustedJointProbability: 0.88,
    legQuality: [45, 76, 80], jointUncertainty: 0.15, correlationRisk: 'HIGH',
  }, cfg);
  assert.ok(r.score < 30);
  assert.ok(r.reasons.length >= 3, `motivos: ${r.reasons.join(' | ')}`);
  assert.ok(r.reasons.some((x) => x.includes('peor pata')));
  assert.ok(r.reasons.some((x) => x.includes('error relativo')));
});

test('la media geometrica castiga la pata mala mas que la aritmetica', () => {
  const calidades = [85, 85, 15];
  const aritmetica = calidades.reduce((a, b) => a + b, 0) / 3;
  const geometrica = (confidenceScore({ ...base, legQuality: calidades }, cfg).factors.dataQuality as number) * 100;
  assert.ok(geometrica < aritmetica - 10, `geometrica ${geometrica} frente a aritmetica ${aritmetica}`);

  const buena = confidenceScore(base, cfg).score;
  const conPataMala = confidenceScore({ ...base, legQuality: calidades }, cfg).score;
  assert.ok(conPataMala < 0.6 * buena, 'una pata pesima tiene que arrastrar a toda la combinada');
});

test('la correlacion sin modelar penaliza aunque el riesgo sea bajo', () => {
  const modelada = confidenceScore(base, cfg).score;
  const sinModelar = confidenceScore({ ...base, correlationModelled: false }, cfg).score;
  assert.ok(Math.abs(sinModelar - modelada * 0.6) < 1e-9);
});

test('el riesgo de correlacion escala segun la tabla configurada', () => {
  const low = confidenceScore(base, cfg).score;
  const extreme = confidenceScore({ ...base, correlationRisk: 'EXTREME' }, cfg).score;
  assert.ok(Math.abs(extreme - low * 0.30) < 1e-9);
});

test('una pata de cuota suelta (RAW_ODDS) limita la confianza de todo el conjunto', () => {
  const r = confidenceScore({ ...base, sources: ['MARKET_CONSENSUS', 'RAW_ODDS', 'FAIR_SINGLE_BOOK'] }, cfg);
  assert.ok((r.factors.source as number) <= 0.55 + 1e-12);
  assert.ok(r.reasons.some((x) => x.includes('sin mercado completo')));
});

test('mas incertidumbre relativa, menos confianza', () => {
  const precisa = confidenceScore({ ...base, jointUncertainty: 0.002 }, cfg).score;
  const vaga = confidenceScore({ ...base, jointUncertainty: 0.10 }, cfg).score;
  assert.ok(vaga < precisa / 3);
});

test('si el modelo de marcadores no cuadra con las cuotas, la confianza cae', () => {
  const bien = confidenceScore({ ...base, gridMaxError: 0.002 }, cfg).score;
  const mal = confidenceScore({ ...base, gridMaxError: 0.06 }, cfg).score;
  assert.ok(mal < bien / 2);
});

test('la confianza se queda siempre en [0,100]', () => {
  const peor = confidenceScore({
    legQuality: [1, 1, 1], sources: ['RAW_ODDS'], correlationRisk: 'EXTREME',
    correlationModelled: false, jointUncertainty: 0.5, adjustedJointProbability: 0.1, gridMaxError: 0.5,
  }, cfg);
  assert.ok(peor.score >= 0 && peor.score <= 100);
});
