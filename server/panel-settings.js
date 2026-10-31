import { findLoopCardLimitViolation } from "../shared/domain-constraints.js";

export const PANEL_SETTING_KEYS = [
  "year", "month", "day", "hour", "minute", "dailyDayNightEnabled", "nightStartHour", "nightStartMinute", "nightEndHour", "nightEndMinute",
  "weekendEnabled", "weekendDay1", "weekendDay2", "holidayEnabled", "holidayYear", "holidayMonth", "holidayDay", "holidayDates",
  "loopCards", "formValues", "groupTab", "zoneGroupNumber", "zoneLoopCardId", "zonePreAlarm", "zoneGroups", "ioInputGroupNumber", "ioOutputGroupNumber",
  "ioLoopCardId", "ioGroups", "ioInputGroups", "ioOutputGroups", "ioRelations", "ioSavedRelations",
];

const clone = (value) => JSON.parse(JSON.stringify(value));

export function validatePanelSettings(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return { ok: false, error: "Settings must be an object" };
  const keys = Object.keys(settings);
  if (keys.some((key) => !PANEL_SETTING_KEYS.includes(key))) return { ok: false, error: "Unknown or protected setting field" };
  if (Buffer.byteLength(JSON.stringify(settings), "utf8") > 1_000_000) return { ok: false, error: "Settings are too large" };
  const loopCardViolation = findLoopCardLimitViolation(settings, "settings");
  if (loopCardViolation) return { ok: false, error: "At most two loop cards are allowed", code: "LOOP_CARD_LIMIT_EXCEEDED", field: loopCardViolation.path };
  if (settings.language !== undefined && !["fa", "en"].includes(settings.language)) return { ok: false, error: "Invalid language" };
  return { ok: true, settings: clone(settings) };
}

export function redactPanelSecrets(value) {
  if (Array.isArray(value)) return value.map(redactPanelSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    /password|token|secret|credential|api.?key/i.test(key) ? "[redacted]" : redactPanelSecrets(item),
  ]));
}

export function sanitizeWorkspaceForUser(payload, user, { hasGlobalPermission, hasProjectPermission }) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const copy = clone(payload);
  const allProjects = hasGlobalPermission(user, "projects:all") || hasGlobalPermission(user, "projects:manage") || hasGlobalPermission(user, "panels:all") || hasGlobalPermission(user, "*");
  const allPanels = hasGlobalPermission(user, "panels:all") || hasGlobalPermission(user, "*");
  if (allPanels) return copy;
  const grants = user.projectPanels || {};
  const allowedPanels = new Set(Object.values(grants).flat().map(String));
  if (Array.isArray(copy.projects)) copy.projects = copy.projects.filter((project) =>
    allProjects || Boolean(grants[project.id]?.length) || hasProjectPermission(user, project.id, "project:manage"),
  ).map((project) => ({ ...project, panels: (project.panels || []).filter((panel) => (grants[project.id] || []).includes(String(panel.id))) }));
  if (copy.state && typeof copy.state === "object") {
    for (const key of PANEL_SETTING_KEYS) delete copy.state[key];
    if (Array.isArray(copy.state.savedSettingFiles)) copy.state.savedSettingFiles = copy.state.savedSettingFiles.filter((file) => allowedPanels.has(String(file.panelId)));
    const projects = Array.isArray(copy.projects) ? copy.projects : [];
    const selectedProject = projects.find((project) => String(project.id) === String(copy.state.selectedProjectId)) || projects[0];
    copy.state.selectedProjectId = selectedProject?.id || null;
    if (!selectedProject?.panels?.some((panel) => String(panel.id) === String(copy.state.selectedPanelId))) {
      copy.state.selectedPanelId = selectedProject?.panels?.[0]?.id || null;
    }
  }
  return copy;
}
