#!/usr/bin/env node
/* Cuota Justa · cargar-cuotas.mjs
   Mete cuotas (y, si vienen, la estadística de la NBA) en la base de servidor.mjs.
   Las pestañas abiertas las pintan al instante.

     node cargar-cuotas.mjs mis-cuotas.json
     node cargar-cuotas.mjs mis-cuotas.json --simular      comprueba sin escribir nada
     node cargar-cuotas.mjs mis-cuotas.json --reemplazar   borra los partidos que no vengan
     node cargar-cuotas.mjs mis-cuotas.json --servidor http://127.0.0.1:8788

   El formato está en datos/plantilla-cuotas.json y en el LEEME.

   Al volver a cargar un partido que ya está (mismo id, o mismos equipos el mismo día)
   no se duplica: se escribe encima y la lectura nueva se AÑADE a su `historial`, que
   es de donde sale el movimiento de la cuota cuando no hay `apertura`. */

import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// El mismo .env que servidor.mjs: si ahí se cambia el puerto, el cargador lo sabe.
(function cargarEnv(archivo) {
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
})(path.join(path.dirname(fileURLToPath(import.meta.url)), '.env'));

const LECTURAS_MAX = 40;
const ID_OK = /^[A-Za-z0-9_][A-Za-z0-9_.~:@+-]{0,199}$/;

const ayuda = () => console.log(`
  Uso: node cargar-cuotas.mjs <archivo.json> [--simular] [--reemplazar] [--servidor URL]

  --simular      comprueba el archivo y dice qué haría, sin escribir nada
  --reemplazar   deja en la base SOLO los partidos del archivo (y la NBA, si viene)
  --servidor     dirección de servidor.mjs (por defecto http://127.0.0.1:8787)
`);

/* ---------------------------------------------------------------- argumentos */
const op = { servidor: process.env.CUOTAJUSTA_URL || '', simular: false, reemplazar: false };
const archivos = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--simular') op.simular = true;
  else if (a === '--reemplazar') op.reemplazar = true;
  else if (a === '--servidor') op.servidor = args[++i] || '';
  else if (a === '-h' || a === '--help' || a === '--ayuda') { ayuda(); process.exit(0); }
  else if (a.startsWith('--')) { console.error(`  Opción desconocida: ${a}`); ayuda(); process.exit(1); }
  else archivos.push(a);
}
if (archivos.length !== 1) { ayuda(); process.exit(1); }
if (!op.servidor) op.servidor = `http://127.0.0.1:${Number(process.env.PORT) || 8787}`;

const salir = msg => { console.error(`\n  ${msg}\n`); process.exit(1); };

/* ---------------------------------------------------------------- utilidades */
const sinTildes = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const clave = s => sinTildes(s).replace(/[^a-z0-9]/g, '');
const slug = s => sinTildes(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
const dos = n => String(n).padStart(2, '0');
const diaDe = s => { const d = new Date(s); return isNaN(d) ? '' : `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`; };
const esObjeto = x => !!x && typeof x === 'object' && !Array.isArray(x);
const cuotaOk = v => typeof v === 'number' && isFinite(v) && v > 1 && v <= 1000;

async function pedir(ruta, opciones = {}) {
  let r;
  try {
    r = await fetch(new URL(ruta, op.servidor), {
      ...opciones,
      headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined,
      signal: AbortSignal.timeout(30000)
    });
  } catch {
    salir(`No contesta ${op.servidor}. ¿Está arrancado servidor.mjs?`);
  }
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) salir(`El servidor ha respondido ${r.status}: ${(j && (j.detalle || j.code)) || 'sin detalle'}`);
  return j;
}

/* ---------------------------------------------------------------- validación
   Lo que el panel necesita para pintar un partido, y en la forma exacta en que lo lee.
   Lo que no pasa se descarta y se dice por qué; no se corrige a ojo. */
