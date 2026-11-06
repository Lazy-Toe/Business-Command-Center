// Yksi tapa lisätä rivi: "+ Tehtävä" avaa kentän, nimi kirjoitetaan ja Enter lisää. Esc tai tyhjä kenttä peruu. Sama kaikkialla.
import { html, useState, useRef } from "../vendor/htm-preact.js";

export function QuickAdd({ label = "Tehtävä", onAdd, cls = "", placeholder }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  const live = useRef(false);
  // Enter sulkee kentän ja sulkeminen laukaisee blurin: live estää kaksoislisäyksen.
  const done = (save) => { if (!live.current) return; live.current = false; const t = v.trim(); setOpen(false); setV(""); if (save && t) onAdd(t); };
  if (!open) return html`<button type="button" class=${"addbtn quickadd " + cls} onClick=${(e) => { e.stopPropagation(); live.current = true; setOpen(true); }}>+ ${label}</button>`;
  return html`<span class=${"quickadd open " + cls} onClick=${(e) => e.stopPropagation()}>
    <input type="text" autofocus maxlength="200" aria-label=${"Uusi " + label.toLowerCase()} placeholder=${placeholder || label + ", Enter lisää"} value=${v}
      onInput=${(e) => setV(e.target.value)}
      onKeyDown=${(e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); done(true); } else if (e.key === "Escape") done(false); }}
      onBlur=${() => done(true)} />
  </span>`;
}
