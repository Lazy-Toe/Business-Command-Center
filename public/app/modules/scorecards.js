import { html, Text, Tools, AddButton, Input, ui, useCollapse, Head, pressable, mq, uiChanged, sortProps, navigate, hooks } from "../core/ui.js";
import { register } from "../core/registry.js";
import { children, findSection, patch, add, all, state } from "../core/store.js";
import { FormPanel } from "../forms-ui.js";
import { rowsFor, orderDefs, freeRows, totals, periodText, roleStreams, hasStream, streamsPatch } from "../core/scorecard.js";
import { fmt } from "../core/calc.js";
import { PersonSelect, StreamChecks } from "../people.js";
import { planParts, Task, phaseClass } from "./plan.js";
import { goalValues } from "./goals.js";

const CADS = ["viikko", "kuukausi", "kvartaali"];
export const roles = () => { const s = findSection("scorecards"); return s ? children(s.id, "role") : []; };
// Näkymän vaihto jättää selainhistoriaan merkinnän, jotta Takaisin palaa edelliseen näkymään. quiet = vastaus Takaisin-painikkeeseen.
export function showTab(id, quiet) {
  ui.tab = id;
  try { localStorage.setItem("bcc-tab", id); } catch (e) { /* ei pakollinen */ }
  if (!quiet) navigate(id === "kokonaisuus" ? location.pathname + location.search : "#" + id);
  document.body.classList.toggle("tab-role", id !== "kokonaisuus" && ui.view === "plan");
  uiChanged();
}

function View({ section }) {
  const { c, toggle } = useCollapse(section);
  const list = children(section.id, "role"), cad = children(section.id, "cadence");
  return html`<div class=${"modbody" + (c ? " is-collapsed" : "")}>
    <${Head} section=${section} c=${c} toggle=${toggle} />
    <div class="lead">
      ${list.map((r) => html`<article key=${r.id} class="lcard" title=${"Avaa " + r.data.title} ...${pressable(() => { showTab(r.id); scrollTo(0, 0); })} ...${sortProps(r, list, "role")}>
        <p class="role">${r.data.owner}</p><h3>${r.data.title}</h3><${Final} t=${roleTotals(r)} />
        <ul>${roleMetricNames(r).map((n, i) => html`<li key=${i}>${n}</li>`)}</ul>
        <${Tools} item=${r} list=${list} label=${r.data.title} />
      </article>`)}
      <${AddButton} label="Vastuualue" onAdd=${() => add("role", section.id, { title: "Uusi vastuualue", owner: "", mission: "", stream: "" })} />
    </div>
    <div class="cadence">
      ${cad.map((x) => html`<div key=${x.id} ...${sortProps(x, cad, "cadence")}><${Text} item=${x} field="title" tag="b" ph="Rytmi" /><${Text} item=${x} field="text" ph="Mitä tehdään" /><${Tools} item=${x} list=${cad} label=${x.data.title} /></div>`)}
      <${AddButton} label="Rytmi" onAdd=${() => add("cadence", section.id, { title: "", text: "" })} />
    </div>
  </div>`;
}

// Roolin lopputulos: tavoiterivien painotettujen tulosten summa.
const roleTotals = (r) => totals(rowsFor(r, orderDefs(all("goal"), all("metricdef")), children(r.id, "metric")));
const Final = ({ t, big }) => (t.count ? html`<p class=${"final" + (big ? " big" : "")}>Lopputulos <b>${fmt(t.weighted, 3)}</b><span class="gs"> · painot yhteensä ${fmt(t.weight, 0)} %</span></p>` : null);

// Roolin tavoitteiden ja vapaiden mittarien nimet yleisnäkymän korttiin.
function roleMetricNames(r) {
  const own = children(r.id, "metric");
  return rowsFor(r, orderDefs(all("goal"), all("metricdef")), own).map((x) => x.def.data.name || "Nimetön").concat(freeRows(own).map((m) => m.data.name || ""));
}

// Vanha vapaa mittari ilman mallia: nimi, rytmi, lähtötaso, tavoite ja toteuma.
function MetricRow({ m, list }) {
  const v = m.data, name = v.name || "";
  const field = (f, lab) => html`<td><${Input} maxlength="30" placeholder="–" aria-label=${name + ": " + lab} value=${v[f] || ""}
    onChange=${(e) => patch(m.id, { [f]: e.target.value.trim().slice(0, 30) })} onKeyDown=${(e) => { if (e.key === "Enter") e.target.blur(); }} /></td>`;
  return html`<tr>
    <td class="nmtd"><div class="nmwrap"><${Input} class="nm" maxlength="80" aria-label="Mittarin nimi" value=${name} onChange=${(e) => patch(m.id, { name: e.target.value.trim().slice(0, 80) || "Uusi mittari" })} onKeyDown=${(e) => { if (e.key === "Enter") e.target.blur(); }} />
      <${Tools} item=${m} list=${list} label=${name} always=${true} /></div></td>
    <td class="cadtd"><select class="cadsel" aria-label="Rytmi" value=${v.cad} onChange=${(e) => patch(m.id, { cad: e.target.value })}>${CADS.map((c) => html`<option key=${c} value=${c}>${c}</option>`)}</select></td>
    ${field("base", "lähtötaso")}${field("target", "tavoite")}${field("actual", "toteuma")}
  </tr>`;
}

