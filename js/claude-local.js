/* Cuota Justa · js/claude-local.js
   El panel fuera de claude.ai.

   En claude.ai la plataforma inyecta `window.claude.use(nombre)`, y con eso el panel
   tiene su base de datos ('db'), la lectura de imágenes con Claude ('sample') y el
   control de permisos ('permissions'). Fuera de allí no existe. Este archivo la
   sustituye con la MISMA forma, hablando con servidor.mjs, para que el resto del
   código no cambie ni una línea:

     'db'          → /api/db/<colección>[/<id>]  +  /api/eventos (cambios al instante)
     'sample'      → /api/leer, que llama a la API de Anthropic con tu clave
     'permissions' → contesta sin preguntar: la clave es tuya y no hay nada que conceder

   Sin servidor (index.html abierto con doble clic) `use()` devuelve null para todo,
   que es lo mismo que hace un visor sin capacidades: el panel arranca en OFFLINE,
   trabaja con lo guardado en el navegador y la pestaña Resultados dice por qué no lee.

   Si la página vuelve a servirse desde claude.ai, este archivo no hace nada. */
(function () {
  'use strict';
  if (window.claude && typeof window.claude.use === 'function') return;

  const HTTP = location.protocol === 'http:' || location.protocol === 'https:';
  const JSON_H = { 'Content-Type': 'application/json' };
  const url = ruta => new URL(ruta, location.href).toString();
  const copia = o => (o == null ? o : JSON.parse(JSON.stringify(o)));

  // Los fallos viajan con la forma que espera el panel: un objeto con `code`. Nunca un
  // TypeError: el botón de refresco entiende un TypeError como «esta base no deja
  // releerse entera» y deja de intentarlo para toda la sesión.
  const fallo = (code, detalle) => ({ code, detalle: detalle || '' });

  function conPlazo(ms, senal) {
    if (senal || typeof AbortSignal === 'undefined' || !AbortSignal.timeout) return senal;
    return AbortSignal.timeout(ms);
  }

  async function pedir(ruta, opciones) {
    const o = Object.assign({ cache: 'no-store' }, opciones || {});
    let r;
    try {
      r = await fetch(url(ruta), o);
    } catch (e) {
      if (e && e.name === 'AbortError' && opciones && opciones.signal) throw fallo('cancelled');
      throw fallo('sin_servidor', 'no contesta servidor.mjs');
    }
    let cuerpo = null;
    try { cuerpo = await r.json(); } catch (e) { cuerpo = null; }
    if (!r.ok) throw fallo((cuerpo && cuerpo.code) || 'http_' + r.status, cuerpo && cuerpo.detalle);
    return cuerpo;
  }

  /* ¿Hay servidor, y qué sabe hacer? Se pregunta una vez por carga de página. */
  let estadoP = null;
  function estado() {
    if (!HTTP) return Promise.resolve(null);
    if (!estadoP) {
      estadoP = pedir('api/estado', { signal: conPlazo(4000) })
        .then(e => (e && e.app === 'cuota-justa') ? e : null)
        .catch(() => null);
    }
    return estadoP;
  }

  /* ------------------------------------------------------------------ 'db' */
  function crearDb() {
    const oyentes = new Map();          // colección → Set de { alCambio, alFallo }
    let fuente = null, caido = false;

    const instantanea = docs => {
      const lista = (docs || []).map(d => ({ id: d.id, data: () => copia(d.data) }));
      return { docs: lista, size: lista.length, empty: !lista.length };
    };
    const rutaCol = col => 'api/db/' + encodeURIComponent(col);

    function entregar(col, docs) {
      const set = oyentes.get(col);
      if (!set) return;
      set.forEach(o => { try { o.alCambio(instantanea(docs)); } catch (e) { console.error(e); } });
    }
    function avisarFallo(err) {
      oyentes.forEach(set => set.forEach(o => {
        if (o.alFallo) { try { o.alFallo(err); } catch (e) { console.error(e); } }
      }));
    }
    async function releer(col) {
      try { const r = await pedir(rutaCol(col)); entregar(col, r.docs); }
      catch (e) { avisarFallo(e); }
    }

    // Un solo canal para todas las colecciones. Si el servidor se cae, los oyentes lo
    // saben (y el badge pasa a OFFLINE); cuando vuelve, se relee todo lo escuchado,
    // porque mientras tanto han podido cambiar cosas.
    function conectar() {
      if (fuente || typeof EventSource === 'undefined') return;
      fuente = new EventSource(url('api/eventos'));
      fuente.addEventListener('cambio', ev => {
        let m = null;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m && m.col) entregar(m.col, m.docs);
      });
      fuente.addEventListener('open', () => {
        if (!caido) return;
        caido = false;
        oyentes.forEach((_, col) => releer(col));
      });
      fuente.addEventListener('error', () => {
        if (caido) return;
        caido = true;
        avisarFallo(fallo('unavailable', 'se ha perdido la conexión con servidor.mjs'));
      });
    }

    // Al salir de la página se cierra el canal: si no, el cierre se lee como una caída
    // y cada pestaña que se recarga deja avisos de «sin conexión» en la consola. Si el
    // navegador la devuelve desde su caché (atrás/adelante), se reabre y se relee todo.
    window.addEventListener('pagehide', () => {
      if (fuente) { fuente.close(); fuente = null; }
    });
    window.addEventListener('pageshow', ev => {
      if (!ev.persisted || !oyentes.size) return;
      caido = true;
      conectar();
    });

    function doc(ruta) {
      const partes = String(ruta).split('/');
      if (partes.length !== 2 || !partes[0] || !partes[1]) throw fallo('invalid_path', 'ruta de documento no válida: ' + ruta);
      const [col, id] = partes;
      const r = rutaCol(col) + '/' + encodeURIComponent(id);
      return {
        id,
        async get() {
          const x = await pedir(r);
          return { id, exists: !!x.exists, data: () => copia(x.data) };
        },
        async set(datos) {
          await pedir(r, { method: 'PUT', headers: JSON_H, body: JSON.stringify(datos == null ? {} : datos) });
        },
        async delete() {
          await pedir(r, { method: 'DELETE' });
        }
      };
    }

    function collection(col) {
      return {
        async get() {
          const x = await pedir(rutaCol(col));
          return instantanea(x.docs);
        },
        // Como en claude.ai: la primera entrega llega enseguida con lo que haya, y
        // después una por cada escritura en esa colección, venga de donde venga.
        onSnapshot(alCambio, alFallo) {
          if (!oyentes.has(col)) oyentes.set(col, new Set());
          const o = { alCambio, alFallo };
          oyentes.get(col).add(o);
          conectar();
          pedir(rutaCol(col))
            .then(x => { const s = oyentes.get(col); if (s && s.has(o)) alCambio(instantanea(x.docs)); })
            .catch(e => { if (alFallo) alFallo(e); });
          return () => { const s = oyentes.get(col); if (s) s.delete(o); };
        }
      };
    }

    return { doc, collection };
  }

  /* -------------------------------------------------------------- 'sample' */
  function aBase64(file) {
    return new Promise((ok, ko) => {
      const fr = new FileReader();
      fr.onload = () => {
        const s = String(fr.result || '');
        ok({ media_type: file.type || 'image/png', data: s.slice(s.indexOf(',') + 1) });
      };
      fr.onerror = () => ko(fallo('image_rejected', 'no se ha podido abrir la imagen'));
      fr.readAsDataURL(file);
    });
  }

  function crearLector(est) {
    const img = est.imagenes || {};
    const limites = {
      images: {
        mediaTypes: img.tipos || ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
        maxInputBytes: img.maxBytes || 5 * 1024 * 1024,
        maxCount: img.maxImagenes || 6
      }
    };
    return {
      async limits() { return copia(limites); },
      // Devuelve el JSON que haya escrito Claude, ya interpretado.
      async json(prompt, opciones) {
        const o = opciones || {};
        const images = await Promise.all((o.images || []).map(aBase64));
        const r = await pedir('api/leer', {
          method: 'POST', headers: JSON_H, signal: o.signal,
          body: JSON.stringify({ prompt: String(prompt || ''), images, modelTier: o.modelTier || null })
        });
        return r.json;
      }
    };
  }

  /* --------------------------------------------------------- 'permissions' */
  function crearPermisos() {
    const estadoDe = async cap => {
      const est = await estado();
      if (!est) return 'unavailable';
      if (cap === 'db') return 'granted';
      if (cap === 'sample') return est.lectura ? 'granted' : 'unavailable';
      return 'unavailable';
    };
    return {
      state: estadoDe,
      async request(caps) {
        const r = {};
        for (const c of [].concat(caps || [])) r[c] = await estadoDe(c);
        return r;
      }
    };
  }

  const hechos = {};
  async function use(nombre) {
    const est = await estado();
    if (!est) return null;
    if (nombre === 'db') return hechos.db || (hechos.db = crearDb());
    if (nombre === 'permissions') return hechos.permisos || (hechos.permisos = crearPermisos());
    if (nombre === 'sample') return est.lectura ? (hechos.sample || (hechos.sample = crearLector(est))) : null;
    return null;
  }

  window.claude = Object.freeze({ use, local: true });
})();
