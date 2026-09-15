#!/usr/bin/env node
/* Cuota Justa · capturar-cuotas.mjs
   Convierte cuotas escritas en texto plano al JSON que come cargar-cuotas.mjs.

     node capturar-cuotas.mjs cuotas.txt
     node capturar-cuotas.mjs cuotas.txt -o jornada.json
     node capturar-cuotas.mjs --ejemplo          enseña el formato de entrada
     type cuotas.txt | node capturar-cuotas.mjs  (o `cat` en bash)

   PARA QUE SIRVE DE VERDAD. Transcribir es lo de menos: lo importante es que
   comprueba el margen de cada bloque y la coherencia entre 1X2, doble
   oportunidad y empate no válido AQUÍ, mientras todavía tienes la casa abierta
   en el navegador. Un 3,40 tecleado como 3,04 se ve al instante como un margen
   imposible; descubrirlo media hora después, cuando el panel no enseña nada, no
   sirve de nada.

   Y NO INVENTA. Lo que no entiende lo dice con el número de línea y se para. No
   rellena una cuota que falte ni adivina un equipo mal escrito: este panel
   entero está construido sobre no hacer eso. */

import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

const EJEMPLO = `
  Una línea por cosa. Las líneas en blanco separan partidos.

    LIGA España - LaLiga
    Real Sociedad - Atlético de Madrid   20/09 21:00
    1X2  3.40 3.60 2.05
    DC   1.84 1.32 1.35
    DNB  2.60 1.52
    AP   3.20 3.70 2.10

    Arsenal - Everton   21/09 16:00
    1X2  1.58 4.10 6.20

    LIGA ATP 1000
    DEPORTE Tenis
    Alcaraz - Sinner   22/09 15:00
    2V   2.05 1.83

  LIGA y DEPORTE son opcionales y se pegan: valen hasta que escribas otra.
  DEPORTE es «Fútbol» si no dices nada.

    1X2  local  empate  visitante      el mercado normal
    2V   uno    dos                    sin empate (tenis, NBA…)
    DC   1X     12      X2             doble oportunidad. Suma 200 %, no 100 %
    DNB  local  visitante              empate no válido
    AP   cuota de apertura, igual que 1X2

  La fecha admite  20/09 21:00 · 20/09/2026 21:00 · 2026-09-20T21:00
                   hoy 21:00 · mañana 16:30
`;

/* ---------------------------------------------------------------- argumentos */
const args = process.argv.slice(2);
const op = { entrada: null, salida: null, stdout: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--ejemplo' || a === '--formato') { console.log(EJEMPLO); process.exit(0); }
  else if (a === '-h' || a === '--help' || a === '--ayuda') {
    console.log(`
  Uso: node capturar-cuotas.mjs [archivo.txt] [-o salida.json] [--stdout]

  Sin archivo, lee de la entrada estándar.
  --ejemplo   enseña el formato de entrada
  --stdout    escribe el JSON por pantalla en vez de a un archivo
`);
    process.exit(0);
  }
  else if (a === '-o' || a === '--salida') op.salida = args[++i] || null;
  else if (a === '--stdout') op.stdout = true;
  else if (a.startsWith('-')) { console.error(`  Opción desconocida: ${a}`); process.exit(1); }
  else op.entrada = a;
}

const salir = msg => { console.error(`\n  ${msg}\n`); process.exit(1); };

/* ---------------------------------------------------------------- utilidades */
const dos = n => String(n).padStart(2, '0');
const isoLocal = d => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
const num = s => { const v = Number(String(s).replace(',', '.')); return Number.isFinite(v) ? v : NaN; };
const cuotaOk = v => Number.isFinite(v) && v > 1 && v <= 1000;

/* La fecha. El panel quiere hora LOCAL sin zona; escribir la UTC sin la Z la
   desplazaría, y eso ya pasó una vez en este proyecto. */
