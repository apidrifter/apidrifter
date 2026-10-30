import { UsageError } from "./errors.js";

export interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string[]>;
  /** Everything after a bare `--`. */
  rest: string[];
}

/**
 * Minimal argument parser. Supports `--name value`, `--name=value`, repeated flags,
 * boolean flags (listed by the caller), and `--` to stop parsing.
 */
export function parseArgs(
  argv: readonly string[],
  booleans: ReadonlySet<string> = new Set(),
): ParsedArgs {
  const out: ParsedArgs = { positionals: [], flags: new Map(), rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) break;
    if (arg === "--") {
      out.rest = argv.slice(i + 1);
      break;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      let name: string;
      let value: string | undefined;
      if (eq !== -1) {
        name = arg.slice(2, eq);
        value = arg.slice(eq + 1);
      } else {
        name = arg.slice(2);
      }
      if (name.length === 0) throw new UsageError("empty flag name");
      if (booleans.has(name)) {
        if (value !== undefined) throw new UsageError(`--${name} does not take a value`);
        push(out.flags, name, "true");
        continue;
      }
      if (value === undefined) {
        const next = argv[i + 1];
        if (next === undefined || next === "--") throw new UsageError(`--${name} requires a value`);
        value = next;
        i++;
      }
      push(out.flags, name, value);
      continue;
    }
    if (arg.startsWith("-") && arg.length > 1) throw new UsageError(`unknown option ${arg}`);
    out.positionals.push(arg);
  }
  return out;
}

function push(map: Map<string, string[]>, name: string, value: string): void {
  const list = map.get(name);
  if (list === undefined) map.set(name, [value]);
  else list.push(value);
}

export function flag(args: ParsedArgs, name: string): string | undefined {
  const list = args.flags.get(name);
  return list === undefined ? undefined : list[list.length - 1];
}

export function flagAll(args: ParsedArgs, name: string): string[] {
  return args.flags.get(name) ?? [];
}

export function hasFlag(args: ParsedArgs, name: string): boolean {
  return args.flags.has(name);
}

export function intFlag(args: ParsedArgs, name: string, fallback: number): number {
  const raw = flag(args, name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new UsageError(`--${name} must be a positive integer`);
  return n;
}

/** Reject flags the command does not know, so typos never silently do nothing. */
export function rejectUnknownFlags(args: ParsedArgs, known: ReadonlySet<string>): void {
  for (const name of args.flags.keys()) {
    if (!known.has(name)) throw new UsageError(`unknown option --${name}`);
  }
}
