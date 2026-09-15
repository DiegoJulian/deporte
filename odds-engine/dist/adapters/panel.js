import { asOdds } from '../core/types.js';
import { DEFAULT_CONFIG, withConfig } from '../config/index.js';
import { buildCombinations } from '../pipeline.js';
/* --------------------------------------------------- estado de cada partido */
/**
 * Minutos desde el comienzo pasados los cuales el partido seguro que acabo.
 * Copiado de `js/05-partido.js`: holgados a proposito, es mejor decir «en
 * juego» de mas que dar por terminado algo que se sigue jugando.
 */
const FIN = [
    [/^f[uú]tbol$/i, 150],
    [/^(baloncesto|b[aá]squet|basquet|basket(ball)?|nba)$/i, 180],
];
const finDe = (dep) => (FIN.find(([re]) => re.test(dep)) || [null, 300])[1];
const esFutbol = (dep) => /^f[uú]tbol$/i.test(dep.trim());
/**
 * `mercado` del panel -> `Market[]` del motor.
 *
 * Lo que se tira, y por que:
 *  - sin hora de comienzo: no se puede saber si la cuota sigue viva;
 *  - ya empezado y con la cuota copiada ANTES del pitido inicial: ese precio ya
 *    no existe (es el `precioMuerto()` de `js/07-mercado.js`);
 *  - fuera del horizonte: combinar un partido de hoy con otro de dentro de tres
 *    semanas no es una combinada, es una cartera;
 *  - menos cuotas validas de las que pide el tipo: el mercado no esta completo
 *    y el margen no es observable.
 */
export function adaptPanelMarkets(docs, opts = {}) {
    const now = opts.now ?? Date.now();
    const horizon = (opts.horizonHours ?? 72) * 3600_000;
    const matches = [];
    const markets = [];
    const dropped = [];
    const warnings = [];
    for (const doc of docs) {
        const id = doc.id;
        const deporte = (doc.deporte ?? '').trim();
        const t0 = doc.comienza === undefined ? NaN : new Date(doc.comienza).getTime();
        if (!Number.isFinite(t0)) {
            dropped.push({ id, motivo: 'sin hora de comienzo' });
            continue;
        }
        const minutos = (now - t0) / 60000;
        const empezado = minutos >= 0;
        const terminado = minutos >= finDe(deporte);
        if (terminado) {
            dropped.push({ id, motivo: 'el partido ya ha terminado' });
            continue;
        }
        if (!empezado && t0 - now > horizon) {
            dropped.push({ id, motivo: `empieza dentro de mas de ${(horizon / 3600_000).toFixed(0)} h` });
            continue;
        }
        // Precio muerto: el partido esta en juego y lo guardado se copio antes del
        // pitido inicial. Ese numero ya no existe en la casa.
        const tCopia = doc.actualizado === undefined ? NaN : new Date(doc.actualizado).getTime();
        if (empezado && (!Number.isFinite(tCopia) || tCopia < t0)) {
            dropped.push({ id, motivo: 'en juego con cuotas copiadas antes del comienzo: ese precio ya no existe' });
            continue;
        }
        const casas = doc.casas ?? [];
        if (casas.length === 0) {
            dropped.push({ id, motivo: 'sin ninguna casa' });
            continue;
        }
        const tipo = doc.tipo === '2v' ? '2v' : '1x2';
        // Indices dentro de `[nombre, c1, cX, c2]` y su identificador de salida.
        const salidas = tipo === '1x2'
            ? [[1, 'HOME', 'Local'], [2, 'DRAW', 'Empate'], [3, 'AWAY', 'Visitante']]
            : [[1, 'HOME', 'Local'], [3, 'AWAY', 'Visitante']];
        const observedAt = Number.isFinite(tCopia) ? tCopia : now;
        const porSalida = new Map();
        let casasCompletas = 0;
        casas.forEach((fila, iCasa) => {
            const nombre = String(fila[0] ?? '').trim();
            if (nombre === '')
                return;
            const valores = salidas.map(([i]) => Number(fila[i]));
            if (!valores.every((c) => Number.isFinite(c) && c > 1))
                return; // casa parcial: fuera
            casasCompletas++;
            salidas.forEach(([, outcomeId], k) => {
                // La apertura del panel es la de `casas[0]`, igual que en `movimiento()`.
                const ap = iCasa === 0 && Array.isArray(doc.apertura) ? Number(doc.apertura[salidas[k][0] - 1]) : NaN;
                const quote = {
                    bookmaker: nombre,
                    odds: asOdds(valores[k]),
                    observedAt,
                    ...(Number.isFinite(ap) && ap > 1 ? { openingOdds: asOdds(ap) } : {}),
                };
                const lista = porSalida.get(outcomeId) ?? [];
                lista.push(quote);
                porSalida.set(outcomeId, lista);
            });
        });
        if (casasCompletas === 0) {
            dropped.push({ id, motivo: `ninguna casa cotiza las ${salidas.length} salidas: el margen no es observable` });
            continue;
        }
        const outcomes = salidas.map(([, outcomeId, label]) => ({
            id: outcomeId, label, quotes: porSalida.get(outcomeId),
        }));
        // El modelo de marcadores es de GOLES. Ajustarlo a un 1X2 de tenis o de
        // baloncesto seria inventarse una distribucion de goles para un deporte que
        // no los tiene, asi que a lo que no es futbol se le da una familia sin
        // traduccion a marcador: el motor la tratara con cotas, no con modelo.
        const familia = tipo === '2v' ? 'ML' : esFutbol(deporte) ? '1X2' : '1X2_NO_FUTBOL';
        if (familia === '1X2_NO_FUTBOL') {
            warnings.push(`[${id}] ${deporte || 'deporte sin indicar'}: la rejilla de marcadores es de goles y aqui no aplica. Las combinadas de este partido usaran cotas.`);
        }
        matches.push({
            matchId: id,
            league: doc.liga ?? '',
            home: doc.local,
            away: doc.visitante,
            startsAt: t0,
            ...(empezado ? { live: true } : {}),
        });
        markets.push({
            id: `${id}|${familia}|FULL_TIME`,
            matchId: id,
            kind: tipo === '2v' ? 'BINARY' : 'THREE_WAY',
            family: familia,
            outcomes,
            complete: true,
            period: 'FULL_TIME',
            normalisationTarget: 1,
            ...(empezado ? { live: true } : {}),
        });
    }
    return { matches, markets, dropped, warnings };
}
/* ------------------------------------------------------- filtros, explicados */
/**
 * Los filtros duros del motor, aplicados de uno en uno para poder decir cual
 * falla. Es la MISMA lista que `optimiseCombinations` aplica cuando
 * `applyFilters` no es `false` (ver `src/optimize/index.ts`); aqui se repite
 * para poder devolver el motivo en vez de hacer desaparecer la candidata.
 */
