// Tehtävät: kaikki tehtävät kaikista suunnitelmista yhdessä taulukossa. Suodatus, rivin muokkaus ja massamuutos (vastuu, määräpäivä, tila).
import { html, useEffect, useState } from "../../vendor/htm-preact.js";
import { ui, uiChanged } from "../core/ui.js";
import { state, loadOverview, patchManyIn } from "../core/store.js";
import { taskRows, filterRows, bulkPatches, invertPatches, ownersIn, STATUS_LABEL } from "../core/tasks-table.js";
import { todayISO } from "../core/today.js";
import { peopleNames, PersonSelect } from "../people.js";

const EMPTY = { q: "", plan: "", stream: "", phase: "", owner: "", status: "", due: "" };
const INHERIT = "__inherit";

export function TasksView({ open }) {
  const [f, setF] = useState(() => { const x = ui.taskFilter || {}; ui.taskFilter = null; return Object.assign({}, EMPTY, x); });
  const [sel, setSel] = useState(() => new Set());
  const [last, setLast] = useState(-1);
  const [bOwner, setBOwner] = useState("");
  const [bDue, setBDue] = useState("");
  const [bStatus, setBStatus] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => { state.overviewActive = true; loadOverview(); return () => { state.overviewActive = false; }; }, []);
  const ov = state.overview;
  if (!ov) return html`<div class="wrap today"><p class="gs ${state.overviewError ? "bad" : ""}">${state.overviewError || "Ladataan…"}</p></div>`;

  const all = taskRows(ov.items, state.plans), shown = filterRows(all, f, todayISO());
  const chosen = shown.filter((r) => sel.has(r.key));
  const inPlan = f.plan ? all.filter((r) => r.plan_id === f.plan) : all;
  const streams = [...new Map(inPlan.filter((r) => r.stream).map((r) => [r.stream, r.streamLabel || r.stream])).entries()];
  const phases = [...new Map(inPlan.filter((r) => r.phase).map((r) => [r.phase, r.phaseLabel || r.phase])).entries()];
  const set = (k, v) => { setF((o) => Object.assign({}, o, { [k]: v })); setMsg(""); };
  const names = peopleNames(...ownersIn(all));

  const toggle = (r, i, e) => {
    setSel((o) => {
      const n = new Set(o);
      if (e.shiftKey && last >= 0) { const [a, b] = [Math.min(last, i), Math.max(last, i)], on = !o.has(r.key); shown.slice(a, b + 1).forEach((x) => (on ? n.add(x.key) : n.delete(x.key))); }
      else if (n.has(r.key)) n.delete(r.key); else n.add(r.key);
      return n;
    });
    setLast(i);
  };
  const allOn = shown.length > 0 && chosen.length === shown.length;
  // Massamuutos koskee vain näkyviä valittuja rivejä. Muutos on peruttavissa, ja se jonotetaan suunnitelmittain.
  const apply = (change, what) => {
    const r = bulkPatches(chosen, change);
    if (r.error) { setMsg(r.error); return; }
    if (!r.patches.length) { setMsg("Valitut tehtävät ovat jo tällaisia."); return; }
    const back = invertPatches(chosen, r.patches);
    patchManyIn(r.patches);
    ui.undo = { label: "Muutettu " + r.patches.length + " tehtävää (" + what + ")", run: () => patchManyIn(back) };
    uiChanged();
    setMsg(r.patches.length + " tehtävää muutettu (" + what + ").");
  };
  const one = (r, data) => patchManyIn([{ planId: r.plan_id, id: r.id, data }]);
  const dirty = Object.keys(EMPTY).some((k) => f[k]);

  return html`<div class="wrap today taskspage">
    <header class="thead"><div><p class="eyebrow">Tehtävät</p><h1>Kaikki tehtävät</h1><p class="lede">${shown.length} / ${all.length} tehtävää</p></div>
      <p class="gs">Muokkaa tehtäviä suoraan riviltä tai valitse useita ja muuta vastuu, määräpäivä tai tila kerralla. Kursivoitu vastuu tulee vastuualueelta (saman työvirran omistaja), ja tavallinen on tehtävälle asetettu.</p></header>

    <div class="tfilters taskfilters">
      <input type="search" class="tsearch" placeholder="Hae tehtävää…" aria-label="Hae tehtävää" value=${f.q} onInput=${(e) => set("q", e.target.value)} />
      ${state.plans.length > 1 ? html`<label class="gyear">Suunnitelma <select value=${f.plan} onChange=${(e) => { set("plan", e.target.value); set("stream", ""); set("phase", ""); }}><option value="">Kaikki</option>${state.plans.map((p) => html`<option key=${p.id} value=${p.id}>${p.title}</option>`)}</select></label>` : null}
      <label class="gyear">Työvirta <select value=${f.stream} onChange=${(e) => set("stream", e.target.value)}><option value="">Kaikki</option>${streams.map(([id, l]) => html`<option key=${id} value=${id}>${l}</option>`)}</select></label>
      <label class="gyear">Vaihe <select value=${f.phase} onChange=${(e) => set("phase", e.target.value)}><option value="">Kaikki</option>${phases.map(([id, l]) => html`<option key=${id} value=${id}>${l}</option>`)}</select></label>
      <label class="gyear">Vastuu <select value=${f.owner} onChange=${(e) => set("owner", e.target.value)}><option value="">Kaikki</option><option value="__none">Ei vastuuhenkilöä</option>${ownersIn(all).map((o) => html`<option key=${o} value=${o}>${o}</option>`)}</select></label>
      <label class="gyear">Tila <select value=${f.status} onChange=${(e) => set("status", e.target.value)}><option value="">Kaikki</option>${Object.entries(STATUS_LABEL).map(([k, l]) => html`<option key=${k} value=${k}>${l}</option>`)}</select></label>
      <label class="gyear">Päivä <select value=${f.due} onChange=${(e) => set("due", e.target.value)}><option value="">Kaikki</option><option value="late">Myöhässä</option><option value="none">Ei määräpäivää</option></select></label>
      ${dirty ? html`<button type="button" class="linkbtn" onClick=${() => { setF(Object.assign({}, EMPTY)); setMsg(""); }}>Tyhjennä suodattimet</button>` : null}
    </div>

    ${chosen.length ? html`<div class="bulkbar" role="region" aria-label="Massamuutos">
      <b>${chosen.length} valittu</b>
      <span class="bulkgrp"><select aria-label="Uusi vastuu" value=${bOwner} onChange=${(e) => setBOwner(e.target.value)}><option value="">Vastuu…</option>${names.map((n) => html`<option key=${n} value=${n}>${n}</option>`)}<option value=${INHERIT}>Palauta vastuualueen mukaan</option></select>
        <button type="button" class="barbtn" disabled=${!bOwner} onClick=${() => apply({ owner: bOwner === INHERIT ? "" : bOwner }, bOwner === INHERIT ? "vastuu vastuualueen mukaan" : "vastuu " + bOwner)}>Aseta</button></span>
      <span class="bulkgrp"><input type="date" aria-label="Uusi määräpäivä" value=${bDue} onChange=${(e) => setBDue(e.target.value)} />
        <button type="button" class="barbtn" disabled=${!bDue} onClick=${() => apply({ due: bDue }, "määräpäivä")}>Aseta</button>
        <button type="button" class="barbtn" onClick=${() => apply({ due: "" }, "päivä tyhjennetty")}>Tyhjennä päivä</button></span>
      <span class="bulkgrp"><select aria-label="Uusi tila" value=${bStatus} onChange=${(e) => setBStatus(e.target.value)}><option value="">Tila…</option>${Object.entries(STATUS_LABEL).map(([k, l]) => html`<option key=${k} value=${k}>${l}</option>`)}</select>
        <button type="button" class="barbtn" disabled=${!bStatus} onClick=${() => apply({ status: bStatus }, "tila " + STATUS_LABEL[bStatus])}>Aseta</button></span>
      <button type="button" class="linkbtn" onClick=${() => { setSel(new Set()); setMsg(""); }}>Tyhjennä valinta</button>
    </div>` : null}
    ${msg ? html`<p class=${"gs" + (/virhe|Ei muutosta/i.test(msg) ? " bad" : "")} role="status">${msg}</p>` : null}

    ${shown.length ? html`<div class="gtable-wrap"><table class="gtable sctable taskstable">
      <thead><tr><th class="ckcol"><input type="checkbox" aria-label="Valitse kaikki näkyvät" checked=${allOn} onChange=${() => setSel(allOn ? new Set() : new Set(shown.map((r) => r.key)))} /></th>
        <th>Tehtävä</th><th>Työvirta</th><th>Vaihe</th><th>Vastuu</th><th>Määräpäivä</th><th>Tila</th></tr></thead>
      <tbody>${shown.map((r, i) => html`<tr key=${r.key} class=${sel.has(r.key) ? "picked" : ""}>
        <td class="ckcol"><input type="checkbox" aria-label=${"Valitse: " + (r.title || "tehtävä")} checked=${sel.has(r.key)} onClick=${(e) => toggle(r, i, e)} onChange=${() => {}} /></td>
        <td class="nmtd"><button type="button" class="ttitle" title="Avaa suunnitelmassa" onClick=${() => open(r.plan_id, { id: r.id, kind: "task", parent_id: r.parent_id })}>${r.title || "Nimetön tehtävä"}</button>${state.plans.length > 1 ? html`<span class="tsub">${r.planTitle}</span>` : null}</td>
        <td class="gs">${r.streamLabel || "–"}</td><td class="gs">${r.phaseLabel || "–"}</td>
        <td><span title=${r.owner ? "Asetettu tehtävälle" : r.effective ? "Vastuualueelta: " + (r.via || "") : ""}><${PersonSelect} cls=${"personsel" + (!r.owner && r.effective ? " inh" : "")} label=${"Vastuu: " + (r.title || "")} value=${r.owner} empty=${r.inherited || "Ei vastuuhenkilöä"} onPick=${(v) => one(r, { owner: v })} /></span></td>
        <td><input type="date" aria-label=${"Määräpäivä: " + (r.title || "")} value=${r.due} onChange=${(e) => one(r, { due: e.target.value })} /></td>
        <td><select aria-label=${"Tila: " + (r.title || "")} value=${r.status} onChange=${(e) => one(r, { status: e.target.value })}>${Object.entries(STATUS_LABEL).map(([k, l]) => html`<option key=${k} value=${k}>${l}</option>`)}</select></td>
      </tr>`)}</tbody></table></div>` : html`<p class="tclear">Ei tehtäviä näillä suodattimilla.</p>`}
  </div>`;
}
