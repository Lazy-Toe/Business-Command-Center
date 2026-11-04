// Asetukset: yhteiset tavoitteet ja mittarimallit. Malli kuuluu työvirtaan, ja saman työvirran vastuualueille tavoite tulee automaattisesti.
import { html, useState } from "../../vendor/htm-preact.js";
import { Text, Tools, AddButton, Input, ui, useEscape } from "../core/ui.js";
import { state, all, children, add, patch, remove } from "../core/store.js";
import { compile, DEFAULT_FORMULA, FORMULA_PRESETS, FUNCTION_NAMES } from "../core/formula.js";
import { LOCKABLE, PERIODS, periodPreset, periodText, scoreRow, toNumber, recipientsOf } from "../core/scorecard.js";
import { fmt } from "../core/calc.js";
import { sortTypes } from "../core/forms.js";
import { PaySettings } from "./settings-pay.js";

const FIELD_LABEL = { target: "Tavoite", min: "Alaraja", max: "Yläraja", weight: "Paino %", start: "Alkupäivä", end: "Loppupäivä" };
const streamsOf = () => all("stream");
const streamName = (id) => { const s = streamsOf().find((x) => x.id === id); return s ? s.data.label : ""; };

// Mittarimallin muokkaus. Muutokset tallentuvat Tallenna-painikkeella, ja virheellinen kaava estää tallennuksen.
function DefEditor({ def, onClose }) {
  const d = def.data;
  const [v, setV] = useState({ name: d.name || "", stream: d.stream || "", start: d.start || "", end: d.end || "", target: d.target || "", min: d.min || "", max: d.max || "", weight: d.weight || "", formula: d.formula || DEFAULT_FORMULA, lock: Object.assign({}, d.lock) });
  const [goal, setGoal] = useState(def.parent_id || "");
  const [picked, setPicked] = useState(Array.isArray(d.roles) ? d.roles : []);
  const allRoles = all("role");
  const [year, setYear] = useState(String((d.start || "").slice(0, 4) || new Date().getFullYear()));
  const [sample, setSample] = useState("");
  useEscape(onClose);
  const set = (k, x) => setV((o) => Object.assign({}, o, { [k]: x }));
  const goals = all("goal");
  const c = compile(v.formula);
  const demo = c.ok ? c.run({ TARGET: toNumber(v.target), RANGE_MIN: toNumber(v.min), RANGE_MAX: toNumber(v.max), ACTUAL: toNumber(sample === "" ? v.target : sample) }) : null;
  const save = () => {
    if (!c.ok || !v.name.trim()) return;
    const data = Object.assign({}, v, { name: v.name.trim().slice(0, 120) });
    const lock = {}; LOCKABLE.forEach((k) => { if (v.lock[k]) lock[k] = true; });
    patch(def.id, Object.assign(data, { lock, roles: picked.filter((id) => allRoles.some((r) => r.id === id)) }), goal !== def.parent_id ? { parent_id: goal } : undefined);
    onClose();
  };
  const field = (k) => html`<div class="mfrow"><label for=${"f-" + k}>${FIELD_LABEL[k]}</label>
    ${k === "start" || k === "end" ? html`<input id=${"f-" + k} type="date" value=${v[k]} onChange=${(e) => set(k, e.target.value)} />` : html`<${Input} id=${"f-" + k} maxlength="30" value=${v[k]} onChange=${(e) => set(k, e.target.value.trim())} />`}
    <label class="mflock"><input type="checkbox" checked=${!!v.lock[k]} onChange=${(e) => set("lock", Object.assign({}, v.lock, { [k]: e.target.checked }))} /> Lukittu</label></div>`;
  return html`<div class="histback" onClick=${onClose}>
    <div class="hist mform" role="dialog" aria-modal="true" aria-label="Mittari" onClick=${(e) => e.stopPropagation()}>
      <div class="hhead"><h2>Mittari</h2><button type="button" class="barbtn" onClick=${onClose}>Sulje</button></div>
      <div class="mfrow"><label for="f-goal">Yhteinen tavoite</label><select id="f-goal" value=${goal} onChange=${(e) => setGoal(e.target.value)}>${goals.map((g) => html`<option key=${g.id} value=${g.id}>${g.data.name || "Nimetön"}</option>`)}</select></div>
      <div class="mfrow"><label for="f-name">Nimi</label><${Input} id="f-name" maxlength="120" value=${v.name} onChange=${(e) => set("name", e.target.value)} /></div>
      <div class="mfrow"><label for="f-stream">Työvirta</label>
        <select id="f-stream" value=${v.stream} onChange=${(e) => set("stream", e.target.value)}><option value="">Ei työvirtaa (lisätään käsin)</option>${streamsOf().map((s) => html`<option key=${s.id} value=${s.id}>${s.data.label}</option>`)}</select>
        <span class="gs">Tavoite tulee automaattisesti tämän työvirran vastuualueille.</span></div>
      <div class="mfrow"><label>Vastuualueet</label>
        <span class="gs">Tulee kaikille vastuualueille, joilla on yllä oleva työvirta, sekä alla valituille.</span>
        <div class="rolepick">${allRoles.length ? allRoles.map((r) => html`<label key=${r.id} class="rolechk"><input type="checkbox" checked=${picked.includes(r.id)} onChange=${(e) => setPicked((o) => (e.target.checked ? o.concat(r.id) : o.filter((x) => x !== r.id)))} /> ${r.data.title || "Vastuualue"}${r.data.owner ? html`<span class="gs"> · ${r.data.owner}</span>` : null}${v.stream && r.data.stream === v.stream ? html`<span class="gs"> (työvirran kautta)</span>` : null}</label>`) : html`<span class="gs">Suunnitelmassa ei ole vastuualueita.</span>`}</div>
        <span class="gs">Tulee nyt: <b>${(() => { const to = recipientsOf({ id: def.id, data: { stream: v.stream, roles: picked } }, allRoles, all("metric")); return to.length ? to.map((x) => x.role.data.title || "Vastuualue").join(", ") : "ei kenellekään"; })()}</b></span></div>
      <div class="mfrow"><label for="f-period">Jakso</label>
        <span class="mfinline"><select id="f-period" aria-label="Valmis jakso" value="" onChange=${(e) => { const p = periodPreset(e.target.value, year); if (p) setV((o) => Object.assign({}, o, p)); e.target.value = ""; }}><option value="">Valitse jakso…</option>${PERIODS.map(([k, l]) => html`<option key=${k} value=${k}>${l}</option>`)}</select>
        <${Input} aria-label="Vuosi" maxlength="4" value=${year} onChange=${(e) => setYear(e.target.value.trim())} /></span></div>
      ${["start", "end", "target", "min", "max", "weight"].map(field)}
      <div class="mfrow"><label for="f-formula">Laskentakaava</label>
        <span class="mfinline"><select aria-label="Valmis kaava" value="" onChange=${(e) => { if (e.target.value) set("formula", e.target.value); e.target.value = ""; }}><option value="">Valmis kaava…</option>${FORMULA_PRESETS.map((p) => html`<option key=${p.label} value=${p.formula}>${p.label}</option>`)}</select></span>
        <textarea id="f-formula" rows="2" maxlength="200" spellcheck=${false} value=${v.formula} onInput=${(e) => set("formula", e.target.value)}></textarea>
        <span class=${"gs" + (c.ok ? "" : " bad")} role="status">${c.ok ? "Kaava kelpaa." : c.error}</span>
        <span class="gs">Muuttujat: <code>RANGE_MIN</code> <code>RANGE_MAX</code> <code>TARGET</code> <code>ACTUAL</code> (myös {TARGET}). Operaattorit: + - * / % ^, vertailut, and, or, not ja ehto <code>ehto ? a : b</code>. Funktiot: ${FUNCTION_NAMES.join(", ")}. Desimaalimerkkinä käy piste tai pilkku, ja funktion arvot erotetaan pilkulla tai puolipisteellä.</span>
        ${c.ok ? html`<span class="mfinline gs">Esikatselu, toteuma <${Input} aria-label="Esimerkkitoteuma" maxlength="30" placeholder=${v.target || "–"} value=${sample} onChange=${(e) => setSample(e.target.value.trim())} /> tulos <b>${demo && demo.value != null ? fmt(demo.value, 3) : "–"}</b></span>` : null}
      </div>
      <div class="hact mfact">
        <button type="button" class="barbtn primary" disabled=${!c.ok || !v.name.trim()} onClick=${save}>Tallenna</button>
        <button type="button" class="barbtn" onClick=${() => { if (confirm("Poistetaanko mittari \"" + (v.name || "nimetön") + "\"? Roolien tallennetut toteumat jäävät, mutta eivät näy.")) { remove(def.id); onClose(); } }}>Poista</button>
      </div>
    </div>
  </div>`;
}

