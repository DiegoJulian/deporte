/* Cuota Justa · js/12-calculadora.js
   Pestaña Calculadora: el paso agresivo de 5 con la cuota prefijada.
   Script clásico (no módulo): comparte el ámbito global con los demás y se carga en
   el orden de index.html. */
"use strict";
/* ===================== LA CALCULADORA DEL PASO AGRESIVO =====================
   La pestaña Calculadora, la última del menú. Una sola entrada —los euros de
   partida— y una sola cuenta: las cinco etapas del paso agresivo a la cuota YA
   FIJADA, truncando el saldo al céntimo en cada una, que es como liquida la casa.

   LA CUOTA NO SE ESCRIBE NI SE ELIGE. Sale de `cuotaConCentimos(5)` redondeada
   HACIA ARRIBA a cuatro decimales — la misma que usa la ventana ⓘ y, con los
   parámetros de fábrica (10 € → 1.000 €), 2,5120. Ni un número a mano: si se cambia
   el saldo o el objetivo de la pestaña Apuestas, la cuota cambia con ellos y esta
   tabla también. Una cuota escrita en el código seguiría diciendo 2,5120 con el
   objetivo puesto en 500 €.

   MANDA LA CUOTA, NO EL OBJETIVO (lo eligió Diego, 14-09-2026). Escribir 25 € no da
   1.000 €: da 2.500,44 €, porque la cuota se queda clavada y lo que se mueve es el
   resultado. Qué cuota haría falta para acabar justo en el objetivo se dice en la
   nota, pero como lo que es: otra ruta, no esta. Si algún día la cuota se recalcula
   con la cantidad, esta pestaña deja de ser «con la cuota prefijada».

   Y el campo es HTML fijo: no se repinta nunca. Es lo que permite escribir en él con
   la tabla actualizándose a cada tecla sin perder el foco a mitad de una cifra — el
   bicho clásico de repintar con un onSnapshot en medio. */

// La cuota prefijada del paso agresivo. Hacia arriba a propósito: a la baja, la
// última etapa se queda corta (la exacta, 2,511886, acaba en 999,55 € al truncar).
const cuotaPaso = () => Math.ceil(cuotaConCentimos(PLANES[0].n) * 10000) / 10000;

// Las etapas de una cantidad a una cuota, con el saldo truncado al céntimo.
function pasosDe(s0, q, n){
  const filas = [];
  let b = s0;
  for (let i = 1; i <= n; i++){
    const stake = cent(b), fin = cent(stake * q);
    filas.push({ i, stake, fin });
    b = fin;
  }
  return { filas, final: b };
}

// Lo escrito en el campo, o null. Un campo vacío no se sustituye por 10 por lo bajo:
// se dice que falta la cantidad y la tabla espera.
function importeCalc(){
  const v = Number(S.cfg.cImporte);
  return (isFinite(v) && v > 0 && v <= 1e9) ? v : null;
}

