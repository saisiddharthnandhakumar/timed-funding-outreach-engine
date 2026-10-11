import { describe, expect, it } from "vitest";
import { hasPriorOutreach, type OutreachLookup } from "@/lib/outreach/guard";

const lookup = (statuses: string[]): OutreachLookup => ({ liveOutreachStatuses: async () => statuses });

describe("outreach duplication guard", () => {
  it("startup never contacted → allowed", async () => {
    expect(await hasPriorOutreach(lookup([]), "s1")).toBe(false);
  });
  it.each(["generated", "draft_created", "approved", "sent"])("startup with %s outreach → blocked", async (status) => {
    expect(await hasPriorOutreach(lookup([status]), "s1")).toBe(true);
  });
});
