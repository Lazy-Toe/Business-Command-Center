import { html, Text, Tools, AddButton, ui, useCollapse, Head, pressable, sortProps } from "../core/ui.js";
import { register } from "../core/registry.js";
import { children, add, patch } from "../core/store.js";

function View({ section }) {
  const { c, toggle } = useCollapse(section);
  const opts = children(section.id, "option"), crits = children(section.id, "criterion");
  const chosen = opts.find((o) => o.id === section.data.choice);
  return html`<div class=${"modbody" + (c ? " is-collapsed" : "")}>
    <${Head} section=${section} c=${c} toggle=${toggle} />
    <div class="opts">
      ${opts.map((o) => {
        const on = chosen && chosen.id === o.id;
        const work = ui.edit ? {} : Object.assign(pressable(() => patch(section.id, { choice: on ? "" : o.id })), { "aria-pressed": on ? "true" : "false" });
        return html`<article key=${o.id} class=${"opt" + (on ? " sel" : "") + (ui.edit ? "" : " clickable")} ...${work} ...${sortProps(o, opts, "option")}>
          <p class="ok"><${Text} item=${o} field="letter" ph="A" /><span class="selb">Valittu</span></p>
          <${Text} item=${o} field="title" tag="h3" ph="Vaihtoehto" />
          <${Text} item=${o} field="text" tag="p" multi=${true} ph="Kuvaus" />
          <${Text} item=${o} field="when" tag="p" cls="when" multi=${true} ph="Milloin oikea" />
          <${Tools} item=${o} list=${opts} label=${o.data.title} />
        </article>`;
      })}
      <${AddButton} label="Vaihtoehto" onAdd=${() => add("option", section.id, { letter: String.fromCharCode(65 + opts.length), title: "", text: "", when: "" })} />
    </div>
    <p class="optnote">${chosen ? "Valittu suositus: " + chosen.data.letter + " " + chosen.data.title + ". Klikkaa uudelleen poistaaksesi valinnan." : "Klikkaa vaihtoehtoa valitaksesi suosituksen. Valinta tallentuu kaikille."}</p>
    ${crits.length || ui.edit ? html`<div class="crit">
      <${Text} item=${section} field="critLabel" cls="crit-l" ph="Kriteerit" />
      ${crits.map((x) => html`<span key=${x.id} ...${sortProps(x, crits, "criterion")}><${Text} item=${x} field="text" ph="Kriteeri" /><${Tools} item=${x} label=${x.data.text} /></span>`)}
      <${AddButton} label="Kriteeri" cls="small" onAdd=${() => add("criterion", section.id, { text: "" })} />
    </div>` : null}
  </div>`;
}

register({
  type: "decision", label: "Päätös", hint: "Vaihtoehdot, kriteerit ja valinta",
  create: () => ({ data: { eyebrow: "Päätös", title: "Mitä päätetään?", intro: "", critLabel: "Kriteerit", choice: "" }, children: [{ kind: "option", data: { letter: "A", title: "Vaihtoehto A", text: "", when: "" } }, { kind: "option", data: { letter: "B", title: "Vaihtoehto B", text: "", when: "" } }] }),
  View
});
