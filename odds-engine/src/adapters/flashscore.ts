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
import type { Market, MarketKind, OddsQuote, Outcome, Period } from '../core/types.js';
import { asOdds } from '../core/types.js';
import { sum } from '../core/numeric.js';

/** Las 11 casas espanolas que trae la misma respuesta. Bet365 es la 16. */
export const BOOKMAKERS: Readonly<Record<number, string>> = {
  16: 'Bet365', 406: 'Sportium.es', 883: 'Winamax.es', 1003: '1xBet.es',
  991: 'Versus.es', 26: 'Betway', 1121: 'Retabet', 27: '888sport',
  1087: 'Codere', 526: 'Speedybet.es', 15: 'William Hill',
};
export const BET365_ID = 16;

/** Una cuota tal y como viene en el feed. */
export interface FeedOdd {
  readonly value: number;
  readonly opening?: number;
  readonly active?: boolean;
  readonly handicap?: { readonly value: number; readonly type?: string } | null;
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
  readonly dropped: readonly { readonly key: string; readonly reason: string }[];
  readonly warnings: readonly string[];
}

/** Familias que NO se cargan por defecto. */
export const DEFAULT_EXCLUDED = ['HALF_FULL_TIME', 'CORRECT_SCORE', 'NEXT_GOAL', 'TO_QUALIFY'] as const;

const PERIOD: Readonly<Record<string, Period>> = {
  FULL_TIME: 'FULL_TIME', FIRST_HALF: 'FIRST_HALF', SECOND_HALF: 'SECOND_HALF',
};

interface FamilySpec {
  readonly family: string;
  readonly kind: MarketKind;
  readonly target: number;
  /** Cada grupo es un mercado independiente (una linea de over/under, p. ej.). */
  readonly byLine: boolean;
}

const FAMILY: Readonly<Record<string, FamilySpec>> = {
  HOME_DRAW_AWAY:       { family: '1X2',     kind: 'THREE_WAY', target: 1, byLine: false },
  HOME_AWAY:            { family: 'ML',      kind: 'BINARY',    target: 1, byLine: false },
  DRAW_NO_BET:          { family: 'DNB',     kind: 'BINARY',    target: 1, byLine: false },
  DOUBLE_CHANCE:        { family: 'DC',      kind: 'THREE_WAY', target: 2, byLine: false },
  OVER_UNDER:           { family: 'OU',      kind: 'BINARY',    target: 1, byLine: true },
  BOTH_TEAMS_TO_SCORE:  { family: 'BTTS',    kind: 'BINARY',    target: 1, byLine: false },
  ODD_OR_EVEN:          { family: 'ODDEVEN', kind: 'BINARY',    target: 1, byLine: false },
  ASIAN_HANDICAP:       { family: 'AH',      kind: 'BINARY',    target: 1, byLine: true },
  EUROPEAN_HANDICAP:    { family: 'EH',      kind: 'THREE_WAY', target: 1, byLine: true },
  CORRECT_SCORE:        { family: 'CS',      kind: 'MULTI_WAY', target: 1, byLine: false },
};

