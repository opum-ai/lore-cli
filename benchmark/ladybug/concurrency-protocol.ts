import { z } from "zod";

export const LADYBUG_CONCURRENCY_WORKER_REQUEST_SCHEMA = "lore.ladybug-concurrency-worker-request/1";
export const LADYBUG_CONCURRENCY_WORKER_EVENT_SCHEMA = "lore.ladybug-concurrency-worker-event/1";
export const LADYBUG_CONCURRENCY_WORKER_RESULT_SCHEMA = "lore.ladybug-concurrency-worker-result/1";

export const LadybugConcurrencyPausePointSchema = z.enum([
  "start",
  "after-database-close",
  "after-control-manifest-fsync",
  "after-atomic-rename",
  "before-lock-release",
]);

const ReconcileOperationSchema = z.strictObject({
  kind: z.literal("reconcile"),
  root: z.string().min(1),
  sourcePath: z.string().min(1),
  pauseAt: LadybugConcurrencyPausePointSchema.optional(),
});

const ReadOperationSchema = z.strictObject({
  kind: z.literal("read"),
  databasePath: z.string().min(1),
  connections: z.number().int().min(1).max(16),
});

const ClassifyWriteConflictOperationSchema = z.strictObject({
  kind: z.literal("classify-write-conflict"),
  databasePath: z.string().min(1),
});

export const LadybugConcurrencyWorkerRequestSchema = z.strictObject({
  schema: z.literal(LADYBUG_CONCURRENCY_WORKER_REQUEST_SCHEMA),
  operation: z.discriminatedUnion("kind", [
    ReconcileOperationSchema,
    ReadOperationSchema,
    ClassifyWriteConflictOperationSchema,
  ]),
});

export const LadybugConcurrencyWorkerEventSchema = z.strictObject({
  schema: z.literal(LADYBUG_CONCURRENCY_WORKER_EVENT_SCHEMA),
  event: z.literal("ready"),
  point: z.enum([
    "start",
    "after-database-close",
    "after-control-manifest-fsync",
    "after-atomic-rename",
    "before-lock-release",
    "read-connections-open",
  ]),
  connectionCount: z.number().int().positive().optional(),
});

export const LadybugConcurrencyWorkerResultSchema = z.strictObject({
  schema: z.literal(LADYBUG_CONCURRENCY_WORKER_RESULT_SCHEMA),
  kind: z.enum(["reconcile", "read", "classify-write-conflict"]),
  classification: z.enum(["locked", "unsupported", "corrupt", "rebuildable", "reusable"]).optional(),
  outcome: z.enum(["reused", "built", "unavailable"]).optional(),
  generationPresent: z.boolean().optional(),
  connectionCount: z.number().int().positive().optional(),
  nativeConflict: z.enum(["same-file-conflict", "read-write-compatible"]).optional(),
  resultDigest: z
    .string()
    .regex(/^sha256:[0-9a-f]{64}$/)
    .nullable(),
});

export type LadybugConcurrencyPausePoint = z.infer<typeof LadybugConcurrencyPausePointSchema>;
export type LadybugConcurrencyWorkerRequest = z.infer<typeof LadybugConcurrencyWorkerRequestSchema>;
export type LadybugConcurrencyWorkerEvent = z.infer<typeof LadybugConcurrencyWorkerEventSchema>;
export type LadybugConcurrencyWorkerResult = z.infer<typeof LadybugConcurrencyWorkerResultSchema>;
export type LadybugConcurrencyReadOperation = Extract<
  LadybugConcurrencyWorkerRequest["operation"],
  { readonly kind: "read" }
>;
export type LadybugConcurrencyClassifyWriteConflictOperation = Extract<
  LadybugConcurrencyWorkerRequest["operation"],
  { readonly kind: "classify-write-conflict" }
>;

export function parseLadybugConcurrencyWorkerEvent(value: unknown): LadybugConcurrencyWorkerEvent {
  return LadybugConcurrencyWorkerEventSchema.parse(value);
}

export function parseLadybugConcurrencyWorkerResult(value: unknown): LadybugConcurrencyWorkerResult {
  return LadybugConcurrencyWorkerResultSchema.parse(value);
}
