import { html, Text, Tools, AddButton, ui, useCollapse, Head, pressable, FACE, MOODNAME, ORDER, RORDER, nextIn, sortProps } from "../core/ui.js";
import { register } from "../core/registry.js";
import { children, add, patch } from "../core/store.js";

const RISKNUM = { good: 0, mid: 1, bad: 2 };
const mood = (s) => (s ? " m-" + s : "");
const clicks = (fn, label, title) => (ui.edit ? {} : Object.assign(pressable(fn), { title, "aria-label": label }));

function Metrics({ section }) {
  const { c, toggle } = useCollapse(section);
  const list = children(section.id, "row");
  return html`<div class=${"modbody" + (c ? " is-collapsed" : "")}>
    <${Head} section=${section} c=${c} toggle=${toggle} />
    <div class="rows">
      ${list.map((r) => html`<div key=${r.id} data-item=${r.id} class=${"row" + mood(r.data.state) + (ui.edit ? "" : " clickable")} ...${clicks(() => patch(r.id, { state: nextIn(ORDER, r.data.state) }), r.data.name + ": " + (MOODNAME[r.data.state] || "ei arviota"), "Klikkaa vaihtaaksesi arviota")} ...${sortProps(r, list, "row")}>
        <${Text} item=${r} field="name" tag="b" ph="Mittari" /><${Text} item=${r} field="cad" cls="cad" ph="rytmi" /><${Text} item=${r} field="why" cls="why" ph="Miksi" /><${Text} item=${r} field="target" cls="tgt" ph="Tavoite" />
        <span class="moodv" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: r.data.state ? FACE[r.data.state] : "" }}></span>
        <${Tools} item=${r} list=${list} label=${r.data.name} />
      </div>`)}
      <${AddButton} label="Mittari" onAdd=${() => add("row", section.id, { name: "", cad: "kuukausi", why: "", target: "", state: "" })} />
    </div>
  </div>`;
}

function Risks({ section }) {
  const { c, toggle } = useCollapse(section);
  const list = children(section.id, "risk");
  return html`<div class=${"modbody" + (c ? " is-collapsed" : "")}>
    <${Head} section=${section} c=${c} toggle=${toggle} />
    <div class="rows">
      ${list.map((r) => html`<div key=${r.id} data-item=${r.id} class=${"risk" + mood(r.data.state) + (ui.edit ? "" : " clickable")} ...${clicks(() => patch(r.id, { state: nextIn(RORDER, r.data.state) }), r.data.name + ": " + (r.data.state ? "riskitaso " + RISKNUM[r.data.state] : "ei arviota"), "Klikkaa vaihtaaksesi arviota")} ...${sortProps(r, list, "risk")}>
        <${Text} item=${r} field="name" tag="b" ph="Riski" /><${Text} item=${r} field="action" ph="Vastatoimi" multi=${true} />
        <span class="moodv" aria-hidden="true">${r.data.state ? html`<span class="rlvl">${RISKNUM[r.data.state]}</span>` : null}</span>
        <${Tools} item=${r} list=${list} label=${r.data.name} />
      </div>`)}
      <${AddButton} label="Riski" onAdd=${() => add("risk", section.id, { name: "", action: "", state: "" })} />
    </div>
  </div>`;
}

register({
  type: "metrics", label: "Mittaristo", hint: "Mittarit, rytmi ja tilannearvio", half: true,
  create: () => ({ data: { eyebrow: "Mittaristo", title: "Millä onnistuminen mitataan", intro: "", width: "half" }, children: [] }),
  View: Metrics
});
register({
  type: "risks", label: "Riskit", hint: "Riskit, vastatoimet ja taso", half: true,
  create: () => ({ data: { eyebrow: "Riskit", title: "Mikä voi mennä pieleen", intro: "Taso 0 = hallinnassa, 1 = seurattava, 2 = toteutumassa.", width: "half" }, children: [] }),
  View: Risks
});