/** Identifica la salida dentro de su bloque. null = no identificable ⇒ se tira. */
function outcomeIdOf(type: string, o: FeedOdd, p: Participants): string | null {
  switch (type) {
    case 'HOME_DRAW_AWAY':
      if (o.eventParticipantId === p.home) return 'HOME';
      if (o.eventParticipantId === p.away) return 'AWAY';
      if (o.eventParticipantId === null || o.eventParticipantId === undefined) return 'DRAW';
      return null;
    case 'HOME_AWAY':
    case 'DRAW_NO_BET':
      if (o.eventParticipantId === p.home) return 'HOME';
      if (o.eventParticipantId === p.away) return 'AWAY';
      return null;
    case 'DOUBLE_CHANCE':
      // El equipo + empate lleva su eventParticipantId; el «1 o 2» va con null.
      if (o.eventParticipantId === p.home) return '1X';
      if (o.eventParticipantId === p.away) return 'X2';
      if (o.eventParticipantId === null || o.eventParticipantId === undefined) return '12';
      return null;
    case 'OVER_UNDER':
      return o.selection === 'OVER' ? 'OVER' : o.selection === 'UNDER' ? 'UNDER' : null;
    case 'ODD_OR_EVEN':
      return o.selection === 'ODD' ? 'ODD' : o.selection === 'EVEN' ? 'EVEN' : null;
    case 'BOTH_TEAMS_TO_SCORE':
      return o.bothTeamsToScore === true ? 'YES' : o.bothTeamsToScore === false ? 'NO' : null;
    case 'ASIAN_HANDICAP':
    case 'EUROPEAN_HANDICAP':
      if (o.eventParticipantId === p.home) return 'HOME';
      if (o.eventParticipantId === p.away) return 'AWAY';
      if (o.eventParticipantId === null || o.eventParticipantId === undefined) return 'DRAW';
      return null;
    case 'CORRECT_SCORE':
      return typeof o.score === 'string' && /^\d+:\d+$/.test(o.score) ? o.score.replace(':', '-') : null;
    default:
      return null;
  }
}

/**
 * Linea del grupo, SIEMPRE en perspectiva del local.
 * El feed trae el handicap desde el punto de vista de cada lado, asi que el
 * visitante llega con el signo cambiado y hay que darle la vuelta.
 */
function lineOf(type: string, o: FeedOdd, p: Participants): number | null {
  if (type === 'OVER_UNDER') return o.handicap?.value ?? null;
  if (type === 'ASIAN_HANDICAP' || type === 'EUROPEAN_HANDICAP') {
    const h = o.handicap?.value;
    if (h === undefined || h === null) return null;
    return o.eventParticipantId === p.away ? -h : h;
  }
  return null;
}