function DefRow({ def, onEdit }) {
  const d = def.data, sc = scoreRow(def, { data: {} }), to = recipientsOf(def, all("role"), all("metric"));
  const why = { stream: "Työvirran kautta", role: "Valittu suoraan", manual: "Lisätty käsin vastuualueelta" };
  return html`<tr class="defrow" tabIndex="0" onClick=${onEdit} onKeyDown=${(e) => { if (e.key === "Enter") onEdit(); }}>
    <td><b>${d.name || "Nimetön"}</b></td>
    <td>${to.length ? to.map((x) => html`<span class="chip" key=${x.role.id} title=${why[x.via] + (x.role.data.owner ? ", " + x.role.data.owner : "")}>${x.role.data.title || "Vastuualue"}</span> `) : html`<span class="gs warn">Ei kenellekään</span>`}</td>
    <td>${d.stream ? html`<span class="chip">${streamName(d.stream) || "(poistettu työvirta)"}</span>` : html`<span class="gs">käsin</span>`}</td>
    <td>${periodText(d.start, d.end) || "–"}</td>
    <td>${sc.target || "–"}</td><td>${sc.min || "–"}</td><td>${sc.max || "–"}</td><td>${sc.weight ? sc.weight + " %" : "–"}</td>
    <td><code>${d.formula || DEFAULT_FORMULA}</code></td>
  </tr>`;
}

