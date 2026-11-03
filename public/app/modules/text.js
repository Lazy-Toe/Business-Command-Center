import { html, Text, useCollapse, Head } from "../core/ui.js";
import { register } from "../core/registry.js";

function View({ section }) {
  const { c, toggle } = useCollapse(section);
  return html`<div class=${"modbody" + (c ? " is-collapsed" : "")}>
    <${Head} section=${section} c=${c} toggle=${toggle} />
    <${Text} item=${section} field="body" tag="div" cls="textblock" multi=${true} max=${20000} ph="Kirjoita tekstiä" />
  </div>`;
}

register({
  type: "text", label: "Teksti", hint: "Vapaa tekstiosio",
  create: () => ({ data: { eyebrow: "", title: "Uusi osio", intro: "", body: "" }, children: [] }),
  View
});
