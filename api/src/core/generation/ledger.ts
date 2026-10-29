// ADR-021, C-012, F-010. The per-job token ledger: one balance that every model call of one job spends
// from (extract, compose, and any schema retry). The worker creates one per run and passes it down;
// a call without one is unbounded by construction, so it exists for tests only: every production call
// passes one (ADR-021 Amendment A; tests/guard/ledger-passed.guard.test.ts enforces it). spend() never throws: the gateway reads
// remaining() and decides, so the overdrawing response is still counted.

export interface TokenLedger {
  remaining(): number;
  spend(tokens: number): void;
}

export function createTokenLedger(budget: number): TokenLedger {
  let balance = budget;
  return {
    remaining: () => balance,
    spend(tokens: number): void {
      balance -= tokens;
    },
  };
}
