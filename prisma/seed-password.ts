// The password every seeded staff account starts with.
//
// It lives in a module of its own because both `seed.ts` (which writes it) and
// `db.check.ts` (which asserts it) need it, and importing the seed to reach the
// constant would run the seed as a side effect of running a test.
//
// db.check.ts used to carry its own copy of the literal, and the two drifted:
// the check failed against a correctly seeded database because it was still
// testing a password no seed had written for some time.
export const INITIAL_PASSWORD = "3preclub26";
