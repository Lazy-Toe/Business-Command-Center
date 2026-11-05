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

// tasks: tehtävärivit ({ plan_id, id, data, owner, stream }), by: "owner" | "stream".
export function weekBoard(tasks, today, by = "owner") {
  const cols = weekColumns(today, tasks), lanes = new Map();
  const laneOf = (t) => {
    const key = by === "stream" ? (t.stream && t.stream.data.label) || "" : String(t.owner || "").trim();
    if (!lanes.has(key)) lanes.set(key, { id: key, data: { label: key || (by === "stream" ? "Ei työvirtaa" : "Ei vastuuhenkilöä"), color: by === "stream" && t.stream ? t.stream.data.color || "ihmiset" : COLORS[lanes.size % COLORS.length] } });
    return key;
  };
  const wrapped = tasks.map((t) => {
    const lane = laneOf(t), phase = columnOf(t, today, cols);
    return Object.assign({}, t, { data: Object.assign({}, t.data, { phase, stream: lane }) });
  });
  const streams = [...lanes.values()].sort((a, b) => Number(!b.id) - Number(!a.id) || a.data.label.localeCompare(b.data.label, "fi"));
  return { phases: cols, streams, tasks: wrapped };
}
