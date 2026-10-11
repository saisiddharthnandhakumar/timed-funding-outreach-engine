import type { AIService, GroundedRequest, StructuredRequest } from "@/lib/gemini/service";
import type { FundingSourceAdapter, RawArticle } from "@/lib/sources/types";

/** Deterministic stand-in for Gemini used ONLY in tests (the app itself only ships GeminiService). */
export class FakeAI implements AIService {
  readonly modelName = "fake-test-model";
  calls: string[] = [];
  constructor(private readonly byHeadline: Record<string, Record<string, unknown>>) {}

  async generateStructured<T>(req: StructuredRequest<T>): Promise<T> {
    this.calls.push(req.task);
    const key = Object.keys(this.byHeadline).find((h) => req.prompt.includes(h));
    const fx = key ? this.byHeadline[key] : {};
    switch (req.task) {
      case "classify_article":
        return req.schema.parse(fx.classification);
      case "synthesize_profile":
        return req.schema.parse(PROFILE);
      case "assess_fit":
        return req.schema.parse({
          criterion_scores: { sector_fit: 23, technology_defensibility: 13, geography_fit: 10, market_attractiveness: 8, founder_quality: 7, traction: 6 },
          positive_signals: ["Vertical AI for industrial procurement", "Founders with prior industrial software experience"],
          concerns: ["Early evidence of commercial scale"],
          reasoning: "Strong vertical AI alignment with relevant founder experience.",
          confidence: 0.89,
        });
      case "generate_outreach":
        return req.schema.parse({
          subject: "Congrats on Fixture Nimbus's seed round",
          body: "Hi Asha,\n\nCongratulations on Fixture Nimbus's $2.5M seed round. I was reading about your AI workflow automation for industrial procurement, particularly how it plugs into existing operational processes.\n\nWe work with early-stage Indian founders building technically differentiated AI and deeptech companies, and Nimbus looks closely aligned.\n\nWould you be open to a short conversation next week?\n\nBest,\nRohit",
        });
      default:
        throw new Error(`FakeAI: unexpected task ${req.task}`);
    }
  }

  async generateGrounded(req: GroundedRequest) {
    this.calls.push(req.task);
    return { text: "Fixture research: no public information found.", sources: [] };
  }
}

const PROFILE = {
  company_name: "Fixture Nimbus", website: null, description: "AI workflow automation for industrial procurement.",
  sector: "Vertical AI", subsector: "Industrial procurement", business_model: "B2B", hq_city: "Bengaluru", hq_country: "India", founded_year: null,
  founders: [{ name: "Asha Rao", role: "CEO", background: "Previously built industrial software.", linkedin_url: null }],
  product: "AI workflow automation for procurement teams", target_customer: "Manufacturers", technology: "Domain-specific models plus ERP integrations",
  traction: ["Early manufacturing customers"], customers: [], partnerships: [], funding_history: [], market: "Industrial procurement",
  competitive_differentiation: "Domain-specific models + workflow integrations", source_urls: [], unknowns: ["revenue"],
};

export const cls = (over: Record<string, unknown>) => ({
  is_funding_announcement: true, is_roundup: false, company_name: "Fixture Nimbus", is_indian_startup: true, hq_country: "India", hq_city: "Bengaluru",
  funding_stage: "seed", funding_stage_raw: "seed round", funding_amount: 2_500_000, funding_currency: "USD", investors: ["Fixture Ventures"],
  lead_investor: "Fixture Ventures", one_line_description: "AI workflow automation for industrial procurement", confidence: 0.97, ...over,
});

export class FixtureAdapter implements FundingSourceAdapter {
  constructor(readonly key: string, private readonly articles: RawArticle[]) {}
  async fetchLatest() {
    return this.articles;
  }
}
