# Meridian

**Research with clarity. Decisions with confidence.** From research hypothesis to reproducible evidence.

Meridian is an AI-assisted quantitative research platform. Agents propose and coordinate,
deterministic tools calculate, an independent critic challenges the results, and every
conclusion in the evidence report links to the tool call that produced it.

> **Synthetic-data demonstration.** Research results are computed on bundled synthetic market
> data; they validate the method, reproducibility and leakage controls, and are not evidence
> about any real market. No real-money execution. Not investment advice.

Built and maintained by **Sanyam** · source: [HithRN/meridian](https://github.com/HithRN/meridian)
(the single source of truth for attribution in the app is `src/lib/site.ts`).

## Feature status

| Feature | Status | Where |
| --- | --- | --- |
| Research runs: plan → agents → critic → evidence report | Working | `/research` |
| Walk-forward evaluation, leakage scan, seeded reproducibility | Working | core |
| Backtest with next-bar execution, fees, spread, vol slippage, √-impact, borrow, Sharpe SE | Working | core |
| Model registry with explicit acceptance criteria | Working | `/models` |
| Monitoring with measured vs simulated telemetry labelled | Working | `/monitoring` |
| MCP server (Streamable HTTP, JSON-RPC 2.0) + REST API | Working, tested with the official MCP TypeScript SDK client | `/api/mcp`, `/developers` |
| Solana · Jito vertical: Jito Lab, Explainable AI, Copilot | Working (Claude copilot needs `ANTHROPIC_API_KEY`) | `/jito`, `/ai`, `/copilot` |
| Accounts, team workspaces, RBAC | Planned | — |
| Durable experiment storage (PostgreSQL / object storage) | Planned | — |
| Real dataset upload, licensed market data | Planned | — |

**Deployment note:** the public deployment updates when this branch is merged into `main`.
Until then the live site shows the earlier version without the Solana · Jito vertical,
the MCP server or the redesigned interface.

## New: Solana · Jito vertical + AI copilot

| Page | What it does |
| --- | --- |
| **Jito Lab** (`/jito`) | Live tip floor from Jito's block engine; a **conformal bundle-tip advisor** ("what tip outbids p95 next hour with 90% confidence?") validated walk-forward; JitoSOL APY, estimated MEV share and position projections from the live stake-pool API. |
| **AI Copilot** (`/copilot`) | Claude (`claude-opus-5-5`) answers questions in English or Japanese by calling Meridian's audited tools: tip floor, tip advisor, JitoSOL stats, yield projection, and full multi-agent research runs. Every answer shows the tool calls behind it. |

| **Explainable AI** (`/ai`) | Predicts whether a Jito bundle lands with **logistic regression, gradient-boosted trees and a neural network written from scratch in TypeScript**, then explains each prediction with **exact Shapley values**, partial dependence, calibration and a **counterfactual minimum tip**. The explanations are checked against the simulator's known mechanism. |

**Explainable AI results** (held-out test set, 2,000 bundles):

| Model | AUC | Log loss | ECE | Explanation faithfulness (cosine to truth) |
| --- | --- | --- | --- | --- |
| Logistic regression | 0.887 | 0.430 | 3.2% | 0.92 |
| Neural network (8→24→1, Adam) | 0.895 | 0.414 | 3.0% | 0.97 |
| Gradient-boosted trees (Newton, depth 3) | 0.900 | 0.399 | 2.8% | 0.98 |
| Oracle (true probabilities) | 0.908 | 0.383 | 1.5% | — |

Shapley values are computed exactly over all 2⁸ coalitions (no sampling), so base + Σφ equals the model's
log-odds. The copilot exposes the model as the `predict_bundle_landing` tool, so Claude can explain a
prediction in English or Japanese without inventing numbers. The simulator stands in for the block engine's
landed/dropped labels, which are what the same pipeline would train on in production.

**Tip advisor method.** Mondrian split-conformal forecasting of log-tip residuals around an EMA anchor,
conditioned on a congestion regime. Walk-forward over 2,880 hours it hits its target coverage at every
level (for example 80.0% at a 80% target), while the naive "tip last hour's p95" rule is right ~53% of the time
and a single global quantile drops to ~65% during congestion. The calibration history is synthetic and
shaped on the live API's percentile spreads; recalibrate on a recorded mainnet feed before production use.

**Enabling Claude.** Copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`. Without it the copilot
uses a bilingual deterministic router over the same tools — still free, still fully traced.

Live data comes from Jito's public, keyless endpoints (`bundles.jito.wtf` tip floor,
`kobe.mainnet.jito.network` stake-pool stats), cached for 60 s, with bundled snapshots as fallback.

---

## Table of contents

- [Why this exists](#why-this-exists)
- [Architecture](#architecture)
- [The agent workflow](#the-agent-workflow)
- [Tools and MCP server](#tools-and-mcp-server)
- [Reproducibility & guardrails](#reproducibility--guardrails)
- [Local development](#local-development)
- [Testing](#testing)
- [Deployment](#deployment)
- [API reference](#api-reference)
- [Project layout](#project-layout)
- [Limitations](#limitations)
- [Cost](#cost)

---

## Why this exists

The platform separates **reasoning** from **computation**:

- A **reasoning layer** — a browser-local language model (WebLLM/WebGPU) or a transparent
  deterministic policy — interprets the question into a *structured, schema-validated plan*
  and narrates the agents' intent. **It never produces a metric, a return, or a p-value.**
- A set of **deterministic tools** performs every calculation. Inputs are validated on the
  way in and outputs on the way out; each call is logged to an audit trail with agent id,
  input hash and output summary.

This boundary is what lets the same platform run with or without a model and still satisfy
every guarantee: reproducibility, leakage-safety, and full traceability from report back to
the tool call that produced each figure.

## Architecture

| Layer | Technology | Purpose |
| --- | --- | --- |
| Interface | Next.js 16 · React 19 · TypeScript · Tailwind v4 | Research workspace, agent trace, comparison, reports |
| Reasoning | WebLLM/WebGPU + deterministic fallback | Browser-local planning; deterministic policy when unsupported |
| Orchestration | Typed state machine | `planner → workers → critic → reporter` |
| Tools | Zod/JSON-Schema contracts, served over MCP and REST | Strictly typed, audited, deterministic execution |
| Compute | Route Handlers · Web Workers | Bounded ML, backtest and profiling kernels (isomorphic TS) |
| MLOps | JSON experiment store (+ MLflow-portable export) | Versioned records, evaluation, drift & health |
| Hosting | Vercel | Public, serverless, zero-cost |
| CI | GitHub Actions | Typecheck, lint, unit tests, build |

The numerical core (`src/core`) is **framework-agnostic, dependency-light TypeScript** so
the *identical* code runs in a Vercel Route Handler and in a browser Web Worker — no native
addons, no Python runtime, no paid workers.

## The agent workflow

Every session advances through a fixed, inspectable state machine; each transition is
persisted in the trace.

```
RECEIVED → PLAN_CREATED → DATA_VALIDATED → HYPOTHESIS_DEFINED → FEATURES_READY
        → EXPERIMENTS_RUNNING → RESULTS_READY → CRITIQUE → REPORT_READY
```

| Agent | Responsibility | Hard boundary |
| --- | --- | --- |
| Orchestrator | Decompose task, enforce workflow & context | Never invents metrics or bypasses tools |
| Data Agent | Schema, missingness, timestamp integrity, leakage scan | Never modifies source data silently |
| Research Agent | Hypothesis, features, baseline, validation plan | Never declares success before evaluation |
| ML Agent | Train/evaluate approved models, record metrics | Never changes protocol without logging it |
| Quant Agent | Predictions → positions, cost-aware backtest | Never uses future information |
| Critic Agent | Falsify results, expose methodological weakness | Never silently changes results |
| Reporter Agent | Evidence report strictly from tool outputs | Never invents citations/metrics/experiments |
| Coding Agent | Inspect sandbox, propose patch, run tests | Never runs destructive/production commands |

## Tools and MCP server

Tools are discovered by name with strict input/output JSON Schemas. They are served two ways:

- **MCP server** at `POST /api/mcp` — Model Context Protocol over Streamable HTTP, stateless,
  JSON responses. Implements `initialize` (version negotiation: 2025-11-25, 2025-06-18,
  2025-03-26), `notifications/initialized`, `ping`, `tools/list` and `tools/call`, returns
  `structuredContent` validated against each tool's output schema, marks every tool
  read-only, checks `Origin` and `MCP-Protocol-Version`, and rate-limits per client.
  Connect with `claude mcp add --transport http meridian https://<host>/api/mcp`.
  Verified with raw JSON-RPC (curl) and the official `@modelcontextprotocol/sdk` client.
- **REST**: discovery `GET /api/tools`, execution `POST /api/tool/{name}`.

`list_datasets` · `load_dataset` · `profile_dataset` · `create_features` ·
`walk_forward_split` · `train_model` · `evaluate_model` · `backtest` · `drift_check` ·
`record_experiment` · `inspect_repo` · `propose_patch` · `run_tests` ·
`jito_tip_floor` · `recommend_bundle_tip` · `jitosol_stats` · `project_jitosol_yield` · `predict_bundle_landing`

Each tool declares a permission class (`read-data`, `experiment`, `backtest`, `monitoring`,
`network-read`, `coding-readonly`, `coding-restricted`). All are deterministic given input and
seed except the `network-read` tools, which report whether their data is live or a snapshot.

## Reproducibility & guardrails

- **Deterministic metrics** — no number reaches a report unless a tool produced it.
- **Leakage-safe by construction** — features use only information available at prediction
  time; walk-forward splits are embargoed; a correlation scan flags future-derived columns
  (verified against a bundled leakage fixture).
- **Reproducible** — every run pins dataset version + content hash, seed, and kernel
  version. A seeded RNG (mulberry32) replaces `Math.random()` throughout, so identical
  inputs yield byte-identical outputs.
- **Bounded** — row, model, fold and epoch counts are capped for public requests.
- **Auditable & replayable** — every tool call is logged; each tool is independently
  replayable from its recorded input.

## Local development

Requirements: **Node ≥ 20**. (Developed on Node 24, npm 11.)

```bash
npm install
npm run dev          # http://localhost:3000
```

Useful scripts:

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run test         # vitest (unit)
npm run test:coverage
npm run build        # production build
npm run verify       # typecheck + lint + test
```

## Testing

- **Unit** (`vitest`, `tests/unit`): deterministic pipeline & reproducibility, end-to-end
  orchestration through every workflow state, and the §18 acceptance criteria — schema
  rejection of invalid/unknown inputs, leakage-fixture detection, and coding-sandbox safety.
- **E2E** (`playwright`, `tests/e2e`): drives the public routes, runs a deterministic
  research session in the browser, and confirms the no-WebGPU fallback path.

```bash
npm run test
npm run test:e2e     # requires: npx playwright install --with-deps
```

## Deployment

The app deploys to **Vercel** with no configuration and no environment variables.

```bash
npm i -g vercel
vercel            # preview
vercel --prod     # production
```

Or import the repository at [vercel.com/new](https://vercel.com/new); the framework is
auto-detected. `main` is deployed by the included GitHub Actions workflow after the
verify + build gate passes.

**WebLLM note:** the browser-local model (default `Llama-3.2-1B-Instruct-q4f16_1-MLC`) is
downloaded on-device on first use in WebGPU-capable browsers; it never leaves the device
and requires no key. Browsers without WebGPU automatically use the deterministic reasoner —
identical guarantees, no download.

## API reference

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/health` | GET | Deployment health + versions |
| `/api/mcp` | POST | MCP JSON-RPC endpoint (Streamable HTTP, stateless) |
| `/api/tools` | GET | Tool discovery + JSON Schemas |
| `/api/tool/{name}` | POST | Execute one bounded, deterministic tool |
| `/api/experiments` | GET/POST | List / register experiment records |
| `/api/experiments/{id}` | GET | Experiment record, trace and audit |
| `/api/monitoring` | GET | Drift, latency, performance history |
| `/api/research` | POST | Run a full deterministic research session server-side |
| `/api/jito` | GET | Live tip floor + JitoSOL stake-pool stats (with fallback) |
| `/api/ai` | GET | Trained landing models, metrics, Shapley importances, PDPs (prerendered) |
| `/api/copilot` | GET/POST | Copilot engine status / ask a question (Claude or deterministic) |

## Project layout

```
src/
  app/                 # Next.js routes (pages + API route handlers)
  components/          # UI: primitives, layout, charts, experiment views
  core/                # framework-agnostic domain (runs in Node AND the browser)
    data/              # bundled synthetic datasets, profiling, leakage scan
    ml/                # seeded RNG, features, splits, models, metrics, pipeline
    backtest/          # cost-aware backtest engine
    tools/             # tool registry + catalogs
    mcp/               # Model Context Protocol server (JSON-RPC)
    ai/                # bundle simulator, from-scratch models, explainability
    orchestrator/      # state machine, agents, critic, reporter
    llm/               # reasoner interface, deterministic policy, WebLLM adapter
    experiments/       # experiment store + seed
    monitoring/        # drift + system metrics
    audit/             # audit trail
  hooks/  store/  workers/
tests/                 # unit (vitest) + e2e (playwright)
```

## Limitations

- Models are compact pure-TypeScript learners (L2 logistic regression, gradient-boosted
  decision stumps) chosen to run identically in a serverless route and a browser worker.
  They are not tuned production alpha models.
- The serverless experiment store is **ephemeral per warm instance** by design; durable
  history lives in the browser (localStorage). An MLflow-portable export/import is provided.
- Backtests execute one bar after the signal and charge fees, half-spread, volatility-scaled
  slippage, square-root market impact and short borrow. They still omit liquidity and
  volume-participation limits, trading calendars, corporate actions and survivorship controls,
  so they are not institutional-grade.
- Sharpe uncertainty uses the Lo (2002) i.i.d. standard error; fold-level and autocorrelation-
  robust intervals are future work.
- Monitoring latency quantiles are measured on the reference runs of the serving instance; the
  latency history chart is simulated and labelled so. There is no uptime monitor.
- Data is synthetic. Any "edge" shown is a property of the generator, stated conditionally.

## Running cost

No external inference is required in deterministic mode, and browser-local reasoning is
available through WebLLM. Market data is synthetic and the Jito endpoints are public and
keyless, so the demo runs on a free hosting tier. The optional Claude copilot is billed to the
operator's Anthropic account and is rate-limited per client.
