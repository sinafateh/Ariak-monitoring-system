import { apiFetch } from "./api-client.js";

const revisionOrZero = (value) => (Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0);

export function createWorkspaceStore(request = apiFetch) {
  let workspaceRevision = 0;
  const panelRevisions = new Map();
  const panelKey = (projectId, panelId) => `${projectId}:${panelId}`;

  async function readResponse(response) {
    return response.json().catch(() => null);
  }

  async function loadWorkspace() {
    const response = await request("/api/state", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`State API returned ${response.status}`);
    const result = await readResponse(response);
    workspaceRevision = revisionOrZero(result?.version);
    return result || {};
  }

  async function loadPanelSettings(projectId, panelId) {
    const endpoint = `/api/projects/${encodeURIComponent(projectId)}/panels/${encodeURIComponent(panelId)}/settings`;
    const response = await request(endpoint, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Panel settings API returned ${response.status}`);
    const result = await readResponse(response);
    panelRevisions.set(panelKey(projectId, panelId), revisionOrZero(result?.revision));
    return result || {};
  }

  async function savePanelSettings(
    projectId,
    panelId,
    payload,
    expectedRevision = getPanelRevision(projectId, panelId),
  ) {
    const endpoint = `/api/projects/${encodeURIComponent(projectId)}/panels/${encodeURIComponent(panelId)}/settings`;
    const response = await request(endpoint, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "If-Match": `"panel-${revisionOrZero(expectedRevision)}"`,
      },
      body: JSON.stringify(payload),
    });
    const result = await readResponse(response);
    if (response.ok && result?.revision !== undefined) {
      panelRevisions.set(panelKey(projectId, panelId), revisionOrZero(result.revision));
    }
    return { ok: response.ok, status: response.status, result };
  }

  async function saveWorkspace(payload, panelSettings = null) {
    const response = await request("/api/state", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "If-Match": `"${workspaceRevision}"`,
      },
      body: JSON.stringify({ payload, ...(panelSettings ? { panelSettings } : {}) }),
    });
    const result = await readResponse(response);
    if (response.ok) {
      if (result?.version !== undefined) workspaceRevision = revisionOrZero(result.version);
      if (panelSettings && result?.panelSettingsRevision !== undefined) {
        panelRevisions.set(
          panelKey(panelSettings.projectId, panelSettings.panelId),
          revisionOrZero(result.panelSettingsRevision),
        );
      }
    }
    return { ok: response.ok, status: response.status, result };
  }

  function getPanelRevision(projectId, panelId) {
    return panelRevisions.get(panelKey(projectId, panelId)) ?? 0;
  }

  return Object.freeze({
    loadWorkspace,
    loadPanelSettings,
    savePanelSettings,
    saveWorkspace,
    getPanelRevision,
  });
}
