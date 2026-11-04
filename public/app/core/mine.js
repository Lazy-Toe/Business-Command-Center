// Omat-näkymän logiikka ilman näkymää: kirjautuneen henkilön tehtävät ja scorecardit kaikista suunnitelmista.
import { buildToday } from "./today.js";

const same = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

// items: rivejä kaikista suunnitelmista ({ plan_id, id, kind, parent_id, position, data }).
// Tehtävät ryhmitellään kuten Tänään-näkymässä. Scorecardit ovat vastuualueet, joiden vastuuhenkilö on me, mittareineen.
export function buildMine(items, me, today) {
  const mine = me ? items.filter((i) => i.kind !== "role" || same(i.data.owner, me)) : [];
  const tasks = buildToday(items, today, {});
  // Vertailu ohittaa kirjainkoon, joten tehtävät suodatetaan tässä eikä buildTodayn tarkalla vastaavuudella.
  const owned = (t) => same(t.owner, me);
  const pick = (l) => (me ? l.filter(owned) : []);
  const byPos = (a, b) => (a.position || 0) - (b.position || 0);
  const scorecards = mine.filter((i) => i.kind === "role").sort((a, b) => (a.plan_id < b.plan_id ? -1 : a.plan_id > b.plan_id ? 1 : byPos(a, b)))
    .map((role) => ({ plan_id: role.plan_id, role, metrics: items.filter((m) => m.kind === "metric" && m.plan_id === role.plan_id && m.parent_id === role.id).sort(byPos) }));
  const open = pick(tasks.late).length + pick(tasks.today).length + pick(tasks.week).length + pick(tasks.later).length + pick(tasks.doing).length + pick(tasks.noDate).length;
  return {
    late: pick(tasks.late), today: pick(tasks.today), week: pick(tasks.week), later: pick(tasks.later),
    doing: pick(tasks.doing), noDate: pick(tasks.noDate),
    attention: pick(tasks.attention), scorecards, open
  };
}
