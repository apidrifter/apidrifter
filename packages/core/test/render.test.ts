import { describe, expect, it } from "vitest";
import { validateConfig } from "../src/config.js";
import { diff } from "../src/diff.js";
import { renderFooter } from "../src/render/footer.js";
import { renderMarkdown } from "../src/render/markdown.js";
import { renderText } from "../src/render/text.js";
import { renderVerifyMarkdown } from "../src/render/verify-markdown.js";
import { renderVerifyText } from "../src/render/verify-text.js";
import { verify } from "../src/verify/verify.js";

const spec = {
  openapi: "3.1.0",
  info: { title: "Pets", version: "1" },
  paths: {
    "/pets": {
      get: {
        responses: {
          "200": {
            description: "ok",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
    },
  },
};

const FOOTER_RE = /\n---\n\nFound with \[apidrifter\]\(https:\/\/apidrifter\.com\)( v[^\n]+)?\n$/;

describe("report footer", () => {
  it("renders a horizontal rule and one line, with the version when given", () => {
    expect(renderFooter({ version: "1.2.3" })).toBe(
      "\n---\n\nFound with [apidrifter](https://apidrifter.com) v1.2.3\n",
    );
    expect(renderFooter({})).toBe("\n---\n\nFound with [apidrifter](https://apidrifter.com)\n");
    expect(renderFooter(undefined)).toBe(renderFooter({}));
    expect(renderFooter(false)).toBe("");
  });

  it("is on by default in diff markdown and off with footer: false", () => {
    const result = diff(spec, spec);
    const md = renderMarkdown(result, { footer: { version: "0.0.1" } });
    expect(md).toMatch(FOOTER_RE);
    expect(md).toContain(
      "No changes.\n\n---\n\nFound with [apidrifter](https://apidrifter.com) v0.0.1\n",
    );
    expect(renderMarkdown(result)).toMatch(FOOTER_RE);
    expect(renderMarkdown(result, { footer: false })).not.toContain("Found with");
    expect(renderMarkdown(result, { footer: false })).toMatch(/No changes\.\n$/);
  });

  it("is on by default in verify markdown and off with footer: false", () => {
    const result = verify(spec, []);
    expect(renderVerifyMarkdown(result, { footer: { version: "0.0.1" } })).toMatch(FOOTER_RE);
    expect(renderVerifyMarkdown(result)).toMatch(FOOTER_RE);
    expect(renderVerifyMarkdown(result, { footer: false })).not.toContain("Found with");
  });

  it("never appears in text output", () => {
    expect(renderText(diff(spec, spec))).not.toContain("Found with");
    expect(renderVerifyText(verify(spec, []))).not.toContain("Found with");
  });

  it("is a boolean config key", () => {
    expect(validateConfig({ footer: false })).toEqual({ footer: false });
    expect(validateConfig({ footer: true })).toEqual({ footer: true });
    expect(validateConfig({})).toEqual({});
    expect(() => validateConfig({ footer: "no" })).toThrow(/footer must be true or false/);
  });
});
