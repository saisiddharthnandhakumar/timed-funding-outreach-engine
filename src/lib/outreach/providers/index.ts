import { hasGmailEnv } from "@/lib/env";
import { GmailDraftProvider } from "./gmail";
import type { DraftProvider } from "./types";

/** Database-only provider: the draft is stored in Supabase for review in the app. */
export class DatabaseDraftProvider implements DraftProvider {
  readonly name = "database" as const;
  async createDraft() {
    return null;
  }
}

/** Gmail when OAuth credentials are configured; otherwise database-backed drafts (never faked). */
export function selectDraftProvider(): DraftProvider {
  return hasGmailEnv() ? new GmailDraftProvider() : new DatabaseDraftProvider();
}
export type { DraftProvider };
