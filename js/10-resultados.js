/* Cuota Justa · js/10-resultados.js
   Pestaña Resultados: lectura del recorte de Bet365 con Claude (window.claude.use("sample")), revisión y guardado.
   Script clásico (no módulo): comparte el ámbito global con los demás y se carga en
   el orden de index.html. */
"use strict";
/* ===================== SUBIR UNA APUESTA: EL RECORTE DE BET365 =====================
   Desde el 13-09-2026 esta es la ÚNICA manera de meter una apuesta en el registro:
   se arrastra, se sube o se pega una imagen del boleto y Claude la lee. Se quitaron
   el formulario manual, los filtros, la tabla y el CSV — y con ellos el envío de una
   cuota desde el Mercado, que era lo que rellenaba aquel formulario.

   La imagen NO se archiva en ninguna parte: viaja a Claude para leerla y se descarta.
   En la base queda la apuesta en números, con sus patas y qué acertó y qué falló.

   Lo que hay que saber del boleto, escrito contra los dos recortes reales que mandó
   Diego (una combinada perdida de cuatro patas y una simple ganada):
   · Arriba a la izquierda, importe y tipo: «10,00€ Crear apuesta +», «15,10€ Simple».
   · Arriba a la derecha, la etiqueta del resultado: GANADOR / Perdida / Anulada.
   · Cada pata lleva tick verde (acertada), X roja (fallada) o círculo gris (sin
     resolver). Una pata «Crear apuesta» tiene cuota propia y dentro varias
     selecciones, cada una con su tick o su X.
   · Las de jugador llevan una barra: lo conseguido y la línea. 1 sobre 1.5.
   · Al pie, «Imp:» es el importe y «Ganancias» el RETORNO TOTAL, no el beneficio:
     un boleto de 15,10 € a 1,83 devolvió 27,69 €, y ese número manda sobre el
     producto de las cuotas.                                                        */

const ESTADOS = { pendiente:['Pendiente','warn'], ganada:['Ganada','pos'], perdida:['Perdida','neg'], nula:['Nula / devuelta','mute'], cobrada:['Cobrada','pos'] };
const TIPOS = { simple:'Apuesta simple', combinada:'Combinada', 'crear-apuesta':'Crear apuesta' };

const PROMPT_BOLETO = `Eres un lector de boletos de apuestas de bet365 España. La imagen (o las imágenes, si son trozos del mismo boleto) es el recorte de UNA sola apuesta. Devuelve SOLO un objeto JSON, sin ninguna explicación.

CÓMO SE LEE UN BOLETO DE BET365
· Arriba a la izquierda van el importe y el tipo de apuesta: «10,00€ Crear apuesta +», «15,10€ Simple», «20,00€ Combinada», «Doble», «Triple».
· Arriba a la derecha hay una etiqueta con el resultado global: «GANADOR» (ganada), «Perdida», «Anulada» o «Devuelta» (nula), «Cobro anticipado» (cobrada). Si no hay etiqueta, la apuesta está pendiente.
· Cada pata lleva un icono redondo a su izquierda: VERDE con un tick = acertada; ROJO con una X = fallada; GRIS liso = todavía sin resolver.
· Una pata puede ser «CREAR APUESTA» (Bet Builder): lleva su propia cuota al lado y dentro varias selecciones, cada una con su tick verde o su X roja.
· Debajo de cada selección, en gris y más pequeño, va el nombre del mercado: «Resultado final», «Paradas del portero - Otras opciones», «Jugador - Remates a puerta», «Encuentro - Ganador - 2 opciones».
· Las selecciones de jugador llevan una barra de progreso: el número dentro de la píldora de color es lo CONSEGUIDO y el número suelto a la derecha es la LÍNEA. «1» con línea «1.5» quiere decir que pedía 2 y se quedó en 1.
· Después de las selecciones viene el partido: los dos equipos, uno por línea, con su marcador a la derecha. Cuando todavía no hay marcador puede venir en una sola línea, «Team Vitality v Movistar KOI».
· Al pie: «Imp:» es el importe jugado y «Ganancias» es el RETORNO TOTAL que devolvió la casa, NO el beneficio. En una apuesta perdida pone 0,00€.
· Las etiquetas verdes tipo «2 GOLES DE VENTAJA» o «RECIBIDO» son promociones de la casa: apúntalas en notas de esa selección, pero no cambian su estado.
· Las cuotas se escriben con punto (1.83, 2.37, 1.071) y el dinero con coma (15,10€).

DEVUELVE EXACTAMENTE ESTA FORMA
{"tipo":"simple|combinada|crear-apuesta","importe":10,"moneda":"€","estado":"ganada|perdida|nula|cobrada|pendiente","retorno":0,"cuotaTotal":null,"fecha":null,"patas":[{"cuota":2.37,"estado":"ganada|perdida|pendiente|nula","evento":"Manchester United - Manchester City","marcador":"0-1","deporte":"Fútbol","competicion":null,"selecciones":[{"seleccion":"Resultado final: Manchester City","mercado":"Resultado final","estado":"ganada","conseguido":null,"linea":null,"notas":null}]}]}

REGLAS
· Los números van sin símbolo de moneda y con punto decimal.
· Lo que no se vea en la imagen va a null. No inventes nada.
· cuotaTotal solo si el boleto la escribe en alguna parte; si no, null.
· Una apuesta Simple es una sola pata con una sola selección dentro.
· Una pata «Crear apuesta» está perdida en cuanto falla una sola de sus selecciones; ganada solo si todas acertaron; pendiente si alguna sigue sin resolver y ninguna ha fallado.
· fecha en formato AAAA-MM-DD, y solo si el recorte la trae; si no, null.
· Si varias imágenes son trozos del mismo boleto, únelos en un único JSON.
· Si esto no es un boleto de apuestas, devuelve {"error":"no es un boleto"}.`;

