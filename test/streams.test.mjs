import test from "node:test";
import assert from "node:assert/strict";
import { roleStreams, hasStream, streamsPatch } from "../public/app/core/streams.js";
import { rowsFor, recipientsOf } from "../public/app/core/scorecard.js";
import { suggestedOwner } from "../public/app/core/today.js";
import { scopeFor } from "../public/app/core/scope.js";

const role = (data, id = "r1") => ({ id, plan_id: "p", data });
const def = (id, stream) => ({ id, kind: "metricdef", parent_id: "g", position: 1, data: { name: id, stream } });

test("roolin työvirrat: lista, vanha yksittäinen kenttä ja tyhjä", () => {
  assert.deepEqual(roleStreams(role({ streams: ["a", "b"], stream: "a" })), ["a", "b"]);
  assert.deepEqual(roleStreams(role({ stream: "a" })), ["a"], "vanha muoto luetaan listana");
  assert.deepEqual(roleStreams(role({ streams: [], stream: "a" })), [], "tyhjä lista on tarkoituksellinen");
  assert.deepEqual(roleStreams(role({})), []);
  assert.equal(hasStream(role({ streams: ["a"] }), "a"), true);
  assert.equal(hasStream(role({ streams: ["a"] }), ""), false);
  assert.deepEqual(streamsPatch(["b", "", "b", "c"]), { streams: ["b", "c"], stream: "b" });
  assert.deepEqual(streamsPatch([]), { streams: [], stream: "" });
});

test("mallit tulevat kaikista roolin työvirroista", () => {
  const r = role({ streams: ["w1", "w2"] });
  assert.deepEqual(rowsFor(r, [def("d1", "w1"), def("d2", "w2"), def("d3", "w3")], []).map((x) => x.def.id), ["d1", "d2"]);
  assert.deepEqual(recipientsOf(def("d2", "w2"), [r, role({ stream: "w9" }, "r2")], []).map((x) => [x.role.id, x.via]), [["r1", "stream"]]);
});

test("ehdotettu vastuuhenkilö löytyy mistä tahansa roolin työvirrasta", () => {
  const roles = [role({ streams: ["w1", "w2"], owner: "Mika" })];
  assert.equal(suggestedOwner("w2", roles), "Mika");
  assert.equal(suggestedOwner("w3", roles), "");
});

test("jäsen saa kaikki oman roolinsa työvirrat näkyviin", () => {
  const rows = [
    { plan_id: "a", id: "w1", kind: "stream", data: { label: "Yksi" } }, { plan_id: "a", id: "w2", kind: "stream", data: { label: "Kaksi" } }, { plan_id: "a", id: "w3", kind: "stream", data: { label: "Kolme" } },
    { plan_id: "a", id: "r1", kind: "role", data: { title: "R", owner: "Mika", streams: ["w1", "w2"] } }
  ];
  const ids = scopeFor(rows, "Mika").items.map((x) => x.id).sort();
  assert.deepEqual(ids, ["r1", "w1", "w2"]);
});
