/**
 * Coherencia entre mercados del mismo partido.
 *
 * 1X2, doble oportunidad y empate no valido no son mercados independientes:
 * son la MISMA distribucion escrita de tres maneras. Si las tres no dan las
 * mismas probabilidades, una esta mal puesta. Es la via de deteccion de errores
 * de precio que no necesita una segunda casa (objetivo fijado el 13-09-2026).
 *
 *   DC(1X) = P(1) + P(X)        DC(12) = P(1) + P(2)       DC(X2) = P(X) + P(2)
 *   DNB(1) = P(1) / (P(1)+P(2))
 */

export interface ThreeWayFair { readonly home: number; readonly draw: number; readonly away: number; }

export interface CoherenceCheck {
  readonly market: string;
  readonly outcome: string;
  readonly implied: number;
  readonly observed: number;
  readonly deltaPoints: number;
  /** El signo dice a favor de quien esta el desajuste si apostamos ese precio. */
  readonly edgeIfObservedIsRight: number;
}

export interface CoherenceReport {
  readonly checks: readonly CoherenceCheck[];
  readonly maxDeltaPoints: number;
  readonly incoherent: boolean;
}

export interface CoherenceInput {
  readonly threeWay: ThreeWayFair;
  /** Probabilidades fair observadas en otros mercados del mismo partido. */
  readonly doubleChance?: { readonly homeOrDraw?: number; readonly homeOrAway?: number; readonly drawOrAway?: number };
  readonly drawNoBet?: { readonly home?: number; readonly away?: number };
}

export function checkCoherence(input: CoherenceInput, tolerancePoints = 0.015): CoherenceReport {
  const { home, draw, away } = input.threeWay;
  const checks: CoherenceCheck[] = [];
  const add = (market: string, outcome: string, implied: number, observed: number | undefined): void => {
    if (observed === undefined) return;
    const delta = observed - implied;
    checks.push({
      market, outcome, implied, observed,
      deltaPoints: delta,
      // Si el precio observado se cotiza a 1/observed y la verdad es `implied`:
      edgeIfObservedIsRight: implied / observed - 1,
    });
  };

  add('DC', '1X', home + draw, input.doubleChance?.homeOrDraw);
  add('DC', '12', home + away, input.doubleChance?.homeOrAway);
  add('DC', 'X2', draw + away, input.doubleChance?.drawOrAway);
  const denom = home + away;
  if (denom > 0) {
    add('DNB', '1', home / denom, input.drawNoBet?.home);
    add('DNB', '2', away / denom, input.drawNoBet?.away);
  }

  const maxDelta = checks.length === 0 ? 0 : Math.max(...checks.map((c) => Math.abs(c.deltaPoints)));
  return { checks, maxDeltaPoints: maxDelta, incoherent: maxDelta > tolerancePoints };
}
