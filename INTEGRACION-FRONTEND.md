# Integración de `odds-engine` en el panel de la ruta raíz

> **ESTADO: fases 0 a 4 HECHAS** (16-09-2026). La pestaña Apuestas ya consume el
> motor. Lo que queda pendiente es la fase 5 (calibración y CLV) y la carga de
> más mercados. Lo implementado se resume al final, en el §8.

Cómo enchufar el motor de `odds-engine/` al panel *Cuota Justa* que sirve
`servidor.mjs` en `/` (`index.html` + `js/01…13` + `css/panel.css`).

Complemento de [ANALISIS-MOTOR.md](ANALISIS-MOTOR.md). El
[INTEGRACION.md](odds-engine/INTEGRACION.md) del propio motor explica cómo
meterlo en `deportes-odds-api`, que es **otro** destino: ahí el motor recibe el
feed crudo de Flashscore; aquí recibiría lo que el panel ya tiene guardado.

---

## 0. El punto de partida, sin adornos

**Hoy el motor y el panel no se conocen.** No hay ni una referencia a
`odds-engine`, `analyseFeeds` ni nada suyo en `index.html`, `js/*.js`,
`servidor.mjs` ni `cargar-cuotas.mjs`. Son dos proyectos que comparten carpeta.

Y hay una duplicación que conviene ver antes de decidir nada:

| Cuenta | En el panel | En el motor |
|---|---|---|
| Quitar el margen | `M.devig` — `js/01-nucleo.js:13-41`, 4 métodos, bisección de 80 pasos | `devig` — 5 métodos, Brent, `target`, banderas de convergencia |
| Margen del mercado | `M.margen` — `01-nucleo.js:43` | `validateMarket` + 4 tramos de aviso |
| Valor esperado | `M.ev` — `01-nucleo.js:44` | `classifyValue` con guarda anti-`self` y cota inferior al 95 % |
| Kelly | `M.kelly` — `01-nucleo.js:45` | `kellyGrowth` + tasa de crecimiento + encogimiento por confianza |
| Probabilidad justa por partido | `analizar()` — `js/02-motor.js:8-40` | `computeMarketProbabilities` + `computeConsensus` |
| Movimiento desde la apertura | `movimiento()` — `js/02-motor.js:72-86` | `analyseMovement` — `calibration/clv.ts` |
| Peaje de una cadena de N apuestas | `peaje(n,v)` con `v` **escrito a mano** por el usuario — `js/11-apuestas.js:118` | `MARGIN_BANDS`, **medido** por banda de cuota |
| Cuota objetivo de la ruta | `cuotaPaso()` = 2,5120 — `js/12-calculadora.js:30` | `DEFAULT_CONFIG.optimizer.targetOdds` = **2,5120** |

Esa última fila no es casualidad: **el motor está configurado de fábrica para la
ruta agresiva del panel**. Alguien escribió las dos cosas pensando en lo mismo y
no las conectó.

La conclusión operativa: integrar no es «añadir una función», es **elegir una de
las dos implementaciones y borrar la otra**. Dos motores de probabilidad en el
mismo producto divergen; es cuestión de tiempo.

---

## 1. La buena noticia: no hace falta *bundler*

Comprobado en esta sesión: `odds-engine/src/` **no usa ni una API de Node**.
Ni `node:`, ni `process`, ni `Buffer`, ni `require`, ni `fs`. Solo `Math`,
`Date.now`, `Map`, `Set` y aritmética.

Con `tsconfig.build.json` ya presente, `npm run build` produce ESM puro en
`odds-engine/dist/`, con extensiones `.js` explícitas en los imports
(`verbatimModuleSyntax` está activado). Eso es **directamente cargable por un
navegador** con `<script type="module">`, sin webpack, sin rollup, sin esbuild.

Y no rompe la promesa del `LEEME.md` («todo es JavaScript sin compilar y sin
dependencias»): hay que matizarla a «sin dependencias de ejecución», porque el
paso `tsc` solo lo corre quien toque el motor, y `dist/` se puede versionar.

---

## 2. La mala noticia: el panel no tiene datos que el motor pueda usar

Este es el obstáculo de verdad, y no se arregla escribiendo código de pegamento.

### 2.1 Lo que guarda el panel

Un documento de la colección `mercado` (formato en `LEEME.md`, consumido en
`js/02-motor.js:8`):