function fecha(txt, linea) {
  const t = txt.trim();
  let m;

  if ((m = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})$/.exec(t)) !== null) {
    return `${m[1]}T${dos(m[2])}:${m[3]}`;
  }
  if ((m = /^(hoy|ma[ñn]ana)\s+(\d{1,2}):(\d{2})$/i.exec(t)) !== null) {
    const d = new Date();
    if (/^ma/i.test(m[1])) d.setDate(d.getDate() + 1);
    d.setHours(Number(m[2]), Number(m[3]), 0, 0);
    return isoLocal(d);
  }
  if ((m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\s+(\d{1,2}):(\d{2})$/.exec(t)) !== null) {
    const dia = Number(m[1]), mes = Number(m[2]);
    const ahora = new Date();
    let anio = m[3] !== undefined ? Number(m[3]) : ahora.getFullYear();
    const d = new Date(anio, mes - 1, dia, Number(m[4]), Number(m[5]), 0, 0);
    // Sin año, una fecha que ya pasó hace más de un mes es del año que viene:
    // en diciembre se copian cuotas de enero, y al revés no tiene sentido.
    if (m[3] === undefined && d.getTime() < ahora.getTime() - 30 * 86400_000) {
      d.setFullYear(anio + 1);
    }
    if (d.getMonth() !== mes - 1 || d.getDate() !== dia) {
      salir(`Línea ${linea}: «${t}» no es una fecha que exista.`);
    }
    return isoLocal(d);
  }
  salir(`Línea ${linea}: no entiendo la fecha «${t}».\n  Vale: 20/09 21:00 · 20/09/2026 21:00 · 2026-09-20T21:00 · hoy 21:00 · mañana 16:30`);
}

/* ---------------------------------------------------------------- el análisis */
const MERCADOS = {
  '1X2': { campo: 'casas', n: 3, etiqueta: '1X2' },
  '2V': { campo: 'casas', n: 2, etiqueta: '2V' },
  'DC': { campo: 'dobleOportunidad', n: 3, etiqueta: 'doble oportunidad' },
  'DNB': { campo: 'empateNoValido', n: 2, etiqueta: 'empate no válido' },
  'AP': { campo: 'apertura', n: 3, etiqueta: 'apertura' }
};

function analizar(texto) {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/);
  const partidos = [];
  let liga = '', deporte = 'Fútbol';
  let actual = null;

  const cerrar = () => {
    if (actual === null) return;
    if (actual.casas === undefined) {
      salir(`Línea ${actual.linea}: «${actual.local} – ${actual.visitante}» no trae ninguna línea 1X2 ni 2V. Un partido sin su mercado principal no se puede cargar.`);
    }
    partidos.push(actual);
    actual = null;
  };

  lineas.forEach((cruda, i) => {
    const linea = i + 1;
    const l = cruda.replace(/\s+/g, ' ').trim();
    if (l === '' ) { cerrar(); return; }
    if (l.startsWith('#') || l.startsWith('//')) return;

    let m;
    if ((m = /^LIGA\s+(.+)$/i.exec(l)) !== null) { cerrar(); liga = m[1].trim(); return; }
    if ((m = /^DEPORTE\s+(.+)$/i.exec(l)) !== null) { cerrar(); deporte = m[1].trim(); return; }

    // ¿Es una línea de cuotas?
    const clave = (l.split(' ')[0] || '').toUpperCase();
    if (Object.prototype.hasOwnProperty.call(MERCADOS, clave)) {
      if (actual === null) salir(`Línea ${linea}: hay cuotas (${clave}) antes de decir de qué partido son.`);
      const spec = MERCADOS[clave];
      const vals = l.split(' ').slice(1).map(num);
      if (vals.length !== spec.n) {
        salir(`Línea ${linea}: «${clave}» pide ${spec.n} cuotas y hay ${vals.length}.`);
      }
      if (!vals.every(cuotaOk)) {
        salir(`Línea ${linea}: alguna cuota de «${clave}» no vale. Van entre 1,01 y 1.000 (${l}).`);
      }
      if (clave === '2V') actual.tipo = '2v';
      if (clave === 'DC' || clave === 'DNB') actual[spec.campo] = [['Bet365', ...vals]];
      else if (clave === 'AP') actual.apertura = vals.length === 3 ? vals : [vals[0], 0, vals[1]];
      else actual.casas = [['Bet365', ...(spec.n === 3 ? vals : [vals[0], 0, vals[1]])]];
      actual._vistos.add(clave);
      return;
    }

    // Si no, tiene que ser la cabecera de un partido: equipos + fecha.
    cerrar();
    const sep = /\s+(?:-|–|—|vs\.?|VS\.?)\s+/;
    if (!sep.test(l)) {
      salir(`Línea ${linea}: no sé qué es esto.\n  «${cruda.trim()}»\n  Un partido va «Local - Visitante  20/09 21:00»; una liga, «LIGA España - LaLiga».`);
    }
    // La fecha es la cola: desde el primer dígito que abre día/hora hasta el final.
    const mf = /\s{1,}((?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?|\d{4}-\d{2}-\d{2}|hoy|ma[ñn]ana)[T ]\s*\d{1,2}:\d{2})\s*$/i.exec(l);
    if (mf === null) {
      salir(`Línea ${linea}: falta la hora de comienzo.\n  «${cruda.trim()}»\n  Va al final: «Local - Visitante  20/09 21:00». Sin hora el panel no sabe si la cuota sigue viva.`);
    }
    const equipos = l.slice(0, mf.index).trim().split(sep);
    if (equipos.length !== 2 || !equipos[0].trim() || !equipos[1].trim()) {
      salir(`Línea ${linea}: no distingo los dos equipos en «${cruda.trim()}».`);
    }
    actual = {
      deporte, liga,
      local: equipos[0].trim(), visitante: equipos[1].trim(),
      comienza: fecha(mf[1].replace(/\s+/, ' '), linea),
      tipo: '1x2',
      linea, _vistos: new Set()
    };
  });
  cerrar();
  return partidos;
}