// Mallipohjainen tavoite: mallin arvot, lukitsemattomiin voi kirjoittaa oman arvon, toteuma kirjataan tähän. Tulos tulee kaavasta.
function GoalRow({ x, role }) {
  const { def, row, score } = x, d = def.data, lock = d.lock || {}, name = d.name || "Nimetön";
  // Tallentamaton rivi luodaan ensimmäisellä kirjauksella kiinteällä tunnisteella.
  const setF = (f, val) => (row.virtual ? add("metric", role.id, { def: def.id, [f]: val }, { id: row.id }) : patch(row.id, { [f]: val }));
  const cell = (f, lab) => lock[f] ? html`<td class="num lockedcell" title="Lukittu mallissa">${score[f] || "–"}</td>`
    : html`<td><${Input} maxlength="30" placeholder=${score[f] || "–"} aria-label=${name + ": " + lab} value=${row.data[f] || ""} onChange=${(e) => setF(f, e.target.value.trim().slice(0, 30))} onKeyDown=${(e) => { if (e.key === "Enter") e.target.blur(); }} /></td>`;
  return html`<tr class=${score.below ? "m-bad" : ""}>
    <td class="nmtd"><b>${name}</b>${x.auto ? null : html`<span class="gs"> · lisätty käsin</span>`}</td>
    <td class="gs">${periodText(score.start, score.end) || "–"}</td>
    ${cell("target", "tavoite")}${cell("min", "alaraja")}${cell("max", "yläraja")}
    <td><${Input} maxlength="30" placeholder="–" aria-label=${name + ": toteuma"} value=${row.data.actual || ""} onChange=${(e) => setF("actual", e.target.value.trim().slice(0, 30))} onKeyDown=${(e) => { if (e.key === "Enter") e.target.blur(); }} /></td>
    <td class="num" title=${score.error || ""}>${score.error ? "Kaavavirhe" : fmt(score.result, 2)}</td>
    ${cell("weight", "paino")}
    <td class="num">${fmt(score.weighted, 3)}</td>
    <td><button type="button" class="stbtn" title="Piilota tämä tavoite tältä vastuualueelta" aria-label=${"Piilota: " + name} onClick=${() => patch(role.id, { hide: (role.data.hide || []).concat(def.id) })}>×</button></td>
  </tr>`;
}

function GoalTable({ r }) {
  const defs = orderDefs(all("goal"), all("metricdef")), own = children(r.id, "metric");
  const list = rowsFor(r, defs, own), hide = r.data.hide || [], shown = new Set(list.map((x) => x.def.id));
  const extra = defs.filter((d) => !shown.has(d.id) && !hide.includes(d.id)), hidden = defs.filter((d) => hide.includes(d.id));
  const t = totals(list);
  if (!defs.length && !list.length) return null;
  return html`<div class="goaltable">
    <h3>Tavoitteet</h3>
    ${list.length ? html`<div class="gtable-wrap"><table class="gtable sctable">
      <thead><tr><th>Tavoite</th><th>Jakso</th><th>Tavoite</th><th>Alaraja</th><th>Yläraja</th><th>Toteuma</th><th>Tulos</th><th>Paino %</th><th>Painotettu</th><th></th></tr></thead>
      <tbody>${list.map((x) => html`<${GoalRow} key=${x.def.id} x=${x} role=${r} />`)}</tbody>
      ${t.count ? html`<tfoot><tr><td colspan="7"><b>Lopputulos</b></td><td class="num">${fmt(t.weight, 0)}</td><td class="num"><b>${fmt(t.weighted, 3)}</b></td><td></td></tr></tfoot>` : null}
    </table></div>` : html`<p class="gs">${roleStreams(r).length ? "Työvirran tavoitteita ei ole vielä määritelty Asetuksissa." : "Valitse vastuualueelle työvirta muokkaustilassa, niin työvirran tavoitteet tulevat tähän automaattisesti."}</p>`}
    ${extra.length ? html`<select class="cadsel" aria-label="Lisää tavoite" value="" onChange=${(e) => { if (e.target.value) add("metric", r.id, { def: e.target.value }); e.target.value = ""; }}><option value="">+ Lisää tavoite käsin…</option>${extra.map((d) => html`<option key=${d.id} value=${d.id}>${d.data.name || "Nimetön"}</option>`)}</select>` : null}
    ${hidden.length ? html`<p class="gs">Piilotettu: ${hidden.map((d) => html`<button type="button" class="linkbtn" key=${d.id} onClick=${() => patch(r.id, { hide: hide.filter((h) => h !== d.id) })}>${d.data.name || "Nimetön"} (näytä)</button> `)}</p>` : null}
  </div>`;
}

