---
name: visual-recap
description: Recap a local git diff as an interactive offline HTML page. Use when the user wants to verify what an agent session built, or to visually inspect a branch or commit range.
---

# visual-recap (offline)

Produce a single local HTML file that makes a change set reviewable at a glance: **"did the agent build what I think it built?"** The reader is you, on this machine, right after a session.

## What this is NOT
- No shareable/hosted links, no localhost server/bridge — never publish, never fetch (while authoring or at runtime).
- No MDX, no React, no build step. Output is plain HTML that references vendored assets by absolute `file://` path.

## Vendored runtime (already on disk)
- `vendor/highlight.min.js` + `vendor/highlight-theme.css` — syntax highlighting
- `vendor/mermaid.min.js` — diagrams
- `vendor/recap-chrome.css` — page styles (**.never inline in recaps**)
- `vendor/recap-runtime.js` — diff renderer, tabs, bionic toggle (**never inline in recaps**)
The template references these by absolute `file://` path.

## Workflow

### 1. Resolve the diff source
- If the user passed an explicit **commit SHA or `A..B` range**, use it.
- If the user named a **pull request** (e.g. "PR 274"), resolve the range in this order:
  1. `gh pr view <n> --json headRefName,baseRefName` (add `-R org/repo` when not in the repo root).
  2. If `gh` fails: inspect `git branch -vv` and upstream tracking for a likely PR head branch.
  3. If still ambiguous: ask the user for branch name or commit range. Do not silently guess across unrelated local edits.
  4. When inference was used, add one disclosure line in the TL;DR **What** (e.g. "Assumed PR 274 = feat/taxonomy vs master (gh unreachable).").
- Otherwise default to **working tree + committed work vs base branch**:
  - Base = `main` if it exists, else `master` (or whatever the user names).
  - Committed: `git diff <base>...HEAD`
  - Uncommitted: `git diff HEAD` (staged + unstaged) and `git status --porcelain`
- Gather, in this order:
  ```
  git diff --stat <range>          # file list + +/- counts for header + file-tree
  git diff <range>                 # the hunks
  git status --porcelain           # for the working-tree default only
  ```
- **Scope = this session's work.** If the working tree holds pre-existing edits unrelated to the session (use the conversation to tell), exclude them: no tabs, no tree entries, no counts — just one disclosure line in the TL;DR What or overview ("excludes N pre-existing files: …"). If scope is genuinely ambiguous, state the assumption in that same line.

### 2. Read the change, don't guess it
Read the actual hunks. Done means every changed file is accounted for. Identify:
- **The verdict** → the `tldr` banner (see below).
- **Key changes** → become 3–8 tabs. Group by feature/subsystem, not by file; every changed file is claimed by a tab (a residual "everything else" tab is fine).
- **Data shape changes** → a `data-model` block with change badges for every schema/type/model change in the diff; modified fields carry `was:` the prior value.
- **API/route changes** → an `api-endpoint` block (method, path, request/response) for every route change in the diff.
- **UI changes** → surface inventory (see 3c). Inventory the changed surfaces from the diff: entry surface, opened interaction surface (popover/dialog/panel), resulting state (incl. empty/error), role variants when permissions change. Done means each is listed or consciously skipped as trivial.
- **The overall shape** → one Mermaid `Change map` diagram in the overview (only if it clarifies).

