import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This folder is its own project; don't infer a workspace root from a parent lockfile.
  outputFileTracingRoot: __dirname,
  // Lease pages read the generated full records at request time.
  outputFileTracingIncludes: { "/lease/[prc]": ["./data/generated/**"], "/lease/[prc]/opengraph-image": ["./data/generated/**"] },
};

export default nextConfig;
