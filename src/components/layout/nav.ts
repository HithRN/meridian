/** Primary navigation model. Single source of truth for routes and labels. */
export interface NavItem {
  href: string;
  label: string;
  description: string;
  /** Module identity colour (CSS variable). */
  accent: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Overview", description: "What Meridian does", accent: "var(--color-mod-overview)" },
      { href: "/research", label: "Research", description: "Run a hypothesis end to end", accent: "var(--color-mod-research)" },
      { href: "/experiments", label: "Experiments", description: "History and comparison", accent: "var(--color-mod-experiments)" },
      { href: "/models", label: "Models", description: "Registry and lifecycle", accent: "var(--color-mod-models)" },
      { href: "/monitoring", label: "Monitoring", description: "Drift and telemetry", accent: "var(--color-mod-monitoring)" },
    ],
  },
  {
    label: "Solana · Jito",
    items: [
      { href: "/jito", label: "Jito Lab", description: "Tip floor, tip advisor, JitoSOL", accent: "var(--color-mod-jito)" },
      { href: "/ai", label: "Explainable AI", description: "Will a bundle land, and why?", accent: "var(--color-mod-agents)" },
      { href: "/copilot", label: "AI Copilot", description: "Ask in English or 日本語", accent: "var(--color-mod-agents)" },
    ],
  },
  {
    label: "Developer",
    items: [
      { href: "/tools", label: "Tool registry", description: "Schemas and permissions", accent: "var(--color-mod-tools)" },
      { href: "/developers", label: "MCP & API", description: "Connect an MCP client", accent: "var(--color-mod-tools)" },
      { href: "/coding-agent", label: "Coding sandbox", description: "Restricted agent demo", accent: "var(--color-mod-tools)" },
    ],
  },
  {
    label: "Resources",
    items: [
      { href: "/about", label: "How it works", description: "Architecture and methodology", accent: "var(--color-mod-resources)" },
      { href: "/security", label: "Security", description: "Boundaries and threat model", accent: "var(--color-mod-resources)" },
      { href: "/contact", label: "About & contact", description: "Who builds Meridian", accent: "var(--color-mod-resources)" },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
