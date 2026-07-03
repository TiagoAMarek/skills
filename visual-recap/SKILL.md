---
name: visual-recap
description: Turn a local git diff (working tree, branch, or commit range) into an offline interactive HTML recap for verifying what was built. Use when the user wants a recap of a session's changes, to review or verify what the agent built, or to visually inspect a branch or commit range.
---

# visual-recap (offline)

Produce a single local HTML file that makes a change set reviewable at a glance: **"did the agent build what I think it built?"** The reader is you, on this machine, right after a session.

## What this is NOT
- No shareable/hosted links, no localhost server/bridge — never publish, never call the network at runtime.
- No MDX, no React, no build step. Output is plain HTML that references two **vendored** libs by absolute `file://` path.

## Vendored runtime (already on disk — do not fetch)
- `vendor/mermaid.min.js` — diagrams
- `vendor/highlight.min.js` + `vendor/highlight-theme.css` — syntax highlighting
The template already points at these by absolute path.

## Workflow

### 1. Resolve the diff source
- If the user passed an explicit **commit SHA or `A..B` range**, use it.
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

### 2. Read the change, don't guess it
Read the actual hunks. Done means every changed file is accounted for. Identify:
- **The verdict** → the `tldr` banner (see below).
- **Key changes** → become 3–8 tabs. Group by feature/subsystem, not by file; every changed file is claimed by a tab (a residual "everything else" tab is fine).
- **Data shape changes** → a `data-model` block with change badges for every schema/type/model change in the diff.
- **API/route changes** → an `api-endpoint` block (method, path, request/response) for every route change in the diff.
- **The overall shape** → one Mermaid `Change map` diagram in the overview (only if it clarifies).

### 3. Author the recap
1. Copy `reference/template.html` verbatim to `recaps/<YYYY-MM-DD>-<slug>.html` in the current project (create `recaps/` if missing; `<slug>` = short kebab summary; date = today).
2. Slot-fill only the marked regions: `<title>`, the header (eyebrow / title / case-line), the `.tldr` verdict stamp, `.overview`, file-tree, the `nav.tabs` buttons, and the `.tab-panel` sections. **Never touch** the `<head>`, the vendored `<script>/<link>` paths, or the trailing `<script>` block.
3. Use the block examples in the template as the exact markup contract — duplicate the ones you need, delete the rest. Blocks available: `rich-text` prose, `mermaid` diagram, `file-tree` (change badges), `diff` (`pre.vr-diff`, collapsible), `annotated-code` (`language-<lang>` + `.note`), `data-model` table, `api-endpoint`.
4. **Diffs**: paste the RAW unified git hunk (including the `@@ … @@` header) as plain text into `<pre class="vr-diff" data-lang="<lang>">`, with `data-lang` set from the file extension (e.g. `typescript`, `python`, `go`, `json`). Do NOT hand-author highlighting or line markup. A runtime renderer adds line-number gutters, per-line syntax colors, and word-level emphasis of the changed tokens. Keep the `@@ … @@` header — the line numbers come from it. New-file walkthroughs still use `<code class="language-<lang>">` (annotated-code).

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

### 4. Grounding rules (hard)
- **Mechanical vs judgment**: every structured block must derive mechanically from the real diff — if the diff doesn't contain a fact, omit the block; do not invent fields, endpoints, or params. Judgment (inferences, intent, risk) lives only in prose: `.overview`, tab intros, and the TL;DR Check/Risk slots.
- **Exhaustive**: every changed file appears in the file-tree and is claimed by a tab; every schema/type and route change in the diff is carried by a block. A single block + one sentence under-serves the review.

### 5. Report
Print the **absolute local file path** and tell the user to open it (double-click / `open <path>`). Do not produce a URL. Do not summarize the diff in chat — the recap is the deliverable.

## Notes
- `recaps/` is per-project and safe to `.gitignore`. The vendored libs live once in this skill dir, so recaps stay small.
- If a diff is enormous, prefer more tabs with tighter, collapsed diffs over one giant dump.
