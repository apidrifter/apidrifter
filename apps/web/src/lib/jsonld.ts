/**
 * Structured data builders. Every value that may contain third-party text is a plain
 * string at this point; `serializeJsonLd` escapes `<` so the block can never close its
 * own script element, which is the only way JSON inside a script could misbehave.
 */
import { SITE } from "./site";

export type JsonLd = Record<string, unknown>;

export function serializeJsonLd(items: JsonLd[]): string {
  const doc = items.length === 1 ? items[0] : { "@context": "https://schema.org", "@graph": items };
  return JSON.stringify(doc).replace(/</g, "\\u003c");
}

export const ORG_ID = `${SITE.url}/#organization`;
export const SITE_ID = `${SITE.url}/#website`;
export const APP_ID = `${SITE.url}/#software`;

export function organization(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE.name,
    url: `${SITE.url}/`,
    logo: { "@type": "ImageObject", url: `${SITE.url}/logo-256.png`, width: 256, height: 256 },
    sameAs: [SITE.repo, SITE.npm],
  };
}

export function website(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": SITE_ID,
    name: SITE.name,
    url: `${SITE.url}/`,
    description: SITE.description,
    publisher: { "@id": ORG_ID },
    inLanguage: "en",
  };
}

export function softwareApplication(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    name: "apidrifter",
    alternateName: SITE.name,
    description: SITE.description,
    url: `${SITE.url}/`,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Node.js 22+",
    license: SITE.license,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    downloadUrl: SITE.npm,
    installUrl: SITE.npm,
    codeRepository: SITE.repo,
    softwareHelp: { "@type": "WebPage", url: `${SITE.url}/docs/cli/` },
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
  };
}

export interface ArticleInput {
  url: string;
  headline: string;
  description: string;
  datePublished: string;
  dateModified: string;
  isBasedOn?: string;
}

export function techArticle(a: ArticleInput): JsonLd {
  const out: JsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "@id": `${a.url}#article`,
    headline: a.headline,
    description: a.description,
    datePublished: a.datePublished,
    dateModified: a.dateModified,
    inLanguage: "en",
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    mainEntityOfPage: { "@type": "WebPage", "@id": a.url },
    image: `${SITE.url}/og-default.png`,
  };
  if (a.isBasedOn !== undefined) out.isBasedOn = a.isBasedOn;
  return out;
}

export interface DatasetInput {
  url: string;
  name: string;
  description: string;
  dateCreated: string;
}

export function dataset(d: DatasetInput): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": `${d.url}#dataset`,
    name: d.name,
    description: d.description,
    url: d.url,
    license: SITE.license,
    isAccessibleForFree: true,
    dateCreated: d.dateCreated,
    creator: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `${SITE.resultsRaw}/summary.json`,
      },
      {
        "@type": "DataDownload",
        encodingFormat: "text/markdown",
        contentUrl: `${SITE.resultsRaw}/summary.md`,
      },
    ],
    includedInDataCatalog: {
      "@type": "DataCatalog",
      name: "API Drifter research",
      url: SITE.resultsUrl,
    },
  };
}

export function breadcrumbs(items: Array<{ name: string; url: string }>): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

export function faqPage(qa: ReadonlyArray<{ q: string; a: string }>): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qa.map((x) => ({
      "@type": "Question",
      name: x.q,
      acceptedAnswer: { "@type": "Answer", text: x.a },
    })),
  };
}

export interface HowToInput {
  url: string;
  name: string;
  description: string;
  steps: Array<{ name: string; text: string }>;
}

export function howTo(h: HowToInput): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "@id": `${h.url}#howto`,
    name: h.name,
    description: h.description,
    inLanguage: "en",
    tool: { "@id": APP_ID },
    step: h.steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
      url: `${h.url}#step-${i + 1}`,
    })),
  };
}
