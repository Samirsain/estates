// Fixture scripts write and purge records. An explicit opt-in is required,
// and a hosted or real-data database is never a valid target.
export function assertCheckDatabase(): void {
  const url = URL.parse(process.env.DATABASE_URL ?? "");
  const database = url?.pathname.slice(1).toLowerCase() ?? "";
  const loopback = !!url && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  const fixtureName = /(?:^|[_-])(?:test|mock|check|trial)(?:[_-]|$)/.test(database);
  const realData = /(?:^|[_-])(?:real|prod|production|live)(?:[_-]|$)/.test(database);
  if (process.env.ALLOW_CHECK_WRITES === "true" && loopback && fixtureName && !realData) return;

  throw new Error("Fixture writes require an explicitly enabled localhost test database.");
}
