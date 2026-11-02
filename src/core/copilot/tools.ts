/**
 * The copilot's tool surface.
 *
 * Registry tools are exposed by name with their own JSON Schemas, so the model
 * is bound by exactly the contract the research agents are. One composite tool,
 * `run_quant_research`, drives a full orchestrated research session (plan →
 * agents → critic → report) and returns a compact evidence summary.
 */

import { z } from "zod";
import { executeTool, getToolManifest, PUBLIC_LIMITS } from "@/core/tools";
import { InMemoryAuditSink } from "@/core/audit/log";
import { runResearch } from "@/core/orchestrator/orchestrator";
import { DeterministicReasoner } from "@/core/llm/deterministic";
import type { CopilotToolCall } from "@/core/copilot/types";

export interface CopilotToolSpec {
  name: string;
  description: string;
  input_schema: { type: "object"; [k: string]: unknown };
}

const REGISTRY_TOOLS = [
  "jito_tip_floor",
  "recommend_bundle_tip",
  "jitosol_stats",
  "project_jitosol_yield",
  "predict_bundle_landing",
  "list_datasets",
] as const;

const ResearchInputSchema = z
  .object({
    question: z.string().min(8).max(1000),
    seed: z.number().int().min(0).max(2 ** 31).default(42),
  })
  .strict();

const RESEARCH_TOOL: CopilotToolSpec = {
  name: "run_quant_research",
  description:
    "Run a full multi-agent quant research session on a bundled dataset (synthetic equity, FX or SOL/USDC hourly): " +
    "leakage scan, walk-forward training of baseline/logistic/boosted models, cost-aware backtest, adversarial critique. " +
    "Phrase `question` as a research task, e.g. 'Test a 24-period momentum signal on SOL with costs'. Takes a few seconds.",
  input_schema: {
    type: "object",
    properties: {
      question: { type: "string", description: "Natural-language research task." },
      seed: { type: "integer", description: "Random seed for reproducibility.", default: 42 },
    },
    required: ["question"],
    additionalProperties: false,
  },
};

export function copilotToolSpecs(): CopilotToolSpec[] {
  const manifest = getToolManifest();
  const specs: CopilotToolSpec[] = [];
  for (const name of REGISTRY_TOOLS) {
    const entry = manifest.find((t) => t.name === name);
    if (!entry) continue;
    const schema = { ...(entry.inputSchema as Record<string, unknown>) };
    delete schema.$schema;
    specs.push({
      name: entry.name,
      description: entry.description,
      input_schema: { ...schema, type: "object" },
    });
  }
  specs.push(RESEARCH_TOOL);
  return specs;
}

/** Execute one copilot tool call, never throwing. */
export async function runCopilotTool(name: string, input: unknown, audit: InMemoryAuditSink): Promise<CopilotToolCall> {
  const started = Date.now();
  if (name === "run_quant_research") {
    const parsed = ResearchInputSchema.safeParse(input ?? {});
    if (!parsed.success) {
      return { name, input, ok: false, error: "Input failed schema validation.", durationMs: Date.now() - started };
    }
    try {
      const result = await runResearch({
        question: parsed.data.question,
        seed: parsed.data.seed,
        reasoner: new DeterministicReasoner(),
      });
      const best = result.record.models.find((m) => m.modelId === result.record.bestModelId);
      return {
        name,
        input: parsed.data,
        ok: true,
        output: {
          experimentId: result.record.id,
          dataset: result.record.dataset.datasetId,
          hypothesis: result.plan.hypothesis,
          models: result.record.models.map((m) => ({
            model: m.modelType,
            accuracy: round(m.metrics.accuracy),
            baseRate: round(m.metrics.baseRate),
            auc: round(m.metrics.auc),
            informationCoefficient: round(m.metrics.informationCoefficient),
            sharpe: m.backtest ? round(m.backtest.sharpe) : null,
            maxDrawdown: m.backtest ? round(m.backtest.maxDrawdown) : null,
            totalReturn: m.backtest ? round(m.backtest.totalReturn) : null,
          })),
          bestModel: best?.modelType ?? null,
          critic: {
            passed: result.critique.passed,
            severity: result.critique.severity,
            findings: result.critique.findings.slice(0, 4).map((f) => `${f.severity}: ${f.message}`),
          },
          toolCalls: result.record.toolCalls,
          finalState: result.finalState,
        },
        durationMs: Date.now() - started,
      };
    } catch (err) {
      return { name, input, ok: false, error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - started };
    }
  }

  if (!(REGISTRY_TOOLS as readonly string[]).includes(name)) {
    return { name, input, ok: false, error: `Tool not available to the copilot: ${name}`, durationMs: 0 };
  }
  const res = await executeTool(name, input ?? {}, { seed: 42, limits: PUBLIC_LIMITS, agentId: "copilot", audit });
  return {
    name,
    input,
    ok: res.ok,
    output: res.ok ? compact(res.data) : undefined,
    error: res.ok ? undefined : `${res.error?.code}: ${res.error?.message}`,
    durationMs: res.meta.durationMs,
  };
}

function round(x: number, d = 4): number {
  return Math.round(x * 10 ** d) / 10 ** d;
}

/** Elide long arrays (e.g. projection paths) so tool results stay small. */
export function compact(data: unknown): unknown {
  return JSON.parse(
    JSON.stringify(data, (_k, v) =>
      Array.isArray(v) && v.length > 12 ? [...v.slice(0, 3), `…${v.length - 6} more…`, ...v.slice(-3)] : v,
    ),
  );
}
