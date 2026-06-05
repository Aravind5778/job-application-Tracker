/**
 * Extract a `JobPosting` from any embedded JSON-LD blocks in the page.
 *
 * Greenhouse, Lever, and Ashby ship schema.org JobPosting markup, which
 * gives us a clean title / company / location / description with zero
 * heuristics. We walk all `<script type="application/ld+json">` blocks,
 * unwrap `@graph`, and return the first JobPosting we find.
 */
import * as cheerio from "cheerio";

export type JobPosting = {
  title?: string;
  company?: string;
  location?: string;
  description?: string;
};

type LdNode = Record<string, unknown>;

function isJobPosting(node: unknown): node is LdNode {
  return (
    !!node &&
    typeof node === "object" &&
    (node as LdNode)["@type"] === "JobPosting"
  );
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function extractCompany(node: LdNode): string | undefined {
  const org = node.hiringOrganization;
  if (!org) return undefined;
  if (typeof org === "string") return org;
  if (typeof org === "object" && org) {
    return asString((org as LdNode).name);
  }
  return undefined;
}

function extractLocation(node: LdNode): string | undefined {
  const loc = node.jobLocation;
  if (!loc) return undefined;
  const first = Array.isArray(loc) ? loc[0] : loc;
  if (!first || typeof first !== "object") return undefined;
  const address = (first as LdNode).address;
  if (!address || typeof address !== "object") return undefined;
  const a = address as LdNode;
  const parts = [
    asString(a.addressLocality),
    asString(a.addressRegion),
    asString(a.addressCountry) ?? asString((a.addressCountry as LdNode)?.name),
  ].filter(Boolean) as string[];
  if (parts.length) return parts.join(", ");
  return undefined;
}

function htmlToText(html: string): string {
  // Very light HTML→text: collapse tags to spaces, decode common entities.
  const $ = cheerio.load(`<root>${html}</root>`);
  return $("root").text().replace(/\n\s*\n+/g, "\n\n").trim();
}

export function parseJobPostingJsonLd(html: string): JobPosting | null {
  const $ = cheerio.load(html);
  const candidates: LdNode[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const n of nodes) {
        if (!n || typeof n !== "object") continue;
        const obj = n as LdNode;
        const graph = obj["@graph"];
        if (Array.isArray(graph)) {
          for (const g of graph) {
            if (isJobPosting(g)) candidates.push(g);
          }
        } else if (isJobPosting(obj)) {
          candidates.push(obj);
        }
      }
    } catch {
      // Malformed JSON-LD blocks are common on the wild web — skip them.
    }
  });

  const node = candidates[0];
  if (!node) return null;

  const description = asString(node.description);
  return {
    title: asString(node.title),
    company: extractCompany(node),
    location: extractLocation(node),
    description: description ? htmlToText(description) : undefined,
  };
}