```json
{ "deporte":"Fútbol", "liga":"España - LaLiga",
  "local":"Real Sociedad", "visitante":"Atlético de Madrid",
  "comienza":"2026-09-20T21:00", "tipo":"1x2",
  "casas":[["Bet365", 3.40, 3.60, 2.05]],
  "apertura":[3.20, 3.70, 2.10] }
```

Es decir: **un solo mercado por partido (1X2, o dos vías), de una sola casa.**
No hay over/under, ni ambos marcan, ni hándicaps, ni doble oportunidad.

### 2.2 Lo que el motor necesita para dar lo que promete

| Capacidad del motor | Requisito | ¿Lo cumple el panel hoy? |
|---|---|---|
| Quitar el margen (`FAIR_SINGLE_BOOK`) | un mercado completo de una casa | **Sí** |
| Semáforo de RIESGO | lo anterior | **Sí** |
| Semáforo de VALOR (EV) | **≥ 2 casas externas** desmarginadas | **No** — solo Bet365 |
| Consenso y dispersión | varias casas | **No** |
| Correlación exacta intra-partido | **≥ 3 mercados de familias distintas** del mismo partido | **No** — solo 1X2 |
| Combinadas con conjunta real | lo anterior | **No** |
| Calibración / CLV | resultado real + cuota de cierre | **No** — no se guarda el cierre |
| Coherencia 1X2 ↔ DC ↔ DNB | doble oportunidad o empate no válido | **No** |

Lo verifiqué ejecutando `analyse()` con datos exactamente del formato del panel:

```
=== SOLO Bet365 (el caso real del panel) ===
  Local      2.10  fair 46.0%  FAIR_SINGLE_BOOK  calidad 52.3  riesgo AMARILLO  valor SIN_REFERENCIA  EV null
  Empate     3.40  fair 27.8%  FAIR_SINGLE_BOOK  calidad 52.3  riesgo ROJO      valor SIN_REFERENCIA  EV null
  Visitante  3.60  fair 26.2%  FAIR_SINGLE_BOOK  calidad 52.3  riesgo ROJO      valor SIN_REFERENCIA  EV null
  aviso: «Consenso con una sola casa: no es un consenso, es un precio. No sirve para medir valor.»

=== Bet365 + 4 casas más (el caso demo) ===
  Local      2.10  fair 46.0%  calidad 78.9  riesgo AMARILLO  valor NEGATIVO  EV -4.13%
  Empate     3.40  fair 27.8%  calidad 80.8  riesgo ROJO      valor NEGATIVO  EV -5.75%
  Visitante  3.60  fair 26.2%  calidad 82.6  riesgo ROJO      valor NEGATIVO  EV -4.15%
```

Tres cosas que leer de ahí:

1. Con una sola casa, **el eje de valor se apaga entero**: `SIN_REFERENCIA`, `EV
   null`. El motor se niega, y tiene razón. Esto coincide exactamente con lo que
   el panel ya dice a mano en `js/11-apuestas.js:238` («NO ESTIMABLE · NO
   APOSTAR… con ella el valor esperado es negativo por construcción»). El motor
   no añade ventaja aquí: **formaliza** lo que el panel ya sabía.
2. La calidad del dato cae de ~80 a **52,3**. El filtro
   `minimumOddsQuality: 40` se pasa, pero con poco margen: basta un 1X2 con 10 %
   de sobrerredondeo para bajar de 40 y que la selección **no entre en ninguna
   combinada**. Con una sola casa el panel opera al borde del filtro.
3. Con varias casas el EV sale **negativo**, entre −4 % y −5,8 %. Es la respuesta
   correcta y la que el panel lleva diciendo desde el principio.

### 2.3 El caso de la rejilla, y por qué hay que arreglar el motor antes

Con solo un 1X2, el motor **sí** ajusta una rejilla de marcadores, y no debería:

```
rejillas ajustadas: 1
objetivos usados: 3 | rmse 0.00e+0 | errMax 0.00e+0
```

Es el fallo §5.1 de [ANALISIS-MOTOR.md](ANALISIS-MOTOR.md): el filtro de
ecuaciones redundantes de `pipeline.ts:173` usa un `Set` para contar y no
descarta la tercera salida del 1X2, así que ajusta 3 parámetros con 2 números
independientes y se saca una nota de ajuste perfecta.

