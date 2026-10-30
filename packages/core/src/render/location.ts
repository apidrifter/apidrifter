import type { Location } from "../types.js";

/** Human-readable location, e.g. `GET /pets/{id} \u203A response 200 \u203A application/json \u203A /properties/name`. */
export function formatLocation(loc: Location): string {
  const parts: string[] = [];
  if (loc.kind === "document") parts.push("document");
  else if (loc.kind === "server") parts.push("server");
  else if (loc.subject !== undefined) parts.push(loc.subject);
  if (loc.part !== undefined) {
    const label =
      loc.name !== undefined ? `${partLabel(loc.part)} ${loc.name}` : partLabel(loc.part);
    parts.push(label);
  } else if (loc.name !== undefined) {
    parts.push(loc.name);
  }
  if (loc.mediaType !== undefined) parts.push(loc.mediaType);
  if (loc.pointer !== undefined) parts.push(loc.pointer);
  return parts.join(" \u203A ");
}

function partLabel(part: NonNullable<Location["part"]>): string {
  switch (part) {
    case "requestBody":
      return "request body";
    case "responseHeader":
      return "response header";
    default:
      return part;
  }
}

/** Sort key: stable, kind-major ordering so output is deterministic. */
export function locationKey(loc: Location): string {
  const kindOrder = { document: 0, server: 1, operation: 2, tool: 3, resource: 4, prompt: 5 }[
    loc.kind
  ];
  return [
    String(kindOrder),
    loc.subject ?? "",
    loc.part ?? "",
    loc.name ?? "",
    loc.mediaType ?? "",
    loc.pointer ?? "",
  ].join("\u0000");
}
