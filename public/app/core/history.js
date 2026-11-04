// Muutoshistorian käsittely ilman näkymää: ryhmittely, nimike, muuttuneet kentät ja palautus.
const LABEL_KEYS = ["title", "name", "text", "label"];
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const show = (v) => (v === undefined ? "(ei arvoa)" : clip(typeof v === "string" ? v : JSON.stringify(v), 80));

// Lyhyt nimike rivin sisällöstä: ensin tutut kentät, muuten ensimmäinen teksti.
export function rowLabel(data) {
  const d = data || {};
  const pick = (keys) => keys.find((k) => typeof d[k] === "string" && d[k].trim());
  const k = pick(LABEL_KEYS) || pick(Object.keys(d));
  return k ? clip(d[k].trim(), 60) : "";
}

// Rivit tulevat uusimmasta vanhimpaan. Saman tallennuksen rivit (sama aika ja laji) kuuluvat yhteen.
export function groupHistory(rows) {
  const out = [];
  rows.forEach((r) => {
    const g = out[out.length - 1];
    if (g && g.at === r.changed_at && g.op === r.op) g.rows.push(r);
    else out.push({ key: r.hist_id, at: r.changed_at, op: r.op, rows: [r] });
  });
  return out;
}

// Kentät, jotka poikkeavat nykyisestä, ja niiden aiempi arvo.
export function changedFields(old, now) {
  const a = old || {}, b = now || {};
  return [...new Set(Object.keys(a).concat(Object.keys(b)))]
    .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map((k) => ({ key: k, before: show(a[k]) }));
}

// Palautettavat rivit. Rivin edeltävä tila otetaan tallennuksen vanhimmasta merkinnästä.
// Muutoksen palautus säilyttää rivin nykyisen paikan, poiston palautus vanhan.
// Rivi, jonka ylärivi puuttuu, ohitetaan, ettei näkymään jää orpoja rivejä.
export function restoreOps(group, get) {
  const first = new Map();
  group.rows.slice().sort((x, y) => x.hist_id - y.hist_id).forEach((r) => { if (!first.has(r.id)) first.set(r.id, r); });
  const rows = [], skipped = [];
  first.forEach((r) => {
    const cur = get(r.id), keep = group.op === "update" && cur;
    const parent = keep ? cur.parent_id : r.parent_id;
    if (parent != null && !first.has(parent) && !get(parent)) { skipped.push(r.id); return; }
    rows.push({ id: r.id, kind: r.kind, parent_id: parent == null ? null : parent, position: keep ? cur.position : r.position, data: r.data });
  });
  return { rows, skipped };
}
