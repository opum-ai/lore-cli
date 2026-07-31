import { z } from "zod";

export const LADYBUG_BENCHMARK_WORKER_REQUEST_SCHEMA = "lore.ladybug-benchmark-worker-request/1";
export const LADYBUG_BENCHMARK_WORKER_RESULT_SCHEMA = "lore.ladybug-benchmark-worker-result/1";

export const BenchmarkPolicySchema = z.enum(["indexed", "reference"]);

const ProjectionColdOperationSchema = z.strictObject({ kind: z.literal("projection-cold") });
const WarmOpenOperationSchema = z.strictObject({ kind: z.literal("warm-open") });
const GraphOperationSchema = z.strictObject({
  kind: z.literal("graph"),
  root: z.string().min(1).optional(),
  depth: z.number().int().nonnegative().optional(),
});
const QueryOperationSchema = z.strictObject({
  kind: z.literal("query"),
  text: z.string(),
  limit: z.number().int().positive(),
});
const ContextOperationSchema = z.strictObject({
  kind: z.literal("context"),
  root: z.string().min(1),
  depth: z.number().int().nonnegative(),
  maxTokens: z.number().int().positive(),
});

export const BenchmarkOperationSchema = z.discriminatedUnion("kind", [
  ProjectionColdOperationSchema,
  WarmOpenOperationSchema,
  GraphOperationSchema,
  QueryOperationSchema,
  ContextOperationSchema,
]);

export const LadybugBenchmarkWorkerRequestSchema = z.strictObject({
  schema: z.literal(LADYBUG_BENCHMARK_WORKER_REQUEST_SCHEMA),
  root: z.string().min(1),
  policy: BenchmarkPolicySchema,
  operation: BenchmarkOperationSchema,
});

export const LadybugBenchmarkWorkerResultSchema = z.strictObject({
  schema: z.literal(LADYBUG_BENCHMARK_WORKER_RESULT_SCHEMA),
  policy: BenchmarkPolicySchema,
  operation: BenchmarkOperationSchema,
  backend: BenchmarkPolicySchema,
  operationNanoseconds: z.number().int().nonnegative(),
  resultDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  emittedBytes: z.number().int().nonnegative(),
  diagnosticBytes: z.number().int().nonnegative(),
});

export type BenchmarkPolicy = z.infer<typeof BenchmarkPolicySchema>;
export type BenchmarkOperation = z.infer<typeof BenchmarkOperationSchema>;
export type LadybugBenchmarkWorkerRequest = z.infer<typeof LadybugBenchmarkWorkerRequestSchema>;
export type LadybugBenchmarkWorkerResult = z.infer<typeof LadybugBenchmarkWorkerResultSchema>;

export function parseLadybugBenchmarkWorkerRequest(value: unknown): LadybugBenchmarkWorkerRequest {
  return LadybugBenchmarkWorkerRequestSchema.parse(value);
}

export function parseLadybugBenchmarkWorkerResult(value: unknown): LadybugBenchmarkWorkerResult {
  return LadybugBenchmarkWorkerResultSchema.parse(value);
}
