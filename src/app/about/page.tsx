import type { Metadata } from "next";
import { PageHeader, PageBody, Section } from "@/components/layout/PageHeader";
import { KeyValue } from "@/components/ui/primitives";
import { listDatasets } from "@/core/data/dataset";
import { versionManifest } from "@/core/version";
import { dateShort } from "@/lib/format";

export const metadata: Metadata = {
  title: "About",
  description: "Architecture, limitations, data provenance and safety posture of the Meridian platform.",
};

export default function AboutPage() {
  const datasets = listDatasets(true);
  const versions = versionManifest();

  return (
    <>
      <PageHeader
        index="07"
        title="Architecture, provenance & safety"
        lede="How Meridian is built, what it deliberately does not do, and where its data comes from."
      />
      <PageBody>
        <Section eyebrow="Design principles" title="Tools decide the numbers; models only reason">
          <div className="max-w-3xl space-y-4 text-muted prose-serif">
            <p>
              Meridian separates <em>reasoning</em> from <em>computation</em>. A reasoning layer —
              a browser-local language model where WebGPU is available, or a transparent deterministic
              policy otherwise — interprets the research question into a structured, schema-validated
              plan and narrates the agents&rsquo; intent. It never produces a metric, a return, or a
              p-value. Those come exclusively from deterministic tools that are validated on the way
              in and on the way out, and logged in an audit trail.
            </p>
            <p>
              This boundary is what lets the same platform run with or without a model and still
              satisfy every guarantee: reproducibility, leakage-safety, and full traceability from
              report back to the tool call that produced each figure.
            </p>
          </div>
        </Section>

        <Section eyebrow="Data provenance" title="Bundled, synthetic, versioned">
          <p className="mb-4 max-w-3xl text-muted">
            The platform ships synthetic hourly market series generated deterministically from fixed
            seeds. They embed a mild, genuine momentum autocorrelation, volatility clustering and
            regime shifts, so a signal has modest but non-trivial value — the demo is not rigged to
            win. Each dataset carries a stable content hash.
          </p>
          <div className="overflow-x-auto border border-line">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-ink">
                  {["Dataset", "Symbol", "Rows", "Span", "Content hash", "Role"].map((h) => (
                    <th key={h} className="px-4 py-3 font-normal uppercase tracking-[0.12em] text-faint">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {datasets.map((d) => (
                  <tr key={d.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3">{d.name}</td>
                    <td className="px-4 py-3 text-muted">{d.symbol}</td>
                    <td className="px-4 py-3 tnum text-muted">{d.rows}</td>
                    <td className="px-4 py-3 tnum text-muted">{dateShort(d.start)} → {dateShort(d.end)}</td>
                    <td className="px-4 py-3 tnum text-muted">{d.contentHash.slice(0, 12)}</td>
                    <td className="px-4 py-3 text-muted">{d.leakageFixture ? "Leakage fixture" : "Research"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section eyebrow="Safety posture" title="What the public demo will not do">
          <ul className="max-w-3xl list-inside space-y-3 text-muted">
            <li>— No real-market data, brokerage, or order routing. Nothing here is investment advice.</li>
            <li>— The coding agent operates on an in-memory whitelisted sandbox with no shell, no network, and no write path to disk. Destructive constructs are rejected before a patch is accepted.</li>
            <li>— Tool inputs are schema-validated; unknown parameters and unsupported model types are rejected. Row, model, fold and epoch counts are bounded for public requests.</li>
            <li>— No private user data is sent to any third-party model endpoint in the default configuration; browser-local inference stays on-device.</li>
          </ul>
        </Section>

        <Section eyebrow="Limitations" title="Honest boundaries">
          <ul className="max-w-3xl list-inside space-y-3 text-muted">
            <li>— Models are compact pure-TypeScript learners (logistic regression, gradient-boosted stumps) chosen to run identically in a serverless route and a browser worker. They are not tuned production alpha models.</li>
            <li>— The serverless experiment store is ephemeral per warm instance by design; durable history lives in the browser. An MLflow-portable export/import is provided for local development.</li>
            <li>— Backtests assume fills at the modelled close and a linear turnover-cost model; they omit market impact, borrow, and liquidity constraints.</li>
          </ul>
        </Section>

        <Section eyebrow="Build provenance" title="Versions">
          <div className="max-w-lg">
            <KeyValue k="Platform" v={<code>{versions.platform}</code>} />
            <KeyValue k="Tool runtime" v={<code>{versions.toolRuntime}</code>} />
            <KeyValue k="Experiment schema" v={<code>{versions.experimentSchema}</code>} />
            <KeyValue k="Numerical kernel" v={<code>{versions.kernel}</code>} />
            <KeyValue k="Git commit" v={<code>{versions.gitCommit}</code>} />
          </div>
        </Section>
      </PageBody>
    </>
  );
}
