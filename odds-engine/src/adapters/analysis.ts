/**
 * La ÚNICA función que el backend necesita llamar.
 *
 * Entra el feed en crudo de uno o varios partidos, sale el análisis completo:
 * selecciones con su semáforo, combinadas ordenadas y veredicto. El backend no
 * tiene que saber nada del motor por dentro.
 */
import type { MatchContext, Market, Selection } from '../core/types.js';
import type { EngineConfig } from '../config/index.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { buildCombinations } from '../pipeline.js';
import type { OptimizerResult, OptimizerOptions } from '../optimize/index.js';
import { adaptFlashscoreOdds, type FeedBlock, type Participants } from './flashscore.js';

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
  readonly marketsDropped: readonly { readonly key: string; readonly reason: string }[];
  readonly selections: readonly Selection[];
  readonly gridsFitted: readonly string[];
  readonly optimisation: OptimizerResult;
  readonly warnings: readonly string[];
}

export function analyseFeeds(req: AnalysisRequest, cfg: EngineConfig = DEFAULT_CONFIG): AnalysisResponse {
  const now = req.now ?? Date.now();
  const markets: Market[] = [];
  const matches: MatchContext[] = [];
  const dropped: { key: string; reason: string }[] = [];
  const warnings: string[] = [];

  for (const f of req.feeds) {
    const a = adaptFlashscoreOdds(f.blocks, {
      matchId: f.match.matchId,
      participants: f.participants,
      observedAt: now,
      ...(f.live !== undefined ? { live: f.live } : {}),
    });
    markets.push(...a.markets);
    dropped.push(...a.dropped);
    warnings.push(...a.warnings.map((w) => `[${f.match.matchId}] ${w}`));
    matches.push(f.match);
  }

  const effective = req.targetOdds === undefined ? cfg
    : { ...cfg, optimizer: { ...cfg.optimizer, targetOdds: req.targetOdds } };

  const built = buildCombinations({
    matches, markets,
    bookmaker: req.bookmaker ?? 'Bet365',
    now,
    ...(req.universe !== undefined ? { universe: req.universe } : {}),
  }, effective, req.optimizer ?? {});

  return {
    generatedAt: now,
    matches: matches.length,
    marketsLoaded: markets.length,
    marketsDropped: dropped,
    selections: built.selections,
    gridsFitted: [...built.grids.keys()],
    optimisation: built.optimisation,
    warnings: [...warnings, ...built.warnings],
  };
}
