// Vasen kuvakepalkki: pääsiirtymiset ja pikatoiminnot. Kuvakkeet ovat omia, yksivärisiä ja perivät värin tekstistä (currentColor).
import { html } from "../vendor/htm-preact.js";

const svg = (body) => html`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const ICONS = {
  mark: svg(html`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>`),
  tasks: svg(html`<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17"/>`),
  today: svg(html`<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M9 15l2 2 4-4"/>`),
  mine: svg(html`<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>`),
  overview: svg(html`<rect x="3" y="3" width="8" height="10" rx="1.5"/><rect x="13" y="3" width="8" height="6" rx="1.5"/><rect x="13" y="11" width="8" height="10" rx="1.5"/><rect x="3" y="15" width="8" height="6" rx="1.5"/>`),
  settings: svg(html`<path d="M4 6h9M19 6h1M4 12h3M13 12h7M4 18h11M21 18h-1"/><circle cx="16" cy="6" r="2.2"/><circle cx="10" cy="12" r="2.2"/><circle cx="18" cy="18" r="2.2"/>`),
  people: svg(html`<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.6 3-6 7-6s7 2.4 7 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M18 14c2.6.3 4 2 4 4.5"/>`),
  history: svg(html`<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/><path d="M12 7v5l3 2"/>`)
};

// items: { id, label, icon, onClick, active, badge, group }. group "bottom" asettuu palkin alareunaan.
export function Rail({ items }) {
  const btn = (it) => html`<button key=${it.id} type="button" class=${"railbtn" + (it.active ? " on" : "")} data-label=${it.label} aria-label=${it.label} aria-current=${it.active ? "page" : undefined} onClick=${it.onClick}>
    ${ICONS[it.icon]}${it.badge ? html`<span class="railbadge" aria-label=${it.badge + " myöhässä"}>${it.badge > 99 ? "99+" : it.badge}</span>` : null}
  </button>`;
  return html`<nav class="rail" aria-label="Päävalikko">
    <span class="rail-mark" aria-hidden="true">${ICONS.mark}</span>
    <div class="rail-group">${items.filter((i) => i.group !== "bottom").map(btn)}</div>
    <span class="rail-spacer"></span>
    <div class="rail-group">${items.filter((i) => i.group === "bottom").map(btn)}</div>
  </nav>`;
}

// Kokonaisuuden osioiden otsikot ja vastuualueet. Kiinnitettynä (leveä näyttö) lista on aina näkyvissä, muuten se aukeaa Kokonaisuus-kuvakkeesta.
// activeSec on osio, joka on parhaillaan näkyvissä sivulla, ja activeTab on avoin vastuualue.
export function SubNav({ title, entries, roles, activeTab, activeSec, open, pinned, onEntry, onRole, onClose, onTogglePin }) {
  const pinText = pinned ? "Piilota lista" : "Kiinnitä lista näkyviin";
  return html`${open ? html`<div class="subnav-back" onClick=${onClose}></div>` : null}
  <nav class=${"subnav" + (open ? " open" : "")} aria-label="Kokonaisuuden osiot">
    <div class="subhead">
      <div><b>Kokonaisuus</b><span title=${title}>${title}</span></div>
      <button type="button" class="subpin" aria-label=${pinText} title=${pinText} onClick=${onTogglePin}>${pinned ? "‹" : "›"}</button>
    </div>
    <h3>Osiot</h3>
    <ul class="sublist">${entries.map((e) => html`<li key=${e.id}><button type="button" class=${"sub1" + (activeSec === e.id ? " on" : "")} aria-current=${activeSec === e.id ? "location" : undefined} title=${e.label} onClick=${() => onEntry(e)}><span>${e.label}</span></button></li>`)}</ul>
    ${roles.length ? html`<h3>Vastuualueet</h3>
    <ul class="sublist">${roles.map((r) => html`<li key=${r.id}><button type="button" class=${"sub1" + (activeTab === r.id ? " on" : "")} aria-current=${activeTab === r.id ? "page" : undefined} title=${(r.data.title || "Vastuualue") + (r.data.owner ? " (" + r.data.owner + ")" : "")} onClick=${() => onRole(r)}><span>${r.data.title || "Vastuualue"}</span></button></li>`)}</ul>` : null}
  </nav>`;
}