### 3. Author the recap
1. Copy `reference/template.html` verbatim to `recaps/<YYYY-MM-DD>-<slug>.html` in the current project (create `recaps/` if missing; `<slug>` = short kebab summary; date = today).
2. **Resolve the vendor path before touching anything else.** Skill folders are sometimes a real directory under `.claude/skills/`, sometimes a symlink to `.agents/skills/`. Run `realpath` (or equivalent) on this skill's own directory to get the true on-disk path, then rewrite **every** vendored `file://` path in the copied file — two `<link>` tags (`highlight-theme.css`, `recap-chrome.css`) and three `<script>` tags (`highlight.min.js`, `mermaid.min.js`, `recap-runtime.js`) — if the resolved path differs. Do this once per machine/project; don't assume the path baked into the template is still correct.
3. Slot-fill only the marked regions: `<title>`, the header (eyebrow / title / case-line), the `.tldr` verdict stamp, `.overview`, file-tree, the `nav.tabs` buttons, and the `.tab-panel` sections. **Never touch** the vendored `<link>` / `<script src>` tags. **Never add inline `<style>` or inline runtime `<script>`** — chrome and runtime logic must stay in `vendor/recap-chrome.css` and `vendor/recap-runtime.js` so recaps cannot drift.
4. Use the block examples in the template as the exact markup contract — duplicate the ones you need, delete the rest. Blocks available: `rich-text` prose, `mermaid` diagram, `file-tree` (change badges), `diff` (`script.vr-diff`, collapsible, split/unified), `vr-notes` (line-anchored diff callouts), `annotated-code` (`language-<lang>` + `.note`), `data-model` table, `api-endpoint`.
5. **Diffs** — hard gate: **never hand-type hunk bodies.** Every `vr-diff` block must come from `git diff` output via `scripts/extract-hunk.sh` (run from the target git repo):
   ```
   <skill-dir>/scripts/extract-hunk.sh <range> -- <path>
   <skill-dir>/scripts/extract-hunk.sh <range> -- <path> <start-line> <end-line>   # new-side slice
   ```
   Paste stdout verbatim into `<script type="text/plain" class="vr-diff" data-lang="<lang>">…</script>`. Set `data-lang` from the file extension (`typescript`, `tsx`, `python`, `json`, …). Use `script` (not `pre`) so JSX/HTML tags in the hunk cannot break the page DOM. Do NOT hand-author highlighting or line markup.
   - **Truncation**: cut only at hunk boundaries or with `extract-hunk.sh` line slices. Never rewrite, paraphrase, or insert placeholder comments (`// ...`) inside a hunk.
   - **New files** (`added` in `--stat`): hunks use `@@ -0,0 +start,count @@` and every body line starts with `+`. Never use modified-file headers (`@@ -N,M +N,M @@`) on added files.
   - **Large new files**: prefer a contiguous slice (`extract-hunk.sh` with start/end). Cap ~80 lines per block; split into two collapsed `vr-diff` blocks or use `annotated-code` for narrative-only walkthroughs.
   - **No HTML escaping** inside `vr-diff`: paste raw `&&`, `<`, `>` — the `type="text/plain"` wrapper isolates the DOM. Never `&amp;`, `&lt;`, `&gt;`.
   - The runtime adds line numbers, syntax colors, word emphasis, and split/unified toggle. Keep the `@@ … @@` header. Anchor 2–4 `vr-notes` to **new-side** line numbers inside the hunk. Redaction (`•••redacted•••`) is the only other permitted edit.

### 3a. The TL;DR banner
A 3-second scannable verdict at the very top, for "trust or dig in?". It is NOT a shorter Overview — it is a different shape. Fill it so:
- **What** (`.what`): one plain line — mechanical, the scope of the diff.
- **Check** (2–3 `<li>`): judgment — the highest-value things to look at first, each naming a file/tab.
- **Facts row**: `N files`, `+added`/`−removed` (mechanical), then **Tests** — mechanical: did the diff add/modify test files? `ok "Tests ✅ present"` / `warn "⚠️ partial"` / `none "❌ none"`. Then **Risk** — judgment: `risk-low|risk-med|risk-high`.
- Keep it tight; if there's nothing worth checking, say so rather than padding.

### 3b. Prose voice (generated text only)
Applies to text you write: the TL;DR **What** line, **Check** items, the Overview, and tab intros. It does NOT apply to fixed UI labels, section headings, or block names ("Files touched", "Overview", "Endpoint") — leave those as furniture.

Write plain and direct. State what changed and what to check. No warm-up, no sign-off.
- Cut significance inflation. Not "this pivotal change establishes a robust foundation". Just "replaces the login path".
- Cut hedging and filler. "could potentially possibly" is "may". "in order to" is "to". Drop "it is worth noting", "as we can see".
- Use plain verbs. "is", not "serves as" or "acts as". "lets you", not "enables you to".
- No promotional adjectives (seamless, robust, streamlined, powerful), no vague attribution ("reviewers may find"), no Title Case sentences.
- No em-dashes. Use a period, comma, or colon.
- Be specific. Name the file or symbol, not "the relevant module".

Keep the structure. Bullets stay bullets; do not melt the TL;DR or Check list into a paragraph. Short fragments are fine in the verdict.

