// Henkilön valinta listasta. Lista on alustan yhteinen, ja uusi nimi lisätään siihen valinnalla "Lisää henkilö".
import { html } from "../vendor/htm-preact.js";
import { state, all, addPerson } from "./core/store.js";
import { peopleOf } from "./core/calc.js";

const NEW_PERSON = "__new";

// Yhteinen henkilölista sekä nykyisen suunnitelman vastuuhenkilöt, jotta valinta toimii myös ilman henkilölistaa.
export function peopleNames(...extra) {
  return peopleOf(state.people.list, all("role").map((r) => r.data.owner), all("task").map((t) => t.data.owner), extra);
}

export function PersonSelect({ value, onPick, label, cls, empty = "Ei vastuuhenkilöä" }) {
  const names = peopleNames(value);
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
    <option value="">${empty}</option>
    ${names.map((n) => html`<option key=${n} value=${n}>${n}</option>`)}
    <option value=${NEW_PERSON}>+ Lisää henkilö…</option>
  </select>`;
}
