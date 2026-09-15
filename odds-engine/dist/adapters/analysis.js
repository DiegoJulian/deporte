import { DEFAULT_CONFIG } from '../config/index.js';
import { buildCombinations } from '../pipeline.js';
import { adaptFlashscoreOdds } from './flashscore.js';
export function analyseFeeds(req, cfg = DEFAULT_CONFIG) {
    const now = req.now ?? Date.now();
    const markets = [];
    const matches = [];
    const dropped = [];
    const warnings = [];
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
//# sourceMappingURL=analysis.js.map