/**
 * Adaptador del panel «Cuota Justa».
 *
 * Traduce lo que el panel guarda en su coleccion `mercado` a `Market[]`, corre
 * el motor entero y devuelve una respuesta pensada para pintarse directamente
 * en la pestana Apuestas.
 *
 * POR QUE VIVE AQUI Y NO EN `servidor.mjs`:
 * la traduccion es donde se cometen los errores que este motor existe para
 * evitar (confundir la cuota del visitante con la del local, dar por completo
 * un mercado que no lo esta, pasar una cuota copiada antes del pitido inicial).
 * Aqui esta el sistema de tipos que lo impide; en un `.mjs` sin tipos, no.
 * Es el mismo sitio y el mismo motivo por el que vive `flashscore.ts`.
 *
 * LA DIFERENCIA DE FONDO CON LA PESTANA ACTUAL:
 * el panel propone hoy las tres cuotas mas cercanas a la que necesita la etapa.
 * Eso ordena por cercania a un numero, no por si la apuesta vale. Aqui se
 * aplican las reglas del motor —calidad del dato, origen de la probabilidad,
 * correlacion, confianza, peaje compuesto y ventaja real de Kelly— y lo que no
 * las pasa sale marcado con el filtro que ha fallado, no escondido.
 */
import type { CombinationLight, CorrelationRisk, Market, MatchContext, ProbabilitySource, RiskLight, ValueLight } from '../core/types.js';
import type { DeepPartial, EngineConfig } from '../config/index.js';
/** Un documento de la coleccion `mercado` del panel, tal cual se guarda. */
export interface DocMercado {
    readonly id: string;
    readonly deporte?: string;
    readonly liga?: string;
    readonly local: string;
    readonly visitante: string;
    /** Hora local sin zona (`2026-09-20T21:00`) o con zona. */
    readonly comienza?: string;
    readonly tipo?: '1x2' | '2v' | string;
    /** `[[nombre, cuota1, cuotaX, cuota2]]`. En `2v` la del medio vale 0. */
    readonly casas?: readonly (readonly [string, number, number, number])[];
    /** Cuota de apertura. Corresponde a `casas[0]`, como en `movimiento()`. */
    readonly apertura?: readonly number[];
    readonly actualizado?: string;
    readonly marcador?: readonly number[];
}
export interface PanelAnalysisRequest {
    readonly docs: readonly DocMercado[];
    /** La cuota que necesita la etapa que toca. El panel la calcula con `qGeo`. */
    readonly targetOdds: number;
    readonly targetTolerance?: number;
    /** Casa en la que se apuesta. Tiene que coincidir con `casas[i][0]`. */
    readonly bookmaker?: string;
    readonly universe?: 'all' | 'top';
    readonly now?: number;
    /** Solo partidos que empiezan dentro de estas horas. Por defecto 72. */
    readonly horizonHours?: number;
    readonly maxLegs?: number;
    readonly maxNodes?: number;
    readonly config?: DeepPartial<EngineConfig>;
}
export interface PanelLeg {
    readonly seleccionId: string;
    readonly partidoId: string;
    readonly partido: string;
    readonly liga: string;
    readonly comienza: number;
    readonly mercado: string;
    readonly etiqueta: string;
    readonly cuota: number;
    readonly probImplicita: number;
    readonly probSinMargen: number;
    readonly origen: ProbabilitySource;
    readonly incertidumbre: number;
    readonly margen: number | null;
    readonly calidad: number;
    readonly semaforoRiesgo: RiskLight;
    readonly semaforoValor: ValueLight;
    readonly ev: number | null;
    readonly avisos: readonly string[];
}
export interface PanelCandidate {
    readonly id: string;
    readonly patas: readonly PanelLeg[];
    readonly cuota: number;
    /** Probabilidad conjunta ajustada por correlacion. La que decide. */
    readonly probabilidad: number;
    /** Cota inferior al 95 % de la anterior. */
    readonly cotaInferior: number;
    readonly incertidumbre: number;
    /** 1 - prod(fair_i x cuota_i). Lo que cuesta montar ESTA combinada. */
    readonly peajeCompuesto: number;
    readonly confianza: number;
    readonly motivosConfianza: readonly string[];
    readonly riesgoCorrelacion: CorrelationRisk;
    readonly ev: number;
    readonly kelly: number;
    readonly crecimiento: number;
    readonly hayVentaja: boolean;
    readonly semaforo: CombinationLight;
    readonly etiqueta: string;
    readonly validada: boolean;
    readonly explicacion: string;
    readonly avisos: readonly string[];
    /**
     * Filtros del motor que esta candidata NO pasa. Vacio = apostable segun las
     * reglas del motor. Se devuelven en vez de esconder la candidata para que el
     * panel pueda decir POR QUE no hay nada, que es la informacion util.
     */
    readonly rechazos: readonly string[];
}
export interface PanelAnalysisResponse {
    readonly generadoEn: number;
    readonly cuotaObjetivo: number;
    readonly casa: string;
    readonly partidos: number;
    readonly mercados: number;
    readonly descartados: readonly {
        readonly id: string;
        readonly motivo: string;
    }[];
    readonly selecciones: readonly PanelLeg[];
    /** Candidatas que pasan TODOS los filtros del motor. Normalmente ninguna. */
    readonly apostables: readonly PanelCandidate[];
    /** Todas las evaluadas, apostables o no, ordenadas por crecimiento. */
    readonly candidatas: readonly PanelCandidate[];
    readonly rechazos: readonly {
        readonly motivo: string;
        readonly cuantas: number;
    }[];
    readonly veredicto: string;
    readonly hayVentaja: boolean;
    readonly rejillas: readonly string[];
    readonly nodos: number;
    readonly presupuestoAgotado: boolean;
    readonly avisos: readonly string[];
    readonly ms: number;
}
export interface AdaptPanelResult {
    readonly matches: readonly MatchContext[];
    readonly markets: readonly Market[];
    readonly dropped: readonly {
        readonly id: string;
        readonly motivo: string;
    }[];
    readonly warnings: readonly string[];
}
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
export declare function adaptPanelMarkets(docs: readonly DocMercado[], opts?: {
    readonly now?: number;
    readonly horizonHours?: number;
}): AdaptPanelResult;
export declare function analysePanel(req: PanelAnalysisRequest): PanelAnalysisResponse;
