import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not emit AI-agent scaffolding files (AGENTS.md / CLAUDE.md).
  agentRules: false,
  async redirects() {
    return [
      { source: "/monitoring", destination: "/model-health", permanent: true },
      { source: "/models", destination: "/experiments#models", permanent: true },
    ];
  },
};

export default nextConfig;
