import type { ResearchDoc } from "@/lib/gemini/tasks";
import { isSocial } from "@/lib/contacts/search";
import { getSearch, type SearchService } from "./index";

/**
 * Recent web context about a startup (founders, product, traction) as extra documents for research synthesis.
 * Tavily's cleaned page text suits this best. The synthesis step still only keeps facts the documents state.
 */
export async function researchSearchDocs(companyName: string, search: Pick<SearchService, "context"> | null = getSearch()): Promise<ResearchDoc[]> {
  if (!search) return [];
  const hits = await search.context(`${companyName} Indian startup founders product customers funding`, { num: 5 });
  const seen = new Set<string>();
  const docs: ResearchDoc[] = [];
  for (const h of hits) {
    let host: string;
    try {
      host = new URL(h.url).hostname;
    } catch {
      continue;
    }
    if (isSocial(host) || h.snippet.trim().length < 80 || seen.has(h.url)) continue;
    seen.add(h.url);
    docs.push({ url: h.url, kind: "web_search", title: h.title || null, text: h.snippet });
    if (docs.length >= 4) break;
  }
  return docs;
}
