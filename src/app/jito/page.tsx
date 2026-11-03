"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader, PageBody, Section } from "@/components/layout/PageHeader";
import { Badge, Button, Card, CardBody, CardHeader, Eyebrow, KeyValue } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/Tabs";
import { TipHistoryChart, YieldPathChart } from "@/components/charts/JitoCharts";
import { getTipAdvisor, LAMPORTS_PER_SOL, TIP_LEVELS, type TipFloorSnapshot, type TipLevel } from "@/core/solana/tips";
import { BUNDLED_STAKE_POOL, mevApyEstimate, projectJitoSolYield, type StakePoolStats } from "@/core/solana/staking";
import { cn } from "@/lib/cn";

interface Sourced<T> {
  data: T;
  source: "live" | "snapshot";
  fetchedAt: number;
}

interface JitoSnapshot {
  tipFloor: Sourced<TipFloorSnapshot>;
  stakePool: Sourced<StakePoolStats>;
}

const lamports = (sol: number) => Math.round(sol * LAMPORTS_PER_SOL);
const fmtSol = (sol: number) => (sol >= 0.01 ? sol.toFixed(4) : sol.toPrecision(3));
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;

export default function JitoLabPage() {
  const [snap, setSnap] = useState<JitoSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    () =>
      fetch("/api/jito")
        .then((r) => r.json())
        .then((j: JitoSnapshot) => setSnap(j))
        .catch(() => setSnap(null))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const refresh = () => {
    setLoading(true);
    load();
  };

  const advisor = useMemo(() => getTipAdvisor(), []);
  const live = snap?.tipFloor.source === "live" ? snap.tipFloor.data : null;
  const pool = snap?.stakePool.data ?? BUNDLED_STAKE_POOL;

  return (
    <>
      <PageHeader
        eyebrow="Solana · Jito" accent="var(--color-mod-jito)"
        title="Jito Lab"
        lede="Live data from Jito's block engine and stake pool, used to answer two questions: what to tip a bundle, and what JitoSOL earns."
        actions={
          <>
            <Badge variant={snap?.tipFloor.source === "live" ? "solid" : "muted"}>
              {loading ? "Connecting…" : snap?.tipFloor.source === "live" ? "● Live mainnet" : "Bundled snapshot"}
            </Badge>
            <Button variant="secondary" onClick={refresh} disabled={loading}>Refresh</Button>
          </>
        }
      />
      <PageBody>
        <Tabs
          tabs={[
            { id: "advisor", label: "Tip advisor", content: <AdvisorTab advisor={advisor} live={live} /> },
            { id: "pulse", label: "Network pulse", content: <PulseTab advisor={advisor} snap={snap} /> },
            { id: "yield", label: "JitoSOL yield", content: <YieldTab pool={pool} /> },
          ]}
        />
      </PageBody>
    </>
  );
}

/* ------------------------------------------------------------- advisor */