**Consecuencia para esta integración:** si se conecta el motor al panel tal
como está hoy, cualquier combinada de dos patas del mismo partido se calculará
en régimen `SAME_MATCH_MODEL` —«conjunta exacta»— sobre una rejilla inventada, y
con la puntuación de confianza intacta. El panel pasaría de decir honestamente
«no estimable» a enseñar un número exacto que no lo es. **Sería un
empeoramiento.**

> **Arreglar `pipeline.ts:173` (`Set` → `Map<string, number>`) es requisito
> previo de la integración, no una mejora opcional.**

---

## 3. Dónde ejecutar el motor: en el servidor

| | En el navegador | **En `servidor.mjs`** |
|---|---|---|
| Build | `dist/` servido como estático | `import` normal de Node |
| Coste de CPU | en el móvil del usuario | en el ordenador que ya corre el servidor |
| `fitGridFromMarkets` | **43 ms/partido × 3-5** en móvil | 43 ms/partido medidos |
| 20 partidos | 3–9 s bloqueando el hilo de pintado | ~0,9 s, una vez |
| `index.html` con doble clic | funciona | no hay servidor → hace falta camino de respaldo |
| Cambiar umbrales sin tocar al cliente | no | sí |

**Recomendación: en el servidor**, con una ruta nueva, y dejando `analizar()`
como respaldo para el modo sin servidor (que `LEEME.md` documenta como caso de
uso real: «Verlo sin servidor: abre `index.html` con doble clic»).

Los 43 ms son medidos en esta máquina con Node 22 (12 arranques de Nelder-Mead ×
3.000 iteraciones × rejilla 13×13). El generador de combinadas trae además
`maxNodesExplored: 2.000.000` de fábrica, que hay que bajar para un panel
interactivo.

---

## 4. Plan por fases

Cada fase deja el panel funcionando. Ninguna obliga a la siguiente.

### Fase 0 — Preparar el motor (sin tocar el panel)

1. Arreglar §5.1 (`Set` → `Map`) y añadir el test que falta.
2. Arreglar §5.4 (`marketPrior` extrapolando a cuota combinada sin avisar): con
   la ruta de 5 etapas a 2,5120 este prior es el ancla de todo el ranking.
3. `cd odds-engine && npm install && npm run build` → `odds-engine/dist/`.
4. Decidir si `dist/` se versiona. Recomendado sí, para que `node servidor.mjs`
   siga funcionando recién clonado, que es la promesa del `LEEME.md`.

### Fase 1 — El adaptador del panel, dentro del motor

El motor ya tiene el precedente: `src/adapters/flashscore.ts` traduce un formato
externo a `Market[]`. Hace falta el hermano `src/adapters/panel.ts`:

```ts
// odds-engine/src/adapters/panel.ts
export interface DocMercado {
  readonly id: string;
  readonly deporte?: string; readonly liga?: string;
  readonly local: string; readonly visitante: string;
  readonly comienza: string;
  readonly tipo: '1x2' | '2v';
  readonly casas: readonly [string, number, number, number][];
  readonly apertura?: readonly number[];
  readonly actualizado?: string;
  readonly historial?: readonly { t: string; c: number[] }[];
}

export function adaptPanelMarket(doc: DocMercado, now = Date.now()): {
  match: MatchContext; markets: Market[]; warnings: string[];
}
```

Reglas de traducción, todas con su porqué:

| Campo del panel | Destino en el motor | Cuidado |
|---|---|---|
| `tipo: '1x2'` | `kind:'THREE_WAY'`, `family:'1X2'`, salidas `HOME`/`DRAW`/`AWAY`, `normalisationTarget: 1` | — |
| `tipo: '2v'` | `kind:'BINARY'`, `family:'ML'`, salidas `HOME`/`AWAY` | la cuota del medio llega como `0`: **descartarla**, no pasarla |
| `casas[i]` | una `OddsQuote` por casa y salida | el nombre debe ser **exactamente** `'Bet365'`: es lo que el motor busca por igualdad de cadena |
| `apertura[j]` | `openingOdds` de la cuota de la casa principal | solo si `> 1`; alimenta `movement` en `oddsQualityScore` |
| `actualizado` | `observedAt` (epoch ms) | si falta, `now`; el motor penaliza por antigüedad con semivida de 6 h |
| `comienza` | `MatchContext.startsAt` | ojo con la hora local sin zona que documenta el `LEEME.md` |
| `id`, `local`, `visitante`, `liga` | `MatchContext` | — |
| `historial` | nada, de momento | ver Fase 4 |

