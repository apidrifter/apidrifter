#!/bin/sh
# PostToolUse hook for the apidrifter plugin (Edit, Write, MultiEdit).
#
# Reads the hook input JSON from stdin. If the edited file is an OpenAPI document
# (openapi.*, swagger.*, *.openapi.yaml, *.openapi.json) or lives under a routes, controllers,
# handlers or api directory, it prints a reminder for the model to run apidrifter against
# the local server. It never starts the server, never sends a request, writes nothing to
# stderr, and always exits 0 so it can never block an edit.
#
# Plain stdout from a PostToolUse hook goes to the debug log only, so the reminder is sent
# as hookSpecificOutput.additionalContext, which Claude Code shows to the model next to the
# tool result.

input=$(cat 2>/dev/null)

if command -v node >/dev/null 2>&1; then
  path=$(printf '%s' "$input" | node -e '
    let s = "";
    process.stdin.on("data", (d) => { s += d; }).on("end", () => {
      try {
        const j = JSON.parse(s);
        const p = j && j.tool_input && j.tool_input.file_path;
        if (typeof p === "string") process.stdout.write(p);
      } catch {}
    });' 2>/dev/null)
else
  # Fallback without node: the string that follows the first "file_path" key.
  rest=${input#*\"file_path\"}
  if [ "$rest" != "$input" ]; then
    path=$(printf '%s' "$rest" | sed -n 's/^[[:space:]]*:[[:space:]]*"\([^"]*\)".*$/\1/p' 2>/dev/null | head -n 1)
  fi
fi

[ -n "$path" ] || exit 0

base=$(basename "$path")
reason=""
case "$base" in
  openapi.*|swagger.*|*.openapi.yaml|*.openapi.yml|*.openapi.json) reason="an OpenAPI document" ;;
esac
if [ -z "$reason" ]; then
  case "/$path" in
    */routes/*|*/controllers/*|*/handlers/*|*/api/*) reason="a route, controller, handler or api file" ;;
  esac
fi
[ -n "$reason" ] || exit 0

# Escape backslashes and double quotes so the path is safe inside a JSON string.
safe=$(printf '%s' "$path" | sed 's/\\/\\\\/g; s/"/\\"/g' 2>/dev/null)

printf '%s' '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"apidrifter: '
printf '%s' "$safe"
printf '%s' ' is '
printf '%s' "$reason"
printf '%s' '. Before finishing, verify the implementation against the OpenAPI spec: start the service yourself and note its port, then run `npx -y apidrifter run <spec> --base-url http://localhost:<port> --format markdown` (run `npx -y apidrifter plan <spec> --out plan.json` first and pass `--plan filled.json` if the engine reports missing values). For each finding decide which side is the source of truth, the spec or the implementation, and fix that side; do not loosen the spec to silence a finding. This reminder started nothing and sent no request."}}'
printf '\n'
exit 0
