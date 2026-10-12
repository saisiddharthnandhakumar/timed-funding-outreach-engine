import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cheerio/pg run on the Node.js runtime only; keep them out of the bundler graph.
  serverExternalPackages: ["pg", "cheerio"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The app used to mirror the pipeline (Dashboard / Feed / Qualified / Sources). Old deep links keep working.
  async redirects() {
    return [
      { source: "/dashboard", destination: "/today", permanent: true },
      { source: "/feed", destination: "/opportunities?view=discoveries", permanent: true },
      { source: "/qualified", destination: "/opportunities", permanent: true },
      { source: "/sources", destination: "/settings/discovery", permanent: true },
      { source: "/startups/:id", destination: "/opportunities/:id", permanent: true },
    ];
  },
};

export default nextConfig;
