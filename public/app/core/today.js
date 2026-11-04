// Tänään-näkymän logiikka ilman näkymää. Päivät ovat muodossa VVVV-KK-PP.
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function todayISO(d = new Date()) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function fmtDate(iso) {
  if (!ISO.test(iso || "")) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return d + "." + m + "." + y;
}
const WEEKDAYS = ["sunnuntai", "maanantai", "tiistai", "keskiviikko", "torstai", "perjantai", "lauantai"];
export function fmtLong(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] + " " + d + "." + m + "." + y;
}
export const hasDue = (t) => ISO.test(t.data.due || "");
export const isLate = (t, today) => hasDue(t) && t.data.due < today && t.data.status !== "done";

// Tehtävän oma vastuuhenkilö tai saman työvirran vastuualueen omistaja.
export function ownerOf(task, roles) {
  if (task.data.owner) return task.data.owner;
  const r = (roles || []).find((x) => x.data.stream && x.data.stream === task.data.stream);
  return r && r.data.owner ? r.data.owner : "";
}

const byDue = (a, b) => (a.data.due < b.data.due ? -1 : a.data.due > b.data.due ? 1 : 0);

// items: rivejä kaikista suunnitelmista ({ plan_id, id, kind, parent_id, data }).
export function buildToday(items, today, filter = {}) {
  const inPlan = (planId, kind) => items.filter((i) => i.plan_id === planId && i.kind === kind);
  const plans = [...new Set(items.map((i) => i.plan_id))];
  const owners = new Set();
  let tasks = [];
  plans.forEach((planId) => {
    const roles = inPlan(planId, "role"), streams = inPlan(planId, "stream");
    inPlan(planId, "task").forEach((t) => {
      const owner = ownerOf(t, roles), stream = streams.find((s) => s.id === t.data.stream);
      if (t.data.status === "done") return;
      if (owner) owners.add(owner);
      tasks.push(Object.assign({}, t, { owner, stream }));
    });
  });

  const roleOf = (m) => items.find((i) => i.plan_id === m.plan_id && i.id === m.parent_id);
  let attention = items
    .filter((i) => (i.kind === "row" || i.kind === "risk" || i.kind === "metric") && i.data.state === "bad")
    .map((i) => {
      const role = i.kind === "metric" ? roleOf(i) : null;
      const owner = role ? role.data.owner || "" : "";
      if (owner) owners.add(owner);
      return Object.assign({}, i, { owner, role });
    });

  if (filter.plan) {
    tasks = tasks.filter((t) => t.plan_id === filter.plan);
    attention = attention.filter((t) => t.plan_id === filter.plan);
  }
  if (filter.owner) {
    tasks = tasks.filter((t) => t.owner === filter.owner);
    attention = attention.filter((t) => t.owner === filter.owner);
  }

  const week = addDays(today, 7);
  const dated = tasks.filter(hasDue).sort(byDue);
  return {
    late: dated.filter((t) => t.data.due < today),
    today: dated.filter((t) => t.data.due === today),
    week: dated.filter((t) => t.data.due > today && t.data.due <= week),
    later: dated.filter((t) => t.data.due > week),
    doing: tasks.filter((t) => !hasDue(t) && t.data.status === "doing"),
    noDate: tasks.filter((t) => !hasDue(t) && t.data.status !== "doing"),
    attention,
    owners: [...owners].sort((a, b) => a.localeCompare(b, "fi"))
  };
}
