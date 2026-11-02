/** Primary navigation model (§14). Single source of truth for routes/labels. */
export interface NavItem {
  href: string;
  label: string;
  index: string;
  description: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Start",
    items: [{ href: "/", label: "Overview", index: "00", description: "What Meridian is, in one screen" }],
  },
  {
    label: "Solana · Jito",
    items: [
      { href: "/jito", label: "Jito Lab", index: "01", description: "Live tip floor, tip advisor, JitoSOL yield" },
      { href: "/ai", label: "Explainable AI", index: "02", description: "Will a bundle land — and why?" },
      { href: "/copilot", label: "AI Copilot", index: "03", description: "Ask in English or 日本語" },
    ],
  },
  {
    label: "Quant research",
    items: [
      { href: "/research", label: "Research", index: "04", description: "Question, plan and live agent trace" },
      { href: "/experiments", label: "Experiments", index: "05", description: "History and metric comparison" },
      { href: "/models", label: "Models", index: "06", description: "Versions and evaluation status" },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/monitoring", label: "Monitoring", index: "07", description: "Drift, performance and system health" },
      { href: "/tools", label: "Tools", index: "08", description: "MCP-compatible tool schemas" },
      { href: "/coding-agent", label: "Coding Agent", index: "09", description: "Safe repository-task demonstration" },
      { href: "/about", label: "How it works", index: "10", description: "Architecture, agents, guarantees, safety" },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
