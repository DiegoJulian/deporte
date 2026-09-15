#!/usr/bin/env node
/* Cuota Justa · servidor.mjs
   El panel fuera de claude.ai. Un solo archivo, sin dependencias: Node 18 o superior.

     node servidor.mjs            → http://localhost:8787

   Hace tres cosas, las mismas que en claude.ai hacía la plataforma:
   · Sirve la página (index.html, css/, js/).
   · Guarda la base del panel en datos/base.json y avisa al instante a las pestañas
     abiertas de cualquier cambio (/api/db, /api/eventos).
   · Lee los recortes de Bet365 con Claude, usando TU clave de Anthropic (/api/leer).

   Configuración por variables de entorno o en un archivo .env junto a este:
     ANTHROPIC_API_KEY   clave de la API de Anthropic. Sin ella no se leen boletos.
     ANTHROPIC_MODEL     modelo que lee los boletos (por defecto claude-sonnet-5).
     PORT                puerto (8787).
     HOST                dirección (127.0.0.1: solo este ordenador). 0.0.0.0 lo abre a
                         tu red SIN CONTRASEÑA.
     CUOTAJUSTA_BASE     archivo de la base (datos/base.json). */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';

const DIR = path.dirname(fileURLToPath(import.meta.url));
cargarEnv(path.join(DIR, '.env'));

const PUERTO = Number(process.env.PORT) || 8787;
const HOST = (process.env.HOST || '127.0.0.1').trim();
const CLAVE = (process.env.ANTHROPIC_API_KEY || '').trim();
const MODELO = (process.env.ANTHROPIC_MODEL || 'claude-sonnet-5').trim();
const API = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').trim().replace(/\/+$/, '');
const ARCHIVO_BASE = path.resolve(DIR, process.env.CUOTAJUSTA_BASE || path.join('datos', 'base.json'));

const TIPOS_IMG = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_IMG_BYTES = 7 * 1024 * 1024;     // la API admite 10 MB en base64 por imagen
const MAX_IMGS = 6;
const LIM_DB = 32 * 1024 * 1024;
const LIM_LEER = 64 * 1024 * 1024;
const COL_OK = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const ID_OK = /^[A-Za-z0-9_][A-Za-z0-9_.~:@+-]{0,199}$/;
const LOCALES = ['127.0.0.1', 'localhost', '::1'];
const esObjeto = x => !!x && typeof x === 'object' && !Array.isArray(x);