Tres decisiones que **no** delegar al pegamento:

- **`complete: true` solo si de verdad lo está.** Un `1x2` con las tres cuotas
  presentes sí; un `2v` al que le falte una cuota, no. `validateMarket` corta
  solo si se le dice la verdad.
- **`live`.** El panel sabe si el partido está en juego
  (`relojPartido`, `js/05-partido.js:31`). Pasarlo: cambia la semivida de
  frescura de 6 h a 60 s (`staleHalfLifePrematch` / `staleHalfLifeLive`).
- **Precio muerto.** `precioMuerto()` (`js/07-mercado.js:19`) ya detecta cuotas
  copiadas antes del pitido inicial de un partido en juego, y el panel las
  oculta. El adaptador debe **descartar ese documento entero**, no pasarlo: si
  entra, el motor calcula probabilidades sobre un precio que ya no existe.

Escribirlo en TypeScript dentro del motor, con sus tests, y no en JavaScript
suelto dentro de `servidor.mjs`: es donde están los tipos nominales que impiden
las confusiones, y es la forma de que el adaptador no se desincronice del núcleo.

### Fase 2 — La ruta en `servidor.mjs`

```js
// servidor.mjs
import { analyseFromPanel } from './odds-engine/dist/adapters/panel.js';

// dentro de api(), junto a 'estado' | 'eventos' | 'leer'
if (que === 'analisis' && partes.length === 1 && m === 'POST') {
  const p = await cuerpoJson(req, LIM_DB);
  return json(res, 200, analyseFromPanel({
    docs: listar('mercado').map(d => ({ id: d.id, ...d.data })),
    targetOdds: Number(p?.targetOdds) || 2.5120,
    bookmaker: 'Bet365',
    universe: 'top',
  }));
}
```

Detalles que hay que resolver sí o sí:

- **La lista blanca de estáticos.** `servidor.mjs:403` solo sirve
  `index.html`, `css/` y `js/`. Si algún día se sirve el motor al navegador
  (Fase 5), hay que añadir `odds-engine/dist/`. Con la ruta de API no hace falta.
- **El presupuesto de nodos.** Bajar `maxNodesExplored` de 2.000.000 a algo del
  orden de 50.000 vía `withConfig`, y devolver `stats.budgetExhausted` al panel
  para poder enseñarlo. Un panel que se queda 30 s pensando está roto aunque
  el resultado sea correcto.
- **Caché.** La base solo cambia cuando alguien escribe. Cachear la respuesta
  por *hash* del contenido de `mercado` y tirar la caché en `difundir('mercado')`
  (`servidor.mjs:172`) evita recalcular 20 rejillas en cada pulsación del botón
  de refresco.
- **`S.demo`.** El panel arranca con `DEMO_MARKET` (`js/01-nucleo.js:88-101`),
  cuotas inventadas. **La ruta no debe existir para datos de ejemplo**: el
  cliente no la llama si `S.demo` es `true`, igual que `selecciones72h()` ya
  devuelve vacío en ese caso (`js/11-apuestas.js:160`).

### Fase 3 — La pestaña Mercado

Sustituir la llamada a `analizar(e)` de `renderMercado()`
(`js/07-mercado.js:51`) por lo que devuelva la ruta, manteniendo `analizar()`
como respaldo cuando no haya servidor.

Lo que se gana, en la propia casilla:

| Casilla de hoy | Con el motor |
|---|---|
| `pctP(r.p)` — probabilidad sin margen, método potencia | lo mismo, más la **horquilla entre los 5 métodos** como incertidumbre de modelo |
| — | `riskLight`: `MUY_BAJA`/`ROJO`/`NEUTRAL`/`AMARILLO`/`VERDE`/`EXTREMA` |
| `pctS(r.ev)`, solo si hay varias casas | `valueLight` explícito, con `SIN_REFERENCIA` cuando toca, y la razón en texto |
| — | `oddsQuality` 0-100, con la lista de motivos de por qué baja |
| avisos: ninguno | `selection.warnings`: margen excesivo, cuota vieja, mercado incompleto… |

Un aviso importante de diseño: el eje de RIESGO es **monótono en la cuota**.
`VERDE` quiere decir «cuota corta», no «buena apuesta». Si se pinta de verde una
casilla en la columna de la cuota, el usuario leerá «apuesta aquí». El motor lo
repite en tres cabeceras distintas y el panel tendrá que ser igual de explícito,
o el color hará más daño que bien. Mi recomendación: pintar `valueLight`, no
`riskLight`, y con Bet365 sola eso es un gris permanente — que es la verdad.

