/**
 * Seeded pseudo-random number generator.
 *
 * Determinism is a hard requirement of this platform: every experiment records
 * its seed, and re-running with that seed must reproduce the result exactly.
 * `Math.random()` is therefore banned from all numerical code — use a `Rng`.
 *
 * Implementation: mulberry32, a small, fast, well-distributed 32-bit generator
 * that produces identical sequences in Node and the browser.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Force to a 32-bit unsigned integer.
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  uniform(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.uniform(min, max + 1));
  }

  /** Standard normal sample via the Box–Muller transform. */
  normal(mean = 0, stdDev = 1): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + stdDev * z;
  }

  /** In-place Fisher–Yates shuffle; returns the same array for chaining. */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}
