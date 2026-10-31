import test from "node:test";
import assert from "node:assert/strict";
import { navigateApplication } from "./router.js";

function setup(button, initialState = {}) {
  const state = { view: "projects", projectImagesProjectId: "project-1", panelDirectoryPanelId: "panel-1", ...initialState };
  const projects = [{ id: "project-1", panels: [{ id: "panel-1" }] }];
  const events = [];
  return {
    state,
    projects,
    events,
    navigate: (canLeave = async () => true) =>
      navigateApplication(button, {
        state,
        projects,
        canLeave,
        transition: (callback) => { events.push("transition"); callback(); },
        closeMenu: () => events.push("close"),
        render: () => events.push("render"),
      }),
  };
}

test("workspace navigation selects the first project and panel when none is selected", async () => {
  const app = setup({ dataset: { navView: "workspace" } });
  const navigated = await app.navigate();

  assert.equal(navigated, true);
  assert.equal(app.state.view, "workspace");
  assert.equal(app.state.selectedProjectId, "project-1");
  assert.equal(app.state.selectedPanelId, "panel-1");
  assert.deepEqual(app.events, ["transition", "close", "render"]);
});

test("navigation honors a blocked view transition", async () => {
  const app = setup({ dataset: { navView: "panels" } });
  const navigated = await app.navigate(async () => false);

  assert.equal(navigated, false);
  assert.equal(app.state.view, "projects");
  assert.deepEqual(app.events, []);
});

test("project images and panel routes reset their scoped selection", async () => {
  const images = setup({ dataset: { navView: "project-images" } });
  await images.navigate();
  assert.equal(images.state.projectImagesProjectId, null);

  const panels = setup({ dataset: { navView: "panels" } });
  await panels.navigate();
  assert.equal(panels.state.panelDirectoryPanelId, null);
});
