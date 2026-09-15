/* Cuota Justa · js/05-partido.js
   Mercado · estado de cada partido: por jugar, en juego o terminado, y el marcador y el reloj copiados.
   Script clásico (no módulo): comparte el ámbito global con los demás y se carga en
   el orden de index.html. */
"use strict";
/* ============================ ESTADO DEL PARTIDO ============================
   El panel NO calcula el minuto de juego. Se probó a estimarlo restando un descanso
   fijo y el 13-09-2026, en el Levante–Barcelona, pintaba el 71' mientras Bet365
   marcaba 59:07: 12 minutos de error, porque el retraso del saque inicial, el
   descuento y un descanso que se alarga son invisibles desde aquí.

   Así que el marcador y el reloj entran por donde entra todo lo demás: por la carga
   de cuotas. Se guardan tal como se copiaron, junto a la hora de la copia, y
   se enseñan diciendo de cuándo son. El reloj NO corre solo: si a las 17:41 copias
   un 85:35, a las 17:55 sigue poniendo 85:35 y debajo «parado desde hace 14 min».
   Un reloj que avanzase por su cuenta sería otra vez el 71' de antes. */

// Minutos desde el comienzo pasados los cuales el partido seguro que ha acabado.
// Holgados a propósito: es mejor decir «en juego» de más que dar por terminado algo
// que se sigue jugando.
const FIN = [
  [/^f[úu]tbol$/i, 150],
  [/^(baloncesto|b[áa]squet|basquet|basket(ball)?|nba)$/i, 180]
];
const finDe = dep => (FIN.find(([re]) => re.test(dep || '')) || [null, 300])[1];

function relojPartido(e){
  if (!e.comienza) return { estado: 'sinhora' };
  const t0 = new Date(e.comienza).getTime();
  if (isNaN(t0)) return { estado: 'sinhora' };
  const min = Math.floor((Date.now() - t0) / 60000);
  if (min < 0) return { estado: 'previo' };
  return { estado: min < finDe(e.deporte) ? 'vivo' : 'final', desde: min };
}

/* --- marcador y reloj copiados de Bet365 --- */
const VIDA_MARCADOR = 3 * 3600;   // pasado eso, un marcador copiado ya no dice nada
const FRESCO_MARCADOR = 180;      // hasta aquí, el reloj copiado sigue siendo creíble

const tieneMarcador = e => Array.isArray(e.marcador) && e.marcador.length === 2 &&
  e.marcador.every(g => isFinite(Number(g)));

// Segundos desde que se copió el marcador, o null si no hay ninguno.
function edadMarcador(e){
  if (!e || !e.relojT) return null;
  const t = new Date(e.relojT).getTime();
  if (!isFinite(t)) return null;
  const seg = Math.round((Date.now() - t) / 1000);
  return seg < -120 ? null : Math.max(0, seg);
}

// Lo que el panel sabe del partido: goles de cada equipo (o null) y la línea de abajo.
function bloquePartido(e){
  const r = relojPartido(e);
  const edad = edadMarcador(e);
  const vigente = edad != null && edad < VIDA_MARCADOR;
  const fresco = edad != null && edad < FRESCO_MARCADOR;
  const marc = vigente && tieneMarcador(e) ? e.marcador.map(Number) : null;
  const reloj = vigente && e.reloj ? String(e.reloj) : '';
  const hora = e.comienza ? new Date(e.comienza).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
  const dia = e.comienza ? fechaCorta(e.comienza) : '';

  let txt, cls = '', nota = '', notaCls = '', titulo;
  if (reloj){
    txt = reloj; cls = fresco ? 'vivo' : 'viejo';
    nota = fresco ? (edad < 60 ? 'ahora' : 'hace ' + edadCorta(edad))
                  : 'parado ' + edadCorta(edad);
    notaCls = fresco ? 'est' : '';
    titulo = 'Reloj y marcador tal como se copiaron de Bet365, a las ' + fechaHora(e.relojT) + '. '
      + 'El panel no los hace correr solos: el minuto de juego no le llega, así que enseña el último que entró y cuánto hace de eso.'
      + (hora ? ' El partido empezó a las ' + hora + '.' : '');
  } else if (r.estado === 'vivo'){
    txt = hora || '—'; nota = 'En juego'; notaCls = 'est';
    titulo = 'Empezó a las ' + hora + ', hace ' + edadCorta(r.desde * 60) + ' de reloj. El marcador y el minuto salen aquí cuando entran en la base junto con las cuotas.';
  } else if (r.estado === 'final'){
    txt = hora || '—'; nota = 'Terminado'; notaCls = 'fin';
    titulo = 'Empezó a las ' + hora + ', hace ' + edadCorta(r.desde * 60) + ' de reloj: por hora ya ha terminado.';
  } else if (r.estado === 'sinhora'){
    txt = '—'; nota = 'Sin hora';
    titulo = 'Este partido entró sin hora de comienzo.';
  } else {
    txt = hora || '—'; nota = dia;
    titulo = e.comienza ? 'Comienza el ' + fechaHora(e.comienza) : 'Sin hora de comienzo';
  }

  // Verde de «en juego»: o el reloj que pegaste es reciente, o por hora aún se juega.
  const vivo = (reloj && fresco) || r.estado === 'vivo';
  const pie = `<div class="ev-pie" title="${esc(titulo)}"><b class="${cls}">${esc(txt)}</b>${nota ? `<small class="${notaCls}">${esc(nota)}</small>` : ''}</div>`;
  return { vivo, estado: r.estado, marc, pie };
}
