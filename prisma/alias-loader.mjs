// Resolves the "@/*" -> "./src/*" path alias, and the extensionless specifiers
// the bundler allows, so the check scripts can import services directly under
// plain node. Register with:  node --import ./prisma/alias-loader.mjs <script>
//
// This exists only for the check scripts. Next.js resolves both itself.

import { register } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

// Check scripts talk to the database directly rather than through the
// transaction pooler. A command like a Booking submission runs ~25 statements
// in one interactive transaction, which pins a pooled connection for as long as
// the round trips take; the pooler eventually resets it and the run dies on a
// connection error that has nothing to do with the code under test. The direct
// connection is the same database with no pooler in between.
//
// This runs before any module is loaded, so the Prisma client picks it up.
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;

const SRC = new URL("../src/", import.meta.url);

function withExtension(url) {
  const path = fileURLToPath(url);
  if (existsSync(path)) return url;
  for (const candidate of [`${path}.ts`, `${path}.tsx`, `${path}/index.ts`]) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  return url;
}

export function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    return next(withExtension(new URL(specifier.slice(2), SRC).href), context);
  }
  // A relative import inside src that omitted its extension.
  if (specifier.startsWith(".") && context.parentURL?.includes("/src/")) {
    return next(withExtension(new URL(specifier, context.parentURL).href), context);
  }
  return next(specifier, context);
}

register(import.meta.url, import.meta.url);
