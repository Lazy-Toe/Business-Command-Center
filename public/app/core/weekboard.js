// Tänään-viikkokalenteri ilman näkymää: tehtävät sarakkeiksi viikoittain (Myöhässä, tämä viikko, ensi viikko ... Myöhemmin, Ei päivää) ja riveiksi henkilöt tai työvirrat.
// Palauttaa saman muodon kuin suunnitelman taulu (phases, streams, tasks), joten sitä esittää sama taulukomponentti.
import { addDays, weekEnd, weekNumber, weekSpan, hasDue } from "./today.js";

const COLORS = ["kate", "tekno", "kanava", "bc", "ihmiset", "myynti"];

const MONTHS = ["Tammikuu", "Helmikuu", "Maaliskuu", "Huhtikuu", "Toukokuu", "Kesäkuu", "Heinäkuu", "Elokuu", "Syyskuu", "Lokakuu", "Marraskuu", "Joulukuu"];
const lastOfMonth = (key) => { const [y, m] = key.split("-").map(Number); return key + "-" + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0"); };

// Sarakkeet tehtävien mukaan, jotta mikään tehtävä ei jää näkymättömiin: Myöhässä (vain jos tehtäviä), tämä, ensi ja sitä seuraava viikko aina,
// muut viikot kahdeksan viikon sisällä vain jos niillä on tehtäviä, sen jälkeen kuukausi kullekin kuukaudelle, jossa on tehtäviä, ja lopuksi Ei päivää.
export function weekColumns(today, tasks = [], weeks = 3, horizon = 8) {
  const first = weekEnd(today), lastWeek = addDays(first, 7 * (horizon - 1)), cols = [];
  const dues = tasks.filter(hasDue).map((t) => t.data.due);
  if (dues.some((d) => d < today)) cols.push({ id: "late", data: { label: "", short: "!", title: "Myöhässä" } });
  const occupied = new Set(dues.filter((d) => d >= today && d <= lastWeek).map((d) => weekEnd(d)));
  for (let i = 0; i < horizon; i++) {
    const end = addDays(first, 7 * i), n = weekNumber(end);
    if (i >= weeks && !occupied.has(end)) continue;
    cols.push({ id: "w:" + end, data: { label: "VKO " + n + " · " + weekSpan(end), short: String(n), title: i === 0 ? "Tämä viikko" : i === 1 ? "Ensi viikko" : "Viikko " + n } });
  }
  [...new Set(dues.filter((d) => d > lastWeek).map((d) => d.slice(0, 7)))].sort().forEach((k) => {
    cols.push({ id: "m:" + k, data: { label: "", short: MONTHS[Number(k.slice(5)) - 1].slice(0, 3), title: MONTHS[Number(k.slice(5)) - 1] + " " + k.slice(0, 4) } });
  });
  cols.push({ id: "none", data: { label: "", short: "–", title: "Ei päivää" } });
  return cols;
}

// Mihin sarakkeeseen tehtävä kuuluu. Menneet päivät (ennen tätä päivää) ovat myöhässä, muuten määräpäivän viikko tai, kaukana, määräpäivän kuukausi.
export function columnOf(task, today, cols) {
  if (!hasDue(task)) return "none";
  const due = task.data.due;
  if (due < today) return "late";
  const week = "w:" + weekEnd(due);
  if (cols.some((c) => c.id === week)) return week;
  return "m:" + due.slice(0, 7);
}

// Uusi määräpäivä, kun tehtävä raahataan sarakkeeseen: viikko antaa viikon sunnuntain, kuukausi kuukauden viimeisen päivän ja Ei päivää tyhjentää.
// null = siirto ei ole sallittu (Myöhässä ei ole kohde).
export function dueForColumn(colId) {
  if (colId === "none") return "";
  if (colId.startsWith("w:")) return colId.slice(2);
  if (colId.startsWith("m:")) return lastOfMonth(colId.slice(2));
  return null;
}

// Rivit (lanes) tehtävistä: henkilöt tai työvirrat. Ilman henkilöä tai työvirtaa oleva rivi on ensimmäisenä.
function makeLaner(by) {
  const lanes = new Map();
  const of = (t) => {
    const key = by === "stream" ? (t.stream && t.stream.data.label) || "" : String(t.owner || "").trim();
    if (!lanes.has(key)) lanes.set(key, { id: key, data: { label: key || (by === "stream" ? "Ei työvirtaa" : "Ei vastuuhenkilöä"), color: by === "stream" && t.stream ? t.stream.data.color || "ihmiset" : COLORS[lanes.size % COLORS.length] } });
    return key;
  };
  const list = () => [...lanes.values()].sort((a, b) => Number(!b.id) - Number(!a.id) || a.data.label.localeCompare(b.data.label, "fi"));
  return { of, list };
}

// tasks: tehtävärivit ({ plan_id, id, data, owner, stream }), by: "owner" | "stream".
export function weekBoard(tasks, today, by = "owner") {
  const cols = weekColumns(today, tasks), laner = makeLaner(by);
  const wrapped = tasks.map((t) => {
    const lane = laner.of(t), phase = columnOf(t, today, cols);
    return Object.assign({}, t, { data: Object.assign({}, t.data, { phase, stream: lane }) });
  });
  return { phases: cols, streams: laner.list(), tasks: wrapped };
}

// Aikajana: viikot sarakkeina ja tehtävä palkkina aloitusviikosta lopetusviikkoon. Ilman aloitusta palkki on lopetusviikon kohdalla,
// ja ilman mitään päivää tehtävä on erillisessä listassa (undated). Alue alkaa tämän viikon maanantaista (korkeintaan neljä viikkoa taaksepäin
// aloitukseen asti) ja ulottuu vähintään kahdeksan viikkoa eteenpäin ja viimeiseen lopetukseen asti (enintään maxWeeks).
export function timelineModel(tasks, today, by = "owner", maxWeeks = 52) {
  const monday = (iso) => addDays(weekEnd(iso), -6), nowMon = monday(today);
  const dated = tasks.filter((t) => t.data.start || hasDue(t));
  const first = dated.map((t) => t.data.start || t.data.due).sort()[0] || today;
  let from = first < nowMon ? monday(first) : nowMon;
  const floor = addDays(nowMon, -28);
  if (from < floor) from = floor;
  const last = dated.map((t) => t.data.due || t.data.start).sort().pop() || today;
  let to = weekEnd(last) > addDays(nowMon, 7 * 8 - 1) ? weekEnd(last) : addDays(nowMon, 7 * 8 - 1);
  const cap = addDays(from, 7 * maxWeeks - 1);
  if (to > cap) to = cap;
  const weeks = [];
  for (let d = from; d <= to; d = addDays(d, 7)) weeks.push({ start: d, end: addDays(d, 6), n: weekNumber(d), month: addDays(d, 3).slice(0, 7), now: d === nowMon });
  const months = [];
  weeks.forEach((w) => { const m = months[months.length - 1]; if (m && m.key === w.month) m.span++; else months.push({ key: w.month, span: 1 }); });
  const colOf = (iso) => { if (iso < weeks[0].start) return 0; const i = weeks.findIndex((w) => w.start <= iso && iso <= w.end); return i < 0 ? weeks.length - 1 : i; };
  const laner = makeLaner(by), byLane = new Map(), undated = [];
  tasks.forEach((t) => {
    const lane = laner.of(t);
    if (!t.data.start && !hasDue(t)) { undated.push(t); return; }
    const s = t.data.start || t.data.due, e = t.data.due || t.data.start, a = s <= e ? s : e, b = s <= e ? e : s;
    const row = { task: t, from: colOf(a), to: colOf(b), late: hasDue(t) && t.data.due < today, clipL: a < weeks[0].start, clipR: b > weeks[weeks.length - 1].end };
    if (!byLane.has(lane)) byLane.set(lane, []);
    byLane.get(lane).push(row);
  });
  const lanes = laner.list().filter((l) => byLane.has(l.id)).map((l) => Object.assign({ rows: byLane.get(l.id).sort((x, y) => x.from - y.from || x.to - y.to) }, l));
  return { weeks, months, lanes, undated };
}
