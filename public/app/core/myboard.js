// Oma työpöytä: omat tehtävät vaihe × työvirta -tauluina, yksi taulu per suunnitelma. Sama jako kuin suunnitelman taulussa, ilman näkymää.
import { ownerOf } from "./today.js";

const same = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const byPos = (a, b) => (a.position || 0) - (b.position || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byDue = (a, b) => (a.data.due || "9999") < (b.data.due || "9999") ? -1 : (a.data.due || "9999") > (b.data.due || "9999") ? 1 : byPos(a, b);

// items: rivejä kaikista suunnitelmista. Palauttaa taulun jokaiselle suunnitelmalle, jossa henkilöllä on tehtäviä.
// Valmiit tehtävät eivät näy soluissa vaan lasketaan (done). Vaihe tai työvirta, jota ei enää ole, korvautuu ensimmäisellä kuten suunnitelman taulussa.
// Vain työvirrat, joissa on avoimia tehtäviä, saavat rivin. focus on ensimmäinen vaihe, jossa on avoimia tehtäviä.
export function buildBoards(items, me, planOrder = []) {
  if (!me) return [];
  const ids = [...new Set(items.map((i) => i.plan_id))];
  const order = planOrder.filter((id) => ids.includes(id)).concat(ids.filter((id) => !planOrder.includes(id)));
  const boards = [];
  order.forEach((planId) => {
    const rows = items.filter((i) => i.plan_id === planId);
    const mine = rows.filter((t) => t.kind === "task" && same(ownerOf(t), me));
    if (!mine.length) return;
    let phases = rows.filter((i) => i.kind === "phase").sort(byPos).map((p) => ({ id: p.id, label: p.data.label || "", title: p.data.title || "" }));
    let streams = rows.filter((i) => i.kind === "stream").sort(byPos).map((s) => ({ id: s.id, label: s.data.label || "", color: s.data.color || "ihmiset" }));
    if (!phases.length) phases = [{ id: "", label: "", title: "Tehtävät" }];
    if (!streams.length) streams = [{ id: "", label: "", color: "ihmiset" }];
    const ph = (t) => (phases.some((p) => p.id === t.data.phase) ? t.data.phase : phases[0].id);
    const ws = (t) => (streams.some((s) => s.id === t.data.stream) ? t.data.stream : streams[0].id);
    const open = mine.filter((t) => t.data.status !== "done"), done = mine.length - open.length;
    const lanes = streams.map((s) => {
      const cells = {};
      phases.forEach((p) => { cells[p.id] = open.filter((t) => ws(t) === s.id && ph(t) === p.id).sort(byDue); });
      return Object.assign({}, s, { cells, count: phases.reduce((n, p) => n + cells[p.id].length, 0) });
    }).filter((l) => l.count > 0);
    const phaseCounts = {};
    phases.forEach((p) => { phaseCounts[p.id] = open.filter((t) => ph(t) === p.id).length; });
    const focus = (phases.find((p) => phaseCounts[p.id] > 0) || { id: "" }).id;
    boards.push({ plan_id: planId, phases, lanes, open: open.length, done, phaseCounts, focus, firstTask: mine[0] });
  });
  return boards;
}
