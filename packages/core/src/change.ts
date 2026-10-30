import {
  ruleSeverity,
  SCHEMA_PREFIXES,
  type SchemaPrefix,
  schemaEventReported,
} from "./rules/registry.js";
import type { SchemaEvent } from "./schema/diff.js";
import { clean } from "./text.js";
import type { Change, DocumentKind, Location } from "./types.js";

/** Build a change with the rule's default severity. Values are clipped later by the engine. */
export function makeChange(
  id: string,
  source: DocumentKind,
  location: Location,
  message: string,
  before?: unknown,
  after?: unknown,
): Change {
  const change: Change = {
    id,
    severity: ruleSeverity(id),
    source,
    location,
    message: clean(message),
  };
  if (before !== undefined) change.before = before;
  if (after !== undefined) change.after = after;
  return change;
}

/** Map schema events to changes under a prefix, dropping events not reported for that polarity. */
export function schemaEventsToChanges(
  events: SchemaEvent[],
  prefix: SchemaPrefix,
  base: Location,
): Change[] {
  const meta = SCHEMA_PREFIXES[prefix];
  if (meta === undefined) throw new Error(`unknown schema prefix ${prefix}`);
  const out: Change[] = [];
  for (const ev of events) {
    if (!schemaEventReported(prefix, ev.event)) continue;
    const location: Location = { ...base };
    if (ev.pointer !== "") location.pointer = ev.pointer;
    out.push(
      makeChange(`${prefix}-${ev.event}`, meta.source, location, ev.message, ev.before, ev.after),
    );
  }
  return out;
}
