"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import { Badge, Button, Card, CardBody, CardHeader, Eyebrow } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/Tabs";
import { LiveAuction } from "@/components/intel/LiveAuction";
import { EpochMevBars, LorenzChart, ScenarioFan, ValidatorFrontier, ValueFlowSankey } from "@/components/intel/IntelCharts";
import { simulateScenario, type Concentration, type EpochMev, type FrontierPoint, type ValueFlow } from "@/core/solana/intel";
import { cn } from "@/lib/cn";

interface IntelPayload {
  generatedAt: number;
  epochs: { data: EpochMev[]; source: "live" | "snapshot"; currentEpoch: number; completedEpoch: number };
  validators: { epoch: number; source: "live" | "snapshot"; count: number; bamCount: number; directedTargets: number };
  concentration: Concentration;
  frontier: FrontierPoint[];
  flow: ValueFlow;
  pool: { apy: number; tvlSol: number; source: "live" | "snapshot"; mevApr: number; stakingApr: number };
  stakerMevPerEpoch: number[];
  epochClock: { daysPerEpoch: number; epochsPerYear: number; source: "live" | "snapshot" };
}

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const sol = (v: number) => `${Math.round(v).toLocaleString("en-US")} SOL`;

export default function IntelPage() {
  const [data, setData] = useState<IntelPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/intel")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: IntelPayload) => setData(j))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const loading = <Card><CardBody>{error ? `Could not load network data: ${error}` : "Loading validator and epoch data from Jito…"}</CardBody></Card>;

  return (
    <>
      <PageHeader
        eyebrow="Solana · Jito"
        accent="var(--color-mod-jito)"
        title="Market intelligence"
        lede="How efficiently is blockspace being auctioned, where does MEV value go, and how healthy is the validator set? Computed live from Jito's public mainnet APIs."
      />
      <PageBody>
        <Tabs
          tabs={[
            { id: "live", label: "Live auction", content: <LiveAuction /> },
            { id: "flow", label: "MEV value flow", content: data ? <FlowTab d={data} /> : loading },
            { id: "validators", label: "Validators & decentralisation", content: data ? <ValidatorsTab d={data} /> : loading },
            { id: "scenarios", label: "JitoSOL scenarios", content: data ? <ScenarioTab d={data} /> : loading },
            { id: "roadmap", label: "With Jito data", content: <RoadmapTab /> },
          ]}
        />
      </PageBody>
    </>
  );
}

function SourceNote({ source, what }: { source: "live" | "snapshot"; what: string }) {
  return (
    <Badge variant={source === "live" ? "success" : "neutral"}>
      {source === "live" ? `Live · ${what}` : `Saved copy · ${what}`}
    </Badge>
  );
}

