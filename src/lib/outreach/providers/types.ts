/** Where a generated draft ends up. Never sends — drafts only. */
export interface DraftProvider {
  readonly name: "database" | "gmail";
  /** Returns the external draft id, or null when the draft only lives in our database. */
  createDraft(draft: { to: string | null; toName: string | null; subject: string; body: string }): Promise<{ externalId: string } | null>;
}
