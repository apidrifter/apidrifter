import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { escapeXml, flatten, itemText, itemTitle, loadDays } from "../../lib/changes";
import { SITE } from "../../lib/site";

const MAX_ITEMS = 100;

/**
 * One item per API per day that had a breaking change. Titles and descriptions carry
 * third-party strings; @astrojs/rss escapes item fields, and the custom block is escaped here.
 */
export const GET: APIRoute = async (context) => {
  const items = flatten(await loadDays())
    .filter((x) => x.entry.summary.breaking > 0)
    .slice(0, MAX_ITEMS);
  return rss({
    title: `${SITE.name}: breaking API spec changes`,
    description:
      "Breaking changes in the published OpenAPI documents of public APIs, found by diffing each day's spec with apidrifter.",
    site: context.site ?? SITE.url,
    items: items.map((x) => ({
      title: itemTitle(x),
      description: itemText(x),
      pubDate: new Date(x.entry.fetchedAt),
      // Absolute so @astrojs/rss keeps it as is; the fragment makes link and guid unique per
      // API and day.
      link: `${SITE.url}/changes/${x.entry.id}/#${x.date}`,
      customData: `<category>${escapeXml(x.entry.name)}</category>`,
    })),
    customData: "<language>en</language>",
  });
};
