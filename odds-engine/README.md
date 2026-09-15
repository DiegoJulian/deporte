# @deportes/odds-engine

Motor de cuotas → probabilidad implícita → semáforo → combinaciones, para
`deportes-odds-api`. Node 22 + TypeScript, **cero dependencias de ejecución**,
tests con `node:test`.

```bash
npm install
npm test          # 139 tests
npm run typecheck
npx tsx examples/demo.ts
```

## El principio

**La cuota es información del mercado, no una certeza.** El motor convierte
cuotas en una estimación probabilística estructurada, retira el margen cuando
puede, evalúa calidad, consenso, correlación e incertidumbre, y solo entonces
aplica el semáforo. Cuando la información no da para justificar un resultado,
la salida es que no da. No se inventa precisión.

## Las seis magnitudes que nunca se mezclan

| Magnitud | Qué es | Tipo |
|---|---|---|
| `odds` | lo que paga la casa | `DecimalOdds` |
| `rawImpliedProbability` | `1/cuota`. **Lleva el margen dentro** | `RawProbability` |
| `fairImpliedProbability` | margen retirado sobre un mercado completo | `FairProbability` |
| `marketConsensusProbability` | varias casas desmarginadas y agregadas | `ConsensusProbability` |
| `adjustedJointProbability` | conjunta de la combinada, ajustada por correlación | `AdjustedProbability` |
| `confidenceScore` | cuánto nos podemos fiar de la estimación | `number` 0-100 |

Cada una lleva un tipo nominal distinto: el compilador impide usar una donde va
otra. No es decoración — es la regla de la sección 25 del encargo, hecha cumplir
por la herramienta.

## Arquitectura

```
Odds Collector (el backend)
        │
        ▼
Market Validator ──────► avisos: margen negativo, mercado incompleto, cuota imposible
        │
        ▼
Overround + Fair Probability Engine      devig/  market/
        │   5 métodos: potencia (defecto), Shin, proporcional, aditivo, odds-ratio
        │   La horquilla entre métodos es incertidumbre de modelo, no ruido
        ▼
Market Consensus + Dispersion            consensus/
        │   desmarginar cada casa → atípicas por MAD → ponderar → agregar en logit
        ▼
Odds Quality Score                       quality/
        │
        ▼
Semáforo individual (2 ejes)             classify/
        │   RIESGO = probabilidad (tus umbrales)
        │   VALOR  = EV contra referencia EXTERNA. Nunca contra uno mismo.
        ▼
Correlation Engine                       correlation/
        │   Distribución de marcadores Dixon-Coles ajustada A LAS PROPIAS CUOTAS
        │   → conjunta del mismo partido EXACTA, no supuesta
        │   Sin modelo → cotas de Fréchet + incertidumbre, nunca un número inventado
        ▼
Combination Generator (mochila + branch and bound)   combine/
        │
        ▼
Joint Probability (raw / fair / adjusted + cota inferior)
        │
        ▼
Confidence Engine → Ranking (Kelly) → Optimizer      confidence/ rank/ optimize/
        │
        ▼
Calibración y CLV                        calibration/
```

## Del feed al veredicto, en una llamada

```ts
import { analyseFeeds } from '@deportes/odds-engine';

const out = analyseFeeds({
  feeds: [{ match, blocks, participants }],   // blocks = findOddsByEventId.odds, sin tocar
  bookmaker: 'Bet365',
  universe: 'top',
});
out.optimisation.verdict;
```

El adaptador (`src/adapters/flashscore.ts`) está escrito contra el formato real
del feed, con las tres trampas resueltas: el hándicap del visitante viene con el
signo cambiado, la doble oportunidad suma 2 y no 1, y descanso/final no trae
ningún campo que lo identifique. Ver `INTEGRACION.md`.

## Uso de bajo nivel

```ts
import { buildCombinations, DEFAULT_CONFIG, withConfig } from '@deportes/odds-engine';

const cfg = withConfig({ optimizer: { targetOdds: 2.5120 } });

const r = buildCombinations({
  matches, markets,              // normalizados por el backend
  bookmaker: 'Bet365',           // donde se apuesta
  universe: 'top',               // usa la tabla de peaje de grandes ligas
}, cfg);

console.log(r.optimisation.verdict);
for (const c of r.optimisation.candidates) {
  console.log(c.combinedOdds, c.joint.adjustedJointProbability, c.confidence, c.classification.label);
}
```

## Configuración

Todo umbral vive en `src/config/index.ts` y se sobreescribe con `withConfig`.
Ninguno está escrito a fuego en los módulos.

## Lo que el motor NO hace

- No mide valor contra el precio de la propia casa. Da el margen cambiado de
  signo y no es información.
- No rellena una correlación que no puede calcular. Sube la incertidumbre.
- No baja el listón para tener algo que enseñar. Si no hay nada, lo dice.