/* ================================================================ .env */
function cargarEnv(archivo) {
  let txt;
  try { txt = readFileSync(archivo, 'utf8'); } catch { return; }
  for (const linea of txt.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(linea)) continue;
    const m = linea.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

/* ================================================================ la base
   colección → (id → documento), entera en memoria y volcada a disco un instante
   después de cada escritura (a un temporal y luego renombrado, para que un corte a
   medias no deje el archivo roto). Maps y no objetos: así un id como «__proto__» o
   una colección llamada «constructor» son un nombre más y no tocan nada de Node. */
let base = new Map();
let tGuardar = null, pendiente = false, cola = Promise.resolve();

function cargarBase() {
  let txt;
  try { txt = readFileSync(ARCHIVO_BASE, 'utf8'); }
  catch (e) {
    if (e.code === 'ENOENT') { base = new Map(); return; }
    throw e;
  }
  let x;
  try { x = JSON.parse(txt); }
  catch (e) {
    // No se sobrescribe una base que no se entiende: se para y se dice.
    console.error(`\n  ${rel(ARCHIVO_BASE)} no es JSON válido (${e.message}).`);
    console.error('  Arréglalo o muévelo a otro sitio y vuelve a arrancar.\n');
    process.exit(1);
  }
  base = new Map();
  if (!esObjeto(x)) return;
  for (const [col, docs] of Object.entries(x)) {
    if (!COL_OK.test(col) || !esObjeto(docs)) continue;
    const m = new Map();
    for (const [id, d] of Object.entries(docs)) if (ID_OK.test(id) && esObjeto(d)) m.set(id, d);
    if (m.size) base.set(col, m);
  }
}

function volcado() {
  const o = Object.create(null);
  for (const [col, m] of base) {
    const d = Object.create(null);
    for (const [id, v] of m) d[id] = v;
    o[col] = d;
  }
  return JSON.stringify(o, null, 1);
}

function programarGuardado() {
  pendiente = true;
  clearTimeout(tGuardar);
  tGuardar = setTimeout(() => {
    cola = cola.then(guardar).catch(e => console.error('  No se pudo guardar la base:', e.message));
  }, 150);
}

async function guardar() {
  if (!pendiente) return;
  pendiente = false;
  const txt = volcado();
  await mkdir(path.dirname(ARCHIVO_BASE), { recursive: true });
  const tmp = ARCHIVO_BASE + '.tmp';
  await writeFile(tmp, txt);
  try { await rename(tmp, ARCHIVO_BASE); }
  catch (e) {
    // Windows a veces no deja renombrar encima de un archivo abierto por otro programa.
    if (e.code !== 'EPERM' && e.code !== 'EBUSY') throw e;
    await writeFile(ARCHIVO_BASE, txt);
  }
}

function guardarYa() {
  if (!pendiente) return;
  pendiente = false;
  mkdirSync(path.dirname(ARCHIVO_BASE), { recursive: true });
  const tmp = ARCHIVO_BASE + '.tmp';
  writeFileSync(tmp, volcado());
  try { renameSync(tmp, ARCHIVO_BASE); } catch { writeFileSync(ARCHIVO_BASE, volcado()); }
}

const docsDe = col => base.get(col) || new Map();
const listar = col => [...docsDe(col).keys()].sort().map(id => ({ id, data: docsDe(col).get(id) }));
const leerDoc = (col, id) => docsDe(col).get(id);

function escribir(col, id, datos) {
  if (!base.has(col)) base.set(col, new Map());
  const limpio = { ...datos };
  delete limpio.id;                       // el id va en la ruta, no dentro del documento
  base.get(col).set(id, limpio);
}
function borrar(col, id) {
  const m = base.get(col);
  if (!m || !m.delete(id)) return false;
  if (!m.size) base.delete(col);
  return true;
}

/* ================================================================ el motor
   `odds-engine` aplica las reglas duras: quitar el margen con cinco métodos,
   calidad del dato, origen de la probabilidad, correlación entre patas,
   confianza y ventaja real de Kelly. Corre AQUÍ y no en el navegador porque
   ajustar la distribución de marcadores cuesta ~43 ms por partido, y eso en un
   móvil se convierte en varios segundos de pantalla congelada.

   Se carga a la primera petición y no al arrancar: así `node servidor.mjs`
   sigue funcionando en un clon recién bajado que todavía no ha compilado el
   motor, que es lo que promete el LEEME. Si no está, se dice por qué. */
const MOTOR_RUTA = './odds-engine/dist/adapters/panel.js';
let motor = null;
let motorFallo = null;

async function cargarMotor() {
  if (motor || motorFallo) return motor;
  try {
    motor = await import(MOTOR_RUTA);
  } catch (e) {
    motorFallo = 'No está compilado. Ejecuta: cd odds-engine && npm install && npm run build';
    log('motor no disponible → ' + motorFallo);
  }
  return motor;
}

/* La respuesta se guarda en caché por contenido de `mercado` + cuota objetivo.
   La base solo cambia cuando alguien escribe, así que sin esto cada pulsación
   del botón de refresco recalcularía la jornada entera para nada. */
const cacheAnalisis = new Map();
const LIM_CACHE = 24;

function firmaMercado() {
  return JSON.stringify(listar('mercado'));
}

async function analisis(req, res) {
  const m = await cargarMotor();
  if (!m) return json(res, 503, { code: 'motor_no_disponible', detalle: motorFallo });

  const p = await cuerpoJson(req, LIM_DB);
  const objetivo = Number(p && p.targetOdds);
  if (!isFinite(objetivo) || objetivo <= 1) {
    return json(res, 400, { code: 'error', detalle: 'targetOdds tiene que ser una cuota decimal mayor que 1' });
  }

  const docs = listar('mercado').map(d => ({ id: d.id, ...d.data }));
  const clave = objetivo.toFixed(6) + '|' + (p && p.horizonHours) + '|' + firmaMercado();
  const guardado = cacheAnalisis.get(clave);
  if (guardado) return json(res, 200, { ...guardado, cacheado: true });

  const t = Date.now();
  let salida;
  try {
    salida = m.analysePanel({
      docs,
      targetOdds: objetivo,
      bookmaker: (p && p.bookmaker) || 'Bet365',
      universe: (p && p.universe) === 'all' ? 'all' : 'top',
      ...(p && isFinite(Number(p.horizonHours)) ? { horizonHours: Number(p.horizonHours) } : {}),
      ...(p && isFinite(Number(p.maxLegs)) ? { maxLegs: Number(p.maxLegs) } : {}),
    });
  } catch (e) {
    console.error(e);
    return json(res, 500, { code: 'error', detalle: 'el motor no pudo completar el análisis: ' + (e && e.message) });
  }

  log(`motor → cuota ${objetivo.toFixed(4)}: ${docs.length} partidos, ${salida.candidatas.length} combinaciones, ${salida.apostables.length} apostables (${Date.now() - t} ms)`);
  cacheAnalisis.set(clave, salida);
  while (cacheAnalisis.size > LIM_CACHE) cacheAnalisis.delete(cacheAnalisis.keys().next().value);
  return json(res, 200, salida);
}

/* ================================================================ eventos
   Server-Sent Events: cada escritura en una colección se manda entera a todas las
   pestañas abiertas. Es el «oyente en vivo» que el panel tenía en claude.ai. */
const clientes = new Set();

function eventos(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 3000\n\n');
  clientes.add(res);
  res.on('error', () => clientes.delete(res));
  const latido = setInterval(() => res.write(': latido\n\n'), 25000);
  req.on('close', () => { clearInterval(latido); clientes.delete(res); });
}

function difundir(col) {
  if (!clientes.size) return;
  const msg = 'event: cambio\ndata: ' + JSON.stringify({ col, docs: listar(col) }) + '\n\n';
  for (const c of clientes) c.write(msg);
}

/* ================================================================ lectura de boletos */
function sacarJson(texto) {
  let t = String(texto || '').trim();
  const valla = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (valla) t = valla[1].trim();
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i < 0 || j <= i) throw { status: 502, code: 'invalid_json' };
  try { return JSON.parse(t.slice(i, j + 1)); }
  catch { throw { status: 502, code: 'invalid_json' }; }
}