### Fase 4 — La pestaña Apuestas: aquí está el premio

Es donde el motor aporta algo que el panel **no puede hacer hoy**.

Hoy (`js/11-apuestas.js:301-306`), al panel le hace falta una cuota `g` para la
etapa que toca y hace esto:

```js
const banda = sel.filter(x => x.cuota >= g * 0.85 && x.cuota <= g * 1.40)
                 .sort(...)      // las 3 más cercanas a g
                 .slice(0, 3);
```

Tres **apuestas simples** cercanas a la cuota objetivo. Nada más. No hay
combinadas, ni conjunta, ni correlación.

Con el motor, la misma pregunta se convierte en:

```js
optimiseCombinations(candidatas, cfg, { targetOdds: e.necesaria, ... })
```

y devuelve combinadas reales ordenadas por tasa de crecimiento de Kelly, cada
una con `combinedOdds`, `joint.adjustedJointProbability`, su cota inferior al
95 %, `compoundMargin`, riesgo de correlación, confianza y un `verdict` en
castellano listo para pintar.

Tres cosas que reconciliar:

1. **La banda de cuota no coincide.** El panel acepta `[0,85·g ; 1,40·g]`; el
   motor solo `[T ; T·(1+tol)]` con `tol = 0,06`, es decir **nada por debajo del
   objetivo**. El motor tiene razón: una cuota por debajo de `g` no puede llegar
   al objetivo en las etapas que quedan. Al integrar, la banda inferior del panel
   desaparece, y eso es una mejora, pero hay que decirlo en pantalla o parecerá
   que se han perdido candidatas.
2. **`rMargen` (el 5 % escrito a mano) se queda sin trabajo.** `peaje(n,v)`
   (`js/11-apuestas.js:118`) supone un margen plano que el usuario teclea. El
   motor lo sustituye por `MARGIN_BANDS`, medido y dependiente de la cuota. Es
   un cambio de fondo: los números de `#planKpis` y del pie cambiarán. Habrá que
   explicarlo, y conviene enseñar los dos durante una temporada.
3. **El veredicto casi siempre será `NO EXISTE COMBINACIÓN VERDE CON SUFICIENTE
   CONFIANZA`.** Con una sola casa, `confidenceScore` se queda muy por debajo
   de `greenValidationConfidence: 85`. Eso **no es un fallo de la integración**:
   es el motor funcionando y coincide punto por punto con lo que el panel ya
   dice. Si al integrarlo aparecen verdes validados, hay que sospechar del
   cableado antes que celebrarlo.

### Fase 5 — Calibración (la que cierra el círculo, y la que falta)

Nada de lo anterior vale mientras no se compruebe que cuando el motor dice 85 %,
ocurre el 85 % de las veces. El módulo `calibration/` está entero y sin usar.

Para alimentarlo hacen falta **tres campos nuevos** en los documentos de
`apuestas` y de `rutas`, escritos **en el momento de apostar**:

| Campo | Qué es | De dónde sale |
|---|---|---|
| `pAnunciada` | la probabilidad que el motor anunció | `joint.adjustedJointProbability` |
| `confianza` | `confidenceScore` en ese momento | `optimisation.candidates[i].confidence` |
| `cierre` | cuota de cierre del mismo mercado | **hay que cargarla**: hoy nadie la guarda |

Con `pAnunciada` + el `estado` que ya registra la pestaña Resultados
(`js/10-resultados.js`) se puede llamar a `reliabilityDiagram`, `checkClaim` y
`validateConfidence`. Con `cierre`, además, `analyseClv`.

Dos avisos que el propio motor da y conviene interiorizar antes de empezar:

- para distinguir un 85 % real de un 80 % hacen falta **430 combinadas
  resueltas** (`requiredSampleSize`, salida del demo);
- el CLV no significa nada por debajo de **~100 apuestas** (`clv.ts:86`).

O sea: la fase de calibración se mide en temporadas, no en semanas. Empezar a
guardar los tres campos **hoy** es lo único que se puede hacer para acortarla.

---

## 5. Lo que hay que cargar para que el motor deje de estar dormido

Por orden de rentabilidad por unidad de trabajo:

