import { html, Text, Tools, AddButton, Input, ui, useCollapse } from "../core/ui.js";
import { register } from "../core/registry.js";
import { children, patch, add, findSection } from "../core/store.js";
import { calcGoals, cleanNum, fmt, auto, num } from "../core/calc.js";
import { useState } from "../../vendor/htm-preact.js";

export function goalsInput(section, override) {
  const lines = children(section.id, "line").map((l) => Object.assign({ id: l.id }, l.data, override && override[l.id]));
  return Object.assign({}, section.data, override && override[section.id], { lines });
}
export function goalValues() {
  const s = findSection("goals");
  return s ? calcGoals(goalsInput(s)) : null;
}

function Num({ item, field, label, ph, setDraft, msg, cls, validate }) {
  const v = item.data[field] == null ? "" : String(item.data[field]);
  const shown = field === "targetYear" || field === "baseYear" ? v : v.replace(".", ",");
  const live = (raw) => { const c = validate ? validate(raw) : cleanNum(raw); setDraft(item.id, field, c === null ? undefined : c); };
  return html`<${Input} class=${cls} inputmode="decimal" aria-label=${label} placeholder=${ph || "–"} value=${shown}
    onInput=${(e) => live(e.target.value)}
    onKeyDown=${(e) => { if (e.key === "Enter") e.target.blur(); }}
    onChange=${(e) => {
      const c = validate ? validate(e.target.value) : cleanNum(e.target.value);
      setDraft(item.id, field, undefined);
      if (c === null) { msg("Anna luku, esimerkiksi 12 tai 12,5.", true); e.target.value = shown; return; }
      if (c !== v) { patch(item.id, { [field]: c }); msg("Tallentuu automaattisesti."); }
    }} />`;
}
const yearOk = (base) => (raw) => { const v = String(raw).trim(); if (!v) return ""; return /^20\d\d$/.test(v) && +v > base ? v : null; };

