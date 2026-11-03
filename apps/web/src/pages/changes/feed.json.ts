import type { APIRoute } from "astro";
import { flatten, itemText, itemTitle, loadDays } from "../../lib/changes";
import { SITE } from "../../lib/site";

const MAX_ITEMS = 200;

/**
 * JSON Feed 1.1 with one item per API per day that had any change (RSS carries breaking
 * changes only). Third-party strings are plain JSON string values; nothing is rendered as HTML.
 */
export const GET: APIRoute = async () => {
  const items = flatten(await loadDays()).slice(0, MAX_ITEMS);
  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: `${SITE.name}: API spec change feed`,
    home_page_url: `${SITE.url}/changes/`,
    feed_url: `${SITE.url}/changes/feed.json`,
    description:
      "Daily changes in the published OpenAPI documents of public APIs, classified as breaking, warning or info by apidrifter.",
    language: "en",
    authors: [{ name: SITE.name, url: `${SITE.url}/` }],
    items: items.map((x) => ({
      id: `${SITE.url}/changes/${x.entry.id}/#${x.date}`,
      url: `${SITE.url}/changes/${x.entry.id}/#${x.date}`,
      external_url: x.entry.specUrl,
      title: itemTitle(x),
      content_text: itemText(x, 50),
      date_published: x.entry.fetchedAt,
      tags: [x.entry.id, ...(x.entry.summary.breaking > 0 ? ["breaking"] : [])],
      _apidrifter: {
        api: x.entry.id,
        date: x.date,
        summary: x.entry.summary,
        total: x.entry.total,
        distinct: x.entry.distinct,
        changes: x.entry.changes,
      },
    })),
  };
  return new Response(`${JSON.stringify(feed, null, 2)}\n`, {
    headers: { "content-type": "application/feed+json; charset=utf-8" },
  });
};
