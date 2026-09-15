# Cuota Justa

Panel de cuotas de Bet365 con cuatro pestañas:

- **Mercado**: los partidos del día y cuánto se ha movido cada cuota desde la apertura.
- **Apuestas**: la ruta de 10 € a 1.000 € en 5 apuestas.
- **Resultados**: lee la captura de un boleto y lo apunta.
- **Calculadora**: el paso agresivo con la cuota ya fijada.

Es el mismo panel que está publicado en claude.ai, pasado a archivos normales para que funcione en cualquier ordenador.

## Arrancar

Necesitas [Node.js](https://nodejs.org) 18 o superior. No hay que instalar nada más.

```
node servidor.mjs
```

Después abre **http://localhost:8787**.

| Si quieres… | Haz esto |
|---|---|
| Leer boletos (pestaña Resultados) | Copia `ejemplo.env` con el nombre `.env`, pon tu `ANTHROPIC_API_KEY` y reinicia el servidor. Cada lectura se cobra en tu cuenta de Anthropic. |
| Usar otro puerto | Pon `PORT=8788` en `.env`. |
| Verlo sin servidor | Abre `index.html` con doble clic. Funciona en OFFLINE con lo guardado en ese navegador, pero no recibe cuotas ni lee boletos. |
| Empezar de cero | Para el servidor y borra `datos/base.json`. |

## Cargar cuotas

El panel no sale a buscar cuotas: pinta lo que hay en su base. Mientras no cargues nada, el Mercado enseña **datos de ejemplo** y lo avisa arriba.

### Lo más rápido: escribirlas en texto

`capturar-cuotas.mjs` convierte cuotas escritas a mano en el JSON de carga, y de
paso comprueba el margen y la coherencia **mientras todavía tienes la casa
abierta en el navegador**, que es el único momento en que puedes corregir un
error de tecleo.

```
node capturar-cuotas.mjs --ejemplo                 # el formato, con ejemplos
node capturar-cuotas.mjs cuotas.txt                # → datos/captura-<fecha>.json
node cargar-cuotas.mjs datos/captura-*.json
```

Un `cuotas.txt` es esto:

```
LIGA España - LaLiga
Real Sociedad - Atlético de Madrid   20/09 21:00
1X2  3.40 3.60 2.05
DC   1.84 1.32 1.35
DNB  2.60 1.52

Arsenal - Everton   21/09 16:00
1X2  1.58 4.10 6.20
```

`LIGA` y `DEPORTE` son opcionales y se pegan hasta que escribas otra. La fecha
admite `20/09 21:00`, `2026-09-20T21:00`, `hoy 21:00` y `mañana 16:30`.

Lo que **avisa** antes de que cargues nada:

- margen del 1X2 fuera de lo que cotiza Bet365 (4-6 %): normalmente es un dígito
  cambiado;
- doble oportunidad que suma menos del 200 %, que el motor descartaría entera;
- 1X2 y doble oportunidad o empate no válido que **no cuadran entre sí**.

Ese último no siempre es un error de tecleo: puede ser el precio mal puesto que
buscas. Por eso conviene copiar los tres mercados **de la misma lectura** — si
copias el 1X2 a las 18:00 y la doble oportunidad a las 18:05 con la línea
movida, saldrá un desajuste que no existe.

Y lo que **no** puede cazar: un 3,40 tecleado como 3,45 deja el margen normal y
no hay forma de verlo mirando cuotas. Contra eso, el control de coherencia.

### A mano, o desde otro programa

```
node cargar-cuotas.mjs mis-cuotas.json             # carga
node cargar-cuotas.mjs mis-cuotas.json --simular   # solo comprueba, no escribe
```

El formato es este (hay una plantilla en `datos/plantilla-cuotas.json`):

```json
{
  "mercado": [
    {
      "deporte": "Fútbol",
      "liga": "España - LaLiga",
      "local": "Real Sociedad",
      "visitante": "Atlético de Madrid",
      "comienza": "2026-09-20T21:00",
      "tipo": "1x2",
      "casas": [["Bet365", 3.40, 3.60, 2.05]],
      "apertura": [3.20, 3.70, 2.10]
    }
  ]
}
```

| Campo | Qué va |
|---|---|
| `deporte` | Exactamente `Fútbol`, `Baloncesto` o `League of Legends` para que salga con su botón. Los demás (tenis, etc.) también entran y se ven con «Ver todos». |
| `liga` | Tiene que contener el nombre de la competición para que funcione su filtro: LaLiga, Premier League, Serie A, Bundesliga, Ligue 1, Primeira Liga, Eredivisie, Champions League, Europa League, Conference League, NBA, LEC, Superliga, LFL o Prime League. |
| `comienza` | Hora local sin zona (`2026-09-20T21:00`) o con zona (`2026-09-20T19:00:00Z`). No pongas la hora UTC sin la `Z`, porque saldría desplazada. |
| `tipo` | `1x2`, o `2v` si solo hay dos resultados (tenis, NBA…). En `2v` la cuota del medio va a `0`. |
| `casas` | `[["Bet365", cuota 1, cuota X, cuota 2]]`, en decimal y con punto. |
| `dobleOportunidad` | Opcional. `[["Bet365", cuota 1X, cuota 12, cuota X2]]`. Solo en `1x2`. |
| `empateNoValido` | Opcional. `[["Bet365", cuota 1, cuota 2]]`. Solo en `1x2`. |
| `apertura` | Opcional. La cuota de apertura, que es la referencia del % de movimiento. Si falta, se compara con la primera lectura cargada. |
| `id` | Opcional. Si no lo pones, se saca de los equipos y el día. |
| `actualizado` | Opcional. Cuándo se copiaron las cuotas (si no lo pones, se toma la hora de la carga). Un partido ya empezado no enseña cuotas copiadas antes del comienzo. |
| `marcador`, `reloj`, `relojT` | Opcionales, para partidos en juego: `[2, 1]`, `"63:10"` y la hora a la que se copiaron. El reloj no avanza solo. |

Si cargas otra vez un partido que ya está (mismo `id`, o mismos equipos el mismo día), no se duplica: la lectura nueva se añade a su `historial`. Con `--reemplazar`, en la base se queda solo lo que venga en el archivo.

La tabla de la NBA (sale al elegir Baloncesto) se carga en el mismo archivo, con `"nba"`: un objeto por equipo con el `id` de stats.nba.com y los campos `equipo`, `g`, `v`, `d`, `ortg`, `drtg`, `netrtg` y `pace`. Añade también `"nbaMeta": {"temporada": "2026-27"}`.

## Qué hay dentro

```
index.html            la página
css/panel.css         el aspecto, con tema claro y oscuro
js/claude-local.js    hace de window.claude (lo que daba claude.ai) hablando con servidor.mjs
js/motor.js           pide los análisis al motor y traduce sus etiquetas
js/01…13-*.js         la lógica, por partes, cargada en ese orden
servidor.mjs          sirve la página, guarda la base, lee los boletos y corre el motor
capturar-cuotas.mjs   pasa cuotas escritas en texto al JSON de carga
cargar-cuotas.mjs     mete cuotas en la base
odds-engine/          el motor de probabilidad y combinadas (TypeScript, se compila)
datos/                la base (base.json, se crea sola) y la plantilla
original/             el HTML tal como está publicado en claude.ai, en un solo archivo
```

Todo es JavaScript sin compilar y sin dependencias. Las fórmulas (quitar el margen, EV, Kelly, cuota por etapa) están en `01-nucleo.js`, `02-motor.js` y `11-apuestas.js`, y los comentarios del código explican el porqué de cada decisión.

Si quieres cargar datos desde tu propio programa, estas son las rutas del servidor:

| Ruta | Qué hace |
|---|---|
| `GET /api/estado` | Dice si la lectura de boletos está activa y con qué modelo. |
| `GET /api/db/<colección>` | Devuelve todos los documentos. |
| `GET` · `PUT` · `DELETE /api/db/<colección>/<id>` | Lee, sustituye entero o borra un documento. |
| `POST /api/db/<colección>` | Lote: `{"set": [{"id", "data"}], "borrar": [ids], "reemplazar": false}`. |
| `GET /api/eventos` | Avisa de los cambios al instante (Server-Sent Events). |
| `POST /api/leer` | Lee un boleto: `{"prompt", "images": [{"media_type", "data"}]}` → `{"json"}`. |
| `POST /api/analisis` | Pasa el mercado por el motor: `{"targetOdds": 2.5120}` → selecciones, combinadas y veredicto. |

Las colecciones son `mercado`, `apuestas`, `rutas`, `nba` y `config` (con el documento `panel`).

## El motor

La pestaña **Apuestas** ya no propone «las tres cuotas más cercanas a la que hace
falta». Las candidatas las calcula `odds-engine/`, que aplica reglas bastante más
duras: calidad del dato, de dónde sale cada probabilidad, correlación entre patas,
confianza, peaje compuesto y ventaja real de Kelly. Y propone **combinadas**, no
solo apuestas simples, con la probabilidad conjunta calculada en vez de
multiplicada.

Para encenderlo, una vez:

```
cd odds-engine && npm install && npm run build
```

Sin ese paso el panel arranca igual y la pestaña Apuestas se queda con sus cuentas
de siempre; `GET /api/estado` dice si el motor está (`"motor": true`).

El motor corre en `servidor.mjs`, no en el navegador: ajustar la distribución de
marcadores cuesta unos 43 ms por partido y en un móvil eso son segundos de
pantalla congelada. La respuesta se cachea por contenido de la base.

**Va a decir que no casi siempre.** Con una sola casa cargada, la confianza no
llega al mínimo de 50 y ninguna candidata pasa los filtros. Eso no es un fallo: es
que con el precio de Bet365 y nada más no se puede demostrar ventaja. Lo que sí
hace es decir **por qué**, candidata a candidata, y qué haría falta cargar:

| Si cargas… | Se enciende |
|---|---|
| **doble oportunidad y empate no válido** | ✅ **ya está**: detección de precios mal puestos sin necesidad de otra casa |
| más de / menos de y ambos marcan | el modelo de marcadores: correlación calculada, no acotada |
| una segunda casa | el eje de valor entero (consenso, dispersión, EV) |
| la cuota de cierre | el CLV, que es lo que antes dice si una estrategia vale |

### Precios que no cuadran

Si cargas `dobleOportunidad` o `empateNoValido`, el motor los contrasta contra
el 1X2 de la misma casa. Las tres son la misma distribución escrita de tres
formas:

```
DC(1X) = P(1) + P(X)        DC(12) = P(1) + P(2)       DC(X2) = P(X) + P(2)
DNB(1) = P(1) / (P(1) + P(2))
```

Si no dan lo mismo, una está mal cotizada, y la pestaña Apuestas lo enseña con
cuánto se separan y de qué lado cae. **Es lo único de este panel que puede
encontrar algo con una sola casa**: no compara Bet365 contra otra casa, compara
Bet365 contra sí misma.

Dos avisos que van en pantalla y conviene repetir aquí:

- **Es una señal, no una apuesta.** Que dos precios no cuadren dice que uno está
  mal, no cuál. Apostar el generoso supone que el 1X2 es el correcto.
- **Cargar estos dos mercados NO mejora el modelo de marcadores.** Al ser la
  misma información escrita de otra forma, entre los tres no pasan de dos
  ecuaciones independientes, y la rejilla tiene tres parámetros. Para eso hacen
  falta familias de verdad distintas: más de/menos de, ambos marcan, hándicaps.

## Diferencias con la versión de claude.ai

- La base y la lectura de boletos las pone `servidor.mjs`, con tu clave, en lugar de la plataforma. El código del panel es el mismo, porque `claude-local.js` le ofrece la misma `window.claude.use()`.
- ONLINE significa «conectado a servidor.mjs».
- La ventana de APIs describe el servidor local, y Flashscore sale como «no incluida»: este paquete no trae ningún cargador de cuotas de terceros.
- Los avisos que mandaban a claude.ai ahora mandan al servidor.
- Va vacío: no lleva cuotas ni apuestas.

## Avisos

- Apostar tiene valor esperado negativo, y el propio panel lo calcula en cada ruta. Si necesitas ayuda: [jugarbien.es](https://www.jugarbien.es/).
- Bet365 no publica ninguna API. Las cuotas que cargues son cosa tuya y de la fuente de la que salgan, así que respeta sus condiciones.
- El servidor no tiene contraseña. De fábrica solo escucha en tu ordenador; no lo arranques con `HOST=0.0.0.0` en una red en la que no confíes.
