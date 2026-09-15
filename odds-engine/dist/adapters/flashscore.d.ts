/**
 * Adaptador del feed de cuotas de Bet365 que publica Flashscore.
 *
 * ESCRITO CONTRA EL FORMATO REAL, no contra uno supuesto: las claves, los 13
 * tipos de mercado, los tres periodos, los identificadores de las 11 casas
 * espanolas y el convenio de signo del handicap estan verificados en
 * `mercados-disponibles-flashscore.md` y `ampliacion-de-mercados.md` del
 * proyecto, sobre respuestas reales de `_hash=oce` (`findOddsByEventId`).
 *
 * Tres cosas que costaron un error en su dia y aqui estan resueltas:
 *
 *  1. **La doble oportunidad suma 2, no 1.** 1X + 12 + X2 cubre cada resultado
 *     dos veces. Normalizarla a 1 da probabilidades a la mitad de lo que valen.
 *  2. **El handicap viene desde el punto de vista de cada lado.** El visitante
 *     lo trae con el signo cambiado. Agrupar por el valor en crudo mezcla
 *     mercados distintos y saca margenes del 138 %. Todo se pasa a la
 *     perspectiva del LOCAL.
 *  3. **Descanso/Final no trae ningun campo que lo identifique**, solo el
 *     orden. Queda fuera: un mercado que no se puede identificar no se carga.
 */
import type { Market } from '../core/types.js';
/** Las 11 casas espanolas que trae la misma respuesta. Bet365 es la 16. */
export declare const BOOKMAKERS: Readonly<Record<number, string>>;
export declare const BET365_ID = 16;
/** Una cuota tal y como viene en el feed. */
export interface FeedOdd {
    readonly value: number;
    readonly opening?: number;
    readonly active?: boolean;
    readonly handicap?: {
        readonly value: number;
        readonly type?: string;
    } | null;
    readonly score?: string | null;
    readonly selection?: string | null;
    readonly bothTeamsToScore?: boolean | null;
    readonly eventParticipantId?: string | null;
}
/** Un bloque del feed: una casa, un tipo de mercado, un periodo. */
export interface FeedBlock {
    readonly bookmakerId: number;
    readonly bettingType: string;
    readonly bettingScope: string;
    readonly odds: readonly FeedOdd[];
}
/** Lo que devuelve `_hash=ope2`: quien es el local y quien el visitante. */
export interface Participants {
    readonly home: string;
    readonly away: string;
}
export interface AdapterOptions {
    readonly matchId: string;
    readonly participants: Participants;
    readonly observedAt?: number;
    readonly live?: boolean;
    /** Mercados a excluir. Por defecto los que Diego dejo fuera el 14-09. */
    readonly excludeTypes?: readonly string[];
    /** Tope de margen admitido por grupo, sobre el objetivo. Por defecto 35 %. */
    readonly maxRelativeOverround?: number;
    /** Casa en la que se apuesta: si su grupo no pasa el control, cae el grupo entero. */
    readonly primaryBookmakerId?: number;
}
export interface AdapterResult {
    readonly markets: readonly Market[];
    readonly dropped: readonly {
        readonly key: string;
        readonly reason: string;
    }[];
    readonly warnings: readonly string[];
}
/** Familias que NO se cargan por defecto. */
export declare const DEFAULT_EXCLUDED: readonly ["HALF_FULL_TIME", "CORRECT_SCORE", "NEXT_GOAL", "TO_QUALIFY"];
export declare function adaptFlashscoreOdds(blocks: readonly FeedBlock[], opts: AdapterOptions): AdapterResult;
