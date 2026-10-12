import { CopyButton } from "../copy-button";
import { RerunContactsButton } from "../rerun-contacts-button";
import { TextLink } from "../ui";
import { contactStatusLabel, prettyCode, verificationLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";

/** Who to write to and how sure we are. Level 2: sits inside a disclosure on the startup page. */
export function ContactDetails({ startup, contacts }: { startup: any; contacts: any[] }) {
  const preferred = contacts.find((c) => c.is_preferred) ?? null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted">
          {contactStatusLabel(startup.contact_status)}
          {startup.contact_checked_at && <span className="text-faint"> · checked {formatDateTime(startup.contact_checked_at)}</span>}
        </p>
        <RerunContactsButton startupId={startup.id} />
      </div>
      {startup.contact_error && <p className="rounded-lg bg-bad-soft p-3 text-sm text-ink">{startup.contact_error}</p>}

      {preferred ? (
        <div className="rounded-lg bg-sunken p-4 text-sm">
          <div className="text-xs font-medium text-faint">Preferred contact · {preferred.kind === "contact_form" ? "Contact form" : preferred.kind === "founder" ? "Founder" : "Company"}</div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {preferred.email ? (
              <>
                <span className="font-medium text-ink">{preferred.email}</span>
                <CopyButton value={preferred.email} />
              </>
            ) : (
              <TextLink href={preferred.contact_url} external>{preferred.contact_url}</TextLink>
            )}
            <span className="text-muted">{verificationLabel(preferred.verification_status)}</span>
            {preferred.founder_name && <span className="text-muted">{preferred.founder_name}</span>}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">No reliable published contact found yet.</p>
      )}

      {contacts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs font-medium text-faint">
              <tr><th scope="col" className="py-2 pr-4">Contact</th><th scope="col" className="py-2 pr-4">Type</th><th scope="col" className="py-2 pr-4">Verification</th><th scope="col" className="py-2 pr-4">Found via</th><th scope="col" className="py-2">Checked</th></tr>
            </thead>
            <tbody className="divide-y divide-line align-top">
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {c.email ? <><span className="text-ink">{c.email}</span><CopyButton value={c.email} /></> : <TextLink href={c.contact_url} external>Contact form</TextLink>}
                      {c.is_preferred && <span className="text-xs font-medium text-ok">Preferred</span>}
                    </div>
                    {c.founder_name && <div className="text-xs text-faint">{c.founder_name}</div>}
                  </td>
                  <td className="py-2 pr-4 text-muted">{prettyCode(c.kind)}{c.mailbox_role && c.kind === "company" ? ` · ${c.mailbox_role}` : ""}</td>
                  <td className="py-2 pr-4">{verificationLabel(c.verification_status)}{c.mx_valid === false && <div className="text-xs text-bad">Domain has no mail server</div>}</td>
                  <td className="max-w-xs py-2 pr-4 text-xs text-muted">
                    {c.source_url ? <TextLink href={c.source_url} external>{prettyCode(c.discovery_source)}</TextLink> : prettyCode(c.discovery_source)}
                    {c.evidence && <div className="mt-0.5">{c.evidence}</div>}
                  </td>
                  <td className="whitespace-nowrap py-2 text-xs text-faint">{formatDateTime(c.last_checked_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-faint">Guessed and unverified addresses are kept for reference only and are never filled into a draft. A valid mail domain doesn’t prove a mailbox exists.</p>
        </div>
      )}
    </div>
  );
}