function AdvisorTab({ advisor, live }: { advisor: ReturnType<typeof getTipAdvisor>; live: TipFloorSnapshot | null }) {
  const [level, setLevel] = useState<TipLevel>(95);
  const [confidence, setConfidence] = useState(0.8);
  const [useLive, setUseLive] = useState(true);
  const rec = advisor.recommend(level, confidence, useLive ? live : null);
  const rows = advisor.backtest.rows.filter((r) => r.level === level);

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Your bundle" eyebrow="Inputs" />
          <CardBody className="space-y-5">
            <div>
              <Eyebrow>Outbid this share of landed bundles</Eyebrow>
              <div className="mt-2 flex border border-accent">
                {TIP_LEVELS.filter((l) => l !== 25).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLevel(l)}
                    className={cn("flex-1 px-3 py-[6px] text-sm", level === l ? "bg-accent text-on-accent" : "hover:bg-subtle")}
                  >
                    p{l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <Eyebrow>Confidence</Eyebrow>
                <span className="tnum text-sm">{pct(confidence, 0)}</span>
              </div>
              <input
                type="range"
                min={50}
                max={99}
                value={Math.round(confidence * 100)}
                onChange={(e) => setConfidence(Number(e.target.value) / 100)}
                className="mt-2 w-full"
                aria-label="Confidence"
              />
              <div className="flex justify-between text-[0.7rem] text-faint">
                <span>Economy</span>
                <span>Must land</span>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={useLive} onChange={(e) => setUseLive(e.target.checked)} className="" />
              Anchor on live tip floor {live ? "" : <span className="text-faint">(unavailable, using bundled history)</span>}
            </label>
          </CardBody>
        </Card>

        <Card className="lg:col-span-3 border-accent">
          <CardHeader
            title="Recommended tip"
            eyebrow={`p${level} · ${pct(confidence, 0)} confidence`}
            right={<Badge variant="outline">{rec.regime} regime</Badge>}
          />
          <CardBody>
            <div className="tnum text-5xl leading-none md:text-6xl">{rec.tipLamports.toLocaleString("en-US")}</div>
            <div className="mt-2 text-muted">lamports · {fmtSol(rec.tipSol)} SOL</div>
            <div className="mt-6 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <KeyValue k="Anchor (current p-level)" v={<span className="tnum">{lamports(rec.anchorSol).toLocaleString("en-US")}</span>} />
              <KeyValue k="Anchor source" v={rec.anchorSource === "live" ? "Live mainnet" : "Bundled history"} />
              <KeyValue k="Without regime conditioning" v={<span className="tnum">{lamports(rec.globalTipSol).toLocaleString("en-US")}</span>} />
              <KeyValue k="Calibration window" v={<span className="tnum">{rec.calibrationHours.toLocaleString("en-US")} h</span>} />
            </div>
            <p className="mt-5 text-sm text-muted">
              A tip of this size is forecast to outbid {level}% of bundles landing in the next hour, {pct(confidence, 0)} of
              the time. Want it explained, or in Japanese?{" "}
              <Link href="/copilot" className="underline underline-offset-2">Ask the copilot</Link>.
            </p>
          </CardBody>
        </Card>
      </div>

      <Section eyebrow="Does it work?" title={`Walk-forward validation · p${level}`}>
        <p className="mb-4 max-w-3xl text-sm text-muted">
          {advisor.backtest.folds}-fold expanding walk-forward over {advisor.backtest.hours.toLocaleString("en-US")} hours: calibrate on the
          past, forecast each next hour, count how often the tip cleared the realised p{level}. A calibrated method hits its
          target. The naive rule, tipping last hour&rsquo;s p{level}, is right about half the time. A single global quantile
          under-covers when the network is congested.
        </p>
        <div className="overflow-x-auto border border-line">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line-strong">
                {["Target", "Meridian (regime-aware)", "Global quantile", "Naive last-hour", "Congested · Meridian", "Congested · global", "Median overpay"].map((h) => (
                  <th key={h} className="px-4 py-3 font-normal uppercase tracking-[0.1em] text-[0.68rem] text-faint">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.confidence} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-3 tnum">{pct(r.confidence, 0)}</td>
                  <td className="px-4 py-3 tnum">{pct(r.coverage)}</td>
                  <td className="px-4 py-3 tnum text-muted">{pct(r.coverageGlobal)}</td>
                  <td className="px-4 py-3 tnum text-muted">{pct(r.coverageNaive)}</td>
                  <td className="px-4 py-3 tnum">{pct(r.coverageHot)}</td>
                  <td className="px-4 py-3 tnum text-muted">{pct(r.coverageHotGlobal)}</td>
                  <td className="px-4 py-3 tnum text-muted">×{r.medianOverpay.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[0.78rem] text-faint">
          Method: Mondrian split-conformal forecasting on log-tip residuals, conditioned on a congestion regime. Calibration history
          is synthetic (hash {advisor.backtest.historyHash}) and shaped on the live API&rsquo;s percentile spreads; recalibrate on a
          recorded mainnet feed before production use.
        </p>
      </Section>
    </>
  );
}

/* --------------------------------------------------------------- pulse */

function PulseTab({ advisor, snap }: { advisor: ReturnType<typeof getTipAdvisor>; snap: JitoSnapshot | null }) {
  const tf = snap?.tipFloor.data;
  const week = advisor.history.slice(-24 * 7);
  return (
    <>
      <Section eyebrow={snap?.tipFloor.source === "live" ? "Live · bundles.jito.wtf" : "Bundled snapshot"} title="Landed tip floor, right now">
        {tf ? (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-5">
            {TIP_LEVELS.map((l) => (
              <div key={l} className="bg-paper px-5 py-5">
                <Eyebrow>p{l}</Eyebrow>
                <div className="tnum mt-2 text-2xl leading-none">{lamports(tf[`p${l}`]).toLocaleString("en-US")}</div>
                <div className="mt-2 text-[0.78rem] text-muted">lamports · {fmtSol(tf[`p${l}`])} SOL</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Loading…</p>
        )}
        {tf ? (
          <p className="mt-3 text-[0.78rem] text-faint">
            As of {tf.time}. EMA of p50: {lamports(tf.emaP50).toLocaleString("en-US")} lamports. The p99/p50 ratio of
            ×{Math.round(tf.p99 / tf.p50).toLocaleString("en-US")} is why one fixed tip is either overpaid or outbid.
          </p>
        ) : null}
      </Section>
      <Section eyebrow="Calibration history" title="Seven days of landed-tip percentiles">
        <Card>
          <CardBody>
            <TipHistoryChart bars={week} />
            <div className="mt-3 flex flex-wrap gap-5 text-[0.75rem] text-muted">
<span className="inline-flex items-center gap-2"><span className="h-[3px] w-4 rounded" style={{ background: "var(--color-chart-primary)" }} />p95</span>
              <span className="inline-flex items-center gap-2"><span className="h-[3px] w-4 rounded" style={{ background: "var(--color-chart-tertiary)" }} />p75</span>
              <span className="inline-flex items-center gap-2"><span className="h-[3px] w-4 rounded" style={{ background: "var(--color-chart-benchmark)" }} />p50</span>
              <span className="text-faint">Log scale · lamports · synthetic history used to calibrate the advisor</span>
            </div>
          </CardBody>
        </Card>
      </Section>
    </>
  );
}

/* --------------------------------------------------------------- yield */

function YieldTab({ pool }: { pool: StakePoolStats }) {
  const [amount, setAmount] = useState(100);
  const [days, setDays] = useState(365);
  const proj = projectJitoSolYield(pool, amount, days);
  const mevApy = mevApyEstimate(pool);
  const maxMev = Math.max(...pool.mevRewardsSol.map((p) => p.value), 1);

  return (
    <>
      <div className="mb-10 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        {[
          { k: "JitoSOL APY", v: pct(pool.apy, 2) },
          { k: "MEV share (est.)", v: pct(mevApy, 2) },
          { k: "TVL", v: `${Math.round(pool.tvlSol).toLocaleString("en-US")} SOL` },
          { k: "Validators", v: pool.numValidators.toLocaleString("en-US") },
        ].map((s) => (
          <div key={s.k} className="bg-paper px-5 py-5">
            <Eyebrow>{s.k}</Eyebrow>
            <div className="tnum mt-2 text-2xl leading-none">{s.v}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Position" eyebrow="Inputs" />
          <CardBody className="space-y-5">
            <label className="block">
              <Eyebrow>Amount (SOL)</Eyebrow>
              <input
                type="number"
                min={0.1}
                step={10}
                value={amount}
                onChange={(e) => setAmount(Math.max(0.1, Number(e.target.value) || 0.1))}
                className="mt-1 w-full border border-line bg-paper px-3 py-[6px] text-sm tnum outline-none focus:border-accent"
              />
            </label>
            <div>
              <div className="flex items-baseline justify-between">
                <Eyebrow>Horizon</Eyebrow>
                <span className="tnum text-sm">{days} days</span>
              </div>
              <input
                type="range"
                min={30}
                max={1825}
                step={5}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="mt-2 w-full"
                aria-label="Horizon in days"
              />
            </div>
            <div className="border-t border-line pt-4">
              <KeyValue k="As JitoSOL" v={<span className="tnum">{proj.jitoSolEnd.toFixed(4)} SOL</span>} />
              <KeyValue k="Without MEV component" v={<span className="tnum">{proj.nativeStakeEnd.toFixed(4)} SOL</span>} />
              <KeyValue k="MEV uplift" v={<span className="tnum">+{proj.mevUpliftSol.toFixed(4)} SOL</span>} />
            </div>
          </CardBody>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader title="Projected position" eyebrow={pool.source === "live" ? "Live stake-pool stats" : "Bundled snapshot"} />
          <CardBody>
            <YieldPathChart path={proj.path} />
            <div className="mt-3 flex flex-wrap gap-5 text-[0.75rem] text-muted">
<span className="inline-flex items-center gap-2"><span className="h-[3px] w-4 rounded" style={{ background: "var(--color-chart-tertiary)" }} />JitoSOL</span>
              <span className="inline-flex items-center gap-2"><span className="h-[3px] w-4 rounded" style={{ background: "var(--color-chart-benchmark)" }} />same stake without MEV rewards</span>
            </div>
          </CardBody>
        </Card>
      </div>

      <Section eyebrow="Where the MEV share comes from" title="Daily MEV rewards to the pool">
        <div className="space-y-2">
          {pool.mevRewardsSol.map((p) => (
            <div key={p.date} className="flex items-center gap-4 text-sm">
              <span className="tnum w-24 text-muted">{p.date}</span>
              <div className="h-[10px] flex-1 bg-subtle">
                <div className="h-full rounded-sm bg-teal" style={{ width: `${(p.value / maxMev) * 100}%` }} />
              </div>
              <span className="tnum w-28 text-right">{Math.round(p.value).toLocaleString("en-US")} SOL</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[0.78rem] text-faint">
          MEV share = mean daily MEV rewards × 365 ÷ TVL. Projections compound reported APY; they are arithmetic, not a forecast
          or investment advice.
        </p>
      </Section>
    </>
  );
}
