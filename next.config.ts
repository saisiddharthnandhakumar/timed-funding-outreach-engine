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
};

export default nextConfig;
