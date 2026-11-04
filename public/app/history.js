// Muutoshistoria: viimeiset muutokset ja poistot, joista yksittäisen voi palauttaa.
import { html, useEffect, useState } from "../vendor/htm-preact.js";
import { loadHistory, get, addMany } from "./core/store.js";
import { useEscape } from "./core/ui.js";
import { groupHistory, rowLabel, changedFields, restoreOps } from "./core/history.js";

const OPNAME = { update: "Muutettu", delete: "Poistettu" };
const when = (t) => new Date(t).toLocaleString("fi-FI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

function Entry({ group, done, onRestore }) {
  const first = group.rows[group.rows.length - 1], n = group.rows.length;
  const plan = restoreOps(group, get);
  const cur = group.op === "update" ? get(first.id) : null;
  const fields = cur && n === 1 ? changedFields(first.data, cur.data) : [];
  return html`<li class="hentry">
    <div class="hmain">
      <span class="hwhen">${when(group.at)}</span>
      <span class=${"hop " + group.op}>${OPNAME[group.op] || group.op}</span>
      <b>${rowLabel(first.data) || "(ei nimikettä)"}</b>
      <span class="hkind">${first.kind}${n > 1 ? " ja " + (n - 1) + " muuta" : ""}</span>
    </div>
    ${fields.map((f) => html`<div class="hfield" key=${f.key}><span>${f.key}</span> oli: ${f.before}</div>`)}
    <div class="hact">
      ${done ? html`<span class="hdone">Palautettu</span>` : html`<button type="button" class="barbtn" disabled=${!plan.rows.length} title=${plan.rows.length ? "" : "Ylärivi puuttuu"} onClick=${() => onRestore(plan.rows)}>Palauta${plan.skipped.length ? " (" + plan.rows.length + "/" + n + ")" : ""}</button>`}
    </div>
  </li>`;
}

export function HistoryPanel({ onClose }) {
  const [groups, setGroups] = useState(null), [err, setErr] = useState(""), [done, setDone] = useState({});
  useEscape(onClose);
  useEffect(() => { loadHistory().then((rows) => setGroups(groupHistory(rows)), (e) => setErr("Historiaa ei saatu ladattua (" + e.message + ").")); }, []);
  const restore = (g, rows) => { addMany(rows); setDone((d) => Object.assign({}, d, { [g.key]: true })); };
  return html`<div class="histback" onClick=${onClose}>
    <div class="hist" role="dialog" aria-modal="true" aria-label="Muutoshistoria" onClick=${(e) => e.stopPropagation()}>
      <div class="hhead"><h2>Muutoshistoria</h2><button type="button" class="barbtn" onClick=${onClose}>Sulje</button></div>
      <p class="gs">Viimeiset muutokset ja poistot 180 päivältä. Palautus tallentuu uutena muutoksena, joten senkin voi perua.</p>
      ${err ? html`<p class="gs bad">${err}</p>` : null}
      ${!groups && !err ? html`<p class="gs">Ladataan…</p>` : null}
      ${groups && !groups.length ? html`<p class="gs">Ei muutoksia.</p>` : null}
      ${groups && groups.length ? html`<ul class="hlist">${groups.map((g) => html`<${Entry} key=${g.key} group=${g} done=${!!done[g.key]} onRestore=${(rows) => restore(g, rows)} />`)}</ul>` : null}
    </div>
  </div>`;
}