function validarPartido(p, i) {
  const nombre = esObjeto(p) && p.local ? `${p.local} – ${p.visitante}` : `partido ${i + 1}`;
  const mal = motivo => ({ error: `${nombre}: ${motivo}` });
  if (!esObjeto(p)) return mal('no es un objeto');

  const d = { ...p };
  for (const k of ['deporte', 'local', 'visitante', 'comienza']) {
    if (typeof d[k] !== 'string' || !d[k].trim()) return mal(`falta «${k}»`);
    d[k] = d[k].trim();
  }
  if (d.liga != null && typeof d.liga !== 'string') return mal('«liga» tiene que ser texto');
  d.liga = (d.liga || '').trim();
  if (isNaN(new Date(d.comienza))) return mal(`«comienza» no es una fecha (${d.comienza})`);
  d.tipo = d.tipo == null ? '1x2' : d.tipo;
  if (d.tipo !== '1x2' && d.tipo !== '2v') return mal('«tipo» tiene que ser "1x2" o "2v"');

  if (!Array.isArray(d.casas) || !d.casas.length) return mal('faltan las cuotas («casas»)');
  for (const c of d.casas) {
    if (!Array.isArray(c) || c.length !== 4 || typeof c[0] !== 'string' || !c[0].trim()) {
      return mal('cada casa va como ["Bet365", cuota 1, cuota X, cuota 2]');
    }
    const [, uno, equis, dosC] = c;
    const medioOk = d.tipo === '1x2' ? cuotaOk(equis) : equis === 0;
    if (!cuotaOk(uno) || !cuotaOk(dosC) || !medioOk) {
      return mal(`cuotas no válidas en ${c[0]}: van entre 1,01 y 1.000, con punto decimal` + (d.tipo === '2v' ? ', y en "2v" la del medio es 0' : ''));
    }
  }
  if (d.apertura != null) {
    const a = d.apertura;
    const ok = Array.isArray(a) && a.length === 3 && cuotaOk(a[0]) && cuotaOk(a[2]) && (d.tipo === '1x2' ? cuotaOk(a[1]) : a[1] === 0);
    if (!ok) return mal('«apertura» va como [cuota 1, cuota X, cuota 2] (en "2v", la X a 0)');
  }
  if (d.marcador != null) {
    const m = d.marcador;
    if (!(Array.isArray(m) && m.length === 2 && m.every(g => Number.isInteger(g) && g >= 0))) return mal('«marcador» va como [goles local, goles visitante]');
    if (typeof d.relojT !== 'string' || isNaN(new Date(d.relojT))) return mal('con «marcador» hace falta «relojT»: la hora a la que se copió');
  }
  if (d.historial != null) {
    const h = d.historial;
    if (!(Array.isArray(h) && h.every(x => esObjeto(x) && Array.isArray(x.c) && x.c.length === 3))) return mal('«historial» va como [{ "t": fecha, "c": [1, X, 2] }, …]');
  }

  d.actualizado = d.actualizado == null ? new Date().toISOString() : d.actualizado;
  if (typeof d.actualizado !== 'string' || isNaN(new Date(d.actualizado))) return mal('«actualizado» no es una fecha');
  if (new Date(d.actualizado).getTime() > Date.now() + 120000) return mal('«actualizado» va por delante del reloj');

  if (d.id != null && (typeof d.id !== 'string' || !ID_OK.test(d.id))) return mal(`el id «${d.id}» no vale (letras, números y _ . - ~ : @ +)`);
  return { d };
}

function validarEquipoNba(t, i) {
  if (!esObjeto(t)) return { error: `nba ${i + 1}: no es un objeto` };
  const id = String(t.id == null ? '' : t.id);
  if (!/^\d{6,12}$/.test(id)) return { error: `nba ${i + 1}: el id tiene que ser el de stats.nba.com (p. ej. 1610612747)` };
  if (typeof t.equipo !== 'string' || !t.equipo.trim()) return { error: `nba ${id}: falta «equipo»` };
  for (const k of ['g', 'v', 'd', 'ortg', 'drtg', 'netrtg', 'pace']) {
    if (t[k] != null && !(typeof t[k] === 'number' && isFinite(t[k]))) return { error: `nba ${id}: «${k}» tiene que ser un número` };
  }
  const data = { ...t };
  delete data.id;
  return { id, data };
}

/* ---------------------------------------------------------------- fusión */
function fusionar(nuevo, previo) {
  const out = { ...(previo || {}), ...nuevo };
  delete out.id;
  if (!Array.isArray(nuevo.historial)) {
    const hist = Array.isArray(previo && previo.historial) ? previo.historial.slice() : [];
    const c = nuevo.casas[0].slice(1, 4);
    const ult = hist[hist.length - 1];
    if (!ult || ult.t !== nuevo.actualizado) hist.push({ c, t: nuevo.actualizado });
    out.historial = hist.slice(-LECTURAS_MAX);
  }
  // La apertura no cambia: si la carga nueva no la trae, se queda la que había.
  if (nuevo.apertura == null && previo && previo.apertura) out.apertura = previo.apertura;
  return out;
}

