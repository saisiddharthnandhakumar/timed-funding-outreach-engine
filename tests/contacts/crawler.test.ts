import { describe, expect, it } from "vitest";
import { crawlCompanySite } from "@/lib/contacts/crawler";
import { RateLimiter } from "@/lib/contacts/http";
import { RobotsGuard } from "@/lib/contacts/robots";
import { assertPublicHttpUrl, UnsafeUrlError } from "@/lib/net/safe-fetch";
import { fakeSite } from "./helpers";

const O = "https://nimbus.example";

describe("company-site crawler", () => {
  it("never fetches more than maxPages and stays on the company's own domain", async () => {
    const links = Array.from({ length: 20 }, (_, i) => `<a href="/team-${i}">Team ${i}</a>`).join("") + `<a href="https://other.example/contact">Contact elsewhere</a>`;
    const requested: string[] = [];
    const site = fakeSite({ [`${O}/`]: `<body>${links}</body>`, ...Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`${O}/team-${i}`, "<body>x</body>"])) });
    const fetcher = async (u: string) => { requested.push(u); return site(u); };
    const res = await crawlCompanySite(`${O}/`, { fetcher, robots: new RobotsGuard(fetcher), maxPages: 8, limiter: new RateLimiter(0) });
    expect(res.pages.length).toBeLessThanOrEqual(8);
    expect(requested.some((u) => u.includes("other.example"))).toBe(false);
  });

  it("ignores pages that redirect to another domain", async () => {
    const fetcher = async (url: string) => ({ url: url.endsWith("/robots.txt") ? url : "https://evil.example/landing", status: 200, contentType: url.endsWith("/robots.txt") ? "text/plain" : "text/html", text: "<body>x</body>" });
    const res = await crawlCompanySite(`${O}/`, { fetcher, robots: new RobotsGuard(fetcher), maxPages: 4, limiter: new RateLimiter(0) });
    expect(res.pages).toHaveLength(0);
    expect(res.homepageUnavailable).toBe(true);
    expect(res.notes.join(" ")).toMatch(/redirected off-site/);
  });
});

describe("SSRF guard used by every contact fetch", () => {
  it.each(["http://localhost/x", "http://127.0.0.1/", "http://169.254.169.254/latest/meta-data", "http://10.0.0.5/", "http://[::1]/", "file:///etc/passwd", "ftp://nimbus.example/", "https://user:pw@nimbus.example/", "http://nimbus.example:8080/"])("rejects %s", async (url) => {
    await expect(assertPublicHttpUrl(url)).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});
