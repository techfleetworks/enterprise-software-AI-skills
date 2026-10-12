// PLANTED (error-handling): a catch that does none of recover/retry/report, plus an empty catch.
export function swallow() {
  try { doThing(); } catch (e) { return null; } // swallowReturn built-in
}
export function empty() {
  try { doThing(); } catch (e) {} // emptyCatch built-in
}
