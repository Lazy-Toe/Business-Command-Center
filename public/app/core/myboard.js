// Taulun tehtävien ja rivien rajaus sekä Oma työpöydän taulut ilman näkymää. Suunnitelman taulu ja Oma työpöytä käyttävät samaa taulukomponenttia (modules/plan.js).
import { ownerOf } from "./today.js";

const same = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const byPos = (a, b) => (a.position || 0) - (b.position || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Valmiit pois, jos hideDone. Työvirrat vain ne, joissa on näytettäviä tehtäviä, jos hideEmpty.
export const visibleTasks = (tasks, hideDone) => (hideDone ? tasks.filter((t) => t.data.status !== "done") : tasks);
export const visibleStreams = (streams, tasks, hideEmpty) => (hideEmpty ? streams.filter((w) => tasks.some((t) => t.data.stream === w.id)) : streams);

// items: rivejä kaikista suunnitelmista. Palauttaa suunnitelman taulun tiedot (kuten planParts) jokaiselle suunnitelmalle, jossa henkilöllä on tehtäviä.
// Tehtävät ovat vain henkilön omat (vastuuta ei peritä), valmiit mukana (taulu piilottaa ne tilansa mukaan). Vaihe tai työvirta, jota ei enää ole,
// korvautuu ensimmäisellä kuten suunnitelman taulussa. readonly: nimiä, lisäystä ja siirtoa ei muokata, hideEmptyLanes: vain työvirrat joissa on tehtäviä.
export function mineParts(items, me, planOrder = []) {
  if (!me) return [];
  const ids = [...new Set(items.map((i) => i.plan_id))];
  const order = planOrder.filter((id) => ids.includes(id)).concat(ids.filter((id) => !planOrder.includes(id)));
  const out = [];
  order.forEach((planId) => {
    const rows = items.filter((i) => i.plan_id === planId);
    const mine = rows.filter((t) => t.kind === "task" && same(ownerOf(t), me)).sort(byPos);
    if (!mine.length) return;
    let phases = rows.filter((i) => i.kind === "phase").sort(byPos), streams = rows.filter((i) => i.kind === "stream").sort(byPos);
    if (!phases.length) phases = [{ id: "", plan_id: planId, kind: "phase", position: 0, data: { label: "", title: "Tehtävät" } }];
    if (!streams.length) streams = [{ id: "", plan_id: planId, kind: "stream", position: 0, data: { label: "Tehtävät", color: "ihmiset" } }];
    const tasks = mine.map((t) => {
      const phase = phases.some((p) => p.id === t.data.phase) ? t.data.phase : phases[0].id;
      const stream = streams.some((w) => w.id === t.data.stream) ? t.data.stream : streams[0].id;
      return phase === t.data.phase && stream === t.data.stream ? t : Object.assign({}, t, { data: Object.assign({}, t.data, { phase, stream }) });
    });
    out.push({ plan_id: planId, section: rows.find((i) => i.kind === "section" && i.data.type === "plan") || null, phases, streams, tasks, roles: [], readonly: true, hideEmptyLanes: true, firstTask: mine[0] });
  });
  return out;
}