/* ---------------------------------------------------------------- principal */
async function main() {
  let txt;
  try { txt = await readFile(archivos[0], 'utf8'); }
  catch (e) { salir(`No se puede leer ${archivos[0]} (${e.code || e.message}).`); }
  let archivo;
  try { archivo = JSON.parse(txt.replace(/^\uFEFF/, '')); }
  catch (e) { salir(`${archivos[0]} no es JSON válido: ${e.message}`); }

  if (Array.isArray(archivo)) archivo = { mercado: archivo };
  if (!esObjeto(archivo)) salir('El archivo tiene que ser un objeto { "mercado": [...] } o una lista de partidos.');
  if (archivo._plantilla === true && !op.simular) {
    salir('Este archivo es la PLANTILLA: sus partidos son inventados y el panel trataría sus cuotas como reales.\n'
      + '  Cópialo, pon partidos y cuotas de verdad, quita la línea "_plantilla" y cárgalo.\n'
      + '  Para comprobar solo el formato: --simular');
  }

  const partidos = Array.isArray(archivo.mercado) ? archivo.mercado : [];
  const nba = Array.isArray(archivo.nba) ? archivo.nba : null;
  if (!partidos.length && !nba && !archivo.nbaMeta) salir('No hay nada que cargar: ni "mercado" ni "nba".');

  // --- mercado
  const buenos = [], errores = [];
  partidos.forEach((p, i) => { const r = validarPartido(p, i); if (r.error) errores.push(r.error); else buenos.push(r.d); });

  const estado = await pedir('api/estado');
  if (!estado || estado.app !== 'cuota-justa') salir(`${op.servidor} no es servidor.mjs.`);

  const actuales = (await pedir('api/db/mercado')).docs;
  const porId = new Map(actuales.map(x => [x.id, x.data]));
  const porNombre = new Map(actuales.map(x => [clave(x.data.local) + '|' + clave(x.data.visitante) + '|' + diaDe(x.data.comienza), x.id]));

  const escribir = new Map();
  let nuevos = 0, actualizados = 0;
  for (const d of buenos) {
    let id = d.id;
    if (!id || !porId.has(id)) {
      const mismo = porNombre.get(clave(d.local) + '|' + clave(d.visitante) + '|' + diaDe(d.comienza));
      if (mismo) id = mismo;
    }
    if (!id) id = slug(d.local + ' ' + d.visitante) + '-' + diaDe(d.comienza);
    if (!ID_OK.test(id)) { errores.push(`${d.local} – ${d.visitante}: no se puede sacar un id válido; pon uno en «id»`); continue; }
    const previo = escribir.has(id) ? escribir.get(id) : porId.get(id);
    if (porId.has(id) || escribir.has(id)) actualizados++; else nuevos++;
    escribir.set(id, fusionar(d, previo));
  }
  const borrarMercado = op.reemplazar ? actuales.map(x => x.id).filter(id => !escribir.has(id)) : [];

  // --- NBA
  const setNba = [];
  if (nba) nba.forEach((t, i) => { const r = validarEquipoNba(t, i); if (r.error) errores.push(r.error); else setNba.push({ id: r.id, data: r.data }); });
  if (esObjeto(archivo.nbaMeta)) {
    setNba.push({ id: '_meta', data: { ...archivo.nbaMeta, actualizado: archivo.nbaMeta.actualizado || new Date().toISOString() } });
  }

  // --- resumen
  console.log(`\n  ${archivos[0]} → ${op.servidor}${op.simular ? '   (SIMULACIÓN: no se escribe nada)' : ''}\n`);
  if (partidos.length) {
    console.log(`  mercado   ${escribir.size} para escribir: ${nuevos} nuevos, ${actualizados} con lectura añadida`
      + (borrarMercado.length ? `, y ${borrarMercado.length} para borrar` : ''));
  }
  if (setNba.length) console.log(`  nba       ${setNba.length} documentos${op.reemplazar && nba ? ' (reemplazan a los que haya)' : ''}`);
  if (errores.length) {
    console.log(`\n  Descartados (${errores.length}):`);
    errores.forEach(e => console.log(`   · ${e}`));
  }

  if (op.simular) { console.log(''); return; }

  if (escribir.size || borrarMercado.length) {
    const r = await pedir('api/db/mercado', {
      method: 'POST',
      body: JSON.stringify({ set: [...escribir].map(([id, data]) => ({ id, data })), borrar: borrarMercado })
    });
    console.log(`\n  Hecho: ${r.escritos} escritos, ${r.borrados} borrados en «mercado».`);
  }
  if (setNba.length) {
    const r = await pedir('api/db/nba', {
      method: 'POST',
      body: JSON.stringify({ set: setNba, reemplazar: !!(op.reemplazar && nba) })
    });
    console.log(`  Hecho: ${r.escritos} escritos, ${r.borrados} borrados en «nba».`);
  }
  console.log('');
  if (errores.length && !escribir.size && !setNba.length) process.exit(1);
}

main().catch(e => salir(e && e.message ? e.message : String(e)));
