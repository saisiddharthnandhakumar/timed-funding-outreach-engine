/**
 * Selectable values for the Thesis Settings form. These are shared by the UI
 * (dropdowns) and the server-side validation, so a value that is not offered
 * here cannot be saved (except for the "custom allowed" fields below).
 */

/** Hard-filter geography: fixed list only (names are matched against the extracted HQ country). */
export const COUNTRY_OPTIONS = [
  "India", "United States", "United Kingdom", "Singapore", "United Arab Emirates", "Canada", "Australia", "Germany", "France",
  "Netherlands", "Sweden", "Switzerland", "Ireland", "Israel", "Japan", "South Korea", "China", "Hong Kong", "Indonesia", "Vietnam",
  "Malaysia", "Thailand", "Philippines", "Bangladesh", "Sri Lanka", "Nepal", "Saudi Arabia", "Kenya", "Nigeria", "South Africa",
  "Egypt", "Brazil", "Mexico", "Spain", "Italy",
] as const;

/** Fixed list only. */
export const BUSINESS_MODEL_OPTIONS = ["B2B", "B2B2C", "B2C", "D2C", "B2G", "Marketplace", "SaaS", "Usage-based / API", "Hardware + software"] as const;

/** Custom entries allowed (feeds the Gemini scoring prompt, new niches appear often). */
export const CORE_SECTOR_OPTIONS = [
  "AI/ML", "Deeptech", "Enterprise SaaS", "Fintech", "Healthtech", "Climate Technology", "Cybersecurity", "Semiconductors & Hardware",
  "Robotics & Automation", "Space & Defence", "Biotech", "Edtech", "Agritech", "Logistics & Supply Chain", "Mobility & EV",
  "Consumer", "E-commerce / D2C", "Media & Gaming", "Proptech", "Insurtech", "Web3",
] as const;

export const SUBSECTOR_OPTIONS = [
  "Vertical AI", "Enterprise AI", "Agentic Workflows", "Developer Tools", "AI Infrastructure", "Robotics", "Spacetech", "Semiconductors",
  "Industrial Automation", "Climate Technology", "Technology-heavy Healthtech", "Generative AI", "Voice AI", "Computer Vision", "Edge AI",
  "LLM Infrastructure", "Data Infrastructure", "Cybersecurity", "Quantum Computing", "Drones", "Satellite Technology", "Battery & Energy Storage",
  "Advanced Manufacturing", "Medtech", "Biotech", "Fintech Infrastructure", "Legal Tech", "HR Tech", "Supply Chain Tech", "Agritech", "IoT",
] as const;

export const EXCLUDED_OPTIONS = [
  "undifferentiated AI wrappers", "pure consumer novelty apps", "gambling & betting", "crypto speculation", "adult content", "alcohol & tobacco",
  "weapons", "unsecured lending apps", "dropshipping / pure resale", "multi-level marketing", "social media clones", "content farms",
] as const;

/** Preset steps for numeric controls. */
export const MAX_AGE_HOUR_OPTIONS = [6, 12, 24, 36, 48, 72, 96, 168] as const;
export const MIN_SCORE_OPTIONS = Array.from({ length: 21 }, (_, i) => i * 5); // 0,5,...,100
export const RECENCY_HOUR_OPTIONS = [3, 6, 9, 12, 18, 24, 36, 48, 72, 96, 168] as const;

/** Limits for a user-added custom label. */
export const CUSTOM_LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 &/+.,'()-]{1,58}[A-Za-z0-9)]$/;
