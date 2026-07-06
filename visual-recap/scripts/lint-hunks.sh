#!/usr/bin/env bash
# lint-hunks.sh — structural checks on script.vr-diff blocks inside a recap HTML file
set -euo pipefail

RECAP="${1:?usage: lint-hunks.sh <recap.html>}"

export RECAP
python3 <<'PY'
import os
import re
import sys

recap_path = os.environ["RECAP"]
html = open(recap_path, encoding="utf-8").read()
errors: list[str] = []

entity_re = re.compile(r"&(?:lt|gt|amp|quot|apos);")
hunk_header = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$")


def notes_tail(html: str, script_end: int) -> str:
    next_script = html.find('<script', script_end)
    details_end = html.find("</details>", script_end)
    stops = [i for i in (next_script, details_end) if i != -1]
    end = min(stops) if stops else len(html)
    return html[script_end:end]


def parse_hunks(lines: list[str]) -> list[tuple[str, list[str]]]:
    hunks: list[tuple[str, list[str]]] = []
    i = 0
    while i < len(lines):
        if not lines[i].startswith("@@"):
            i += 1
            continue
        header = lines[i]
        body: list[str] = []
        i += 1
        while i < len(lines):
            if lines[i].startswith("@@"):
                break
            body.append(lines[i])
            i += 1
        hunks.append((header, body))
    return hunks


def validate_hunk(header: str, hunk_lines: list[str]) -> tuple[int, int, int, int] | None:
    hm = hunk_header.match(header)
    if not hm:
        errors.append(f"malformed hunk header: {header!r}")
        return None

    old_start = int(hm.group(1))
    old_count = int(hm.group(2) or 1)
    new_start = int(hm.group(3))
    new_count = int(hm.group(4) or 1)
    is_new_file = old_start == 0 and (hm.group(2) in (None, "0"))

    for ln in hunk_lines:
        if not ln:
            errors.append("vr-diff hunk contains blank lines")
            break
        if ln.startswith("\\ No newline"):
            continue
        if ln[0] not in " +-":
            errors.append(f"vr-diff line with invalid prefix: {ln!r}")
            break

    plus = minus = space = 0
    for ln in hunk_lines:
        if ln.startswith("\\ No newline"):
            continue
        if ln.startswith("+"):
            plus += 1
        elif ln.startswith("-"):
            minus += 1
        elif ln.startswith(" "):
            space += 1

    actual_new = plus + space
    actual_old = minus + space

    if is_new_file:
        if minus > 0 or space > 0:
            errors.append("new-file hunk must contain only + lines (and @@ header)")
        if plus != new_count:
            errors.append(
                f"new-file hunk header says +{new_count} lines but found {plus} '+' lines"
            )
    else:
        if actual_new != new_count:
            errors.append(
                f"hunk header +{new_count} but counted {actual_new} new-side lines (+ and context)"
            )
        if actual_old != old_count:
            errors.append(
                f"hunk header -{old_count} but counted {actual_old} old-side lines (- and context)"
            )

    return new_start, new_count, new_start, new_start + new_count - 1


for m in re.finditer(
    r'<script[^>]*class="[^"]*\bvr-diff\b[^"]*"[^>]*>(.*?)</script>',
    html,
    re.I | re.S,
):
    body = m.group(1)
    if body.startswith("\n"):
        body = body[1:]
    if body.endswith("\n"):
        body = body[:-1]

    if entity_re.search(body):
        errors.append("vr-diff contains HTML entities (&lt;, &amp;, etc.) — paste raw git output")

    lines = body.splitlines()
    if not lines:
        errors.append("empty vr-diff block")
        continue

    hunks = parse_hunks(lines)
    if not hunks:
        errors.append("vr-diff missing @@ hunk header")
        continue

    ranges: list[tuple[int, int]] = []
    for header, hunk_lines in hunks:
        result = validate_hunk(header, hunk_lines)
        if result:
            new_start, new_count, lo, hi = result
            ranges.append((lo, hi))

    tail = notes_tail(html, m.end())
    notes_m = re.search(r'<ul class="vr-notes">(.*?)</ul>', tail, re.S)
    if notes_m and ranges:
        lo = min(r[0] for r in ranges)
        hi = max(r[1] for r in ranges)
        for note in re.finditer(r'data-line="(\d+)"', notes_m.group(1)):
            line_no = int(note.group(1))
            if not (lo <= line_no <= hi):
                errors.append(
                    f"vr-notes data-line={line_no} outside hunk new-side range {lo}-{hi}"
                )

if errors:
    for e in errors:
        print(f"lint-hunks: {e}", file=sys.stderr)
    sys.exit(1)

print(f"lint-hunks: OK — {recap_path}")
PY
