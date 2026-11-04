// Henkilön valinta listasta. Lista on alustan yhteinen, ja uusi nimi lisätään siihen valinnalla "Lisää henkilö".
import { html } from "../vendor/htm-preact.js";
import { state, all, addPerson } from "./core/store.js";
import { peopleOf } from "./core/calc.js";

const NEW_PERSON = "__new";

// Valittavat henkilöt ovat Kokonaisuudessa nimetyt: kaikkien suunnitelmien vastuualueiden vastuuhenkilöt
// sekä erikseen lisätyt. Tehtävän nykyinen arvo näkyy aina, vaikka se ei olisi listalla.
export function peopleNames(...extra) {
  const overviewRoles = state.overview ? state.overview.items.filter((i) => i.kind === "role").map((r) => r.data.owner) : [];
  return peopleOf(state.people.list, overviewRoles, all("role").map((r) => r.data.owner), extra);
}

// canAdd: uuden henkilön voi nimetä vain siellä, missä vastuuhenkilöt nimetään (vastuualueen otsikko).
export function PersonSelect({ value, onPick, label, cls, empty = "Ei vastuuhenkilöä", canAdd = false }) {
  const names = peopleNames(value);
  // Tyhjä vaihtoehto tarkoittaa vastuualueen mukaista vastuuta, ja sen teksti on silloin vastuualueen omistajan nimi. Kun arvoa ei ole asetettu,
  // sama nimi piilotetaan listasta kahdesti. Kun arvo on asetettu, kaikki nimet pysyvät valittavina, jotta valittu nimi aina löytyy listasta.
  const dup = String(empty).toLowerCase(), isName = names.some((n) => n.toLowerCase() === dup);
  const emptyText = value && isName ? empty + " (vastuualueelta)" : empty;
  const listed = value ? names : names.filter((n) => n.toLowerCase() !== dup);
  const change = async (e) => {
    const v = e.target.value;
    if (v !== NEW_PERSON) { onPick(v); return; }
    e.target.value = value || "";
    const n = (prompt("Henkilön nimi") || "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!n) return;
    let name = names.find((x) => x.toLowerCase() === n.toLowerCase()) || n;
    try { name = await addPerson(n); } catch (x) { /* henkilölistaa ei saatu: nimi tallentuu silti vastuuseen */ }
    onPick(name);
  };
  return html`<select class=${cls || "personsel"} aria-label=${label || "Henkilö"} value=${value || ""} onChange=${change}>
    <option value="">${emptyText}</option>
    ${listed.map((n) => html`<option key=${n} value=${n}>${n}</option>`)}
    ${canAdd ? html`<option value=${NEW_PERSON}>+ Lisää henkilö…</option>` : null}
  </select>`;
}