function errorDeAnthropic(status, cuerpo) {
  const tipo = cuerpo && cuerpo.error && cuerpo.error.type;
  const msg = String((cuerpo && cuerpo.error && cuerpo.error.message) || '');
  const e = (code, detalle) => ({ status: 502, code, detalle });
  if (status === 401 || tipo === 'authentication_error') return e('not_granted', 'la clave de Anthropic no es válida');
  if (status === 403 || tipo === 'permission_error') return e('not_granted', 'la clave no tiene permiso para ' + MODELO);
  if (/credit|billing|balance/i.test(msg)) return e('error', 'la cuenta de Anthropic no tiene saldo');
  if (status === 404 || tipo === 'not_found_error') return e('error', `el modelo «${MODELO}» no existe o tu cuenta no lo tiene (ANTHROPIC_MODEL)`);
  if (status === 413 || tipo === 'request_too_large') return e('image_rejected', 'la imagen es demasiado grande');
  if (status === 429 || tipo === 'rate_limit_error') return e('rate_limited');
  if (status === 529 || tipo === 'overloaded_error') return e('error', 'la API de Anthropic está saturada; prueba en un minuto');
  if (status === 400 && /image/i.test(msg)) return e('image_rejected', msg.slice(0, 160));
  return e('error', 'la API de Anthropic ha respondido ' + status + (msg ? ' — ' + msg.slice(0, 160) : ''));
}

