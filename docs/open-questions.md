# Open questions — 2026-08-02

All eight items are now decided and done. Kept as a record of what was decided and how each
was verified; delete this file whenever it stops being useful.

---

## Q1 · D-308 — source changes lost sub-agent skill assignments (CLI) — ✅ fixed

Decision: fix. The write boundary (`writeProjectPartial` in the config-gate) now normalises the
stack before re-emitting, so the pick-one category assignments survive. Tests failed first
(two unit, one end-to-end through the real `eject --source`), then passed. Verified by hand:
a sandbox install's `"web-framework"` assignment survives `eject skills --source` and the
generated files still typecheck.

## Q2 · D-307 — settings overlay ate the letter "s" (CLI) — ✅ hidden behind a flag

Decision: hide the `s` toggle and its overlay behind a feature flag. `WIZARD_SETTINGS_OVERLAY`
(default off) now gates both the hotkey and the overlay; the typing bug is documented on the
flag and must be fixed before anyone flips it on. The seven tests that exercised the overlay
are gated on the flag (skipped, not deleted). Verified against the real wizard: pressing `s`
on the sources step does nothing.

## Q3 · D-309 — the gate's internal writer authorised itself (CLI) — ✅ fixed

Decision: fix. The "I'm inside the gate" permission is now granted only by the gate's public
functions; the internal writer requires it and can no longer mint it. Tests failed first
(calling the internal writer directly now throws, and provably writes nothing), then passed.

## Q4 · Command name (CLI) — ✅ both names work

Decision: people can use both `agents-inc init` and `agentsinc init`. The package now installs
both command names pointing at the same program — nothing breaks for anyone. Verified with a
real sandboxed `npm install -g`: both commands run and print the version.

## Q5 · Command form in docs and comments (CLI) — ✅ npx everywhere

Decision: `npx agents-inc <command>` is the one form, everywhere an instruction appears —
docs, guides, agent files, code comments. Swept (20+ files); the convention is recorded next
to `CLI_INVOKE_COMMAND` in `consts.ts`. Prose that merely mentions a command's name (not an
instruction) stays bare.

## Q6 · `update` and other projects (CLI) — ✅ yes

Decision: yes. `agents-inc update` now recompiles every registered project's agents after
refreshing skill content, and says so ("Recompiled agents in N registered projects"). Test
failed first, then passed; verified against the real binary.

## Q7 · Saved stack highlight + clean baseline (web) — ✅ fixed

Decision: the saved stack is a typical stack. Applying it (or clicking Save) highlights the
saved cell — not "Start from scratch" — and counts as clean: switching to another stack asks
nothing until you actually edit. Derived by comparing the current selection to the snapshot,
so it survives reloads with no new stored state. Four tests failed first, then passed; full
web suite 177/0. Known small edge (fails safe): toggling a skill off and back on reorders the
selection and reads as an edit, so you may see an unnecessary confirm — never a skipped one.

## Q8 · Test helper duplicating the "nothing changed" object (CLI) — ✅ fixed

The helper imports the shared constant now.
