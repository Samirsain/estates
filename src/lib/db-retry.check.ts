// Transient database errors are retried; everything else is not.
// Run: node --import ./prisma/alias-loader.mjs src/lib/db-retry.check.ts
import assert from "node:assert/strict";
import { isTransientDbError, retryTransient } from "./db-retry.ts";

const coded = (code: string, message = "x") => Object.assign(new Error(message), { code });

assert.ok(isTransientDbError(coded("P1001")), "can't reach the server");
assert.ok(isTransientDbError(coded("P1017")), "server closed the connection");
assert.ok(isTransientDbError(coded("P2028", "Transaction already closed")), "transaction expired");
assert.ok(isTransientDbError(new Error("Error { kind: Io, cause: Some(Os { code: 10054, kind: ConnectionReset })")), "connection reset");
assert.ok(!isTransientDbError(Object.assign(new Error("Select a rejection reason."), { code: "BLOCKED" })), "a business refusal is final");
assert.ok(!isTransientDbError(coded("P2002", "Unique constraint failed")), "a constraint violation is final");
assert.ok(!isTransientDbError("not an error"));

// Retries a transient failure, then succeeds.
let calls = 0;
assert.equal(await retryTransient(async () => (++calls < 3 ? Promise.reject(coded("P1017")) : "ok"), [1, 1, 1]), "ok");
assert.equal(calls, 3);

// Gives up after the waits run out, with the last error.
calls = 0;
await assert.rejects(retryTransient(async () => { calls++; throw coded("P1001"); }, [1, 1]), (e: Error & { code?: string }) => e.code === "P1001");
assert.equal(calls, 3, "one try plus one per wait");

// Never retries a final error.
calls = 0;
await assert.rejects(retryTransient(async () => { calls++; throw coded("BLOCKED"); }, [1, 1]));
assert.equal(calls, 1);

console.log("db-retry.check.ts OK");