async function leer(req, res) {
  if (!CLAVE) return json(res, 503, { code: 'not_declared', detalle: 'falta ANTHROPIC_API_KEY en el servidor' });
  const p = await cuerpoJson(req, LIM_LEER);
  if (!esObjeto(p) || typeof p.prompt !== 'string' || !p.prompt.trim() || p.prompt.length > 50000) {
    return json(res, 400, { code: 'error', detalle: 'petición de lectura mal formada' });
  }
  const imgs = Array.isArray(p.images) ? p.images : [];
  if (imgs.length > MAX_IMGS) return json(res, 400, { code: 'image_rejected', detalle: `como mucho ${MAX_IMGS} imágenes por lectura` });
  for (const im of imgs) {
    if (!esObjeto(im) || !TIPOS_IMG.includes(im.media_type)) {
      return json(res, 400, { code: 'image_rejected', detalle: 'formato de imagen no admitido (PNG, JPG, WebP o GIF)' });
    }
    if (typeof im.data !== 'string' || !im.data || !/^[A-Za-z0-9+/=\s]+$/.test(im.data.slice(0, 200))) {
      return json(res, 400, { code: 'image_rejected', detalle: 'la imagen no ha llegado bien' });
    }
    if (Math.floor(im.data.length * 3 / 4) > MAX_IMG_BYTES) {
      return json(res, 413, { code: 'image_rejected', detalle: `la imagen pasa de ${MAX_IMG_BYTES / 1048576} MB` });
    }
  }

  const contenido = imgs.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } }));
  contenido.push({ type: 'text', text: p.prompt });

  const t0 = Date.now();
  let r;
  try {
    r = await fetch(API + '/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': CLAVE, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODELO, max_tokens: 8000, messages: [{ role: 'user', content: contenido }] }),
      signal: AbortSignal.timeout(180000)
    });
  } catch (e) {
    const tiempo = e && e.name === 'TimeoutError';
    log(`lectura → sin respuesta de la API (${tiempo ? 'tiempo agotado' : e.message})`);
    return json(res, 504, { code: 'error', detalle: tiempo ? 'la API de Anthropic no ha contestado a tiempo' : 'no se ha podido llegar a la API de Anthropic' });
  }
  const cuerpo = await r.json().catch(() => null);
  if (!r.ok) {
    const e = errorDeAnthropic(r.status, cuerpo);
    log(`lectura → ${r.status} ${e.code}${e.detalle ? ' (' + e.detalle + ')' : ''}`);
    return json(res, e.status, { code: e.code, detalle: e.detalle });
  }
  if (cuerpo && cuerpo.stop_reason === 'refusal') {
    log('lectura → rechazada por el modelo');
    return json(res, 422, { code: 'refused' });
  }
  const texto = ((cuerpo && cuerpo.content) || []).filter(b => b && b.type === 'text').map(b => b.text).join('\n');
  let datos;
  try { datos = sacarJson(texto); }
  catch (e) {
    log(`lectura → la respuesta no es JSON${cuerpo && cuerpo.stop_reason === 'max_tokens' ? ' (cortada por longitud)' : ''}`);
    return json(res, 502, { code: 'invalid_json' });
  }
  log(`lectura → bien (${((Date.now() - t0) / 1000).toFixed(1)} s, ${MODELO})`);
  return json(res, 200, { json: datos });
}

/* ================================================================ HTTP */
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};

function json(res, status, obj) {
  const cuerpo = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(cuerpo);
}

function leerCuerpo(req, limite) {
  return new Promise((ok, ko) => {
    const trozos = [];
    let total = 0, pasado = false;
    req.on('data', c => {
      total += c.length;
      if (total > limite) { pasado = true; trozos.length = 0; return; }
      if (!pasado) trozos.push(c);
    });
    req.on('end', () => pasado
      ? ko({ status: 413, code: 'quota_exceeded', detalle: `la petición pasa de ${Math.round(limite / 1048576)} MB` })
      : ok(Buffer.concat(trozos).toString('utf8')));
    req.on('error', ko);
  });
}

async function cuerpoJson(req, limite) {
  if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) {
    throw { status: 415, code: 'error', detalle: 'se esperaba Content-Type: application/json' };
  }
  const txt = await leerCuerpo(req, limite);
  try { return JSON.parse(txt); }
  catch { throw { status: 400, code: 'error', detalle: 'el cuerpo no es JSON válido' }; }
}

