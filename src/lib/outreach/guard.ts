/** Statuses that mean "this startup already has live outreach" (matches the partial unique index). */
export const LIVE_OUTREACH_STATUSES = ["generated", "draft_created", "approved", "sent"] as const;

export interface OutreachLookup {
  /** Returns the live outreach statuses recorded for the startup (empty = never contacted). */
  liveOutreachStatuses(startupId: string): Promise<string[]>;
}

/**
 * Strict V1 rule: if the startup has ANY live outreach (draft pending, approved
 * or sent) no new outreach may be generated. Also enforced by a partial unique
 * index on public.outreach.
 */
export async function hasPriorOutreach(lookup: OutreachLookup, startupId: string): Promise<boolean> {
  return (await lookup.liveOutreachStatuses(startupId)).length > 0;
}