**Chunk for fast intake (the reader has ADHD).** Write for a 10-second entry layer, detail on demand:
- The **Overview** is **max ~3 bullets, one idea each**. No paragraphs.
- **Tab intros** are **one short sentence**, not a paragraph.
- **Diffs collapse by default**, each summary carrying a plain-language "what changed" phrase so it can be judged without expanding. Leave a diff open only if the verdict tells the reader to look there first.

The exact markup for all of this (`prose` class placement, `.sum`, `open`, `<b>` eye-anchors) is annotated in the template beside each block.

Before: "This pivotal change establishes a robust foundation, serving as the entry point for a more streamlined auth flow."
After: "Replaces password login with token sessions. Old path deleted."

### 3c. UI surfaces (UI changes)
If the diff changes rendered UI — components, styles, tokens, copy, navigation — the tab that owns it opens with the surface inventory and annotated-code; code diffs alone don't show what the user sees.

Render the step-2 inventory as **2–4 bullets** under a `UI surfaces` heading (or woven into the tab intro): name each surface, call out removed strings/controls, call out added strings/controls. Trivial visual changes (a typo, a comment) need no inventory.

Follow with **annotated-code** on the resulting component: every label, control, and state shown must be a string or symbol visible in the diff — never invent UI. Use a `.note` above the block for context; put `<span class="was">was: …</span>` on replaced labels (same pattern as `data-model`). On the diff below, anchor `vr-notes` to the lines that matter; use `was:` in the note when a label was replaced.

**Before/After without a second block:** tab-intro bullets carry the string-level delta. Add a second annotated-code block only when the diff deletes one component file and adds a separate replacement file.

### 3e. Extract hunks (mandatory before paste)
From the project git root:
```bash
SKILL="$(realpath <skill-dir>)"
$SKILL/scripts/extract-hunk.sh master...HEAD -- path/to/file.ts
$SKILL/scripts/extract-hunk.sh master...HEAD -- path/to/file.tsx 79 149
```
If `extract-hunk.sh` exits non-zero, the path is not in the range — do not fabricate a hunk.

### 3d. Verify before delivery (hard gate)
You **must** run the verifier and it **must** pass before you report the file path:
```
<skill-dir>/scripts/verify-recap.sh recaps/<YYYY-MM-DD>-<slug>.html
```
`verify-recap.sh` checks markup drift **and** runs `lint-hunks.sh` on every `vr-diff` (prefixes, `@@` counts, new-file format, no HTML entities, `vr-notes` line range). Only report the recap when the output is `verify-recap: OK`. If it fails, re-extract hunks with `extract-hunk.sh` or fix markup — do not weaken the linter.

### 4. Grounding rules (hard)
- **Mechanical vs judgment**: every structured block must derive mechanically from the real diff — if the diff doesn't contain a fact, omit the block; do not invent fields, endpoints, or params. Judgment (inferences, intent, risk) lives only in prose: `.overview`, tab intros, and the TL;DR Check/Risk slots. Annotated-code strings and surface-inventory bullets must still come from the diff.
- **Exhaustive**: everything the step-2 read identified lands in the recap — files in the tree and tabs, schema/type and route changes in blocks. A single block + one sentence under-serves the review.
- **Redaction is the one sanctioned edit to a pasted hunk.** If a hunk (or any block, note, or example) carries a secret — key, token, password, webhook URL, `.env` value — replace the value alone with `•••redacted•••`, keeping the line and key name intact so the diff still reads. A recap file outlives "local-only": it gets copied, screen-shared, pasted.

### 5. Report
1. Run `scripts/verify-recap.sh` and confirm `verify-recap: OK`.
2. Print the **absolute local file path** and tell the user to open it (double-click / `open <path>`). Do not produce a URL. Do not summarize the diff in chat — the recap is the deliverable.

## Notes
- `recaps/` is per-project and safe to `.gitignore`. The vendored libs live once in this skill dir, so recaps stay small.
- If a diff is enormous, prefer more tabs with tighter, collapsed diffs over one giant dump.
- Helper scripts in `scripts/`: `extract-hunk.sh` (git → paste-ready hunks), `lint-hunks.sh` (structural vr-diff checks), `verify-recap.sh` (markup drift + hunk lint).
