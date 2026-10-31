import test from "node:test";
import assert from "node:assert/strict";
import { findLoopCardLimitViolation, MAX_LOOP_CARDS_PER_PANEL } from "./domain-constraints.js";

test("enforces the two-card maximum at every nested persistence boundary", () => {
  assert.equal(MAX_LOOP_CARDS_PER_PANEL, 2);
  assert.equal(findLoopCardLimitViolation({ state: { loopCards: [{}, {}] } }), null);
  assert.deepEqual(
    findLoopCardLimitViolation({ state: { savedSettingFiles: [{ snapshot: { loopCards: [{}, {}, {}] } }] } }),
    { path: "payload.state.savedSettingFiles[0].snapshot.loopCards", count: 3, maximum: 2 },
  );
});
