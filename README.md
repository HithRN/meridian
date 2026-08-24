# Meridian

**A multi-agent quantitative research & ML-operations platform.**

Meridian decomposes a natural-language research question into a plan, delegates it to
specialised agents, and lets them investigate a quantitative hypothesis through
deterministic, MCP-compatible tools — leakage-safe experiments, cost-aware backtests,
an adversarial critique, and an auditable report in which **every number is traceable to a
tool call**. It runs at **zero cost**: browser-local model inference where WebGPU is
available, and a fully deterministic fallback everywhere else. No paid model, data, or
infrastructure APIs are required.

> All results are computed on **bundled synthetic market data** for demonstration only.
> Nothing here is investment advice or evidence about any real market.

---

## Table of contents

- [Why this exists](#why-this-exists)
- [Architecture](#architecture)
- [The agent workflow](#the-agent-workflow)
- [Tools (MCP-compatible)](#tools-mcp-compatible)
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
| Tools | MCP-compatible Zod/JSON-Schema contracts | Strictly typed, audited, deterministic execution |
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

## Tools (MCP-compatible)

Tools are discovered by name with strict input/output JSON Schemas and executed over a
stateless HTTP layer. Discovery: `GET /api/tools`. Execution: `POST /api/tool/{name}`.

`list_datasets` · `load_dataset` · `profile_dataset` · `create_features` ·
`walk_forward_split` · `train_model` · `evaluate_model` · `backtest` · `drift_check` ·
`record_experiment` · `inspect_repo` · `propose_patch` · `run_tests`

Each tool declares a permission class (`read-data`, `experiment`, `backtest`, `monitoring`,
`coding-readonly`, `coding-restricted`) and is deterministic given its input and seed.

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
| `/api/tools` | GET | MCP-compatible tool discovery + JSON Schemas |
| `/api/tool/{name}` | POST | Execute one bounded, deterministic tool |
| `/api/experiments` | GET/POST | List / register experiment records |
| `/api/experiments/{id}` | GET | Experiment record, trace and audit |
| `/api/monitoring` | GET | Drift, latency, performance history |
| `/api/research` | POST | Run a full deterministic research session server-side |

## Project layout

```
src/
  app/                 # Next.js routes (pages + API route handlers)
  components/          # UI: primitives, layout, charts, experiment views
  core/                # framework-agnostic domain (runs in Node AND the browser)
    data/              # bundled synthetic datasets, profiling, leakage scan
    ml/                # seeded RNG, features, splits, models, metrics, pipeline
    backtest/          # cost-aware backtest engine
    tools/             # tool registry + MCP-compatible catalog
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
- Backtests assume fills at the modelled close and a linear turnover-cost model; they omit
  market impact, borrow, and liquidity constraints.
- Data is synthetic. Any "edge" shown is a property of the generator, stated conditionally.

## Cost

**$0 for the required demo.** No paid model APIs, no market-data subscriptions, no vector
database, no long-running servers. Vercel's free tier hosts the app; browser-local
inference runs on the visitor's device; the deterministic path needs nothing at all.
