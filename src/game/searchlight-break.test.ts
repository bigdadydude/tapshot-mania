import assert from "node:assert/strict";
import test from "node:test";
import { searchlightBreaksOnHit } from "./searchlight-break.ts";

test("searchlight first extinguish counts once, stacked hits while out do not", () => {
  let out = 0;
  let breaks = 0;
  const hit = () => {
    if (searchlightBreaksOnHit(out)) {
      out = 2;
      breaks += 1;
    } else {
      out += 2;
    }
  };
  hit();
  assert.equal(breaks, 1);
  hit();
  hit();
  assert.equal(breaks, 1);
  assert.ok(out > 2);
});

test("a recovered searchlight counts again on the next extinguish", () => {
  let out = 0;
  let breaks = 0;
  const hit = () => {
    if (searchlightBreaksOnHit(out)) {
      out = 2;
      breaks += 1;
    } else {
      out += 2;
    }
  };
  hit();
  assert.equal(breaks, 1);
  // LIGHT_OUT elapses and the lamp is on again (wake does not keep out > 0).
  out = 0;
  hit();
  assert.equal(breaks, 2);
});
