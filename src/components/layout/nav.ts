/** Primary navigation model (§14). Single source of truth for routes/labels. */
export interface NavItem {
  href: string;
  label: string;
  index: string;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", index: "00", description: "Project overview and demo start" },
  { href: "/research", label: "Research", index: "01", description: "Question, plan and live agent trace" },
  { href: "/experiments", label: "Experiments", index: "02", description: "History and metric comparison" },
  { href: "/models", label: "Models", index: "03", description: "Versions and evaluation status" },
  { href: "/monitoring", label: "Monitoring", index: "04", description: "Drift, performance and system health" },
  { href: "/tools", label: "Tools", index: "05", description: "MCP-compatible tool schemas" },
  { href: "/coding-agent", label: "Coding Agent", index: "06", description: "Safe repository-task demonstration" },
  { href: "/about", label: "About", index: "07", description: "Architecture, limits, provenance, safety" },
];
