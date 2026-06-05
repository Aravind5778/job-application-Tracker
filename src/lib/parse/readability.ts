/**
 * Mozilla Readability fallback for pages without JSON-LD markup.
 *
 * Returns the article-like content (the body of the listing) and a best
 * guess at the page title. The caller still has to figure out company /
 * role / location from those.
 */
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export type ReadabilityResult = {
  title?: string;
  textContent: string;
};

export function extractReadable(
  html: string,
  url: string,
): ReadabilityResult | null {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article) return null;
  return {
    title: article.title ?? undefined,
    textContent: (article.textContent ?? "").replace(/\n\s*\n+/g, "\n\n").trim(),
  };
}
