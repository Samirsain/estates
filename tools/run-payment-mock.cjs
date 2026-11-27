const { spawnSync } = require("node:child_process");

for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
  const database = URL.parse(process.env[name] ?? "");
  if (database?.hostname !== "127.0.0.1" || database.port !== "5433" ||
      database.pathname !== "/threepct_payment_trial") {
    throw new Error("The payment mock server requires the dedicated localhost test database.");
  }
}

const server = spawnSync(process.execPath, [
  "node_modules/next/dist/bin/next", "dev", "--turbopack", "--hostname", "127.0.0.1", "--port", "3001",
], { stdio: "inherit" });
if (server.error) throw server.error;
process.exitCode = server.status ?? 1;
