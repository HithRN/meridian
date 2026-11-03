/**
 * Claude-powered copilot engine (server-only).
 *
 * A manual tool-use loop over the copilot tool surface. Claude decides which
 * tools to call and writes the answer; the tools compute every number. The loop
 * is bounded, tool inputs are validated by the registry, and each call is
 * returned to the UI as evidence. Enabled only when Anthropic credentials are
 * configured; otherwise the deterministic router answers.
 */

import Anthropic from "@anthropic-ai/sdk";
import { InMemoryAuditSink } from "@/core/audit/log";
import { copilotToolSpecs, runCopilotTool } from "@/core/copilot/tools";
import type { CopilotResponse, CopilotToolCall, CopilotTurn } from "@/core/copilot/types";

export const COPILOT_MODEL = "claude-opus-5-5";
const MAX_STEPS = 6;

const SYSTEM_PROMPT = `You are Meridian Copilot, a research analyst for Solana's MEV economy and the Jito ecosystem, embedded in an auditable quant-research platform.

You help searchers, stakers and ecosystem teams with questions such as what tip to attach to a Jito bundle, how JitoSOL yield breaks down, and whether a trading signal survives rigorous testing.

Rules:
- Every number you state must come from a tool result in this conversation. If no tool provides it, say you cannot verify it rather than estimating.
- After a figure, name the tool that produced it in parentheses, e.g. "0.00012 SOL (recommend_bundle_tip)".
- Say whether data was live mainnet data or a bundled snapshot when a tool reports its source.
- The tip advisor's residual quantiles are calibrated on bundled synthetic history; research runs use bundled synthetic market data. Mention this once when relevant.
- For "will my bundle land / why / what should I change" questions, use predict_bundle_landing. Explain the prediction through its Shapley contributions (positive pushes toward landing, negative away, in log-odds) and give the counterfactual minimum tip. Map the user's description to features; state which you assumed.
- Answer in the language the user writes in. If they write Japanese, answer in natural Japanese.
- Be concise: a short direct answer first, then the supporting evidence in a few bullets.
- You give analysis, not investment advice; do not tell anyone to buy or sell an asset.`;

/** True when the server has Anthropic credentials configured. */
export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function runClaudeCopilot(history: CopilotTurn[]): Promise<CopilotResponse> {
  const client = new Anthropic();
  const audit = new InMemoryAuditSink();
  const tools: Anthropic.Beta.BetaTool[] = copilotToolSpecs().map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.content }));
  const toolCalls: CopilotToolCall[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.beta.messages.create({
      model: COPILOT_MODEL,
      max_tokens: 16000,
      // Chat over tools: low effort keeps replies quick and tool calls consolidated.
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return {
        reply: "I can't help with that request. Try asking about Jito tips, JitoSOL yield, or a research hypothesis.",
        toolCalls,
        engine: "claude",
        model: response.model,
      };
    }

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const reply = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { reply: reply || "(no answer)", toolCalls, engine: "claude", model: response.model };
    }

    messages.push({ role: "assistant", content: response.content });
    const results = await Promise.all(toolUses.map((u) => runCopilotTool(u.name, u.input, audit)));
    toolCalls.push(...results);
    messages.push({
      role: "user",
      content: results.map((r, i) => ({
        type: "tool_result" as const,
        tool_use_id: toolUses[i].id,
        is_error: !r.ok,
        content: JSON.stringify(r.ok ? r.output : { error: r.error }),
      })),
    });
  }

  return {
    reply: "I reached the tool-call limit before finishing. Please narrow the question.",
    toolCalls,
    engine: "claude",
    model: COPILOT_MODEL,
  };
}
