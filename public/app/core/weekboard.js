// Tänään-viikkokalenteri ilman näkymää: tehtävät sarakkeiksi viikoittain (Myöhässä, tämä viikko, ensi viikko ... Myöhemmin, Ei päivää) ja riveiksi henkilöt tai työvirrat.
// Palauttaa saman muodon kuin suunnitelman taulu (phases, streams, tasks), joten sitä esittää sama taulukomponentti.
import { addDays, weekEnd, weekNumber, weekSpan, hasDue } from "./today.js";

const COLORS = ["kate", "tekno", "kanava", "bc", "ihmiset", "myynti"];

// Sarakkeet: late, w:<viikon sunnuntai> (weeks kpl), later, none.
export function weekColumns(today, weeks = 5) {
  const first = weekEnd(today), cols = [{ id: "late", data: { label: "", short: "!", title: "Myöhässä" } }];
  for (let i = 0; i < weeks; i++) {
    const end = addDays(first, 7 * i), n = weekNumber(end);
    cols.push({ id: "w:" + end, data: { label: "VKO " + n + " · " + weekSpan(end), short: String(n), title: i === 0 ? "Tämä viikko" : i === 1 ? "Ensi viikko" : "Viikko " + n } });
  }
  cols.push({ id: "later", data: { label: "", short: "»", title: "Myöhemmin" } }, { id: "none", data: { label: "", short: "–", title: "Ei päivää" } });
  return cols;
}

// Mihin sarakkeeseen tehtävä kuuluu. Menneet päivät (ennen tätä päivää) ovat myöhässä, muuten määräpäivän viikko.
export function columnOf(task, today, cols) {
  if (!hasDue(task)) return "none";
  const due = task.data.due;
  if (due < today) return "late";
  const id = "w:" + weekEnd(due);
  return cols.some((c) => c.id === id) ? id : "later";
}

// Uusi määräpäivä, kun tehtävä raahataan sarakkeeseen. null = siirto ei ole sallittu (Myöhässä ja Myöhemmin eivät ole kohteita).
export function dueForColumn(colId) {
  if (colId === "none") return "";
  return colId.startsWith("w:") ? colId.slice(2) : null;
}

// tasks: tehtävärivit ({ plan_id, id, data, owner, stream }), by: "owner" | "stream".
export function weekBoard(tasks, today, by = "owner", weeks = 5) {
  const cols = weekColumns(today, weeks), lanes = new Map();
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
