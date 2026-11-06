// Henkilöiden hallinta (ylläpitäjä): nimen muutos, poisto ja kirjautumisen liittäminen.
import { html, useState } from "../vendor/htm-preact.js";
import { state, renamePerson, deletePerson, setPersonEmail } from "./core/store.js";
import { useEscape } from "./core/ui.js";

const REASON = {
  name_taken: "Nimi on jo toisella henkilöllä.",
  email_taken: "Sähköposti on jo liitetty toiseen henkilöön.",
  person_in_use: "Henkilöllä on vielä vastuualueita tai tehtäviä. Nimeä ne ensin toiselle henkilölle.",
  person_not_found: "Henkilöä ei löytynyt.",
  bad_email: "Anna sähköpostiosoite muodossa nimi@yritys.fi."
};

export function PeoplePanel({ onClose }) {
  const [msg, setMsg] = useState("");
  const [edit, setEdit] = useState(null); // { name, to, email }
  const [del, setDel] = useState("");
  const [busy, setBusy] = useState(false);
  useEscape(onClose);
  const run = async (fn) => {
    setBusy(true); setMsg("");
    try { await fn(); return true; } catch (e) { setMsg((e.body && REASON[e.body.error]) || "Toiminto epäonnistui (" + e.message + ")."); return false; } finally { setBusy(false); }
  };
  const save = async (p) => {
    const to = edit.to.trim(), mail = edit.email.trim();
    if (!to) { setMsg("Nimi ei voi olla tyhjä."); return; }
    const ok = await run(async () => {
      if (to !== p.name) await renamePerson(p.name, to);
      if (mail !== (p.email || "")) await setPersonEmail(to, mail);
    });
    if (ok) setEdit(null);
  };
  const rows = state.people.rows || [];
  return html`<div class="histback" onClick=${onClose}>
    <div class="hist" role="dialog" aria-modal="true" aria-label="Henkilöt" onClick=${(e) => e.stopPropagation()}>
      <div class="hhead"><h2>Henkilöt</h2><button type="button" class="barbtn" onClick=${onClose}>Sulje</button></div>
      <p class="gs">Uudet henkilöt nimetään vastuualueen otsikossa. Sähköpostin liittäminen kohdistaa henkilön Oma työpöytä -näkymän kirjautumiseen. Jäsenet näkevät vain omat rivinsä, ja jäsenyys määräytyy Cloudflaren asetuksista.</p>
      ${msg ? html`<p class="gs bad">${msg}</p>` : null}
      ${state.people.error ? html`<p class="gs bad">${state.people.error}</p>` : null}
      ${rows.length ? null : html`<p class="gs">Ei henkilöitä.</p>`}
      <ul class="hlist">${rows.map((p) => {
        if (edit && edit.name === p.name) {
          const key = (e) => { if (e.key === "Enter") save(p); };
          return html`<li class="hentry hedit" key=${p.name}>
            <label>Nimi<input type="text" value=${edit.to} maxlength="60" autofocus onInput=${(e) => setEdit({ ...edit, to: e.target.value })} onKeyDown=${key} /></label>
            <label>Kirjautumisen sähköposti<input type="email" value=${edit.email} placeholder="tyhjä poistaa liitoksen" onInput=${(e) => setEdit({ ...edit, email: e.target.value })} onKeyDown=${key} /></label>
            <div class="hact"><button type="button" class="barbtn primary" disabled=${busy} onClick=${() => save(p)}>Tallenna</button><button type="button" class="barbtn" onClick=${() => { setEdit(null); setMsg(""); }}>Peruuta</button></div>
          </li>`;
        }
        return html`<li class="hentry" key=${p.name}>
          <div class="hmain"><b>${p.name}</b><span class="hkind">${p.email || "ei kirjautumista"}</span></div>
          ${del === p.name
            ? html`<div class="hact"><span class="gs">Poistetaanko?</span><button type="button" class="barbtn" disabled=${busy} onClick=${async () => { if (await run(() => deletePerson(p.name))) setDel(""); }}>Poista</button><button type="button" class="barbtn" onClick=${() => setDel("")}>Peruuta</button></div>`
            : html`<div class="hact"><button type="button" class="barbtn" onClick=${() => { setDel(""); setMsg(""); setEdit({ name: p.name, to: p.name, email: p.email || "" }); }}>Muokkaa</button><button type="button" class="barbtn" onClick=${() => { setEdit(null); setDel(p.name); }}>Poista</button></div>`}
        </li>`;
      })}</ul>
    </div>
  </div>`;
}
