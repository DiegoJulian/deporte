import type { Market, OddsQuote } from '../src/core/types.js';
import { asOdds } from '../src/core/types.js';

export const NOW = 1_757_800_000_000;

export const q = (bookmaker: string, odds: number, ageMs = 0, opening?: number): OddsQuote => ({
  bookmaker,
  odds: asOdds(odds),
  observedAt: NOW - ageMs,
  ...(opening !== undefined ? { openingOdds: asOdds(opening) } : {}),
});

export function market(
  id: string,
  matchId: string,
  family: string,
  kind: Market['kind'],
  outcomes: readonly [string, string, readonly OddsQuote[]][],
  line?: number,
): Market {
  return {
    id, matchId, family, kind, complete: true,
    ...(line !== undefined ? { line } : {}),
    outcomes: outcomes.map(([oid, label, quotes]) => ({ id: oid, label, quotes })),
  };
}

/** 1X2 de una sola casa. */
export const oneX2 = (id: string, matchId: string, book: string, h: number, d: number, a: number): Market =>
  market(id, matchId, '1X2', 'THREE_WAY', [
    ['HOME', 'Local', [q(book, h)]],
    ['DRAW', 'Empate', [q(book, d)]],
    ['AWAY', 'Visitante', [q(book, a)]],
  ]);

export const overUnder = (id: string, matchId: string, book: string, over: number, under: number, line = 2.5): Market =>
  market(id, matchId, 'OU', 'BINARY', [
    ['OVER', `Mas de ${line}`, [q(book, over)]],
    ['UNDER', `Menos de ${line}`, [q(book, under)]],
  ], line);

export const btts = (id: string, matchId: string, book: string, yes: number, no: number): Market =>
  market(id, matchId, 'BTTS', 'BINARY', [
    ['YES', 'Ambos marcan: si', [q(book, yes)]],
    ['NO', 'Ambos marcan: no', [q(book, no)]],
  ]);

export const close = (a: number, b: number, tol = 1e-9): boolean => Math.abs(a - b) <= tol;

// --- Generador de jornadas coherentes -------------------------------------
//
// Las cuotas del fixture NO se inventan a mano: se generan desde una
// distribucion de marcadores real (Dixon-Coles) y se les anade margen con la
// inversa exacta del metodo de potencia. Asi el fixture es internamente
// coherente —como lo son las cuotas de una casa de verdad— y el motor puede
// recuperar la verdad. Inventar cuotas a mano produce mercados imposibles que
// ningun modelo puede ajustar, y entonces el test mide el fixture, no el motor.

import { buildGrid, evaluate } from '../src/correlation/scoreGrid.js';
import { P } from '../src/correlation/predicates.js';
import type { MatchContext } from '../src/core/types.js';
import { brent } from '../src/core/numeric.js';

/** Inversa del devig por potencia: mete un margen exacto sobre las fair. */
export function applyMargin(fair: readonly number[], overround: number): number[] {
  const k = brent((kk) => fair.reduce((a, p) => a + p ** kk, 0) - (1 + overround), 0.2, 1.0, 1e-14);
  if (k === null) throw new Error('no se pudo aplicar el margen pedido');
  return fair.map((p) => p ** k);
}

export interface SyntheticMatch {
  readonly matchId: string;
  readonly home: string;
  readonly away: string;
  readonly lambda: number;
  readonly mu: number;
  readonly rho: number;
}

export interface SyntheticLeague {
  readonly matches: readonly MatchContext[];
  readonly markets: import('../src/core/types.js').Market[];
  readonly truth: ReadonlyMap<string, { lambda: number; mu: number; rho: number }>;
}

/**
 * Jornada sintetica coherente: 1X2 + Over/Under 2.5 + Ambos marcan por partido,
 * la casa principal mas `refs` casas de referencia con un ruido pequeno en los
 * parametros (que es lo que genera dispersion realista entre operadores).
 */
export function syntheticLeague(specs: readonly SyntheticMatch[], refs = 3, overround = 0.055): SyntheticLeague {
  const matches: MatchContext[] = specs.map((s) => ({
    matchId: s.matchId, league: 'LaLiga', home: s.home, away: s.away, startsAt: NOW + 3600_000,
  }));
  const markets: import('../src/core/types.js').Market[] = [];
  const truth = new Map<string, { lambda: number; mu: number; rho: number }>();

  const books = ['Bet365', ...Array.from({ length: refs }, (_, i) => `Ref${String.fromCharCode(65 + i)}`)];

  for (const s of specs) {
    truth.set(s.matchId, { lambda: s.lambda, mu: s.mu, rho: s.rho });
    const perBook = books.map((b, i) => {
      // Ruido determinista en los parametros de las casas de referencia.
      const jitter = i === 0 ? 0 : (((i * 37) % 7) - 3) / 100;
      const g = buildGrid(s.lambda * (1 + jitter), s.mu * (1 - jitter), s.rho);
      const x = [evaluate(g, P.homeWin()).win, evaluate(g, P.draw()).win, evaluate(g, P.awayWin()).win];
      const ou = [evaluate(g, P.over(2.5)).win, evaluate(g, P.under(2.5)).win];
      const bt = [evaluate(g, P.bttsYes()).win, evaluate(g, P.bttsNo()).win];
      const ovr = overround * (i === 0 ? 1 : 1 + jitter);
      return {
        book: b,
        x: applyMargin(x, ovr).map((r) => 1 / r),
        ou: applyMargin(ou, ovr * 0.8).map((r) => 1 / r),
        bt: applyMargin(bt, ovr * 0.8).map((r) => 1 / r),
      };
    });

    markets.push(market(`${s.matchId}-1x2`, s.matchId, '1X2', 'THREE_WAY', [
      ['HOME', 'Local', perBook.map((p) => q(p.book, p.x[0] as number))],
      ['DRAW', 'Empate', perBook.map((p) => q(p.book, p.x[1] as number))],
      ['AWAY', 'Visitante', perBook.map((p) => q(p.book, p.x[2] as number))],
    ]));
    markets.push(market(`${s.matchId}-ou`, s.matchId, 'OU', 'BINARY', [
      ['OVER', 'Mas de 2.5', perBook.map((p) => q(p.book, p.ou[0] as number))],
      ['UNDER', 'Menos de 2.5', perBook.map((p) => q(p.book, p.ou[1] as number))],
    ], 2.5));
    markets.push(market(`${s.matchId}-btts`, s.matchId, 'BTTS', 'BINARY', [
      ['YES', 'Ambos marcan si', perBook.map((p) => q(p.book, p.bt[0] as number))],
      ['NO', 'Ambos marcan no', perBook.map((p) => q(p.book, p.bt[1] as number))],
    ]));
  }
  return { matches, markets, truth };
}

export const JORNADA: readonly SyntheticMatch[] = [
  { matchId: 'p1', home: 'Real Madrid', away: 'Getafe', lambda: 2.10, mu: 0.70, rho: -0.06 },
  { matchId: 'p2', home: 'Athletic', away: 'Osasuna', lambda: 1.55, mu: 1.05, rho: -0.08 },
  { matchId: 'p3', home: 'Sevilla', away: 'Betis', lambda: 1.30, mu: 1.25, rho: -0.05 },
  { matchId: 'p4', home: 'Girona', away: 'Alaves', lambda: 1.70, mu: 0.95, rho: -0.07 },
  { matchId: 'p5', home: 'Villarreal', away: 'Celta', lambda: 1.65, mu: 1.10, rho: -0.04 },
];