/* ---------------- la capacidad de lectura ----------------
   `db` arranca sola porque no gasta nada del visor. `sample` no: se paga con la
   cuenta de Claude de quien mira la página, así que necesita un permiso, y mientras
   no esté dado `claude.use('sample')` devuelve null — igual que si el visor no la
   sirviera. Por eso el panel pregunta primero por el permiso (`permissions.state`,
   que no abre ningún diálogo) y solo pide el consentimiento cuando Diego hace algo
   con la zona: pulsar, soltar o pegar. Un diálogo al abrir el panel para mirar el
   Mercado sería una molestia gratuita.

   Y cuando no se puede leer, la zona dice cuál de los tres motivos es. Antes los
   tres daban el mismo mensaje y no había manera de saber qué fallaba.              */
let PERMISOS = null, PERMPEDIDO = false;
let LECTOR = null, LIMIMG = null, LECTORLISTO = false, MOTIVO = 'comprobando', PERMEST = '?';

const hayClaude = () => !!(window.claude && window.claude.use);

async function permisos(){
  if (PERMISOS) return PERMISOS;
  if (!hayClaude()) return null;
  try { PERMISOS = await window.claude.use('permissions'); } catch (e) { PERMISOS = null; }
  return PERMISOS;
}

async function estadoPermiso(){
  const p = await permisos();
  if (!p) return 'desconocido';
  try { return await p.state('sample'); } catch (e) { return 'desconocido'; }
}

// use() está memoizado cuando la capacidad sí se sirve, pero devuelve null sin
// identidad estable cuando no; volver a llamarlo después de un permiso concedido es
// la manera de recogerla.
async function resolverLector(){
  if (LECTOR && LIMIMG) return true;
  if (!hayClaude()) return false;
  if (!LECTOR){
    try { LECTOR = await window.claude.use('sample'); } catch (e) { LECTOR = null; }
  }
  if (LECTOR && !LIMIMG){
    try { const l = await LECTOR.limits(); LIMIMG = (l && l.images) ? l.images : null; } catch (e) { LIMIMG = null; }
  }
  const f = $('#ficha');
  if (f && LIMIMG && LIMIMG.mediaTypes && LIMIMG.mediaTypes.length) f.accept = LIMIMG.mediaTypes.join(',');
  return !!(LECTOR && LIMIMG);
}

