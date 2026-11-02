# apidrifter.com

Static Astro site: landing page, research posts and docs. Deployed to GitHub Pages by `.github/workflows/site.yml` on pushes to `main` that touch the site, the survey results, or the docs.

```
export PATH="$HOME/.nvm/versions/node/v24.22.1/bin:$PATH"   # Node 24
pnpm install
pnpm --filter @apidrifter/web dev      # http://localhost:4321
pnpm --filter @apidrifter/web build    # apps/web/dist
```

Where things live:

- `src/content/research/*.mdx`: research posts. Frontmatter: `title`, `description`, `date`, `survey` (enables the survey table and the per-API pages), `draft` (excluded from the build when true).
- `../../tools/survey/results/`: survey data the research pages are generated from. Never copied; read at build time.
- `src/pages/docs/`: renders `packages/cli/README.md`, `docs/rules.md` and `docs/DESIGN.md` from the repository.
- `src/pages/llms.txt.ts`: the agent-readable index.

No analytics, no third-party scripts, no external fonts.

## Deploy

Hosted on Cloudflare Workers as static assets, connected to the `apidrifter/apidrifter` repository (Workers Builds). Project settings:

- Build command: `pnpm --filter @apidrifter/web build`
- Deploy command: `npx wrangler deploy` (reads `wrangler.jsonc` at the repository root, which points at `apps/web/dist`)
- Preview command: `npx wrangler versions upload`
- Node version: from the repository `.nvmrc`
- Custom domains: `apidrifter.com`; `www` is redirected to the apex by a Cloudflare redirect rule on the zone (Workers assets do not support host-level rules in `_redirects`)

Every push to `main` deploys; every pull request gets a preview. Security headers live in `public/_headers`.
