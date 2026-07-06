#!/usr/bin/env bash
# extract-hunk.sh — stdout: unified hunk body ready to paste into script.vr-diff
# Never hand-type vr-diff content; always run this from the target git repo.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
usage: extract-hunk.sh <git-range> -- <path> [start-line [end-line]]

  Full file hunks:
    extract-hunk.sh master...HEAD -- src/foo.ts

  New-side line slice (contiguous + lines on added files, or new-side lines in modified hunks):
    extract-hunk.sh master...HEAD -- src/foo.ts 79 149

Runs: git -c diff.compact=false --no-pager diff <range> -- <path>
Exits non-zero if the path has no diff in the range.
EOF
  exit 2
}

[[ $# -ge 3 && "$2" == "--" ]] || usage

RANGE="$1"
PATH_ARG="$3"
shift 3
START="${1:-}"
END="${2:-}"

if [[ -n "$START" && -z "$END" ]]; then
  echo "extract-hunk: both start-line and end-line required for a slice" >&2
  exit 2
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "extract-hunk: not inside a git repository" >&2
  exit 1
fi

RAW="$(git -c diff.compact=false -c diff.noprefix=false --no-pager diff "$RANGE" -- "$PATH_ARG" 2>/dev/null || true)"

if [[ -z "$RAW" ]]; then
  echo "extract-hunk: no diff for '$PATH_ARG' in range '$RANGE'" >&2
  exit 1
fi

export RAW START END
python3 <<'PY'
import os
import re
import sys

raw = os.environ["RAW"]
start_s = os.environ.get("START", "")
end_s = os.environ.get("END", "")
slice_mode = bool(start_s)
start = int(start_s) if start_s else 0
end = int(end_s) if end_s else 0

if slice_mode and start > end:
    print("extract-hunk: start-line must be <= end-line", file=sys.stderr)
    sys.exit(1)

hunk_header = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$")


def parse_file_hunks(text: str) -> list[tuple[str, list[str]]]:
    lines = text.splitlines()
    hunks: list[tuple[str, list[str]]] = []
    i = 0
    while i < len(lines):
        m = hunk_header.match(lines[i])
        if not m:
            i += 1
            continue
        header = lines[i]
        body: list[str] = []
        i += 1
        while i < len(lines):
            if hunk_header.match(lines[i]) or lines[i].startswith("diff --git "):
                break
            if lines[i].startswith("\\ No newline"):
                body.append(lines[i])
                i += 1
                continue
            if lines[i] and lines[i][0] in " +-":
                body.append(lines[i])
            i += 1
        hunks.append((header, body))
    return hunks


def hunk_new_lines(header: str, body: list[str]) -> list[tuple[int, str]]:
    m = hunk_header.match(header)
    if not m:
        return []
    new_start = int(m.group(3))
    numbered: list[tuple[int, str]] = []
    cur = new_start
    for line in body:
        if not line:
            continue
        prefix = line[0]
        content = line[1:]
        if prefix == " ":
            numbered.append((cur, "+" + content))
            cur += 1
        elif prefix == "+":
            numbered.append((cur, line))
            cur += 1
        elif prefix == "-":
            continue
    return numbered


def emit_slice(header: str, body: list[str], lo: int, hi: int) -> str | None:
    m = hunk_header.match(header)
    if not m:
        return None

    picked = [(n, ln) for n, ln in hunk_new_lines(header, body) if lo <= n <= hi]
    if not picked:
        return None

    slice_start = picked[0][0]
    slice_lines = [ln for _, ln in picked]
    count = len(slice_lines)
    suffix = m.group(5) or ""
    new_header = f"@@ -0,0 +{slice_start},{count} @@"
    if suffix.strip():
        new_header = f"@@ -0,0 +{slice_start},{count} @@{suffix}"
    return new_header + "\n" + "\n".join(slice_lines)


hunks = parse_file_hunks(raw)
if not hunks:
    print("extract-hunk: could not parse hunks from git diff output", file=sys.stderr)
    sys.exit(1)

if slice_mode:
    parts: list[str] = []
    for header, body in hunks:
        chunk = emit_slice(header, body, start, end)
        if chunk:
            parts.append(chunk)
    if not parts:
        print(
            f"extract-hunk: no new-side lines {start}-{end} in hunks for this file",
            file=sys.stderr,
        )
        sys.exit(1)
    sys.stdout.write("\n".join(parts) + "\n")
else:
    out: list[str] = []
    for header, body in hunks:
        out.append(header)
        out.extend(body)
    sys.stdout.write("\n".join(out) + "\n")
PY
