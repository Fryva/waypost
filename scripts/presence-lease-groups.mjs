// Lease rows print grouped when adjacent ones share an owner (session, host,
// harness) and every printed field is a single line. Shared by `lease list`,
// `sessions` and `brief`; each keeps its own row format.
const oneLine = (value) => typeof value === "string" && value.length > 0 && !/[\r\n]/.test(value);
const groupable = (l) => oneLine(l.path) && oneLine(l.session) && oneLine(l.host) &&
  (l.harness == null || typeof l.harness === "string" && !/[\r\n]/.test(l.harness));
// Index just past the run of same-owner rows starting at `i` (i + 1 when row i
// is not groupable or has no same-owner neighbour).
export function leaseRunEnd(rows, i) {
  const l = rows[i];
  let end = i + 1;
  if (groupable(l)) {
    while (end < rows.length && groupable(rows[end]) && rows[end].session === l.session &&
      rows[end].host === l.host && rows[end].harness === l.harness) end++;
  }
  return end;
}
