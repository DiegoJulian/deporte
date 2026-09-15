/**
 * La ÚNICA función que el backend necesita llamar.
 *
 * Entra el feed en crudo de uno o varios partidos, sale el análisis completo:
 * selecciones con su semáforo, combinadas ordenadas y veredicto. El backend no
 * tiene que saber nada del motor por dentro.
 */
import type { MatchContext, Selection } from '../core/types.js';
import type { EngineConfig } from '../config/index.js';
import type { OptimizerResult, OptimizerOptions } from '../optimize/index.js';
import { type FeedBlock, type Participants } from './flashscore.js';
export interface MatchFeed {
    readonly match: MatchContext;
    /** Lo que devuelve `_hash=oce` → `data.findOddsByEventId.odds`. */
    readonly blocks: readonly FeedBlock[];
    /** Lo que devuelve `_hash=ope2`: quién es el local y quién el visitante. */
    readonly participants: Participants;
    readonly live?: boolean;
}
export interface AnalysisRequest {
    readonly feeds: readonly MatchFeed[];
    readonly bookmaker?: string;
    readonly targetOdds?: number;
    readonly now?: number;
    readonly universe?: 'all' | 'top';
    readonly optimizer?: OptimizerOptions;
}
export interface AnalysisResponse {
    readonly generatedAt: number;
    readonly matches: number;
    readonly marketsLoaded: number;
    readonly marketsDropped: readonly {
        readonly key: string;
        readonly reason: string;
    }[];
    readonly selections: readonly Selection[];
    readonly gridsFitted: readonly string[];
    readonly optimisation: OptimizerResult;
    readonly warnings: readonly string[];
}
export declare function analyseFeeds(req: AnalysisRequest, cfg?: EngineConfig): AnalysisResponse;
