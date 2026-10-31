const APPLICATION_ROUTE_KEY = "__ariakMonitoringRoute";
const APPLICATION_VIEWS = new Set([
  "projects", "project-images", "workspace", "talk", "floor-plans", "panels",
  "panel-detail", "user-management", "activity-report",
]);

const routeSnapshot = (state) => ({
  view: state.view,
  selectedProjectId: state.selectedProjectId == null ? null : String(state.selectedProjectId),
  selectedPanelId: state.selectedPanelId == null ? null : String(state.selectedPanelId),
  selectedSettingId: typeof state.selectedSettingId === "string" ? state.selectedSettingId : "date-time",
  projectImagesProjectId: state.projectImagesProjectId == null ? null : String(state.projectImagesProjectId),
  panelDirectoryPanelId: state.panelDirectoryPanelId == null ? null : String(state.panelDirectoryPanelId),
  panelDirectoryTab: ["status", "settings", "events"].includes(state.panelDirectoryTab) ? state.panelDirectoryTab : "status",
});

const routeFromHistoryState = (historyState, projects) => {
  const saved = historyState?.[APPLICATION_ROUTE_KEY];
  if (!saved || typeof saved !== "object" || !APPLICATION_VIEWS.has(saved.view)) return null;

  const project = projects.find((item) => String(item.id) === String(saved.selectedProjectId)) || null;
  const panel = project?.panels?.find((item) => String(item.id) === String(saved.selectedPanelId)) || null;
  let view = saved.view;
  if (view === "workspace" && !project) view = "projects";
  if (view === "panel-detail" && !panel) view = "panels";
  const imageProject = projects.find((item) => String(item.id) === String(saved.projectImagesProjectId));
  const detailPanel = projects.some((item) => item.panels?.some((candidate) => String(candidate.id) === String(saved.panelDirectoryPanelId)))
    ? String(saved.panelDirectoryPanelId)
    : null;

  return {
    view,
    selectedProjectId: project?.id ?? null,
    selectedPanelId: panel?.id ?? null,
    selectedSettingId: typeof saved.selectedSettingId === "string" ? saved.selectedSettingId : "date-time",
    projectImagesProjectId: imageProject?.id ?? null,
    panelDirectoryPanelId: detailPanel,
    panelDirectoryTab: ["status", "settings", "events"].includes(saved.panelDirectoryTab) ? saved.panelDirectoryTab : "status",
  };
};

const stateWithRoute = (currentState, route) => ({
  ...(currentState && typeof currentState === "object" ? currentState : {}),
  [APPLICATION_ROUTE_KEY]: route,
});

export async function navigateApplication(
  button,
  { state, projects, canLeave = async () => true, transition, closeMenu, render },
) {
  if (!(await canLeave())) return false;

  transition(() => {
    state.view = button.dataset.navView;
    if (button.dataset.navSetting) state.selectedSettingId = button.dataset.navSetting;
    if (state.view === "project-images") state.projectImagesProjectId = null;
    if (state.view === "panels") state.panelDirectoryPanelId = null;
    if (state.view === "workspace" && !state.selectedProjectId) {
      const firstProject = projects[0];
      if (!firstProject) {
        state.view = "projects";
      } else {
        state.selectedProjectId = firstProject.id;
        state.selectedPanelId = firstProject.panels[0]?.id || null;
      }
    }
    closeMenu();
    render();
  });
  return true;
}

export function bindApplicationRouter({ root = document, state, projects, canLeave, transition, closeMenu, render }) {
  const currentRoute = routeSnapshot(state);
  window.history.replaceState(stateWithRoute(window.history.state, currentRoute), "", window.location.href);

  const syncHistory = () => {
    const nextRoute = routeSnapshot(state);
    const activeRoute = window.history.state?.[APPLICATION_ROUTE_KEY];
    if (activeRoute && JSON.stringify(activeRoute) === JSON.stringify(nextRoute)) return;
    window.history.pushState(stateWithRoute(window.history.state, nextRoute), "", window.location.href);
  };

  let handlingPopState = false;
  window.addEventListener("popstate", async (event) => {
    if (handlingPopState) return;
    handlingPopState = true;
    const target = routeFromHistoryState(event.state, projects);
    if (target && JSON.stringify(target) === JSON.stringify(routeSnapshot(state))) {
      handlingPopState = false;
      return;
    }
    let allowed = false;
    try { allowed = typeof canLeave !== "function" || await canLeave(); } catch { allowed = false; }
    if (!allowed) {
      window.history.forward();
      handlingPopState = false;
      return;
    }

    if (!target) {
      handlingPopState = false;
      return;
    }
    const applyRoute = () => {
      state.view = target.view;
      state.selectedProjectId = target.selectedProjectId;
      state.selectedPanelId = target.selectedPanelId;
      state.selectedSettingId = target.selectedSettingId;
      state.projectImagesProjectId = target.projectImagesProjectId;
      state.panelDirectoryPanelId = target.panelDirectoryPanelId;
      state.panelDirectoryTab = target.panelDirectoryTab;
      closeMenu();
      render();
      handlingPopState = false;
    };
    const cancelRoute = () => {
      window.history.forward();
      handlingPopState = false;
    };
    transition(applyRoute, cancelRoute);
  });

  root.querySelectorAll("[data-nav-view]").forEach((button) => {
    button.addEventListener("click", () => {
      void navigateApplication(button, { state, projects, canLeave, transition, closeMenu, render });
    });
  });

  return syncHistory;
}