export function RolePanel({ id }) {
  const small = mq("(max-width: 900px)");
  const r = roles().find((x) => x.id === id); if (!r) return null;
  const parts = planParts(), metrics = freeRows(children(r.id, "metric")), R = goalValues();
  let tot = 0, sc = 0;
  const cols = parts ? parts.phases.map((ph, i) => {
    const lst = parts.tasks.filter((t) => t.data.phase === ph.id && hasStream(r, t.data.stream));
    lst.forEach((t) => { tot++; sc += t.data.status === "done" ? 1 : t.data.status === "doing" ? 0.5 : 0; });
    return html`<div key=${ph.id} class="rp-col"><div class=${"rp-ph " + phaseClass(i, parts.phases.length)}><span class="d">${ph.data.label}</span><span class="t">${ph.data.title}</span></div>
      ${lst.length ? lst.map((t) => html`<${Task} key=${t.id} task=${t} list=${lst} parts=${parts} />`) : html`<p class="empty">Ei tehtäviä tässä vaiheessa.</p>`}</div>`;
  }) : [];
  return html`<section class="rolepanel">
    <div class="head" id="rp-head">
      <button type="button" class="backlink" onClick=${() => { showTab("kokonaisuus"); scrollTo(0, 0); }}>← Kokonaisuus</button>
      <p class="eyebrow">Scorecard · <${PersonSelect} cls="ownersel" canAdd=${true} label="Vastuuhenkilö" value=${r.data.owner || ""} onPick=${(v) => patch(r.id, { owner: v })} /></p>
      <${Text} item=${r} field="title" tag="h2" cls="rp-title" mode="always" max=${60} ph="Vastuualue" />
      <${Text} item=${r} field="mission" tag="p" cls="rp-mission" mode="always" max=${240} ph="Tehtävä" />
      <${Final} t=${roleTotals(r)} big=${true} />
      ${ui.edit && parts ? html`<div class="gyear">Työvirrat <${StreamChecks} streams=${parts.streams} value=${roleStreams(r)} label=${"Työvirrat: " + (r.data.title || "")} onChange=${(v) => patch(r.id, streamsPatch(v))} /></div>` : null}
    </div>
    <${GoalTable} r=${r} />
    <${FormPanel} planId=${state.planId} role=${r} effective=${rowsFor(r, orderDefs(all("goal"), all("metricdef")), children(r.id, "metric"))} forms=${all("form")} types=${all("formtype")} viewer=${{ admin: true, person: state.people.me }} canApply=${true} />
    <h3>Omat mittarit</h3>
    ${metrics.length ? html`<div class="gtable-wrap"><table class="gtable sctable">
      <thead><tr><th>Mittari</th><th>Rytmi</th><th>Lähtötaso</th><th>Tavoite ${R ? R.year : ""}</th><th>Toteuma</th></tr></thead>
      <tbody>${metrics.map((m) => html`<${MetricRow} key=${m.id} m=${m} list=${metrics} />`)}</tbody>
    </table></div>` : null}
    <button type="button" class="sc-add" onClick=${() => add("metric", r.id, { name: "Uusi mittari", cad: "kuukausi" })}>+ Lisää oma mittari</button>
    <p class="gs">Tavoitteet määritellään Asetuksissa. Omiin mittareihin kirjoitetaan luvut yksikköineen, esimerkiksi 92 % tai 3,0x.</p>
    <div class="rp-tasks-head"><h3>Tehtävät</h3><button type="button" class="linkbtn" onClick=${() => hooks.openTasks && hooks.openTasks(roleStreams(r).length ? { plan: state.planId, stream: roleStreams(r) } : { plan: state.planId, owner: r.data.owner || "" })}>Muokkaa massana taulukossa</button><span class="rp-prog num">${tot ? Math.round(100 * sc / tot) + " % valmis" : ""}</span></div>
    <div class="rp-tasks" style=${{ gridTemplateColumns: parts && !small ? "repeat(" + Math.max(parts.phases.length, 1) + ", minmax(0, 1fr))" : undefined }}>${cols}</div>
  </section>`;
}

register({
  type: "scorecards", label: "Johtamismalli", hint: "Vastuualueet, scorecardit ja johtamisen rytmi", single: true,
  create: () => ({
    data: { eyebrow: "Johtamismalli", title: "Scorecard jokaiselle vastuualueelle", intro: "" },
    children: [{ kind: "role", data: { title: "Vastuualue", owner: "", mission: "", stream: "" } }, { kind: "cadence", data: { title: "Viikko", text: "" } }, { kind: "cadence", data: { title: "Kuukausi", text: "" } }, { kind: "cadence", data: { title: "Kvartaali", text: "" } }]
  }),
  View
});