/* ------------------------------------------------- control en caliente
   Esto es lo que hace que merezca la pena pasar por aquí en vez de escribir el
   JSON a mano: se mira cada bloque antes de que salgas de la casa. */
async function revisar(partidos) {
  const avisos = [];
  const suma = cs => cs.reduce((a, c) => a + 1 / c, 0);

  for (const p of partidos) {
    const quien = `${p.local} – ${p.visitante}`;
    const c = p.casas[0].slice(1).filter(x => x > 1);

    const s1 = suma(c);
    if (s1 < 1) avisos.push(`${quien}: el ${p.tipo === '2v' ? '2V' : '1X2'} suma ${(s1 * 100).toFixed(1)} %, por debajo del 100 %. Ninguna casa cotiza así: revisa si has tecleado mal una cuota.`);
    // Umbral bajo a proposito. Bet365 cotiza un 1X2 al 4-6 %; a partir del 8 %
    // lo mas probable no es que el mercado sea ancho, es que haya un digito
    // cambiado. Un aviso de mas cuesta una linea; una cuota mal tecleada que
    // entra en silencio contamina todo lo que el motor calcule despues.
    //
    // LIMITE HONESTO: esto caza el punto decimal mal puesto y los digitos
    // transpuestos que dejan una suma imposible. Un 3,40 tecleado 3,04 sube el
    // margen al 9,5 % y salta, pero un 3,40 tecleado 3,45 no lo va a cazar
    // nadie mirando margenes. Para eso esta el control de coherencia de abajo,
    // que SI lo ve — y es otra razon para copiar siempre los tres mercados.
    else if (s1 > 1.08) avisos.push(`${quien}: el ${p.tipo === '2v' ? '2V' : '1X2'} tiene un margen del ${((s1 - 1) * 100).toFixed(1)} %, y Bet365 suele cotizarlo al 4-6 %. Comprueba las ${p.tipo === '2v' ? 'dos' : 'tres'} cuotas antes de darlas por buenas.`);

    if (p.dobleOportunidad) {
      const sd = suma(p.dobleOportunidad[0].slice(1));
      if (sd < 2) avisos.push(`${quien}: la doble oportunidad suma ${(sd * 100).toFixed(1)} %, y le corresponde 200 % (1X + 12 + X2 cubre cada resultado dos veces). Con menos, el motor la descarta por margen negativo.`);
      else if (sd > 2.30) avisos.push(`${quien}: la doble oportunidad tiene un margen del ${((sd / 2 - 1) * 100).toFixed(1)} %. Revísala.`);
    }
    if (p.empateNoValido) {
      const sn = suma(p.empateNoValido[0].slice(1));
      if (sn < 1) avisos.push(`${quien}: el empate no válido suma ${(sn * 100).toFixed(1)} %, por debajo del 100 %. Revísalo.`);
    }
  }

  // Coherencia con el motor, si está compilado. Es la comprobación buena: dice
  // si el 1X2 y los otros dos mercados del resultado se contradicen.
  let motor = null;
  try { motor = await import('./odds-engine/dist/index.js'); } catch { /* sin compilar */ }
  if (motor === null) {
    avisos.push('El motor no está compilado, así que no se ha podido contrastar 1X2 contra doble oportunidad y empate no válido. Para tenerlo: cd odds-engine && npm run build');
    return avisos;
  }

  for (const p of partidos) {
    if (p.tipo !== '1x2') continue;
    if (!p.dobleOportunidad && !p.empateNoValido) continue;
    const quien = `${p.local} – ${p.visitante}`;
    const f = motor.devigPower(p.casas[0].slice(1, 4).map(x => 1 / x)).fair;
    const entrada = { threeWay: { home: f[0], draw: f[1], away: f[2] } };
    if (p.dobleOportunidad) {
      const d = motor.devigPower(p.dobleOportunidad[0].slice(1).map(x => 1 / x), 2).fair;
      entrada.doubleChance = { homeOrDraw: d[0], homeOrAway: d[1], drawOrAway: d[2] };
    }
    if (p.empateNoValido) {
      const n = motor.devigPower(p.empateNoValido[0].slice(1).map(x => 1 / x)).fair;
      entrada.drawNoBet = { home: n[0], away: n[1] };
    }
    const rep = motor.checkCoherence(entrada);
    for (const ch of rep.checks) {
      if (Math.abs(ch.deltaPoints) < 0.015) continue;
      const nombre = ch.market === 'DC' ? 'la doble oportunidad' : 'el empate no válido';
      avisos.push(`${quien}: el 1X2 y ${nombre} no cuadran en ${ch.outcome} — el 1X2 implica ${(ch.implied * 100).toFixed(1)} % y ahí se cotiza ${(ch.observed * 100).toFixed(1)} % (${(ch.deltaPoints * 100).toFixed(1)} puntos). Si no es un error de tecleo, es un precio mal puesto y el panel te lo marcará.`);
    }
  }
  return avisos;
}

