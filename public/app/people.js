// Henkilön valinta listasta. Lista on alustan yhteinen, ja uusi nimi lisätään siihen valinnalla "Lisää henkilö".
import { html } from "../vendor/htm-preact.js";
import { state, all, addPerson } from "./core/store.js";
import { peopleOf } from "./core/calc.js";

// Valittavat henkilöt ovat Kokonaisuudessa nimetyt: kaikkien suunnitelmien vastuualueiden vastuuhenkilöt
// sekä erikseen lisätyt. Tehtävän nykyinen arvo näkyy aina, vaikka se ei olisi listalla.
export function peopleNames(...extra) {
  const overviewRoles = state.overview ? state.overview.items.filter((i) => i.kind === "role").map((r) => r.data.owner) : [];
  return peopleOf(state.people.list, overviewRoles, all("role").map((r) => r.data.owner), extra);
}

// Henkilön titteli on johdettu: niiden vastuualueiden nimet, joiden vastuuhenkilö hän on (kaikista suunnitelmista, jos koostenäkymä on ladattu).
export function personTitles() {
  const roles = state.overview ? state.overview.items.filter((i) => i.kind === "role") : all("role"), out = new Map();
  roles.forEach((r) => {
    const n = String(r.data.owner || "").trim(), t = String(r.data.title || "").trim();
    if (!n || !t) return;
    const list = out.get(n.toLowerCase()) || [];
    if (!list.includes(t)) list.push(t);
    out.set(n.toLowerCase(), list);
  });
  return (name) => (out.get(String(name || "").toLowerCase()) || []).join(" · ");
}

// Vastuualueen työvirrat valintaruuduilla. Ruudut näkyvät suoraan, joten taulukon vieritys ei leikkaa niitä.
export function StreamChecks({ streams, value, onChange, label }) {
  const on = new Set(value);
  return html`<div class="streamchecks" role="group" aria-label=${label || "Työvirrat"}>
    ${streams.map((s) => html`<label key=${s.id} class="rolechk"><input type="checkbox" checked=${on.has(s.id)} onChange=${(e) => onChange(streams.map((x) => x.id).filter((id) => (id === s.id ? e.target.checked : on.has(id))))} /> ${s.data.label}</label>`)}
  </div>`;
}

// Henkilön valinta nimilaatikoista. Valittu nimi pysyy korostettuna, ja saman nimen painaminen tyhjentää valinnan.
// inline: laatikot näkyvät suoraan (esim. taulukon solussa). Muuten näkyy yksi painike, joka avaa laatikot ja sulkeutuu valinnasta.
// empty on painikkeen teksti, kun valintaa ei ole. canAdd: uuden henkilön voi nimetä vain siellä, missä vastuuhenkilöt nimetään.
export function PersonSelect({ value, onPick, label, cls, empty = "Ei vastuuhenkilöä", canAdd = false, inline = false, cards = false }) {
  const names = peopleNames(value), titleOf = cards ? personTitles() : () => "";
  const add = async () => {
    const n = (prompt("Henkilön nimi") || "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!n) return;
    let name = names.find((x) => x.toLowerCase() === n.toLowerCase()) || n;
    try { name = await addPerson(n); } catch (x) { /* henkilölistaa ei saatu: nimi tallentuu silti vastuuseen */ }
    onPick(name);
  };
  const close = (e) => { const d = e.currentTarget.closest("details"); if (d) d.removeAttribute("open"); };
  const chips = (done) => html`<span class="pp-chips" role="group" aria-label=${label || "Henkilö"}>${names.map((n) => html`<button type="button" key=${n} class=${"pp-chip" + (cards ? " card" : "") + (n === value ? " on" : "")} aria-pressed=${n === value ? "true" : "false"} onClick=${(e) => { onPick(n === value ? "" : n); if (done) done(e); }}>${cards ? html`<b>${n}</b><small>${titleOf(n) || "Ei vastuualuetta"}</small>` : n}</button>`)}${canAdd ? html`<button type="button" class=${"pp-chip pp-add" + (cards ? " card" : "")} onClick=${(e) => { add(); if (done) done(e); }}>+ Lisää henkilö</button>` : null}</span>`;
  if (inline) return html`<span class=${"pp inline " + (cls || "")}>${chips(null)}</span>`;
  return html`<details class=${"pp " + (cls || "") + (value ? "" : " none")}><summary aria-label=${(label || "Henkilö") + ": " + (value || empty)}>${value || empty}</summary><div class="pp-box">${chips(close)}</div></details>`;
}

// Avoin valinta sulkeutuu, kun klikataan muualle.
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => document.querySelectorAll("details.pp[open], details.multi[open], details.bulkmenu[open], details.fmenu[open]").forEach((d) => { if (!d.contains(e.target)) d.removeAttribute("open"); }));
}