function View({ section }) {
  const s = section, d = s.data;
  const [draft, setD] = useState({});
  const [note, setNote] = useState(["Klikkaa lukua muokataksesi. Tallentuu, kun poistut kentästä.", false]);
  const { c, toggle } = useCollapse(s);
  const lines = children(s.id, "line");
  const setDraft = (id, f, v) => setD((old) => { const n = Object.assign({}, old), x = Object.assign({}, n[id]); if (v === undefined) delete x[f]; else x[f] = v; n[id] = x; return n; });
  const msg = (t, bad) => setNote([t, !!bad]);
  const R = calcGoals(goalsInput(s, draft));
  const unit = d.unit || "M€", rev = d.revName || "Liikevaihto", pt = R.est ? "≈ " : "";
  const r40 = R.r40;
  const r40cls = r40 ? (r40.sum >= 40 ? "ok" : r40.sum >= 20 ? "low" : "bad") : "";
  const kpis = [["cust", "custLabel"], ["arr", "arrLabel"], ["churn", "churnLabel"], ["nrr", "nrrLabel"]];
  const first = lines[0];
  const years = d.projYears || [];
  const P = { setDraft, msg };
  return html`<div class=${"modbody" + (c ? " is-collapsed" : "")}>
    <div class="ghead keep">
      <div class="head">
        <${Text} item=${s} field="eyebrow" tag="p" cls="eyebrow" ph="Yläotsikko" />
        ${ui.edit ? html`<${Text} item=${s} field="title" tag="h2" ph="Otsikko" />` : html`<h2><button type="button" class="ctog" aria-expanded=${c ? "false" : "true"} title=${c ? "Näytä osio" : "Piilota osio"} onClick=${toggle}>${d.title}<span class="chev" aria-hidden="true"></span></button></h2>`}
        <${Text} item=${s} field="intro" tag="p" multi=${true} ph="Johdanto" />
      </div>
      <div class="gright">
        ${ui.edit ? html`<label class="gyear">Perusvuosi <${Num} item=${s} field="baseYear" label="Perusvuosi" ph="2026" ...${P} validate=${(raw) => { const v = String(raw).trim(); return /^20\d\d$/.test(v) ? v : null; }} /></label>
        <label class="gyear">Yksikkö <${Input} aria-label="Yksikkö" value=${unit} onChange=${(e) => patch(s.id, { unit: e.target.value.trim().slice(0, 8) })} /></label>` : null}
        <label class="gyear">Tavoitevuosi <${Num} item=${s} field="targetYear" label="Tavoitevuosi" ph=${String(R.baseYear + 1)} ...${P} validate=${yearOk(R.baseYear)} /></label>
        <p class="r40" title="Kasvu-% + käyttökate-%. Vihreä 40 tai yli: terve. Keltainen 20–39: kehitettävää. Punainen alle 20: heikko."><${Text} item=${s} field="r40Label" ph="Rule of 40" /> <span class="r40f">kasvu-% + käyttökate-%</span> <b class=${r40cls}>${r40 ? auto(r40.g) + " + " + auto(r40.m) + " = " + auto(r40.sum) : "–"}</b></p>
      </div>
    </div>
    <div class="gtable-wrap"><table class="gtable">
      <thead><tr><th><${Text} item=${s} field="lineHead" ph="Rivi" /></th><th>${rev} ${R.baseYear}, ${unit}</th><th>Kasvu, % / v</th><th>${rev} ${R.year}, ${unit}</th><th>Käyttökate (EBITDA), %</th><th>Käyttökate, ${unit}</th>${ui.edit ? html`<th>Osuus arviossa</th>` : null}</tr></thead>
      <tbody>${lines.map((l) => {
        const o = R.lines[l.id], pe = o.est ? "≈ " : "";
        return html`<tr key=${l.id}>
          <td><${Text} item=${l} field="name" ph="Nimi" /><${Tools} item=${l} list=${lines} label=${l.data.name} /></td>
          <td><${Num} item=${l} field="rev" label=${l.data.name + ", " + rev} ph=${"≈ " + fmt(o.base, 2)} ...${P} /></td>
          <td><${Num} item=${l} field="g" label=${l.data.name + ", kasvu"} ...${P} /></td>
          <td class="calc">${o.target != null ? pe + fmt(o.target, 2) : "–"}</td>
          <td><${Num} item=${l} field="m" label=${l.data.name + ", käyttökate"} ...${P} /></td>
          <td class="calc">${o.ebitda != null ? pe + fmt(o.ebitda, 2) : "–"}</td>
          ${ui.edit ? html`<td><${Num} item=${l} field="share" label=${l.data.name + ", osuus"} ...${P} /></td>` : null}
        </tr>`;
      })}</tbody>
      <tfoot><tr><th><${Text} item=${s} field="totalName" ph="Yhteensä" /></th>
        <td><${Num} item=${s} field="totRev" label="Yhteensä, liikevaihto" ph=${"≈ " + fmt(R.totBase, 2)} ...${P} /></td>
        <td class="calc">${R.totGrowth != null ? pt + fmt(R.totGrowth, 1) : "–"}</td>
        <td class="calc">${R.totTarget != null ? pt + fmt(R.totTarget, 2) : "–"}</td>
        <td class="calc">${R.totMargin != null ? pt + fmt(R.totMargin, 1) : "–"}</td>
        <td class="calc">${R.totEbitda != null ? pt + fmt(R.totEbitda, 2) : "–"}</td>
        ${ui.edit ? html`<td></td>` : null}</tr></tfoot>
    </table></div>
    ${ui.edit ? html`<div class="editrow"><${AddButton} label="Rivi" cls="small" onAdd=${() => add("line", s.id, { name: "Uusi rivi", share: "1" })} />
      <label class="gyear">Arvioitu kokonaisuus, ${unit} <${Num} item=${s} field="estTotal" label="Arvioitu kokonaisuus" ...${P} /></label>
      <label class="gyear">Ennustevuodet <${Input} aria-label="Ennustevuodet" value=${years.join(", ")} onChange=${(e) => { const ys = e.target.value.split(/[\s,;]+/).map(Number).filter((y) => y >= 2000 && y < 2100).slice(0, 8); patch(s.id, { projYears: ys }); }} /></label></div>` : null}
    <${Text} item=${s} field="note1" tag="p" cls="gs" multi=${true} ph="Huomautus" />
    <div class="gpair">
      <div class="gtable-wrap"><table class="gtable htable">
        <thead><tr><th><${Text} item=${s} field="kpiHead" ph="Otsikko" /></th><th class="tcol">Tavoite ${R.year}</th></tr></thead>
        <tbody>${kpis.map(([k, lab]) => html`<tr key=${k}><td><${Text} item=${s} field=${lab} ph="Mittari" /></td><td class="tcol">${k === "arr"
          ? (first ? html`<${Num} item=${first} field="arr" label=${"Tavoite: " + d[lab]} ...${P} />` : null)
          : html`<${Num} item=${s} field=${k} label=${"Tavoite: " + d[lab]} ...${P} />`}</td></tr>`)}</tbody>
      </table></div>
      <div class="gtable-wrap"><table class="gtable ptable">
        <thead><tr><th><${Text} item=${s} field="projHead" ph="Otsikko" /></th>${R.proj.map((p) => html`<th key=${p.year}>${p.year}</th>`)}</tr></thead>
        <tbody>
          ${lines.map((l) => html`<tr key=${l.id}><td>${l.data.name}, ${unit}</td>${R.proj.map((p) => html`<td key=${p.year} class="calc">${p.lines[l.id] != null ? (R.lines[l.id].est ? "≈ " : "") + fmt(p.lines[l.id], 2) : "–"}</td>`)}</tr>`)}
          <tr class="ptot"><td>${d.totalName}, ${unit}</td>${R.proj.map((p) => html`<td key=${p.year} class="calc">${p.tot != null ? (p.est ? "≈ " : "") + fmt(p.tot, 2) : "–"}</td>`)}</tr>
          <tr><td><${Text} item=${s} field="projNrr" ph="Nykyasiakkaat" />, ${unit}</td>${R.proj.map((p) => html`<td key=${p.year} class="calc">${p.nrr != null ? (first && R.lines[first.id].est ? "≈ " : "") + fmt(p.nrr, 2) : "–"}</td>`)}</tr>
          <tr><td><${Text} item=${s} field="projCust" ph="Asiakasmäärä" /></td>${R.proj.map((p) => html`<td key=${p.year} class="calc">${p.cust != null ? fmt(p.cust, 0) : "–"}</td>`)}</tr>
        </tbody>
      </table></div>
    </div>
    <${Text} item=${s} field="note2" tag="p" cls="gs" multi=${true} ph="Huomautus" />
    <p class=${"gsave" + (note[1] ? " bad" : "")} role="status">${note[0]}</p>
  </div>`;
}

const Y = new Date().getFullYear();
register({
  type: "goals", label: "Kasvutavoitteet", hint: "Liikevaihto, kate, Rule of 40 ja ennuste", single: true,
  create: () => ({
    data: { eyebrow: "Tavoitetaso", title: "Kasvutavoitteet", intro: "", baseYear: String(Y), targetYear: String(Y + 1), unit: "M€", revName: "Liikevaihto", lineHead: "Liiketoimintalinja", totalName: "Yhteensä", kpiHead: "Asiakkaat ja pito", custLabel: "Asiakasmäärän kasvu, % / v", arrLabel: "Toistuva osuus liikevaihdosta, %", churnLabel: "Churn, % toistuvasta", nrrLabel: "Nettopito, %", projHead: "Jos tahti pysyy", projYears: [Y + 1, Y + 2, Y + 3], projNrr: "Nykyasiakkaiden liikevaihto", projCust: "Asiakasmäärä, indeksi", r40Label: "Rule of 40", note1: "", note2: "" },
    children: [{ kind: "line", data: { name: "Liiketoiminta", share: "1" } }]
  }),
  View
});
