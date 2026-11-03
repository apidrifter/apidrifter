import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { apiMarkdown } from "../../../../lib/markdown";
import { SITE } from "../../../../lib/site";
import { loadFindings, loadSummary, resultsUrl, type SurveyApi } from "../../../../lib/survey";

export async function getStaticPaths() {
  const posts = await getCollection("research", (p) => !p.data.draft && p.data.survey);
  const paths = [];
  for (const post of posts) {
    const summary = await loadSummary(post.data.month);
    for (const api of summary.apis) {
      paths.push({
        params: { slug: post.id, api: api.id },
        props: {
          postId: post.id,
          postTitle: post.data.title,
          api,
          generatedAt: summary.generatedAt,
          month: post.data.month,
        },
      });
    }
  }
  return paths;
}

/** Markdown twin of a per-API findings page. */
export const GET: APIRoute = async ({ props }) => {
  const { postId, postTitle, api, generatedAt, month } = props as {
    postId: string;
    postTitle: string;
    api: SurveyApi;
    generatedAt: string;
    month?: string;
  };
  const findings = await loadFindings(api.id, month);
  const text = apiMarkdown(
    postTitle,
    `${SITE.url}/research/${postId}/`,
    api,
    findings,
    generatedAt,
    resultsUrl(month),
  );
  return new Response(text, { headers: { "content-type": "text/markdown; charset=utf-8" } });
};
