import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { postBodyMarkdown } from "../../../lib/markdown";
import { isoDate, SITE } from "../../../lib/site";
import { loadSummary, resultsUrl } from "../../../lib/survey";

export async function getStaticPaths() {
  const posts = await getCollection("research", (p) => !p.data.draft);
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}

/** Markdown twin of a research post, for agents and anyone who prefers text. */
export const GET: APIRoute = async ({ props }) => {
  const post = props.post as {
    id: string;
    body?: string;
    data: { title: string; description: string; date: Date; survey: boolean; month?: string };
  };
  const url = `${SITE.url}/research/${post.id}/`;
  const summary = await loadSummary(post.data.month);
  const body = postBodyMarkdown(post.body ?? "", summary, url, resultsUrl(post.data.month));
  const text = [
    "---",
    `title: "${post.data.title.replace(/"/g, "'")}"`,
    `description: "${post.data.description.replace(/"/g, "'")}"`,
    `date: ${isoDate(post.data.date)}`,
    `author: ${SITE.name}`,
    `canonical: ${url}`,
    `license: Apache-2.0 (text and data)`,
    "---",
    "",
    `# ${post.data.title}`,
    "",
    `By ${SITE.name}, ${isoDate(post.data.date)}. Canonical: ${url}`,
    "",
    body,
    "",
    "## Cite this",
    "",
    `${SITE.name} (${isoDate(post.data.date).slice(0, 4)}). ${post.data.title}. ${url}`,
    "",
  ].join("\n");
  return new Response(text, { headers: { "content-type": "text/markdown; charset=utf-8" } });
};
