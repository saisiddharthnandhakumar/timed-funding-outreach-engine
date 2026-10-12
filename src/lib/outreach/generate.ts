import { db, unwrap } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import type { AIService } from "@/lib/gemini/service";
import { generateOutreach } from "@/lib/gemini/tasks";
import type { StartupProfile } from "@/lib/gemini/schemas";
import { errorMessage } from "@/lib/util/text";
import { preferredRecipient } from "@/lib/contacts";
import { hasPriorOutreach, type OutreachLookup } from "./guard";
import type { DraftProvider } from "./providers/types";

export type OutreachOutcome =
  | { created: true; outreachId: string; status: string; provider: string; providerError?: string }
  | { created: false; reason: "already_contacted" | "duplicate_live_outreach" };

const pickFounder = (profile: StartupProfile): string | null => {
  const named = profile.founders.filter((f) => f.name?.trim());
  const ceo = named.find((f) => /ceo|chief executive/i.test(f.role ?? "")) ?? named[0];
  return ceo ? ceo.name.trim() : null;
};

/**
 * Gemini Task 4 — only call this for a startup that passed hard filters, was
 * not a duplicate, and met the score threshold. Re-checks outreach history
 * (application level) and relies on the partial unique index as the backstop.
 */
export async function createOutreachDraft(
  ai: AIService,
  lookup: OutreachLookup,
  provider: DraftProvider,
  args: {
    startupId: string;
    roundId: string;
    assessmentId: string;
    profile: StartupProfile;
    stage: string;
    amount: number | null;
    currency: string | null;
    investors: string[];
    positiveSignals: string[];
    thesisText: string;
  },
): Promise<OutreachOutcome> {
  if (await hasPriorOutreach(lookup, args.startupId)) return { created: false, reason: "already_contacted" };

  const founderName = pickFounder(args.profile);
  // Only a published/verified preferred contact is ever prefilled (never a guessed address).
  const recipient = await preferredRecipient(args.startupId);
  const recipientName = recipient?.name ?? founderName;
  const email = await generateOutreach(ai, {
    senderName: env().OUTREACH_SENDER_NAME ?? "Rohit",
    acceleratorName: env().ACCELERATOR_NAME ?? "our accelerator",
    profile: args.profile,
    funding: { stage: args.stage, amount: args.amount, currency: args.currency, investors: args.investors },
    founderName,
    positiveSignals: args.positiveSignals,
    thesisSummary: args.thesisText,
  });

  // Insert first (the DB unique index is the arbiter against concurrent duplicates).
  const inserted = await db()
    .from("outreach")
    .insert({
      startup_id: args.startupId,
      funding_round_id: args.roundId,
      fit_assessment_id: args.assessmentId,
      recipient_name: recipientName,
      recipient_email: recipient?.email ?? null,
      subject: email.subject.trim(),
      body: email.body.trim(),
      draft_provider: provider.name,
      status: "generated",
      model_name: ai.modelName,
    })
    .select("id")
    .single<{ id: string }>();
  if (inserted.error) {
    if (inserted.error.code === "23505") return { created: false, reason: "duplicate_live_outreach" };
    throw new Error(`insert outreach: ${inserted.error.message}`);
  }
  const outreachId = inserted.data.id;

  if (provider.name === "database") return { created: true, outreachId, status: "generated", provider: "database" };

  try {
    const ext = await provider.createDraft({ to: recipient?.email ?? null, toName: recipientName, subject: email.subject.trim(), body: email.body.trim() });
    unwrap(
      await db().from("outreach").update({ status: "draft_created", external_draft_id: ext?.externalId ?? null }).eq("id", outreachId),
      "mark draft_created",
    );
    return { created: true, outreachId, status: "draft_created", provider: provider.name };
  } catch (err) {
    // Draft stays stored in our DB as "generated"; the failure is reported, never hidden.
    return { created: true, outreachId, status: "generated", provider: provider.name, providerError: errorMessage(err) };
  }
}
