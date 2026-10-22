import test from "node:test";
import assert from "node:assert/strict";
import { touchesAntimatter } from "./antimatter-pickup.ts";

test("a fast ball crossing a pickup is collected even when neither endpoint overlaps", () => {
  assert.equal(touchesAntimatter({x:0,y:100}, {x:300,y:100,r:20}, {x:150,y:100,r:14}), true);
});
test("stationary contact and exact tangency collect; a near miss does not", () => {
  assert.equal(touchesAntimatter({x:100,y:100}, {x:100,y:100,r:20}, {x:110,y:100,r:14}), true);
  assert.equal(touchesAntimatter({x:0,y:66}, {x:300,y:66,r:20}, {x:150,y:100,r:14}), true);
  assert.equal(touchesAntimatter({x:0,y:65}, {x:300,y:65,r:20}, {x:150,y:100,r:14}), false);
});
test("a pickup beyond the traveled segment is not collected", () => {
  assert.equal(touchesAntimatter({x:0,y:100}, {x:100,y:100,r:20}, {x:150,y:100,r:14}), false);
});
