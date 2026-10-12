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
  // The UI was reorganised around the scout's workflow; old bookmarks and links keep working.
  async redirects() {
    return [
      { source: "/dashboard", destination: "/today", permanent: true },
      { source: "/qualified", destination: "/opportunities", permanent: true },
      { source: "/startups/:id", destination: "/opportunities/:id", permanent: true },
      { source: "/feed", destination: "/discoveries", permanent: true },
      { source: "/sources", destination: "/settings/discovery", permanent: true },
    ];
  },
};

export default nextConfig;
