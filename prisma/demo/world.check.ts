// The demo world is plausible and self-consistent (no database).
// Run: node --import ./prisma/alias-loader.mjs prisma/demo/world.check.ts
import assert from "node:assert/strict";
import { CUSTOMERS, MEMBERS, PROJECTS } from "./world.ts";

const TEST_WORDS = /\b(UAT|ZZ|filler|mock|test)\b|^Buyer /i;

assert.deepEqual(
  Object.values(PROJECTS).map((p) => p.plots.length),
  [30, 25, 20],
  "Shri Ram Enclave 30, Aravali Heights 25, Mansarovar Business Park 20"
);
for (const p of Object.values(PROJECTS)) {
  const numbers = p.plots.map((r) => r.plotNumber);
  assert.equal(new Set(numbers).size, numbers.length, `${p.name}: plot numbers are unique`);
}
const everyone = [...Object.values(MEMBERS), ...Object.values(CUSTOMERS)];
for (const c of everyone) assert.ok(!TEST_WORDS.test(c.name), `${c.name} reads as a real person`);
const names = everyone.map((c) => c.name);
assert.equal(new Set(names).size, names.length, "every name is distinct");
for (const [key, m] of Object.entries(MEMBERS)) {
  if (m.inviter) assert.ok(MEMBERS[m.inviter], `${key}'s inviter exists`);
}
assert.ok(Object.keys(MEMBERS).length === 14, "14 Members");
assert.ok(Object.keys(CUSTOMERS).length >= 40, "at least 40 Customers");
console.log("world.check.ts OK");
