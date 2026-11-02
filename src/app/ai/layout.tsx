import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explainable AI",
  description: "Bundle-landing prediction with boosted trees and a neural network, explained with exact Shapley values, partial dependence and counterfactual tips.",
};

export default function AiLayout({ children }: { children: React.ReactNode }) {
  return children;
}
