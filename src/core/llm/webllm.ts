/**
 * WebLLM reasoner (browser-only).
 *
 * Runs a small quantised open model entirely in the browser via WebGPU — no
 * API key, no server inference, no data leaving the device (§17). It implements
 * the same `Reasoner` contract as the deterministic policy and is used only
 * where WebGPU is available.
 *
 * Robustness by construction: the model is asked to *extract parameters* as
 * strict JSON, which is then Zod-validated. If the model is unavailable or emits
 * unparseable output, the reasoner transparently falls back to the deterministic
 * interpreter, so a run always completes and the plan is always valid. The model
 * is never trusted with a number that matters — it only shapes the plan and
 * writes narration; all metrics still come from deterministic tools.
 */

import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import type { Reasoner, NarrationContext } from "@/core/llm/types";
import type { ResearchPlan } from "@/core/orchestrator/types";
import type { DatasetMeta } from "@/core/data/dataset";
import { DeterministicReasoner } from "@/core/llm/deterministic";
import {
  FeatureConfigSchema,
  WindowConfigSchema,
  StrategyConfigSchema,
  CostConfigSchema,
  ModelTypeSchema,
} from "@/core/schemas/configs";
import { z } from "zod";

/** Default model: small, fast to load, reliable at short JSON extraction. */
export const DEFAULT_WEBLLM_MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

/** Reject a promise if it does not settle within `ms`, so a hung model call
 *  cannot stall a run — the caller falls back to the deterministic path. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

const CALL_TIMEOUT_MS = 25_000;
const LOAD_TIMEOUT_MS = 180_000;

export interface WebLlmProgress {
  progress: number; // 0..1
  text: string;
}

const PlanExtractionSchema = z.object({
  datasetId: z.string(),
  momentumPeriod: z.number().int().min(2).max(200),
  horizon: z.number().int().min(1).max(24),
  folds: z.number().int().min(2).max(8),
  mode: z.enum(["expanding", "rolling"]),
  models: z.array(ModelTypeSchema).min(1),
  includeCosts: z.boolean(),
  allowShort: z.boolean(),
});

export class WebLlmReasoner implements Reasoner {
  id = "webllm" as const;
  label: string;
  private readonly fallback = new DeterministicReasoner();

  constructor(
    private engine: MLCEngineInterface,
    modelId: string,
  ) {
    this.label = modelId;
  }

  isReady(): boolean {
    return true;
  }

  async interpret(question: string, datasets: DatasetMeta[]): Promise<ResearchPlan> {
    const ids = datasets.map((d) => `${d.id} (${d.symbol}: ${d.name})`).join("; ");
    const system =
      "You convert a quantitative research question into a JSON plan. " +
      "Respond with ONLY a JSON object, no prose. Keys: datasetId (one of the given ids), " +
      "momentumPeriod (int), horizon (int), folds (int 2-8), mode ('expanding'|'rolling'), " +
      "models (subset of ['majority','logistic','gbt']), includeCosts (bool), allowShort (bool). " +
      "Always include 'majority' as a baseline in models.";
    const user = `Available datasets: ${ids}\n\nQuestion: ${question}`;

    try {
      const reply = await withTimeout(
        this.engine.chat.completions.create({
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0,
          max_tokens: 300,
          response_format: { type: "json_object" },
        }),
        CALL_TIMEOUT_MS,
        "WebLLM plan",
      );
      const content = reply.choices?.[0]?.message?.content ?? "";
      const parsed = PlanExtractionSchema.parse(JSON.parse(extractJson(content)));

      const dataset =
        datasets.find((d) => d.id === parsed.datasetId) ??
        datasets.find((d) => d.id.includes("equity")) ??
        datasets[0];
      const models = Array.from(new Set([...parsed.models, "majority" as const]));

      const featureConfig = FeatureConfigSchema.parse({
        momentumPeriod: parsed.momentumPeriod,
        volatilityWindow: parsed.momentumPeriod,
        horizon: parsed.horizon,
      });
      const windowConfig = WindowConfigSchema.parse({
        folds: parsed.folds,
        mode: parsed.mode,
        embargo: Math.max(1, featureConfig.horizon),
      });
      const strategyConfig = StrategyConfigSchema.parse({ allowShort: parsed.allowShort });
      const costConfig = CostConfigSchema.parse(
        parsed.includeCosts ? {} : { costBps: 0, slippageBps: 0 },
      );

      return {
        datasetId: dataset.id,
        version: dataset.version,
        hypothesis:
          `A ${parsed.momentumPeriod}-period momentum signal carries predictive value for the ` +
          `${featureConfig.horizon}-bar forward return on ${dataset.symbol}, under leakage-safe ` +
          `walk-forward validation${parsed.includeCosts ? " net of transaction costs" : ""}.`,
        featureConfig,
        windowConfig,
        models: ["majority", "logistic", "gbt"].filter((m) => models.includes(m as never)) as ResearchPlan["models"],
        includeCosts: parsed.includeCosts,
        strategyConfig,
        costConfig,
        notes: [
          `Plan interpreted by browser-local model ${this.label}.`,
          `Target dataset: ${dataset.name}; momentum ${parsed.momentumPeriod}, horizon ${featureConfig.horizon}.`,
          `Validation: ${windowConfig.folds}-fold ${windowConfig.mode} walk-forward.`,
          parsed.includeCosts ? "Transaction costs enabled." : "Costs disabled (gross).",
        ],
      };
    } catch {
      // Any failure (no WebGPU, bad JSON, timeout) → deterministic plan.
      const plan = await this.fallback.interpret(question, datasets);
      plan.notes.unshift(`Model plan unavailable; used deterministic interpreter as fallback.`);
      return plan;
    }
  }

  async narrate(context: NarrationContext): Promise<string> {
    const { agentId, plan } = context;
    try {
      const reply = await withTimeout(
        this.engine.chat.completions.create({
          messages: [
            {
              role: "system",
              content:
                "You are the " +
                agentId +
                " in a quant research pipeline. In ONE concise sentence, state what you are about to do. " +
                "Do not invent any numbers, metrics or results.",
            },
            { role: "user", content: `Hypothesis: ${plan.hypothesis}` },
          ],
          temperature: 0.2,
          max_tokens: 60,
        }),
        CALL_TIMEOUT_MS,
        "WebLLM narration",
      );
      const text = reply.choices?.[0]?.message?.content?.trim();
      if (text && text.length > 8) return text.replace(/\s+/g, " ");
    } catch {
      /* fall through */
    }
    return this.fallback.narrate(context);
  }
}

function extractJson(s: string): string {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  return start >= 0 && end > start ? s.slice(start, end + 1) : s;
}

/** Load the WebLLM engine and return a ready reasoner. Client-only. */
export async function createWebLlmReasoner(
  onProgress: (p: WebLlmProgress) => void,
  modelId: string = DEFAULT_WEBLLM_MODEL,
): Promise<WebLlmReasoner> {
  const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
  const engine = await withTimeout(
    CreateMLCEngine(modelId, {
      initProgressCallback: (report: { progress: number; text: string }) =>
        onProgress({ progress: report.progress, text: report.text }),
    }),
    LOAD_TIMEOUT_MS,
    "WebLLM model download",
  );
  return new WebLlmReasoner(engine, modelId);
}
