import type { Metadata } from "next";
import { PageHeader, PageBody, Section } from "@/components/layout/PageHeader";
import { Prose } from "@/components/layout/Prose";
import { Badge } from "@/components/ui/primitives";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Security",
  description: "Meridian's security boundaries, threat model and known gaps.",
};

const THREATS: Array<[string, string, string]> = [
  ["Malformed or oversized tool input", "Strict Zod schemas reject unknown fields; row, fold, model and epoch counts are capped.", "In place"],
  ["Model-invented numbers", "The language model never computes results; every figure comes from an audited tool call.", "In place"],
  ["Prompt injection via copilot", "Copilot and MCP tools are read-only: none can move funds, sign, submit bundles or write data.", "In place"],
  ["Secret leakage", "The Anthropic API key is read only on the server and never sent to the browser.", "In place"],
  ["Coding agent abuse", "In-memory whitelisted repository; no shell, network or disk writes; destructive patterns rejected.", "In place"],
  ["Third-party data outage", "Jito API calls are time-limited and cached; failures fall back to labelled bundled snapshots.", "In place"],
  ["Request flooding / cost abuse", "Per-instance rate limits on the copilot and MCP endpoints.", "Partial: best effort on serverless"],
  ["Unauthenticated access", "Public demo with no accounts, so there is no user data to protect yet.", "Gap: auth and RBAC needed before multi-user use"],
  ["Audit-log tampering", "The audit trail lives in memory per run and is exported with results.", "Gap: needs persistent append-only storage"],
];

export default function SecurityPage() {
  return (
    <>
      <PageHeader eyebrow="Resources" accent="var(--color-mod-resources)" title="Security" lede="What Meridian protects, how, and where the current research preview still falls short." />
      <PageBody>
        <Section eyebrow="Threat model" title="Threats and controls">
          <div className="overflow-x-auto rounded-lg border border-line bg-paper">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line-strong">
                  {["Threat", "Control", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3 text-[0.68rem] font-medium uppercase tracking-[0.08em] text-faint">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {THREATS.map(([t, c, s]) => (
                  <tr key={t} className="border-b border-line align-top last:border-b-0">
                    <td className="px-4 py-3 font-medium">{t}</td>
                    <td className="px-4 py-3 text-muted">{c}</td>
                    <td className="px-4 py-3">
                      <Badge variant={s.startsWith("In place") ? "success" : s.startsWith("Gap") ? "danger" : "warning"}>{s.split(": ")[0]}</Badge>
                      {s.includes(": ") ? <div className="mt-1 text-[0.75rem] text-faint">{s.split(": ").slice(1).join(": ")}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        <Prose>
          <h2>Network access</h2>
          <p>
            The server makes read-only requests to Jito&rsquo;s public mainnet APIs and, when configured, to the Anthropic API for the
            copilot. Nothing in Meridian holds wallet keys or can submit transactions.
          </p>
          <h2>Not yet done</h2>
          <p>
            This is a research preview. It has not had a penetration test, a formal threat-modelling review or an accessibility audit. Do not
            use it with confidential data until authentication, persistent audit logs and edge rate limiting are in place.
          </p>
          <h2>Reporting a vulnerability</h2>
          <p>
            Please open a private security advisory or an issue at <a href={SITE.issuesUrl}>{SITE.issuesUrl.replace("https://", "")}</a>.
          </p>
        </Prose>
      </PageBody>
    </>
  );
}
