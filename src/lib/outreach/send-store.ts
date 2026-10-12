import { db } from "@/lib/supabase/admin";
import { PipelineLogger } from "@/lib/pipeline/logger";
import type { VerificationStatus } from "@/lib/contacts/types";
import type { DraftRow, SendStore } from "./send";

export class SupabaseSendStore implements SendStore {
  async loadDraft(id: string): Promise<DraftRow | null> {
    const { data } = await db().from("outreach").select("id,startup_id,status,recipient_name,recipient_email,subject,body").eq("id", id).maybeSingle<DraftRow>();
    return data ?? null;
  }

  async contactStatus(startupId: string, email: string): Promise<VerificationStatus | null> {
    try {
      const { data, error } = await db().from("startup_contacts").select("verification_status").eq("startup_id", startupId).eq("email", email.toLowerCase()).maybeSingle<{ verification_status: VerificationStatus }>();
      return error ? null : data?.verification_status ?? null;
    } catch {
      return null;
    }
  }

  async markSent(id: string, sentAtIso: string): Promise<boolean> {
    const res = await db().from("outreach").update({ status: "sent", sent_at: sentAtIso }).eq("id", id).eq("status", "approved").select("id");
    return !res.error && (res.data?.length ?? 0) > 0;
  }

  async log(event: string, message: string, meta: Record<string, unknown>): Promise<void> {
    await new PipelineLogger(null).event("outreach", (meta.outreach_id as string) ?? null, event, message, meta);
  }
}
