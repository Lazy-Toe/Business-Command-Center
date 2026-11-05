// Yksi muutosvalikko (Vastuu, Aloitus, Määräpäivä, Tila) kaikkiin paikkoihin: Tehtävät-taulukko ja Tänään-aikajana. Valinta on yksi klikkaus.
import { html, useState } from "../vendor/htm-preact.js";
import { ui, uiChanged } from "./core/ui.js";
import { patchManyIn } from "./core/store.js";
import { bulkPatches, invertPatches, suggestPatches, STATUS_LABEL } from "./core/tasks-table.js";
import { isSaneDue } from "./core/today.js";

// Muutos riveille yhtenä peruttavana eränä. Palauttaa muutettujen määrän tai virheen tekstin.
export function applyChange(change, what, rows) {
  const r = bulkPatches(rows, change);
  if (r.error) return { error: r.error };
  if (!r.patches.length) return { count: 0 };
  const back = invertPatches(rows, r.patches);
  patchManyIn(r.patches);
  ui.undo = { label: "Muutettu " + r.patches.length + " tehtävää (" + what + ")", run: () => patchManyIn(back) };
  uiChanged();
  return { count: r.patches.length };
}

const closeMenu = (e) => { const d = e.currentTarget.closest("details"); if (d) d.removeAttribute("open"); };

// Yksi muutosvalikko kaikkiin paikkoihin (sarakeotsikko, ryhmän otsikko, valintapalkki). Valinta toimii yhdellä klikkauksella ja koskee aina
// valikon kertomia rivejä (scope). up: aukeaa ylös (alapalkki), muuten alas.
export function FieldMenu({ field, title, rows, scope, names, periods, apply, applyPatches, up, cls, right }) {
  const run = (fn) => (e) => { fn(); closeMenu(e); };
  const go = (change, what) => run(() => apply(change, what, rows));
  const canSuggest = suggestPatches(rows).patches.length > 0;
  return html`<details class=${"fmenu " + (up ? "up " : "") + (right ? "right " : "") + (cls || "")}><summary>${title}</summary>
    <div class="fm-box"><p class="fm-scope">Koskee: <b>${scope}</b></p>
      ${field === "owner" ? html`<div class="bm-grid">${names.map((n) => html`<button type="button" key=${n} class="bm-btn" onClick=${go({ owner: n }, "vastuu " + n)}>${n}</button>`)}</div>
        ${canSuggest ? html`<button type="button" class="bm-btn wide" onClick=${run(() => applyPatches(suggestPatches(rows).patches, rows, "vastuualueen omistaja"))}>Vastuualueen omistaja (työvirran mukaan)</button>` : null}
        <button type="button" class="bm-btn wide quiet" onClick=${go({ owner: "" }, "vastuuhenkilö poistettu")}>Poista vastuuhenkilö</button>` : null}
      ${field === "start" ? html`<p class="bm-h">Viikko (alkaa maanantaina)</p>
        <div class="bm-grid months">${periods.weekStarts.map((p) => html`<button type="button" key=${p.value} class="bm-btn" onClick=${go({ start: p.value }, "aloitus " + p.label)}>${p.label}</button>`)}</div>
        <p class="bm-h">Kuukauden alku</p>
        <div class="bm-grid months">${periods.monthStarts.slice(0, 6).map((p) => html`<button type="button" key=${p.value} class="bm-btn" onClick=${go({ start: p.value }, "aloitus " + p.label)}>${p.label}</button>`)}</div>
        <p class="bm-h">Muu päivä</p>
        <${BulkDate} onApply=${(v) => apply({ start: v }, "aloituspäivä", rows)} />
        <button type="button" class="bm-btn wide quiet" onClick=${go({ start: "" }, "aloitus tyhjennetty")}>Tyhjennä aloitus</button>` : null}
      ${field === "due" ? html`<p class="bm-h">Viikko (päättyy sunnuntaina)</p>
        <div class="bm-grid months">${periods.weeks.slice(0, 6).map((p) => html`<button type="button" key=${p.value} class="bm-btn" onClick=${go({ due: p.value }, "määräpäivä " + p.label)}>${p.label}</button>`)}</div>
        <p class="bm-h">Kuukauden loppu</p>
        <div class="bm-grid months">${periods.months.slice(1, 7).map((p) => html`<button type="button" key=${p.value} class="bm-btn" onClick=${go({ due: p.value }, "määräpäivä " + p.label)}>${p.label}</button>`)}</div>
        <p class="bm-h">Neljänneksen loppu</p>
        <div class="bm-grid months">${periods.quarters.slice(0, 3).map((p) => html`<button type="button" key=${"q" + p.value} class="bm-btn" onClick=${go({ due: p.value }, "määräpäivä " + p.label)}>${p.label}</button>`)}</div>
        <p class="bm-h">Muu päivä</p>
        <${BulkDate} onApply=${(v) => apply({ due: v }, "määräpäivä", rows)} />
        <button type="button" class="bm-btn wide quiet" onClick=${go({ due: "" }, "päivä tyhjennetty")}>Tyhjennä päivä</button>` : null}
      ${field === "status" ? html`<div class="bm-grid">${Object.entries(STATUS_LABEL).map(([k, l]) => html`<button type="button" key=${k} class="bm-btn" onClick=${go({ status: k }, "tila " + l)}>${l}</button>`)}</div>` : null}
    </div></details>`;
}


// Massamuutoksen päivä otetaan käyttöön vasta painikkeesta, jotta kirjoitus kesken ei muuta valittuja tehtäviä.
export function BulkDate({ disabled, onApply }) {
  const [v, setV] = useState("");
  const ok = isSaneDue(v);
  const go = () => { if (ok) { onApply(v); setV(""); } };
  return html`<span class="bulkgrp"><input type="date" min="2000-01-01" max="2099-12-31" aria-label="Määräpäivä valituille" disabled=${disabled} value=${v} onInput=${(e) => setV(e.target.value)} onChange=${(e) => setV(e.target.value)} onKeyDown=${(e) => { if (e.key === "Enter") go(); }} />
    <button type="button" class="barbtn" disabled=${disabled || !ok} onClick=${go}>Aseta päivä</button></span>`;
}

