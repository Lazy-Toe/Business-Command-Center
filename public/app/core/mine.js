// Omat-näkymän logiikka ilman näkymää: kirjautuneen henkilön tehtävät ja scorecardit kaikista suunnitelmista.
import { buildToday } from "./today.js";
import { rowsFor, freeRows, orderDefs } from "./scorecard.js";

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
    .map((role) => {
      const inPlan = items.filter((i) => i.plan_id === role.plan_id);
      const own = inPlan.filter((m) => m.kind === "metric" && m.parent_id === role.id).sort(byPos);
      const rows = rowsFor(role, orderDefs(inPlan.filter((g) => g.kind === "goal"), inPlan.filter((d) => d.kind === "metricdef")), own);
      return { plan_id: role.plan_id, role, rows, free: freeRows(own), below: rows.filter((x) => x.score.below).length };
    });
  const open = pick(tasks.late).length + pick(tasks.today).length + pick(tasks.week).length + pick(tasks.later).length + pick(tasks.doing).length + pick(tasks.noDate).length;
  return {
    late: pick(tasks.late), today: pick(tasks.today), week: pick(tasks.week), later: pick(tasks.later),
    doing: pick(tasks.doing), noDate: pick(tasks.noDate),
    attention: pick(tasks.attention), scorecards, open, below: scorecards.reduce((n, s) => n + s.below, 0)
  };
}
