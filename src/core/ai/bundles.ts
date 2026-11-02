/**
 * Jito bundle-auction simulator.
 *
 * Generates labelled bundles — features a searcher knows at submission time and
 * whether the bundle landed — from an explicit, documented mechanism:
 *
 *   bid edge   = tip multiple − 0.9·log(1+competing bundles) − 1.4·congestion
 *   log-odds   = 1.6 + 3·tanh(0.75·bid edge)              (auction, saturating)
 *              − 2.8·drift²·(size/2)                       (atomic revert risk)
 *              − 0.22·slots to next Jito leader            (time to be outbid)
 *              − 0.12·(CU − 2)·congestion                  (block packing)
 *              + 0.35·cos(2π(hour − 3)/24)                 (daily cycle)
 *
 * Because the true mechanism is known, the platform can check not only how
 * accurate a model is, but whether its *explanations* are faithful — something
 * impossible on real data alone. On mainnet the same pipeline would train on
 * the block engine's landed/dropped outcomes.
 */

import { Rng } from "@/core/ml/rng";
import { sigmoid } from "@/core/ml/stats";

export interface FeatureSpec {
  key: string;
  label: string;
  short: string;
  min: number;
  max: number;
  step: number;
  description: string;
}

export const FEATURES: FeatureSpec[] = [
  { key: "tipMultiple", label: "Tip vs. landed p50 (log₂)", short: "Tip", min: -3, max: 6, step: 0.1, description: "Tip relative to the median landed tip; 1 = 2×, 3 = 8×." },
  { key: "congestion", label: "Network congestion", short: "Congestion", min: 0, max: 1, step: 0.01, description: "Block-space demand, 0 (idle) to 1 (saturated)." },
  { key: "contention", label: "Competing bundles", short: "Competition", min: 0, max: 40, step: 1, description: "Other bundles write-locking the same hot accounts." },
  { key: "computeUnits", label: "Compute units (×100k)", short: "Compute", min: 0.5, max: 14, step: 0.5, description: "CU requested by the bundle's transactions." },
  { key: "bundleSize", label: "Transactions in bundle", short: "Size", min: 1, max: 5, step: 1, description: "Bundles are atomic: every transaction must succeed." },
  { key: "slotsToLeader", label: "Slots to next Jito leader", short: "Slots to leader", min: 0, max: 12, step: 1, description: "Wait until a Jito-Solana validator produces a block." },
  { key: "hourUtc", label: "Hour of day (UTC)", short: "Hour", min: 0, max: 23, step: 1, description: "Captures daily activity cycles across regions." },
  { key: "stateDrift", label: "State drift since build", short: "State drift", min: 0, max: 1, step: 0.01, description: "How far target accounts moved since simulation; high drift ⇒ revert risk." },
];

export const N_FEATURES = FEATURES.length;
export const TIP_FEATURE = 0;

/** The ground-truth landing log-odds. */
export function trueLogit(x: readonly number[]): number {
  const [tip, cong, cont, cu, size, slots, hour, drift] = x;
  const bidEdge = tip - 0.9 * Math.log1p(cont) - 1.4 * cong;
  return (
    1.6 +
    3.0 * Math.tanh(0.75 * bidEdge) -
    2.8 * drift * drift * (size / 2) -
    0.22 * slots -
    0.12 * (cu - 2) * cong +
    0.35 * Math.cos((2 * Math.PI * (hour - 3)) / 24)
  );
}

export interface BundleDataset {
  X: number[][];
  y: number[];
}

const SIZES = [1, 1, 2, 2, 3, 3, 4, 5];

export function sampleBundle(rng: Rng): number[] {
  const congestion = Math.min(1, Math.pow(rng.next(), 0.8));
  const tip = Math.max(-3, Math.min(6, rng.normal(2.0, 1.6)));
  const contention = Math.min(40, Math.floor(Math.exp(rng.normal(0.9 + 0.8 * congestion, 0.8))));
  const cu = Math.round((0.5 + rng.next() * 13.5) * 2) / 2;
  const size = SIZES[Math.floor(rng.next() * SIZES.length)];
  let slots = 0;
  while (slots < 12 && rng.next() < 0.55) slots++;
  const hour = Math.floor(rng.next() * 24);
  const drift = Math.pow(rng.next(), 2.5);
  return [round3(tip), round3(congestion), contention, cu, size, slots, hour, round3(drift)];
}

export function generateBundles(n: number, seed: number): BundleDataset {
  const rng = new Rng(seed);
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = sampleBundle(rng);
    X.push(x);
    y.push(rng.next() < sigmoid(trueLogit(x)) ? 1 : 0);
  }
  return { X, y };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** A typical bundle — the default for unspecified features. */
export const DEFAULT_BUNDLE: number[] = [2, 0.55, 3, 7, 2, 1, 12, 0.2];

/** Named scenarios for the what-if explorer. */
export const SCENARIOS: Array<{ id: string; label: string; x: number[] }> = [
  { id: "arb", label: "DEX arb in a hot pool", x: [1.5, 0.7, 12, 3, 2, 1, 14, 0.15] },
  { id: "liquidation", label: "Liquidation during a congestion spike", x: [3.0, 0.95, 25, 6, 3, 2, 15, 0.35] },
  { id: "backrun", label: "Quiet-hours backrun", x: [0.5, 0.2, 1, 2, 1, 0, 4, 0.05] },
  { id: "stale", label: "Big bundle built on stale state", x: [2.5, 0.5, 4, 10, 5, 3, 20, 0.8] },
];