// Lomaketyypit: nimi ja oikeudet määritellään täällä, eikä koodissa ole kiinteitä tyyppejä.
const TYPE_FLAGS = [["memberCreate", "Jäsen saa luoda"], ["memberView", "Jäsen näkee"], ["table", "Taulukko"], ["proposal", "Ehdotus"], ["score", "Pisteytys"]];
function FormTypes() {
  const types = sortTypes(all("formtype"));
  return html`<section class="tgroup">
    <h2>Lomaketyypit <span class="num">${types.length}</span></h2>
    <p class="gs">Lomake on jäädytetty kuva scorecardista. <b>Jäsen saa luoda</b>: jäsen voi tehdä tämän tyypin omalle scorecardilleen. <b>Jäsen näkee</b>: jäsen näkee tämän tyypin omalla scorecardillaan. <b>Taulukko</b>: lomakkeeseen tallentuvat scorecardin rivit. <b>Ehdotus</b>: vaatii ylläpitäjän päätöksen ja voidaan ottaa käyttöön. <b>Pisteytys</b>: tämän tyypin viimeisin lomake on euromoduulin pisteytyksen lähde. Ylläpitäjä saa aina luoda ja nähdä kaiken.</p>
    ${types.length ? html`<div class="gtable-wrap"><table class="gtable sctable"><thead><tr><th>Nimi</th>${TYPE_FLAGS.map(([, l]) => html`<th key=${l}>${l}</th>`)}<th></th></tr></thead>
      <tbody>${types.map((t) => html`<tr key=${t.id}><td class="nmtd"><${Text} item=${t} field="name" mode="always" max=${60} ph="Tyypin nimi" /></td>
        ${TYPE_FLAGS.map(([k, l]) => html`<td key=${k} class="ctr"><input type="checkbox" aria-label=${(t.data.name || "Tyyppi") + ": " + l} checked=${!!t.data[k]} onChange=${(e) => patch(t.id, { [k]: e.target.checked })} /></td>`)}
        <td><button type="button" class="stbtn" aria-label=${"Poista: " + (t.data.name || "tyyppi")} onClick=${() => { if (confirm("Poistetaanko lomaketyyppi \"" + (t.data.name || "nimetön") + "\"? Tallennetut lomakkeet säilyvät, mutta niiden tyyppi ei enää ole valittavissa.")) remove(t.id); }}>×</button></td></tr>`)}</tbody></table></div>` : html`<p class="gs">Ei vielä lomaketyyppejä.</p>`}
    <div class="hact mfact"><button type="button" class="barbtn" onClick=${() => add("formtype", null, { name: "Uusi tyyppi", memberCreate: false, memberView: false, table: true, proposal: false, score: false })}>+ Uusi lomaketyyppi</button></div>
  </section>`;
}

