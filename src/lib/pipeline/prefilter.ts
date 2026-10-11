/**
 * Cheap, deterministic relevance gate that runs BEFORE any Gemini call.
 * Deliberately permissive (high recall): it only has to discard obvious
 * non-funding stories such as stock-market wraps, events and opinion pieces.
 */
const FUNDING_SIGNALS =
  /\b(rais(?:e|es|ed|ing)|funding|fundrais\w*|seed|pre-?seed|series\s+[a-e]\b|pre-?series|bags?|secures?|secured|backed|investment|invests?|led by|round|crore|cr\b|lakh|\$\s?\d|₹\s?\d|rs\.?\s?\d|million|\bmn\b|\bbn\b|angel)\b/i;

const NOISE =
  /\b(stocks?|shares?|sensex|nifty|ipo|listing|market cap|layoffs?|webinar|podcast|masterclass|newsletter|dear reader|techsparks|quarterly results|q[1-4]\s?fy\d+)\b/i;

export function looksLikeFundingNews(headline: string, snippet: string | null): boolean {
  const text = `${headline} ${snippet ?? ""}`;
  if (!FUNDING_SIGNALS.test(text)) return false;
  // Headlines dominated by market/event noise without an explicit raise verb are dropped.
  const explicitRaise = /\b(rais(?:e|es|ed)|secures?|bags?|funding|seed|series\s+[a-e]\b|pre-?seed)\b/i.test(headline);
  return explicitRaise || !NOISE.test(headline);
}
