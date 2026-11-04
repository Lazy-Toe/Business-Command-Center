// Henkilöiden hallinta (ylläpitäjä): nimen muutos, poisto ja kirjautumisen liittäminen.
import { html, useState } from "../vendor/htm-preact.js";
import { state, renamePerson, deletePerson, setPersonEmail } from "./core/store.js";
import { useEscape } from "./core/ui.js";
import { PayPersonEditor } from "./views/settings-pay.js";

const REASON = {
  name_taken: "Nimi on jo toisella henkilöllä.",
  email_taken: "Sähköposti on jo liitetty toiseen henkilöön.",
  person_in_use: "Henkilöllä on vielä vastuualueita tai tehtäviä. Nimeä ne ensin toiselle henkilölle.",
  person_not_found: "Henkilöä ei löytynyt.",
  bad_email: "Anna sähköpostiosoite muodossa nimi@yritys.fi."
};

export function PeoplePanel({ onClose }) {
  const [msg, setMsg] = useState("");
  const [pay, setPay] = useState("");
  useEscape(onClose);
  const run = (fn) => async () => {
    try { setMsg(""); await fn(); } catch (e) { setMsg((e.body && REASON[e.body.error]) || "Toiminto epäonnistui (" + e.message + ")."); }
  };
  const rows = state.people.rows || [];
  return html`<div class="histback" onClick=${onClose}>
    <div class="hist" role="dialog" aria-modal="true" aria-label="Henkilöt" onClick=${(e) => e.stopPropagation()}>
      <div class="hhead"><h2>Henkilöt</h2><button type="button" class="barbtn" onClick=${onClose}>Sulje</button></div>
      <p class="gs">Uudet henkilöt nimetään vastuualueen otsikossa. Sähköpostin liittäminen kohdistaa henkilön Oma työpöytä -näkymän kirjautumiseen. Jäsenet näkevät vain omat rivinsä, ja jäsenyys määräytyy Cloudflaren asetuksista.</p>
      ${msg ? html`<p class="gs bad">${msg}</p>` : null}
      ${state.people.error ? html`<p class="gs bad">${state.people.error}</p>` : null}
      ${rows.length ? null : html`<p class="gs">Ei henkilöitä.</p>`}
      <ul class="hlist">${rows.map((p) => html`<li class="hentry" key=${p.name}>
        <div class="hmain"><b>${p.name}</b><span class="hkind">${p.email || "ei kirjautumista"}</span></div>
        <div class="hact">
          <button type="button" class="barbtn" onClick=${run(async () => { const n = prompt("Henkilön uusi nimi", p.name); if (n && n.trim() && n.trim() !== p.name) await renamePerson(p.name, n.trim()); })}>Nimeä uudelleen</button>
          <button type="button" class="barbtn" onClick=${() => setPay(p.name)}>Euro-tiedot</button>
          <button type="button" class="barbtn" onClick=${run(async () => { const m = prompt("Kirjautumisen sähköposti (tyhjä poistaa liitoksen)", p.email || ""); if (m !== null && m.trim() !== (p.email || "")) await setPersonEmail(p.name, m.trim()); })}>Sähköposti</button>
          <button type="button" class="barbtn" onClick=${run(async () => { if (confirm("Poistetaanko henkilö \"" + p.name + "\"?")) await deletePerson(p.name); })}>Poista</button>
        </div>
      </li>`)}</ul>
    </div>
    ${pay ? html`<${PayPersonEditor} name=${pay} onClose=${() => setPay("")} />` : null}
  </div>`;
}