export function SettingsView() {
  const [edit, setEdit] = useState(null);
  const goals = all("goal");
  const plan = state.plans.find((p) => p.id === state.planId);
  if (!plan) return html`<div class="wrap today"><p class="gs">Valitse ensin suunnitelma.</p></div>`;
  const newDef = (goalId) => { const it = add("metricdef", goalId, { name: "Uusi mittari", stream: "", formula: DEFAULT_FORMULA }); setEdit(it.id); };
  const def = edit && all("metricdef").find((x) => x.id === edit);
  return html`<div class="wrap today settings">
    <header class="thead"><div><p class="eyebrow">Asetukset</p><h1>Tavoitteet</h1><p class="lede">${plan.title}</p></div>
      <p class="gs">Määrittele tavoitteet kerran. Mittari kuuluu työvirtaan, ja se tulee automaattisesti saman työvirran vastuualueiden scorecardeille. Vastuualueella toteuma kirjataan itse.</p></header>
    <div class="tfilters">
      <button type="button" class="barbtn" onClick=${() => add("goal", null, { name: "Uusi yhteinen tavoite" })}>+ Uusi yhteinen tavoite</button>
      <button type="button" class="barbtn" disabled=${!goals.length} title=${goals.length ? "" : "Luo ensin yhteinen tavoite"} onClick=${() => newDef(goals[0].id)}>+ Uusi mittari</button>
    </div>
    ${goals.length ? goals.map((g) => {
      const defs = children(g.id, "metricdef");
      return html`<section class="tgroup" key=${g.id}>
        <h2><${Text} item=${g} field="name" mode="always" max=${120} ph="Yhteisen tavoitteen nimi" /> <span class="num">${defs.length}</span>
          <button type="button" class="barbtn" onClick=${() => newDef(g.id)}>+ Mittari</button>
          <button type="button" class="barbtn" onClick=${() => { if (!defs.length || confirm("Poistetaanko \"" + (g.data.name || "tavoite") + "\" ja sen " + defs.length + " mittaria?")) remove(g.id); }}>Poista</button></h2>
        ${defs.length ? html`<div class="gtable-wrap"><table class="gtable sctable"><thead><tr><th>Mittari</th><th>Vastuualueet</th><th>Työvirta</th><th>Jakso</th><th>Tavoite</th><th>Alaraja</th><th>Yläraja</th><th>Paino</th><th>Kaava</th></tr></thead>
          <tbody>${defs.map((x) => html`<${DefRow} key=${x.id} def=${x} onEdit=${() => setEdit(x.id)} />`)}</tbody></table></div>` : html`<p class="gs">Ei vielä mittareita.</p>`}
      </section>`;
    }) : html`<p class="tclear">Ei vielä yhteisiä tavoitteita. Luo ensimmäinen painikkeesta ylhäällä ja lisää sille mittareita.</p>`}
    ${def ? html`<${DefEditor} key=${def.id} def=${def} onClose=${() => setEdit(null)} />` : null}
    <${FormTypes} />
    <${PaySettings} />
  </div>`;
}
