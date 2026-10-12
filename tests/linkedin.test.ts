import { describe, expect, it } from "vitest";
import { parseTargets, slugMatchesName } from "@/lib/outreach/linkedin";

describe("linkedin target parsing", () => {
  const text = [
    "Anita Rao | Co-founder & CEO | https://in.linkedin.com/in/anita-rao-12ab",
    "Vikram Shah | CTO | https://www.linkedin.com/in/someone-else",
    "- **Dev Patel** – Head of Growth – https://www.linkedin.com/in/devpatel/",
    "none found",
  ].join("\n");

  it("keeps people whose profile slug fits their name and normalises the URL", () => {
    const t = parseTargets(text, [{ name: "Anita Rao" }]);
    expect(t.map((x) => x.url)).toEqual(["https://www.linkedin.com/in/anita-rao-12ab", "https://www.linkedin.com/in/devpatel"]);
    expect(t[0]).toMatchObject({ name: "Anita Rao", role: "Co-founder & CEO" });
  });

  it("rejects a name/URL pairing that doesn't match", () => {
    expect(slugMatchesName("https://www.linkedin.com/in/someone-else", "Vikram Shah")).toBe(false);
    expect(slugMatchesName("https://www.linkedin.com/in/vikram-shah-9", "Vikram Shah")).toBe(true);
  });
});