function rechazosDe(c, cfg) {
    const out = [];
    const f = cfg.filters;
    if (c.confidence < f.minimumConfidenceScore) {
        out.push(`Confianza ${c.confidence.toFixed(0)}/100, por debajo del minimo de ${f.minimumConfidenceScore}.`);
    }
    const peorCalidad = Math.min(...c.selections.map((s) => s.oddsQuality));
    if (peorCalidad < f.minimumOddsQuality) {
        out.push(`La peor pata tiene calidad de cuota ${peorCalidad.toFixed(0)}/100, por debajo de ${f.minimumOddsQuality}.`);
    }
    if (c.joint.correlation.maxAbsCoefficient > f.maxCorrelation) {
        out.push(`Correlacion entre patas de ${c.joint.correlation.maxAbsCoefficient.toFixed(2)}, por encima de ${f.maxCorrelation}.`);
    }
    if (c.joint.correlation.hasIncompatibility)
        out.push('Hay dos patas que no pueden darse a la vez.');
    if (c.joint.correlation.hasRedundancy)
        out.push('Una pata implica a otra: no anade riesgo, solo cuota. La casa no suele dejar combinarlas.');
    return out;
}
const idDe = (c) => c.selections.map((s) => s.selectionId).sort().join('+');
/* ------------------------------------------------------------ la unica puerta */
export function analysePanel(req) {
    const t0 = Date.now();
    const now = req.now ?? Date.now();
    const casa = req.bookmaker ?? 'Bet365';
    const universe = req.universe ?? 'top';
    const cfg = withConfig({
        ...(req.config ?? {}),
        optimizer: {
            ...(req.config?.optimizer ?? {}),
            targetOdds: req.targetOdds,
            targetTolerance: req.targetTolerance ?? DEFAULT_CONFIG.optimizer.targetTolerance,
            // Un panel interactivo no puede quedarse 30 s pensando. El tope de
            // fabrica (2.000.000) es para un proceso por lotes del backend.
            maxNodesExplored: req.maxNodes ?? 120_000,
            // Los filtros se aplican aqui abajo, despues de ordenar. Si el motor solo
            // devolviera sus 25 mejores por crecimiento, una candidata peor por
            // crecimiento pero que SI pasa los filtros se quedaria fuera sin que
            // nadie se enterase: los filtros no son monotonos en el crecimiento.
            maxCandidatesReturned: 200,
        },
        ...(req.maxLegs !== undefined
            ? { combination: { ...(req.config?.combination ?? {}), maxCombinationSize: req.maxLegs } }
            : {}),
    });
    const ad = adaptPanelMarkets(req.docs, {
        now,
        ...(req.horizonHours !== undefined ? { horizonHours: req.horizonHours } : {}),
    });
    if (ad.markets.length === 0) {
        return {
            generadoEn: now, cuotaObjetivo: req.targetOdds, casa,
            partidos: 0, mercados: 0, descartados: ad.dropped,
            selecciones: [], apostables: [], candidatas: [], rechazos: [],
            veredicto: 'NO HAY NINGUNA CUOTA UTILIZABLE. Sin mercado que analizar no hay nada que proponer, y proponer algo de todas formas seria inventarlo.',
            hayVentaja: false, rejillas: [], nodos: 0, presupuestoAgotado: false,
            avisos: ad.warnings, ms: Date.now() - t0,
        };
    }
    const built = buildCombinations({ matches: ad.matches, markets: ad.markets, bookmaker: casa, now, universe }, cfg, 
    // Sin filtros: se evalua todo y los filtros se aplican aqui, de uno en uno,
    // para poder devolver el motivo del rechazo. Un panel que solo dice «no hay
    // nada» no deja arreglar nada.
    { applyFilters: false, maxResults: 4000, universe });
    const porSeleccion = new Map();
    const partidoDe = new Map(ad.matches.map((m) => [m.matchId, m]));
    for (const s of built.selections) {
        const m = partidoDe.get(s.matchId);
        porSeleccion.set(s.selectionId, {
            seleccionId: s.selectionId,
            partidoId: s.matchId,
            partido: m === undefined ? s.matchId : `${m.home} – ${m.away}`,
            liga: m?.league ?? '',
            comienza: m?.startsAt ?? NaN,
            mercado: s.family,
            etiqueta: s.label,
            cuota: s.odds,
            probImplicita: s.raw,
            probSinMargen: s.fair,
            origen: s.source,
            incertidumbre: s.uncertainty,
            margen: s.overround,
            calidad: s.oddsQuality,
            semaforoRiesgo: s.riskLight,
            semaforoValor: s.valueLight,
            ev: s.expectedValue,
            avisos: s.warnings,
        });
    }
    const tally = new Map();
    const candidatas = built.optimisation.candidates.map((c) => {
        const rechazos = rechazosDe(c, cfg);
        for (const r of rechazos)
            tally.set(r, (tally.get(r) ?? 0) + 1);
        return {
            id: idDe(c),
            patas: c.selections.map((s) => porSeleccion.get(s.selectionId)),
            cuota: c.combinedOdds,
            probabilidad: c.joint.adjustedJointProbability,
            cotaInferior: c.joint.adjustedLowerBound,
            incertidumbre: c.joint.uncertainty,
            peajeCompuesto: c.joint.compoundMargin,
            confianza: c.confidence,
            motivosConfianza: c.confidenceReasons,
            riesgoCorrelacion: c.correlationRisk,
            ev: c.rank.expectedValue,
            kelly: c.rank.kellyFraction,
            crecimiento: c.rank.growthRate,
            hayVentaja: c.rank.hasEdge,
            semaforo: c.classification.light,
            etiqueta: c.classification.label,
            validada: c.classification.validated,
            explicacion: c.rank.explanation,
            avisos: c.warnings,
            rechazos,
        };
    });
    const apostables = candidatas.filter((c) => c.rechazos.length === 0);
    const conVentaja = apostables.filter((c) => c.hayVentaja);
    let veredicto;
    if (candidatas.length === 0) {
        veredicto = `NINGUNA COMBINACION ALCANZA LA CUOTA ${req.targetOdds.toFixed(4)}. Con las ${built.selections.length} selecciones cargadas no hay forma de llegar a esa cuota sin pasarse del margen admitido.`;
    }
    else if (conVentaja.length > 0) {
        const mejor = conVentaja[0];
        veredicto = `${mejor.etiqueta} — ${mejor.explicacion}`;
    }
    else if (apostables.length > 0) {
        const mejor = apostables[0];
        veredicto = `NINGUNA CANDIDATA TIENE VALOR ESPERADO POSITIVO. La menos mala pasa los filtros con confianza ${mejor.confianza.toFixed(0)}/100 y aun asi paga un peaje del ${(-mejor.ev * 100).toFixed(2)} %. Apostarla es pagar por jugar, no invertir.`;
    }
    else {
        veredicto = `NO EXISTE COMBINACION VERDE CON SUFICIENTE CONFIANZA. Se han evaluado ${candidatas.length} combinacion(es) que llegan a la cuota ${req.targetOdds.toFixed(4)} y ninguna pasa los filtros del motor.`;
    }
    return {
        generadoEn: now,
        cuotaObjetivo: req.targetOdds,
        casa,
        partidos: ad.matches.length,
        mercados: ad.markets.length,
        descartados: ad.dropped,
        selecciones: [...porSeleccion.values()],
        apostables,
        candidatas,
        rechazos: [...tally].map(([motivo, cuantas]) => ({ motivo, cuantas })).sort((a, b) => b.cuantas - a.cuantas),
        veredicto,
        hayVentaja: conVentaja.length > 0,
        rejillas: [...built.grids.keys()],
        nodos: built.optimisation.stats.nodesExplored,
        presupuestoAgotado: built.optimisation.stats.budgetExhausted,
        avisos: [...ad.warnings, ...built.warnings, ...built.optimisation.warnings],
        ms: Date.now() - t0,
    };
}
//# sourceMappingURL=panel.js.map