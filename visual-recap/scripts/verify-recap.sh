#!/usr/bin/env bash
# verify-recap.sh — fail if a recap drifted from the externalized runtime contract
set -euo pipefail

RECAP="${1:?usage: verify-recap.sh <recap.html>}"
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$SKILL_DIR/vendor"
ERR=0

fail() { echo "verify-recap: $*" >&2; ERR=1; }

grep -q 'recap-chrome\.css' "$RECAP" || fail "missing link to recap-chrome.css"
grep -q 'recap-runtime\.js' "$RECAP" || fail "missing script src for recap-runtime.js"

grep -q '<style' "$RECAP" && fail "inline <style> found — chrome must come from vendor/recap-chrome.css only"

python3 - "$RECAP" <<'PY' || fail "inline runtime <script> found — must use vendor/recap-runtime.js"
import re, sys
html = open(sys.argv[1]).read()
html = re.sub(r'<!--.*?-->', '', html, flags=re.S)
for m in re.finditer(r'<script(\s[^>]*)?>', html, re.I):
    attrs = (m.group(1) or '')
    if 'src=' in attrs.lower():
        continue
    if re.search(r'type\s*=\s*["\']text/plain["\']', attrs, re.I):
        continue
    sys.exit(1)
PY

for f in recap-chrome.css recap-runtime.js highlight-theme.css highlight.min.js mermaid.min.js rough.min.js Excalifont-Regular.woff2; do
  [[ -f "$VENDOR/$f" ]] || fail "missing vendor file: $VENDOR/$f"
done

while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  local_path="${path#file://}"
  [[ -e "$local_path" ]] || fail "broken file:// path in recap: $path"
done < <(grep -oE 'file://[^"'\'' ]+' "$RECAP" || true)

if [[ "$ERR" -ne 0 ]]; then
  exit 1
fi

echo "verify-recap: OK — $RECAP"