function Tiles({ items }: { items: Array<{ k: string; v: string; sub?: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
      {items.map((t) => (
        <div key={t.k} className="bg-paper px-5 py-4">
          <Eyebrow>{t.k}</Eyebrow>
          <div className="tnum mt-1 text-[1.45rem] font-semibold text-heading">{t.v}</div>
          {t.sub ? <div className="mt-1 text-[0.82rem] text-faint">{t.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- flow */

function FlowTab({ d }: { d: IntelPayload }) {
  const f = d.flow;
  const done = d.epochs.data.filter((e) => e.epoch < d.epochs.currentEpoch);
  const first = done[0];
  const last = done[done.length - 1];
  const change = first && last ? last.totalMevSol / first.totalMevSol - 1 : 0;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <SourceNote source={d.validators.source} what={`epoch ${d.validators.epoch} validator data`} />
        <SourceNote source={d.epochs.source} what={`${d.epochs.data.length} epochs of network MEV`} />
      </div>
      <Tiles
        items={[
          { k: "MEV tips, last full epoch", v: sol(f.totalMevSol), sub: `Epoch ${f.epoch}` },
          { k: "Kept by validators", v: pct(f.validatorCommissionSol / Math.max(f.totalMevSol, 1e-9)), sub: sol(f.validatorCommissionSol) },
          { k: "Reached stakers", v: pct(f.stakersSol / Math.max(f.totalMevSol, 1e-9)), sub: sol(f.stakersSol) },
          { k: `Change over ${done.length} epochs`, v: `${change >= 0 ? "+" : ""}${pct(change, 0)}`, sub: first ? `Epoch ${first.epoch} to ${last.epoch}` : undefined },
        ]}
      />
      <Card>
        <CardHeader title="Where the MEV went" eyebrow="From searchers' tips to validators and stakers" />
        <CardBody>
          <ValueFlowSankey flow={f} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="MEV by epoch" eyebrow="Total tips across Jito-Solana validators" />
        <CardBody>
          <EpochMevBars epochs={d.epochs.data} current={d.epochs.currentEpoch} daysPerEpoch={d.epochClock.daysPerEpoch} />
        </CardBody>
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------- validators */

function ValidatorsTab({ d }: { d: IntelPayload }) {
  const c = d.concentration;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <SourceNote source={d.validators.source} what={`${d.validators.count} validators, epoch ${d.validators.epoch}`} />
      </div>
      <Tiles
        items={[
          { k: "Nakamoto coefficient", v: String(c.nakamoto), sub: "Validators needed to hold over one third of stake" },
          { k: "Top 10 validators", v: pct(c.top.find((t) => t.n === 10)?.share ?? 0), sub: "Share of all Jito stake" },
          { k: "Running BAM", v: pct(d.flow.bamStakeShare, 0), sub: `${d.validators.bamCount} of ${d.validators.count} validators, by stake` },
          { k: "StakeNet directed stake", v: sol(d.flow.directedStakeSol), sub: `${d.validators.directedTargets} target validators` },
        ]}
      />
      <Card>
        <CardHeader title="Validator performance frontier" eyebrow="MEV earned per SOL staked vs commission kept" />
        <CardBody>
          <ValidatorFrontier points={d.frontier} />
        </CardBody>
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="How concentrated is stake?" eyebrow="Lorenz curve of active stake" />
          <CardBody>
            <LorenzChart points={c.lorenz} gini={c.gini} />
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Concentration measures" eyebrow="Higher numbers mean more concentration" />
          <CardBody className="space-y-4">
            {c.top.map((t) => (
              <div key={t.n}>
                <div className="flex justify-between text-[0.92rem]">
                  <span>Largest {t.n} validators</span>
                  <span className="tnum font-semibold">{pct(t.share)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-divider">
                  <div className="h-full rounded-full bg-chart-primary" style={{ width: `${t.share * 100}%` }} />
                </div>
              </div>
            ))}
            <div className="border-t border-divider pt-3 text-[0.92rem]">
              <div className="flex justify-between"><span>Herfindahl-Hirschman index</span><span className="tnum font-semibold">{Math.round(c.hhi)}</span></div>
              <p className="mt-1 text-[0.82rem] text-faint">Below 1,500 is usually read as unconcentrated, above 2,500 as highly concentrated.</p>
              <div className="mt-3 flex justify-between"><span>Gini coefficient</span><span className="tnum font-semibold">{c.gini.toFixed(2)}</span></div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ scenarios */

const PRESETS: Array<{ id: string; label: string; mev: number; staking: number }> = [
  { id: "base", label: "Base case", mev: 0, staking: 0 },
  { id: "down", label: "Activity falls 40%", mev: -0.4, staking: 0 },
  { id: "mania", label: "Trading frenzy, MEV ×2.5", mev: 1.5, staking: 0 },
  { id: "cut", label: "Staking yield cut 20%", mev: 0, staking: -0.2 },
];

function ScenarioTab({ d }: { d: IntelPayload }) {
  const [amount, setAmount] = useState(1000);
  const [days, setDays] = useState(365);
  const [mevShock, setMevShock] = useState(0);
  const [stakingShock, setStakingShock] = useState(0);
  const result = useMemo(
    () =>
      simulateScenario({
        amountSol: amount,
        days,
        mevShock,
        stakingShock,
        stakingApr: d.pool.stakingApr,
        mevPerEpoch: d.stakerMevPerEpoch,
        daysPerEpoch: d.epochClock.daysPerEpoch,
        paths: 500,
      }),
    [amount, days, mevShock, stakingShock, d],
  );
  const end = result.fan[result.fan.length - 1];
  const fromMev = end.p50 - end.noMev;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Scenario" eyebrow="A hypothetical JitoSOL position" />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const on = p.mev === mevShock && p.staking === stakingShock;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setMevShock(p.mev);
                      setStakingShock(p.staking);
                    }}
                    className={cn("rounded-md border px-3 py-1 text-[0.85rem]", on ? "border-accent bg-accent text-on-accent" : "border-line-strong hover:bg-subtle")}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <label className="block">
              <Eyebrow>Amount (SOL)</Eyebrow>
              <input type="number" min={1} value={amount} onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))} className="mt-1 w-full rounded-md border border-line-strong bg-paper px-3 py-[6px] tnum" />
            </label>
            <Range label="Holding period" value={`${days} days`} min={30} max={1095} step={15} v={days} on={setDays} />
            <Range label="Change in MEV activity" value={`${mevShock >= 0 ? "+" : ""}${Math.round(mevShock * 100)}%`} min={-100} max={300} step={10} v={Math.round(mevShock * 100)} on={(v) => setMevShock(v / 100)} />
            <Range label="Change in staking yield" value={`${stakingShock >= 0 ? "+" : ""}${Math.round(stakingShock * 100)}%`} min={-50} max={30} step={5} v={Math.round(stakingShock * 100)} on={(v) => setStakingShock(v / 100)} />
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Range of outcomes" eyebrow={`${result.fan.length - 1} epochs, 500 simulated paths`} />
          <CardBody>
            <ScenarioFan result={result} amount={amount} />
          </CardBody>
        </Card>
      </div>
      <Tiles
        items={[
          { k: "Middle outcome", v: `${end.p50.toFixed(2)} SOL`, sub: `+${(end.p50 - amount).toFixed(2)} SOL` },
          { k: "Nine in ten land between", v: `${end.p5.toFixed(1)}–${end.p95.toFixed(1)}`, sub: "SOL at the end" },
          { k: "Added by MEV", v: `${fromMev.toFixed(3)} SOL`, sub: "Middle outcome vs staking only" },
          { k: "Staking yield used", v: pct(d.pool.stakingApr * (1 + stakingShock), 2), sub: `MEV resampled from ${d.stakerMevPerEpoch.length} real epochs` },
        ]}
      />
      <p className="text-[0.85rem] text-faint">
        Hypothetical scenario: MEV per epoch is resampled from the last {d.stakerMevPerEpoch.length} completed epochs after average
        validator commission, scaled by the activity change. It excludes SOL price moves and is not a forecast.
      </p>
    </div>
  );
}

function Range({ label, value, min, max, step, v, on }: { label: string; value: string; min: number; max: number; step: number; v: number; on: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Eyebrow>{label}</Eyebrow>
        <span className="tnum text-[0.95rem]">{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => on(Number(e.target.value))} className="mt-1 w-full" aria-label={label} />
    </div>
  );
}

/* --------------------------------------------------------------- roadmap */

const ROADMAP: Array<{ title: string; answers: string; needs: string; builds: string }> = [
  {
    title: "Bundle execution funnel",
    answers: "Where bundles are lost between submission and landing: invalid, failed simulation, outbid, expired.",
    needs: "Block Engine stage events per bundle.",
    builds: "Trains the Explainable AI landing model on real drops instead of the simulator.",
  },
  {
    title: "Latency waterfall by region",
    answers: "Which stage of the transaction lifecycle, and which Block Engine region, adds the most delay.",
    needs: "Per-stage timestamps from each Block Engine region.",
    builds: "A percentile view of delay by stage and region, in the style of the tip floor.",
  },
  {
    title: "Blockspace utilisation heatmap",
    answers: "Which programs consume blockspace, when congestion builds, and how scheduling shapes block value.",
    needs: "Indexed slots with compute requested and consumed by program, plus BAM scheduling data.",
    builds: "Feeds the tip advisor's congestion regime with a direct measure.",
  },
  {
    title: "TipRouter distribution lifecycle",
    answers: "How each epoch's tips move from collection to snapshot, operator votes, finalised root and claims, and where it stalls.",
    needs: "TipRouter NCN program accounts indexed per epoch.",
    builds: "Extends the MEV value-flow Sankey to the distribution layer.",
  },
  {
    title: "NCN operator reliability",
    answers: "Which operators participate on time, and where operators are shared across vaults and NCNs.",
    needs: "Operator vote submissions, latencies and stake weights.",
    builds: "Uses the same frontier and concentration measures as Validators.",
  },
  {
    title: "JitoSOL liquidity and redemption basis",
    answers: "How much capital can enter or exit without moving the market, and the cost of selling vs unstaking.",
    needs: "DEX pool depth for JitoSOL/SOL and the stake-pool exchange-rate history.",
    builds: "Adds exit-cost scenarios to the JitoSOL simulator.",
  },
  {
    title: "Protocol revenue and JTO treasury",
    answers: "How JitoSOL fees, tip fees and BAM coordination turn into protocol and DAO revenue over time.",
    needs: "Fee and treasury account flows, kept separate from gross activity and staker rewards.",
    builds: "Revenue waterfall and activity-vs-value correlation views.",
  },
  {
    title: "On-chain anomaly detection",
    answers: "Unusual tip patterns, validator performance changes or liquidity withdrawals, each with the evidence behind the alert.",
    needs: "Historical series for the metrics above.",
    builds: "Generalises the live auction alerts, which already flag moves outside the forecast band.",
  },
];

function RoadmapTab() {
  return (
    <div>
      <p className="mb-5 max-w-3xl text-[1rem] text-muted">
        Everything on the other tabs runs on Jito&rsquo;s public APIs. These views answer the next set of questions and need data that
        lives inside Jito&rsquo;s infrastructure or in dedicated indexers. Each one reuses a model or chart that already works here.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {ROADMAP.map((r) => (
          <div key={r.title} className="rounded-lg border border-line bg-paper p-5">
            <h3 className="text-[1.08rem] font-semibold">{r.title}</h3>
            <p className="mt-2 text-[0.95rem] text-ink">{r.answers}</p>
            <dl className="mt-3 space-y-1 text-[0.88rem]">
              <div><dt className="inline font-semibold text-faint">Needs: </dt><dd className="inline text-muted">{r.needs}</dd></div>
              <div><dt className="inline font-semibold text-faint">Builds on: </dt><dd className="inline text-muted">{r.builds}</dd></div>
            </dl>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <Button variant="secondary" onClick={() => (window.location.hash = "live")}>Back to the live auction</Button>
      </div>
    </div>
  );
}
