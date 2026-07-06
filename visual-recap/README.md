# visual-recap

Turn a git diff — working tree, branch, or commit range — into a single offline
HTML file that makes a change set reviewable at a glance.

`visual-recap` answers one question: **did the agent build what I think it
built?** Point it at a diff and it produces a self-contained recap you open
locally, with the shape of the change up front and the raw lines one click
away.

## What it produces

- A **TL;DR verdict** — one line on what changed, 2–3 things worth checking
  first, and mechanical facts (files, +/−, test coverage, risk).
- **UI surface bullets + annotated code** for component changes — inventory of
  what the user sees (popover, dialog, panel), then the resulting component
  with `was:` notes on replaced labels.
- **Split diffs** with syntax highlighting, word-level emphasis, and a
  Unified/Split toggle, plus line-anchored notes on the hunks that matter.
- **Data model** and **API endpoint** blocks for schema/contract changes, with
  `was:` the prior value on anything modified.
- A **file tree** with change badges, and a Mermaid diagram when the overall
  shape needs a picture.

Everything structured is derived mechanically from the real diff — no
invented fields, endpoints, or UI. Judgment (why it matters, what's risky)
lives only in the prose.

## When to use it

Ask for a recap after a session, branch, or PR-sized change — especially one
that's large, multi-file, or touches UI, schema, or API contracts. Skip it for
a one-file tweak; that reviews faster as a plain diff.

Trigger phrases: "recap this", "show me what changed", "review what you
built", or naming a branch/commit range to inspect.

## How it works

Everything runs locally and offline:

1. Reads the diff with `git diff` / `git status` — no network calls.
2. Extracts hunks with `scripts/extract-hunk.sh` — never hand-typed diff bodies.
3. Copies `reference/template.html` into `recaps/<date>-<slug>.html` in your
   project and slot-fills the marked regions.
4. The recap references vendored assets (`highlight.min.js`, `mermaid.min.js`,
   `recap-chrome.css`, `recap-runtime.js`) by absolute path, so it never
   fetches anything at runtime and works from any project.
5. `scripts/verify-recap.sh` checks markup drift and hunk structure before delivery.
6. You get back an absolute file path — open it with `open <path>` or a
   double-click.

No shareable links, no hosted service, no build step, no MDX/React. Recaps are
disposable per-project artifacts; `recaps/` is safe to `.gitignore`.

## Folder contents

| Path | Purpose |
|---|---|
| `SKILL.md` | The instructions the agent follows to author a recap |
| `reference/template.html` | The markup contract — every block type as a copyable example |
| `scripts/extract-hunk.sh` | Git diff → paste-ready `vr-diff` hunks (mandatory; never hand-type) |
| `scripts/lint-hunks.sh` | Structural checks on `vr-diff` blocks (called by verify) |
| `scripts/verify-recap.sh` | Markup drift + hunk lint hard gate before delivery |
| `vendor/` | Vendored highlight.js, mermaid.js, and recap chrome/runtime |

See `SKILL.md` for the full authoring workflow and grounding rules.
