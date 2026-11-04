import { html, Text, Tools, AddButton, Input, ui, useCollapse, Head, pressable, mq, FACE, MOODNAME, ORDER, nextIn, uiChanged, sortProps } from "../core/ui.js";
import { register } from "../core/registry.js";
import { children, findSection, patch, add } from "../core/store.js";
import { planParts, Task, phaseClass } from "./plan.js";
import { goalValues } from "./goals.js";

const CADS = ["viikko", "kuukausi", "kvartaali"];
export const roles = () => { const s = findSection("scorecards"); return s ? children(s.id, "role") : []; };
// Näkymän vaihto jättää selainhistoriaan merkinnän, jotta Takaisin palaa edelliseen näkymään. quiet = vastaus Takaisin-painikkeeseen.
export function showTab(id, quiet) {
  const changed = ui.tab !== id;
  ui.tab = id;
  try {
    localStorage.setItem("bcc-tab", id);
    if (!quiet) history[changed ? "pushState" : "replaceState"](null, "", id === "kokonaisuus" ? location.pathname + location.search : "#" + id);
  } catch (e) { /* ei pakollinen */ }
  document.body.classList.toggle("tab-role", id !== "kokonaisuus");
  uiChanged();
}

function View({ section }) {
  const { c, toggle } = useCollapse(section);
  const list = children(section.id, "role"), cad = children(section.id, "cadence");
  return html`<div class=${"modbody" + (c ? " is-collapsed" : "")}>
    <${Head} section=${section} c=${c} toggle=${toggle} />
    <div class="lead">
      ${list.map((r) => html`<article key=${r.id} class="lcard" title=${"Avaa " + r.data.title} ...${pressable(() => { showTab(r.id); scrollTo(0, 0); })} ...${sortProps(r, list, "role")}>
        <p class="role">${r.data.owner}</p><h3>${r.data.title}</h3>
        <ul>${children(r.id, "metric").map((m) => html`<li key=${m.id}>${m.data.name}</li>`)}</ul>
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

function MetricRow({ m, list }) {
  const v = m.data, name = v.name || "";
  const cyc = () => patch(m.id, { state: nextIn(ORDER, v.state) });
  const field = (f, lab) => html`<td><${Input} maxlength="30" placeholder="–" aria-label=${name + ": " + lab} value=${v[f] || ""}
    onChange=${(e) => patch(m.id, { [f]: e.target.value.trim().slice(0, 30) })} onKeyDown=${(e) => { if (e.key === "Enter") e.target.blur(); }} /></td>`;
  return html`<tr class=${v.state ? "m-" + v.state : ""}>
    <td class="nmtd"><div class="nmwrap"><${Input} class="nm" maxlength="80" aria-label="Mittarin nimi" value=${name} onChange=${(e) => patch(m.id, { name: e.target.value.trim().slice(0, 80) || "Uusi mittari" })} onKeyDown=${(e) => { if (e.key === "Enter") e.target.blur(); }} />
      <${Tools} item=${m} list=${list} label=${name} always=${true} /></div></td>
    <td class="cadtd"><select class="cadsel" aria-label="Rytmi" value=${v.cad} onChange=${(e) => patch(m.id, { cad: e.target.value })}>${CADS.map((c) => html`<option key=${c} value=${c}>${c}</option>`)}</select></td>
    ${field("base", "lähtötaso")}${field("target", "tavoite")}${field("actual", "toteuma")}
    <td class="st clickable" aria-label=${name + ": tila " + (MOODNAME[v.state] || "ei arviota")} ...${pressable(cyc)}>${v.state ? html`<span class="moodv" dangerouslySetInnerHTML=${{ __html: FACE[v.state] }}></span>` : html`<span class="st-empty">–</span>`}</td>
  </tr>`;
}

export function RolePanel({ id }) {
  const small = mq("(max-width: 900px)");
  const r = roles().find((x) => x.id === id); if (!r) return null;
  const parts = planParts(), metrics = children(r.id, "metric"), R = goalValues();
  let tot = 0, sc = 0;
  const cols = parts ? parts.phases.map((ph, i) => {
    const lst = parts.tasks.filter((t) => t.data.phase === ph.id && t.data.stream === r.data.stream);
    lst.forEach((t) => { tot++; sc += t.data.status === "done" ? 1 : t.data.status === "doing" ? 0.5 : 0; });
    return html`<div key=${ph.id} class="rp-col"><div class=${"rp-ph " + phaseClass(i, parts.phases.length)}><span class="d">${ph.data.label}</span><span class="t">${ph.data.title}</span></div>
      ${lst.length ? lst.map((t) => html`<${Task} key=${t.id} task=${t} list=${lst} parts=${parts} />`) : html`<p class="empty">Ei tehtäviä tässä vaiheessa.</p>`}</div>`;
  }) : [];
  return html`<section class="rolepanel">
    <div class="head" id="rp-head">
      <button type="button" class="backlink" onClick=${() => { showTab("kokonaisuus"); scrollTo(0, 0); }}>← Kokonaisuus</button>
      <p class="eyebrow">Scorecard · <${Text} item=${r} field="owner" cls="rp-owner" mode="always" max=${40} ph="Vastuuhenkilö" /></p>
      <${Text} item=${r} field="title" tag="h2" cls="rp-title" mode="always" max=${60} ph="Vastuualue" />
      <${Text} item=${r} field="mission" tag="p" cls="rp-mission" mode="always" max=${240} ph="Tehtävä" />
      ${ui.edit && parts ? html`<label class="gyear">Työvirta <select aria-label="Työvirta" value=${r.data.stream} onChange=${(e) => patch(r.id, { stream: e.target.value })}><option value="">Ei työvirtaa</option>${parts.streams.map((w) => html`<option key=${w.id} value=${w.id}>${w.data.label}</option>`)}</select></label>` : null}
    </div>
    <div class="gtable-wrap"><table class="gtable sctable">
      <thead><tr><th>Mittari</th><th>Rytmi</th><th>Lähtötaso</th><th>Tavoite ${R ? R.year : ""}</th><th>Toteuma</th><th>Tila</th></tr></thead>
      <tbody>${metrics.map((m) => html`<${MetricRow} key=${m.id} m=${m} list=${metrics} />`)}</tbody>
    </table></div>
    <button type="button" class="sc-add" onClick=${() => add("metric", r.id, { name: "Uusi mittari", cad: "kuukausi" })}>+ Lisää mittari</button>
    <p class="gs">Kirjoita luvut yksikköineen, esimerkiksi 92 % tai 3,0x. Tila vaihtuu klikkaamalla. Omia mittareita voi lisätä ja poistaa.</p>
    <div class="rp-tasks-head"><h3>Tehtävät</h3><span class="rp-prog num">${tot ? Math.round(100 * sc / tot) + " % valmis" : ""}</span></div>
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
