// The guard that keeps the check scripts off production.
//
// Every check creates tagged records and purges them again. That is correct
// against a development or staging database and unacceptable against the live
// one, where it would write real-looking rows into real operating data.
//
// The database itself cannot tell us which it is, so the environment must say so
// explicitly: a database that does not carry ALLOW_CHECK_WRITES is treated as
// production. Production environments simply never set it.

export function assertCheckDatabase(): void {
  if (process.env.ALLOW_CHECK_WRITES === "true") return;

  const url = process.env.DATABASE_URL ?? "";
  const host = url.replace(/^[a-z]+:\/\/[^@]*@/i, "").split(/[/:?]/)[0] || "(unset)";

  throw new Error(
    `Refusing to run a check script against ${host}.\n\n` +
      `These scripts write and delete data. Set ALLOW_CHECK_WRITES="true" in the ` +
      `environment of a development or staging database only. A production ` +
      `environment must never set it.`
  );
}