1. **Doble oportunidad y/o empate no válido del mismo partido.** Desbloquea
   `checkCoherence`, que detecta precios mal puestos **sin una segunda casa**.
   Es la única ventaja disponible con una sola casa, y hoy está implementada,
   probada y desconectada (§5.8 del análisis).
2. **Over/under y ambos marcan.** Con 1X2 + OU 2.5 + BTTS ya hay 3 familias
   distintas: la rejilla de marcadores se ajusta **de verdad**, con residuo
   distinto de cero y por tanto informativo. Se abre todo el bloque de
   correlación, que es lo mejor del motor y lo que el `INTEGRACION.md` del
   propio motor señala como el sitio donde puede haber un precio mal puesto:
   `joint.correlation.pairs[].ratio`.
3. **Una segunda casa cualquiera.** Enciende el eje de VALOR entero: consenso,
   dispersión, EV con cota inferior. Sin esto, `valueLight` será
   `SIN_REFERENCIA` para siempre.
4. **La cuota de cierre.** Sin ella no hay CLV, y sin CLV no hay forma de saber
   si una estrategia vale antes de 500 apuestas.

Ya existe el camino de entrada para todo esto: `cargar-cuotas.mjs` y
`POST /api/db/mercado`. Lo que falta es ampliar el formato de `LEEME.md` para
que un documento pueda llevar varios mercados, no solo un `tipo`.

---

## 6. Riesgos de la integración

1. **El más grave: que el motor dé apariencia de precisión donde no la hay.**
   Con el bug §5.1 sin arreglar, el panel pasaría de un honesto «NO ESTIMABLE»
   a un «conjunta exacta 43,05 %» calculado sobre una rejilla ajustada a dos
   números. El panel entero está construido sobre no hacer eso —los comentarios
   de `js/05-partido.js:6-16` sobre el minuto de juego son exactamente esa
   discusión—; integrar el motor sin arreglarlo traicionaría su propio diseño.
2. **Dos implementaciones de la misma cuenta.** Si `M.devig` y `devig` conviven,
   el Mercado y las Apuestas acabarán enseñando probabilidades distintas para la
   misma cuota. Decidir cuál manda, y borrar la otra o marcarla claramente como
   respaldo de modo sin servidor.
3. **Los umbrales del semáforo no están calibrados para todas las familias.**
   `classifyThreeWay` se aplica a la doble oportunidad (§5.10 del análisis), cuyo
   rango típico es 0,55–0,92: casi todo saldrá VERDE o EXTREMA.
4. **Idioma.** El motor expone la API en inglés (`riskLight`, `VERDE`
   mezclado con `SIN_REFERENCIA`, `valueLight`) y el panel es íntegramente
   castellano. Los textos ya vienen en castellano; las **claves** no. Hace falta
   una capa fina de traducción en el cliente, no repartir `esRiskLight()` por
   toda la interfaz.
5. **Regresión de rendimiento en el refresco.** El botón de refresco
   (`js/09-interfaz.js:217`) hoy solo relee la base. Si pasa a disparar un
   análisis completo, la latencia percibida se multiplica. La caché de la Fase 2
   no es opcional.

---

## 7. Resumen ejecutable

```bash
# Fase 0 — una vez
cd odds-engine
npm install
npm test          # 139/139
npm run build     # → odds-engine/dist/, ESM apto para Node y navegador
```

| Fase | Trabajo | Qué desbloquea |
|---|---|---|
| 0 | arreglar §5.1 y §5.4 del motor, `npm run build` | que integrar no empeore el panel |
| 1 | `src/adapters/panel.ts` + tests | traducir la base del panel a `Market[]` |
| 2 | `POST /api/analisis` en `servidor.mjs` + caché | el motor corriendo con datos reales |
| 3 | Mercado consume `riskLight`/`valueLight`/`warnings` | avisos y calidad del dato en pantalla |
| 4 | Apuestas consume `optimiseCombinations` | **combinadas de verdad**, con conjunta y correlación |
| 5 | guardar `pAnunciada`, `confianza`, `cierre` | calibración y CLV — dentro de una o dos temporadas |

Y el orden de carga de datos, que es lo que de verdad decide cuánto motor se
puede encender: **doble oportunidad → over/under y ambos marcan → una segunda
casa → cuota de cierre.**

Mientras solo haya 1X2 de Bet365, la integración aporta avisos, calidad del dato
y disciplina de tipos. El bloque de correlación y el eje de valor —lo mejor que
tiene el motor— seguirán apagados, y el veredicto seguirá siendo el mismo que el
panel ya escribe hoy a mano.


