# Delegated Decision Authority

## Principle

The repository owner may delegate ordinary implementation decisions after an
agent presents a concrete recommendation with alternatives, rationale, scope,
and verification plan. A gated specification that records that recommendation
is approved for implementation without a second, item-by-item confirmation.
The delegation avoids approval fatigue; it does not weaken safety boundaries.

## How to apply

- A spec defaults to `authority: delegated` when its Architecture Review has
  completed alternatives, decision, affected scope, and test plan. The
  `GATE-APPROVAL` guard records standing delegated authority and advances it.
- Use `authority: confirmation-required` when a material product direction,
  architecture boundary, cost model, or provider role is being selected. The
  guard then requires a direct, post-design owner confirmation.
- The following are execution-time exceptions regardless of spec authority:
  chargeable resource or billing changes; production DNS changes; deletion or
  overwrite of existing production data; external communications; account
  creation/closure; secret disclosure; and a new external runtime, proxy,
  queue, cache, or managed service. Stop immediately before the irreversible
  action and request narrowly scoped confirmation.
- A delegated implementation may prepare an exception, run read-only checks,
  build candidates, and report its recommended final action. It may not perform
  that final external mutation until the relevant confirmation exists.

## Enforcement

`backlog-gate-guard` enforces the `authority` field at GATE-APPROVAL, and
`authority-delegation-contract.test.mjs` rejects removal of this rule, the
allowed frontmatter values, or the guard's delegated/confirmation-required
branches. The deployment guide remains the authority for production execution
exceptions.
