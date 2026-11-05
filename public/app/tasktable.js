// Tehtävätaulukko ja massamuutos: yhteinen Tehtävät- ja Tänään-näkymälle. Rivin arvon klikkaus muokkaa vain sitä riviä, sarakeotsikon "Kaikille" valittuja
// tai kaikkia näkyviä rivejä, ryhmän otsikko ryhmää ja valintapalkki valittuja. Kaikki kulkee `FieldMenu`n kautta ja on peruttavissa.
import { html, useState } from "../vendor/htm-preact.js";
import { ui, uiChanged } from "./core/ui.js";
import { state, patchManyIn } from "./core/store.js";
import { invertPatches, bulkPatches, suggestPatches, catalogOf, ownersIn, periodOptions, STATUS_LABEL } from "./core/tasks-table.js";
import { fmtDue, fmtStart } from "./core/today.js";
import { peopleNames } from "./people.js";
import { FieldMenu } from "./fieldmenu.js";

export const COLS = [["stream", "Työvirta"], ["phase", "Vaihe"], ["owner", "Vastuu"], ["start", "Aloitus"], ["due", "Lopetus"], ["status", "Tila"]];

// Valittujen rivien toimintopalkki: näkyy vain kun rivejä on valittu.
function BulkBar({ count, cols, menu, clear }) {
  return html`<div class="bulkbar" role="region" aria-label="Massamuutos">
    <b class="bb-count">${count} valittu</b>
    ${cols.map(([k, l]) => html`<${FieldMenu} key=${k} ...${menu(k, l)} up=${true} cls="bb" />`)}
    <span class="grow"></span>
    <button type="button" class="bb-clear" onClick=${clear}>Poista valinta</button>
  </div>`;
}

