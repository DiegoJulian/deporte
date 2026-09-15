/* Cuota Justa · js/motor.js
   Cliente del motor `odds-engine`, que corre en servidor.mjs (POST /api/analisis).

   POR QUE EL MOTOR NO VIVE AQUÍ DENTRO. El paquete compilado es ESM puro y no usa
   ninguna API de Node, así que el navegador podría cargarlo tal cual. Pero ajustar
   la distribución de marcadores cuesta unos 43 ms por partido, y una jornada de 20
   en un móvil son varios segundos con la pantalla congelada. Se pide al servidor,
   que además puede cachear por contenido de la base.

   QUÉ CAMBIA RESPECTO A LAS CUENTAS DEL PANEL. `analizar()` (js/02-motor.js) quita
   el margen y ya. El motor, además: mide la calidad del dato, etiqueta de dónde
   sale cada probabilidad, calcula la conjunta de una combinada teniendo en cuenta
   la correlación en vez de multiplicar, compone el peaje pata a pata con la tabla
   de bandas medida, y solo entonces decide si hay ventaja. Es bastante más
   estricto, y por eso casi siempre dirá que no hay nada.

   Sin servidor (index.html con doble clic) `disponible` queda en false y la pestaña
   Apuestas se queda con sus cuentas de siempre.

   Script clásico (no módulo): comparte el ámbito global con los demás. */
"use strict";

const MOTOR = {
  /** null = todavía no se ha preguntado; true/false = respuesta de /api/estado. */
  disponible: null,
  /** Por qué no está, si no está. */
  fallo: null,
  /** Clave de lo que hay en `datos`. */
  servida: null,
  /** Clave de lo que se está pidiendo ahora mismo. */
  pidiendo: null,
  /** La última respuesta del motor. */
  datos: null,
  /** Último error de red o del motor. */
  error: null
};

/* La clave identifica UNA pregunta: la cuota que necesita la etapa más el estado
   exacto del mercado. Si cambia cualquiera de las dos, la respuesta guardada ya no
   sirve; si no cambia ninguna, no se vuelve a preguntar. Es lo que impide que el
   repintado dispare una petición detrás de otra. */
function claveMotor(objetivo){
  const firma = (S.market || [])
    .map(e => [e.id, e.actualizado || '', e.comienza || '', (e.casas || []).map(c => c.join('·')).join(';')].join('|'))
    .sort()
    .join('\n');
  return Number(objetivo).toFixed(4) + '@@' + firma;
}

async function comprobarMotor(){
  if (MOTOR.disponible !== null) return MOTOR.disponible;
  if (!(location.protocol === 'http:' || location.protocol === 'https:')){
    MOTOR.disponible = false;
    MOTOR.fallo = 'La página está abierta como archivo, sin servidor.';
    return false;
  }
  try {
    const r = await fetch(new URL('api/estado', location.href), { cache: 'no-store' });
    const e = await r.json();
    MOTOR.disponible = !!(e && e.motor);
    MOTOR.fallo = e && e.motorFallo ? e.motorFallo : (MOTOR.disponible ? null : 'El servidor no trae el motor.');
  } catch (err) {
    MOTOR.disponible = false;
    MOTOR.fallo = 'No contesta servidor.mjs.';
  }
  return MOTOR.disponible;
}

/* Pide el análisis de la cuota `objetivo`. No devuelve nada: cuando llega la
   respuesta, la guarda y repinta. Llamarla varias veces con la misma pregunta no
   hace nada, que es justo lo que hace falta al colgarla de un render. */
async function pedirAnalisis(objetivo){
  if (!(await comprobarMotor())) return;
  const clave = claveMotor(objetivo);
  if (MOTOR.servida === clave || MOTOR.pidiendo === clave) return;

  MOTOR.pidiendo = clave;
  MOTOR.error = null;
  try {
    const r = await fetch(new URL('api/analisis', location.href), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ targetOdds: Number(objetivo), bookmaker: 'Bet365', universe: 'top', horizonHours: 72 })
    });
    const cuerpo = await r.json();
    if (!r.ok){
      MOTOR.error = (cuerpo && cuerpo.detalle) || ('error ' + r.status);
      MOTOR.datos = null;
    } else {
      MOTOR.datos = cuerpo;
      MOTOR.error = null;
    }
    MOTOR.servida = clave;
  } catch (err) {
    MOTOR.error = 'No se pudo hablar con el servidor.';
    MOTOR.datos = null;
    MOTOR.servida = clave;
  } finally {
    if (MOTOR.pidiendo === clave) MOTOR.pidiendo = null;
    if (typeof renderRutas === 'function') renderRutas();
  }
}

/* Una respuesta guardada solo vale para la pregunta que se le hizo. */
const analisisVigente = objetivo =>
  (MOTOR.datos && MOTOR.servida === claveMotor(objetivo)) ? MOTOR.datos : null;

/* --- traducciones de las claves del motor a lo que se lee en pantalla --- */

// El eje de RIESGO es monótono en la cuota: VERDE quiere decir «cuota corta», NO
// «buena apuesta». Se escribe con esas palabras a propósito, para que nadie lea un
// verde en una columna de cuotas y entienda «apuesta aquí».
const RIESGO_ES = {
  MUY_BAJA: 'Muy poco probable',
  ROJO:     'Poco probable',
  NEUTRAL:  'Intermedia',
  AMARILLO: 'Probable',
  VERDE:    'Muy probable',
  EXTREMA:  'Probabilidad extrema · revisar la cuota'
};

const VALOR_ES = {
  SIN_REFERENCIA: 'Sin referencia externa',
  NEGATIVO:       'Valor negativo',
  NEUTRO:         'Valor indistinguible de cero',
  POSITIVO:       'Valor positivo',
  SOSPECHOSO:     'Valor sospechosamente alto · revisar el dato'
};

const ORIGEN_ES = {
  RAW_ODDS:               '1/cuota, con el margen dentro',
  RAW_ODDS_BAND_ADJUSTED: '1/cuota corregida por el peaje medido de su banda',
  FAIR_SINGLE_BOOK:       'mercado completo de una casa, desmarginado',
  MARKET_CONSENSUS:       'consenso de varias casas desmarginadas',
  SCORE_MODEL:            'distribución de marcadores ajustada a las cuotas'
};

const CORREL_ES = { LOW: 'baja', MEDIUM: 'media', HIGH: 'alta', EXTREME: 'extrema' };
