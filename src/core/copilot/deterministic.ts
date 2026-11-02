/**
 * Deterministic copilot engine.
 *
 * The zero-cost fallback when no model credentials are configured (or Claude is
 * unreachable). A transparent intent router — English and Japanese keywords —
 * maps the latest question to tool calls and fills a fixed template from their
 * outputs. Less fluent than Claude, but it calls the same tools and returns the
 * same evidence, so the guarantees are identical.
 */

import { InMemoryAuditSink } from "@/core/audit/log";
import { runCopilotTool } from "@/core/copilot/tools";
import type { CopilotResponse, CopilotToolCall, CopilotTurn } from "@/core/copilot/types";
import { SCENARIOS, FEATURES } from "@/core/ai/bundles";

type Lang = "en" | "ja";

const JA = /[぀-ヿ一-鿿]/;

export function detectLang(text: string): Lang {
  return JA.test(text) ? "ja" : "en";
}

export type Intent = "predict" | "tip" | "yield" | "research" | "help";

export function classifyIntent(text: string): Intent {
  const q = text.toLowerCase();
  if (/momentum|backtest|signal|research|strategy|hypothesis|モメンタム|バックテスト|検証|戦略|シグナル/.test(q)) return "research";
  if (/\bwhy\b|explain|predict|will (?:my|the|this|a) bundle land|landing (?:chance|probability)|shap|なぜ|説明|予測|着地する確率|着地確率/.test(q)) return "predict";
  if (/\btips?\b|bundle|land|auction|priority|チップ|バンドル|着地|オークション/.test(q)) return "tip";
  if (/jitosol|stak|yield|apy|reward|mev|ステーキング|ステーク|利回り|報酬|年利/.test(q)) return "yield";
  return "help";
}

function parseTipParams(text: string): { level: 25 | 50 | 75 | 95 | 99; confidence: number } {
  const q = text.toLowerCase();
  const lv = q.match(/\bp(25|50|75|95|99)\b|(25|50|75|95|99)(?:th)?\s*(?:percentile|パーセンタイル|%タイル)/);
  const level = Number(lv?.[1] ?? lv?.[2] ?? 75) as 25 | 50 | 75 | 95 | 99;
  let confidence = 0.8;
  const conf = q.match(/(\d{2})\s*%\s*(?:confiden|chance|probab|sure|確率|信頼|の確率)/);
  if (conf) confidence = Number(conf[1]) / 100;
  else if (/urgent|asap|fast|must land|critical|急ぎ|確実|必ず/.test(q)) confidence = 0.95;
  else if (/cheap|economy|save|low[- ]cost|安く|節約/.test(q)) confidence = 0.5;
  return { level, confidence: Math.min(0.99, Math.max(0.05, confidence)) };
}

/** Map a described bundle to model features: a named scenario plus a stated tip multiple. */
export function parseBundle(text: string): { features: Record<string, number>; scenario: string | null } {
  const q = text.toLowerCase();
  const pick = /liquidat|清算/.test(q)
    ? "liquidation"
    : /stale|old state|big bundle|古い|大きい/.test(q)
      ? "stale"
      : /quiet|backrun|静か|バックラン/.test(q)
        ? "backrun"
        : /arb|hot pool|アービトラージ|裁定/.test(q)
          ? "arb"
          : null;
  const base = SCENARIOS.find((s) => s.id === pick)?.x;
  const features: Record<string, number> = {};
  if (base) FEATURES.forEach((f, j) => (features[f.key] = base[j]));
  const mult = q.match(/(\d+(?:\.\d+)?)\s*(?:x|×|倍)/);
  if (mult) features.tipMultiple = Math.max(-3, Math.min(6, Math.log2(Math.max(0.125, Number(mult[1])))));
  return { features, scenario: SCENARIOS.find((s) => s.id === pick)?.label ?? null };
}

