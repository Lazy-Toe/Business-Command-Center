// Tänään-näkymän logiikka ilman näkymää. Päivät ovat muodossa VVVV-KK-PP.
import { scoreRow } from "./scorecard.js";
import { hasStream } from "./streams.js";
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
// Päivän kirjoitus näppäimistöllä tuottaa välivaiheessa kelvollisia päiviä, kuten vuoden 0002. Vain järkevä vuosi tallennetaan.
export const isSaneDue = (v) => ISO.test(v || "") && +v.slice(0, 4) >= 2000 && +v.slice(0, 4) < 2100;
export const hasDue = (t) => ISO.test(t.data.due || "");
export const isLate = (t, today) => hasDue(t) && t.data.due < today && t.data.status !== "done";

// Tehtävä kuuluu henkilölle vain ja ainoastaan sen valitun vastuuhenkilön (owner) kautta. Työvirta ei siirrä tehtävää kenellekään.
// Roolilistaparametri säilyy vanhojen kutsujen vuoksi, eikä sitä käytetä.
export function ownerOf(task) {
  return String((task.data && task.data.owner) || "").trim();
}

// Ehdotus tehtävän vastuuhenkilöksi: saman työvirran vastuualueen omistaja. Ehdotus ei ole vastuu ennen kuin se kirjataan tehtävälle.
export function suggestedOwner(stream, roles) {
  const r = (roles || []).find((x) => hasStream(x, stream));
  return r && r.data.owner ? r.data.owner : "";
}

const MONTH_NAMES = ["tammikuu", "helmikuu", "maaliskuu", "huhtikuu", "toukokuu", "kesäkuu", "heinäkuu", "elokuu", "syyskuu", "lokakuu", "marraskuu", "joulukuu"];
// "2026-11" -> "Marraskuu 2026"
export const monthLabel = (key) => { const n = MONTH_NAMES[Number(key.slice(5, 7)) - 1] || ""; return n.charAt(0).toUpperCase() + n.slice(1) + " " + key.slice(0, 4); };

// Tänään-näkymän kuukausijako: kuluva kuukausi ja count-1 seuraavaa ovat aina mukana, vaikka kuukaudessa ei olisi tehtäviä.
// dated: tehtävät, joilla on määräpäivä tänään jälkeen (tänään ja myöhässä olevat näytetään omissa ryhmissään). beyond: tehtävät viimeisen kuukauden jälkeen.
export function monthBuckets(dated, today, count = 6) {
  const [y, m] = today.slice(0, 7).split("-").map(Number), nowKey = today.slice(0, 7), keys = [];
  for (let i = 0; i < count; i++) { const t = y * 12 + (m - 1) + i; keys.push(Math.floor(t / 12) + "-" + String((t % 12) + 1).padStart(2, "0")); }
  const sorted = dated.slice().sort((a, b) => (a.data.due < b.data.due ? -1 : a.data.due > b.data.due ? 1 : 0));
  return {
    months: keys.map((k) => ({ key: k, label: monthLabel(k), current: k === nowKey, list: sorted.filter((t) => t.data.due.slice(0, 7) === k) })),
    beyond: sorted.filter((t) => t.data.due.slice(0, 7) > keys[keys.length - 1])
  };
}