---

## 8. Lo que se implementó (16-09-2026)

### Motor: dos correcciones, que eran requisito previo

| Qué | Dónde | Efecto |
|---|---|---|
| `Set` → `Map<string, number>` en el deduplicado de objetivos | `odds-engine/src/pipeline.ts:173` | un partido con solo 1X2 ya **no** produce rejilla de marcadores. Antes ajustaba 3 parámetros con 2 ecuaciones y se daba nota máxima |
| Recuento de ecuaciones independientes | `odds-engine/src/correlation/scoreGrid.ts` | defensa en profundidad: el ajuste se niega aunque el llamante mande objetivos redundantes |
| `combinedMarketPrior()` | `odds-engine/src/rank/index.ts` | el prior de una combinada compone el peaje **pata a pata** con la banda de cada una, en vez de leer la banda de la cuota total. Antes subestimaba el peaje y las combinadas parecían mejores de lo que son |

Tests nuevos: 18 (139 → **157**, todos en verde). Cubren justo los huecos que
dejaron pasar estos fallos: cuántos objetivos llegan al ajuste, y qué le pasa al
EV cuando el prior se compone bien.

### Adaptador y ruta

- `odds-engine/src/adapters/panel.ts` — traduce los documentos de `mercado` a
  `Market[]` y expone `analysePanel()`. Tira lo que no se puede usar y dice por
  qué: sin hora, ya terminado, fuera del horizonte de 72 h, casa que no cotiza
  todas las salidas, y **precio muerto** (partido en juego con cuotas copiadas
  antes del pitido inicial, el `precioMuerto()` del panel). Un 1X2 que no es de
  fútbol no recibe la familia `1X2`: la rejilla es de goles y ajustarla a un
  partido de tenis sería inventarse una distribución.
- `POST /api/analisis` en `servidor.mjs`, con carga perezosa del motor (el
  servidor arranca igual sin `dist/`) y caché por contenido de la base.
  `GET /api/estado` devuelve ahora `motor: true|false`.

### Panel

- `js/motor.js` — cliente del motor. La clave de caché es *cuota objetivo +
  firma del mercado*, que es lo que impide que el repintado dispare una petición
  detrás de otra (**comprobado: 0 peticiones en 6 repintados**).
- `js/11-apuestas.js` — `renderCandidatas()` pasa a ser un despachador. Con
  servidor y motor, pinta candidatas del motor; sin servidor, la función de
  siempre, renombrada a `renderCandidatasPanel()`. Con datos de ejemplo no se
  propone nada, como antes.

### Lo que se ve ahora, con datos reales

```
SIN VENTAJA
NO EXISTE COMBINACION VERDE CON SUFICIENTE CONFIANZA. Se han evaluado 2
combinacion(es) que llegan a la cuota 2.5119 y ninguna pasa los filtros.

Por qué no pasa nada los filtros:
  1×  Confianza 47/100, por debajo del minimo de 50.
  1×  Confianza 45/100, por debajo del minimo de 50.

Simple                                    2,55     ← Nápoles–Juventus / Local
  Prob. conjunta 38,0 %   Peaje compuesto 3,18 %   Confianza 47/100   VE −5,2 %

Combinada de 2                            2,528    ← Arsenal/Local + R.Madrid/Local
  Prob. conjunta 38,0 %   Peaje compuesto 3,99 %   Confianza 45/100   VE −5,6 %
```

Fíjate en el par de líneas de peaje: **la combinada de dos patas es peor que el
simple de la misma cuota** (−5,6 % contra −5,2 %). Es el peaje compuesto, y es
exactamente lo que la pestaña anterior no podía ver, porque no evaluaba
combinadas.

### Lo que sigue pendiente

1. **Cargar más mercados.** Es lo único que enciende el bloque de correlación,
   que es lo mejor del motor. Orden: doble oportunidad → más de/menos de y ambos
   marcan → una segunda casa → cuota de cierre.
2. **Fase 5, calibración.** Guardar `pAnunciada`, `confianza` y `cierre` en el
   momento de apostar. No cuesta casi nada y sin ello la fase se mide en
   temporadas desde el día que se empiece.
3. Los hallazgos §5.2, §5.5, §5.6 y §5.8 de [ANALISIS-MOTOR.md](ANALISIS-MOTOR.md)
   siguen abiertos. Ninguno bloquea lo que ya funciona.
