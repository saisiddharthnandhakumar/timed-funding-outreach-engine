import { TextLink } from "../ui";

export function FounderCard({ founder }: { founder: { name: string; role: string | null; background_summary: string | null; linkedin_url: string | null } }) {
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium text-ink">{founder.name}</span>
        {founder.role && <span className="text-sm text-muted">{founder.role}</span>}
      </div>
      <p className="mt-1 text-[0.95rem] leading-relaxed text-muted">{founder.background_summary ?? "Background not established from public sources."}</p>
      {founder.linkedin_url && <p className="mt-1 text-sm"><TextLink href={founder.linkedin_url} external>LinkedIn</TextLink></p>}
    </li>
  );
}
