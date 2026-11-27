// Fail before a Render migration or startup if a local or test database was supplied.
function projectRef(name) {
  const url = URL.parse(process.env[name] ?? "");
  if (!url || !["postgresql:", "postgres:"].includes(url.protocol) || url.pathname !== "/postgres") return null;
  const hostRef = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname)?.[1];
  if (hostRef) return hostRef;
  if (!url.hostname.endsWith(".pooler.supabase.com")) return null;
  return /^[a-z0-9_]+\.([a-z0-9]+)$/i.exec(decodeURIComponent(url.username))?.[1] ?? null;
}

const runtime = projectRef("DATABASE_URL");
const migration = projectRef("DIRECT_URL");
if (!runtime || runtime !== migration || process.env.ALLOW_CHECK_WRITES === "true") {
  throw new Error("Render needs runtime and migration URLs for the same hosted Supabase project, with test writes disabled.");
}

console.log("Hosted database configuration verified.");