export function adaptFlashscoreOdds(blocks: readonly FeedBlock[], opts: AdapterOptions): AdapterResult {
  const now = opts.observedAt ?? Date.now();
  const excluded = new Set<string>(opts.excludeTypes ?? DEFAULT_EXCLUDED);
  const maxOver = opts.maxRelativeOverround ?? 0.35;
  const primary = opts.primaryBookmakerId ?? BET365_ID;
  const dropped: { key: string; reason: string }[] = [];
  const warnings: string[] = [];

  /** clave del mercado -> salida -> lista de cuotas por casa */
  type Bucket = {
    spec: FamilySpec; period: Period; line: number | null;
    quotes: Map<string, OddsQuote[]>;
    perBook: Map<number, Map<string, number>>;
  };
  const buckets = new Map<string, Bucket>();

  for (const block of blocks) {
    const bookName = BOOKMAKERS[block.bookmakerId];
    if (bookName === undefined) continue;                       // casa fuera del proyecto
    if (excluded.has(block.bettingType)) continue;
    const spec = FAMILY[block.bettingType];
    if (spec === undefined) {
      if (!warnings.some((w) => w.includes(block.bettingType))) {
        warnings.push(`Tipo de mercado no soportado, ignorado: ${block.bettingType}.`);
      }
      continue;
    }
    const period = PERIOD[block.bettingScope] ?? 'OTHER';

    for (const o of block.odds) {
      if (!(typeof o.value === 'number' && o.value > 1)) continue;
      if (o.active === false) continue;
      const outcomeId = outcomeIdOf(block.bettingType, o, opts.participants);
      if (outcomeId === null) continue;
      const line = spec.byLine ? lineOf(block.bettingType, o, opts.participants) : null;
      if (spec.byLine && line === null) continue;

      const key = `${opts.matchId}|${spec.family}|${period}${line === null ? '' : `@${line}`}`;
      let b = buckets.get(key);
      if (b === undefined) {
        b = { spec, period, line, quotes: new Map(), perBook: new Map() };
        buckets.set(key, b);
      }
      const list = b.quotes.get(outcomeId) ?? [];
      list.push({
        bookmaker: bookName, odds: asOdds(o.value), observedAt: now,
        ...(typeof o.opening === 'number' && o.opening > 1 ? { openingOdds: asOdds(o.opening) } : {}),
      });
      b.quotes.set(outcomeId, list);
      const bb = b.perBook.get(block.bookmakerId) ?? new Map<string, number>();
      bb.set(outcomeId, o.value);
      b.perBook.set(block.bookmakerId, bb);
    }
  }

  // --- Control de margen por grupo y por casa ---
  // Un grupo mal formado (handicaps mezclados, salida que falta) suma cualquier
  // cosa menos un margen plausible. Este control lo caza solo.
  const markets: Market[] = [];
  for (const [key, b] of buckets) {
    const outcomeIds = [...b.quotes.keys()];
    const expected = expectedOutcomes(b.spec);
    if (expected !== null && outcomeIds.length !== expected) {
      dropped.push({ key, reason: `${outcomeIds.length} salidas, se esperaban ${expected}` });
      continue;
    }

    const badBooks = new Set<number>();
    for (const [bookId, sel] of b.perBook) {
      if (sel.size !== outcomeIds.length) { badBooks.add(bookId); continue; }
      const s = sum([...sel.values()].map((c) => 1 / c));
      const rel = s / b.spec.target - 1;
      if (rel < -1e-9 || rel > maxOver) badBooks.add(bookId);
    }
    if (badBooks.has(primary)) {
      dropped.push({ key, reason: `la casa principal no pasa el control de margen (objetivo ${b.spec.target})` });
      continue;
    }

    const outcomes: Outcome[] = outcomeIds.map((id) => ({
      id, label: labelOf(b.spec.family, id, b.line),
      quotes: (b.quotes.get(id) as OddsQuote[]).filter((q) => {
        const bookId = Number(Object.keys(BOOKMAKERS).find((k) => BOOKMAKERS[Number(k)] === q.bookmaker));
        return !badBooks.has(bookId);
      }),
    })).filter((o) => o.quotes.length > 0);

    if (outcomes.length !== outcomeIds.length) {
      dropped.push({ key, reason: 'alguna salida se quedo sin ninguna casa valida' });
      continue;
    }

    markets.push({
      id: key, matchId: opts.matchId, kind: b.spec.kind, family: b.spec.family,
      ...(b.line !== null ? { line: b.line } : {}),
      outcomes, complete: true, period: b.period,
      normalisationTarget: b.spec.target,
      ...(opts.live !== undefined ? { live: opts.live } : {}),
    });
  }

  if (dropped.length > 0) warnings.push(`${dropped.length} bloque(s) descartados por el control de coherencia.`);
  return { markets, dropped, warnings };
}

function expectedOutcomes(spec: FamilySpec): number | null {
  if (spec.kind === 'THREE_WAY') return 3;
  if (spec.kind === 'BINARY') return 2;
  return null;                                   // marcador correcto: variable
}

function labelOf(family: string, id: string, line: number | null): string {
  const l = line === null ? '' : ` ${line > 0 ? '+' : ''}${line}`;
  switch (family) {
    case '1X2': return id === 'HOME' ? 'Local' : id === 'DRAW' ? 'Empate' : 'Visitante';
    case 'DC': return id === '1X' ? 'Local o empate' : id === '12' ? 'Local o visitante' : 'Empate o visitante';
    case 'DNB': return id === 'HOME' ? 'Local (empate no valido)' : 'Visitante (empate no valido)';
    case 'OU': return id === 'OVER' ? `Mas de ${line}` : `Menos de ${line}`;
    case 'BTTS': return id === 'YES' ? 'Ambos marcan: si' : 'Ambos marcan: no';
    case 'ODDEVEN': return id === 'ODD' ? 'Impar' : 'Par';
    case 'AH': return `${id === 'HOME' ? 'Local' : 'Visitante'} hand. asiatico${l}`;
    case 'EH': return `${id === 'HOME' ? 'Local' : id === 'AWAY' ? 'Visitante' : 'Empate'} hand. europeo${l}`;
    default: return `${family} ${id}`;
  }
}
