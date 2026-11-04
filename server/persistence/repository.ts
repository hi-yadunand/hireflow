import { randomUUID } from "node:crypto";
import { Database } from "../db.js";
import { processingCheckpoint } from "../processing-policy.js";
import { SafetyError } from "../validation.js";

// Commands are deliberately synchronous: network/AI work cannot enter a unit of work.
export type Command<T> = (state: Database) => T;
export interface CycleLease { token: string; epoch: number; fence: string; }
export interface WriteOptions { lease?: CycleLease; signal?: AbortSignal; }
export interface Repository {
  read<T>(command: Command<T>): Promise<T>;
  write<T>(command: Command<T>, options?: WriteOptions): Promise<T>;
  acquireCycle(): Promise<CycleLease>;
  renewCycle(lease: CycleLease): Promise<void>;
  finishCycle(lease: CycleLease): Promise<void>;
  onPause(listener: () => void, epoch?: number): () => void;
  close(): Promise<void>;
}
export function synchronous<T>(result: T): T {
  if (result && typeof (result as any).then === "function") throw new SafetyError("Repository commands must not contain asynchronous work", 500);
  return result;
}

// Explicit reference adapter for the retained JSON implementation and old tests.
// The application startup constructs PostgresRepository directly; it never falls back here.
export class JsonReferenceRepository implements Repository {
  private lease?: CycleLease;
  constructor(readonly database: Database) {}
  async read<T>(command: Command<T>) { return synchronous(command(this.database)); }
  async write<T>(command: Command<T>, options: WriteOptions = {}) {
    if (options.signal?.aborted) throw new SafetyError("Request cancelled", 409);
    if (options.lease) this.check(options.lease);
    return synchronous(command(this.database));
  }
  private check(lease: CycleLease) {
    if (this.lease?.token !== lease.token || this.database.getPauseEpoch() !== lease.epoch) throw new SafetyError("Processing lease was interrupted; retry", 409);
  }
  async acquireCycle() {
    processingCheckpoint(this.database);
    if (this.lease) throw new SafetyError("A processing cycle is already running", 409);
    this.lease = { token: randomUUID(), epoch: this.database.getPauseEpoch(), fence: randomUUID() };
    return this.lease;
  }
  async renewCycle(lease: CycleLease) { this.check(lease); }
  async finishCycle(lease: CycleLease) {
    if (this.lease?.token !== lease.token) return;
    this.lease = undefined;
    this.database.updateStatus({ workerState: this.database.getStatus().isPaused ? "paused" : "idle", lastCycleRun: new Date().toISOString(), nextScheduledRun: "" });
  }
  onPause(listener: () => void) { return this.database.onPause(listener); }
  async close() {}
}
const references = new WeakMap<Database, JsonReferenceRepository>();
export function repository(input: Repository | Database): Repository {
  if (!(input instanceof Database)) return input;
  let reference = references.get(input);
  if (!reference) { reference = new JsonReferenceRepository(input); references.set(input, reference); }
  return reference;
}
