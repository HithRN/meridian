import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Copilot",
  description: "Claude-powered copilot for Jito tips, JitoSOL yield and quant research, Each answer lists the tool calls behind its figures.",
};

export default function CopilotLayout({ children }: { children: React.ReactNode }) {
  return children;
}
