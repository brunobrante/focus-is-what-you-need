# E2E test suite (Playwright) — planned

Status: planned, not started. Pure planning doc — no implementation yet.

## Idea

A Playwright suite that runs against Tauri (desktop) and against the browser
(Chrome + Firefox), and acts as the **practical, executable version of
`Product.md`**: `Product.md` states the law in prose, this suite enforces it.
If a test fails, a product rule was broken — not a style nitpick, not a
implementation detail.

Coverage should aim to be **complete**: every business rule / UX law that
matters for correctness ends up as a test here, not just happy-path smoke
checks.

## How this doc will be filled

This is a dictation log, not a spec written up front. When ready to start:

1. The user dictates a feature/rule out loud, one at a time.
2. Claude adds an entry below: the rule in one line + a test description
   (what the test does, what it asserts, what failure means).
3. Repeat per feature. The list grows incrementally, in the order dictated —
   no need to pre-organize or batch.

Once there's enough of a backlog, entries get turned into actual Playwright
specs (separate work, not part of this doc).

## Entries

<!-- Format:
### <feature/rule name>
- Rule: <one-line business rule from Product.md / UX.md>
- Test: <what the test does and asserts>
- Targets: tauri | chrome | firefox | all
-->

(none yet)