// Con el servidor solo en este ordenador, se rechaza cualquier petición que llegue con
// otro nombre de host: es lo que cierra el paso a una web ajena que intente colarse por
// «DNS rebinding». Y a las peticiones con Origin de otra web, lo mismo.
function hostPermitido(req) {
  if (!LOCALES.includes(HOST)) return true;
  const h = String(req.headers.host || '').toLowerCase();
  const nombre = h.startsWith('[') ? h.slice(1, h.indexOf(']')) : h.split(':')[0];
  return LOCALES.includes(nombre);
}
function origenPermitido(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === String(req.headers.host || ''); } catch { return false; }
}

async function api(req, res, ruta) {
  let partes;
  try { partes = ruta.split('/').slice(2).map(decodeURIComponent); }
  catch { return json(res, 400, { code: 'error', detalle: 'ruta mal codificada' }); }
  const [que, col, id, sobra] = partes;
  const m = req.method;

  if (que === 'estado' && partes.length === 1 && m === 'GET') {
    return json(res, 200, {
      ok: true, app: 'cuota-justa', version: 1,
      lectura: !!CLAVE, modelo: CLAVE ? MODELO : null,
      // El panel pregunta esto para saber si puede pedir análisis del motor o si
      // tiene que seguir con sus propias cuentas.
      motor: !!(await cargarMotor()), motorFallo,
      imagenes: { tipos: TIPOS_IMG, maxBytes: MAX_IMG_BYTES, maxImagenes: MAX_IMGS }
    });
  }
  if (que === 'eventos' && partes.length === 1 && m === 'GET') return eventos(req, res);
  if (que === 'leer' && partes.length === 1 && m === 'POST') return leer(req, res);
  if (que === 'analisis' && partes.length === 1 && m === 'POST') return analisis(req, res);

  if (que === 'db') {
    if (!COL_OK.test(col || '') || sobra !== undefined) {
      return json(res, 400, { code: 'invalid_path', detalle: 'colección no válida' });
    }
    // --- la colección entera
    if (id === undefined || id === '') {
      if (m === 'GET') return json(res, 200, { docs: listar(col) });
      if (m === 'POST') return lote(req, res, col);
      return json(res, 405, { code: 'error', detalle: 'método no admitido' });
    }
    // --- un documento
    if (!ID_OK.test(id)) return json(res, 400, { code: 'invalid_path', detalle: 'id de documento no válido' });
    if (m === 'GET') {
      const d = leerDoc(col, id);
      return json(res, 200, d === undefined ? { exists: false, data: null } : { exists: true, data: d });
    }
    if (m === 'PUT') {
      const datos = await cuerpoJson(req, LIM_DB);
      if (!esObjeto(datos)) return json(res, 400, { code: 'error', detalle: 'el documento tiene que ser un objeto JSON' });
      escribir(col, id, datos);
      programarGuardado(); difundir(col);
      return json(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      if (borrar(col, id)) { programarGuardado(); difundir(col); }
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { code: 'error', detalle: 'método no admitido' });
  }
  return json(res, 404, { code: 'no_existe', detalle: 'ruta desconocida' });
}

/* POST /api/db/<colección>
   { "set": [{ "id": "...", "data": {...} }], "borrar": ["id", ...], "reemplazar": false }
   Todo o nada: si un documento no vale, no se escribe ninguno. Con "reemplazar", la
   colección queda exactamente con lo que va en "set". Lo usa cargar-cuotas.mjs. */
async function lote(req, res, col) {
  const p = await cuerpoJson(req, LIM_DB);
  if (!esObjeto(p)) return json(res, 400, { code: 'error', detalle: 'se esperaba { set, borrar, reemplazar }' });
  const set = Array.isArray(p.set) ? p.set : [];
  const fuera = Array.isArray(p.borrar) ? p.borrar : [];
  for (const [i, x] of set.entries()) {
    if (!esObjeto(x) || typeof x.id !== 'string' || !ID_OK.test(x.id) || !esObjeto(x.data)) {
      return json(res, 400, { code: 'error', detalle: `set[${i}]: hace falta { id, data } con un id válido` });
    }
  }
  for (const [i, x] of fuera.entries()) {
    if (typeof x !== 'string' || !ID_OK.test(x)) return json(res, 400, { code: 'error', detalle: `borrar[${i}]: id no válido` });
  }
  let borrados = 0;
  if (p.reemplazar === true) {
    const quedan = new Set(set.map(x => x.id));
    for (const id of [...docsDe(col).keys()]) if (!quedan.has(id) && borrar(col, id)) borrados++;
  }
  for (const id of fuera) if (borrar(col, id)) borrados++;
  for (const x of set) escribir(col, x.id, x.data);
  if (set.length || borrados) { programarGuardado(); difundir(col); }
  log(`base → ${col}: ${set.length} escritos, ${borrados} borrados`);
  return json(res, 200, { ok: true, escritos: set.length, borrados });
}

async function estatico(req, res, ruta) {
  let rel;
  try { rel = decodeURIComponent(ruta); } catch { return json(res, 400, { code: 'error', detalle: 'ruta mal codificada' }); }
  if (rel === '/' || rel === '') rel = '/index.html';
  const abs = path.normalize(path.join(DIR, rel));
  const dentro = carpeta => abs.startsWith(path.join(DIR, carpeta) + path.sep);
  if (!(abs === path.join(DIR, 'index.html') || dentro('css') || dentro('js'))) {
    return json(res, 404, { code: 'no_existe', detalle: 'no hay nada en ' + ruta });
  }
  let buf;
  try { buf = await readFile(abs); }
  catch { return json(res, 404, { code: 'no_existe', detalle: 'no hay nada en ' + ruta }); }
  res.writeHead(200, {
    'Content-Type': TIPOS[path.extname(abs).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(req.method === 'HEAD' ? undefined : buf);
}

const servidor = http.createServer(async (req, res) => {
  try {
    if (!hostPermitido(req)) return json(res, 403, { code: 'host', detalle: 'este servidor solo atiende en localhost' });
    const ruta = new URL(req.url, 'http://localhost').pathname;
    if (ruta === '/api' || ruta.startsWith('/api/')) {
      if (!origenPermitido(req)) return json(res, 403, { code: 'origen', detalle: 'petición desde otra web' });
      return await api(req, res, ruta);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { code: 'error', detalle: 'método no admitido' });
    return await estatico(req, res, ruta);
  } catch (e) {
    if (e && e.status) return json(res, e.status, { code: e.code || 'error', detalle: e.detalle || '' });
    console.error(e);
    if (!res.headersSent) json(res, 500, { code: 'error', detalle: 'error interno del servidor' });
    else res.end();
  }
});

/* ================================================================ arranque */
const rel = p => { const r = path.relative(process.cwd(), p); return (!r || r.startsWith('..') || path.isAbsolute(r)) ? p : r; };
const hora = () => new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const log = txt => console.log(`  ${hora()}  ${txt}`);

function parar() {
  try { clearTimeout(tGuardar); guardarYa(); } catch (e) { console.error('  No se pudo guardar la base:', e.message); }
  for (const c of clientes) c.end();
  process.exit(0);
}
process.on('SIGINT', parar);
process.on('SIGTERM', parar);

cargarBase();
servidor.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`\n  El puerto ${PUERTO} está ocupado. Arranca con otro: PORT=8788 node servidor.mjs\n`);
  else console.error(e);
  process.exit(1);
});
servidor.listen(PUERTO, HOST, () => {
  const n = c => docsDe(c).size;
  const dir = LOCALES.includes(HOST) ? 'localhost' : HOST;
  console.log(`\n  Cuota Justa  ·  http://${dir}:${PUERTO}\n`);
  console.log(`  base      ${rel(ARCHIVO_BASE)}  (${n('mercado')} partidos, ${n('apuestas')} apuestas)`);
  console.log(CLAVE
    ? `  lectura   activada con ${MODELO}`
    : '  lectura   desactivada: falta ANTHROPIC_API_KEY (mira ejemplo.env)');
  if (!LOCALES.includes(HOST)) console.log(`  aviso     abierto en ${HOST} y SIN CONTRASEÑA: cualquiera de tu red puede leer y escribir la base`);
  console.log('\n  Ctrl+C para parar.\n');
});