/* pedir = true solo cuando Diego ha hecho algo: entonces sí se abre el diálogo. */
async function asegurarLector(pedir){
  if (LECTOR && LIMIMG){ MOTIVO = 'ok'; return 'ok'; }
  PERMEST = await estadoPermiso();
  if (PERMEST === 'prompt' && pedir){
    const p = await permisos();
    if (p){
      PERMPEDIDO = true;
      try { const r = await p.request(['sample']); if (r && r.sample) PERMEST = r.sample; } catch (e) {}
    }
  }
  if (PERMEST !== 'denied' && PERMEST !== 'unavailable') await resolverLector();
  MOTIVO = (LECTOR && LIMIMG) ? 'ok'
    : PERMEST === 'denied' ? 'denegado'
    : PERMEST === 'prompt' ? 'falta-permiso'
    : (LECTOR && !LIMIMG) ? 'sin-imagenes'
    : 'sin-capacidad';
  LECTORLISTO = true;
  pintarLector(); pintarEstadoApis();
  return MOTIVO;
}

const TEXTO_MOTIVO = {
  'falta-permiso': 'Leer el recorte lo hace Claude con tu cuenta, y para eso hace falta tu permiso. Pulsa «Permitir la lectura» — o suelta el recorte directamente y te lo pedirá al vuelo.',
  'denegado': 'Has dicho que no al permiso en esta carga de la página. Recarga el panel y vuelve a pedirlo.',
  'sin-imagenes': 'El lector está disponible pero no acepta imágenes. Revisa la configuración de servidor.mjs.',
  'sin-capacidad': 'Leer el recorte necesita servidor.mjs arrancado con una clave de Anthropic (ANTHROPIC_API_KEY) y el panel abierto desde la dirección que enseña al arrancar. Lo explica el LEEME.'
};
const TEXTO_ZONA = 'También vale pegarlo con Ctrl+V desde cualquier parte del panel, o soltarlo en cualquier sitio de esta página. Una imagen, una apuesta.';

function pintarLector(){
  const z = $('#drop'); if (!z) return;
  const bien = MOTIVO === 'ok';
  z.dataset.off = (LECTORLISTO && !bien) ? '1' : '0';

  const sub = $('#dropSub');
  if (sub){
    if (!LECTORLISTO || bien) sub.innerHTML = 'También vale pegarlo con <kbd>Ctrl</kbd>+<kbd>V</kbd> desde cualquier parte del panel, o soltarlo en cualquier sitio de esta página. Una imagen, una apuesta.';
    else sub.textContent = TEXTO_MOTIVO[MOTIVO] || TEXTO_ZONA;
  }

  const perm = $('#permitir');
  if (perm) perm.hidden = !(LECTORLISTO && MOTIVO === 'falta-permiso');

  const diag = $('#dropDiag');
  if (diag){
    diag.hidden = !LECTORLISTO || bien;
    diag.textContent = 'permiso: ' + PERMEST + ' · lector: ' + (LECTOR ? 'sí' : 'no') + ' · imágenes: ' + (LIMIMG ? 'sí' : 'no');
  }
}

// Al abrir, solo se MIRA el permiso: nunca se abre un diálogo sin que Diego lo pida.
(async () => {
  PERMEST = await estadoPermiso();
  if (PERMEST === 'granted' || PERMEST === 'desconocido') await resolverLector();
  LECTORLISTO = true;
  MOTIVO = (LECTOR && LIMIMG) ? 'ok'
    : PERMEST === 'prompt' ? 'falta-permiso'
    : PERMEST === 'denied' ? 'denegado'
    : (LECTOR && !LIMIMG) ? 'sin-imagenes'
    : 'sin-capacidad';
  pintarLector();
  pintarEstadoApis();
})();

/* ---------------- números, fechas y estados tal como los escribe la casa ---------------- */
// Con coma, la coma es el decimal y el punto separa miles («1.083,50»). Sin coma, el
// punto es el decimal — y puede llevar tres: «1.071» es una cuota, no mil setenta y uno.
function numeroDe(v){
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let t = String(v).replace(/[^\d.,-]/g, '');
  if (!t) return null;
  t = t.indexOf(',') >= 0 ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = parseFloat(t);
  return isFinite(n) ? n : null;
}

