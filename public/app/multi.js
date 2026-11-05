// Monivalinta: avautuva lista valintaruuduilla, jaettu komponentti.
import { html } from "../vendor/htm-preact.js";

// Monivalinta: avautuva lista valintaruuduilla. Tyhjä valinta tarkoittaa kaikki.
export function Multi({ label, value, options, onChange, join, none = "Kaikki" }) {
  const on = new Set(value), name = (k) => (options.find(([x]) => x === k) || [0, k])[1];
  const txt = !value.length ? none : join && value.length <= 3 ? value.map(name).join(", ") : value.length === 1 ? name(value[0]) : value.length + " valittu";
  return html`<details class="multi"><summary><span class="gs">${label}</span> ${txt}</summary>
    <div class="multibox">${options.map(([k, l]) => html`<label key=${k}><input type="checkbox" checked=${on.has(k)} onChange=${(e) => onChange(e.target.checked ? value.concat(k) : value.filter((x) => x !== k))} /> ${l}</label>`)}
      ${value.length ? html`<button type="button" class="linkbtn" onClick=${() => onChange([])}>Tyhjennä</button>` : null}</div></details>`;
}
const SUGGEST = "__suggest";

// Massamuutoksen päivä otetaan käyttöön vasta painikkeesta, jotta kirjoitus kesken ei muuta valittuja tehtäviä.
function BulkDate({ disabled, onApply }) {
  const [v, setV] = useState("");
  const ok = isSaneDue(v);
  const go = () => { if (ok) { onApply(v); setV(""); } };
  return html`<span class="bulkgrp"><input type="date" min="2000-01-01" max="2099-12-31" aria-label="Määräpäivä valituille" disabled=${disabled} value=${v} onInput=${(e) => setV(e.target.value)} onChange=${(e) => setV(e.target.value)} onKeyDown=${(e) => { if (e.key === "Enter") go(); }} />
    <button type="button" class="barbtn" disabled=${disabled || !ok} onClick=${go}>Aseta päivä</button></span>`;
}
