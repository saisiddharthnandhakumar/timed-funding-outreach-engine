import { domainFromUrl } from "@/lib/util/text";
import { db, unwrap } from "@/lib/supabase/admin";
import type { ContactStore } from "./pipeline";
import { contactKey, type ContactStatus, type FounderRef, type StartupRef, type StoredContact } from "./types";

interface Row {
  id: string;
  founder_id: string | null;
  founder_name: string | null;
  kind: StoredContact["kind"];
  email: string | null;
  contact_url: string | null;
  mailbox_role: StoredContact["mailboxRole"];
  verification_status: StoredContact["status"];
  discovery_source: StoredContact["source"];
  source_url: string | null;
  evidence: string | null;
  mx_valid: boolean | null;
  confidence: number | null;
  is_preferred: boolean;
  first_found_at: string;
}

const toStored = (r: Row): StoredContact => ({
  id: r.id, kind: r.kind, email: r.email, contactUrl: r.contact_url, founderId: r.founder_id, founderName: r.founder_name, mailboxRole: r.mailbox_role,
  status: r.verification_status, source: r.discovery_source, sourceUrl: r.source_url, evidence: r.evidence, mxValid: r.mx_valid,
  confidence: r.confidence ?? 0, isPreferred: r.is_preferred, firstFoundAt: r.first_found_at,
});

export class SupabaseContactStore implements ContactStore {
  async saveWebsite(startupId: string, website: string): Promise<void> {
    const domain = domainFromUrl(website);
    // Only fill a missing website; a domain already owned by another startup is saved without the domain (same as research does).
    let res = await db().from("startups").update({ website, domain }).eq("id", startupId).is("website", null);
    if (res.error?.code === "23505") res = await db().from("startups").update({ website }).eq("id", startupId).is("website", null);
    if (res.error) throw new Error(`save website: ${res.error.message}`);
  }

  async loadStartup(id: string): Promise<StartupRef | null> {
    const r = unwrap(await db().from("startups").select("id,name,website,domain,contact_status,contact_checked_at").eq("id", id).maybeSingle(), "load startup") as
      | { id: string; name: string; website: string | null; domain: string | null; contact_status: ContactStatus; contact_checked_at: string | null }
      | null;
    return r ? { id: r.id, name: r.name, website: r.website, domain: r.domain, contactStatus: r.contact_status, contactCheckedAt: r.contact_checked_at } : null;
  }

  async loadFounders(startupId: string): Promise<FounderRef[]> {
    const rows = unwrap(await db().from("founders").select("id,name,role").eq("startup_id", startupId), "load founders") as { id: string; name: string; role: string | null }[];
    return rows.map((r) => ({ id: r.id, name: r.name, role: r.role }));
  }

  async loadContacts(startupId: string): Promise<StoredContact[]> {
    const rows = unwrap(await db().from("startup_contacts").select("*").eq("startup_id", startupId), "load contacts") as Row[];
    return rows.map(toStored);
  }

  async saveContacts(startupId: string, contacts: StoredContact[]): Promise<void> {
    if (!contacts.length) return;
    const now = new Date().toISOString();
    const payload = (c: StoredContact) => ({
      startup_id: startupId, founder_id: c.founderId, founder_name: c.founderName, kind: c.kind, email: c.email?.toLowerCase() ?? null, contact_url: c.contactUrl,
      mailbox_role: c.mailboxRole, verification_status: c.status, discovery_source: c.source, source_url: c.sourceUrl, evidence: c.evidence, mx_valid: c.mxValid,
      confidence: Math.max(0, Math.min(100, Math.round(c.confidence))), first_found_at: c.firstFoundAt ?? now, last_checked_at: now,
    });
    const withEmail = contacts.filter((c) => c.email).map(payload);
    const forms = contacts.filter((c) => !c.email && c.contactUrl).map(payload);
    if (withEmail.length) unwrap(await db().from("startup_contacts").upsert(withEmail, { onConflict: "startup_id,email" }).select("id"), "save contacts");
    if (forms.length) unwrap(await db().from("startup_contacts").upsert(forms, { onConflict: "startup_id,contact_url" }).select("id"), "save contact forms");
  }

  async setPreferred(startupId: string, key: string | null): Promise<void> {
    let contactId: string | null = null;
    if (key) {
      const rows = unwrap(await db().from("startup_contacts").select("id,email,contact_url").eq("startup_id", startupId), "find preferred") as { id: string; email: string | null; contact_url: string | null }[];
      contactId = rows.find((r) => contactKey({ email: r.email, contactUrl: r.contact_url }) === key)?.id ?? null;
    }
    const res = await db().rpc("set_preferred_contact", { p_startup: startupId, p_contact: contactId });
    if (res.error) throw new Error(`set preferred contact: ${res.error.message}`);
  }

  async updateStartup(startupId: string, patch: { status: ContactStatus; checkedAt: string; error: string | null }): Promise<void> {
    unwrap(await db().from("startups").update({ contact_status: patch.status, contact_checked_at: patch.checkedAt, contact_error: patch.error }).eq("id", startupId).select("id"), "update contact status");
  }

  async applyRecipientToOpenDrafts(startupId: string, name: string | null, email: string): Promise<number> {
    const update: Record<string, string> = { recipient_email: email };
    if (name) update.recipient_name = name;
    const res = await db().from("outreach").update(update).eq("startup_id", startupId).is("recipient_email", null).in("status", ["generated", "draft_created", "approved"]).select("id");
    if (res.error) throw new Error(`prefill drafts: ${res.error.message}`);
    return res.data?.length ?? 0;
  }
}