// groups: [{ key, label, rows }] (ilman ryhmittelyä yksi ryhmä), by: ryhmittelyn avain (tyhjä = ei ryhmäotsikoita), allRows: kaikki rivit vastuuhenkilölistaa varten,
// items: koostenäkymän rivit (työvirta- ja vaihevalinnat), cols: näkyvät sarakkeet, hint: ohjeteksti taulukon yläpuolella.
export function TaskTable({ groups, by, allRows, items, cols = COLS, open, hint, today, emptyText }) {
  const [sel, setSel] = useState(() => new Set());
  const [last, setLast] = useState(-1);
  const [msg, setMsg] = useState("");
  const has = (k) => cols.some(([x]) => x === k);
  const shown = groups.flatMap((g) => g.rows), chosen = shown.filter((r) => sel.has(r.key)), periods = periodOptions(today);
  const names = peopleNames(...ownersIn(allRows));
  const pick = (g) => (g.rows.every((r) => sel.has(r.key)) ? setSel((o) => { const n = new Set(o); g.rows.forEach((r) => n.delete(r.key)); return n; }) : setSel((o) => { const n = new Set(o); g.rows.forEach((r) => n.add(r.key)); return n; }));
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
  // Massamuutos koskee vain annettuja rivejä. Muutos on peruttavissa.
  const apply = (change, what, rows = chosen) => {
    const r = bulkPatches(rows, change);
    if (r.error) { setMsg(r.error); return; }
    if (!r.patches.length) { setMsg("Valitut tehtävät ovat jo tällaisia."); return; }
    const back = invertPatches(rows, r.patches);
    patchManyIn(r.patches);
    ui.undo = { label: "Muutettu " + r.patches.length + " tehtävää (" + what + ")", run: () => patchManyIn(back) };
    uiChanged();
    setMsg(r.patches.length + " tehtävää muutettu (" + what + ").");
  };
  // Valmiit muutokset (riville ominaiset arvot) kirjataan yhtenä peruttavana eränä.
  const applyPatches = (patches, rows, what) => {
    if (!patches.length) { setMsg("Ei kirjattavia muutoksia."); return; }
    const back = invertPatches(rows, patches);
    patchManyIn(patches);
    ui.undo = { label: "Muutettu " + patches.length + " tehtävää (" + what + ")", run: () => patchManyIn(back) };
    uiChanged();
    setMsg(patches.length + " tehtävää muutettu (" + what + ").");
  };
  const unowned = shown.filter((r) => !r.owner), fillable = suggestPatches(unowned).patches.length;
  const catalog = { stream: catalogOf(items, "stream"), phase: catalogOf(items, "phase") };
  const menuFor = (rows, scope) => (field, title) => ({ field, title, rows, scope, names, periods, apply, applyPatches, catalog });
  // Otsikon valikko koskee valittuja rivejä tai, jos mitään ei ole valittu, kaikkia näkyviä rivejä.
  const scopeRows = chosen.length ? chosen : shown;
  const scopeText = chosen.length ? chosen.length + " valittua tehtävää" : "kaikkia " + shown.length + " näkyvää tehtävää";
  const cellMenu = (r, field, text) => menuFor([r], "vain tätä tehtävää")(field, text + " ▾");
  return html`<div>
    ${chosen.length ? null : html`<p class="gs bulkhint">${hint}</p>`}
    ${unowned.length ? html`<p class="gs unownedbar" role="status">${unowned.length} näkyvällä tehtävällä ei ole vastuuhenkilöä, eikä niitä näytetä kenenkään työpöydällä.${fillable ? html` <button type="button" class="barbtn" onClick=${() => applyPatches(suggestPatches(unowned).patches, unowned, "vastuualueen omistaja")}>Kirjaa vastuualueen omistaja (${fillable})</button>` : null}</p>` : null}
    ${msg ? html`<p class=${"gs" + (/virhe|Ei muutosta/i.test(msg) ? " bad" : "")} role="status">${msg}</p>` : null}
    ${shown.length ? html`<div class="gtable-wrap"><table class="gtable sctable taskstable">
      <thead><tr><th class="ckcol"><input type="checkbox" aria-label="Valitse kaikki näkyvät" checked=${allOn} onChange=${() => setSel(allOn ? new Set() : new Set(shown.map((r) => r.key)))} /></th>
        <th>Tehtävä</th>${cols.map(([k, l], ci) => html`<th key=${k}>${l}<${FieldMenu} ...${menuFor(scopeRows, scopeText)(k, "Kaikille ▾")} cls="hd" right=${ci >= 3} /></th>`)}</tr></thead>
      ${groups.map((g) => html`<tbody key=${"g" + g.key}>${by ? html`<tr class="grouprow"><td class="ckcol"><input type="checkbox" aria-label=${"Valitse ryhmä: " + g.label} checked=${g.rows.every((r) => sel.has(r.key))} onChange=${() => pick(g)} /></td><th colspan=${1 + cols.length} scope="colgroup"><span class="grouphead">${g.label} <span class="gs">${g.rows.length} tehtävää${g.rows.filter((r) => r.status === "done").length ? ", " + g.rows.filter((r) => r.status === "done").length + " valmista" : ""}</span><span class="gmenus">Muuta ryhmälle: ${cols.map(([k, l]) => html`<${FieldMenu} key=${k} ...${menuFor(g.rows, "ryhmän " + g.rows.length + " tehtävää")(k, l + " ▾")} cls="gr" />`)}</span></th></tr>` : null}${g.rows.map((r) => { const i = shown.indexOf(r); return html`<tr key=${r.key} class=${sel.has(r.key) ? "picked" : ""}>
        <td class="ckcol"><input type="checkbox" aria-label=${"Valitse: " + (r.title || "tehtävä")} checked=${sel.has(r.key)} onClick=${(e) => toggle(r, i, e)} onChange=${() => {}} /></td>
        <td class="nmtd"><button type="button" class="ttitle" title="Avaa suunnitelmassa" onClick=${() => open(r.plan_id, { id: r.id, kind: "task", parent_id: r.parent_id })}>${r.title || "Nimetön tehtävä"}</button>${state.plans.length > 1 ? html`<span class="tsub">${r.planTitle}</span>` : null}</td>
        ${has("stream") ? html`<td><${FieldMenu} ...${cellMenu(r, "stream", r.streamLabel || "Ei työvirtaa")} cls=${"cell" + (r.streamLabel ? "" : " none")} /></td>` : null}
        ${has("phase") ? html`<td><${FieldMenu} ...${cellMenu(r, "phase", r.phaseLabel || "Ei vaihetta")} cls=${"cell" + (r.phaseLabel ? "" : " none")} /></td>` : null}
        ${has("owner") ? html`<td><${FieldMenu} ...${cellMenu(r, "owner", r.owner || "Ei vastuuhenkilöä")} cls=${"cell" + (r.owner ? "" : " none")} /></td>` : null}
        ${has("start") ? html`<td><${FieldMenu} ...${cellMenu(r, "start", r.start ? fmtStart(r.start) : "Ei aloitusta")} cls=${"cell" + (r.start ? "" : " none")} /></td>` : null}
        ${has("due") ? html`<td><${FieldMenu} ...${cellMenu(r, "due", r.due ? fmtDue(r.due) : "Ei päivää")} cls=${"cell" + (r.due ? "" : " none")} right=${true} /></td>` : null}
        ${has("status") ? html`<td><${FieldMenu} ...${cellMenu(r, "status", STATUS_LABEL[r.status])} cls=${"cell st-" + r.status} right=${true} /></td>` : null}
      </tr>`; })}</tbody>`)}</table></div>` : html`<p class="tclear">${emptyText || "Ei tehtäviä."}</p>`}
    ${chosen.length ? html`<${BulkBar} count=${chosen.length} cols=${cols} menu=${menuFor(chosen, chosen.length + " valittua tehtävää")} clear=${() => { setSel(new Set()); setMsg(""); }} />` : null}
  </div>`;
}