function renderCalc(){
  const sec = $('#calc'); if (!sec || !sec.classList.contains('on')) return;
  const n = PLANES[0].n, q = cuotaPaso();
  const { s0: sPanel, obj, v, min } = cfgR();
  const s0 = importeCalc();
  const r = s0 == null ? null : pasosDe(s0, q, n);
  // Con cuotas de la casa, cada etapa sale 1/(cuota × (1+margen)) de las veces, así
  // que la cadena entera vale (1/cuota)^n × (1/(1+v))^n. Es la misma cuenta que
  // `pRuta`, escrita sobre la cuota fijada en vez de sobre el objetivo.
  const pCadena = peaje(n, v) * Math.pow(1 / q, n);

  const inp = $('#cImporte');
  if (inp && inp !== document.activeElement) inp.value = (S.cfg.cImporte == null ? '' : S.cfg.cImporte);

  const eti = $('#calcEti');
  if (eti) eti.textContent = 'Cuota fijada ' + nf(q, 4) + ' · ' + n + ' aciertos seguidos';

  const dicho = $('#calcDicho');
  if (dicho) dicho.innerHTML = s0 == null
    ? 'Escribe cuántos euros pones de partida: es lo único que se toca aquí.'
    : 'Se reinvierte el saldo entero cinco veces a cuota <b>' + esc(nf(q, 4))
      + '</b>. La cuota no cambia con la cantidad.';

  const kp = $('#calcKpis');
  if (kp){
    const st = [
      ['Cuota fijada', nf(q, 4)],
      ['Apuestas', String(n)],
      // El multiplicador REAL de esta cantidad, no q^5: truncar al céntimo en cada
      // etapa se come unos céntimos, y con cantidades pequeñas se nota — 1 € no acaba
      // en 100,02 € sino en 99,80 €. Enseñar q^5 aquí contradiría la propia tabla.
      ['Multiplicador', r ? '×' + nf(r.final / s0, 3) : '×' + nf(Math.pow(q, n), 3)],
      ['Saldo final', r ? eurC(r.final) : '—'],
      ['Beneficio neto', r ? eurC(r.final - s0) : '—'],
      ['Prob. de completarla', nf(pCadena * 100, 3) + ' %']
    ];
    const ayuda = {
      'Cuota fijada': 'La del paso agresivo. No se elige aquí y no cambia con la cantidad.',
      'Multiplicador': 'Lo que multiplica de verdad esta cantidad, con el saldo truncado al céntimo en cada etapa. Por eso no es exactamente ' + nf(Math.pow(q, n), 3) + '.',
      'Beneficio neto': 'Saldo final menos lo puesto, antes de impuestos.',
      'Prob. de completarla': 'Las ' + n + ' etapas seguidas, con el margen del ' + nf(v * 100, 1) + ' % supuesto en la pestaña Apuestas. No depende de la cantidad.'
    };
    // El resaltado va por el nombre del dato, no por su posición: así mover una
    // columna no deja el verde en la casilla equivocada.
    kp.innerHTML = st.map(([k, val]) => `<div class="stat" data-clave="${esc(k)}"${ayuda[k] ? ` title="${esc(ayuda[k])}"` : ''}><span>${esc(k)}</span><b class="${k === 'Saldo final' && r ? 'pos' : ''}">${esc(val)}</b></div>`).join('');
  }

  const tb = $('#calcTb');
  if (tb) tb.innerHTML = r
    ? r.filas.map(f => `<tr class="${f.i === n ? 'fin' : ''}">
        <td class="etp">${f.i}</td>
        <td class="n">${esc(eurC(f.stake))}</td>
        <td class="n">${f.i === n ? '<b>' + esc(eurC(f.fin)) + '</b>' : esc(eurC(f.fin))}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" class="empty" style="border-bottom:0">Escribe una cantidad inicial y aquí salen las ${n} etapas.</td></tr>`;

  /* La nota, corta: de dónde sale la cuota y qué pasa al cambiar la cantidad. Nada
     más. La prosa larga se fue de la pestaña Apuestas el 14-09-2026 porque no le
     decía nada a Diego; esta pestaña nace ya sin ella. */
  const nota = $('#calcNota');
  if (nota){
    const p = [];
    p.push('<p><b>La cuota no se elige aquí.</b> Es la del paso agresivo de la pestaña Apuestas: la exacta para ir de '
      + esc(eurC(sPanel)) + ' a ' + esc(eurC(obj)) + ' en ' + n + ' apuestas es ' + esc(nf(qGeo(sPanel, obj, n), 6))
      + ', que truncando al céntimo se queda en ' + esc(eurC(progresion(n).final)) + ', así que se usa <b>'
      + esc(nf(q, 4)) + '</b>. Cambia sola si cambias el saldo o el objetivo de allí.</p>');

    if (r && Math.abs(s0 - sPanel) > 0.005){
      p.push('<p><b>Manda la cuota, no el objetivo.</b> Con ' + esc(eurC(s0)) + ' no acaba en ' + esc(eurC(obj))
        + ' sino en <b>' + esc(eurC(r.final)) + '</b>. '
        + (s0 < obj
            ? 'Para terminar justo en ' + esc(eurC(obj)) + ' harían falta ' + n + ' aciertos a cuota '
              + esc(nf(qGeo(s0, obj, n), 4)) + ', y eso ya es otra ruta.'
            : 'La cantidad ya supera el objetivo de la pestaña Apuestas.')
        + '</p>');
    }

    if (r && s0 < min){
      p.push('<p><b>Por debajo de la apuesta mínima.</b> La primera serían ' + esc(eurC(s0))
        + ' y tienes puesta una mínima de ' + esc(eurC(min)) + ': esa etapa no se podría jugar.</p>');
    }

    p.push('<p class="note">El beneficio es antes de impuestos, y las cinco cuotas de la tabla no existen todavía: '
      + 'son la que haría falta, no cinco apuestas que puedas poner hoy.</p>');
    nota.innerHTML = p.join('');
  }

  /* Una línea, con la misma forma que el pie de la pestaña Apuestas. */
  const ri = $('#calcRiesgo');
  if (ri){
    ri.innerHTML = '<b>Lo que cuesta ese número.</b> Cada etapa a ' + esc(nf(q, 4))
      + ' sale el ' + esc(pctP(1 / q, 1)) + ' de las veces; las ' + n + ' seguidas, <b>1 de cada '
      + esc(nf(1 / pCadena, 0)) + '</b> con el margen del ' + esc(nf(v * 100, 1)) + ' % supuesto'
      + (r ? ', y el saldo esperado de los ' + esc(eurC(s0)) + ' que pones es <b>' + esc(eurC(s0 * peaje(n, v))) + '</b>' : '')
      + '. Un fallo, en cualquiera de las cinco, la termina en 0 €. '
      + '<a href="https://www.jugarbien.es/" target="_blank" rel="noopener">jugarbien.es</a>';
  }
}

/* El único campo de la pestaña. `input` y no `change` porque es una calculadora: la
   tabla tiene que ir con los dedos. El guardado en la nube espera a soltar el campo,
   para no escribir un documento por tecla. */
const elCImporte = $('#cImporte');
if (elCImporte){
  elCImporte.addEventListener('input', () => {
    const v = Number(elCImporte.value);
    S.cfg.cImporte = (elCImporte.value === '' || !isFinite(v) || v <= 0) ? null : Math.min(1e9, v);
    guardarLocal();
    renderCalc();
  });
  elCImporte.addEventListener('change', () => { persistir('cfg'); renderCalc(); });
}