function fechaValida(v){
  const t = String(v == null ? '' : v).trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const es = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (es){
    const a = es[3].length === 2 ? '20' + es[3] : es[3];
    return a + '-' + String(es[2]).padStart(2, '0') + '-' + String(es[1]).padStart(2, '0');
  }
  return null;
}

const EST_OK = ['ganada', 'perdida', 'nula', 'pendiente', 'cobrada'];
function estadoDe(v){
  const t = String(v == null ? '' : v).toLowerCase();
  if (/cobr|cash/.test(t)) return 'cobrada';
  if (/perd|fall|lost|lose/.test(t)) return 'perdida';
  if (/gana|winner|acert|won/.test(t)) return 'ganada';
  if (/anul|devuel|nula|void|push/.test(t)) return 'nula';
  return 'pendiente';
}

/* ---------------- de lo que devuelve Claude a un boleto del panel ---------------- */
function normalizarBoleto(d){
  if (!d || typeof d !== 'object' || Array.isArray(d) || d.error) return null;
  const brutas = Array.isArray(d.patas) ? d.patas : [];
  if (!brutas.length) return null;

  const patas = brutas.map(p => {
    p = p || {};
    const sel = (Array.isArray(p.selecciones) ? p.selecciones : []).map(x => ({
      seleccion: String((x && x.seleccion) || '').trim(),
      mercado: x && x.mercado ? String(x.mercado).trim() : '',
      estado: estadoDe(x && x.estado),
      conseguido: numeroDe(x && x.conseguido),
      linea: numeroDe(x && x.linea),
      notas: x && x.notas ? String(x.notas).trim() : ''
    })).filter(x => x.seleccion);
    // Una pata de «Crear apuesta» cae entera con que falle una sola de sus selecciones.
    let est = estadoDe(p.estado);
    if (sel.length){
      if (sel.some(x => x.estado === 'perdida')) est = 'perdida';
      else if (sel.every(x => x.estado === 'ganada')) est = 'ganada';
      else if (est === 'ganada') est = 'pendiente';
    }
    return {
      cuota: numeroDe(p.cuota),
      estado: est,
      evento: p.evento ? String(p.evento).trim() : '',
      marcador: p.marcador ? String(p.marcador).trim() : '',
      deporte: p.deporte ? String(p.deporte).trim() : '',
      competicion: p.competicion ? String(p.competicion).trim() : '',
      selecciones: sel
    };
  }).filter(p => p.selecciones.length || p.evento || p.cuota);
  if (!patas.length) return null;

  // El estado global lo dice la etiqueta de arriba; si no la hay, lo dicen las patas.
  let estado = estadoDe(d.estado);
  if (!d.estado){
    if (patas.some(p => p.estado === 'perdida')) estado = 'perdida';
    else if (patas.every(p => p.estado === 'ganada')) estado = 'ganada';
    else estado = 'pendiente';
  }

  // La cuota total casi nunca sale escrita en el boleto: se multiplican las patas.
  let cuota = numeroDe(d.cuotaTotal), calculada = false;
  if (!(cuota > 1)){
    const cs = patas.map(p => p.cuota).filter(c => c > 1);
    if (cs.length && cs.length === patas.length){ cuota = cs.reduce((a, c) => a * c, 1); calculada = true; }
    else cuota = null;
  }

  const tipo = patas.length > 1 ? 'combinada'
    : (patas[0].selecciones.length > 1 ? 'crear-apuesta' : 'simple');

  return {
    tipo, estado: EST_OK.indexOf(estado) >= 0 ? estado : 'pendiente',
    importe: numeroDe(d.importe),
    retorno: numeroDe(d.retorno),
    cuota: cuota ? Math.round(cuota * 1000) / 1000 : null,
    cuotaCalculada: calculada,
    fecha: fechaValida(d.fecha) || new Date().toISOString().slice(0, 10),
    patas
  };
}

