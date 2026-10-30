#!/usr/bin/env bash
# Oracle harness: compare the Driftwatch engine with oasdiff over two revisions of a
# public spec. See README.md. Network access required. Not for CI.
set -euo pipefail

OASDIFF_VERSION="1.35.0"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
WORK="$HERE/work"
BIN="$WORK/bin"

usage() {
  echo "usage: $0 <stripe|github|twilio> <old-commit> <new-commit>" >&2
  exit 2
}

[ $# -eq 3 ] || usage
NAME="$1"; OLD="$2"; NEW="$3"

case "$NAME" in
  stripe) REPO="stripe/openapi"; FILE="openapi/spec3.json" ;;
  github) REPO="github/rest-api-description"; FILE="descriptions/api.github.com/api.github.com.json" ;;
  twilio) REPO="twilio/twilio-oai"; FILE="spec/json/twilio_api_v2010.json" ;;
  *) usage ;;
esac

# Commits must look like commits. Never interpolate unchecked input into URLs.
for c in "$OLD" "$NEW"; do
  [[ "$c" =~ ^[0-9a-f]{7,40}$ ]] || { echo "commit must be a hex SHA: $c" >&2; exit 2; }
done

mkdir -p "$BIN" "$WORK/$NAME"

# --- oasdiff binary, verified against the release checksums ---------------------------
install_oasdiff() {
  local os arch asset url
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$os" in
    darwin) asset="oasdiff_${OASDIFF_VERSION}_darwin_all.tar.gz" ;;
    linux)
      case "$arch" in
        x86_64|amd64) asset="oasdiff_${OASDIFF_VERSION}_linux_amd64.tar.gz" ;;
        aarch64|arm64) asset="oasdiff_${OASDIFF_VERSION}_linux_arm64.tar.gz" ;;
        *) echo "unsupported arch $arch" >&2; exit 1 ;;
      esac ;;
    *) echo "unsupported os $os" >&2; exit 1 ;;
  esac
  url="https://github.com/oasdiff/oasdiff/releases/download/v${OASDIFF_VERSION}"
  if [ ! -x "$BIN/oasdiff" ]; then
    echo "downloading $asset"
    curl -fsSL -o "$BIN/$asset" "$url/$asset"
    curl -fsSL -o "$BIN/checksums.txt" "$url/checksums.txt"
    local expected actual
    expected="$(grep " $asset\$" "$BIN/checksums.txt" | awk '{print $1}')"
    [ -n "$expected" ] || { echo "no checksum for $asset" >&2; exit 1; }
    if command -v sha256sum >/dev/null; then actual="$(sha256sum "$BIN/$asset" | awk '{print $1}')";
    else actual="$(shasum -a 256 "$BIN/$asset" | awk '{print $1}')"; fi
    [ "$expected" = "$actual" ] || { echo "checksum mismatch for $asset" >&2; exit 1; }
    tar -xzf "$BIN/$asset" -C "$BIN" oasdiff
    chmod +x "$BIN/oasdiff"
  fi
}
install_oasdiff

# --- specs ------------------------------------------------------------------------------
fetch_spec() {
  local sha="$1" out="$2"
  [ -s "$out" ] || curl -fsSL -o "$out" "https://raw.githubusercontent.com/$REPO/$sha/$FILE"
}
OLD_FILE="$WORK/$NAME/$OLD.json"
NEW_FILE="$WORK/$NAME/$NEW.json"
fetch_spec "$OLD" "$OLD_FILE"
fetch_spec "$NEW" "$NEW_FILE"

# --- run both tools ---------------------------------------------------------------------
"$BIN/oasdiff" changelog "$OLD_FILE" "$NEW_FILE" --format json > "$WORK/$NAME/oasdiff.json" || true
node "$HERE/run-driftwatch.mjs" "$ROOT" "$OLD_FILE" "$NEW_FILE" > "$WORK/$NAME/driftwatch.json"
node "$HERE/compare.mjs" "$WORK/$NAME/oasdiff.json" "$WORK/$NAME/driftwatch.json" > "$WORK/$NAME/report.md"
echo "report: $WORK/$NAME/report.md"
