import test from "node:test";
import assert from "node:assert/strict";
import { sectionEntries } from "../public/app/core/nav.js";

const sec = (id, data) => ({ id, data });
const label = (t) => ({ goals: "Kasvutavoitteet", plan: "Suunnitelma" }[t]);

test("osioiden otsikot järjestyksessä, tyhjä otsikko korvataan moduulin nimellä", () => {
  const r = sectionEntries([sec("a", { type: "hero", title: "  Pääviesti " }), sec("b", { type: "goals", title: "" }), sec("c", { type: "plan" }), sec("d", { type: "tuntematon", title: "   " })], label);
  assert.deepEqual(r, [
    { id: "a", type: "hero", label: "Pääviesti" }, { id: "b", type: "goals", label: "Kasvutavoitteet" },
    { id: "c", type: "plan", label: "Suunnitelma" }, { id: "d", type: "tuntematon", label: "Osio" }
  ]);
  assert.deepEqual(sectionEntries([], label), []);
  assert.equal(sectionEntries([sec("x", { type: "goals" })])[0].label, "Osio", "ilman nimeämisfunktiota");
});
