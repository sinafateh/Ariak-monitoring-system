import test from "node:test";
import assert from "node:assert/strict";
import { PANEL_SETTING_KEYS, sanitizeWorkspaceForUser, validatePanelSettings } from "./panel-settings.js";

const permissions = {
  hasGlobalPermission: (user, permission) => (user.globalPermissions || []).includes("*") || (user.globalPermissions || []).includes(permission),
  hasProjectPermission: (user, project, permission) => (user.projectPermissions?.[project] || []).includes(permission),
};

test("panel settings accept actual editable fields and reject workspace or account fields", () => {
  const settings = { loopCards: [{ id: "loop-1", devices: [] }], formValues: { relay: [{ value: "fire" }] } };
  assert.deepEqual(validatePanelSettings(settings), { ok: true, settings });
  for (const field of ["projects", "globalPermissions", "isActive", "workspaceKey", "password_hash"]) {
    assert.equal(validatePanelSettings({ [field]: [] }).ok, false, field);
  }
  assert.equal(validatePanelSettings({ loopCards: [{}, {}, {}] }).ok, false);
  assert.equal(validatePanelSettings({ language: "xx" }).ok, false);
  assert.equal(validatePanelSettings({ [PANEL_SETTING_KEYS[0]]: "x" }).ok, true);
});

test("restricted workspace reads expose only granted projects and explicitly granted panels", () => {
  const source = { projects: [
    { id: "p1", name: "Allowed", image: "image-data", panels: [{ id: "a", name: "A", config: "secret" }, { id: "b", name: "B" }] },
    { id: "p2", name: "Hidden", panels: [{ id: "c" }] },
  ], state: { year: 2040, loopCards: [{ secret: true }], formValues: { hidden: true }, savedSettingFiles: [{ panelId: "a" }, { panelId: "b" }], view: "workspace" } };
  const user = { globalPermissions: [], projectPanels: { p1: ["a"] }, projectPermissions: {} };
  const result = sanitizeWorkspaceForUser(source, user, permissions);
  assert.deepEqual(result.projects.map((project) => [project.id, project.panels.map((panel) => panel.id)]), [["p1", ["a"]]]);
  assert.equal(result.projects[0].image, "image-data");
  assert.equal(result.projects[0].panels[0].config, "secret");
  assert.equal(result.state.year, undefined);
  assert.equal(result.state.loopCards, undefined);
  assert.deepEqual(result.state.savedSettingFiles, [{ panelId: "a" }]);
  assert.deepEqual(source.projects[0].panels.map((panel) => panel.id), ["a", "b"]);
});

test("project administration does not grant operational panel reads; panel-wide grants do", () => {
  const source = { projects: [{ id: "p1", panels: [{ id: "a" }, { id: "b" }] }], state: { loopCards: [1] } };
  const projectAdmin = sanitizeWorkspaceForUser(source, { globalPermissions: ["projects:manage"], projectPanels: {}, projectPermissions: {} }, permissions);
  assert.deepEqual(projectAdmin.projects[0].panels, []);
  assert.equal(projectAdmin.state.loopCards, undefined);
  const panelAdmin = sanitizeWorkspaceForUser(source, { globalPermissions: ["panels:all"] }, permissions);
  assert.deepEqual(panelAdmin, source);
});