// ISO-viikon numero (viikko 1 sisältää vuoden ensimmäisen torstain).
export function weekNumber(iso) {
  const [y, m, d] = iso.split("-").map(Number), dt = new Date(Date.UTC(y, m - 1, d)), dow = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dow + 3); // viikon torstai
  const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((dt - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
}
// Viikon viimeinen päivä (sunnuntai). Viikolle sitoutuvan tehtävän määräpäivä on tämä, joten se on myöhässä vasta maanantaina.
export function weekEnd(iso) {
  const [y, m, d] = iso.split("-").map(Number), dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(iso, 6 - dow);
}
// Viikon valinta asettaa molemmat päivät: maanantai alkuun ja sunnuntai loppuun. Päiviä voi sen jälkeen muuttaa erikseen.
export const weekChange = (iso) => ({ start: addDays(weekEnd(iso), -6), due: weekEnd(iso) });
// Sunnuntaille osuva määräpäivä luetaan viikkotason määräpäiväksi ("vko 45"), muu päivä näytetään päivänä.
export const isWeekDue = (iso) => ISO.test(iso || "") && weekEnd(iso) === iso;
export function fmtDue(iso) {
  if (!ISO.test(iso || "")) return "";
  return isWeekDue(iso) ? "vko " + weekNumber(iso) : fmtDate(iso);
}
// Aloituspäivä: maanantai luetaan viikon alkuna ("vko 45"), muu päivä näytetään päivänä.
export const isWeekStart = (iso) => ISO.test(iso || "") && addDays(weekEnd(iso), -6) === iso;
export function fmtStart(iso) {
  if (!ISO.test(iso || "")) return "";
  return isWeekStart(iso) ? "vko " + weekNumber(iso) : fmtDate(iso);
}
// Tehtävän kesto tekstinä: "vko 45 – vko 47", "2.11. – 13.11.2026" tai pelkkä loppu, jos aloitusta ei ole.
export function fmtSpan(start, due) {
  if (!ISO.test(due || "")) return ISO.test(start || "") ? "alk. " + fmtStart(start) : "";
  if (!ISO.test(start || "") || start === due) return fmtDue(due);
  return fmtStart(start) + " – " + fmtDue(due);
}

// Viikon aikaväli tekstinä: "9.–15.11." tai "30.11.–6.12.".
export function weekSpan(iso) {
  const end = weekEnd(iso), start = addDays(end, -6), [, m1, d1] = start.split("-").map(Number), [, m2, d2] = end.split("-").map(Number);
  return m1 === m2 ? d1 + "." + "–" + d2 + "." + m2 + "." : d1 + "." + m1 + "." + "–" + d2 + "." + m2 + ".";
}
// Valittavat viikot määräpäiväksi: tämä viikko ja count-1 seuraavaa. Arvo on viikon viimeinen päivä.
export function weekOptions(today, count = 6) {
  const first = weekEnd(today);
  return Array.from({ length: count }, (_, i) => { const v = addDays(first, 7 * i); return { value: v, label: "Vko " + weekNumber(v) + " (" + weekSpan(v) + ")" }; });
}

// Viikko maanantaista sunnuntaihin. offset 0 = tämä viikko, 1 = ensi viikko.
export function weekRange(today, offset = 0) {
  const [y, m, d] = today.split("-").map(Number), dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const start = addDays(today, -dow + 7 * offset);
  return [start, addDays(start, 6)];
}

// Tänään-näkymän jaksovalinnat (kuten Pipedriven Activities): avain -> sopiiko tehtävä. Kuukausi on "m:VVVV-KK".
export function inPeriod(t, key, today) {
  const due = hasDue(t) ? t.data.due : "";
  if (key === "none") return !due;
  if (!due) return false;
  if (key === "todo" || !key) return true;
  if (key === "late") return due < today;
  if (key === "today") return due === today;
  if (key === "tomorrow") return due === addDays(today, 1);
  if (key === "week" || key === "nextweek") { const [a, b] = weekRange(today, key === "week" ? 0 : 1); return due >= a && due <= b; }
  if (key.startsWith("m:")) return due.slice(0, 7) === key.slice(2);
  return true;
}
// Päivän mukaan, päivättömät viimeisenä.
export const byDueFirst = (a, b) => (hasDue(a) ? (hasDue(b) ? (a.data.due < b.data.due ? -1 : a.data.due > b.data.due ? 1 : 0) : -1) : hasDue(b) ? 1 : 0);

// Kuukausinäkymä: viikot maanantaista alkaen, jokaisessa päivässä sen päivän tehtävät.
export function monthGrid(tasks, year, month) {
  const first = year + "-" + String(month).padStart(2, "0") + "-01", dow = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  let cur = addDays(first, -dow);
  const weeks = [];
  do {
    const days = [];
    for (let i = 0; i < 7; i++, cur = addDays(cur, 1)) days.push({ date: cur, inMonth: cur.slice(0, 7) === first.slice(0, 7), tasks: tasks.filter((t) => hasDue(t) && (t.data.start && t.data.start <= t.data.due ? t.data.start <= cur && cur <= t.data.due : t.data.due === cur)) });
    weeks.push(days);
  } while (cur.slice(0, 7) === first.slice(0, 7) && weeks.length < 6);
  return weeks;
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
      tasks.push(Object.assign({}, t, { owner, stream, suggested: suggestedOwner(t.data.stream, roles) }));
    });
  });

  const roleOf = (m) => items.find((i) => i.plan_id === m.plan_id && i.id === m.parent_id);
  // Huomiota vaativat: huonoksi arvioidut rivit ja riskit sekä tavoiterivit, joiden toteuma on alle mallin alarajan.
  const defOf = (m) => items.find((i) => i.kind === "metricdef" && i.plan_id === m.plan_id && i.id === m.data.def);
  let attention = items
    .filter((i) => {
      if (i.kind === "row" || i.kind === "risk") return i.data.state === "bad";
      if (i.kind !== "metric" || !i.data.def) return false;
      const def = defOf(i);
      return !!def && scoreRow(def, i).below;
    })
    .map((i) => {
      const role = i.kind === "metric" ? roleOf(i) : null;
      const owner = role ? role.data.owner || "" : "";
      if (owner) owners.add(owner);
      const def = i.kind === "metric" ? defOf(i) : null;
      return Object.assign({}, i, { owner, role, title: def ? def.data.name : i.data.name });
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
