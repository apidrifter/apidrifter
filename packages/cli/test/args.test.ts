import { describe, expect, it } from "vitest";
import { flag, flagAll, hasFlag, intFlag, parseArgs, rejectUnknownFlags } from "../src/args.js";
import { UsageError } from "../src/errors.js";

describe("parseArgs", () => {
  it("separates positionals, flags and rest", () => {
    const args = parseArgs(
      [
        "diff",
        "a.yaml",
        "--format",
        "json",
        "--header=X: 1",
        "--header",
        "Y: 2",
        "--",
        "cmd",
        "--x",
      ],
      new Set(),
    );
    expect(args.positionals).toEqual(["diff", "a.yaml"]);
    expect(flag(args, "format")).toBe("json");
    expect(flagAll(args, "header")).toEqual(["X: 1", "Y: 2"]);
    expect(args.rest).toEqual(["cmd", "--x"]);
  });

  it("treats listed booleans as flags without values", () => {
    const args = parseArgs(
      ["mcp", "snapshot", "--stdio", "--", "npx", "server"],
      new Set(["stdio"]),
    );
    expect(hasFlag(args, "stdio")).toBe(true);
    expect(args.positionals).toEqual(["mcp", "snapshot"]);
    expect(args.rest).toEqual(["npx", "server"]);
  });

  it("rejects a value on a boolean flag and a missing value on a normal flag", () => {
    expect(() => parseArgs(["--stdio=yes"], new Set(["stdio"]))).toThrow(UsageError);
    expect(() => parseArgs(["--format"])).toThrow(UsageError);
    expect(() => parseArgs(["-x"])).toThrow(UsageError);
  });

  it("validates integer flags and unknown flags", () => {
    const args = parseArgs(["--timeout", "5000", "--bogus", "1"]);
    expect(intFlag(args, "timeout", 1)).toBe(5000);
    expect(intFlag(args, "missing", 7)).toBe(7);
    expect(() => intFlag(parseArgs(["--timeout", "-1"]), "timeout", 1)).toThrow(UsageError);
    expect(() => rejectUnknownFlags(args, new Set(["timeout"]))).toThrow(/--bogus/);
  });
});
