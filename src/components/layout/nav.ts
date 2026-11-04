/** Primary navigation model. Single source of truth for routes and labels. */
export interface NavItem {
  href: string;
  label: string;
  description: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Always visible, in the order a visitor would work through them. */
export const NAV_PRIMARY: NavItem[] = [
  { href: "/", label: "Overview", description: "What Meridian does" },
  { href: "/markets", label: "Markets", description: "Live chart, order book and trades" },
  { href: "/research", label: "Research", description: "Ask about the market, or test a hypothesis" },
  { href: "/intel", label: "Market intelligence", description: "Live auction, MEV flow, validators" },
  { href: "/ai", label: "Explainable AI", description: "Will a bundle land, and why?" },
  { href: "/jito", label: "Jito Lab", description: "Tip floor, tip advisor, JitoSOL" },
  { href: "/model-health", label: "Model health", description: "Are our models still reliable?" },
  { href: "/experiments", label: "Models & experiments", description: "Run history and model registry" },
  { href: "/copilot", label: "AI Copilot", description: "Ask in English or 日本語" },
];

/** Slide open in the side panel. */
export const NAV_SECTIONS: NavGroup[] = [
  {
    label: "Developer",
    items: [
      { href: "/tools", label: "Tool registry", description: "Schemas and permissions" },
      { href: "/developers", label: "MCP & API", description: "Connect an MCP client" },
      { href: "/coding-agent", label: "Coding sandbox", description: "Restricted agent demo" },
    ],
  },
  {
    label: "Resources",
    items: [
      { href: "/about", label: "How it works", description: "Architecture and methodology" },
      { href: "/security", label: "Security", description: "Boundaries and threat model" },
      { href: "/contact", label: "About", description: "Who builds Meridian" },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = [...NAV_PRIMARY, ...NAV_SECTIONS.flatMap((g) => g.items)];
