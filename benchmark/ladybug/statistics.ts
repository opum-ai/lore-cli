/** Deterministic robust statistics for the Ladybug benchmark report. */

export interface DistributionSummary {
  readonly count: number;
  readonly median: number;
  readonly p95: number;
  readonly mad: number;
  readonly max: number;
}

export interface BootstrapSummary extends DistributionSummary {
  readonly upperOneSided95: number;
}

export interface CalibrationSummary {
  readonly count: number;
  readonly mean: number;
  readonly standardDeviation: number;
  readonly coefficientOfVariation: number;
}

export function summarizeDistribution(values: readonly number[]): DistributionSummary {
  const sorted = finiteValues(values);
  return {
    count: sorted.length,
    median: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    mad: medianAbsoluteDeviation(sorted),
    max: sorted[sorted.length - 1] as number,
  };
}

export function summarizePairedRatios(
  numerators: readonly number[],
  denominators: readonly number[],
  options: { readonly seed: number; readonly iterations: number },
): BootstrapSummary {
  if (numerators.length !== denominators.length || numerators.length === 0) {
    throw new Error("paired benchmark samples must contain equally sized non-empty arrays");
  }
  const ratios = numerators.map((numerator, index) => {
    const denominator = denominators[index] as number;
    if (!Number.isFinite(numerator) || numerator < 0 || !Number.isFinite(denominator) || denominator <= 0) {
      throw new Error("paired benchmark ratios require finite non-negative numerators and positive denominators");
    }
    return numerator / denominator;
  });
  const summary = summarizeDistribution(ratios);
  return {
    ...summary,
    upperOneSided95: bootstrapMedianUpperBound(ratios, options.seed, options.iterations),
  };
}

export function summarizeCalibration(values: readonly number[]): CalibrationSummary {
  const samples = finiteValues(values);
  const mean = samples.reduce((total, value) => total + value, 0) / samples.length;
  const variance =
    samples.length === 1 ? 0 : samples.reduce((total, value) => total + (value - mean) ** 2, 0) / (samples.length - 1);
  const standardDeviation = Math.sqrt(variance);
  return {
    count: samples.length,
    mean,
    standardDeviation,
    coefficientOfVariation: mean === 0 ? 0 : standardDeviation / mean,
  };
}

/** R-7 linear-interpolation quantile over an already sorted non-empty array. */
export function quantile(sorted: readonly number[], probability: number): number {
  if (sorted.length === 0) throw new Error("cannot calculate a quantile of an empty sample");
  if (probability < 0 || probability > 1) throw new Error("quantile probability must be between zero and one");
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sorted[lower] as number;
  const upperValue = sorted[upper] as number;
  return lowerValue + (upperValue - lowerValue) * (position - lower);
}

function medianAbsoluteDeviation(sorted: readonly number[]): number {
  const center = quantile(sorted, 0.5);
  const deviations = sorted.map((value) => Math.abs(value - center)).sort((a, b) => a - b);
  return quantile(deviations, 0.5);
}

function bootstrapMedianUpperBound(values: readonly number[], seed: number, iterations: number): number {
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error("bootstrap iterations must be a positive integer");
  }
  const random = xorshift32(seed);
  const medians: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    const sample = Array.from({ length: values.length }, () => values[Math.floor(random() * values.length)] as number);
    sample.sort((a, b) => a - b);
    medians.push(quantile(sample, 0.5));
  }
  medians.sort((a, b) => a - b);
  return quantile(medians, 0.95);
}

function finiteValues(values: readonly number[]): number[] {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("benchmark statistics require a non-empty finite sample");
  }
  return [...values].sort((a, b) => a - b);
}

function xorshift32(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e37_79b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}