function contarSelecciones(b){
  let ok = 0, ko = 0, pe = 0;
  b.patas.forEach(p => {
    (p.selecciones.length ? p.selecciones : [{ estado: p.estado }]).forEach(x => {
      if (x.estado === 'ganada') ok++; else if (x.estado === 'perdida') ko++; else pe++;
    });
  });
  return { ok, ko, pe };
}

function beneficioDe(b){
  if (b.estado === 'pendiente') return null;
  if (b.importe == null) return null;
  if (b.retorno != null) return b.retorno - b.importe;
  if (b.estado === 'perdida') return -b.importe;
  if (b.estado === 'nula') return 0;
  if (b.cuota > 1) return b.importe * (b.cuota - 1);
  return null;
}

/* ---------------- la cola de lecturas ---------------- */
const LECTS = new Map();
let nLect = 0;

async function procesarFicheros(files){
  const lista = Array.from(files || []).filter(f => /^image\//.test(f.type || ''));
  if (!lista.length) return;
  const tab = $('#tab-registro');
  if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click();

  // Soltar el recorte es la señal de que quiere leerlo: aquí sí se pide el permiso.
  const m = await asegurarLector(true);
  if (m !== 'ok'){
    const id = 'l' + (++nLect);
    LECTS.set(id, { id, estado: 'error', msg: TEXTO_MOTIVO[m] || TEXTO_MOTIVO['sin-capacidad'] });
    pintarLecturas(); return;
  }
  lista.slice(0, 6).forEach(f => leerRecorte(f));
}

async function leerRecorte(file){
  const id = 'l' + (++nLect);
  LECTS.set(id, { id, estado: 'leyendo' });
  pintarLecturas();

  if (!LECTOR || !LIMIMG){
    LECTS.set(id, { id, estado: 'error', msg: TEXTO_MOTIVO[MOTIVO] || TEXTO_MOTIVO['sin-capacidad'] });
    pintarLecturas(); return;
  }
  if (LIMIMG.maxInputBytes && file.size > LIMIMG.maxInputBytes){
    LECTS.set(id, { id, estado: 'error', msg: 'La imagen pesa ' + (file.size / 1048576).toFixed(1) + ' MB y el máximo son '
      + Math.floor(LIMIMG.maxInputBytes / 1048576) + ' MB. Recórtala o guárdala como JPG.' });
    pintarLecturas(); return;
  }

  try {
    const crudo = await LECTOR.json(PROMPT_BOLETO, { images: [file], modelTier: 'complex' });
    const b = normalizarBoleto(crudo);
    if (!b) throw { code: 'no_boleto' };
    LECTS.set(id, { id, estado: 'listo', b });
  } catch (e) {
    LECTS.set(id, { id, estado: 'error', msg: mensajeLector(e) });
  }
  pintarLecturas();
}

function mensajeLector(e){
  const c = e && e.code;
  if (c === 'no_boleto') return 'Esto no parece un boleto de Bet365. Sube el recorte entero: el importe arriba, las patas en medio y las «Ganancias» abajo.';
  if (c === 'image_rejected') return 'Claude no ha podido abrir esa imagen. Prueba con un PNG o un JPG del recorte.';
  if (c === 'images_unavailable') return 'El lector no acepta imágenes ahora mismo. Revisa la configuración de servidor.mjs.';
  if (c === 'not_granted' || c === 'sampling_disabled' || c === 'not_declared' || c === 'capability_disabled')
    return 'La API de Anthropic no acepta la clave del servidor (ANTHROPIC_API_KEY), así que no se puede leer el recorte.';
  if (c === 'rate_limited') return 'Demasiadas lecturas seguidas. Espera un momento y vuelve a soltar el recorte.';
  if (c === 'invalid_json') return 'La lectura ha vuelto a medias. Vuelve a soltar el recorte; si se repite, sube una imagen más nítida o recorta solo el boleto.';
  if (c === 'refused') return 'Claude no ha querido leer esa imagen. Prueba con otro recorte.';
  if (c === 'session_expired') return 'Tu sesión ha caducado. Vuelve a entrar y repite la subida.';
  if (c === 'cancelled') return 'Lectura cancelada.';
  // Fuera de claude.ai: el servidor local no contesta, o trae el motivo concreto.
  if (c === 'sin_servidor') return 'No contesta servidor.mjs. Comprueba que sigue arrancado y vuelve a soltar el recorte.';
  if (e && e.detalle) return 'No se ha podido leer el recorte: ' + e.detalle + '.';
  return 'No se ha podido leer el recorte. Vuelve a intentarlo.';
}

/* ---------------- la tarjeta de lo leído ---------------- */
const ICO = {
  ganada: '<svg class="ico ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.4"/><path d="m7.7 12.3 2.9 2.9 5.7-6.2"/></svg>',
  cobrada: '<svg class="ico ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.4"/><path d="m7.7 12.3 2.9 2.9 5.7-6.2"/></svg>',
  perdida: '<svg class="ico ko" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.4"/><path d="m8.8 8.8 6.4 6.4M15.2 8.8l-6.4 6.4"/></svg>',
  nula: '<svg class="ico pe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.4"/><path d="M8.2 12h7.6"/></svg>',
  pendiente: '<svg class="ico pe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9.4"/><circle cx="12" cy="12" r="2.7" fill="currentColor" stroke="none"/></svg>'
};
const icono = est => ICO[est] || ICO.pendiente;

function barraLinea(x){
  if (!x || x.linea == null || x.conseguido == null) return '';
  const tope = Math.max(x.linea, x.conseguido, 0.001);
  const pc = Math.max(0, Math.min(100, x.conseguido / tope * 100));
  return '<div class="linea"><span>' + esc(nf(x.conseguido, 0)) + '</span>'
    + '<span class="rail" data-ok="' + (x.estado === 'ganada' ? 1 : 0) + '"><i style="width:' + pc.toFixed(0) + '%"></i></span>'
    + '<span>' + esc(nf(x.linea, 1)) + '</span></div>';
}

function tarjetaBoleto(L){
  const b = L.b, id = L.id;
  const et = ESTADOS[b.estado] || ['—', 'mute'];
  const ben = beneficioDe(b);
  const n = contarSelecciones(b);

  const patas = b.patas.map(p => {
    const multi = p.selecciones.length > 1;
    const uno = p.selecciones[0] || null;
    const titulo = multi ? 'Crear apuesta' : (uno ? uno.seleccion : 'Selección');
    const cuerpo = multi
      ? p.selecciones.map(x => '<div class="selc">' + icono(x.estado) + '<div class="tx">'
          + '<b>' + esc(x.seleccion) + '</b>'
          + (x.mercado ? '<small>' + esc(x.mercado) + '</small>' : '')
          + barraLinea(x)
          + (x.notas ? '<small>' + esc(x.notas) + '</small>' : '')
          + '</div></div>').join('')
      : (uno && (uno.mercado || uno.linea != null || uno.notas)
          ? '<div class="selc" style="padding-left:26px"><div class="tx">'
            + (uno.mercado ? '<small>' + esc(uno.mercado) + '</small>' : '')
            + barraLinea(uno)
            + (uno.notas ? '<small>' + esc(uno.notas) + '</small>' : '')
            + '</div></div>'
          : '');
    const partido = p.evento
      ? '<div class="part"><span>' + esc(p.evento) + '</span>'
        + (p.marcador ? '<span class="marc">' + esc(p.marcador) + '</span>' : '')
        + (p.competicion ? '<span class="mute">' + esc(p.competicion) + '</span>' : '')
        + '</div>'
      : '';
    return '<div class="pata"><div class="pata-t">' + icono(p.estado) + '<b>' + esc(titulo) + '</b>'
      + (p.cuota ? '<span class="cu">' + esc(nfC(p.cuota)) + '</span>' : '') + '</div>'
      + cuerpo + partido + '</div>';
  }).join('');

  const opciones = Object.keys(ESTADOS).map(k =>
    '<option value="' + k + '"' + (k === b.estado ? ' selected' : '') + '>' + ESTADOS[k][0] + '</option>').join('');

  return '<div class="lect">'
    + '<div class="lect-hd"><span class="imp">' + esc(money(b.importe || 0)) + '</span>'
      + '<b>' + esc(TIPOS[b.tipo] || 'Apuesta') + (b.patas.length > 1 ? ' · ' + b.patas.length + ' patas' : '') + '</b>'
      + '<span class="pill ' + et[1] + '">' + et[0] + '</span></div>'
    + '<div class="lect-bd">' + patas + '</div>'
    + '<div class="lect-pie">'
      + '<div class="c"><span class="k">Importe</span><b>' + esc(money(b.importe || 0)) + '</b></div>'
      + '<div class="c"><span class="k">Cuota total</span><b>' + (b.cuota ? esc(nfC(b.cuota)) : '—')
        + (b.cuotaCalculada ? '<em title="El boleto no la escribe: sale de multiplicar las patas.">calculada</em>' : '') + '</b></div>'
      + '<div class="c"><span class="k">Retorno</span><b>' + (b.retorno == null ? '—' : esc(money(b.retorno))) + '</b></div>'
      + '<div class="c"><span class="k">Beneficio</span><b class="' + (ben > 0 ? 'pos' : ben < 0 ? 'neg' : 'mute') + '">'
        + (ben == null ? '—' : esc(moneySigned(ben))) + '</b></div>'
      + '<div class="c"><span class="k">Selecciones</span><b title="Acertadas · falladas' + (n.pe ? ' · sin resolver' : '') + '">'
        + '<span class="pos">' + n.ok + '</span> · <span class="neg">' + n.ko + '</span>'
        + (n.pe ? ' · <span class="mute">' + n.pe + '</span>' : '') + '</b></div>'
    + '</div>'
    + '<div class="lect-acc">'
      + '<label class="f">Fecha<input type="date" data-id="' + id + '" data-f="fecha" value="' + esc(b.fecha) + '"></label>'
      + '<label class="f">Importe<input class="num" type="number" step="0.01" min="0" data-id="' + id + '" data-f="importe" value="' + (b.importe == null ? '' : b.importe) + '"></label>'
      + '<label class="f">Retorno<input class="num" type="number" step="0.01" min="0" data-id="' + id + '" data-f="retorno" value="' + (b.retorno == null ? '' : b.retorno) + '"></label>'
      + '<label class="f">Estado<select data-id="' + id + '" data-f="estado">' + opciones + '</select></label>'
      + '<span class="sp"><button class="btn" type="button" data-desc="' + id + '">Descartar</button>'
      + '<button class="btn primary" type="button" data-guardar="' + id + '">Guardar en el registro</button></span>'
    + '</div></div>';
}

function pintarLecturas(){
  const cont = $('#lects'); if (!cont) return;
  cont.innerHTML = Array.from(LECTS.values()).map(L => {
    if (L.estado === 'leyendo') return '<div class="lect"><div class="cargando"><i></i><span>Leyendo el recorte…</span></div></div>';
    if (L.estado === 'error') return '<div class="lect"><div class="lect-err">' + esc(L.msg) + '</div>'
      + '<div class="lect-acc"><span class="sp"><button class="btn" type="button" data-desc="' + L.id + '">Cerrar</button></span></div></div>';
    return tarjetaBoleto(L);
  }).join('');
}

/* Los cuatro campos del pie son la revisión: lo que la lectura haya entendido mal se
   corrige aquí antes de guardar. Se escucha `change` y no `input` para no repintar en
   mitad de una cifra y quedarse sin el foco. */
$('#lects').addEventListener('change', e => {
  const el = e.target.closest('[data-f]'); if (!el) return;
  const L = LECTS.get(el.dataset.id); if (!L || !L.b) return;
  const f = el.dataset.f;
  if (f === 'fecha') L.b.fecha = el.value || L.b.fecha;
  else if (f === 'estado') L.b.estado = el.value;
  else {
    const v = el.value === '' ? null : Number(el.value);
    L.b[f] = (v == null || isFinite(v)) ? v : L.b[f];
  }
  pintarLecturas();
});

$('#lects').addEventListener('click', e => {
  const d = e.target.closest('[data-desc]');
  if (d){ LECTS.delete(d.dataset.desc); pintarLecturas(); return; }
  const g = e.target.closest('[data-guardar]');
  if (g) guardarBoleto(g.dataset.guardar);
});

function avisoPanel(txt){
  const el = $('#saveState'); if (!el) return;
  el.textContent = txt;
  clearTimeout(avisoPanel.t);
  avisoPanel.t = setTimeout(() => { el.textContent = ''; }, 3500);
}

async function guardarBoleto(id){
  const L = LECTS.get(id); if (!L || !L.b) return;
  const b = L.b;
  if (!(Number(b.importe) > 0)){ avisoPanel('Falta el importe: escríbelo antes de guardar.'); return; }

  const eventos = b.patas.map(p => p.evento).filter(Boolean);
  const seles = [];
  b.patas.forEach(p => p.selecciones.forEach(x => seles.push(x.seleccion)));
  const n = contarSelecciones(b);

  const reg = {
    id: uid(),
    fecha: b.fecha,
    deporte: (b.patas.find(p => p.deporte) || {}).deporte || '',
    evento: eventos.length ? eventos.join(' · ') : (TIPOS[b.tipo] || 'Apuesta') + ' de Bet365',
    seleccion: seles.join(' · '),
    casa: 'Bet365',
    cuota: b.cuota,
    stake: Number(b.importe),
    retorno: b.retorno,
    estado: b.estado,
    cierre: null,
    tipo: b.tipo,
    cuotaCalculada: !!b.cuotaCalculada,
    patas: b.patas,
    aciertos: n.ok, fallos: n.ko, sinResolver: n.pe,
    origen: 'recorte',
    creado: new Date().toISOString()
  };

  LECTS.delete(id);
  pintarLecturas();
  await guardarApuesta(reg);
  avisoPanel('Apuesta guardada · ' + n.ok + ' acertadas, ' + n.ko + ' falladas');
}

/* ---------------- arrastrar, elegir y pegar ---------------- */
const zonaDrop = $('#drop');

['dragenter', 'dragover'].forEach(t => zonaDrop.addEventListener(t, e => { e.preventDefault(); zonaDrop.dataset.on = '1'; }));
['dragleave', 'dragend'].forEach(t => zonaDrop.addEventListener(t, e => { e.preventDefault(); zonaDrop.dataset.on = '0'; }));
zonaDrop.addEventListener('drop', e => { e.preventDefault(); zonaDrop.dataset.on = '0'; procesarFicheros(e.dataTransfer && e.dataTransfer.files); });
zonaDrop.addEventListener('click', e => { if (!e.target.closest('button')) $('#ficha').click(); });
zonaDrop.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (e.target !== zonaDrop) return;
  e.preventDefault(); $('#ficha').click();
});
$('#elegir').addEventListener('click', () => $('#ficha').click());
$('#permitir').addEventListener('click', async () => {
  const b = $('#permitir'); b.disabled = true;
  const m = await asegurarLector(true);
  b.disabled = false;
  if (m === 'ok') avisoPanel('Lectura activada: ya puedes subir el recorte.');
});
$('#ficha').addEventListener('change', e => { procesarFicheros(e.target.files); e.target.value = ''; });

// Soltar la imagen en cualquier parte del panel vale igual: el navegador, si no, la
// abriría en una pestaña y se perdería el recorte.
['dragover', 'drop'].forEach(t => document.addEventListener(t, e => {
  if (zonaDrop.contains(e.target)) return;
  e.preventDefault();
  if (t === 'drop') procesarFicheros(e.dataTransfer && e.dataTransfer.files);
}));

// Ctrl+V desde cualquier sitio que no sea un campo: el bucle real es recortar en
// Bet365, volver al panel y pegar.
document.addEventListener('paste', e => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  const cd = e.clipboardData; if (!cd) return;
  let imgs = Array.from(cd.files || []).filter(f => /^image\//.test(f.type || ''));
  if (!imgs.length && cd.items){
    imgs = Array.from(cd.items)
      .filter(i => i.kind === 'file' && /^image\//.test(i.type || ''))
      .map(i => i.getAsFile()).filter(Boolean);
  }
  if (!imgs.length) return;
  e.preventDefault();
  procesarFicheros(imgs);
});
