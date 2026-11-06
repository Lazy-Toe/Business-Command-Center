// Uusi jakso: nykyisestä suunnitelmasta tehdään uusi versio, ja valitaan mitä siirretään mukaan. Rakenne siirtyy aina, vanha suunnitelma jää ennalleen.
import { html, useState } from "../vendor/htm-preact.js";
import { state, newCycle, deletePlan, all } from "./core/store.js";
import { useEscape } from "./core/ui.js";
import { CYCLE_DEFAULTS } from "./core/cycle.js";

const GROUPS = [
  ["tasks", "Tehtävät", [["open", "Vain keskeneräiset", "Tilaksi tulee Ei aloitettu, ja aloitus, lopetus ja muistiinpano tyhjennetään. Valmiit jäävät pois."], ["all", "Kaikki sellaisenaan", "Tilat ja päivät säilyvät."], ["none", "Ei tehtäviä", "Alkaa tyhjästä tehtävälistasta."]]],
  ["actuals", "Mittarien toteumat", [["clear", "Tyhjennä", "Mittarimallit, rajat ja painot säilyvät, joten luvut ovat vertailukelpoisia."], ["keep", "Säilytä", ""]]],
  ["forms", "Pisteytyslomakkeet ja ehdotukset", [["none", "Älä kopioi", "Ne jäävät vanhaan suunnitelmaan, josta edellisen jakson pisteet voi aina lukea."], ["keep", "Kopioi", ""]]]
];

export function NewCycleDialog({ onClose, onDone }) {
  const plan = state.plans.find((p) => p.id === state.planId);
  const [title, setTitle] = useState((plan ? plan.title : "") + " (uusi jakso)");
  const [opts, setOpts] = useState(Object.assign({}, CYCLE_DEFAULTS));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEscape(onClose);
  const go = async () => {
    if (!title.trim() || busy) return;
    setBusy(true); setMsg("");
    try { await newCycle(title.trim(), opts); onDone(); } catch (e) { setBusy(false); setMsg("Luonti epäonnistui (" + e.message + ")."); }
  };
  return html`<div class="histback" onClick=${onClose}>
    <div class="hist" role="dialog" aria-modal="true" aria-label="Uusi jakso" onClick=${(e) => e.stopPropagation()}>
      <div class="hhead"><h2>Uusi jakso</h2><button type="button" class="barbtn" onClick=${onClose}>Sulje</button></div>
      <p class="gs">Uusi jakso kopioidaan tästä suunnitelmasta. Vaiheet, työvirrat, vastuualueet ja vastuuhenkilöt, mittarimallit ja rajat, lomaketyypit ja päätösportit tulevat aina mukaan. Vanha suunnitelma jää ennalleen, ja voit vaihtaa jaksojen välillä yläpalkin valinnasta.</p>
      <label class="cycname">Nimi <input type="text" value=${title} maxlength="120" onInput=${(e) => setTitle(e.target.value)} /></label>
      ${GROUPS.map(([key, label, choices]) => html`<fieldset key=${key} class="cycgroup"><legend>${label}</legend>
        ${choices.map(([v, l, d]) => html`<label key=${v} class=${"cycopt" + (opts[key] === v ? " on" : "")}><input type="radio" name=${"cyc-" + key} checked=${opts[key] === v} onChange=${() => setOpts((o) => Object.assign({}, o, { [key]: v }))} /><span><b>${l}</b>${d ? html`<span class="gs"> ${d}</span>` : null}</span></label>`)}
      </fieldset>`)}
      ${msg ? html`<p class="gs bad">${msg}</p>` : null}
      <div class="cycbtns"><button type="button" class="barbtn primary" disabled=${busy || !title.trim()} onClick=${go}>${busy ? "Luodaan…" : "Luo jakso"}</button><button type="button" class="barbtn" onClick=${onClose}>Peruuta</button></div>
    </div>
  </div>`;
}

// Suunnitelman poisto vaatii kaksi vahvistusta: rasti ja suunnitelman nimen kirjoittaminen. Poisto arkistoi, eli tiedot säilyvät tietokannassa.
export function DeletePlanDialog({ onClose, onDone }) {
  const plan = state.plans.find((p) => p.id === state.planId), name = plan ? plan.title : "";
  const [sure, setSure] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEscape(onClose);
  const ok = sure && typed.trim().toLowerCase() === name.trim().toLowerCase() && !busy;
  const go = async () => {
    if (!ok) return;
    setBusy(true); setMsg("");
    try { await deletePlan(); onDone(); } catch (e) { setBusy(false); setMsg("Poisto epäonnistui (" + e.message + ")."); }
  };
  return html`<div class="histback" onClick=${onClose}>
    <div class="hist" role="dialog" aria-modal="true" aria-label="Poista suunnitelma" onClick=${(e) => e.stopPropagation()}>
      <div class="hhead"><h2>Poista suunnitelma</h2><button type="button" class="barbtn" onClick=${onClose}>Sulje</button></div>
      <p class="gs">Poistat suunnitelman <b>${name}</b>: ${all("task").length} tehtävää, ${all("role").length} vastuualuetta ja niiden mittarit ja pisteytykset katoavat näkyvistä. Muihin suunnitelmiin tämä ei vaikuta. Tiedot säilyvät arkistoituna tietokannassa, ja ne voidaan palauttaa vain ylläpidon kautta.</p>
      <label class="cycopt"><input type="checkbox" checked=${sure} onChange=${(e) => setSure(e.target.checked)} /><span><b>Ymmärrän, että suunnitelma poistuu käytöstä.</b></span></label>
      <label class="cycname">Kirjoita vahvistukseksi suunnitelman nimi: <i>${name}</i><input type="text" value=${typed} autocomplete="off" onInput=${(e) => setTyped(e.target.value)} /></label>
      ${msg ? html`<p class="gs bad">${msg}</p>` : null}
      <div class="cycbtns"><button type="button" class="barbtn dangerbtn" disabled=${!ok} onClick=${go}>${busy ? "Poistetaan…" : "Poista suunnitelma"}</button><button type="button" class="barbtn" onClick=${onClose}>Peruuta</button></div>
    </div>
  </div>`;
}
