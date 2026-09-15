# Análisis del motor `odds-engine`

Auditoría de `odds-engine/` — 25 módulos, 3.757 líneas de TypeScript en `src/`,
1.751 de tests. Escrito el 15-09-2026 leyendo todo el código fuente, ejecutando
la batería de tests y el ejemplo.

**Estado verificado en esta sesión** (no es lo que dice el README, es lo que
hizo la máquina):

| Comprobación | Resultado |
|---|---|
| `npm test` | **139 / 139 pasan**, 0 fallos, 60,5 s |
| `npm run typecheck` | limpio, con `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| `npx tsx examples/demo.ts` | corre entero, los 5 bloques |
| Dependencias de ejecución | **cero** (`dependencies: {}`) |
| APIs de Node en `src/` | **ninguna** — ni `node:`, ni `process`, ni `Buffer`, ni `require` |

Ese último punto no está en la documentación y es importante: el paquete
compilado **funciona tal cual en un navegador**. Lo retomo en
[INTEGRACION-FRONTEND.md](INTEGRACION-FRONTEND.md).

---

## 1. Qué es esto, en una frase

Un motor que convierte cuotas decimales en una estimación probabilística
**etiquetada por su procedencia y por su incertidumbre**, y que se niega a emitir
un veredicto cuando la procedencia no da para tanto.

No es un predictor. No sabe de fútbol. Todo lo que sabe se lo dicen las cuotas
que le pasan. Lo que aporta es la disciplina de no confundir seis cosas que se
parecen mucho entre sí y que casi todo el software de apuestas mezcla.

## 2. La idea que sostiene el diseño: los tipos nominales

`src/core/types.ts:13-34` define seis marcas nominales sobre `number`:

```
DecimalOdds  RawProbability  FairProbability
ConsensusProbability  AdjustedProbability   (+ confidenceScore, sin marca)
```

Son `number` en tiempo de ejecución y tipos incompatibles en tiempo de
compilación. El efecto práctico: es **imposible** escribir por descuido
`ev = rawProbability * odds - 1` (que es la cuenta que sale siempre negativa
porque `raw` lleva el margen dentro) donde tocaba usar la de consenso. El
compilador lo para.

Esta es la mejor decisión de todo el paquete. Es una regla de negocio —
«1/cuota no es una probabilidad» — convertida en una restricción que la
herramienta hace cumplir, en vez de un comentario que alguien acabará
ignorando. Y es gratis: `asRaw`, `asFair`, etc. son identidades que desaparecen
al compilar.

**El coste:** los constructores `asRaw`/`asFair`/`asConsensus`/`asAdjusted`
(`types.ts:31-34`) no validan nada. Solo `asOdds` comprueba `> 1`. Así que la
marca protege contra confundir magnitudes, no contra meter un `NaN` o un `1.7`
donde va una probabilidad. Es una protección de tipo, no de rango.

## 3. El recorrido, módulo a módulo

### 3.1 Devig — repartir el margen (`src/devig/methods.ts`)

Cinco métodos, todos implementados, todos con bandera de convergencia:

| Método | Hipótesis | Implementación |
|---|---|---|
| `PROPORTIONAL` | margen uniforme **en probabilidad** | cerrada |
| `ADDITIVE` (Vovk) | margen uniforme **en puntos** | cerrada; marca `converged:false` si sale negativa |
| `POWER` (Clarke) | carga más margen a cuota alta | raíz por Brent sobre `Σ r^k = T` |
| `ODDS_RATIO` (Cheung) | razón de momios constante | raíz por Brent |
| `SHIN` | fracción `z` de dinero informado | raíz por Brent |

Tres detalles que demuestran que esto está escrito con cuidado y no copiado:

1. **`target` no es siempre 1.** La doble oportunidad (1X + 12 + X2) cubre cada
   resultado dos veces y suma 2. Normalizarla a 1 da probabilidades a la mitad.
   El parámetro `target` recorre todo el motor desde `Market.normalisationTarget`.
2. **Shin se niega a trabajar con `target ≠ 1`** (`methods.ts:113-121`): el
   modelo está derivado para un libro que suma 1, no hay versión publicada para
   otro objetivo, y el motor **no se la inventa**: cae al proporcional y lo dice
   en un aviso. Es exactamente el comportamiento que el README promete y que
   casi ningún paquete cumple.
3. **`devigModelSpread`** (`methods.ts:159-163`): la horquilla entre los cinco
   métodos se trata como *incertidumbre de modelo*, no como ruido, y se propaga
   hasta el `confidenceScore`. Si los cinco coinciden, el reparto del margen da
   igual; si discrepan, la «probabilidad justa» es una elección nuestra y el
   motor lo dice.

El solucionador de raíces `brent` (`src/core/numeric.ts:37-96`) **devuelve
`null`** cuando no hay cambio de signo o no converge. No devuelve un número
aproximado. Todos los llamantes tratan el `null`. Ese patrón —fallar en vez de
inventar— se repite en todo el paquete y es su rasgo más característico.

### 3.2 La cuota suelta (`src/devig/singleOdds.ts`)

Con una sola cuota el margen es inobservable. La respuesta del motor no es
«no tocar nada», es usar un prior medido: una tabla de 13 bandas de cuota con
el peaje medio observado (1X2 de Bet365, football-data.co.uk, desde 2015),
`MARGIN_BANDS` en `singleOdds.ts:36-50`.

```
p_real = p_raw × (1 + ventaja_de_la_banda)
```

Y el resultado **nunca** se etiqueta `FAIR_SINGLE_BOOK`: sale como
`RAW_ODDS_BAND_ADJUSTED`, arrastra el error típico de su banda calculado con la
varianza real de una apuesta (`bandStandardError`, líneas 60-67), y si la
familia no es 1X2 duplica la incertidumbre y suelta un aviso de extrapolación.

La tabla es, por sí sola, la pieza más valiosa del repositorio: −0,56 % de peaje
a cuota 1,18 frente a −14,45 % a cuota 8. El sesgo favorito-longshot, medido.

### 3.3 Validación y coherencia (`src/market/`)

`validateMarket` corre **antes** de calcular nada. Detecta salidas duplicadas,
1X2 con ≠3 salidas, casa que no cotiza el mercado completo, cuotas imposibles,
y clasifica el margen en cuatro tramos. El aviso de margen negativo
(`validator.ts:78-80`) no dice «arbitraje, oportunidad»: dice que es un error
palpable de precio y que las condiciones de la casa permiten anular la apuesta.
Correcto, y poco común.

`checkCoherence` (`market/coherence.ts`) es una vía de detección de errores de
precio **sin necesidad de una segunda casa**: 1X2, doble oportunidad y empate no
válido son la misma distribución escrita de tres formas; si no cuadran, una está
mal puesta. Está implementado, tiene tests… y **no lo llama nadie**. Ver §5.8.

### 3.4 Consenso (`src/consensus/index.ts`)

La secuencia correcta, y está toda:

1. quedarse solo con las casas que cotizan el mercado **completo** (las demás se
   descartan con aviso: sin todas las salidas no hay margen que quitar);
2. desmarginar **cada casa por separado**;
3. atípicas por mediana + MAD **sobre el logit**;
4. ponderar por margen (menos margen = casa más afilada) y por frescura;
5. agregar **en espacio logit** y renormalizar con una potencia.

El error que este módulo existe para evitar —promediar `1/cuota` entre casas—
está explicado en la cabecera. Agrega en logit porque la media aritmética de
probabilidades está sesgada al centro en los extremos. Devuelve el tamaño de
muestra efectivo de Kish (`effectiveBooks`), que es lo que hay que usar para el
error estándar cuando los pesos no son iguales, y el pipeline lo usa
(`pipeline.ts:117`). Bien.

### 3.5 Correlación: la pieza fuerte (`src/correlation/`)

Aquí está lo que separa este motor de una calculadora de combinadas.

En vez de asignar a mano correlaciones «alta/media/baja», reconstruye la
**distribución conjunta de goles** que mejor reproduce las probabilidades fair
que la propia casa ya está cotizando en varios mercados del mismo partido.
Modelo Poisson bivariante con corrección de Dixon-Coles para los marcadores
bajos, tres parámetros (λ, μ, ρ), ajustado por Nelder-Mead con 12 arranques
distintos (`scoreGrid.ts:150-157`) para no quedarse en un mínimo local.

Con esa rejilla de 13×13, la conjunta de cualquier combinación de patas del
mismo partido es **una suma sobre celdas: exacta**, no supuesta. Y las patas se
expresan como predicados del marcador (`predicates.ts`), lo que cubre 1X2, OU,
BTTS, DC, DNB, hándicap asiático y europeo, par/impar, totales de equipo y
marcador correcto — con `PUSH` de primera clase para los hándicaps que empatan.

Tres regímenes, y el motor dice siempre en cuál está (`engine.ts:24-27`):

- `SAME_MATCH_MODEL` — cálculo exacto sobre la rejilla.
- `SAME_MATCH_BOUNDS` — sin modelo: cotas de Fréchet-Hoeffding, se usa el punto
  independiente con una banda ancha encima.
- `CROSS_MATCH` — independencia.

Y hay dos guardas que valen su peso en oro:

- Si el ajuste usa **exactamente 3 objetivos** para 3 parámetros, avisa de que
  el residuo será cero por construcción y **no valida nada** (`scoreGrid.ts:178`).
  Ojo: avisa, pero no impide. Y el filtro que debía evitar llegar ahí está roto
  — ver §5.1, que es el hallazgo principal de este informe.
- Si el error máximo supera 2 puntos, avisa de que o el modelo se queda corto o
  alguno de esos precios está mal puesto, y penaliza la confianza
  (`confidence/index.ts:74-77`).

El demo lo enseña con números: gana el local + el local marca 2+ + el rival no
gana da 21,79 % multiplicando y **43,05 % de verdad** — factor ×1,975. Ahí es
donde vive la ventaja, si existe, y es exactamente lo que el
[INTEGRACION.md](odds-engine/INTEGRACION.md) del propio motor señala como «lo
que nadie ha mirado todavía».

### 3.6 Generador: la combinada como problema de la mochila (`src/combine/generator.ts`)

El planteamiento es el acierto conceptual del módulo. Tomando logaritmos:

```
peso_i  = ln(cuota_i)                 →  ln(cuota combinada) = Σ pesos
valor_i = ln(fair_i × cuota_i) ≤ 0    →  ln(1 + EV)          = Σ valores
```

Maximizar el EV con la cuota objetivo fijada **es** una mochila con el peso
fijado. De ahí salen gratis la heurística de orden (ratio valor/peso) y una cota
superior admisible para *branch and bound*.

La poda está bien montada: ocho contadores distintos (`GeneratorStats`), corte
por alcanzabilidad con sufijos de pesos máximos precalculados, corte por cota
con holgura configurable, incompatibilidad estructural (dos salidas del mismo
mercado), límite de patas por partido, e incompatibilidad y redundancia
**comprobadas contra la rejilla**, no supuestas. Al final, eliminación de
combinadas dominadas.

### 3.7 Confianza, ranking y optimizador

`confidenceScore` es un **producto** de factores en (0,1], no una media
ponderada, y la cabecera explica por qué: con una media, un factor inservible
queda tapado por los demás. La calidad de las patas entra como media
**geométrica** — una pata pésima hunde la combinada entera, que es lo que pasa
de verdad. Correcto.

El ranking (`src/rank/index.ts`) no ordena por probabilidad. Usa la **tasa de
crecimiento logarítmico de Kelly**:

```
f* = (P·O − 1)/(O − 1)        g* = P·ln(1 + f*(O−1)) + (1−P)·ln(1 − f*)
```

`g*` vale cero sin ventaja y penaliza la varianza sin añadir ningún término a
mano. Y antes de calcularla, **encoge la probabilidad hacia el prior de
mercado** con peso `confianza/100`:

```
P_post = w·P_ajustada + (1−w)·P_prior
```

De modo que confianza cero no lleva a EV cero, lleva a EV = peaje. Eso es la
verdad, y es una decisión de diseño notablemente honesta: hace que sea
**difícil** que el motor encuentre ventaja, que es justo lo que debe pasar.

El optimizador cierra con el principio de conservadurismo: si nada pasa los
filtros, la salida es `NO EXISTE COMBINACIÓN VERDE CON SUFICIENTE CONFIANZA`.

### 3.8 Calibración (`src/calibration/`)

El único juez, y no mira ninguna cuota. Brier, log loss, diagrama de fiabilidad
con **intervalos de Wilson** (los correctos con n pequeño), descomposición de
Murphy, test Z de Spiegelhalter, tamaño de muestra necesario, y —la pregunta
directa— `checkClaim`: lo clasificado como VERDE (>85 %), ¿se cumple en esa
proporción?

Y `validateConfidence`, que es el detalle que más me gusta de todo el paquete:
agrupa por decil de confianza, mide el error de calibración en cada uno, y si el
error **no baja** al subir la confianza escribe *«el confidenceScore NO
discrimina: mientras siga así, es un número decorativo y no debe filtrar
nada»*. Un módulo que contiene la prueba de su propia inutilidad.

`clv.ts` distingue CLV bruto (contra la cuota de cierre, con margen dentro) de
CLV limpio (contra la probabilidad de cierre desmarginada) y usa el limpio solo
si lo tiene para **todos** los registros.

### 3.9 El adaptador de Flashscore (`src/adapters/flashscore.ts`)

Escrito contra el formato real. Las tres trampas están resueltas y documentadas:
la doble oportunidad suma 2; el hándicap del visitante viene con el signo
cambiado y todo se pasa a perspectiva del local; descanso/final no trae ningún
campo que lo identifique y por eso queda fuera.

Además hay un **control de margen por grupo y por casa** que caza solo los
grupos mal formados: si mezclas hándicaps de líneas distintas, el margen sale
del 138 % y el grupo se cae con motivo. Es una red de seguridad barata y eficaz.

---

## 4. Lo que el motor hace bien, resumido

1. **No inventa números.** Brent devuelve `null`, el ajuste devuelve `null`, el
   valor devuelve `SIN_REFERENCIA`. Cuando no sabe, sube la incertidumbre en vez
   de mover la probabilidad hacia donde interesa.
2. **No mide valor contra sí mismo.** `classifyValue` (`classify/index.ts:63-71`)
   con `basis: 'self'` devuelve `SIN_REFERENCIA`, no `NEGATIVO`, y explica que
   medir valor contra el propio precio desmarginado da siempre el margen
   cambiado de signo. Esta guarda vale más que la mitad del código.
3. **Dos ejes que no se mezclan.** RIESGO (probabilidad) y VALOR (precio frente
   a referencia externa). El semáforo verde del encargo mide lo primero y no
   dice nada de lo segundo, y el motor lo repite en cada comentario.
4. **La correlación se calcula, no se supone.** Y cuando no se puede, se dice.
5. **Todo umbral vive en `config/`.** Ni uno escrito a fuego en los módulos;
   `withConfig` hace *merge* profundo.
6. **Los comentarios explican el porqué, con números.** «Con cinco patas al
   −1,78 % de peaje cada una, la combinada paga −8,59 %, no −1,78 %». Eso no se
   deduce del código: es la razón de que el código exista.
7. **Los tests prueban las reglas, no la implementación.** «el ranking NO premia
   la probabilidad por sí misma», «el desempate sigue el orden de prioridades
   del encargo». Son tests de contrato.

---

## 5. Hallazgos: dónde el motor no está a la altura de su propio estándar

Nada de lo siguiente es un fallo que rompa la ejecución. Son sitios donde el
código se separa del principio que él mismo declara.

### 5.1 El filtro de ecuaciones redundantes cuenta con un `Set`, y un `Set` no cuenta

> **CORREGIDO el 16-09-2026.** `Set` → `Map<string, number>` en `pipeline.ts`, más
> un recuento de ecuaciones independientes en `fitGridFromMarkets` como defensa en
> profundidad, más dos tests de regresión. Se deja escrito el análisis porque
> explica por qué 139 tests no lo cazaron.

Es el hallazgo más serio y lo confirmé ejecutando el motor, no leyéndolo.

Antes de ajustar la rejilla, `pipeline.ts:172-181` quita salidas redundantes: en
un 1X2 desmarginado la tercera probabilidad sale de las otras dos, así que
meterla en el ajuste es una ecuación que no aporta información.

```ts
const seen = new Set<string>();                         // pipeline.ts:173
const independent = targets.filter((t) => {
  const k = `${fam}${line}`;
  const count = [...seen].filter((s) => s === k).length; // ← siempre 0 o 1
  seen.add(k);
  return count < (fam === '1X2' ? 2 : 1);
});
```

`seen` es un `Set`: por definición no guarda repetidos, así que
`[...seen].filter(s => s === k).length` vale **0 o 1, nunca 2**. La condición
`count < 2` del 1X2 se cumple siempre y **las tres salidas pasan el filtro**.
Para las demás familias (`count < 1`) el filtro sí funciona por accidente, porque
1 ya basta para cortar. Hacía falta un `Map<string, number>`, no un `Set`.

Consecuencia, comprobada con un partido que solo tiene 1X2 de Bet365 —
exactamente lo que guarda el panel:

```
rejillas ajustadas: 1
objetivos usados: 3 | rmse 0.00e+0 | errMax 0.00e+0
lambda 1.236  mu 0.848  rho 0.059
residuos: 1X2:HOME=46.0→46.0  1X2:DRAW=27.8→27.8  1X2:AWAY=26.2→26.2
```

Se ajusta una distribución de marcadores de tres parámetros a partir de **dos
números independientes**, y el motor se queda con ella. A partir de ahí:

- el régimen de esas patas es `SAME_MATCH_MODEL`, no `SAME_MATCH_BOUNDS`;
- `correlationModelled` es `true`, así que el factor de castigo `0.6` **no se
  aplica**;
- `maxAbsError` es 0, así que `factors.modelFit = exp(−0/0.02) = 1`, **la nota
  máxima**;
- y las conjuntas del mismo partido se calculan «exactas» sobre esa rejilla.

Es decir: la comprobación que debía impedir inventar precisión le está dando la
puntuación perfecta al caso en que la precisión está inventada del todo. Va
justo contra el principio que el paquete declara en su primera línea.

Mitigación parcial: el aviso *«Ajuste con exactamente 3 objetivos y 3
parámetros: el error residual será cero por construcción y no valida nada»*
(`scoreGrid.ts:178`) **sí se emite**. O sea, el motor dice la verdad en el texto
y se contradice en los números que alimentan la decisión. Y el aviso se queda
corto: no son 3 objetivos con 3 parámetros, son 2 efectivos con 3.

Arreglo, por orden de importancia:

1. Contar con un `Map<string, number>` en vez de un `Set`.
2. Exigir en `fitGridFromMarkets` que los objetivos vengan de **familias
   distintas**, no solo que sean 3: hoy `usable.length >= 3` es la única
   condición (`scoreGrid.ts:139`).
3. Cuando `targetsUsed <= parámetros`, no publicar la rejilla o publicarla con
   `converged: false`, para que el régimen caiga a `BOUNDS` y la confianza pague
   lo que debe.

Hay un test de esto pendiente: los 139 actuales no cubren el deduplicado.

### 5.2 `crossMatchCoefficient` se acepta y no se aplica a la conjunta

`jointProbability` lo pasa al contexto de correlación (`combine/index.ts:66-69`),
y `analysePair` lo usa para el informe de pares (`correlation/engine.ts:95-96`).
Pero la probabilidad conjunta se construye **multiplicando por grupos de
partido** (`combine/index.ts:100-124`) sin tocarlo. Resultado: subir
`crossMatchCoefficient` cambia el riesgo de correlación y los avisos, pero
**no cambia ni un dígito de `adjustedJointProbability`**. Quien lo configure
creerá que ha modelado el choque común (misma liga, misma jornada) y no lo ha
hecho.

Arreglo: o aplicarlo al producto entre grupos, o quitar el parámetro de
`JointProbabilityInput` y dejarlo solo en el informe, documentándolo.

### 5.3 El filtro duro de correlación es ciego justo donde hay riesgo

`optimize/index.ts:128` rechaza por `maxAbsCoefficient > 0.35`. Pero en régimen
`SAME_MATCH_BOUNDS` la conjunta se fija en `pA·pB` (`engine.ts:93`), con lo que
el coeficiente φ sale **exactamente 0** y la pareja se clasifica como `LOW`.

O sea: el filtro de correlación no puede disparar nunca en el único régimen
donde la correlación es desconocida. Lo compensan el factor
`correlationModel: 0.6` de la confianza y el ensanchamiento de la banda, que es
un empujón indirecto. Pero la lectura de `correlationRisk: 'LOW'` en una
combinada de dos patas del mismo partido sin rejilla es engañosa, y es un campo
que cualquier interfaz va a pintar.

### 5.4 `marketPrior` extrapola en silencio

> **CORREGIDO el 16-09-2026.** Nuevo `combinedMarketPrior()`: el prior de una
> combinada compone el peaje pata a pata con la banda de cada una. `rankCombination`
> lo usa cuando recibe `legOdds`, y el optimizador se las pasa siempre.

`rank/index.ts:64-68` llama a `findBand(combinedOdds)` — la tabla de bandas
medida sobre **apuestas simples de 1X2**— pasándole la **cuota combinada**.
Para una combinada de 4 patas a cuota 12,0 devuelve el peaje de la banda
4,50–8,00 o, por encima de 8, el `-0.18` de fuera de rango.

Es exactamente la extrapolación que `estimateFromSingleOdds` sí señala con un
aviso y con el doble de incertidumbre (`singleOdds.ts:116-119`). Aquí no hay ni
aviso ni penalización, y el número resultante es el ancla hacia la que se encoge
toda la probabilidad posterior — o sea, entra directamente en el ranking.

### 5.5 `Selection.confidence` no es confianza

`pipeline.ts:141-142` asigna el mismo valor a dos campos:

```ts
oddsQuality: quality.score,
confidence:  quality.score,
```

El Confidence Engine solo corre a nivel de combinada. A nivel de selección,
`confidence` es un alias de `oddsQuality`, que mide **la calidad del dato**, no
cuánto fiarse de la estimación. Un consumidor que lea `selection.confidence`
creerá tener lo que promete `confidence/index.ts` y tendrá otra cosa. O se
calcula de verdad para la pata suelta, o el campo debería llamarse distinto o
desaparecer.

### 5.6 El semáforo relativo siempre pinta un verde

`classifyCombination` en modo `RELATIVE_TO_TARGET` usa
`scale = P_ajustada / P_mejor_alcanzable`, y `bestAttainable` es el máximo
**entre las candidatas que sobrevivieron** (`optimize/index.ts:140-141`). Para
la candidata que *es* el máximo, `scale = 1 ≥ greenMin (0,85)`: **siempre**
VERDE.

El razonamiento del modo relativo es correcto y está bien argumentado (con
umbrales absolutos y cuota objetivo 2,5120 todo sale DESCARTAR por aritmética).
Pero el resultado es que el color verde pierde poder informativo: no dice «esto
es bueno», dice «esto es lo mejor de lo que hay, sea lo que sea». La mitigación
existe —`validated` exige confianza ≥ 85 y la etiqueta pasa a `VERDE NO
VALIDADO`— y el veredicto en texto dice la verdad. Aun así, cualquier interfaz
que pinte `classification.light` sin leer `validated` mentirá.

### 5.7 `compoundMargin` no usa la conjunta ajustada

`combine/index.ts:127` calcula `1 − Π(fair_i × odds_i)`: producto de fair
**independientes**. Para una combinada de patas del mismo partido con
correlación positiva fuerte, el peaje real no es ese. Existe
`exactSameMatchExpectedReturn` (`combine/index.ts:152-155`), que lo hace bien y
además respeta los `PUSH`… y **no lo llama nadie**. El optimizador ni lo
importa.

### 5.8 Código implementado, probado y desconectado

Tres piezas completas que ningún camino de ejecución alcanza:

| Pieza | Dónde | Estado |
|---|---|---|
| `checkCoherence` | `market/coherence.ts` | exportada, con tests, **sin llamantes** |
| `exactSameMatchExpectedReturn` | `combine/index.ts:152` | exportada, **sin llamantes** |
| Familia `TT` (totales de equipo) | `predicates.ts:113-120`, `pipeline.ts:69` | traducible a predicado, pero **el adaptador no la mapea** (`FAMILY`, `flashscore.ts:89-100`): nunca llega un mercado `TT` |

La de coherencia es la que más duele: es la única vía de detección de precios
mal puestos que **no necesita una segunda casa**, que es precisamente la
situación real del proyecto (solo Bet365).

### 5.9 Una sola casa da dispersión 0

Con `booksUsed === 1`, la desviación ponderada de un solo valor es 0
(`consensus/index.ts:160-164`). Ese 0 llega a `oddsQualityScore` como
«dispersión nula» → `factors.dispersion = 1`, el mejor valor posible. El mercado
no está de acuerdo consigo mismo: es que no hay mercado. Lo compensa
`factors.books = 0.55` (suelo con una sola casa), así que el resultado final no
es escandaloso, pero el factor de dispersión está premiando la ausencia de
datos. Debería ser `null` cuando `booksUsed < 2`, que el módulo de calidad ya
sabe tratar (`quality/index.ts:56`, le asigna 0,85).

### 5.10 Doble oportunidad con los umbrales del 1X2

`pipeline.ts:124-126` elige el clasificador por `market.kind`, y el adaptador
declara `DOUBLE_CHANCE` como `THREE_WAY` (`flashscore.ts:93`). Así que a un
«1X» del favorito, con fair 0,90, se le aplica `classifyThreeWay` → por encima
de `extremeMin: 0.95` no, pero cerca — y el tramo VERDE llega hasta 0,95. Para
un mercado cuyas probabilidades suman 2 y cuyo rango típico es 0,55–0,92, la
tabla de umbrales calibrada para el 1X2 no es la adecuada: casi toda doble
oportunidad razonable caerá en VERDE o EXTREMA. No es incorrecto
matemáticamente (0,90 es 0,90), pero la escala de colores deja de discriminar.

### 5.11 Detalles menores

- `validateMarket` devuelve `ok: false` con cualquier incidencia, incluidas las
  `INFO` (`validator.ts:88`). `usable` es el campo que de verdad se consulta;
  `ok` es casi siempre `false` y no lo usa nadie.
- En el adaptador, `Number(Object.keys(BOOKMAKERS).find(k => BOOKMAKERS[k] === q.bookmaker))`
  (`flashscore.ts:239-241`) hace una búsqueda lineal inversa por nombre **por
  cada cuota**. Si dos ids llegaran a compartir nombre, elige el primero. Un
  mapa nombre→id construido una vez lo arregla.
- `removeDominated` es O(n²) sobre hasta `maxResults = 5000` combinadas: 25
  millones de comparaciones en el peor caso, después de haber explorado hasta
  2.000.000 de nodos.
- `asOdds` valida; `asRaw`/`asFair`/`asConsensus`/`asAdjusted` no. Una
  comprobación de rango en modo desarrollo sería barata.

---

## 6. Rendimiento medido

| Operación | Coste |
|---|---|
| `fitGridFromMarkets` (5 objetivos, 12 arranques × Nelder-Mead 3.000 iteraciones × rejilla 13×13) | **43 ms por partido** (Node 22, esta máquina) |
| Batería completa de 139 tests | 60,5 s |
| `optimiseCombinations` | acotado por `maxNodesExplored: 2.000.000` |

43 ms por partido significa **~0,9 s para 20 partidos** en servidor. En un
navegador de móvil hay que contar entre 3 y 5 veces más. Es el dato que decide
dónde debe ejecutarse el motor; lo desarrollo en
[INTEGRACION-FRONTEND.md](INTEGRACION-FRONTEND.md).

El ajuste de la rejilla es, con diferencia, el punto caliente: 12 arranques es
una elección conservadora razonable (evita mínimos locales), pero es el
parámetro que tocar si hace falta velocidad, y hoy está escrito a fuego en
`scoreGrid.ts:150-151` — el único umbral relevante que **no** vive en `config/`.

---

## 7. Cobertura de tests

139 tests repartidos así:

| Fichero | Tests | Qué cubre |
|---|---|---|
| `devig.test.ts` | 17 | los cinco métodos, `target ≠ 1`, no convergencia |
| `correlation.test.ts` | 16 | rejilla, predicados, regímenes, Fréchet |
| `adapter.test.ts` | 14 | las tres trampas del feed, control de margen |
| `calibration.test.ts` | 14 | Wilson, Brier, Spiegelhalter, `checkClaim` |
| `consensus.test.ts` | 11 | atípicas, pesos, agregación en logit |
| `pipeline.test.ts` | 11 | orquestación completa |
| `classify.test.ts` | 10 | los dos ejes, la guarda de `self` |
| `confidence.test.ts` | 10 | producto de factores |
| `market.test.ts` | 10 | validación |
| `generator.test.ts` | 9 | mochila, podas, dominancia |
| `rank.test.ts` | 9 | Kelly, encogimiento, orden de desempate |
| `combine.test.ts` | 8 | conjunta, peaje compuesto |

Lo que **no** está cubierto, y explica que los tres hallazgos más serios hayan
sobrevivido a 139 tests:

- **el deduplicado de objetivos de `pipeline.ts`** (§5.1): ningún test
  comprueba cuántos objetivos llegan al ajuste, ni que un partido con un solo
  mercado se quede sin rejilla;
- **el efecto de `crossMatchCoefficient` sobre la conjunta** (§5.2): se prueba
  que cambia el informe de pares, no que cambie (o no) `adjustedJointProbability`;
- **`checkCoherence` conectado a algo** (§5.8): se prueba la función, no su uso;
- ninguna prueba de rendimiento ni de agotamiento del presupuesto de nodos con
  un caso grande de verdad.

Es el patrón clásico: los tests cubren muy bien cada módulo por separado y casi
nada de lo que pasa **entre** módulos, que es donde están los tres fallos.

---

## 8. Veredicto

Es un motor de una calidad muy por encima de lo normal en este dominio. La
separación de las seis magnitudes por tipos nominales, la negativa sistemática a
rellenar huecos con números inventados, el cálculo exacto de la correlación
intra-partido sobre una rejilla ajustada a las propias cuotas, el planteamiento
de la combinada como mochila con cota admisible, y un módulo de calibración que
incluye la prueba de que su propio `confidenceScore` puede ser decorativo — cada
una de esas cinco cosas es, por separado, mejor que lo que trae el software
comercial de este campo.

Los hallazgos del §5 son de tres tipos. Los de la §5.8 (código implementado y
desconectado) son deuda de cableado: el trabajo está hecho, falta llamarlo. Los
de la §5.2, §5.4 y §5.5 son más serios porque el motor se salta ahí su propia
regla —«no inventes, y si extrapolas, dilo»— precisamente en los sitios donde
nadie lo va a notar: un parámetro que no hace nada, una extrapolación silenciosa
y un campo mal nombrado. Y el de la §5.1 es de otra categoría: un descuido de
tres caracteres (`Set` donde iba `Map`) que hace que el motor **contradiga en
los números su principio fundacional**, dándole la nota máxima de ajuste a un
modelo que no tiene datos con los que ajustarse.

Prioridad de arreglo:

1. **§5.1** — `Set` → `Map<string, number>` en `pipeline.ts:173`, más la
   comprobación de familias distintas en `fitGridFromMarkets`. Es el que más
   daño hace y el más barato de arreglar. Y afecta directamente al caso de uso
   del panel, donde hoy solo hay 1X2.
2. **§5.4** (`marketPrior` extrapolando en silencio) — entra directamente en el
   ranking y contamina toda decisión.
3. **§5.2** (`crossMatchCoefficient` inerte) — un parámetro que miente sobre lo
   que hace es peor que no tenerlo.

Y, en cuanto haya presupuesto, **§5.8**: conectar `checkCoherence`. Es ventaja
disponible hoy, con los datos que ya hay, sin pagar una segunda casa.

Y la conclusión que el propio motor repite y conviene no olvidar: con lo medido
en este proyecto, lo que va a responder casi siempre es
`NO EXISTE COMBINACIÓN VERDE CON SUFICIENTE CONFIANZA`. Eso no es un fallo del
motor. Es el motor funcionando.
