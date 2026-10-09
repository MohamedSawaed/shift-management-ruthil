// Worker groups: one record (e.g. "הודים") with `isGroup: true` and a
// `quantity`. Every member shares the group's availability, departments and
// roles. For scheduling, a group expands into numbered members whose ids are
// `${groupId}~${n}` and names "<group name> <n>", so the assignment logic,
// swaps and saved shifts treat each member like an individual worker.

export const UNIT_SEP = '~';

export function groupSize(worker) {
  return Math.max(1, Math.floor(Number(worker.quantity) || 1));
}

export function expandWorkers(workers) {
  const out = [];
  for (const w of workers) {
    if (!w.isGroup) {
      out.push(w);
      continue;
    }
    const n = groupSize(w);
    for (let i = 1; i <= n; i++) {
      out.push({ ...w, id: `${w.id}${UNIT_SEP}${i}`, name: `${w.name} ${i}`, groupId: w.id, unit: i });
    }
  }
  return out;
}

export function baseWorkerId(id) {
  return String(id).split(UNIT_SEP)[0];
}

// Display name for any id found in a shift — a person or a group member.
// Members beyond the group's current size (it was made smaller later) still
// resolve, so older shifts keep showing sensible names.
export function workerName(workers, id) {
  const [base, unit] = String(id).split(UNIT_SEP);
  const w = workers.find((x) => x.id === base);
  if (!w) return '?';
  return unit ? `${w.name} ${unit}` : w.name;
}

// Ids in natural name order ("הודים 2" before "הודים 10"), for display only —
// auto-assign shuffles, which otherwise lists group members as 3, 5, 1, 4…
export function sortByName(workers, ids) {
  return [...ids].sort((a, b) => workerName(workers, a).localeCompare(workerName(workers, b), undefined, { numeric: true }));
}

// How many people a list of worker records stands for.
export function headcount(workers) {
  return workers.reduce((n, w) => n + (w.isGroup ? groupSize(w) : 1), 0);
}
