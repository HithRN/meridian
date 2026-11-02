import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Copilot",
  description: "Claude-powered copilot for Jito tips, JitoSOL yield and quant research, with every number traced to a tool call.",
};

export default function CopilotLayout({ children }: { children: React.ReactNode }) {
  return children;
}
