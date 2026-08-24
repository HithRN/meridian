import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not emit AI-agent scaffolding files (AGENTS.md / CLAUDE.md).
  agentRules: false,
};

export default nextConfig;