function parseYieldParams(text: string): { amountSol: number; days: number } | null {
  const q = text.toLowerCase().replace(/,/g, "");
  const amt = q.match(/(\d+(?:\.\d+)?)\s*(?:k\s*)?(?:sol|ソル)/);
  if (!amt) return null;
  let amountSol = Number(amt[1]);
  if (/\d\s*k\s*sol/.test(q)) amountSol *= 1000;
  let days = 365;
  const d = q.match(/(\d+)\s*(?:days?|日)/);
  const m = q.match(/(\d+)\s*(?:months?|ヶ月|か月|カ月)/);
  const y = q.match(/(\d+)\s*(?:years?|年)/);
  if (d) days = Number(d[1]);
  else if (m) days = Number(m[1]) * 30;
  else if (y) days = Number(y[1]) * 365;
  return { amountSol, days: Math.min(3650, Math.max(1, days)) };
}

const sol = (x: number) => (x >= 1 ? x.toFixed(4) : x.toPrecision(3));
const pc = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const src = (s: unknown, lang: Lang) =>
  s === "live" ? (lang === "ja" ? "メインネットのライブデータ" : "live mainnet data") : lang === "ja" ? "同梱スナップショット" : "bundled snapshot";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function runDeterministicCopilot(history: CopilotTurn[]): Promise<CopilotResponse> {
  const question = [...history].reverse().find((t) => t.role === "user")?.content ?? "";
  const lang = detectLang(question);
  const intent = classifyIntent(question);
  const audit = new InMemoryAuditSink();
  const calls: CopilotToolCall[] = [];
  const call = async (name: string, input: unknown) => {
    const r = await runCopilotTool(name, input, audit);
    calls.push(r);
    return r;
  };

  let reply: string;

  if (intent === "predict") {
    const { features, scenario } = parseBundle(question);
    const r = await call("predict_bundle_landing", { ...features, model: "gbt", targetProbability: 0.9 });
    if (!r.ok) return fail(lang, calls);
    const o = r.output as any;
    const top = o.contributions.slice(0, 4);
    const lines = top
      .map((c: any) => `- ${c.label} = ${c.value}: ${c.shapLogOdds >= 0 ? "+" : ""}${c.shapLogOdds.toFixed(2)} ${lang === "ja" ? "（対数オッズ）" : "log-odds"}`)
      .join("\n");
    const blockers = o.contributions
      .filter((c: any) => c.feature !== "tipMultiple" && c.shapLogOdds < 0)
      .slice(0, 2)
      .map((c: any) => c.label.toLowerCase())
      .join(lang === "ja" ? "」「" : " and ");
    const cf =
      o.minTipTimesP50 === null
        ? lang === "ja"
          ? `チップをいくら上げても90%には届きません。ボトルネックはチップ以外の「${blockers}」です。`
          : `No tip in range reaches 90% — the bottleneck is not the tip but ${blockers}.`
        : lang === "ja"
          ? `着地確率90%に必要な最小チップ: landed p50 の約 ×${o.minTipTimesP50.toFixed(1)}`
          : `Smallest tip for a 90% landing probability: ≈ ×${o.minTipTimesP50.toFixed(1)} the landed p50`;
    const quality = o.modelQuality;
    reply =
      lang === "ja"
        ? `**着地確率: ${pc(o.probability)}**（勾配ブースティング木, predict_bundle_landing）${scenario ? ` — シナリオ「${scenario}」` : ""}\n\n` +
          `平均的なバンドルの ${pc(o.baseProbability)} から、各特徴量の厳密なShapley値で説明します:\n\n${lines}\n\n${cf}\n\n` +
          `モデル品質: AUC ${quality.auc.toFixed(3)}（理論上限 ${quality.oracleAuc.toFixed(3)}）、ECE ${pc(quality.ece)}、説明の忠実度 ${quality.explanationFaithfulness.toFixed(2)}。文書化されたオークションシミュレーターで学習しています。`
        : `**Landing probability: ${pc(o.probability)}** (gradient-boosted trees, predict_bundle_landing)${scenario ? ` — scenario: ${scenario}` : ""}\n\n` +
          `Starting from ${pc(o.baseProbability)} for an average bundle, exact Shapley values attribute the difference:\n\n${lines}\n\n${cf}\n\n` +
          `Model quality: AUC ${quality.auc.toFixed(3)} (oracle ceiling ${quality.oracleAuc.toFixed(3)}), ECE ${pc(quality.ece)}, explanation faithfulness ${quality.explanationFaithfulness.toFixed(2)}. Trained on a documented bundle-auction simulator.`;
  } else if (intent === "tip") {
    const { level, confidence } = parseTipParams(question);
    const rec = await call("recommend_bundle_tip", { level, confidence, useLive: true });
    if (!rec.ok) return fail(lang, calls);
    const o = rec.output as any;
    const v = o.validation;
    const anchor = o.anchorSource === "live" ? src("live", lang) : src("snapshot", lang);
    reply =
      lang === "ja"
        ? `**推奨チップ: ${sol(o.tipSol)} SOL（${o.tipLamports.toLocaleString("en-US")} lamports）** (recommend_bundle_tip)\n\n` +
          `次の1時間に着地するバンドルの上位${100 - level}%に入る（p${level}を上回る）確率 ${pc(o.confidence, 0)} を狙った値です。\n\n` +
          `- 現在のレジーム: **${o.regime}**、基準値 ${sol(o.anchorSol)} SOL（${anchor}）\n` +
          `- ウォークフォワード検証（${v.folds}分割・${v.testedHours}時間）: 実現カバレッジ ${pc(v.coverage)}（目標 ${pc(v.evaluatedConfidence, 0)}）。前時間の値をそのまま使う単純ルールは ${pc(v.coverageNaive)}\n` +
          `- 混雑時のカバレッジ: レジーム条件付き ${pc(v.coverageHot)} vs 全体分位点 ${pc(v.coverageHotGlobal)}\n` +
          `- 保証の対価（中央値の過払い倍率）: ×${v.medianOverpay.toFixed(2)}\n\n` +
          `残差分位点は同梱の合成履歴で較正しています。投資助言ではありません。`
        : `**Recommended tip: ${sol(o.tipSol)} SOL (${o.tipLamports.toLocaleString("en-US")} lamports)** (recommend_bundle_tip)\n\n` +
          `Targets a ${pc(o.confidence, 0)} chance of outbidding the p${level} of bundles landing next hour.\n\n` +
          `- Regime now: **${o.regime}**; anchor ${sol(o.anchorSol)} SOL from ${anchor}\n` +
          `- Walk-forward check (${v.folds} folds, ${v.testedHours} hours): realised coverage ${pc(v.coverage)} vs target ${pc(v.evaluatedConfidence, 0)}; naive "last hour's p${level}" rule: ${pc(v.coverageNaive)}\n` +
          `- In congested hours: ${pc(v.coverageHot)} with regime conditioning vs ${pc(v.coverageHotGlobal)} with one global quantile\n` +
          `- Price of the guarantee: median overpay ×${v.medianOverpay.toFixed(2)}\n\n` +
          `Residual quantiles are calibrated on bundled synthetic history. Not investment advice.`;
  } else if (intent === "yield") {
    const stats = await call("jitosol_stats", {});
    if (!stats.ok) return fail(lang, calls);
    const s = stats.output as any;
    const params = parseYieldParams(question);
    let projection = "";
    if (params) {
      const p = await call("project_jitosol_yield", { ...params, useLive: true });
      if (p.ok) {
        const o = p.output as any;
        projection =
          lang === "ja"
            ? `\n\n**${o.amountSol} SOLを${o.days}日間**: JitoSOLで約 ${sol(o.jitoSolEnd)} SOL、MEV分を除くと ${sol(o.nativeStakeEnd)} SOL — MEVによる上乗せ ${sol(o.mevUpliftSol)} SOL (project_jitosol_yield)`
            : `\n\n**${o.amountSol} SOL for ${o.days} days**: ≈ ${sol(o.jitoSolEnd)} SOL as JitoSOL vs ${sol(o.nativeStakeEnd)} SOL without the MEV component — an MEV uplift of ${sol(o.mevUpliftSol)} SOL (project_jitosol_yield)`;
      }
    }
    const mev7 = s.mevRewardsSol.reduce((a: number, p: any) => a + p.value, 0);
    reply =
      lang === "ja"
        ? `**JitoSOLの現在のAPYは ${pc(s.apy, 2)}** (jitosol_stats, ${src(s.source, lang)})\n\n` +
          `- MEV由来の推定APY: ${pc(s.mevApyEstimate, 2)}（報告されたMEV報酬 ÷ TVL を年率換算）\n` +
          `- TVL: ${Math.round(s.tvlSol).toLocaleString("en-US")} SOL、バリデーター数: ${s.numValidators}\n` +
          `- 直近${s.mevRewardsSol.length}日間のMEV報酬合計: ${Math.round(mev7).toLocaleString("en-US")} SOL` +
          projection +
          `\n\n報告値に基づく計算であり、予測や投資助言ではありません。`
        : `**JitoSOL APY is ${pc(s.apy, 2)}** (jitosol_stats, ${src(s.source, lang)})\n\n` +
          `- Estimated MEV component: ${pc(s.mevApyEstimate, 2)} (reported MEV rewards ÷ TVL, annualised)\n` +
          `- TVL: ${Math.round(s.tvlSol).toLocaleString("en-US")} SOL across ${s.numValidators} validators\n` +
          `- MEV rewards over the last ${s.mevRewardsSol.length} days: ${Math.round(mev7).toLocaleString("en-US")} SOL` +
          projection +
          `\n\nArithmetic on reported figures — not a forecast or investment advice.`;
  } else if (intent === "research") {
    const period = question.match(/(\d+)/)?.[1] ?? "24";
    const researchQ =
      lang === "ja"
        ? `Test whether a ${period}-period momentum signal has predictive value on the SOL dataset, compare three models, use walk-forward validation and include transaction costs.`
        : question;
    const r = await call("run_quant_research", { question: researchQ });
    if (!r.ok) return fail(lang, calls);
    const o = r.output as any;
    const best = o.models.find((m: any) => m.model === o.bestModel) ?? o.models[0];
    const findings = o.critic.findings.map((f: string) => `  - ${f}\n`).join("");
    const sharpe = best.sharpe != null ? best.sharpe.toFixed(2) : "—";
    reply =
      lang === "ja"
        ? `**研究セッション ${o.experimentId} が完了しました** (run_quant_research)\n\n仮説: ${o.hypothesis}\n\n` +
          `- 最良モデル: ${best.model} — 正解率 ${pc(best.accuracy)}（ベースレート ${pc(best.baseRate)}）、AUC ${best.auc.toFixed(3)}、シャープ ${sharpe}、最大DD ${best.maxDrawdown != null ? pc(best.maxDrawdown) : "—"}\n` +
          `- 批評エージェント: ${o.critic.passed ? "合格" : "不合格"}（深刻度 ${o.critic.severity}）\n${findings}- 監査済みツール呼び出し: ${o.toolCalls}回\n\n同梱の合成データでの結果です。`
        : `**Research session ${o.experimentId} finished** (run_quant_research)\n\nHypothesis: ${o.hypothesis}\n\n` +
          `- Best model: ${best.model} — accuracy ${pc(best.accuracy)} vs base rate ${pc(best.baseRate)}, AUC ${best.auc.toFixed(3)}, Sharpe ${sharpe}, max drawdown ${best.maxDrawdown != null ? pc(best.maxDrawdown) : "—"}\n` +
          `- Critic: ${o.critic.passed ? "passed" : "did not pass"} (severity ${o.critic.severity})\n${findings}- Audited tool calls: ${o.toolCalls}\n\nComputed on bundled synthetic data.`;
  } else {
    reply =
      lang === "ja"
        ? "Jitoバンドルのチップ、JitoSOLの利回り、着地予測の説明、トレーディングシグナルの検証についてお手伝いできます。例:\n\n- 「p95を90%の確率で上回るにはチップはいくら？」\n- 「100 SOLを1年間JitoSOLにしたら？」\n- 「混雑時の清算バンドルはなぜ着地しにくい？説明して」\n- 「SOLで24期間モメンタムを検証して」"
        : "I can help with Jito bundle tips, JitoSOL yield, explaining bundle-landing predictions, and testing trading signals. Try:\n\n- \"What tip outbids p95 with 90% confidence?\"\n- \"What would 100 SOL earn as JitoSOL over a year?\"\n- \"Explain why my liquidation bundle might not land.\"\n- \"Test a 24-period momentum signal on SOL with costs.\"";
  }

  return { reply, toolCalls: calls, engine: "deterministic" };
}

function fail(lang: Lang, toolCalls: CopilotToolCall[]): CopilotResponse {
  return {
    reply: lang === "ja" ? "ツールの実行に失敗しました。もう一度お試しください。" : "A tool call failed; please try again.",
    toolCalls,
    engine: "deterministic",
  };
}
