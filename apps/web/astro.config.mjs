// @ts-check
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://apidrifter.com",
  output: "static",
  trailingSlash: "always",
  integrations: [mdx(), sitemap()],
  // Markdown rendered here comes only from files in this repository. Survey data
  // (third-party strings) goes through components with Astro's default escaping.
  markdown: {
    shikiConfig: { theme: "github-dark-default" },
  },
  build: { format: "directory" },
});
