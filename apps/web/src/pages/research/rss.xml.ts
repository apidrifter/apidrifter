import { getCollection } from "astro:content";
import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { SITE } from "../../lib/site";

export const GET: APIRoute = async (context) => {
  const posts = (await getCollection("research", (p) => !p.data.draft)).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );
  return rss({
    title: `${SITE.name} research`,
    description: "Investigations into how published API specs compare with live behavior.",
    site: context.site ?? SITE.url,
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.date,
      link: `/research/${p.id}/`,
    })),
    customData: "<language>en</language>",
  });
};