/* ---------------------------------------------------------------- principal */
async function main() {
  let texto;
  if (op.entrada !== null) {
    try { texto = await readFile(op.entrada, 'utf8'); }
    catch (e) { salir(`No se puede leer ${op.entrada} (${e.code || e.message}).`); }
  } else if (process.stdin.isTTY) {
    salir('No hay nada que leer.\n  Pásale un archivo:  node capturar-cuotas.mjs cuotas.txt\n  O mira el formato:  node capturar-cuotas.mjs --ejemplo');
  } else {
    const trozos = [];
    for await (const t of process.stdin) trozos.push(t);
    texto = Buffer.concat(trozos).toString('utf8');
  }
  if (!texto.trim()) salir('El texto está vacío.');

  const partidos = analizar(texto);
  if (!partidos.length) salir('No he encontrado ningún partido. Mira el formato con --ejemplo.');

  // `actualizado` es AHORA: es el momento en que se copiaron las cuotas, y de ahí
  // salen la edad, el factor de frescura del motor y la detección de precio muerto.
  const ahora = new Date().toISOString();
  const limpios = partidos.map(p => {
    const { linea, _vistos, ...doc } = p;
    return { ...doc, actualizado: ahora };
  });

  const avisos = await revisar(partidos);

  const json = JSON.stringify({ mercado: limpios }, null, 2) + '\n';
  if (op.stdout) {
    process.stdout.write(json);
  } else {
    const d = new Date();
    const destino = op.salida ?? path.join(DIR, 'datos', `captura-${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}.json`);
    try { await writeFile(destino, json, 'utf8'); }
    catch (e) { salir(`No se puede escribir ${destino} (${e.code || e.message}).`); }

    console.log('');
    for (const p of partidos) {
      const m = [...p._vistos].filter(x => x !== 'AP').join(' + ');
      console.log(`  ${p.local} – ${p.visitante}   ${p.comienza}   ${m}`);
    }
    console.log(`\n  ${partidos.length} partido(s) → ${path.relative(process.cwd(), destino) || destino}`);
  }

  if (avisos.length) {
    console.error('');
    for (const a of avisos) console.error(`  Aviso · ${a}`);
    console.error('\n  Compruébalos AHORA, que todavía tienes la casa abierta.');
  }

  if (!op.stdout) {
    console.log(`\n  Para cargarlo:  node cargar-cuotas.mjs ${path.relative(process.cwd(), op.salida ?? '') || 'datos/captura-*.json'}`);
    console.log('');
  }
}

main();
