import { formatAmount, stageLabel } from "@/lib/format";
import { TextLink } from "../ui";
import { Field, FieldGrid } from "./fields";

export function CompanySnapshot({ startup, round }: { startup: any; round: any | null }) {
  const stage = round?.stage && round.stage !== "unknown" ? stageLabel(round.stage) : null;
  const funding = round?.amount != null ? formatAmount(round.amount, round.currency) : null;
  return (
    <FieldGrid>
      <Field label="Stage">{stage}</Field>
      <Field label="Funding">{funding}</Field>
      <Field label="Sector">{[startup.sector, startup.subsector].filter(Boolean).join(" · ") || null}</Field>
      <Field label="Location">{[startup.hq_city, startup.hq_country].filter(Boolean).join(", ") || null}</Field>
      <Field label="Business model">{startup.business_model}</Field>
      <Field label="Founded">{startup.founded_year}</Field>
      <Field label="Website">{startup.website ? <TextLink href={startup.website} external>{startup.domain ?? startup.website}</TextLink> : null}</Field>
    </FieldGrid>
  );
}
