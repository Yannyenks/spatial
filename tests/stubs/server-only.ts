// No-op stand-in for the "server-only" package inside the Vitest (plain
// Node) environment, where its real implementation deliberately throws
// (it only allows itself to be imported from within Next.js's RSC
// bundler). Production code still gets the real guard when built by Next.
export {};
