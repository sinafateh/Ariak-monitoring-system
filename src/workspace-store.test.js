import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceStore } from "./workspace-store.js";

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("workspace persistence keeps the server revision and sends it with each save", async () => {
  const calls = [];
  const replies = [response(200, { version: 7, payload: { projects: [] } }), response(200, { version: 8 })];
  const store = createWorkspaceStore(async (url, options) => {
    calls.push({ url, options });
    return replies.shift();
  });

  const loaded = await store.loadWorkspace();
  const saved = await store.saveWorkspace(loaded.payload);

  assert.equal(loaded.version, 7);
  assert.equal(saved.ok, true);
  assert.equal(calls[1].options.headers["If-Match"], '"7"');
  assert.deepEqual(JSON.parse(calls[1].options.body), { payload: { projects: [] } });
});

test("panel persistence tracks revisions per panel and preserves conflict responses", async () => {
  const calls = [];
  const replies = [
    response(200, { revision: 3, settings: { loopCards: [] } }),
    response(200, { revision: 4 }),
    response(409, { code: "PANEL_VERSION_CONFLICT" }),
  ];
  const store = createWorkspaceStore(async (url, options) => {
    calls.push({ url, options });
    return replies.shift();
  });

  await store.loadPanelSettings("project one", "panel/1");
  const saved = await store.savePanelSettings("project one", "panel/1", { settings: {} });
  const conflict = await store.savePanelSettings("project one", "panel/1", { settings: {} });

  assert.equal(calls[0].url, "/api/projects/project%20one/panels/panel%2F1/settings");
  assert.equal(calls[1].options.headers["If-Match"], '"panel-3"');
  assert.equal(calls[2].options.headers["If-Match"], '"panel-4"');
  assert.equal(saved.ok, true);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.result.code, "PANEL_VERSION_CONFLICT");
  assert.equal(store.getPanelRevision("project one", "panel/1"), 4);
});
