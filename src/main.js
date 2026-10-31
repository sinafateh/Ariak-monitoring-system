import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/600.css";
import "@fontsource/vazirmatn/700.css";
import "@fontsource/vazirmatn/800.css";
import "@fontsource/vazirmatn/900.css";
import "./style.css";
import "./reference-admin.css";
import { bindUserManagement, renderUserManagement } from "./user-management.js";
import { bindActivityReport, renderActivityReport } from "./activity-report.js";
import { apiFetch } from "./api-client.js";
import { createWorkspaceStore } from "./workspace-store.js";
import { bindApplicationRouter } from "./router.js";
import { daysInMonth, englishMonthNames, englishWeekDays, formatDigits, monthNames, pad, todayJalali, toGregorian, weekDays } from "./format.js";
import { findLoopCardLimitViolation } from "../shared/domain-constraints.js";
import { createSamplePanelEvents } from "./event-history.js";
import { downloadXlsx } from "./xlsx-export.js";

const demoMode = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === "true";
const demoFaultPreviewEnabled = import.meta.env.DEV && import.meta.env.VITE_DEMO_FAULTS !== "false";
let demoData = null;
let demoFaultPreview = null;
const workspaceStore = createWorkspaceStore();
const UI_PREFERENCES_KEY = "monitoring-ui-preferences";
let activeLanguage = localStorage.getItem("fire-panel-language") || "fa";
let languagePopoverDismissalBound = false;
let sessionExpiryBound = false;
let sessionUser = null;
const panelEventProfilesCache = new Map();
const panelEventProfilesPending = new Set();
let workspaceDataError = "";
const faDigits = (value) => formatDigits(value, activeLanguage);
const createEntityId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const isSafeImageData = (value) => typeof value === "string" && /^data:image\/(?:png|jpeg|jpg|webp|gif|avif|bmp);base64,/i.test(value);
const isSafeImageSource = (value) => isSafeImageData(value) || /^\/project-defaults\/[a-z0-9_-]+\.svg$/i.test(String(value ?? ""));

const icons = {
  grid: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
  dashboard: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="4" rx="1.5"/><rect x="14" y="10" width="7" height="11" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>`,
  panel: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h2m4 0h2M8 15h2m4 0h2M8 18h8"/></svg>`,
  project: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 8-4 8 4v10l-8 4-8-4V7Z"/><path d="m4 7 8 4 8-4M12 11v10"/></svg>`,
  map: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15m6-12v15"/></svg>`,
  image: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 3.5 3 2.5-2 5 5"/></svg>`,
  message: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-9.5A7.5 7.5 0 0 1 10.5 4h2A7.5 7.5 0 0 1 20 11.5Z"/><path d="M8 11h8M8 14h5"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>`,
  report: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h16"/><path d="m7 15 3-4 3 2 5-7"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="m19.4 15 .1.1a2 2 0 0 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.3a2 2 0 0 1-4 0v-.2A2 2 0 0 0 5.8 18l-.1.1a2 2 0 1 1-2.8-2.8L3 15.2A2 2 0 0 0 1.6 12h-.1a2 2 0 0 1 0-4h.2A2 2 0 0 0 3 4.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A2 2 0 0 0 9.2.5h.2a2 2 0 0 1 4 0v.2a2 2 0 0 0 3.4 1.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A2 2 0 0 0 21 8h.2a2 2 0 0 1 0 4H21a2 2 0 0 0-1.6 3Z"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`,
  chevronUp: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>`,
  chevronLeft: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.7-4L3 10m0 0V5m0 5h5M4 13a8 8 0 0 0 14.7 4L21 14m0 0v5m0-5h-5"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
  x: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>`,
  user: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>`,
  wifi: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 8.5a15 15 0 0 1 20 0M5 12a10.5 10.5 0 0 1 14 0M8.5 15.5a5.5 5.5 0 0 1 7 0M12 19h.01"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`,
  qr: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM18 18h2v2h-2zM14 18h2v2h-2z"/></svg>`,
  location: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>`,
  info: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>`,
  fire: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22c4.4 0 7-3.1 7-7.1 0-3.2-1.8-5.6-4.2-8.9-.3 2.3-1.4 3.8-2.5 4.7-.3-3.2-2-5.8-4.8-8.7.1 3.7-1.2 5.6-2.2 7.5A10 10 0 0 0 4 15c0 4.1 3 7 8 7Z"/><path d="M12 22c2 0 3.4-1.5 3.4-3.5 0-1.4-.8-2.6-2.3-4.3-.2 1.4-.8 2.1-1.4 2.6-.3-1.4-1-2.4-2-3.4-.1 1.8-1.1 2.7-1.1 4.7 0 2.2 1.3 3.9 3.4 3.9Z"/></svg>`,
  alertTriangle: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 4.3 2.9 17.1A2 2 0 0 0 4.6 20h14.8a2 2 0 0 0 1.7-2.9L13.7 4.3a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 3h.01"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 17H3L12 3Z"/><path d="M12 9v5M12 17h.01"/></svg>`,
  arrowUpRight: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>`,
  loader: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.64 5.64l2.12 2.12M16.24 16.24l2.12 2.12M5.64 18.36l2.12-2.12M16.24 7.76l2.12-2.12"/></svg>`,
};

const RETIRED_LOOP_DEVICE_TYPES = new Set(["zone", "io"]);
const loopDeviceTypes = [
  { key: "smoke", fa: "دتکتور دود", en: "Smoke Detector", category: "other" },
  { key: "heat", fa: "دتکتور حرارت", en: "Heat Detector", category: "other" },
  { key: "multi", fa: "دتکتور ترکیبی", en: "Multi Detector", category: "other" },
  { key: "manual", fa: "شستی اعلام حریق", en: "Manual Call Point", category: "control" },
  { key: "sounder", fa: "آژیر / خروجی", en: "Sounder/Output", category: "relay" },
  { key: "input", fa: "ماژول ورودی", en: "Input Module", category: "control" },
];
const deviceIconFiles = {
  smoke: "detector-normal.svg",
  heat: "detector-normal.svg",
  multi: "detector-normal.svg",
  manual: "MANUAL.svg",
  sounder: "SOUNDER.svg",
  input: "module.webp",
};
const manualDeviceIconMarkup = "<svg class=\"device-type-icon manual-device-icon\" aria-hidden=\"true\" focusable=\"false\" id=\"Layer_1\" data-name=\"Layer 1\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><defs><style>.cls-1,.cls-2,.cls-4,.cls-5,.cls-6{fill:none;stroke:#06254b;stroke-miterlimit:10;}.cls-1{stroke-width:0.5px;}.cls-2{stroke-width:1.97px;}.cls-3{fill:#06254b;}.cls-4{stroke-width:0.25px;}.cls-5{stroke-width:0.36px;}.cls-6{stroke-width:0.14px;}</style></defs><rect class=\"manual-background\" x=\"0.3\" y=\"0.3\" width=\"31.4\" height=\"31.4\" rx=\"2.94\"/><rect class=\"manual-fill\" x=\"3.67\" y=\"11.32\" width=\"24.65\" height=\"15.72\" rx=\"1.07\"/><rect class=\"manual-fill\" x=\"9.51\" y=\"3.31\" width=\"12.98\" height=\"5.83\" rx=\"1.92\"/><rect class=\"manual-outline manual-outline-thin\" x=\"0.3\" y=\"0.3\" width=\"31.4\" height=\"31.4\" rx=\"2.94\"/><rect class=\"manual-outline manual-outline-thin\" x=\"3.67\" y=\"11.32\" width=\"24.65\" height=\"15.72\" rx=\"1.07\"/><line class=\"manual-outline manual-outline-heavy\" x1=\"20.98\" y1=\"18.49\" x2=\"23.65\" y2=\"18.49\"/><polygon class=\"manual-solid\" points=\"23.07 20.46 26.48 18.49 23.07 16.52 23.07 20.46\"/><line class=\"manual-outline manual-outline-heavy\" x1=\"11.02\" y1=\"18.49\" x2=\"8.35\" y2=\"18.49\"/><polygon class=\"manual-solid\" points=\"8.93 16.52 5.52 18.49 8.93 20.46 8.93 16.52\"/><circle class=\"manual-solid\" cx=\"16\" cy=\"18.49\" r=\"1.91\"/><rect class=\"manual-outline manual-outline-fine\" x=\"9.51\" y=\"3.31\" width=\"12.98\" height=\"5.83\" rx=\"1.92\"/><path class=\"manual-outline manual-outline-light\" d=\"M12.69,28.19H3.88a1.31,1.31,0,0,1-1.3-1.31V11.63a1.3,1.3,0,0,1,1.3-1.3h24.2a1.31,1.31,0,0,1,1.31,1.3V26.88a1.31,1.31,0,0,1-1.31,1.31h-8.8\"/><path class=\"manual-outline manual-outline-light\" d=\"M19.38,28.27c0,1-1.52,1.76-3.4,1.76s-3.39-.78-3.39-1.76\"/><line class=\"manual-outline manual-outline-hairline\" x1=\"10.62\" y1=\"11.84\" x2=\"7.22\" y2=\"15.24\"/><line class=\"manual-outline manual-outline-hairline\" x1=\"13.68\" y1=\"11.98\" x2=\"11.12\" y2=\"14.54\"/><line class=\"manual-outline manual-outline-hairline\" x1=\"22.21\" y1=\"12.44\" x2=\"17.88\" y2=\"16.77\"/><line class=\"manual-outline manual-outline-hairline\" x1=\"14.28\" y1=\"21.57\" x2=\"10.09\" y2=\"25.77\"/><line class=\"manual-outline manual-outline-hairline\" x1=\"8.95\" y1=\"21.04\" x2=\"7.89\" y2=\"22.1\"/><line class=\"manual-outline manual-outline-hairline\" x1=\"7.89\" y1=\"20.24\" x2=\"5.06\" y2=\"23.07\"/><line class=\"manual-outline manual-outline-hairline\" x1=\"18.81\" y1=\"21.97\" x2=\"14.82\" y2=\"25.84\"/><line class=\"manual-outline manual-outline-hairline\" x1=\"23.41\" y1=\"16.37\" x2=\"26.34\" y2=\"13.04\"/></svg>";
const sounderDeviceIconMarkup = "<svg class=\"device-type-icon device-inline-icon device-inline-sounder\" aria-hidden=\"true\" focusable=\"false\" id=\"Layer_1\" data-name=\"Layer 1\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><defs><style>.cls-1,.cls-2,.cls-3,.cls-4,.cls-5{fill:none;stroke:#06254b;}.cls-1{stroke-linejoin:round;}.cls-1,.cls-2,.cls-4,.cls-5{stroke-width:0.5px;}.cls-2,.cls-3{stroke-linecap:round;}.cls-2,.cls-3,.cls-4{stroke-miterlimit:10;}.cls-3{stroke-width:0.25px;}.cls-5{stroke-miterlimit:10;}</style></defs><path class=\"device-hover-shape cls-1\" d=\"M6.84,4.6s2-1.81,2.8-2.36a11.79,11.79,0,0,1,13.27.11c.71.52,2.53,2.18,2.53,2.18S7.47,4.62,6.84,4.6Z\"/><path class=\"device-hover-shape cls-2\" d=\"M6.92,4.63s-.27,0-.3.35a3.6,3.6,0,0,1-.2.95,8.88,8.88,0,0,1-.61,1.24A2.41,2.41,0,0,0,7,7.49c.88.07,2.7.15,3.6.16,3.07,0,10.7-.11,12.28-.21a21.54,21.54,0,0,0,3.24-.36s0,0,.06,0a12.63,12.63,0,0,1-.65-2.31.22.22,0,0,0-.21-.22C25.13,4.51,7.23,4.63,6.92,4.63Z\"/><path class=\"device-hover-shape cls-2\" d=\"M5.81,7.17a.53.53,0,0,1-.2.1.56.56,0,0,0-.21.09.28.28,0,0,0-.09.18s-.08.56-.08.56a12.49,12.49,0,0,0,3.48.44c2.6.1,8.22.16,11.79.05A41.31,41.31,0,0,0,26.66,8a.93.93,0,0,0,0-.44.67.67,0,0,0-.2-.38.29.29,0,0,0-.29-.11A20.16,20.16,0,0,1,23,7.44c-1.08,0-12.23.42-15.95,0A2.74,2.74,0,0,1,5.81,7.17Z\"/><path class=\"device-hover-shape cls-2\" d=\"M5.24,8l-.37.11c-.41.07-.79.28-.76.78,0,.71,0,5.14,0,6.11a.36.36,0,0,0,.17.31,2.77,2.77,0,0,0,.38.22,11.13,11.13,0,0,0,2.7.75,46.58,46.58,0,0,0,8.11.45c3.25-.14,10.81-.28,12.36-2a.21.21,0,0,0,0-.13c.08-2.26-.11-6.26-.11-6.26s.06-.44-1.09-.65c0,.22,0,.12,0,.25a10.25,10.25,0,0,1-2.21.36c-1.83.18-5.92.32-7.28.29-.92,0-4.14,0-7-.05a20.5,20.5,0,0,1-5-.49A.34.34,0,0,0,5.24,8Z\"/><path class=\"device-hover-shape cls-2\" d=\"M4.24,15.29s-.19.05-.15.33c0,.1.25.29.33.35a8.43,8.43,0,0,0,2.86.86,43.93,43.93,0,0,0,8.16.56c1.36-.07,3.2-.06,5.37-.27a40.19,40.19,0,0,0,5.49-.89c1.07-.33,1.51-.71,1.59-1a.44.44,0,0,0-.12-.36,4.49,4.49,0,0,1-2.08.92c-.3.08-.65.16-1,.22a44.44,44.44,0,0,1-5,.53c-1.09,0-3.17.21-4.16.19-.51,0-1.91,0-3.42,0a38.1,38.1,0,0,1-3.92-.31,15.74,15.74,0,0,1-3.42-.82A5.77,5.77,0,0,1,4.24,15.29Z\"/><path class=\"device-hover-shape cls-2\" d=\"M27.87,15.29s-.29,9.17-.43,12.13c0,.09.13.7-1.48,1.78a12.5,12.5,0,0,1-4.34,1.62v.06l-.73.14-.16.1v.49l-9.81.14,0-.53-.53-.08-.15-.09a20.6,20.6,0,0,1-2.86-.84c0-.15,0-8.86,0-8.86s-2.81-.5-3.17-1.41c0-.31,0-4.22,0-4.22s.17.15.39.31a5.2,5.2,0,0,0,1.62.57c.85.16,2.07.37,3.2.5s2.41.23,2.75.25c.19,0,1.51.08,3.15.06,1.83,0,4.06-.16,5.51-.28a31.78,31.78,0,0,0,5.53-.88,4,4,0,0,0,.59-.22A1.9,1.9,0,0,0,27.87,15.29Z\"/><circle class=\"device-hover-shape cls-3\" cx=\"15.56\" cy=\"18.88\" r=\"0.93\"/><circle class=\"device-hover-shape cls-3\" cx=\"15.56\" cy=\"18.88\" r=\"0.46\"/><path class=\"device-hover-shape cls-2\" d=\"M10.92,31.75,10.74,26A5.62,5.62,0,0,1,11,24.38a4.73,4.73,0,0,1,1-1.49,3.82,3.82,0,0,1,1.47-1,6.35,6.35,0,0,1,2-.4,6.44,6.44,0,0,1,2,.25,5.37,5.37,0,0,1,1.75.9,4.23,4.23,0,0,1,1.21,1.45A5.21,5.21,0,0,1,20.71,26l0,5.64Z\"/><path class=\"device-hover-shape cls-3\" d=\"M11.53,31.08l-.16-4.91a3.65,3.65,0,0,1,.07-.87,4.43,4.43,0,0,1,.39-1.09,4,4,0,0,1,.65-.87,4.08,4.08,0,0,1,1.26-.81,5.48,5.48,0,0,1,1.72-.41,6.27,6.27,0,0,1,1.73.22,4,4,0,0,1,1.42.81,4.7,4.7,0,0,1,.82.93,4.45,4.45,0,0,1,.49,1.16,7,7,0,0,1,.15,1.44L20.13,31Z\"/><ellipse class=\"device-hover-shape cls-3\" cx=\"15.67\" cy=\"26.25\" rx=\"3.7\" ry=\"3.52\"/><ellipse class=\"device-hover-shape cls-3\" cx=\"15.66\" cy=\"26.24\" rx=\"3.11\" ry=\"2.89\"/><ellipse class=\"device-hover-shape cls-3\" cx=\"15.78\" cy=\"25.85\" rx=\"2.71\" ry=\"2.52\"/><ellipse class=\"device-hover-shape cls-3\" cx=\"15.8\" cy=\"25.8\" rx=\"1.7\" ry=\"1.65\"/><path class=\"device-hover-shape cls-3\" d=\"M4.38,15.37s-.14.72,2.22,1.22a48.53,48.53,0,0,0,6.51.74c1.62,0,5.62-.14,5.62-.14s3.16-.21,5-.56a10.87,10.87,0,0,0,3.31-1c.74-.42.59-.66.59-.66a5.81,5.81,0,0,1-1.23.59,12.19,12.19,0,0,1-1.39.35c-.35.07-.64.12-1.39.23s-1.68.21-2.13.25c-1.42.14-4.27.24-5.7.28-.9,0-2.69,0-3.59,0-.46,0-1.38-.07-1.84-.1s-1.19-.1-1.62-.15-.55-.06-1.15-.16-1-.18-1.24-.24-.66-.17-1-.29a5.24,5.24,0,0,1-.58-.22A1.9,1.9,0,0,1,4.38,15.37Z\"/><line class=\"cls-4\" x1=\"7.72\" y1=\"4.62\" x2=\"7.02\" y2=\"7.48\"/><line class=\"cls-4\" x1=\"9.5\" y1=\"4.61\" x2=\"8.97\" y2=\"7.59\"/><line class=\"cls-4\" x1=\"11.19\" y1=\"4.6\" x2=\"10.76\" y2=\"7.62\"/><line class=\"cls-4\" x1=\"12.68\" y1=\"4.6\" x2=\"12.46\" y2=\"7.63\"/><line class=\"cls-4\" x1=\"14.44\" y1=\"4.59\" x2=\"14.44\" y2=\"7.63\"/><line class=\"cls-4\" x1=\"16.45\" y1=\"4.57\" x2=\"16.45\" y2=\"7.61\"/><line class=\"cls-4\" x1=\"18.45\" y1=\"4.56\" x2=\"18.51\" y2=\"7.52\"/><line class=\"cls-4\" x1=\"20.22\" y1=\"4.54\" x2=\"20.82\" y2=\"7.5\"/><line class=\"cls-4\" x1=\"22.18\" y1=\"4.53\" x2=\"23.19\" y2=\"7.39\"/><line class=\"cls-4\" x1=\"24.91\" y1=\"4.53\" x2=\"25.75\" y2=\"7.16\"/><line class=\"cls-4\" x1=\"23.79\" y1=\"4.5\" x2=\"24.51\" y2=\"7.33\"/><path class=\"device-hover-shape cls-5\" d=\"M6.84,4.6c.63,0,18.41-.07,18.6-.07\"/></svg>";
function deviceIconMarkup(typeKey) {
  if (typeKey === "manual") return manualDeviceIconMarkup;
  if (["smoke", "heat", "multi"].includes(typeKey)) return `<span class="device-type-icon device-detector-pair" aria-hidden="true"><img class="detector-icon-image detector-icon-normal" src="/icons/detector-normal.svg" alt="" loading="lazy" /><img class="detector-icon-image detector-icon-hover" src="/icons/detector-hover.svg" alt="" loading="lazy" /></span>`;
  if (typeKey === "sounder") return sounderDeviceIconMarkup;
  if (["input"].includes(typeKey)) return `<span class="device-type-icon device-icon-pair module-icon-pair" aria-hidden="true"><img class="device-pair-image module-icon-normal" src="/icons/module.webp" alt="" loading="lazy" width="512" height="511" /><img class="device-pair-image module-icon-hover" src="/icons/MODULE-hover.webp" alt="" loading="lazy" width="512" height="509" /></span>`;
  const file = deviceIconFiles[typeKey];
  if (!file) return `<span class="device-type-icon device-type-icon-empty" aria-hidden="true"></span>`;
  const className = ["input"].includes(typeKey)
    ? "device-type-icon module-device-icon"
    : "device-type-icon";
  return `<img class="${className}" src="/icons/${file}" alt="" aria-hidden="true" loading="lazy" />`;
}
const loopCategories = ["relay", "control", "other", "cl-b-s-b", "cl-b-s-c"];

function makeLoopDevice(cardId, number, typeKey, overrides = {}) {
  const type = loopDeviceTypes.find((item) => item.key === typeKey) || loopDeviceTypes[0];
  return {
    id: `${cardId}-device-${number}`,
    number,
    enabled: true,
    style: "class-b",
    type: type.key,
    category: type.category,
    ip: `001.${String(number).padStart(3, "0")}`,
    inputType: "alarm",
    deactivation: "silence",
    sensitivity: "medium",
    nightMode: "day",
    location: "",
    ...overrides,
  };
}

const today = todayJalali();
localStorage.removeItem("fire-panel-managed-users");
localStorage.removeItem("fire-panel-panel-users");
localStorage.removeItem("fire-panel-user-accounts");
const SETTINGS_FILES_STORAGE_KEY = "fire-panel-settings-files";
localStorage.removeItem(SETTINGS_FILES_STORAGE_KEY);
const SETTINGS_SNAPSHOT_KEYS = [
  "year", "month", "day", "hour", "minute",
  "dailyDayNightEnabled", "nightStartHour", "nightStartMinute", "nightEndHour", "nightEndMinute",
  "weekendEnabled", "weekendDay1", "weekendDay2", "holidayEnabled", "holidayYear", "holidayMonth", "holidayDay", "holidayDates",
  "loopCards", "formValues",
  "groupTab", "zoneGroupNumber", "zoneLoopCardId", "zonePreAlarm", "zoneGroups",
  "ioInputGroupNumber", "ioOutputGroupNumber", "ioLoopCardId", "ioGroups", "ioInputGroups", "ioOutputGroups", "ioRelations", "ioSavedRelations"
];
// The interface language is stored as a browser preference, not as an
// editable panel setting, so it must never make a workspace draft dirty.
const SCOPED_PANEL_SETTINGS_KEYS = [...SETTINGS_SNAPSHOT_KEYS];
const cloneSettingsData = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
function hasUncommittedSettingsChanges() {
  if (!state.settingsBaselineSnapshot) return Boolean(state.settingsDirty);
  return JSON.stringify(captureSettingsSnapshot()) !== JSON.stringify(state.settingsBaselineSnapshot);
}
function persistSettingsFiles() {
  localStorage.removeItem(SETTINGS_FILES_STORAGE_KEY);
}
function captureSettingsSnapshot() {
  return SETTINGS_SNAPSHOT_KEYS.reduce((snapshot, key) => {
    snapshot[key] = cloneSettingsData(state[key]);
    return snapshot;
  }, {});
}
function syncGenericSettingControls() {
  const detail = document.querySelector(".detail-body");
  if (!detail) return;
  const controls = [...detail.querySelectorAll("[data-persist-setting]")];
  if (!controls.length) return;
  state.formValues ||= {};
  state.formValues[state.selectedSettingId] = controls.map((control) => ({
    type: control.type || control.tagName.toLowerCase(),
    value: control.value,
    checked: control.type === "checkbox" || control.type === "radio" ? control.checked : undefined,
  }));
}
function restoreGenericSettingControls() {
  const values = state.formValues?.[state.selectedSettingId];
  if (!Array.isArray(values)) return;
  const controls = [...document.querySelectorAll(".detail-body [data-persist-setting]")];
  controls.forEach((control, index) => {
    const saved = values[index];
    if (!saved) return;
    if (control.type === "checkbox" || control.type === "radio") control.checked = Boolean(saved.checked);
    else if (saved.value !== undefined) control.value = saved.value;
  });
}
function applySettingsSnapshot(snapshot) {
  if (!snapshot) return;
  SETTINGS_SNAPSHOT_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(snapshot, key)) state[key] = cloneSettingsData(snapshot[key]);
  });
  state.loopCards = repairLoopCardLocations(state.loopCards).loopCards;
  state.settingsDirty = false;
  state.settingsBaselineSnapshot = cloneSettingsData(snapshot);
  activeLanguage = state.language;
  localStorage.setItem("fire-panel-language", state.language);
}
function createSettingsFile(name, source = "draft") {
  const panel = findPanel();
  const now = new Date().toISOString();
  return {
    id: `settings-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    panelId: panel?.id || null,
    panelName: panel?.name || "",
    source,
    createdAt: now,
    updatedAt: now,
    snapshot: captureSettingsSnapshot(),
  };
}
const state = {
  year: today[0], month: today[1], day: today[2],
  draftYear: today[0], draftMonth: today[1], draftDay: today[2],
  hour: new Date().getHours(), minute: new Date().getMinutes(),
  draftHour: new Date().getHours(), draftMinute: new Date().getMinutes(),
  calendarOpen: false, calendarMode: "days", calendarYearPage: Math.floor(today[0] / 12) * 12,
  timeOpen: false, sidebarOpen: false, sidebarCollapsed: false,
  dailyDayNightEnabled: true, nightStartHour: 22, nightStartMinute: 0, nightEndHour: 7, nightEndMinute: 0,
  weekendEnabled: true, weekendDay1: "friday", weekendDay2: "thursday", holidayEnabled: false,
  nightTimeOpen: null, draftNightStartHour: 22, draftNightStartMinute: 0, draftNightEndHour: 7, draftNightEndMinute: 0,
  holidayYear: today[0], holidayMonth: 1, holidayDay: 1,
  draftHolidayYear: today[0], draftHolidayMonth: 1, draftHolidayDay: 1,
  holidayCalendarOpen: false, holidayCalendarMode: "days", holidayCalendarYearPage: Math.floor(today[0] / 12) * 12,
  selectedHolidayIndex: 0, holidayDates: [{ year: today[0], month: 1, day: 1 }, { year: today[0], month: 1, day: 13 }],
  view: "projects", selectedProjectId: null, selectedPanelId: null, panelDirectoryPanelId: null, panelDirectoryTab: "status", connectedPanelId: null, selectedSettingId: "date-time",
  projectMenuOpen: false, panelMenuOpen: false, settingsTreeCollapsed: true, projectImagesProjectId: null,
  selectedLoopCardId: "loop-1", loopDeviceFilter: "all", loopOnlyPresent: false, loopOnlyActive: false, selectedLoopDeviceId: null, loopAddError: "", loopAddressConflict: null, loopCards: [],
  groupTab: "zone", zoneGroupNumber: 1, zoneLoopCardId: "loop-1", zonePreAlarm: {}, zoneGroups: {},
  ioInputGroupNumber: 1, ioOutputGroupNumber: 1, ioLoopCardId: "loop-1", ioGroups: {}, ioInputGroups: {}, ioOutputGroups: {}, ioRelations: {}, ioSavedRelations: {}, groupSelectedDeviceKey: null, groupPreviewOpen: false, groupRelationCollapsed: false, groupConnectionWarningOpen: false,
  language: localStorage.getItem("fire-panel-language") || "fa",
  openSettingsSections: { system: true, gsm: true },
  savedSettingFiles: [], selectedSavedSettingFileId: null, settingsDirty: false, settingsBaselineSnapshot: null, formValues: {}, passwordConfirmations: {}, passwordEditing: {},
};
let syncApplicationHistory = () => {};
if (localStorage.getItem("fire-panel-theme") === "dark") document.documentElement.classList.add("dark");

const projects = [];

state.ioSavedRelations = {};
state.settingsBaselineSnapshot = captureSettingsSnapshot();
let DEFAULT_PANEL_SETTINGS = captureSettingsSnapshot();

// Navigation and appearance are browser-local preferences. Saving them with
// each workspace edit caused unrelated changes to rewrite the whole workspace.
const APP_STATE_KEYS = [];
const APPLICATION_STATE_CACHE_KEY = "fire-panel-application-state-cache";
localStorage.removeItem(APPLICATION_STATE_CACHE_KEY);
let databasePersistenceReady = false;
let databaseSaveTimer = null;
let databaseSaveChain = Promise.resolve();
let applicationSaveFailure = false;
let lastSaveWasWorkspace = false;
let saveFailureWarningBound = false;
let loadedPanelSettingsKey = "";
let loadingPanelSettingsKey = "";
let loadingPanelSettingsPromise = null;
let workspaceWriteAllowed = false;

function loadSelectedPanelSettings() {
  if (demoMode) return Promise.resolve(true);
  const projectId = state.selectedProjectId, panelId = state.selectedPanelId;
  if (!projectId || !panelId) return Promise.resolve();
  const key = `${projectId}:${panelId}`;
  if (loadedPanelSettingsKey === key) return Promise.resolve();
  if (loadingPanelSettingsKey === key) return loadingPanelSettingsPromise;
  loadingPanelSettingsKey = key;
  loadingPanelSettingsPromise = (async () => { try {
    const result = await workspaceStore.loadPanelSettings(projectId, panelId);
    if (state.selectedProjectId !== projectId || state.selectedPanelId !== panelId) return;
    const limitViolation = findLoopCardLimitViolation({ settings: result.settings, savedSettingFiles: result.savedSettingFiles });
    if (limitViolation) {
      workspaceDataError = `Stored panel settings exceed the two-card limit (${limitViolation.path}).`;
      renderApp();
      return false;
    }
    for (const name of SCOPED_PANEL_SETTINGS_KEYS) state[name] = cloneSettingsData(DEFAULT_PANEL_SETTINGS[name]);
    for (const name of SCOPED_PANEL_SETTINGS_KEYS) if (Object.hasOwn(result.settings || {}, name)) state[name] = cloneSettingsData(result.settings[name]);
    state.savedSettingFiles = result.savedSettingFiles || [];
    loadedPanelSettingsKey = key;
    state.settingsBaselineSnapshot = captureSettingsSnapshot();
    state.settingsDirty = false;
    renderApp();
    return true;
  } catch (error) {
    showToast(state.language === "en" ? "Could not load panel settings." : "بارگیری تنظیمات پنل ناموفق بود.", "error");
    console.warn("Panel settings load failed:", error);
    return false;
  } finally { if (loadingPanelSettingsKey === key) { loadingPanelSettingsKey = ""; loadingPanelSettingsPromise = null; } } })();
  return loadingPanelSettingsPromise;
}

function isCorruptedText(value) {
  const text = String(value ?? "").trim();
  return !text || /^\?+(?:\s+\?+)*$/.test(text);
}

function isQuestionMarkCorruption(value) {
  const text = String(value ?? "").trim();
  return /\?{2,}/.test(text) && /^[\s?/:._-]+$/.test(text);
}

let defaultLoopDeviceLocations = new Map();

function repairLoopCardLocations(loopCards) {
  if (!Array.isArray(loopCards)) return { loopCards, repaired: false };
  let repaired = false;
  const result = loopCards.map((card) => ({
    ...card,
    devices: (card.devices || []).filter((device) => {
      if (!RETIRED_LOOP_DEVICE_TYPES.has(device?.type)) return true;
      repaired = true;
      return false;
    }).map((device) => {
      if (!isQuestionMarkCorruption(device.location)) return device;
      repaired = true;
      return { ...device, location: defaultLoopDeviceLocations.get(device.id) || (activeLanguage === "en" ? "Location not set" : "موقعیت ثبت‌نشده") };
    }),
  }));
  return { loopCards: result, repaired };
}

function repairSavedLoopCardLocations(files) {
  if (!Array.isArray(files)) return { files, repaired: false };
  let repaired = false;
  const result = files.map((file) => {
    if (!Array.isArray(file.snapshot?.loopCards)) return file;
    const normalized = repairLoopCardLocations(file.snapshot.loopCards);
    repaired ||= normalized.repaired;
    return normalized.repaired ? { ...file, snapshot: { ...file.snapshot, loopCards: normalized.loopCards } } : file;
  });
  return { files: result, repaired };
}

function persistUiPreferences() {
  try {
    localStorage.setItem(UI_PREFERENCES_KEY, JSON.stringify({
      view: state.view,
      selectedProjectId: state.selectedProjectId,
      selectedPanelId: state.selectedPanelId,
      selectedSettingId: state.selectedSettingId,
      sidebarCollapsed: state.sidebarCollapsed,
      openSettingsSections: state.openSettingsSections,
    }));
  } catch { /* UI preferences are optional and never block project work. */ }
}

function restoreUiPreferences() {
  try {
    const preferences = JSON.parse(localStorage.getItem(UI_PREFERENCES_KEY) || "null");
    if (!preferences || typeof preferences !== "object") return;
    const project = projects.find((item) => String(item.id) === String(preferences.selectedProjectId));
    const panel = project?.panels?.find((item) => String(item.id) === String(preferences.selectedPanelId));
    const allowedViews = new Set(["projects", "project-images", "workspace", "talk", "floor-plans", "panels", "panel-detail", "user-management", "activity-report"]);
    if (allowedViews.has(preferences.view)) state.view = preferences.view;
    if (project) state.selectedProjectId = project.id;
    if (panel) state.selectedPanelId = panel.id;
    if (typeof preferences.selectedSettingId === "string") state.selectedSettingId = preferences.selectedSettingId;
    if (typeof preferences.sidebarCollapsed === "boolean") state.sidebarCollapsed = preferences.sidebarCollapsed;
    if (preferences.openSettingsSections && typeof preferences.openSettingsSections === "object" && !Array.isArray(preferences.openSettingsSections)) {
      state.openSettingsSections = preferences.openSettingsSections;
    }
    if (["workspace", "panel-detail"].includes(state.view) && !project) state.view = "projects";
    if (state.view === "workspace" && !panel && project) state.selectedPanelId = project.panels[0]?.id || null;
  } catch { localStorage.removeItem(UI_PREFERENCES_KEY); }
}

function loopDeviceLocationLabel(device) {
  if (isQuestionMarkCorruption(device?.location)) return defaultLoopDeviceLocations.get(device.id) || (activeLanguage === "en" ? "Location not set" : "موقعیت ثبت‌نشده");
  return device?.location || "—";
}

function normalizeProjectGallery(project) {
  const rawImages = Array.isArray(project.images) ? project.images : [];
  const gallery = rawImages.map((item, index) => {
    const source = typeof item === "string" ? item : item?.src || item?.image || "";
    if (!isSafeImageSource(source)) return null;
    return {
      id: String(typeof item === "string" ? `${project.id}-image-${index + 1}` : item.id || `${project.id}-image-${index + 1}`),
      src: source,
      name: typeof item === "object" ? String(item.name || "") : "",
      createdAt: typeof item === "object" ? item.createdAt || null : null,
    };
  }).filter(Boolean);
  const cover = isSafeImageSource(project.image) ? project.image : "";
  if (cover && !gallery.some((item) => item.src === cover)) {
    gallery.unshift({ id: `${project.id}-cover`, src: cover, name: "", createdAt: null });
  }
  return gallery;
}

function ensureProjectPanelNumbers(project) {
  const panels = Array.isArray(project?.panels) ? project.panels : [];
  const used = new Set();
  let next = 0;
  panels.forEach((panel) => {
    const number = Number(panel.number);
    if (Number.isInteger(number) && number > 0 && !used.has(number)) {
      panel.number = number;
      used.add(number);
      next = Math.max(next, number);
      return;
    }
    while (used.has(next + 1)) next++;
    panel.number = ++next;
    used.add(panel.number);
  });
  return project;
}

function normalizePersistedProjects(items) {
  const defaults = new Map(projects.map((project) => [project.id, project]));
  return items.map((project) => {
    const fallback = defaults.get(project.id);
    if (!fallback) return ensureProjectPanelNumbers({ ...project, images: normalizeProjectGallery(project) });
    const normalized = { ...fallback, ...project };
    if (isCorruptedText(project.name)) normalized.name = fallback.name;
    if (isCorruptedText(project.location)) normalized.location = fallback.location;
    if (isCorruptedText(project.type)) normalized.type = fallback.type;
    if (isCorruptedText(project.status)) normalized.status = fallback.status;
    // An explicit empty string means the user intentionally removed the image.
    // Only missing or malformed persisted values should fall back to the sample image.
    if (!Object.prototype.hasOwnProperty.call(project, "image") || (project.image !== "" && !isSafeImageSource(project.image))) normalized.image = fallback.image;
    normalized.images = normalizeProjectGallery(normalized);
    if (Array.isArray(project.panels)) {
      const fallbackPanels = new Map(fallback.panels.map((panel) => [panel.id, panel]));
      normalized.panels = project.panels.map((panel) => {
        const fallbackPanel = fallbackPanels.get(panel.id);
        if (!fallbackPanel) return panel;
        const normalizedPanel = { ...panel };
        if (isCorruptedText(panel.name)) normalizedPanel.name = fallbackPanel.name;
        if (isCorruptedText(panel.status)) normalizedPanel.status = fallbackPanel.status;
        return normalizedPanel;
      });
    }
    return ensureProjectPanelNumbers(normalized);
  });
}

function captureApplicationState() {
  const persistedState = APP_STATE_KEYS.reduce((snapshot, key) => {
    snapshot[key] = cloneSettingsData(state[key]);
    return snapshot;
  }, {});
  return {
    version: 1,
    projects: cloneSettingsData(projects),
    state: persistedState,
  };
}

function applyApplicationState(payload) {
  if (!payload || typeof payload !== "object") return;
  let repairedText = false;
  if (Array.isArray(payload.projects)) {
    const missingPanelNumbers = payload.projects.some((project) => {
      const numbers = new Set();
      return project.panels?.some((panel) => {
        const number = Number(panel.number);
        const invalid = !Number.isInteger(number) || number < 1 || numbers.has(number);
        numbers.add(number);
        return invalid;
      });
    });
    projects.splice(0, projects.length, ...normalizePersistedProjects(cloneSettingsData(payload.projects)));
    repairedText ||= missingPanelNumbers;
  }
  const savedState = payload.state && typeof payload.state === "object" ? payload.state : {};
  APP_STATE_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(savedState, key)) state[key] = cloneSettingsData(savedState[key]);
  });
  if (state.selectedSettingId === "loop-active" || state.selectedSettingId === "network" || state.selectedSettingId === "language") {
    state.selectedSettingId = "date-time";
    repairedText = true;
  }
  if (state.openSettingsSections && Object.prototype.hasOwnProperty.call(state.openSettingsSections, "advanced")) {
    delete state.openSettingsSections.advanced;
    repairedText = true;
  }
  const normalizedLoopCards = repairLoopCardLocations(state.loopCards);
  state.loopCards = normalizedLoopCards.loopCards;
  repairedText ||= normalizedLoopCards.repaired;
  if (Array.isArray(savedState.savedSettingFiles)) state.savedSettingFiles = savedState.savedSettingFiles.map((file) => {
    if (!file?.snapshot || typeof file.snapshot !== "object") return file;
    const { userAccounts: _oldUsers, panelUserAccounts: _oldPanelUsers, ...snapshot } = file.snapshot;
    return { ...file, snapshot };
  });
  const normalizedSavedFiles = repairSavedLoopCardLocations(state.savedSettingFiles);
  state.savedSettingFiles = normalizedSavedFiles.files;
  repairedText ||= normalizedSavedFiles.repaired;
  activeLanguage = state.language || "fa";
  localStorage.setItem("fire-panel-language", activeLanguage);
  if (!localStorage.getItem("fire-panel-theme")) {
    if (payload.darkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }
  state.settingsBaselineSnapshot = captureSettingsSnapshot();
  state.settingsDirty = false;
  return repairedText;
}

async function loadApplicationState() {
  if (demoMode) {
    databasePersistenceReady = false;
    return false;
  }
  try {
    const result = await workspaceStore.loadWorkspace();
    if (result.payload) {
      const limitViolation = findLoopCardLimitViolation(result.payload);
      if (limitViolation) {
        workspaceDataError = `Stored workspace data exceeds the two-card limit (${limitViolation.path}).`;
        databasePersistenceReady = false;
        return false;
      }
      applyApplicationState(result.payload);
    }
    restoreUiPreferences();
    databasePersistenceReady = true;
    return Boolean(result.payload);
  } catch (error) {
    databasePersistenceReady = false;
    console.warn("PostgreSQL state load failed; protected workspace data was not loaded from local cache.", error);
    return false;
  }
}

function queueApplicationStateSave() {
  if (!databasePersistenceReady) return;
  clearTimeout(databaseSaveTimer);
  databaseSaveTimer = setTimeout(() => {
    databaseSaveTimer = null;
    void saveApplicationStateNow();
  }, 350);
}

async function updateFloorPlanDeviceAddress({ panelId, loopCardId, deviceId, address, conflictResolution = "reject", replacementAddress }) {
  const english = state.language === "en";
  const nextAddress = Number(String(address ?? "").trim());
  if (!Number.isInteger(nextAddress) || nextAddress < 1 || nextAddress > 254) return { ok: false, error: english ? "Address must be a whole number from 1 to 254." : "آدرس باید عدد صحیحی بین 1 تا 254 باشد." };
  const project = projects.find((item) => item.panels.some((panel) => String(panel.id) === String(panelId)));
  if (!project) return { ok: false, error: english ? "Panel not found." : "پنل پیدا نشد." };
  try {
    const loaded = await workspaceStore.loadPanelSettings(project.id, panelId);
    const settings = loaded.settings || {};
    const files = loaded.savedSettingFiles || [];
    const saved = [...files].filter((file) => Array.isArray(file.snapshot?.loopCards)).sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))[0];
    const liveCards = Array.isArray(settings.loopCards) ? settings.loopCards : [];
    const cards = liveCards.some((item) => Array.isArray(item.devices) && item.devices.length) ? liveCards : saved?.snapshot?.loopCards || liveCards;
    const card = cards.find((item) => item.id === loopCardId);
    const device = card?.devices?.find((item) => item.id === deviceId);
    if (!device) return { ok: false, error: english ? "The selected device is no longer in this loop card." : "دستگاه انتخاب‌شده دیگر در این کارت لوپ وجود ندارد." };
    const conflictingDevice = card.devices.find((item) => item.id !== deviceId && Number(item.number) === nextAddress);
    if (conflictingDevice && conflictResolution === "reassign") {
      const replacement = Number(String(replacementAddress ?? "").trim());
      if (!Number.isInteger(replacement) || replacement < 1 || replacement > 254 || card.devices.some((item) => item.id !== deviceId && Number(item.number) === replacement)) return { ok: false, error: english ? "Choose an unused address from 1 to 254." : "یک آدرس آزاد بین 1 تا 254 انتخاب کنید." };
      address = replacement;
    } else if (conflictingDevice && conflictResolution !== "swap") return { ok: false, error: english ? `Address ${nextAddress} is already used on this loop card.` : `آدرس ${faDigits(nextAddress)} در این کارت لوپ قبلاً استفاده شده است.` };
    if (conflictingDevice && conflictResolution === "swap") conflictingDevice.number = Number(device.number);
    device.number = conflictResolution === "reassign" ? Number(address) : nextAddress;
    if (cards === liveCards) settings.loopCards = liveCards;
    else if (saved) { saved.snapshot.loopCards = cards; saved.updatedAt = new Date().toISOString(); }
    const save = await workspaceStore.savePanelSettings(project.id, panelId, { settings, savedSettingFiles: files }, loaded.revision || 1);
    if (!save.ok) throw new Error(`Panel settings API returned ${save.status}`);
    const savedResult = save.result || {};
    if (String(state.selectedPanelId) === String(panelId) && String(state.selectedProjectId) === String(project.id)) { state.loopCards = settings.loopCards || state.loopCards; state.savedSettingFiles = savedResult.savedSettingFiles || []; }
    return { ok: true, address: Number(device.number), swapped: conflictingDevice && conflictResolution === "swap" ? { deviceId: conflictingDevice.id, address: conflictingDevice.number } : null };
  } catch (error) { console.warn("Floor plan panel settings save failed:", error); return { ok: false, error: english ? "Could not save panel settings." : "ذخیره تنظیمات پنل ناموفق بود." }; }
}
async function registerFloorPlanDevice({ panelId, loopCardId, type, address, location, groupMode, relationId, inputGroupNumber, outputGroupNumber, side }) {
  const english = state.language === "en";
  const project = projects.find((item) => item.panels.some((panel) => String(panel.id) === String(panelId)));
  if (!project) return { ok: false, error: english ? "Panel not found." : "پنل پیدا نشد." };
  const addressNumber = Number(address);
  if (!Number.isInteger(addressNumber) || addressNumber < 1 || addressNumber > 254) return { ok: false, error: english ? "Address must be from 1 to 254." : "آدرس باید بین ۱ تا ۲۵۴ باشد." };
  try {
    const loaded = await workspaceStore.loadPanelSettings(project.id, panelId);
    const settings = loaded.settings || {};
    const files = loaded.savedSettingFiles || [];
    const saved = [...files].filter((file) => Array.isArray(file.snapshot?.loopCards)).sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))[0];
    const liveCards = Array.isArray(settings.loopCards) ? settings.loopCards : [];
    const cards = liveCards.some((item) => Array.isArray(item.devices) && item.devices.length) ? liveCards : saved?.snapshot?.loopCards || liveCards;
    const card = cards.find((item) => String(item.id) === String(loopCardId));
    if (!card) return { ok: false, error: english ? "The selected loop card was not found." : "کارت لوپ انتخاب‌شده پیدا نشد." };
    card.devices ||= [];
    if (card.devices.some((item) => Number(item.number) === addressNumber)) return { ok: false, error: english ? `Address ${addressNumber} is already used on this loop card.` : `آدرس ${faDigits(addressNumber)} در این کارت لوپ استفاده شده است.` };
    const typeInfo = loopDeviceTypes.find((item) => item.key === type);
    if (!typeInfo || !["input", "output"].includes(side)) return { ok: false, error: english ? "Choose a valid device type and group side." : "نوع دیوایس و جایگاه گروه معتبر نیست." };
    const relations = { ...(settings.ioGroups || {}), ...(settings.ioRelations || {}), ...(settings.ioSavedRelations || {}) };
    let inputNumber, outputNumber, key;
    if (groupMode === "new") {
      inputNumber = Number(inputGroupNumber); outputNumber = Number(outputGroupNumber);
      if (![inputNumber, outputNumber].every((value) => Number.isInteger(value) && value >= 1 && value <= 96)) return { ok: false, error: english ? "Group numbers must be from 1 to 96." : "شماره گروه‌ها باید بین ۱ تا ۹۶ باشند." };
      key = `${inputNumber}-${outputNumber}`;
      if (Object.keys(relations).some((id) => id === key)) return { ok: false, error: english ? "This grouping already exists." : "این گروه‌بندی از قبل وجود دارد." };
      settings.ioRelations ||= {};
      settings.ioRelations[key] = { inputGroupNumber: inputNumber, outputGroupNumber: outputNumber, activeCount: 1, outputActiveFor: "fire", delay: 0, status: true };
    } else {
      key = String(relationId || "");
      const relation = relations[key];
      const match = /^(\d+)-(\d+)$/.exec(key);
      if (!relation || !match) return { ok: false, error: english ? "Choose an existing grouping." : "یک گروه‌بندی موجود انتخاب کنید." };
      inputNumber = Number(relation.inputGroupNumber || match[1]);
      outputNumber = Number(relation.outputGroupNumber || match[2]);
    }
    const groupNumber = side === "input" ? inputNumber : outputNumber;
    const field = side === "input" ? "ioInputGroups" : "ioOutputGroups";
    settings[field] ||= {};
    const refs = settings[field][groupNumber] || [];
    const device = makeLoopDevice(card.id, addressNumber, type, { id: createEntityId("loop-device"), location: String(location || "").slice(0, 120) });
    card.devices.push(device);
    if (!refs.some((ref) => String(ref.loopId) === String(card.id) && String(ref.deviceId) === String(device.id))) refs.push({ loopId: card.id, deviceId: device.id });
    settings[field][groupNumber] = refs;
    if (cards === liveCards) settings.loopCards = liveCards;
    else if (saved) { saved.snapshot.loopCards = cards; saved.updatedAt = new Date().toISOString(); }
    const save = await workspaceStore.savePanelSettings(project.id, panelId, { settings, savedSettingFiles: files }, loaded.revision || 1);
    if (!save.ok) {
      const message = save.result?.error || "";
      return { ok: false, error: message || (english ? "Could not save panel settings." : "ذخیره تنظیمات پنل انجام نشد.") };
    }
    const result = save.result || {};
    const updatedCards = cards;
    if (String(state.selectedPanelId) === String(panelId) && String(state.selectedProjectId) === String(project.id)) {
      state.loopCards = cloneSettingsData(updatedCards);
      state.ioInputGroups = cloneSettingsData(settings.ioInputGroups || {});
      state.ioOutputGroups = cloneSettingsData(settings.ioOutputGroups || {});
      state.ioRelations = cloneSettingsData(settings.ioRelations || {});
      state.ioSavedRelations = cloneSettingsData(settings.ioSavedRelations || {});
      state.ioGroups = cloneSettingsData(settings.ioGroups || {});
      state.savedSettingFiles = result.savedSettingFiles || files;
      state.settingsBaselineSnapshot ||= captureSettingsSnapshot();
      ["loopCards", "ioInputGroups", "ioOutputGroups", "ioRelations", "ioSavedRelations", "ioGroups"].forEach((key) => {
        state.settingsBaselineSnapshot[key] = cloneSettingsData(key === "loopCards" ? updatedCards : settings[key] || {});
      });
      state.settingsDirty = hasUncommittedSettingsChanges();
    }
    return { ok: true, device, cards: updatedCards, settings: result.settings || settings, relationId: key };
  } catch (error) {
    console.warn("Floor plan device registration failed:", error);
    return { ok: false, error: english ? "Could not save panel settings." : "ذخیره تنظیمات پنل انجام نشد." };
  }
}
function saveApplicationStateNow({ workspace = false } = {}) {
  if (demoMode || workspaceDataError) return Promise.resolve(false);
  lastSaveWasWorkspace = workspace;
  const projectId = state.selectedProjectId, panelId = state.selectedPanelId;
  if (projectId && panelId && loadedPanelSettingsKey !== `${projectId}:${panelId}`) {
    return loadSelectedPanelSettings().then((loaded) => loaded ? saveApplicationStateNow({ workspace }) : undefined);
  }
  const payload = captureApplicationState();
  const settingsToPersist = hasUncommittedSettingsChanges()
    ? (state.settingsBaselineSnapshot || DEFAULT_PANEL_SETTINGS)
    : null;
  if (settingsToPersist) {
    SETTINGS_SNAPSHOT_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(settingsToPersist, key)) {
        payload.state[key] = cloneSettingsData(settingsToPersist[key]);
      }
    });
  }
  const panelSettings = SCOPED_PANEL_SETTINGS_KEYS.reduce((value, key) => {
    const source = settingsToPersist && Object.prototype.hasOwnProperty.call(settingsToPersist, key)
      ? settingsToPersist[key]
      : state[key];
    value[key] = cloneSettingsData(source);
    return value;
  }, {});
  const panelFiles = (state.savedSettingFiles || []).filter((file) => String(file.panelId) === String(panelId));
  if (!databasePersistenceReady) return Promise.resolve();
  databaseSaveChain = databaseSaveChain
    .catch(() => {})
    .then(async () => {
      if ((!workspace || !workspaceWriteAllowed) && projectId && panelId) {
        const saved = await workspaceStore.savePanelSettings(
          projectId,
          panelId,
          { settings: panelSettings, savedSettingFiles: panelFiles },
          workspaceStore.getPanelRevision(projectId, panelId),
        );
        if (!saved.ok) throw new Error("Panel settings API returned " + saved.status);
        const result = saved.result || {};
        if (state.selectedPanelId === result.panelId && state.selectedProjectId === result.projectId) {
          state.savedSettingFiles = result.savedSettingFiles || [];
        }
        applicationSaveFailure = false;
        document.querySelector("[data-save-error-banner]")?.remove();
        return true;
      }
      const panelSettingsUpdate = projectId && panelId
        ? { projectId, panelId, revision: workspaceStore.getPanelRevision(projectId, panelId), settings: panelSettings, savedSettingFiles: panelFiles }
        : null;
      const saved = await workspaceStore.saveWorkspace(payload, panelSettingsUpdate);
      const response = { ok: saved.ok, status: saved.status };
      const result = saved.result || {};
      if (response.status === 409) {
        const conflict = result;
        workspaceDataError = conflict.code === "PANEL_VERSION_CONFLICT"
          ? (state.language === "en" ? "Another user changed this panel settings. Reload before editing further." : "کاربر دیگری تنظیمات این پنل را تغییر داده است؛ برای ادامه، دادهٔ تازه را بارگذاری کنید.")
          : (state.language === "en" ? "Another user saved workspace changes. Reload before editing further." : "کاربر دیگری فضای کاری را تغییر داده است؛ برای ادامه، دادهٔ تازه را بارگذاری کنید.");
        applicationSaveFailure = true;
        renderApp();
        return false;
      }
      if (!response.ok) throw new Error(`State API returned ${response.status}`);
      applicationSaveFailure = false;
      document.querySelector("[data-save-error-banner]")?.remove();
      return true;
    })
    .catch((error) => {
      applicationSaveFailure = true;
      console.warn("PostgreSQL state save failed.", error);
      showToast(state.language === "en" ? "Save failed. Changes were not confirmed by the server." : "ذخیره ناموفق بود؛ تغییرات توسط سرور تأیید نشد.", "error");
      renderApp();
      return false;
    });
  return databaseSaveChain;
}

const settingsTree = [
  { id: "system", label: "سیستم", en: "System", icon: "settings", children: [
    { id: "setting", label: "تنظیمات عمومی", en: "Setting", icon: "settings", children: [
      { id: "date-time", label: "تاریخ و زمان", en: "Date & Time", icon: "calendar" },
      { id: "panel-caption", label: "عنوان پنل", en: "Panel Caption", icon: "panel" },
      { id: "password-change", label: "تغییر پسورد", en: "Password Change", icon: "settings" },
    ] },
    { id: "relay", label: "خروجی رله‌ها", en: "Relay Output", icon: "panel" },
    { id: "night-mode", label: "حالت شب و روز", en: "Night Mode", icon: "clock" },
  ] },
  { id: "loop-card", label: "کارت لوپ", en: "Loop Card", icon: "panel" },
  { id: "group", label: "گروه‌بندی", en: "Group", icon: "grid" },
  { id: "features", label: "قابلیت‌ها", en: "Features", icon: "settings" },
  { id: "events", label: "رویدادها", en: "Events", icon: "bell" },
  { id: "remote-panel", label: "پنل از راه دور", en: "Remote Panel", icon: "wifi" },
  { id: "report", label: "گزارش‌ها", en: "Report", icon: "report" },
  { id: "gsm", label: "تلفن‌کننده", en: "GSM", icon: "bell", children: [
    { id: "customize", label: "سفارشی‌سازی", en: "Customize", icon: "settings" },
    { id: "location", label: "موقعیت", en: "Location", icon: "project" },
  ] },
  { id: "monitoring", label: "مانیتورینگ", en: "Monitoring", icon: "dashboard" },
];

const findProject = () => projects.find((project) => project.id === state.selectedProjectId) || projects[0];
const findPanel = () => findProject().panels.find((panel) => panel.id === state.selectedPanelId) || findProject().panels[0];

function deleteProject(projectId) {
  const projectIndex = projects.findIndex((project) => project.id === projectId);
  if (projectIndex < 0) return;
  const project = projects[projectIndex];
  const english = state.language === "en";
  const message = english
    ? `Delete project “${project.name}” and its ${project.panels.length} panel(s)? All user project, panel, and management access will also be revoked. This action cannot be undone.`
    : `\u067e\u0631\u0648\u0698\u0647 \u00ab${project.name}\u00bb \u0648 ${faDigits(project.panels.length)} \u067e\u0646\u0644 \u0622\u0646 \u062d\u0630\u0641 \u0634\u0648\u062f\u061f \u0627\u06cc\u0646 \u06a9\u0627\u0631 \u0642\u0627\u0628\u0644 \u0628\u0627\u0632\u06af\u0634\u062a \u0646\u06cc\u0633\u062a.`;
  if (!window.confirm(message)) return;

  const deletedPanelIds = new Set(project.panels.map((panel) => panel.id));
  projects.splice(projectIndex, 1);
  if (Array.isArray(state.savedSettingFiles) && deletedPanelIds.size) {
    state.savedSettingFiles = state.savedSettingFiles.filter((file) => !deletedPanelIds.has(file.panelId));
    if (state.selectedSavedSettingFileId && !state.savedSettingFiles.some((file) => file.id === state.selectedSavedSettingFileId)) {
      state.selectedSavedSettingFileId = null;
    }
    persistSettingsFiles();
  }
  if (state.selectedProjectId === projectId) {
    state.selectedProjectId = null;
    state.selectedPanelId = null;
    state.connectedPanelId = null;
    state.view = "projects";
    state.projectMenuOpen = false;
    state.panelMenuOpen = false;
  }
  state.settingsDirty = false;
  state.settingsBaselineSnapshot = captureSettingsSnapshot();
  clearTimeout(databaseSaveTimer);
  databaseSaveTimer = null;
  void saveApplicationStateNow({ workspace: true });
  renderApp();
  showToast(english ? `${project.name} was deleted.` : `\u067e\u0631\u0648\u0698\u0647 \u00ab${project.name}\u00bb \u062d\u0630\u0641 \u0634\u062f.`, "info");
}

const translations = {
  "عکس‌های پروژه": "Project images",
  "زبان": "Language",
  "تنظیمات مستقل نرم‌افزار": "Independent application settings",
  "افزودن و تغییر تصویر کارت پروژه‌ها": "Add and update project card images",
  "فضای کاری": "Workspace", "پروژه‌ها": "Projects", "فضای مانیتورینگ": "Monitoring workspace", "پنل‌های من": "My panels", "رویدادها": "Events", "گزارش‌ها": "Reports", "مدیریت پنل": "Panel management", "حساب نصاب": "Installer account", "دسترسی فعال": "Active access", "پشتیبانی فنی": "Technical support", "همراه شما برای راه‌اندازی": "Here to help with setup", "آماده به کار": "Ready", "بدون اتصال به پنل": "No panel connected", "متصل به پنل": "Connected to panel", "تنظیمات پنل": "Panel settings", "تنظیمات پروژه": "Project settings", "پروژه‌های من": "My projects", "پروژه را انتخاب کنید تا پنل‌ها و تنظیمات آن را مدیریت کنید.": "Select a project to manage its panels and settings.", "پروژه‌ها و پنل‌های تحت مدیریت شما": "Projects and panels under your management", "فضای کاری شما": "Your workspace", "پروژه فعال": "Active projects", "پنل ثبت‌شده": "Registered panels", "نیازمند بررسی": "Needs attention", "پروژه آنلاین": "Online projects", "پروژه": "Project", "پنل": "Panel", "پنل‌های پروژه": "Project panels", "در این پروژه": "in this project", "پنل جدید اضافه کنید": "Add a new panel", "اتصال پنل در نسخه بعدی": "Panel connection is coming next", "راهنمای تنظیمات": "Settings guide", "برای مشاهده هر بخش، گزینه‌ی آن را انتخاب کنید.": "Select an item to view its settings.", "فضای نصاب": "Installer workspace", "پنل‌ها": "Panels", "پیکربندی پنل": "Panel configuration", "پروژه‌های فعال": "Active projects", "خواندن": "Read", "خواندن از پنل": "Read from panel", "ذخیره تنظیمات": "Save settings", "ذخیره تغییرات": "Save changes", "اعمال روی پنل": "Apply to panel", "انصراف": "Cancel", "اتصال": "Connect", "قطع اتصال": "Disconnect", "اتصال پنل برای این پروژه فعال نیست": "Panel is not connected for this project", "مقادیر فعلاً در فرم نگه‌داری می‌شوند و بعد از اتصال قابل ارسال خواهند بود.": "Values stay in this form until the panel connection is established.", "تنظیم تاریخ و ساعت": "Set date and time", "تاریخ پنل": "Panel date", "ساعت پنل": "Panel time", "فرمت ساعت ۲۴ ساعته": "24-hour format", "مقدار انتخاب‌شده": "Selected value", "معادل میلادی": "Gregorian equivalent", "شمسی": "Jalali", "زبان رابط کاربری": "Interface language", "زبان نرم‌افزار": "Application language", "نام پروژه‌ها و پنل‌ها بدون تغییر باقی می‌ماند.": "Project and panel names stay unchanged.", "وضعیت تنظیمات": "Settings status", "آخرین وضعیت همگام‌سازی": "Latest synchronization status", "پنل انتخاب‌شده": "Selected panel", "آخرین همگام‌سازی": "Last synchronization", "هنوز انجام نشده": "Not synchronized yet", "منطقه زمانی": "Time zone", "تهران (UTC+۳:۳۰)": "Tehran (UTC+3:30)", "مراحل بعدی": "Next steps", "امکاناتی که به‌زودی فعال می‌شوند": "Features coming soon", "انتخاب پروژه و پنل": "Select project and panel", "ساختار اولیه آماده است": "Initial structure is ready", "در حال پیاده‌سازی": "In progress", "اتصال و همگام‌سازی": "Connection and synchronization", "در نسخه بعدی": "In the next version", "فعال": "Active", "آماده": "Ready", "پیش‌نویس": "Draft", "آنلاین": "Online", "آفلاین": "Offline", "متصل": "Connected", "هشدار": "Alert", "همه پروژه‌ها": "All projects", "مجتمع اداری": "Office complex", "برج مسکونی": "Residential tower", "کارخانه صنعتی": "Industrial factory", "هتل": "Hotel", "تهران، خیابان ولیعصر": "Tehran, Valiasr Street", "تهران، شهرک غرب": "Tehran, Shahrak-e Gharb", "البرز، شهرک صنعتی": "Alborz, Industrial Town", "مشهد، بلوار سجاد": "Mashhad, Sajjad Boulevard",
};

translations["صحبت"] = "Talk";

Object.assign(translations, {
  "تنظیمات سیستم": "System settings",
  "مدیریت تنظیمات عمومی و ارتباط با پنل": "Manage general settings and panel connection",
  "تنظیمات عمومی و ارتباط با پنل": "General settings and panel connection",
  "تنظیمات": "Settings",
  "سیستم": "System",
  "خروجی رله‌ها": "Relay output",
  "شبکه": "Network",
  "حالت شب و روز": "Night mode",
  "کارت لوپ": "Loop card",
  "دیوایس‌های کارت لوپ": "Loop card devices",
  "دیوایس‌های شناسایی‌شده در Loop Card 1": "Devices detected on Loop Card 1",
  "گروه‌بندی ورودی و خروجی": "Input and output groups",
  "قابلیت‌های پنل": "Panel features",
  "رویدادهای پنل": "Panel events",
  "پنل‌های همکار": "Partner panels",
  "گزارش تنظیمات پنل": "Panel configuration report",
  "تلفن‌کننده GSM": "GSM dialer",
  "سفارشی‌سازی اعلان‌ها": "Notification customization",
  "موقعیت پنل": "Panel location",
  "مرکز مانیتورینگ": "Monitoring center",
  "فعال‌سازی کارت‌های لوپ": "Activate loop cards",
  "کارت‌هایی را که در این پنل نصب شده‌اند فعال کنید.": "Activate the cards installed in this panel.",
  "تنظیمات شبکه پنل‌ها": "Panel network settings",
  "ارتباط چند پنل و فرمان‌های سراسری را مدیریت کنید.": "Manage multi-panel communication and global commands.",
  "برنامه روز و شب": "Day and night schedule",
  "بازه‌های زمانی حالت شب و روز پنل را تعیین کنید.": "Set the panel's day and night time ranges.",
  "تعطیلات ثبت‌شده": "Registered holidays",
  "تاریخ‌های خاص پروژه": "Project-specific dates",
  "عملکرد هر رله را برای رخدادهای پنل تعیین کنید.": "Define the behavior of each relay for panel events.",
  "خروجی قابل تنظیم پنل": "Configurable panel output",
  "نظارت / Supervisory": "Supervisory",
  "غیرفعال": "Disabled",
  "نکته کاربردی": "Useful tip",
  "تنظیم خروجی رله‌ها رفتار تجهیزات جانبی مانند آژیر، فن و سیستم‌های اعلان را مشخص می‌کند.": "Relay output settings define the behavior of accessories such as sounders, fans, and notification systems.",
  "آخرین خواندن: امروز، ۱۰:۲۴": "Last read: Today, 10:24",
  "فعال و آماده‌ی استفاده": "Active and ready to use",
  "وضعیت شبکه": "Network status",
  "پشتیبانی از حداکثر ۸ پنل": "Supports up to 8 panels",
  "آخر هفته": "Weekend",
  "اعمال حالت شب در روزهای تعطیل": "Apply night mode on holidays",
  "تعطیلات رسمی": "Public holidays",
  "استفاده از تقویم تعطیلات پروژه": "Use the project holiday calendar",
  "دیوایس‌ها را برای اجرای سناریوهای مشترک گروه‌بندی کنید.": "Group devices to run shared scenarios.",
  "رفتارهای پیشرفته‌ی سیستم اعلام حریق را کنترل کنید.": "Control advanced fire alarm system behavior.",
  "آخرین رخدادهای ثبت‌شده برای": "Latest recorded events for",
  "اتصال برقرار نیست": "Not connected",
  "برای مشاهده و همگام‌سازی پنل‌های دور، ابتدا ارتباط اینترنتی یا شبکه را تنظیم کنید.": "Configure an internet or network connection before viewing and synchronizing remote panels.",
  "تنظیم ارتباط": "Configure connection",
  "در انتظار اتصال": "Waiting for connection",
  "گزارش خلاصه از وضعیت پیکربندی و دیوایس‌ها": "A summary of configuration and device status",
  "تولید گزارش": "Generate report",
  "دانلود": "Download",
  "وضعیت پنل": "Panel status",
  "تعداد دیوایس‌ها": "Device count",
  "رویدادهای باز": "Open events",
  "گروه‌های تنظیم‌شده": "Configured groups",
  "وضعیت ارسال پیامک و تماس صوتی": "SMS and voice-call delivery status",
  "آماده‌سازی": "Preparing",
  "شماره اصلی دریافت هشدار": "Primary alert number",
  "ویرایش": "Edit",
  "رویدادهای قابل ارسال": "Sendable events",
  "انتخاب رخدادهای مهم": "Select important events",
  "متن و قالب پیام‌های ارسالی تلفن‌کننده را تعیین کنید.": "Define the text and format of dialer messages.",
  "عنوان پروژه در پیامک": "Project title in SMS",
  "زبان پیام": "Message language",
  "قالب پیام حریق": "Fire message template",
  "ثبت شده": "Registered",
  "محل نصب پنل را برای نمایش در نقشه ثبت کنید.": "Register the panel location for map display.",
  "طبقه / بخش": "Floor / section",
  "مختصات پروژه": "Project coordinates",
  "وضعیت پنل‌ها، اتصال‌ها و رخدادها را از یک نمای واحد دنبال کنید.": "Track panel status, connections, and events from one view.",
  "مانیتورینگ آماده": "Monitoring ready",
  "ورود به مانیتورینگ": "Open monitoring",
  "وضعیت سرویس‌ها": "Service status",
  "آخرین بررسی خودکار سیستم": "Last automatic system check",
  "مدیریت تنظیمات و مانیتورینگ": "Settings and monitoring",
  "منوی تنظیمات بر اساس مستندات سیستم": "Settings menu based on the system documentation",
  "خواندن رویدادها": "Read events",
  "خروجی گزارش": "Export report",
  "شناسایی": "Detect",
  "+ افزودن دیوایس": "+ Add device",
  "+ گروه جدید": "+ New group",
  "+ افزودن": "+ Add",
  "مدیریت": "Management",
  "نسخه حرفه‌ای پایش‌": "Paya-yar Pro version",
  "گزارش‌های پیشرفته را فعال کنید.": "Enable advanced reports.",
  "ارتقای حساب": "Upgrade account",
  "مدیریت پنل‌های حریق": "Fire panel management",
  "جمع کردن منو": "Collapse menu",
  "باز کردن منو": "Expand menu",
  "بستن منو": "Close menu",
  "فعال‌سازی حالت تاریک": "Enable dark mode",
  "غیرفعال‌سازی حالت تاریک": "Disable dark mode",
  "اعلان‌ها": "Notifications",
  "فارسی": "Persian",
  "۳ رله فعال": "3 active relays",
  "حریق / Fire": "Fire",
  "خطا / Fault": "Fault",
  "پیش‌هشدار / Pre-Alarm": "Pre-Alarm",
  "اعلام حریق روی شبکه": "Fire alarm on network",
  "اعلام خطای پنل روی شبکه": "Panel fault on network",
  "همگام‌سازی خروجی آژیر": "Synchronize sounder output",
  "ارسال فرمان سکوت به پنل‌ها": "Send silence command to panels",
  "پذیرش فرمان سکوت": "Accept silence command",
  "ارسال فرمان تخلیه": "Send evacuation command",
  "تنظیمات شبکه پنل‌ها": "Panel network settings",
  "۵ فعال": "5 active",
  "همه": "All",
  "دتکتور": "Detector",
  "ماژول": "Module",
  "خروجی": "Output",
  "شماره": "Number",
  "نوع دیوایس": "Device type",
  "وضعیت": "Status",
  "عملیات": "Actions",
  "گروه جدید": "New group",
  "گزارش پیکربندی FIRE-CTRL-04": "Configuration report FIRE-CTRL-04",
  "آخرین تولید: امروز، ۱۰:۳۰ · PDF": "Last generated: Today, 10:30 · PDF",
  "حریق": "Fire",
  "خطا": "Fault",
  "نظارت": "Supervisory",
  "بازگشت به حالت عادی": "Return to normal",
  "هشدار حریق در {PROJECT} - {PANEL} - {TIME}": "Fire alarm at {PROJECT} - {PANEL} - {TIME}",
  "اتاق کنترل، طبقه همکف": "Control room, ground floor",
  "نوروز": "Nowruz",
  "روز طبیعت": "Nature Day",
  "Master Silence · ارسال": "Master Silence · Send",
  "Master Silence · دریافت": "Master Silence · Receive",
  "Master Evacuate · ارسال": "Master Evacuate · Send",
  "خروجی حریق": "Fire output",
  "خروجی خطا": "Fault output",
  "شروع حالت شب": "Night mode starts",
  "پایان حالت شب": "Night mode ends",
  "اتاق کنترل، طبقه همکف": "Control room, ground floor",
  "دیوایس‌ها را برای اجرای سناریوهای مشترک گروه‌بندی کنید.": "Group devices for shared scenarios.",
  "۱۲ دیوایس · خروجی آژیر · تأخیر ۰ ثانیه": "12 devices · Sounder output · 0 sec delay",
  "۴ دیوایس · خروجی رله ۲ · تأخیر ۵ ثانیه": "4 devices · Relay 2 output · 5 sec delay",
  "۸ دیوایس · وضعیت نظارتی": "8 devices · Supervisory status",
  "تأخیر پیش‌هشدار": "Pre-alarm delay",
  "مدت تأخیر قبل از فعال شدن آژیر": "Delay before sounder activation",
  "یادآوری خطا": "Fault reminder",
  "نمایش یادآوری برای خطاهای باز": "Show reminders for open faults",
  "خاموش‌سازی خودکار": "Automatic shutdown",
  "خاموشی خودکار خروجی پس از رخداد": "Automatically shut down output after an event",
  "قفل خروجی صدا": "Sound output lock",
  "جلوگیری از قطع صدای آژیر": "Prevent sounder interruption",
  "تأیید دو مرحله‌ای": "Two-step confirmation",
  "تأیید عملیات حساس روی پنل": "Confirm sensitive panel operations",
  "ثبت تاریخچه عملیات": "Operation history",
  "ذخیره اقدامات کاربران": "Save user actions",
  "آخرین رخدادهای ثبت‌شده برای": "Latest recorded events for",
  "دتکتور دود · طبقه ۲": "Smoke detector · Floor 2",
  "خطای ارتباط": "Communication fault",
  "بازگشت به حالت عادی": "Return to normal",
  "امروز، ۰۹:۴۲": "Today, 09:42",
  "امروز، ۰۸:۱۵": "Today, 08:15",
  "دیروز، ۱۸:۲۱": "Yesterday, 18:21",
  "پنل‌هایی که برای همگام‌سازی انتخاب شده‌اند": "Panels selected for synchronization",
  "در انتظار اتصال": "Waiting for connection",
  "آفلاین": "Offline",
  "غیرفعال": "Disabled",
  "وضعیت ارسال پیامک و تماس صوتی": "SMS and voice call delivery status",
  "تماس صوتی هنگام حریق": "Voice call during fire alarm",
  "ارسال تماس به شماره‌های ثبت‌شده": "Call registered numbers",
  "ارسال پیامک خطا": "Send fault SMS",
  "گزارش خطاهای پنل از طریق پیامک": "Report panel faults by SMS",
  "عنوان پروژه در پیامک": "Project title in SMS",
  "قالب پیام حریق": "Fire message template",
  "هشدار حریق در {PROJECT} - {PANEL} - {TIME}": "Fire alarm at {PROJECT} - {PANEL} - {TIME}",
  "ثبت شده": "Registered",
  "ثبت‌شده": "Registered",
  "محل نصب پنل را برای نمایش در نقشه ثبت کنید.": "Register the panel location for map display.",
  "وضعیت سرویس‌ها": "Service status",
  "مانیتورینگ زنده": "Live monitoring",
  "دریافت وضعیت پنل‌ها در لحظه": "Receive panel status in real time",
  "اعلان رخداد جدید": "New event notifications",
  "نمایش هشدار در داشبورد نصاب": "Show alerts on the installer dashboard",
  "ثبت لاگ ارتباطات": "Connection logs",
  "ثبت زمان و کاربر هر اتصال": "Log the time and user for each connection",
});

function translateUI(root) {
  if (!root || state.language !== "en") return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const original = node.nodeValue.trim();
    if (!original) return;
    if (translations[original]) { node.nodeValue = node.nodeValue.replace(original, translations[original]); return; }
    let translated = original.replace(/^(\d+) پنل در این پروژه$/, "$1 panels in this project").replace(/^(\d+) پروژه فعال · (\d+) پنل$/, "$1 active projects · $2 panels").replace(/^(\d+) پنل · (.+)$/, "$1 panels · $2").replace(/^(\d+) متصل$/, "$1 connected").replace(/^(\d+) هشدار$/, "$1 alerts").replace(/^(\d+) پنل$/, "$1 panels").replace("مدیریت تنظیمات و مانیتورینگ", "Settings and monitoring");
    translated = translated.replace(/^(\d+) panels · (.+)$/, (_, count, label) => `${count} panels · ${translations[label] || label}`).replace(/^آخرین رخدادهای ثبت‌شده برای (.+)$/, (_, name) => `Latest recorded events for ${name}`);
    if (translated !== original) node.nodeValue = node.nodeValue.replace(original, translated);
  });
  root.querySelectorAll("[aria-label]").forEach((element) => {
    const label = element.getAttribute("aria-label");
    if (translations[label]) element.setAttribute("aria-label", translations[label]);
  });
}

function updateConnectionStatus() {
  const title = document.querySelector("#connection-title");
  const subtitle = document.querySelector("#connection-subtitle");
  const status = document.querySelector(".connection-status");
  const panel = state.connectedPanelId ? projects.flatMap((project) => project.panels).find((item) => item.id === state.connectedPanelId) : null;
  if (!title || !subtitle) return;
  title.textContent = panel ? (state.language === "en" ? "Connected to panel" : "متصل به پنل") : (state.language === "en" ? "Ready" : "آماده به کار");
  subtitle.textContent = panel ? panel.code : (state.language === "en" ? "No panel connected" : "بدون اتصال به پنل");
  status?.classList.toggle("connected", Boolean(panel));
}

function updateSidebarState() {
  const shell = document.querySelector(".app-shell");
  const collapsed = state.sidebarCollapsed && !isMobileWorkspace();
  shell?.classList.toggle("sidebar-collapsed", collapsed);
  document.querySelector("#sidebar-collapse")?.setAttribute("aria-label", collapsed ? "باز کردن منو" : "جمع کردن منو");
}

function panelRequiredAttr() {
  // Drafts can be edited offline. A live connection is required only by
  // explicit read/upload operations in the Saved Settings section.
  return "";
}

function renderShell() {
  document.querySelector("#app").innerHTML = `
    <div class="app-shell">
      <div class="mobile-overlay" id="mobile-overlay"></div>
      <aside class="sidebar" id="sidebar">
        <div class="brand-row">
          <div class="brand-mark">${icons.panel}</div>
          <div><strong>پایش‌</strong><small>مدیریت پنل‌های حریق</small></div>
          <button class="icon-button sidebar-collapse" id="sidebar-collapse" aria-label="جمع کردن منو">${icons.chevronRight}</button>
          <button class="icon-button sidebar-close" id="sidebar-close" aria-label="بستن منو">${icons.x}</button>
        </div>
        <nav class="side-nav" aria-label="${state.language === "en" ? "Main menu" : "منوی اصلی"}">
          <p class="nav-caption">${state.language === "en" ? "Workspace" : "فضای کاری"}</p>
          <button class="nav-item active" type="button" data-nav-view="projects">${icons.project}<span>پروژه‌ها</span><em>${faDigits(projects.length)}</em></button>
          <button class="nav-item" type="button" data-nav-view="project-images">${icons.image}<span>${state.language === "en" ? "Project images" : "عکس‌های پروژه"}</span></button>
          <button class="nav-item" type="button" data-nav-view="workspace">${icons.dashboard}<span>فضای مانیتورینگ</span><i class="live-dot"></i></button>
          <button class="nav-item" type="button" data-nav-view="talk">${icons.message}<span>صحبت</span></button>
          <p class="nav-caption nav-space" id="floor-plan-nav-caption">${state.language === "en" ? "Devices and panels" : "تجهیزات و پنل‌ها"}</p>
          <button class="nav-item" type="button" data-nav-view="floor-plans">${icons.map}<span id="floor-plan-nav-label">${state.language === "en" ? "Floor Plan Layout" : "نقشه و چیدمان"}</span></button>
          <button class="nav-item" type="button" data-nav-view="panels">${icons.panel}<span>پنل‌های من</span></button>
          <button class="nav-item" type="button" data-nav-view="workspace" data-nav-setting="saved-settings">${icons.report}<span>${state.language === "en" ? "Saved settings" : "تنظیمات ذخیره شده"}</span></button>
          ${(sessionUser && ((sessionUser.globalPermissions || []).some((p) => ["users:read", "users:manage", "*"].includes(p)) || Object.values(sessionUser.projectPermissions || {}).some((p) => p.includes("project:manage")))) || (sessionUser?.globalPermissions || []).includes("*") ? `<p class="nav-caption nav-space">${state.language === "en" ? "Management" : "مدیریت سامانه"}</p>` : ""}
          ${sessionUser && ((sessionUser.globalPermissions || []).some((p) => ["users:read", "users:manage", "*"].includes(p)) || Object.values(sessionUser.projectPermissions || {}).some((p) => p.includes("project:manage"))) ? `<button class="nav-item" type="button" data-nav-view="user-management">${icons.user}<span>${state.language === "en" ? "User management" : "مدیریت کاربران"}</span></button>` : ""}
          ${sessionUser && ((sessionUser.globalPermissions || []).some((p) => ["audit:read", "*"].includes(p)) || Object.values(sessionUser.projectPermissions || {}).some((p) => p.includes("audit:read"))) ? `<button class="nav-item" type="button" data-nav-view="activity-report">${icons.report}<span>${state.language === "en" ? "Activity report" : "گزارش فعالیت"}</span></button>` : ""}
          <button class="nav-item" type="button" data-nav-view="workspace" data-nav-setting="events">${icons.bell}<span>${state.language === "en" ? "Events" : "رویدادها"}</span>${getNavigationEventCount() > 0 ? `<em class="warning-count">${faDigits(getNavigationEventCount())}</em>` : ""}</button>
          <button class="nav-item" type="button" data-nav-view="workspace" data-nav-setting="report">${icons.report}<span>${state.language === "en" ? "Panel reports" : "گزارش‌های پنل"}</span></button>
        </nav>
      </aside>
      <main class="main-content">
        <header class="topbar">
          <div class="topbar-start"><button class="icon-button menu-button" id="menu-button" aria-label="باز کردن منو" aria-expanded="false">${icons.menu}</button><div><h1 id="topbar-title">پروژه‌ها</h1><p id="topbar-subtitle">پروژه‌ها و پنل‌های تحت مدیریت شما</p></div></div>
          <div class="topbar-end"><div class="connection-status"><span class="status-pulse"></span><div><b id="connection-title">آماده به کار</b><small id="connection-subtitle">بدون اتصال به پنل</small></div></div><button class="notification-button theme-toggle" id="theme-toggle" aria-label="فعال‌سازی حالت تاریک">${icons.moon}</button><div class="language-menu" data-language-menu><button class="notification-button language-toggle" id="language-toggle" data-language-toggle type="button" aria-label="${state.language === "en" ? "Change language" : "تغییر زبان"}" title="${state.language === "en" ? "Change language" : "تغییر زبان"}" aria-haspopup="dialog" aria-expanded="false" aria-controls="language-popover"><b class="language-code" aria-hidden="true">${state.language === "en" ? "EN" : "FA"}</b></button><div class="language-popover" id="language-popover" data-language-popover role="dialog" aria-label="${state.language === "en" ? "Interface language" : "زبان رابط کاربری"}" hidden><div class="language-popover-head"><b>${state.language === "en" ? "Interface language" : "زبان رابط کاربری"}</b><p>${state.language === "en" ? "Choose the language for all menus and controls." : "زبان نمایش منوها، دکمه‌ها و کنترل‌های نرم‌افزار را انتخاب کنید."}</p></div><p class="language-popover-note">${state.language === "en" ? "Project and panel names stay unchanged." : "نام پروژه‌ها و پنل‌ها بدون تغییر باقی می‌ماند."}</p><div class="language-options" role="group" aria-label="${state.language === "en" ? "Application language" : "زبان نرم‌افزار"}"><button type="button" class="language-option${state.language !== "en" ? " selected" : ""}" aria-pressed="${state.language !== "en"}" data-language-option="fa">فارسی</button><button type="button" class="language-option${state.language === "en" ? " selected" : ""}" aria-pressed="${state.language === "en"}" data-language-option="en">English</button></div></div></div><button class="notification-button" data-notifications aria-label="اعلان‌ها">${icons.bell}<span></span></button><div class="profile-menu" data-account-menu><button class="profile" type="button" data-account-toggle aria-haspopup="menu" aria-expanded="false"><span class="avatar">کا</span><div><b>کاربر اریاک</b><small>نصاب سیستم</small></div>${icons.chevronDown}</button><div class="account-popover" data-account-popover role="menu" hidden><button type="button" class="account-logout" data-site-logout role="menuitem"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5m5 5H3m8-9h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/></svg><span>خروج</span></button></div></div></div>
        </header>
        <div class="content-wrap" id="content-root"></div>
      </main>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
    </div>`;
}


function renderProjectsPage() {
  const english = state.language === "en";
  const totalPanels = projects.reduce((sum, project) => sum + project.panels.length, 0);
  return "<section class='breadcrumb'><b>" + (english ? "Projects" : "پروژه‌ها") + "</b></section>"
    + "<section class='page-intro'><div class='page-intro-copy'><div class='eyebrow'>" + (english ? "INSTALLER WORKSPACE" : "فضای نصاب") + "</div><h2>" + (english ? "My projects" : "پروژه‌های من") + "</h2><p>" + (english ? "Select a project to manage its panels, settings, and monitoring." : "پروژه را انتخاب کنید تا پنل‌ها، تنظیمات و مانیتورینگ آن را مدیریت کنید.") + "</p></div><div class='page-intro-actions'><div class='project-summary'><span>" + icons.project + "</span><div><small>" + (english ? "Your workspace" : "فضای کاری شما") + "</small><b>" + faDigits(projects.length) + " " + (english ? "projects" : "پروژه") + " · " + faDigits(totalPanels) + " " + (english ? "panels" : "پنل") + "</b></div></div><button type='button' class='btn-primary project-create-button' data-project-create>" + icons.plus + (english ? "Create project" : "ایجاد پروژه") + "</button></div></section>"
    + "<section class='projects-grid'>" + projects.map(renderProjectCard).join("") + "</section>";
}

function renderProjectImagesDetail(project) {
  const english = state.language === "en";
  const images = Array.isArray(project.images) ? project.images : [];
  const content = images.length ? images.map((image) => {
    const isCover = image.src === project.image;
    return "<article class='project-gallery-item" + (isCover ? " is-cover" : "") + "'><div class='project-gallery-preview' data-project-image-container><img class='project-gallery-image' data-project-image-id='" + escapeHtml(project.id) + "' data-project-gallery-image-id='" + escapeHtml(image.id) + "' alt='' decoding='async'>" + (isCover ? "<span class='project-gallery-cover-badge'>" + (english ? "Cover" : "کاور") + "</span>" : "") + "</div><div class='project-gallery-item-footer'><small>" + escapeHtml(image.name || (english ? "Project image" : "تصویر پروژه")) + "</small><div><button type='button' class='btn-primary btn-small' data-project-image-cover data-project-id='" + escapeHtml(project.id) + "' data-project-gallery-image-id='" + escapeHtml(image.id) + "'" + (isCover ? " disabled" : "") + ">" + (english ? "Set as cover" : "انتخاب به‌عنوان کاور") + "</button><button type='button' class='btn-secondary btn-small' data-project-gallery-remove data-project-id='" + escapeHtml(project.id) + "' data-project-gallery-image-id='" + escapeHtml(image.id) + "'>" + (english ? "Remove" : "حذف") + "</button></div></div></article>";
  }).join("") : "<div class='project-gallery-empty'>" + icons.image + "<b>" + (english ? "No images yet" : "هنوز تصویری اضافه نشده است") + "</b><small>" + (english ? "Add the first image for this project." : "اولین تصویر این پروژه را اضافه کنید.") + "</small></div>";
  return "<section class='breadcrumb'><button type='button' class='project-images-back' data-project-images-back>" + icons.chevronRight + (english ? "All projects" : "همه پروژه‌ها") + "</button><b>" + escapeHtml(project.name) + "</b></section>"
    + "<section class='page-intro project-gallery-heading'><div class='page-intro-copy'><div class='eyebrow'>" + (english ? "PROJECT GALLERY" : "گالری پروژه") + "</div><h2>" + escapeHtml(project.name) + "</h2><p>" + (english ? "Choose any gallery image as the project cover." : "هر تصویر گالری را می‌توانید به‌عنوان کاور پروژه انتخاب کنید.") + "</p></div><label class='btn-primary project-image-upload-button project-gallery-upload'>" + icons.plus + (english ? "Add image" : "افزودن تصویر") + "<input type='file' accept='image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp' data-project-image-input data-project-id='" + escapeHtml(project.id) + "'></label></section>"
    + "<section class='project-gallery-grid'>" + content + "</section>";
}

function renderProjectImagesPage() {
  const english = state.language === "en";
  const selectedProject = projects.find((project) => project.id === state.projectImagesProjectId);
  if (selectedProject) return renderProjectImagesDetail(selectedProject);
  return "<section class='breadcrumb'><b>" + (english ? "Project images" : "عکس‌های پروژه") + "</b></section>"
    + "<section class='page-intro'><div class='page-intro-copy'><div class='eyebrow'>" + (english ? "PROJECT MEDIA" : "رسانه پروژه‌ها") + "</div><h2>" + (english ? "Project images" : "عکس‌های پروژه") + "</h2><p>" + (english ? "Open a project to manage its cover and gallery images." : "برای مدیریت کاور و تصاویر گالری، یک پروژه را باز کنید.") + "</p></div></section>"
    + "<section class='project-images-grid project-image-project-list'>" + projects.map((project) => {
      const hasImage = isSafeImageSource(project.image);
      const count = Array.isArray(project.images) ? project.images.length : 0;
      return "<article class='project-image-manager-card project-image-project-card' data-project-images-open data-project-image-project-id='" + escapeHtml(project.id) + "'><div class='project-image-manager-preview' data-project-image-container>"
        + (hasImage ? "<img class='project-image-manager-image' data-project-image-id='" + escapeHtml(project.id) + "' alt='' decoding='async'>" : "<div class='project-image-empty'>" + icons.image + "<span>" + (english ? "No cover" : "بدون کاور") + "</span></div>")
        + "</div><div class='project-image-manager-copy'><h3>" + escapeHtml(project.name) + "</h3><small>" + faDigits(count) + " " + (english ? "images" : "تصویر در گالری") + "</small></div><div class='project-image-manager-actions'><button type='button' class='btn-primary' data-project-images-open-button data-project-image-project-id='" + escapeHtml(project.id) + "'>" + icons.image + (english ? "Open gallery" : "بازکردن گالری") + "</button></div></article>";
    }).join("") + "</section>";
}

let talkSelectedDeviceId = null;
let talkRefreshTimer = null;
let talkTrackedCommand = null;
let talkPendingMessages = new Map();
let talkSeenDeviceMessages = new Map();

async function talkApi(url, options = {}) {
  const response = await apiFetch(url, {
    credentials: "same-origin",
    ...options,
    headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error || `Request failed (${response.status})`), { status: response.status });
  return result;
}

function talkLoginMarkup() {
  const english = state.language === "en";
  return '<div class="talk-login-card"><div class="talk-login-icon">' + icons.settings + '</div><h3>' + (english ? "Device management access required" : "دسترسی مدیریت دستگاه لازم است") + '</h3><p>' + (english ? "Sign in with your personal account and ask an administrator to grant device management permission." : "با حساب شخصی خود وارد شوید و از مدیر سامانه بخواهید مجوز مدیریت دستگاه را به شما بدهد.") + '</p></div>';
}

function talkFormatTime(value) {
  if (!value) return state.language === "en" ? "Never" : "هرگز";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(state.language === "en" ? "en-US" : "fa-IR");
}

function talkDeviceStatus(device) {
  const english = state.language === "en";
  return device.online ? (english ? "Online" : "آنلاین") : (english ? "Offline" : "آفلاین");
}

function talkRenderHistory(target, commands) {
  if (!target) return;
  const english = state.language === "en";
  const statusLabels = english
    ? { pending: "Queued", claimed: "Running", completed: "Replied", failed: "Failed", expired: "Expired" }
    : { pending: "در صف", claimed: "در حال اجرا", completed: "پاسخ دریافت شد", failed: "ناموفق", expired: "منقضی" };
  if (!commands.length) {
    target.innerHTML = `<div class="talk-history-empty">${english ? "No commands yet." : "هنوز فرمانی ثبت نشده است."}</div>`;
    return;
  }
  target.innerHTML = commands.map((item) => `<article class="talk-history-item"><header><code>${escapeHtml(item.command)}</code><span class="talk-command-state ${escapeHtml(item.status)}">${escapeHtml(statusLabels[item.status] || item.status)}</span></header><small>${escapeHtml(talkFormatTime(item.createdAt))}</small>${item.response ? `<pre>${escapeHtml(item.response)}</pre>` : ""}${item.error ? `<p class="talk-command-error">${escapeHtml(item.error)}</p>` : ""}</article>`).join("");
}

function talkRenderAuthenticated(container, devices, pairingCode = "") {
  const english = state.language === "en";
  const selected = devices.find((device) => device.deviceId === talkSelectedDeviceId) || devices[0] || null;
  talkSelectedDeviceId = selected?.deviceId || null;
  const projectOptions = projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`).join("");
  const deviceCards = devices.map((device) => `<article class="talk-device-card ${device.deviceId === selected?.deviceId ? "selected" : ""}" data-talk-device-card="${escapeHtml(device.deviceId)}"><button type="button" class="talk-device-select" data-talk-select="${escapeHtml(device.deviceId)}"><span class="talk-device-dot ${device.online ? "online" : ""}"></span><span class="talk-device-name"><b>${escapeHtml(device.name || device.deviceId)}</b><small dir="ltr">${escapeHtml(device.deviceId)}</small></span><span class="talk-device-status ${device.online ? "online" : ""}" data-talk-device-status="${escapeHtml(device.deviceId)}">${talkDeviceStatus(device)}</span></button><button type="button" class="talk-device-revoke" data-talk-revoke="${escapeHtml(device.deviceId)}">${english ? "Revoke" : "لغو دسترسی"}</button></article>`).join("");
  const selectedProject = selected?.projectId ? projects.find((project) => project.id === selected.projectId)?.name : "";
  container.innerHTML = `<div class="talk-authenticated" data-talk-authorized><div class="talk-toolbar"><div><b>${english ? "ESP devices" : "دستگاه‌های ESP"}</b><small>${english ? "Device credentials are private and never shown again after enrollment." : "اعتبارنامهٔ دستگاه خصوصی است و بعد از ثبت دوباره نمایش داده نمی‌شود."}</small></div></div><div class="talk-pair-card"><form data-talk-pair><label>${english ? "Device name" : "نام دستگاه"}<input name="name" maxlength="100" placeholder="${english ? "e.g. Boiler room" : "مثلاً موتورخانه"}" required></label><label>${english ? "Project" : "پروژه"}<select name="projectId"><option value="">${english ? "No project" : "بدون پروژه"}</option>${projectOptions}</select></label><button class="btn-primary" type="submit">${english ? "Create one-time pairing code" : "ساخت کد ثبت یک‌بارمصرف"}</button></form>${pairingCode ? `<div class="talk-pair-code"><b>${english ? "Copy this code into the ESP provisioning settings. It expires in 10 minutes and works once." : "این کد را در تنظیمات پروویژن ESP قرار دهید. کد پس از ۱۰ دقیقه منقضی می‌شود و فقط یک‌بار قابل‌استفاده است."}</b><code dir="ltr">${escapeHtml(pairingCode)}</code><button type="button" data-talk-copy>${english ? "Copy code" : "کپی کد"}</button></div>` : ""}</div><div class="talk-device-layout"><section class="talk-device-list"><h3>${english ? "Registered devices" : "دستگاه‌های ثبت‌شده"}</h3>${devices.length ? deviceCards : `<div class="talk-no-devices">${icons.wifi}<b>${english ? "No ESP devices yet" : "هنوز ESP ثبت نشده است"}</b><p>${english ? "Create a pairing code, then provision the device with the code and this server's HTTPS address." : "یک کد ثبت بسازید و دستگاه را با آن و نشانی HTTPS همین سرور پروویژن کنید."}</p></div>`}</section><section class="talk-device-console">${selected ? `<header class="talk-selected-device"><div><small>${english ? "Selected device" : "دستگاه انتخاب‌شده"}</small><b>${escapeHtml(selected.name || selected.deviceId)}</b><span>${selectedProject ? `${escapeHtml(selectedProject)} · ` : ""}${english ? "Last seen" : "آخرین ارتباط"}: <span data-talk-last-seen>${escapeHtml(talkFormatTime(selected.lastSeenAt))}</span></span></div><span class="talk-device-status ${selected.online ? "online" : ""}" data-talk-selected-status>${talkDeviceStatus(selected)}</span></header><div class="talk-quick-commands"><button type="button" data-talk-command="PING">PING</button><button type="button" data-talk-command="STATUS">STATUS</button><button type="button" data-talk-command="HELP">HELP</button><button type="button" data-talk-command="LED ON">LED ON</button><button type="button" data-talk-command="LED OFF">LED OFF</button></div><form class="talk-command-form" data-talk-command-form><label>${english ? "Type a command" : "فرمان را تایپ کنید"}<input name="command" maxlength="256" autocomplete="off" required placeholder="${english ? "Enter a device command" : "فرمان دستگاه را وارد کنید"}"></label><button class="btn-primary" type="submit">${english ? "Send" : "ارسال"}</button></form><div class="talk-history-heading"><h3>${english ? "Command history and replies" : "تاریخچهٔ فرمان و پاسخ‌ها"}</h3><small>${english ? "Updates automatically" : "به‌روزرسانی خودکار"}</small></div><div class="talk-history" data-talk-history><div class="talk-history-empty">${english ? "Loading…" : "در حال بارگذاری…"}</div></div>` : `<div class="talk-no-devices">${icons.wifi}<b>${english ? "Select or enroll a device" : "یک دستگاه انتخاب یا ثبت کنید"}</b><p>${english ? "Device connection status and command replies will appear here." : "وضعیت اتصال دستگاه و پاسخ فرمان‌ها اینجا نمایش داده می‌شود."}</p></div>`}</section></div></div>`;
  if (selected) {
    container.querySelector(".talk-device-console")?.insertAdjacentHTML("beforeend", `<div class="talk-chat-heading"><h3>${english ? "Live chat" : "گفت‌وگوی زنده"}</h3><small>${english ? "Serial Monitor ↔ Web" : "سریال مانیتور ↔ وب"}</small></div><div class="talk-chat" data-talk-chat aria-live="polite"><div class="talk-history-empty">${english ? "Loading messages…" : "در حال بارگذاری پیام‌ها…"}</div></div><form class="talk-command-form" data-talk-message-form><label>${english ? "Message the device" : "پیام به دستگاه"}<input name="message" maxlength="256" autocomplete="off" required placeholder="${english ? "Type a message for the ESP" : "پیام را بنویسید"}"></label><button class="btn-primary" type="submit">${english ? "Send message" : "ارسال پیام"}</button></form>`);
    const addClearButton = (heading, attribute, label) => {
      const hint = heading?.querySelector("small");
      if (!heading || !hint) return;
      const actions = document.createElement("div");
      actions.className = "talk-history-actions";
      hint.replaceWith(actions);
      actions.append(hint);
      actions.insertAdjacentHTML("beforeend", `<button type="button" class="talk-clear-section" ${attribute}>${icons.trash}<span>${label}</span></button>`);
    };
    addClearButton(container.querySelector(".talk-history-heading"), "data-talk-clear-commands", english ? "Clear history" : "پاک‌کردن تاریخچه");
    addClearButton(container.querySelector(".talk-chat-heading"), "data-talk-clear-messages", english ? "Clear messages" : "پاک‌کردن پیام‌ها");
  }
}

function renderTalkPage() {
  const english = state.language === "en";
  return `<section class="breadcrumb"><b>${english ? "Talk" : "صحبت"}</b></section><section class="page-intro talk-page-intro"><div class="page-intro-copy"><div class="eyebrow">${english ? "SECURE DEVICE CONSOLE" : "کنسول امن دستگاه"}</div><h2>${english ? "Talk to an ESP8266" : "ارتباط با ESP8266"}</h2><p>${english ? "Devices connect outbound over HTTPS. Commands and replies pass through this server." : "دستگاه‌ها از طریق HTTPS به سرور وصل می‌شوند و فرمان‌ها و پاسخ‌ها از همین سرور عبور می‌کنند."}</p></div></section><section class="talk-console-card"><header class="talk-console-header"><span class="talk-console-icon">${icons.message}</span><div><b>${english ? "Remote ESP console" : "کنسول راه‌دور ESP"}</b><small>${english ? "HTTPS polling · per-device credentials" : "ارتباط HTTPS · اعتبارنامهٔ مستقل برای هر دستگاه"}</small></div></header><div class="talk-console-body" data-talk-console-body>${english ? "Loading secure console…" : "در حال بارگذاری کنسول امن…"}</div></section>`;
}

async function talkLoadDevices() {
  const result = await talkApi("/api/talk/devices");
  return result.devices || [];
}

function talkRenderMessages(target, messages) {
  if (!target) return;
  const english = state.language === "en";
  target.innerHTML = messages.length ? messages.map((item) => "<article class=\"talk-chat-message " + (item.sender === "device" ? "from-device" : "from-web") + "\"><small>" + (item.sender === "device" ? (english ? "ESP · Serial" : "ESP · سریال") : (english ? "Web" : "وب")) + " · " + escapeHtml(talkFormatTime(item.createdAt)) + "</small><p>" + escapeHtml(item.message) + "</p></article>").join("") : "<div class=\"talk-history-empty\">" + (english ? "No chat messages yet." : "هنوز پیامی ردوبدل نشده است.") + "</div>";
  target.scrollTop = target.scrollHeight;
}

async function talkLoadHistory(container) {
  if (!talkSelectedDeviceId) return;
  const result = await talkApi(`/api/talk/devices/${encodeURIComponent(talkSelectedDeviceId)}/commands`);
  const commands = result.commands || [];
  talkRenderHistory(container.querySelector("[data-talk-history]"), commands);
  talkUpdateCommandFeedback(container, commands);
}

function talkUpdateCommandFeedback(container, commands) {
  if (!talkTrackedCommand || talkTrackedCommand.deviceId !== talkSelectedDeviceId) return;
  const command = commands.find((item) => item.id === talkTrackedCommand.commandId);
  if (!command) return;
  const english = state.language === "en";
  const messages = {
    pending: english ? "Command queued; waiting for the ESP to receive it." : "فرمان در صف است؛ منتظر دریافت آن توسط ESP هستیم.",
    claimed: english ? "The ESP received the command and is processing it." : "ESP فرمان را دریافت کرده و در حال اجراست.",
    completed: english ? "Response received." : "پاسخ دریافت شد.",
    failed: english
      ? `The ESP could not complete the command: ${command.error || command.response || "No error details."}`
      : `اجرای فرمان ناموفق بود: ${command.error || command.response || "جزئیات خطا دریافت نشد."}`,
    expired: english ? "The command expired before the ESP returned a result." : "مهلت فرمان تمام شد و پاسخی از ESP نرسید.",
  };
  const status = messages[command.status] ? command.status : "pending";
  if (talkTrackedCommand.lastStatus === status) return;
  talkTrackedCommand.lastStatus = status;
  talkSetFeedback(container, messages[status], status);
}

async function talkLoadMessages(container) {
  if (!talkSelectedDeviceId) return;
  const deviceId = talkSelectedDeviceId;
  const result = await talkApi("/api/talk/devices/" + encodeURIComponent(deviceId) + "/messages");
  const messages = result.messages || [];
  talkRenderMessages(container.querySelector("[data-talk-chat]"), messages);

  const seenIds = talkSeenDeviceMessages.get(deviceId);
  const newDeviceMessage = seenIds && messages.some((item) => item.sender === "device" && !seenIds.has(item.id));
  talkSeenDeviceMessages.set(deviceId, new Set(messages.map((item) => item.id)));

  let deliveredWebMessage = false;
  for (const item of messages) {
    if (item.sender === "web" && item.deliveredAt && talkPendingMessages.get(item.id) === deviceId) {
      talkPendingMessages.delete(item.id);
      deliveredWebMessage = true;
    }
  }
  const english = state.language === "en";
  if (newDeviceMessage) {
    talkSetFeedback(container, english ? "A new message was received from the ESP." : "پیام جدیدی از ESP دریافت شد.", "completed");
  } else if (deliveredWebMessage) {
    talkSetFeedback(container, english ? "The ESP received your message." : "پیام به ESP رسید.", "completed");
  }
}

async function talkUpdateLive(container) {
  if (!container.querySelector("[data-talk-authorized]")) return;
  const devices = await talkLoadDevices();
  devices.forEach((device) => {
    const card = container.querySelector(`[data-talk-device-card="${CSS.escape(device.deviceId)}"]`);
    if (card) {
      const status = card.querySelector("[data-talk-device-status]");
      const dot = card.querySelector(".talk-device-dot");
      if (status) { status.textContent = talkDeviceStatus(device); status.classList.toggle("online", device.online); }
      if (dot) dot.classList.toggle("online", device.online);
    }
  });
  const selected = devices.find((device) => device.deviceId === talkSelectedDeviceId);
  if (selected) {
    const status = container.querySelector("[data-talk-selected-status]");
    const seen = container.querySelector("[data-talk-last-seen]");
    if (status) { status.textContent = talkDeviceStatus(selected); status.classList.toggle("online", selected.online); }
    if (seen) seen.textContent = talkFormatTime(selected.lastSeenAt);
  }
  await talkLoadHistory(container);
  await talkLoadMessages(container);
}

function talkSetFeedback(container, message, stateName = "info") {
  if (!message) return;
  const tone = stateName === "completed" ? "success" : "info";
  showToast(escapeHtml(message), tone);
}

function talkQueueCommandFeedback(container, deviceId, command, acknowledgementOnly = false) {
  talkTrackedCommand = { deviceId, commandId: command.id, acknowledgementOnly, lastStatus: "pending" };
  talkSetFeedback(container, state.language === "en" ? "Command queued; waiting for the ESP to receive it." : "فرمان در صف است؛ منتظر دریافت آن توسط ESP هستیم.", "pending");
}

async function bindTalkConsole(root) {
  const container = root.querySelector("[data-talk-console-body]");
  if (!container) return;
  if (talkRefreshTimer) clearInterval(talkRefreshTimer);
  const english = state.language === "en";
  try {
    const session = await talkApi("/api/talk/session");
    if (!session.authenticated) {
      container.innerHTML = talkLoginMarkup();
    } else {
      talkRenderAuthenticated(container, await talkLoadDevices());
      await talkLoadHistory(container).catch(() => {});
      await talkLoadMessages(container).catch(() => {});
      talkRefreshTimer = setInterval(() => talkUpdateLive(container).catch((error) => {
        if (error.status === 401) { clearInterval(talkRefreshTimer); container.innerHTML = talkLoginMarkup(); }
      }), 3000);
    }
  } catch (error) {
    container.replaceChildren();
    talkSetFeedback(container, error.message || (english ? "Could not load the console." : "بارگذاری کنسول ممکن نشد."), "error");
  }
  if (root.dataset.talkBound === "1") return;
  root.dataset.talkBound = "1";
  root.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.matches("[data-talk-pair]")) {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      try {
        const result = await talkApi("/api/talk/pairing", { method: "POST", body: JSON.stringify(values) });
        talkRenderAuthenticated(container, await talkLoadDevices(), result.provisioningCode);
      } catch (error) { talkSetFeedback(container, error.message, "error"); }
    } else if (form.matches("[data-talk-command-form]")) {
      event.preventDefault();
      const command = new FormData(form).get("command");
      try {
        const deviceId = talkSelectedDeviceId;
        const result = await talkApi(`/api/talk/devices/${encodeURIComponent(deviceId)}/commands`, { method: "POST", body: JSON.stringify({ command }) });
        form.reset();
        talkQueueCommandFeedback(container, deviceId, result.command);
        await talkLoadHistory(container);
      } catch (error) { talkSetFeedback(container, error.message, "error"); }
    } else if (form.matches("[data-talk-message-form]")) {
      event.preventDefault();
      const message = new FormData(form).get("message");
      try {
        const deviceId = talkSelectedDeviceId;
        const result = await talkApi("/api/talk/devices/" + encodeURIComponent(deviceId) + "/messages", { method: "POST", body: JSON.stringify({ message }) });
        form.reset();
        talkPendingMessages.set(result.message.id, deviceId);
        talkSetFeedback(container, english ? "Message queued for delivery to the ESP." : "پیام در صف ارسال به ESP قرار گرفت.", "pending");
        await talkLoadMessages(container);
      } catch (error) { talkSetFeedback(container, error.message, "error"); }
    }
  });
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.matches("[data-talk-select]")) {
      talkSelectedDeviceId = button.dataset.talkSelect;
      talkSetFeedback(container, "", "info");
      try { talkRenderAuthenticated(container, await talkLoadDevices()); await talkLoadHistory(container); await talkLoadMessages(container); }
      catch (error) { talkSetFeedback(container, error.message, "error"); }
    } else if (button.matches("[data-talk-command]")) {
      try {
        const deviceId = talkSelectedDeviceId;
        const result = await talkApi(`/api/talk/devices/${encodeURIComponent(deviceId)}/commands`, { method: "POST", body: JSON.stringify({ command: button.dataset.talkCommand }) });
        talkQueueCommandFeedback(container, deviceId, result.command, true);
        await talkLoadHistory(container);
      } catch (error) { talkSetFeedback(container, error.message, "error"); }
    } else if (button.matches("[data-talk-clear-commands], [data-talk-clear-messages]")) {
      const deviceId = talkSelectedDeviceId;
      if (!deviceId) return;
      const clearingCommands = button.matches("[data-talk-clear-commands]");
      const confirmMessage = clearingCommands
        ? (english ? "Clear this device's command history? Active commands will continue running." : "تاریخچهٔ فرمان‌های این دستگاه پاک شود؟ فرمان‌های فعال به کار خود ادامه می‌دهند.")
        : (english ? "Clear this device's live chat messages?" : "پیام‌های گفت‌وگوی این دستگاه پاک شوند؟");
      if (!window.confirm(confirmMessage)) return;
      button.disabled = true;
      try {
        const endpoint = clearingCommands ? "commands/history" : "messages";
        await talkApi(`/api/talk/devices/${encodeURIComponent(deviceId)}/${endpoint}`, { method: "DELETE" });
        if (clearingCommands) {
          if (talkTrackedCommand?.deviceId === deviceId) talkTrackedCommand = null;
          await talkLoadHistory(container);
          talkSetFeedback(container, english ? "Command history cleared; active commands continue." : "تاریخچهٔ فرمان‌ها پاک شد؛ فرمان‌های فعال ادامه پیدا می‌کنند.", "completed");
        } else {
          await talkLoadMessages(container);
          talkSetFeedback(container, english ? "Chat messages cleared." : "پیام‌های گفت‌وگو پاک شد.", "completed");
        }
      } catch (error) {
        talkSetFeedback(container, error.message, "error");
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    } else if (button.matches("[data-talk-copy]")) {
      const code = container.querySelector(".talk-pair-code code")?.textContent || "";
      try { await navigator.clipboard.writeText(code); talkSetFeedback(container, english ? "Pairing code copied." : "کد ثبت کپی شد."); }
      catch { talkSetFeedback(container, english ? "Select and copy the pairing code." : "کد ثبت را انتخاب و کپی کنید."); }
    } else if (button.matches("[data-talk-revoke]")) {
      const confirmMessage = english ? "Revoke this device's credentials? It will lose access immediately." : "اعتبارنامهٔ این دستگاه لغو شود؟ دسترسی آن فوراً قطع خواهد شد.";
      if (!window.confirm(confirmMessage)) return;
      try {
        await talkApi(`/api/talk/devices/${encodeURIComponent(button.dataset.talkRevoke)}`, { method: "DELETE" });
        talkSelectedDeviceId = null;
        talkRenderAuthenticated(container, await talkLoadDevices());
      } catch (error) { talkSetFeedback(container, error.message, "error"); }
    }
  });
}
function getPanelReportedAlarmCount(panel) {
  const value = demoMode ? panel?.openAlarmCount ?? panel?.alarms : panel?.openAlarmCount;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function getProjectRuntimeSummary(project) {
  const panels = Array.isArray(project.panels) ? project.panels : [];
  const panelStates = panels.map((panel) => getPanelDirectoryState(project, panel));
  const connectedCount = panelStates.filter((entry) => entry.key === "connected").length;
  const alarmCounts = panels.map(getPanelReportedAlarmCount);
  const alarmCount = panels.length === 0
    ? 0
    : alarmCounts.every((value) => value !== null)
      ? alarmCounts.reduce((sum, value) => sum + value, 0)
      : null;

  if (demoMode) {
    const status = String(project.status || "").toLowerCase();
    return {
      statusKey: status === "آنلاین" || status === "online" ? "connected" : "attention",
      alarmCount,
    };
  }

  let statusKey = "unknown";
  if (panelStates.length === 0) statusKey = "unconfigured";
  else if (panelStates.some((entry) => ["offline", "error"].includes(entry.key))) statusKey = "attention";
  else if (panelStates.some((entry) => entry.key === "connecting")) statusKey = "connecting";
  else if (panelStates.some((entry) => entry.key === "unconfigured")) statusKey = "unconfigured";
  else if (panelStates.every((entry) => entry.key === "connected")) statusKey = "connected";
  else if (connectedCount > 0) statusKey = "partial";

  return { statusKey, alarmCount };
}

function getNavigationEventCount() {
  if (demoMode) return demoData?.demoNotificationCount || 0;
  return projects.reduce((total, project) => total + project.panels.reduce((count, panel) => count + (Array.isArray(panel.events) ? panel.events.length : 0), 0), 0);
}

function renderProjectCard(project) {
  const english = state.language === "en";
  const summary = getProjectRuntimeSummary(project);
  const statusLabels = {
    connected: english ? "Online" : "آنلاین",
    attention: english ? "Needs review" : "نیازمند بررسی",
    connecting: english ? "Connecting" : "در حال اتصال",
    unconfigured: english ? "Needs setup" : "نیاز به راه‌اندازی",
  };
  const hasUsefulStatus = Object.hasOwn(statusLabels, summary.statusKey);
  const statusClass = summary.statusKey === "connected" ? "online" : "attention";
  const statusIcon = summary.statusKey === "connected" ? icons.check : summary.statusKey === "connecting" ? icons.loader : icons.alertTriangle;
  const projectStatus = hasUsefulStatus
    ? "<span class='project-status " + statusClass + "'>" + statusIcon + "<span>" + statusLabels[summary.statusKey] + "</span></span>"
    : "";
  const previewFaults = demoFaultPreviewEnabled ? demoFaultPreview?.[project.id] : null;
  const isDemoFault = Boolean(previewFaults?.length)
    && (demoMode || summary.alarmCount === null || summary.alarmCount === 0);
  const actualFaultCount = !isDemoFault && summary.alarmCount > 0 ? summary.alarmCount : 0;
  const displayFaultCount = isDemoFault ? previewFaults.length : actualFaultCount;
  const faultLabel = isDemoFault
    ? (english ? "sample faults" : "فالت نمایشی")
    : (english ? "open faults" : "فالت باز");
  const faultTitle = isDemoFault
    ? previewFaults.map((fault) => fault.title).join("، ")
    : (english ? "Reported open faults" : "فالت‌های باز گزارش‌شده");
  const faultSummary = displayFaultCount > 0
    ? "<span class='alarm-count" + (isDemoFault ? " demo-fault-count" : "") + "' title='" + escapeHtml(faultTitle) + "' aria-label='" + faDigits(displayFaultCount) + " " + faultLabel + "'>" + icons.alertTriangle + "<b>" + faDigits(displayFaultCount) + "</b> " + faultLabel + "</span>"
    : "";
  // Keep large Data URLs out of innerHTML. The image is assigned after the
  // card has been mounted so uploaded images remain reliable in all browsers.
  const projectImage = isSafeImageSource(project.image) ? "<img class='project-card-image' data-project-image-id='" + escapeHtml(project.id) + "' alt='' decoding='async'>" : "<div class='building-illustration'>" + icons.project + "<span></span><span></span><span></span></div>";
  const coordinateLabel = project.coordinates?.lat !== null && project.coordinates?.lat !== undefined && project.coordinates?.lng !== null && project.coordinates?.lng !== undefined
    ? ` · ${Number(project.coordinates.lat).toFixed(4)}, ${Number(project.coordinates.lng).toFixed(4)}`
    : "";
  return "<button type='button' class='project-card' data-project-id='" + escapeHtml(project.id) + "'><div class='project-card-visual" + (isSafeImageSource(project.image) ? " has-project-image" : "") + "'>" + projectImage + projectStatus + "<span class='project-card-arrow'>" + icons.chevronLeft + "</span></div><div class='project-card-body'><div class='project-card-title'><div><small>" + escapeHtml(project.type) + "</small><h3>" + escapeHtml(project.name) + "</h3></div></div><p>" + icons.project + escapeHtml(project.location) + (coordinateLabel ? "<small class='project-coordinate-label' dir='ltr'>" + escapeHtml(coordinateLabel) + "</small>" : "") + "</p><div class='project-card-footer'><span>" + icons.panel + "<b>" + faDigits(project.panels.length) + "</b> " + (english ? "panels" : "پنل") + "</span>" + faultSummary + "</div></div></button>";
}

function hydrateProjectCardImages(root) {
  root.querySelectorAll("img[data-project-image-id]:not([data-project-gallery-image-id])").forEach((image) => {
    const project = projects.find((item) => item.id === image.dataset.projectImageId);
    const source = project && isSafeImageSource(project.image) ? project.image : "";
    if (!source) {
      image.closest(".project-card-visual")?.classList.remove("has-project-image");
      image.remove();
      return;
    }
    image.addEventListener("error", () => {
      if (isSafeImageData(source) && image.dataset.projectImageFallback !== "true") {
        image.dataset.projectImageFallback = "true";
        image.src = source;
        return;
      }
      const visual = image.closest("[data-project-image-container]") || image.closest(".project-card-visual");
      visual?.classList.remove("has-project-image");
      image.remove();
      if (visual && !visual.querySelector(".building-illustration, .project-image-empty")) {
        visual.insertAdjacentHTML("afterbegin", visual.classList.contains("project-image-manager-preview")
          ? "<div class='project-image-empty'>" + icons.image + "<span>" + (state.language === "en" ? "No image" : "بدون تصویر") + "</span></div>"
          : "<div class='building-illustration'>" + icons.project + "<span></span><span></span><span></span></div>");
      }
    }, { once: true });
    image.src = isSafeImageData(source)
      ? `/api/projects/${encodeURIComponent(project.id)}/image`
      : source;
  });
}

function hydrateProjectGalleryImages(root) {
  root.querySelectorAll("img[data-project-gallery-image-id]").forEach((image) => {
    const project = projects.find((item) => item.id === image.dataset.projectImageId);
    const galleryImage = project?.images?.find((item) => item.id === image.dataset.projectGalleryImageId);
    const source = galleryImage && isSafeImageSource(galleryImage.src) ? galleryImage.src : "";
    if (!source) {
      image.closest(".project-gallery-item")?.remove();
      return;
    }
    image.addEventListener("error", () => {
      if (isSafeImageData(source) && image.dataset.projectImageFallback !== "true") {
        image.dataset.projectImageFallback = "true";
        image.src = source;
        return;
      }
      image.closest(".project-gallery-item")?.remove();
    }, { once: true });
    image.src = isSafeImageData(source)
      ? `/api/projects/${encodeURIComponent(project.id)}/images/${encodeURIComponent(galleryImage.id)}`
      : source;
  });
}


function renderProjectStrip(project) {
  const english = state.language === "en";
  return `<div class="project-strip-wrap${state.projectMenuOpen ? " open" : " collapsed"}">
    <div class="project-strip-head">
      <div class="project-strip-heading"><span class="eyebrow">${english ? "ACTIVE PROJECTS" : "پروژه‌های فعال"}</span><b>${english ? "Projects" : "پروژه‌ها"}</b></div>
      <div class="project-strip-current"><span class="strip-icon">${icons.project}</span><span><b>${project.name}</b><small>${faDigits(project.panels.length)} ${english ? "panels" : "پنل"}</small></span></div>
      <div class="project-strip-actions"><button type="button" class="strip-back" data-back-projects>${icons.chevronRight}${english ? "All projects" : "همه پروژه‌ها"}</button><button type="button" class="icon-button small-icon project-strip-toggle" data-project-menu-toggle aria-expanded="${state.projectMenuOpen}" aria-label="${state.projectMenuOpen ? (english ? "Minimize projects" : "مینیمایز کردن پروژه‌ها") : (english ? "Expand projects" : "باز کردن پروژه‌ها")}">${state.projectMenuOpen ? icons.chevronUp : icons.chevronDown}</button></div>
    </div>
    <div class="project-strip">${projects.map((item) => `<button type="button" class="project-strip-item${item.id === project.id ? " active" : ""}" data-project-id="${item.id}"><span class="strip-icon">${icons.project}</span><span><b>${item.name}</b><small>${faDigits(item.panels.length)} ${english ? "panels" : "پنل"}</small></span>${item.id === project.id ? `<i class="strip-check">${icons.check}</i>` : ""}</button>`).join("")}</div>
  </div>`;
}


function renderPanelAlarmBadge(panel, english) {
  const count = getPanelReportedAlarmCount(panel);
  if (count === null && !demoMode) {
    return "<span class='panel-alarm unknown'><span>" + (english ? "Alarms" : "هشدار") + "</span><b>—</b></span>";
  }
  if (count === null || (demoMode && count === 0) || count === 0) return "";
  return "<span class='panel-alarm'>" + icons.fire + "<span>" + (english ? "Alarm" : "آلارم") + "</span><b>" + faDigits(count) + "</b></span>";
}

function renderPanelList(project, panel) {
  const english = state.language === "en";
  const activePanel = panel || { id: "", name: english ? "No panel selected" : "پنلی انتخاب نشده", code: "—" };
  return "<section class='project-strip-wrap panel-popup-wrap panel-selector-wrap" + (state.panelMenuOpen ? " open" : " collapsed") + "' aria-label='" + (english ? "Project panels" : "پنل‌های پروژه") + "'>"
     + "<div class='project-strip-head panel-popup-head'><div class='panel-popup-head-main'><div class='project-strip-heading panel-popup-title'><span class='panel-popup-icon'>" + icons.panel + "</span><div><span class='eyebrow'>" + (english ? "PROJECT PANELS" : "پنل‌های پروژه") + "</span><h3>" + (english ? "Panels in this project" : "پنل‌های این پروژه") + "</h3><p>" + faDigits(project.panels.length) + " " + (english ? "registered panels" : "پنل ثبت‌شده") + "</p></div></div><div class='project-strip-current panel-current-selection'><span>" + icons.panel + "</span><div><small>" + (english ? "Selected panel" : "پنل انتخاب‌شده") + "</small><b>" + escapeHtml(activePanel.name) + "</b><em>" + escapeHtml(activePanel.code) + "</em></div></div></div><div class='project-strip-actions panel-popup-actions'><button type='button' class='strip-back panel-refresh-button' data-panel-refresh aria-label='" + (english ? "Refresh panels" : "به‌روزرسانی پنل‌ها") + "'>" + icons.refresh + (english ? "Refresh" : "به‌روزرسانی") + "</button><button type='button' class='icon-button small-icon project-strip-toggle panel-popup-toggle' data-panel-menu-toggle aria-expanded='" + state.panelMenuOpen + "' aria-label='" + (state.panelMenuOpen ? (english ? "Minimize panels" : "مینیمایز کردن پنل‌ها") : (english ? "Expand panels" : "باز کردن پنل‌ها")) + "'>" + (state.panelMenuOpen ? icons.chevronUp : icons.chevronDown) + "</button></div></div>"
     + "<div class='panel-popup-body'><div class='panel-popup-list'>" + (project.panels.length ? project.panels.map((item) => "<div class='panel-list-item" + (item.id === activePanel.id ? " active" : "") + "'><button type='button' class='panel-select' data-panel-id='" + escapeHtml(item.id) + "'><span class='panel-list-icon'>" + icons.panel + "</span><span class='panel-list-copy'><b>" + escapeHtml(item.name) + "</b><small>" + escapeHtml(item.code) + "</small></span>" + (renderPanelAlarmBadge(item, english)) + (item.id === activePanel.id ? "<span class='selected-line'></span>" : "") + "</button></div>").join("") : "<div class='panel-empty-state'>" + (english ? "No panels have been added yet." : "هنوز پنلی اضافه نشده است.") + "</div>") + "</div><button type='button' class='add-panel-hint panel-add-from-hint' data-panel-create><span class='panel-add-hint-icon'>" + icons.plus + "</span><span><b>" + (english ? "Add a new panel" : "افزودن پنل جدید") + "</b><small>" + (english ? "Create a panel for this project. Connection and upload are managed separately." : "یک پنل جدید برای این پروژه تعریف کنید؛ اتصال و آپلود جداگانه مدیریت می‌شود.") + "</small></span></button></div></section>";
}

function isMobileWorkspace() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
}

function settingsMenuCollapsed() {
  return state.settingsTreeCollapsed;
}

function renderSettingsTree() {
  const renderNode = (node, depth = 0) => {
    const label = state.language === "en" ? node.en : node.label;
    const isOpen = state.openSettingsSections[node.id] !== false;
    return `<div class="tree-node depth-${depth}">${node.children ? `<button type="button" class="tree-parent${isOpen ? " open" : ""}" data-tree-parent="${node.id}"><span class="tree-chevron">${icons.chevronDown}</span>${icons[node.icon] || icons.settings}<span>${label}</span></button><div class="tree-children${isOpen ? " open" : " collapsed"}">${node.children.map((child) => renderNode(child, depth + 1)).join("")}</div>` : `<button type="button" class="tree-item${node.id === state.selectedSettingId ? " active" : ""}" data-setting-id="${node.id}">${icons[node.icon] || icons.settings}<span>${label}</span></button>`}</div>`;
  };
  const english = state.language === "en";
  const collapsed = settingsMenuCollapsed();
  return `<aside class="settings-tree-column${collapsed ? " minimized" : ""}"><div class="column-heading"><div class="settings-tree-heading"><span class="settings-tree-icon">${icons.settings}</span><div><span class="eyebrow">${english ? "PANEL CONFIGURATION" : "پیکربندی پنل"}</span><h3>${english ? "Panel settings" : "تنظیمات پنل"}</h3><p>${english ? "System configuration menu" : "منوی تنظیمات بر اساس مستندات سیستم"}</p></div></div><button type="button" class="icon-button small-icon settings-tree-toggle" data-settings-collapse aria-expanded="${!collapsed}" aria-label="${collapsed ? (english ? "Expand panel configuration" : "باز کردن پیکربندی پنل") : (english ? "Minimize panel configuration" : "مینیمایز کردن پیکربندی پنل")}">${collapsed ? icons.chevronLeft : icons.chevronRight}</button></div><div class="settings-tree">${settingsTree.map((node) => renderNode(node)).join("")}</div><div class="tree-note">${icons.check}<span><b>${english ? "Settings guide" : "راهنمای تنظیمات"}</b><small>${english ? "Select an item to view its settings." : "برای مشاهده هر بخش، گزینه‌ی آن را انتخاب کنید."}</small></span></div></aside>`;
}

function renderDetailHeader(panel, settingTitle) {
  return `<section class="detail-header"><div><div class="eyebrow">${state.language === "en" ? "PANEL SETTINGS" : "تنظیمات پنل"}</div><h2>${settingTitle}</h2><p>${state.language === "en" ? "Configuration for" : "تنظیمات"} <b>${panel.name}</b> · ${panel.code}</p></div></section>`;
}

function renderSettingDetail(panel) {
  const labels = { setting: ["تنظیمات عمومی", "Setting"], "date-time": ["تاریخ و زمان", "Date & Time"], "panel-caption": ["عنوان پنل", "Panel Caption"], "password-change": ["تغییر پسورد", "Password Change"], "saved-settings": ["تنظیمات ذخیره شده", "Saved Settings"], relay: ["خروجی رله‌ها", "Relay Output"], "night-mode": ["حالت شب و روز", "Night Mode"], "loop-card": ["کارت لوپ", "Loop Card"], group: ["گروه‌بندی", "Group"], features: ["قابلیت‌ها", "Features"], events: ["رویدادها", "Events"], "remote-panel": ["پنل از راه دور", "Remote Panel"], report: ["گزارش‌ها", "Report"], gsm: ["تلفن‌کننده GSM", "GSM"], customize: ["سفارشی‌سازی تلفن‌کننده", "Customize"], location: ["موقعیت پنل", "Location"], monitoring: ["مانیتورینگ", "Monitoring"] };
  const [titleFa, titleEn] = labels[state.selectedSettingId] || labels["date-time"];
  const title = state.language === "en" ? titleEn : titleFa;
  const body = ensureSettingActions({ setting: renderSystemSetting(), "date-time": renderDateTimeSetting(), "panel-caption": renderPanelCaptionSetting(), "password-change": renderPasswordChangeSetting(), "saved-settings": renderSavedSettingsSetting(), relay: renderRelaySetting(), "night-mode": renderNightSetting(), "loop-card": renderLoopCardSetting(), group: renderGroupSetting(), features: renderFeaturesSetting(), events: renderEventsSetting(), "remote-panel": renderRemoteSetting(), report: renderReportSetting(), gsm: renderGsmSetting(), customize: renderCustomizeSetting(), location: renderLocationSetting(), monitoring: renderMonitoringSetting() }[state.selectedSettingId] || renderDateTimeSetting());
  return `${renderDetailHeader(panel, title, titleEn)}<section class="detail-body">${body}</section>`;
}

function renderSystemSetting() {
  const english = state.language === "en";
  return `<div class="system-overview-grid"><article class="sub-card system-overview-card"><div class="sub-card-head"><div><h3>${english ? "System settings" : "تنظیمات سیستم"}</h3><p>${english ? "Manage the panel-wide settings used for events, reports, access, and identification." : "تنظیمات کلی پنل برای ثبت رویدادها، گزارش‌ها، دسترسی و شناسایی پنل را مدیریت کنید."}</p></div><span class="status-chip green">${english ? "4 sections" : "۴ بخش"}</span></div><div class="system-setting-list"><div><span>${icons.calendar}</span><b>${english ? "Date & Time" : "تاریخ و زمان"}</b><small>${english ? "Keep event timestamps accurate" : "دقت زمان ثبت رویدادها"}</small></div><div><span>${icons.settings}</span><b>${english ? "Language" : "زبان"}</b><small>${english ? "Choose the interface language" : "انتخاب زبان رابط کاربری"}</small></div><div><span>${icons.panel}</span><b>${english ? "Panel Caption" : "عنوان پنل"}</b><small>${english ? "Identify this panel across the workspace" : "شناسایی پنل در بخش‌های مختلف"}</small></div><div><span>${icons.settings}</span><b>${english ? "Password Change" : "تغییر پسورد"}</b><small>${english ? "Protect installer account access" : "امن‌سازی دسترسی حساب نصاب"}</small></div></div>${renderSettingActions()}</article><article class="sub-card helper-card"><div class="helper-icon">${icons.settings}</div><h3>${english ? "System overview" : "نمای کلی سیستم"}</h3><p>${english ? "Use the expanded Setting menu to configure identity, language, time, and account security." : "از زیرمنوی تنظیمات عمومی برای پیکربندی هویت پنل، زبان، زمان و امنیت حساب استفاده کنید."}</p></article></div>`;
}

function renderPanelCaptionSetting() {
  const english = state.language === "en";
  const panel = findPanel() || { name: english ? "No panel selected" : "پنلی انتخاب نشده", code: "—" };
  const displayCaption = `FIRE PANEL ${panel.code.split("-").pop()}`;
  return `<article class="sub-card"><div class="sub-card-head"><div><h3>${english ? "Panel Caption" : "عنوان پنل"}</h3><p>${english ? "Set the names used to identify this fire alarm panel." : "نام‌های مورد استفاده برای شناسایی پنل اعلام حریق را تعیین کنید."}</p></div><span class="status-chip green">${english ? "Ready" : "آماده"}</span></div><div class="compact-form panel-caption-form"><div class="field-block full"><label>${english ? "Panel name" : "نام پنل"}</label><div class="input-with-icon"><input type="text" value="${panel.name}" data-persist-setting aria-label="${english ? "Panel name" : "نام پنل"}"></div><small class="field-hint">${english ? "This name remains unchanged when the interface language changes." : "این نام با تغییر زبان رابط کاربری بدون تغییر باقی می‌ماند."}</small></div><div class="field-block full"><label>${english ? "Display Caption" : "عنوان نمایشی پنل"}</label><div class="input-with-icon"><input class="english-input" type="text" value="${displayCaption}" maxlength="24" pattern="[A-Za-z0-9 _-]+" inputmode="text" data-persist-setting data-english-only aria-label="${english ? "Display Caption" : "عنوان نمایشی پنل"}"></div><small class="field-hint display-caption-hint">${english ? "This value is shown on the panel display and must use English characters only (A-Z, 0-9, spaces, - or _)." : "این مقدار روی دیسپلی پنل نمایش داده می‌شود و حتماً باید فقط از کاراکترهای انگلیسی استفاده شود (حروف A-Z، اعداد، فاصله، - یا _)."}</small></div></div>${renderSettingActions()}</article>`;
}

function renderPasswordChangeSetting() {
  const english = state.language === "en";
  const panel = findPanel();
  const project = findProject();
  const endpoint = panel && project ? `/api/projects/${encodeURIComponent(project.id)}/panels/${encodeURIComponent(panel.id)}/user-profiles` : "";
  const cards = Array.from({ length: 4 }, (_item, index) => `<article class="panel-user-profile-card" data-panel-user-card="${index + 1}">
    <div class="panel-user-profile-card-head"><div class="panel-user-avatar" data-panel-user-avatar>${icons.user || icons.image}<img data-panel-user-photo alt="" hidden></div><div><span>${english ? `User ${index + 1}` : `کاربر ${faDigits(index + 1)}`}</span><small data-panel-user-password-state>${english ? "Password not set" : "رمز عبور تنظیم نشده"}</small></div></div>
    <label class="panel-user-photo-picker">${english ? "Profile photo" : "تصویر کاربر"}<input type="file" accept="image/png,image/jpeg,image/webp" data-panel-user-photo-input><span>${english ? "Choose image" : "انتخاب تصویر"}</span></label>
    <label>${english ? "Display name" : "نام نمایشی"}<input type="text" maxlength="100" data-panel-user-name autocomplete="off" placeholder="${english ? `User ${index + 1}` : `کاربر ${faDigits(index + 1)}`}"></label>
    <label>${english ? "Panel password" : "رمز عبور پنل"}<input type="password" maxlength="256" data-panel-user-password autocomplete="new-password" placeholder="${english ? "Leave blank to keep the current password" : "برای حفظ رمز فعلی خالی بگذارید"}"></label>
  </article>`).join("");
  return `<div class="panel-user-profiles" data-panel-user-profiles data-endpoint="${endpoint}">
    <article class="sub-card panel-user-profiles-card"><div class="sub-card-head"><div><h3>${english ? "Panel user profiles" : "مشخصات کاربران پنل"}</h3><p>${english ? "Set a name, photo and panel password for each of the four panel users. Passwords are encrypted before being stored." : "برای هر یک از چهار کاربر پنل، نام، تصویر و رمز عبور پنل را تعیین کنید. رمزها پیش از ذخیره‌سازی رمزنگاری می‌شوند."}</p></div><span class="panel-user-panel-badge">${escapeHtml(panel?.name || (english ? "Select a panel" : "پنلی انتخاب نشده"))}</span></div>
    ${panel ? `<div class="panel-user-profile-grid">${cards}</div><div class="panel-user-profile-actions"><small>${english ? "Profiles are stored for this panel after saving." : "مشخصات پس از ذخیره برای این پنل نگهداری می‌شوند."}</small><button type="button" class="btn-primary" data-panel-user-save>${english ? "Save users" : "ذخیره کاربران"}</button></div>` : `<p class="panel-user-no-panel">${english ? "Choose a project and panel to manage its users." : "برای مدیریت کاربران، پروژه و پنل موردنظر را انتخاب کنید."}</p>`}</article>
    <article class="sub-card self-password-setting"><div class="sub-card-head"><div><h3>${english ? "Change my account password" : "تغییر رمز عبور حساب کاربری من"}</h3><p>${english ? "Update the password for your personal account." : "رمز عبور حساب کاربری خود را تغییر دهید."}</p></div></div><form data-self-password-form class="compact-form"><label>${english ? "Current password" : "رمز عبور فعلی"}<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>${english ? "New password" : "رمز عبور جدید"}<input name="newPassword" type="password" autocomplete="new-password" minlength="10" required></label><label>${english ? "Confirm password" : "تکرار رمز عبور جدید"}<input name="confirmPassword" type="password" autocomplete="new-password" minlength="10" required></label><button class="btn-primary" type="submit">${english ? "Update password" : "تغییر رمز عبور"}</button></form></article>
  </div>`;
}

function renderDateTimeSetting() {
  const english = state.language === "en";
  const panelRequired = panelRequiredAttr(!state.connectedPanelId);
  const gregorian = toGregorian(state.year, state.month, state.day);
  const date = `${faDigits(state.year)}/${faDigits(pad(state.month))}/${faDigits(pad(state.day))}`;
  const time = `${faDigits(pad(state.hour))}:${faDigits(pad(state.minute))}`;
  return `<article class="panel-card date-time-card detail-card"><div class="card-heading"><div class="heading-icon teal">${icons.calendar}</div><div><h3>${english ? "Set date and time" : "تنظیم تاریخ و ساعت"}</h3><p>${english ? "Keep the fire alarm panel date and time accurate for event logs." : "تاریخ و ساعت سیستم اعلام حریق را تنظیم کنید تا ثبت رویدادها دقیق باشد."}</p></div><span class="step-badge">${english ? "Active" : "فعال"}</span></div><div class="form-area"><div class="field-block date-field-wrap"><label for="date-input">${english ? "Panel date" : "تاریخ پنل"}</label><div class="input-with-icon"><input id="date-input" type="text" readonly value="${date}" aria-label="${english ? "Panel date" : "تاریخ پنل"}" aria-haspopup="dialog" aria-expanded="${state.calendarOpen}"${panelRequired}>${icons.calendar}</div>${renderCalendar()}</div><div class="field-block time-field-wrap"><label for="time-input">${english ? "Panel time" : "ساعت پنل"}</label><div class="input-with-icon time-input"><input id="time-input" type="text" readonly value="${time}" aria-label="${english ? "Panel time" : "ساعت پنل"}" aria-haspopup="dialog" aria-expanded="${state.timeOpen}"${panelRequired}>${icons.clock}</div>${renderTimePicker()}<small class="field-hint">${english ? "24-hour format" : "فرمت ساعت ۲۴ ساعته"}</small></div></div><div class="selected-summary"><div class="summary-icon">${icons.check}</div><div><span>${english ? "Selected value" : "مقدار انتخاب‌شده"}</span><b id="selection-summary">${date}${english ? ", time " : "، ساعت "}${time}</b><small id="gregorian-summary">${english ? "Gregorian equivalent: " : "معادل میلادی: "}${gregorian}</small></div><span class="local-badge">${english ? "Jalali" : "شمسی"}</span></div><div class="info-banner compact-banner"><div class="banner-icon">${icons.wifi}</div><div><b>${english ? "Panel is not connected for this project" : "اتصال پنل برای این پروژه فعال نیست"}</b><p>${english ? "Values stay in this form until the panel connection is established." : "مقادیر فعلاً در فرم نگه‌داری می‌شوند و بعد از اتصال قابل ارسال خواهند بود."}</p></div></div>${renderSettingActions()}</article>`;
}

function renderToggleRow(label, description, checked = true) {
  return `<label class="toggle-row"><span><b>${label}</b><small>${description}</small></span><input type="checkbox" data-persist-setting ${checked ? "checked" : ""}><i></i></label>`;
}

function renderSettingActions() {
  return `<div class="inline-actions"><button type="button" class="btn-primary" data-save-setting>${icons.check}ذخیره تنظیمات</button></div>`;
}

function ensureSettingActions(markup) {
  if (markup.includes("self-password-setting")) return markup;
  if (markup.includes("data-save-setting")) return markup;
  return markup.replace("</article>", `${renderSettingActions()}</article>`);
}

function renderSavedSettingsSetting() {
  const english = state.language === "en";
  const panel = findPanel() || { id: "", name: english ? "No panel selected" : "پنلی انتخاب نشده", code: "—" };
  const files = (state.savedSettingFiles || []).filter((file) => file.panelId === panel?.id);
  const formatFileDate = (value) => {
    try { return new Intl.DateTimeFormat(english ? "en-US" : "fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
    catch { return value || "—"; }
  };
  const selectedId = state.selectedSavedSettingFileId;
  const connected = isCurrentPanelConnected();
  const cards = files.length ? files.map((file) => `<article class="saved-settings-file${file.id === selectedId ? " selected" : ""}"><div class="saved-settings-file-icon">${file.source === "panel-read" ? icons.refresh : icons.report}</div><div class="saved-settings-file-body"><div class="saved-settings-file-title"><b>${escapeHtml(file.name)}</b><span class="status-chip ${file.source === "panel-read" ? "amber" : "green"}">${file.source === "panel-read" ? (english ? "Read from panel" : "خوانده‌شده از پنل") : (english ? "Draft" : "پیش‌نویس")}</span></div><small>${english ? "Last updated" : "آخرین بروزرسانی"}: ${formatFileDate(file.updatedAt)}</small></div><button type="button" class="btn-secondary compact" data-settings-file-select="${file.id}" aria-pressed="${file.id === selectedId}">${file.id === selectedId ? (english ? "Deselect" : "لغو انتخاب") : (english ? "Load" : "بارگذاری")}</button>${file.source === "draft" ? `<button type="button" class="btn-secondary compact saved-settings-delete-button" data-settings-file-delete="${file.id}" aria-label="${english ? `Delete draft ${escapeHtml(file.name)}` : `حذف پیش‌نویس ${escapeHtml(file.name)}`}">${icons.trash || "×"}${english ? "Delete" : "حذف"}</button>` : ""}</article>`).join("") : `<div class="saved-settings-empty"><span>${icons.report}</span><b>${english ? "No saved settings for this panel" : "هنوز فایلی برای این پنل ذخیره نشده است"}</b><small>${english ? "Create a draft or read the current values from the panel." : "یک پیش‌نویس بسازید یا مقادیر فعلی پنل را بخوانید."}</small></div>`;
  return `<div class="saved-settings-root"><article class="sub-card saved-settings-card"><div class="sub-card-head"><div><h3>${english ? "Saved settings" : "تنظیمات ذخیره شده"}</h3><p>${english ? "Manage independent draft files for this panel. Saving a draft does not upload it to the panel." : "فایل‌های پیش‌نویس مستقل این پنل را مدیریت کنید. ذخیره پیش‌نویس به‌معنی آپلود روی پنل نیست."}</p></div><span class="status-chip green">${english ? `${files.length} files` : `${faDigits(files.length)} فایل`}</span></div><div class="saved-settings-connection-bar"><div class="saved-settings-connection-status"><span class="connection-dot${connected ? " connected" : ""}"></span><div><b>${english ? "Panel connection" : "اتصال به پنل"} <span class="status-chip amber">${english ? "Sample display" : "نمایش نمونه"}</span></b><small>${connected ? (english ? `${panel.code} is connected (sample state)` : `${panel.code} متصل است (وضعیت نمونه)`) : (english ? `${panel.code} is disconnected (sample state)` : `${panel.code} متصل نیست (وضعیت نمونه)`)}</small></div></div><button type="button" class="panel-connect-button saved-settings-connect-button${connected ? " connected" : ""}" data-settings-connect-panel="${panel.id}" aria-pressed="${connected}">${connected ? icons.check + (english ? "Simulate disconnect" : "شبیه‌سازی قطع اتصال") : icons.wifi + (english ? "Simulate connect" : "شبیه‌سازی اتصال")}</button></div><div class="saved-settings-sample-note">${english ? "Display only: this sample status does not represent a live panel connection." : "صرفاً نمایشی: این وضعیت نمونه، اتصال واقعی به پنل را نشان نمی‌دهد."}</div><div class="saved-settings-toolbar"><input type="text" data-settings-file-name placeholder="${english ? "New file name" : "نام فایل جدید"}" aria-label="${english ? "New file name" : "نام فایل جدید"}"><button type="button" class="btn-primary compact" data-settings-file-create>${icons.report}${english ? "Create draft" : "ایجاد پیش‌نویس"}</button><button type="button" class="btn-secondary compact" data-read-panel>${icons.refresh}${english ? "Read from panel" : "خواندن از پنل"}</button></div><div class="saved-settings-file-list">${cards}</div><div class="saved-settings-footer"><button type="button" class="btn-secondary" data-upload-panel>${icons.wifi}${english ? "Upload selected file to panel" : "آپلود فایل انتخاب‌شده روی پنل"}</button><small>${english ? "Select a file first. Uploading is a separate operation from saving." : "ابتدا یک فایل را انتخاب کنید. آپلود فرآیندی جدا از ذخیره‌سازی پیش‌نویس است."}</small></div>${renderSettingActions()}</article><article class="sub-card helper-card saved-settings-helper"><div class="helper-icon">${icons.check}</div><h3>${english ? "Safe configuration workflow" : "روند امن تنظیمات"}</h3><p>${english ? "Panel readings are kept as read-only reference files. Any edits are saved into a separate draft file." : "تنظیمات خوانده‌شده از پنل به‌عنوان فایل مرجع نگه‌داری می‌شوند و تغییرات شما در یک پیش‌نویس جدا ذخیره می‌شود."}</p></article></div>`;
}

function renderRelaySetting() {
  const english = state.language === "en";
  const panel = findPanel();
  const demoRows = demoData?.demoRelayRows || [];
  const relayKeys = ["fire", "fault", "pre"];
  const options = ["حریق / Fire", "خطا / Fault", "پیش‌هشدار / Pre-Alarm", "نظارت / Supervisory", "غیرفعال"];
  const rows = relayKeys.map((key, index) => {
    const definition = demoMode ? demoRows[index] : null;
    const selectedValue = definition?.value || "";
    const name = definition?.name || (english ? "Relay " : "رله ") + (index + 1);
    const optionMarkup = options.map((option) => "<option value=\"" + escapeHtml(option) + "\"" + (selectedValue === option ? " selected" : "") + ">" + option + "</option>").join("");
    return "<div class=\"relay-row\"><span class=\"relay-number\">" + icons.panel + "</span><div><b>" + escapeHtml(name) + "</b><small>" + (english ? "Configurable panel output" : "خروجی قابل تنظیم پنل") + "</small></div><select data-setting-input=\"" + key + "\" data-persist-setting><option value=\"\" " + (selectedValue ? "" : "selected") + ">" + (english ? "Select an event" : "انتخاب رخداد") + "</option>" + optionMarkup + "</select></div>";
  }).join("");
  const storedRelayValues = state.formValues?.relay;
  const configuredCount = demoMode
    ? demoData?.demoRelayCount ?? null
    : Array.isArray(storedRelayValues)
      ? storedRelayValues.filter((item) => typeof item?.value === "string" && item.value.length > 0).length
      : null;
  const relayStatus = configuredCount === null
    ? (english ? "Configuration not reported" : "پیکربندی گزارش نشده")
    : (english ? configuredCount + " configured outputs" : faDigits(configuredCount) + " خروجی تنظیم‌شده");
  const lastRead = demoMode ? demoData?.demoRelayLastRead?.[english ? "en" : "fa"] : panel?.lastReadAt;
  const parsedLastRead = lastRead && !demoMode ? new Date(lastRead) : null;
  const lastReadLabel = demoMode
    ? lastRead || (english ? "No panel read yet" : "هنوز از پنل خوانده نشده")
    : parsedLastRead && !Number.isNaN(parsedLastRead.valueOf())
      ? (english ? "Last read: " : "آخرین خواندن: ") + new Intl.DateTimeFormat(english ? "en-US" : "fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(parsedLastRead)
      : (english ? "Panel has not been read yet" : "هنوز از پنل خوانده نشده");
  return "<div class=\"setting-panel-grid\"><article class=\"sub-card\"><div class=\"sub-card-head\"><div><h3>" + (english ? "Relay outputs" : "خروجی رله‌ها") + "</h3><p>" + (english ? "Set relay behavior for panel events." : "عملکرد هر رله را برای رخدادهای پنل تعیین کنید.") + "</p></div><span class=\"status-chip " + (configuredCount === null ? "amber" : "green") + "\">" + relayStatus + "</span></div><div class=\"relay-list\">" + rows + "</div>" + renderSettingActions() + "</article><article class=\"sub-card helper-card\"><div class=\"helper-icon\">" + icons.bell + "</div><h3>" + (english ? "Helpful note" : "نکته کاربردی") + "</h3><p>" + (english ? "Relay outputs define how connected equipment such as sirens and fans respond." : "تنظیم خروجی رله‌ها رفتار تجهیزات جانبی مانند آژیر، فن و سیستم‌های اعلان را مشخص می‌کند.") + "</p><div class=\"mini-status\">" + icons.clock + escapeHtml(lastReadLabel) + "</div></article></div>";
}

function renderNightSetting() {
  const english = state.language === "en";
  const disabled = false;
  const disabledAttr = panelRequiredAttr(disabled);
  const statusLabel = (enabled) => enabled ? (english ? "Enabled" : "فعال") : (english ? "Disabled" : "غیرفعال");
  const timeValue = (hour, minute) => `${faDigits(pad(hour))}:${faDigits(pad(minute))}`;
  const switchRow = (id, label, description, enabled) => `<label class="night-switch-row${disabled ? " is-disabled" : ""}"><span><b>${label}</b><small>${description}</small></span><span class="night-switch-wrap"><em>${statusLabel(enabled)}</em><input type="checkbox" data-night-toggle="${id}" ${enabled ? "checked" : ""}${disabledAttr}><i class="night-switch"></i></span></label>`;
  const timeField = (kind, label, hour, minute) => `<div class="field-block night-time-field"><label for="night-time-${kind}">${label}</label><div class="input-with-icon time-input"><input id="night-time-${kind}" class="night-time-input" type="text" readonly value="${timeValue(hour, minute)}" data-night-time-input="${kind}" aria-label="${label}"${disabledAttr}>${icons.clock}</div>${renderNightTimePicker(kind, english)}</div>`;
  const weekendDays = english ? [["saturday", "Saturday"], ["sunday", "Sunday"], ["monday", "Monday"], ["tuesday", "Tuesday"], ["wednesday", "Wednesday"], ["thursday", "Thursday"], ["friday", "Friday"]] : [["saturday", "شنبه"], ["sunday", "یکشنبه"], ["monday", "دوشنبه"], ["tuesday", "سه‌شنبه"], ["wednesday", "چهارشنبه"], ["thursday", "پنجشنبه"], ["friday", "جمعه"]];
  const dayOptions = (selected) => weekendDays.map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
  const selectedHoliday = state.holidayDates[state.selectedHolidayIndex] || { year: state.holidayYear, month: state.holidayMonth, day: state.holidayDay };
  const holidayRows = state.holidayDates.length ? state.holidayDates.map((holiday, index) => `<button type="button" class="holiday-entry${index === state.selectedHolidayIndex ? " selected" : ""}" data-holiday-select="${index}"><span>${faDigits(holiday.year)}/${faDigits(pad(holiday.month))}/${faDigits(pad(holiday.day))}</span><b>${english ? `Holiday ${index + 1}` : `تعطیلی ${faDigits(index + 1)}`}</b>${index === state.selectedHolidayIndex ? icons.check : ""}</button>`).join("") : `<p class="holiday-empty">${english ? "No holidays added yet." : "هنوز تعطیلی‌ای اضافه نشده است."}</p>`;
  return `<div class="night-settings-root"><div class="setting-panel-grid"><article class="sub-card"><div class="sub-card-head"><div><h3>${english ? "Day / Night Mode" : "حالت شب و روز"}</h3><p>${english ? "Schedule when the panel uses day or night behavior." : "زمان اجرای حالت روز و شب پنل را برنامه‌ریزی کنید."}</p></div><span class="status-chip ${state.dailyDayNightEnabled ? "green" : "amber"}">${statusLabel(state.dailyDayNightEnabled)}</span></div><div class="night-setting-sections"><section class="night-setting-section"><div class="night-section-head"><h4>${english ? "Daily Day/Night" : "روز و شب روزانه"}</h4><small>${english ? "Automatic day and night schedule" : "برنامه خودکار حالت روز و شب"}</small></div>${switchRow("daily", english ? "Status" : "وضعیت", english ? "Enable or disable the daily schedule." : "برنامه روزانه را فعال یا غیرفعال کنید.", state.dailyDayNightEnabled)}${state.dailyDayNightEnabled ? `<div class="night-control-panel${disabled ? " is-disabled" : ""}">${timeField("start", english ? "Start Time" : "ساعت شروع", state.nightStartHour, state.nightStartMinute)}${timeField("end", english ? "End Time" : "ساعت پایان", state.nightEndHour, state.nightEndMinute)}</div>` : ""}</section><section class="night-setting-section"><div class="night-section-head"><h4>${english ? "Weekend" : "آخر هفته"}</h4><small>${english ? "Apply the night schedule on selected days" : "اعمال برنامه شب در روزهای انتخاب‌شده"}</small></div>${switchRow("weekend", english ? "Status" : "وضعیت", english ? "Enable or disable weekend behavior." : "عملکرد آخر هفته را فعال یا غیرفعال کنید.", state.weekendEnabled)}${state.weekendEnabled ? `<div class="night-control-panel weekend-panel${disabled ? " is-disabled" : ""}"><div class="field-block"><label>${english ? "Day 1" : "روز ۱"}</label><select data-weekend-day="1"${disabledAttr}>${dayOptions(state.weekendDay1)}</select></div><div class="field-block"><label>${english ? "Day 2" : "روز ۲"}</label><select data-weekend-day="2"${disabledAttr}>${dayOptions(state.weekendDay2)}</select></div></div>` : ""}</section><section class="night-setting-section holiday-setting-section"><div class="night-section-head"><h4>${english ? "Holiday" : "تعطیلات"}</h4><small>${english ? "Apply the night schedule on selected holidays" : "اعمال برنامه شب در تعطیلات انتخاب‌شده"}</small></div>${switchRow("holiday", english ? "Status" : "وضعیت", english ? "Enable or disable holiday behavior." : "عملکرد تعطیلات را فعال یا غیرفعال کنید.", state.holidayEnabled)}${state.holidayEnabled ? `<div class="night-control-panel holiday-control-panel${disabled ? " is-disabled" : ""}"><div class="field-block holiday-date-field"><label for="holiday-date-input">${english ? "Date" : "تاریخ"}</label><div class="input-with-icon"><input id="holiday-date-input" type="text" readonly value="${faDigits(selectedHoliday.year)}/${faDigits(pad(selectedHoliday.month))}/${faDigits(pad(selectedHoliday.day))}" data-holiday-date-input aria-label="${english ? "Holiday date" : "تاریخ تعطیلی"}"${disabledAttr}>${icons.calendar}</div>${renderHolidayCalendar()}</div><div class="holiday-actions"><button type="button" class="btn-primary compact" data-holiday-add${disabledAttr}>+ ${english ? "Add" : "افزودن"}</button><button type="button" class="btn-secondary compact" data-holiday-delete${disabledAttr}>${english ? "Delete" : "حذف"}</button></div><div class="holiday-list" role="listbox" aria-label="${english ? "Holiday dates" : "تاریخ‌های تعطیلات"}">${holidayRows}</div></div>` : ""}</section></div><div class="night-danger-actions"><button type="button" class="btn-danger compact" data-night-delete-all${disabledAttr}>${english ? "Delete All" : "حذف همه"}</button></div>${renderSettingActions()}</article></div></div>`;
}

function renderLoopCardSetting() {
  const english = state.language === "en";
  const disabled = false;
  const disabledAttr = panelRequiredAttr(disabled);
  const card = state.loopCards.find((item) => item.id === state.selectedLoopCardId) || state.loopCards[0];
  const devices = card?.devices || [];
  const selectedDevice = devices.find((device) => device.id === state.selectedLoopDeviceId);
  const selectedAddress = selectedDevice ? faDigits(selectedDevice.number) : "—";
  const deviceByAddress = new Map(devices.map((device) => [Number(device.number), device]));
  const typeLabel = (key) => { const type = loopDeviceTypes.find((item) => item.key === key) || loopDeviceTypes[0]; return english ? type.en : type.fa; };
  const categoryLabel = (key) => ({ relay: english ? "Relay" : "رله", control: english ? "Control" : "کنترل", other: english ? "Other" : "سایر", "cl-b-s-b": "CL-B-S-B", "cl-b-s-c": "CL-B-S-C" }[key] || key);
  const selectOptions = (options, selected) => options.map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
  const field = (device, name, content) => {
    if (name === "style") return "";
    if (name === "location") return `<input type="text" value="${content}" data-loop-device-field="${name}" data-loop-device-id="${device.id}" aria-label="${name}"${disabledAttr}>`;
    const control = `<select data-loop-device-field="${name}" data-loop-device-id="${device.id}" aria-label="${name}"${disabledAttr}>${content}</select>`;
    return name === "type" ? `<span class="loop-device-type-field">${deviceIconMarkup(device.type)}${control}</span>` : control;
  };
  const renderDeviceRow = (device) => `<div class="loop-device-row${state.selectedLoopDeviceId === device.id ? " selected" : ""}" data-loop-address="${device.number}"><label class="loop-row-selector"><input type="radio" name="loop-device-select" data-loop-device-select="${device.id}" ${state.selectedLoopDeviceId === device.id ? "checked" : ""}${disabledAttr}><span></span></label><div class="loop-number">${faDigits(device.number)}</div>${field(device, "enabled", selectOptions([["enabled", english ? "Enable" : "فعال"], ["disabled", english ? "Disable" : "غیرفعال"]], device.enabled ? "enabled" : "disabled"))}${field(device, "style", selectOptions([["class-b", "Class B"], ["class-a", "Class A"]], device.style))}${field(device, "type", loopDeviceTypes.map((type) => [type.key, english ? type.en : type.fa]).map(([value, label]) => `<option value="${value}" ${device.type === value ? "selected" : ""}>${label}</option>`).join(""))}${field(device, "category", selectOptions(loopCategories.map((item) => [item, categoryLabel(item)]), device.category))}${field(device, "inputType", selectOptions([["alarm", "Alarm"], ["supervisory", "Supervisory"]], device.inputType || "alarm"))}${field(device, "deactivation", selectOptions([["silence", english ? "Silence" : "سایلنس"], ["reset", english ? "Reset" : "ریست"], ["auto-reset", english ? "Auto Reset" : "اتو ریست"]], device.deactivation || "silence"))}${field(device, "sensitivity", selectOptions([["low", english ? "Low" : "کم"], ["medium", english ? "Medium" : "متوسط"], ["high", english ? "High" : "زیاد"]], device.sensitivity))}${field(device, "nightMode", selectOptions([["day", english ? "Day" : "روز"], ["night", english ? "Night" : "شب"]], device.nightMode))}${field(device, "location", device.location || "")}</div>`;
  const renderEmptyRow = (address) => `<div class="loop-device-row loop-empty-row" data-loop-address="${address}"><span></span><button type="button" class="loop-empty-address" data-loop-empty-address="${address}"${disabledAttr}>${faDigits(address)}</button><span>—</span><span>—</span><span>—</span><span>—</span><span>—</span><span>—</span><span>—</span><span>—</span><span>${english ? "Empty slot" : "خانه خالی"}</span></div>`;
  const filteredDevices = devices
    .filter(loopDeviceMatchesActiveFilters)
    .sort((first, second) => Number(first.number) - Number(second.number));
  const rows = loopDeviceFiltersUseCompactList()
    ? filteredDevices.length
      ? filteredDevices.map(renderDeviceRow).join("")
      : `<div class="loop-empty-state">${english ? "No devices match the selected filter." : "دیوایسی مطابق فیلتر انتخاب‌شده پیدا نشد."}</div>`
    : Array.from({ length: 254 }, (_, index) => {
      const address = index + 1;
      const device = deviceByAddress.get(address);
      return device ? renderDeviceRow(device) : renderEmptyRow(address);
    }).join("");
  const countCards = loopDeviceTypes.map((type) => `<div class="loop-type-count"><span>${deviceIconMarkup(type.key)}${typeLabel(type.key)}</span><b>${faDigits(devices.filter((device) => device.type === type.key).length)}</b></div>`).join("");
  const filterOptions = [["all", english ? "All devices" : "همه دیوایس‌ها"], ...loopDeviceTypes.map((type) => [type.key, typeLabel(type.key)])];
  const cardChoices = state.loopCards.map((loopCard) => `<button type="button" class="loop-card-choice${loopCard.id === card?.id ? " selected" : ""}" data-loop-card-select="${loopCard.id}"${disabledAttr}><span><b>${loopCard.label}</b><small>${faDigits(loopCard.devices.length)} ${english ? "devices" : "دیوایس"}</small></span></button>`).join("");
  return `<article class="sub-card loop-card-setting"><div class="sub-card-head"><div><h3>${english ? "Loop Card" : "کارت لوپ"}</h3><p>${english ? "Select a loop card and manage its 1–254 device addresses." : "یک کارت لوپ را انتخاب کنید و آدرس‌های ۱ تا ۲۵۴ دیوایس آن را مدیریت کنید."}</p></div><span class="status-chip ${disabled ? "amber" : "green"}">${disabled ? (english ? "Not connected" : "اتصال برقرار نیست") : (english ? "Connected" : "متصل")}</span></div><div class="loop-card-picker">${cardChoices}</div><div class="loop-type-counts">${countCards}</div><div class="loop-toolbar"><div class="loop-toolbar-actions"><button type="button" class="btn-secondary compact" data-loop-read${disabledAttr}>${icons.refresh}${english ? "Read Device" : "شناسایی دیوایس"}</button></div><div class="loop-filter-controls"><label>${english ? "Filter Device" : "فیلتر دیوایس"}<select data-loop-filter-select${disabledAttr}>${filterOptions.map(([value, label]) => `<option value="${value}" ${state.loopDeviceFilter === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label class="loop-filter-check"><input type="checkbox" data-loop-filter-toggle="present" ${state.loopOnlyPresent ? "checked" : ""}${disabledAttr}><span>${english ? "Installed devices" : "دیوایس‌های موجود"}</span></label><label class="loop-filter-check"><input type="checkbox" data-loop-filter-toggle="active" ${state.loopOnlyActive ? "checked" : ""}${disabledAttr}><span>${english ? "Active devices" : "دیوایس‌های فعال"}</span></label><button type="button" class="btn-ghost compact" data-loop-filter-all${disabledAttr}>${english ? "Show All" : "نمایش همه"}</button></div></div><div class="loop-add-panel"><div class="loop-add-field"><label for="loop-address-input">${english ? "Device Address" : "آدرس دیوایس"}</label><input id="loop-address-input" type="number" min="1" max="254" step="1" inputmode="numeric" placeholder="${english ? "1–254 or automatic" : "۱ تا ۲۵۴ یا انتخاب خودکار"}" data-loop-address-input${disabledAttr}></div><div class="loop-add-field"><label>${english ? "Device Type" : "نوع دیوایس"}</label><select class="loop-add-select" data-loop-new-type${disabledAttr}>${loopDeviceTypes.map((type) => `<option value="${type.key}">${typeLabel(type.key)}</option>`).join("")}</select></div><button type="button" class="btn-primary compact loop-add-button" data-loop-add${disabledAttr}>+ ${english ? "Add Device" : "افزودن دیوایس"}</button><small class="loop-add-hint">${english ? "Click an empty address below to fill it automatically." : "برای تکمیل خودکار، روی یکی از آدرس‌های خالی زیر کلیک کنید."}</small><small class="loop-add-error">${state.loopAddError || ""}</small></div><div class="loop-summary"><span>${english ? "Selected card" : "کارت انتخاب‌شده"}: <b>${card?.label || "LoopCard1"}</b></span><span>${english ? "Selected address" : "آدرس انتخاب‌شده"}: <b dir="ltr" data-loop-selected-address>${selectedAddress}</b></span><span>${english ? "Empty addresses" : "آدرس‌های خالی"}: <b>${faDigits(254 - devices.length)}</b></span><span>${english ? "Address range" : "محدوده آدرس"}: <b dir="ltr">1–254</b></span></div><div class="loop-device-scroller"><div class="loop-device-table"><div class="loop-device-head"><span></span><span>${english ? "Address" : "آدرس"}</span><span>${english ? "Status" : "وضعیت"}</span><span>${english ? "Style" : "نوع سیم‌کشی"}</span><span>${english ? "Device" : "دیوایس"}</span><span>${english ? "Category" : "دسته‌بندی"}</span><span>${english ? "Input Type" : "نوع ورودی"}</span><span>${english ? "Deactivation" : "عملکرد غیرفعال‌سازی"}</span><span>${english ? "Sensitivity" : "حساسیت"}</span><span>${english ? "Night Mode" : "حالت کارکرد"}</span><span>${english ? "Location" : "موقعیت"}</span></div>${rows}</div></div><div class="loop-device-actions"><button type="button" class="btn-danger compact" data-loop-delete${disabledAttr}>${english ? "Delete" : "حذف"}</button><button type="button" class="btn-danger compact" data-loop-delete-all${disabledAttr}>${english ? "Delete All" : "حذف همه"}</button><span class="loop-action-spacer"></span><button type="button" class="btn-secondary compact" data-loop-print${disabledAttr}>${icons.report}${english ? "Print" : "چاپ"}</button></div>${renderSettingActions()}</article>`;
}

function selectedLoopCard() {
  return state.loopCards.find((card) => card.id === state.selectedLoopCardId) || state.loopCards[0];
}

function loopDeviceMatchesActiveFilters(device) {
  if (!device) return false;
  if (state.loopDeviceFilter !== "all" && device.type !== state.loopDeviceFilter) return false;
  if (state.loopOnlyActive && !device.enabled) return false;
  return true;
}

function loopDeviceFiltersUseCompactList() {
  return state.loopDeviceFilter !== "all" || state.loopOnlyPresent || state.loopOnlyActive;
}

function redrawLoopCardSetting({ previousAddressOverride } = {}) {
  const root = document.querySelector(".loop-card-setting");
  if (!root) return;
  const currentScroller = root.querySelector(".loop-device-scroller");
  const previousSelectedId = state.selectedLoopDeviceId;
  const previousCard = selectedLoopCard();
  const previousSelectedDevice = previousCard?.devices.find((device) => device.id === previousSelectedId);
  const previousAddress = previousAddressOverride !== undefined
    ? previousAddressOverride
    : previousSelectedDevice ? Number(previousSelectedDevice.number) : null;
  const previousScrollTop = currentScroller ? currentScroller.scrollTop : null;
  root.outerHTML = renderLoopCardSetting();
  const nextCard = selectedLoopCard();
  const nextSelectedDevice = nextCard?.devices.find((device) => device.id === state.selectedLoopDeviceId);
  const nextAddress = nextSelectedDevice ? Number(nextSelectedDevice.number) : null;
  const keepCurrentScroll = previousScrollTop !== null
    && previousAddress !== null
    && nextAddress !== null
    && Math.abs(nextAddress - previousAddress) <= 5;
  bindLoopCardEvents(keepCurrentScroll ? { restoreScrollTop: previousScrollTop } : { previousAddress });
}

function scrollSelectedLoopDevice({ previousAddress = null } = {}) {
  const selectedId = state.selectedLoopDeviceId;
  if (!selectedId) return;
  const pageScrollLeft = window.scrollX;
  const pageScrollTop = window.scrollY;
  const moveToSelectedRow = () => {
    const scroller = document.querySelector(".loop-card-setting .loop-device-scroller");
    const row = [...(scroller?.querySelectorAll(".loop-device-row") || [])].find((item) => item.querySelector("[data-loop-device-select]")?.dataset.loopDeviceSelect === selectedId);
    if (!scroller || !row) return;
    const selectedAddress = Number(row.dataset.loopAddress);
    const hasPreviousAddress = Number.isFinite(previousAddress) && Number.isFinite(selectedAddress);
    if (hasPreviousAddress && Math.abs(selectedAddress - previousAddress) <= 5) return;
    const rowHeight = row.offsetHeight || 58;
    const rowTop = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const centeredTop = rowTop - Math.max(0, (scroller.clientHeight - rowHeight) / 2);
    const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const targetTop = Math.max(0, Math.min(maxScrollTop, centeredTop));
    scroller.scrollTop = targetTop;
    window.scrollTo(pageScrollLeft, pageScrollTop);
  };
  requestAnimationFrame(() => requestAnimationFrame(moveToSelectedRow));
}

function readLoopCardDevices(card) {
  card.devices = loopDeviceTypes.map((type, index) => makeLoopDevice(card.id, index + 1, type.key, {
    enabled: index !== 4,
    style: index % 3 === 0 ? "class-a" : "class-b",
    category: type.category,
    ip: `001.${String(index + 1).padStart(3, "0")}`,
    inputType: index % 3 === 0 ? "supervisory" : "alarm",
    deactivation: index === 4 ? "auto-reset" : index === 5 ? "reset" : "silence",
    sensitivity: index % 3 === 0 ? "high" : index % 3 === 1 ? "medium" : "low",
    nightMode: index % 2 === 0 ? "day" : "night",
    location: index % 2 === 0 ? "طبقه ۱ / راهروی مرکزی" : "طبقه ۲ / اتاق کنترل",
  }));
}

function setLoopAddError(message) {
  state.loopAddError = message;
  const error = document.querySelector(".loop-add-error");
  if (error) error.textContent = message;
}

function closeLoopAddressConflict() {
  document.querySelector(".loop-conflict-modal")?.remove();
  state.loopAddressConflict = null;
}

function showLoopAddressConflictModal(card, existingDevice, address, typeKey) {
  closeLoopAddressConflict();
  state.loopAddressConflict = { cardId: card.id, existingDeviceId: existingDevice.id, address, typeKey };
  const english = state.language === "en";
  const type = loopDeviceTypes.find((item) => item.key === existingDevice.type) || loopDeviceTypes[0];
  const deviceName = english ? type.en : type.fa;
  const modal = document.createElement("div");
  modal.className = "loop-conflict-modal";
  modal.setAttribute("role", "presentation");
  modal.innerHTML = `<div class="loop-conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="loop-conflict-title"><div class="loop-conflict-icon">!</div><div class="loop-conflict-content"><h3 id="loop-conflict-title">${english ? "Device address is already occupied" : "این آدرس قبلاً استفاده شده است"}</h3><p>${english ? `${deviceName} is already assigned to address ${address}. Would you like to change the address or overwrite the existing device?` : `دیوایس «${deviceName}» در آدرس ${faDigits(address)} قرار دارد. آیا آدرس را تغییر می‌دهید یا دیوایس قبلی را جایگزین می‌کنید؟`}</p></div><div class="loop-conflict-actions"><button type="button" class="btn-secondary" data-loop-conflict-change>${english ? "Change address" : "تغییر آدرس"}</button><button type="button" class="btn-primary" data-loop-conflict-overwrite>${english ? "Overwrite" : "جایگزینی"}</button></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector("[data-loop-conflict-change]")?.addEventListener("click", () => {
    closeLoopAddressConflict();
    const input = document.querySelector("[data-loop-address-input]");
    if (input) {
      input.value = "";
      input.focus();
    }
  });
  modal.querySelector("[data-loop-conflict-overwrite]")?.addEventListener("click", () => {
    const conflict = state.loopAddressConflict;
    const targetCard = state.loopCards.find((item) => item.id === conflict?.cardId);
    const target = targetCard?.devices.find((item) => item.id === conflict?.existingDeviceId);
    if (!targetCard || !target) {
      closeLoopAddressConflict();
      return;
    }
    const replacement = makeLoopDevice(targetCard.id, conflict.address, conflict.typeKey, { id: target.id, location: target.location });
    Object.assign(target, replacement);
    state.selectedLoopCardId = targetCard.id;
    state.selectedLoopDeviceId = target.id;
    state.loopDeviceFilter = "all";
    state.loopOnlyPresent = false;
    state.loopOnlyActive = false;
    state.loopAddError = "";
    closeLoopAddressConflict();
    redrawLoopCardSetting();
    showToast(english ? "The existing device was overwritten." : "دیوایس قبلی با موفقیت جایگزین شد.");
  });
}

function bindLoopCardEvents(options = {}) {
  const root = document.querySelector(".loop-card-setting");
  if (!root) return;
  const connected = true;
  const card = selectedLoopCard();
  root.querySelectorAll("[data-loop-card-select]").forEach((button) => button.addEventListener("click", () => {
    if (!connected) return;
    state.selectedLoopCardId = button.dataset.loopCardSelect;
    state.selectedLoopDeviceId = null;
    state.loopDeviceFilter = "all";
    state.loopOnlyPresent = false;
    state.loopOnlyActive = false;
    state.loopAddError = "";
    redrawLoopCardSetting();
  }));
  root.querySelectorAll("[data-loop-device-select]").forEach((input) => {
    input.addEventListener("click", () => {
      const pageScrollLeft = window.scrollX;
      const pageScrollTop = window.scrollY;
      requestAnimationFrame(() => window.scrollTo(pageScrollLeft, pageScrollTop));
    });
    input.addEventListener("change", () => {
      if (!connected) return;
      state.selectedLoopDeviceId = input.dataset.loopDeviceSelect;
      root.querySelectorAll(".loop-device-row").forEach((row) => row.classList.toggle("selected", row.querySelector("[data-loop-device-select]")?.checked));
    });
  });
  root.querySelectorAll(".loop-row-selector").forEach((selector) => selector.addEventListener("mousedown", (event) => {
    if (!connected) return;
    const input = selector.querySelector("[data-loop-device-select]");
    if (!input) return;
    event.preventDefault();
    input.checked = true;
    input.focus({ preventScroll: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }));
  const updateDeviceField = (control) => {
    const device = card?.devices.find((item) => item.id === control.dataset.loopDeviceId);
    if (!device) return;
    device[control.dataset.loopDeviceField] = control.value;
    if (control.dataset.loopDeviceField === "enabled") device.enabled = control.value === "enabled";
    if (control.dataset.loopDeviceField === "type") {
      const type = loopDeviceTypes.find((item) => item.key === device.type);
      if (type) {
        device.category = type.category;
        const categoryControl = root.querySelector(`[data-loop-device-field="category"][data-loop-device-id="${device.id}"]`);
        if (categoryControl) categoryControl.value = type.category;
      }
    }
  };
  root.querySelectorAll("[data-loop-device-field]").forEach((control) => {
    control.addEventListener("change", () => {
      if (!connected) return;
      updateDeviceField(control);
      const fieldName = control.dataset.loopDeviceField;
      if (fieldName !== "enabled" && fieldName !== "type") return;
      const updatedDevice = card?.devices.find((device) => device.id === control.dataset.loopDeviceId);
      if (updatedDevice && !loopDeviceMatchesActiveFilters(updatedDevice)) state.selectedLoopDeviceId = null;
      if (loopDeviceFiltersUseCompactList()) redrawLoopCardSetting();
    });
    if (control.tagName === "INPUT") control.addEventListener("input", () => { if (connected) updateDeviceField(control); });
  });
  root.querySelector("[data-loop-address-input]")?.addEventListener("input", () => { if (state.loopAddError) setLoopAddError(""); });
  root.querySelectorAll("[data-loop-empty-address]").forEach((button) => button.addEventListener("click", () => {
    if (!connected) return;
    const input = root.querySelector("[data-loop-address-input]");
    if (!input) return;
    input.value = button.dataset.loopEmptyAddress;
    setLoopAddError("");
    input.focus({ preventScroll: true });
  }));
  const clearSelectedDeviceIfHidden = () => {
    const selected = card?.devices.find((device) => device.id === state.selectedLoopDeviceId);
    if (selected && !loopDeviceMatchesActiveFilters(selected)) state.selectedLoopDeviceId = null;
  };
  root.querySelector("[data-loop-filter-select]")?.addEventListener("change", (event) => {
    if (!connected) return;
    state.loopDeviceFilter = event.target.value;
    clearSelectedDeviceIfHidden();
    redrawLoopCardSetting();
  });
  root.querySelectorAll("[data-loop-filter-toggle]").forEach((input) => input.addEventListener("change", () => {
    if (!connected) return;
    if (input.dataset.loopFilterToggle === "present") state.loopOnlyPresent = input.checked;
    if (input.dataset.loopFilterToggle === "active") state.loopOnlyActive = input.checked;
    clearSelectedDeviceIfHidden();
    redrawLoopCardSetting();
  }));
  root.querySelector("[data-loop-filter-all]")?.addEventListener("click", () => {
    if (!connected) return;
    state.loopDeviceFilter = "all";
    state.loopOnlyPresent = false;
    state.loopOnlyActive = false;
    redrawLoopCardSetting();
  });
  root.querySelector("[data-loop-read]")?.addEventListener("click", () => {
    if (!requireCurrentPanelConnection() || !card) return;
    readLoopCardDevices(card);
    state.loopDeviceFilter = "all";
    state.loopOnlyPresent = false;
    state.loopOnlyActive = false;
    state.selectedLoopDeviceId = card.devices[0]?.id || null;
    state.loopAddError = "";
    redrawLoopCardSetting();
    showToast(state.language === "en" ? "Devices were read from the loop card." : "دیوایس‌های کارت لوپ شناسایی شدند.");
  });
  root.querySelector("[data-loop-add]")?.addEventListener("click", () => {
    if (!connected || !card) return;
    const input = root.querySelector("[data-loop-address-input]");
    const rawAddress = input?.value.trim() || "";
    const occupied = new Set(card.devices.map((device) => Number(device.number)));
    let address;
    if (!rawAddress) address = Array.from({ length: 254 }, (_, index) => index + 1).find((candidate) => !occupied.has(candidate));
    else if (!/^\d+$/.test(rawAddress)) {
      setLoopAddError(state.language === "en" ? "Device address must be a whole number from 1 to 254." : "آدرس دیوایس باید یک عدد صحیح بین ۱ تا ۲۵۴ باشد.");
      return;
    } else address = Number(rawAddress);
    if (!rawAddress && !address) {
      setLoopAddError(state.language === "en" ? "All 254 device addresses are already occupied." : "هر ۲۵۴ آدرس دیوایس قبلاً استفاده شده‌اند.");
      return;
    }
    if (!address || address < 1 || address > 254) {
      setLoopAddError(state.language === "en" ? "Device address must be between 1 and 254." : "آدرس دیوایس باید بین ۱ تا ۲۵۴ باشد.");
      return;
    }
    const typeKey = root.querySelector("[data-loop-new-type]")?.value || loopDeviceTypes[0].key;
    const existingDevice = card.devices.find((device) => Number(device.number) === address);
    if (existingDevice) {
      showLoopAddressConflictModal(card, existingDevice, address, typeKey);
      return;
    }
    const previousSelectedDevice = card.devices.find((item) => item.id === state.selectedLoopDeviceId);
    const previousAddress = previousSelectedDevice ? Number(previousSelectedDevice.number) : null;
    const device = makeLoopDevice(card.id, address, typeKey, { location: "آدرس جدید دیوایس" });
    card.devices.push(device);
    state.loopDeviceFilter = "all";
    state.selectedLoopDeviceId = device.id;
    state.loopAddError = "";
    redrawLoopCardSetting({ previousAddressOverride: previousAddress });
    showToast(state.language === "en" ? "New device added." : "دیوایس جدید اضافه شد.");
  });
  root.querySelector("[data-loop-delete]")?.addEventListener("click", () => {
    if (!connected || !card || !state.selectedLoopDeviceId) return;
    const index = card.devices.findIndex((device) => device.id === state.selectedLoopDeviceId);
    if (index < 0) return;
    card.devices.splice(index, 1);
    state.selectedLoopDeviceId = card.devices[index]?.id || card.devices[index - 1]?.id || null;
    redrawLoopCardSetting();
  });
  root.querySelector("[data-loop-delete-all]")?.addEventListener("click", () => {
    if (!connected || !card) return;
    const message = state.language === "en" ? "Delete all devices from this loop card?" : "همه دیوایس‌های این کارت لوپ حذف شوند؟";
    if (!window.confirm(message)) return;
    card.devices = [];
    state.selectedLoopDeviceId = null;
    redrawLoopCardSetting();
    showToast(state.language === "en" ? "All loop card devices were deleted." : "تمام دیوایس‌های کارت لوپ حذف شدند.", "info");
  });
  root.querySelector("[data-loop-save]")?.addEventListener("click", () => {
    if (connected) showToast(state.language === "en" ? "Loop card changes were saved." : "تغییرات کارت لوپ ذخیره شد.");
  });
  root.querySelector("[data-loop-print]")?.addEventListener("click", () => { if (connected) window.print(); });
  if (Number.isFinite(options.restoreScrollTop)) {
    const scroller = root.querySelector(".loop-device-scroller");
    if (scroller) scroller.scrollTop = options.restoreScrollTop;
  } else {
    scrollSelectedLoopDevice({ previousAddress: options.previousAddress });
  }
}

function groupDeviceKey(loopId, deviceId) { return `${loopId}:${deviceId}`; }
function findGroupDevice(ref) {
  const card = state.loopCards.find((item) => item.id === ref?.loopId);
  return { card, device: card?.devices.find((item) => item.id === ref?.deviceId) };
}
function groupDeviceLabel(ref, english) {
  const { device } = findGroupDevice(ref);
  if (!device) return english ? "Unknown device" : "دیوایس ناشناخته";
  const type = loopDeviceTypes.find((item) => item.key === device.type) || loopDeviceTypes[0];
  return `${english ? type.en : type.fa} · ${faDigits(device.number)}`;
}
function groupNumberOptions(selected, max = 64, configured = null) {
  const marked = configured ?? (max === 96 ? [...configuredIoGroupNumbers("input"), ...configuredIoGroupNumbers("output")] : []);
  const configuredSet = new Set(marked.map(Number));
  return Array.from({ length: max }, (_, index) => index + 1).map((number) => `<option value="${number}" ${Number(selected) === number ? "selected" : ""}>${faDigits(number)}${configuredSet.has(number) ? " ✓" : ""}</option>`).join("");
}
function configuredIoGroupNumbers(kind) {
  const groups = kind === "input" ? state.ioInputGroups : state.ioOutputGroups;
  const fromMembers = Object.entries(groups || {}).filter(([, refs]) => refs?.length).map(([number]) => Number(number));
  const fromRelations = Object.values(state.ioSavedRelations || {}).map((relation) => Number(kind === "input" ? relation.inputGroupNumber : relation.outputGroupNumber)).filter(Number.isFinite);
  return [...new Set([...fromMembers, ...fromRelations])];
}
function describeIoRelation(inputGroup, outputGroup, relation, conditionLabel, english) {
  const count = Math.max(1, Number(relation?.activeCount) || 1);
  const delay = Math.max(0, Number(relation?.delay) || 0);
  if (english) {
    return `When at least ${count} device${count === 1 ? "" : "s"} in Input Group ${inputGroup} detect ${conditionLabel.toLowerCase()}, Output Group ${outputGroup}${delay ? ` activates after ${delay} seconds` : " activates"}.`;
  }
  return `با تشخیص ${conditionLabel} توسط حداقل ${faDigits(count)} دیوایس از گروه ورودی ${faDigits(inputGroup)}، گروه خروجی ${faDigits(outputGroup)}${delay ? ` پس از گذشت ${faDigits(delay)} ثانیه` : ""} فعال می‌شود.`;
}
function groupLoopOptions(selected) {
  return state.loopCards.map((card) => `<option value="${card.id}" ${card.id === selected ? "selected" : ""}>${card.label}</option>`).join("");
}
function isOutputGroupDevice(device) { return device?.type === "sounder" || device?.type === "io" || device?.category === "relay"; }
function getIoGroup() {
  const key = `${state.ioInputGroupNumber}-${state.ioOutputGroupNumber}`;
  if (!state.ioRelations[key]) state.ioRelations[key] = { activeCount: 1, outputActiveFor: "fire", delay: 0, status: true };
  return state.ioRelations[key];
}
function renderGroupListItem(ref, english, selected = false) {
  const { device } = findGroupDevice(ref);
  if (!device) return "";
  const type = loopDeviceTypes.find((item) => item.key === device.type) || loopDeviceTypes[0];
  const loopNumber = Math.max(1, state.loopCards.findIndex((item) => item.id === ref.loopId) + 1);
  return `<button type="button" class="group-device-entry${selected ? " selected" : ""}" data-group-selected-key="${groupDeviceKey(ref.loopId, ref.deviceId)}"${panelRequiredAttr(!state.connectedPanelId)}><span class="group-device-meta"><small>${english ? "Loop" : "لوپ"}: ${faDigits(loopNumber)}</small><small>${english ? "Address" : "آدرس"}: ${faDigits(device.number)}</small></span><span class="group-device-icon">${deviceIconMarkup(device.type)}</span><span class="group-device-copy"><b>${english ? type.en : type.fa}</b><small>${escapeHtml(loopDeviceLocationLabel(device))}</small></span></button>`;
}

function renderGroupSettingZone() {
  const english = state.language === "en";
  const disabled = false;
  const disabledAttr = panelRequiredAttr(disabled);
  const title = english ? "Group" : "گروه‌بندی";
  const description = english ? "Create and manage zone, input, and output device groups." : "گروه‌بندی زون و دیوایس‌های ورودی و خروجی را مدیریت کنید.";
  const selectField = (label, attr, options) => `<label class="group-field"><span>${label}</span><select ${attr}${disabledAttr}>${options}</select></label>`;
  const tabs = `<div class="group-tabs" role="tablist"><button type="button" class="group-tab${state.groupTab === "zone" ? " active" : ""}" data-group-tab="zone" role="tab" aria-selected="${state.groupTab === "zone"}">${english ? "Zone Group" : "گروهبندی زون"}</button><button type="button" class="group-tab${state.groupTab === "io" ? " active" : ""}" data-group-tab="io" role="tab" aria-selected="${state.groupTab === "io"}">${english ? "Input & Output Group" : "گروهبندی ورودی و خروجی"}</button></div>`;
  const toolbar = (kind) => `<div class="group-toolbar"><button type="button" class="btn-secondary compact" data-group-read-all="${kind}"${disabledAttr}>${icons.refresh}${english ? "Read All Groups" : "خواندن همه گروه‌ها"}</button><span class="group-connection-note ${disabled ? "offline" : "online"}">${disabled ? (english ? "Connect a panel to manage groups" : "برای مدیریت گروه‌ها پنل را متصل کنید") : (english ? "Panel connection active" : "اتصال پنل فعال است")}</span></div>`;
  const actions = (kind, includePrint = false) => `<div class="group-actions"><button type="button" class="btn-danger compact" data-group-delete="${kind}"${disabledAttr}>${english ? "Delete" : "حذف"}</button><button type="button" class="btn-danger compact" data-group-delete-all="${kind}"${disabledAttr}>${english ? "Delete All" : "حذف همه"}</button><span></span>${includePrint ? `<button type="button" class="btn-secondary compact" data-group-print${disabledAttr}>${icons.report}${english ? "Print" : "چاپ"}</button>` : ""}<button type="button" class="btn-secondary compact" data-group-save="${kind}"${disabledAttr}>${icons.check}${english ? "Save" : "ذخیره"}</button><button type="button" class="btn-primary compact" data-group-update="${kind}"${disabledAttr}>${icons.refresh}${english ? "Update All" : "به‌روزرسانی همه"}</button></div>`;

  if (state.groupTab === "zone") {
    const group = state.zoneGroups[state.zoneGroupNumber] || [];
    const selectedLoop = state.loopCards.find((card) => card.id === state.zoneLoopCardId) || state.loopCards[0];
    const groupedKeys = new Set(group.map((ref) => groupDeviceKey(ref.loopId, ref.deviceId)));
    const inputDevices = (selectedLoop?.devices || []).filter((device) => !groupedKeys.has(groupDeviceKey(selectedLoop.id, device.id)));
    const inputList = inputDevices.length ? inputDevices.map((device) => `<button type="button" class="group-device-entry" data-zone-input-device="${device.id}"${disabledAttr}><span class="group-device-address">${faDigits(device.number)}</span><span><b>${deviceIconMarkup(device.type)}${groupDeviceLabel({ loopId: selectedLoop.id, deviceId: device.id }, english)}</b><small>${escapeHtml(loopDeviceLocationLabel(device))}</small></span>${icons.chevronLeft}</button>`).join("") : `<div class="group-device-empty">${english ? "No available input devices on this loop." : "دیوایس ورودی قابل انتخابی در این لوپ وجود ندارد."}</div>`;
    const groupedList = group.length ? group.map((ref) => renderGroupListItem(ref, english, state.groupSelectedDeviceKey === groupDeviceKey(ref.loopId, ref.deviceId))).join("") : `<div class="group-device-empty">${english ? "Click a device to add it to this group." : "برای افزودن دیوایس به گروه روی آن کلیک کنید."}</div>`;
    return `<article class="sub-card group-setting"><div class="sub-card-head"><div><h3>${title}</h3><p>${description}</p></div><span class="status-chip ${disabled ? "amber" : "green"}">${disabled ? (english ? "Not connected" : "متصل نیست") : (english ? "Ready" : "آماده")}</span></div>${tabs}${toolbar("zone")}<div class="group-form-grid">${selectField(english ? "Group Number" : "شماره گروه", "data-zone-group-number", groupNumberOptions(state.zoneGroupNumber))}${selectField(english ? "Loop Number" : "شماره لوپ کارت", "data-zone-loop", groupLoopOptions(state.zoneLoopCardId))}<label class="group-switch-field"><span><b>${english ? "Pre Alarm" : "پیش هشدار"}</b><small>${english ? "Enable pre-alarm for this zone group." : "پیش‌هشدار این گروه زون را فعال کنید."}</small></span><span class="group-switch-wrap"><em>${state.zonePreAlarm[state.zoneGroupNumber] ? (english ? "Enable" : "فعال") : (english ? "Disable" : "غیرفعال")}</em><input type="checkbox" data-zone-prealarm ${state.zonePreAlarm[state.zoneGroupNumber] ? "checked" : ""}${disabledAttr}><i class="network-toggle"></i></span></label></div><div class="group-device-columns zone-columns"><section class="group-device-panel"><div class="group-panel-head"><div><h4>${english ? "Input Devices" : "دیوایس‌های ورودی"}</h4><small>${english ? "Click a device to add it to the selected group." : "برای افزودن به گروه، دیوایس را انتخاب کنید."}</small></div><b>${faDigits(inputDevices.length)}</b></div><div class="group-device-list">${inputList}</div></section><section class="group-device-panel grouped-panel"><div class="group-panel-head"><div><h4>${english ? "Zone Grouped Devices List" : "لیست دیوایس‌های گروه‌بندی‌شده"}</h4><small>${english ? `Group ${state.zoneGroupNumber}` : `گروه ${faDigits(state.zoneGroupNumber)}`}</small></div><b>${faDigits(group.length)}</b></div><div class="group-device-list">${groupedList}</div></section></div>${actions("zone")}${renderSettingActions()}</article>`;
  }

  const group = getIoGroup();
  const selectedLoop = state.loopCards.find((card) => card.id === state.ioLoopCardId) || state.loopCards[0];
  const inputRefs = group.inputs || [];
  const outputRefs = group.outputs || [];
  const usedInputs = new Set(inputRefs.map((ref) => groupDeviceKey(ref.loopId, ref.deviceId)));
  const usedOutputs = new Set(outputRefs.map((ref) => groupDeviceKey(ref.loopId, ref.deviceId)));
  const availableInputs = (selectedLoop?.devices || []).filter((device) => !isOutputGroupDevice(device) && !usedInputs.has(groupDeviceKey(selectedLoop.id, device.id)));
  const availableOutputs = (selectedLoop?.devices || []).filter((device) => isOutputGroupDevice(device) && !usedOutputs.has(groupDeviceKey(selectedLoop.id, device.id)));
  const availableList = (items, kind) => items.length ? items.map((device) => `<button type="button" class="group-device-entry" data-io-add-device="${device.id}" data-io-kind="${kind}"${disabledAttr}><span class="group-device-address">${faDigits(device.number)}</span><span><b>${deviceIconMarkup(device.type)}${groupDeviceLabel({ loopId: selectedLoop.id, deviceId: device.id }, english)}</b><small>${escapeHtml(loopDeviceLocationLabel(device))}</small></span>${icons.chevronLeft}</button>`).join("") : `<div class="group-device-empty">${english ? "No devices available." : "دیوایسی برای انتخاب وجود ندارد."}</div>`;
  const grouped = [...inputRefs.map((ref) => ({ ref, kind: "input" })), ...outputRefs.map((ref) => ({ ref, kind: "output" }))];
  const groupedList = grouped.length ? grouped.map(({ ref }) => renderGroupListItem(ref, english, state.groupSelectedDeviceKey === groupDeviceKey(ref.loopId, ref.deviceId))).join("") : `<div class="group-device-empty">${english ? "Add devices from the lists." : "دیوایس‌ها را از لیست‌های ورودی و خروجی اضافه کنید."}</div>`;
  const activeMax = inputRefs.length;
  const outputOptions = [["fire", english ? "Fire" : "حریق"], ["supervisory", english ? "Supervisory" : "نظارتی"], ["fault", english ? "Fault" : "خطا"], ["reset", english ? "Reset" : "ریست"], ["pre-alarm", english ? "Pre Alarm" : "پیش هشدار"]];
  return `<article class="sub-card group-setting"><div class="sub-card-head"><div><h3>${title}</h3><p>${description}</p></div><span class="status-chip ${disabled ? "amber" : "green"}">${disabled ? (english ? "Not connected" : "متصل نیست") : (english ? "Ready" : "آماده")}</span></div>${tabs}${toolbar("io")}<div class="group-form-grid io-group-selects">${selectField(english ? "Input Group Number" : "شماره گروه ورودی", "data-io-input-group", groupNumberOptions(state.ioInputGroupNumber))}${selectField(english ? "Output Group Number" : "شماره گروه خروجی", "data-io-output-group", groupNumberOptions(state.ioOutputGroupNumber))}${selectField(english ? "Loop Number" : "شماره لوپ کارت", "data-io-loop", groupLoopOptions(state.ioLoopCardId))}</div><div class="group-device-columns io-columns"><section class="group-device-panel"><div class="group-panel-head"><div><h4>${english ? "Input Devices" : "دیوایس‌های ورودی"}</h4><small>${english ? "Click or move all available inputs." : "انتخاب تکی یا گروهی دیوایس‌های ورودی"}</small></div><b>${faDigits(availableInputs.length)}</b></div><div class="group-device-list">${availableList(availableInputs, "input")}</div><button type="button" class="group-transfer-button" data-io-add-all="input"${disabledAttr}>&lt;&lt; ${english ? "Add all inputs" : "افزودن همه ورودی‌ها"}</button></section><section class="group-device-panel"><div class="group-panel-head"><div><h4>${english ? "Output Devices" : "دیوایس‌های خروجی"}</h4><small>${english ? "Click or move all available outputs." : "انتخاب تکی یا گروهی دیوایس‌های خروجی"}</small></div><b>${faDigits(availableOutputs.length)}</b></div><div class="group-device-list">${availableList(availableOutputs, "output")}</div><button type="button" class="group-transfer-button" data-io-add-all="output"${disabledAttr}>&lt;&lt; ${english ? "Add all outputs" : "افزودن همه خروجی‌ها"}</button></section><section class="group-device-panel grouped-panel"><div class="group-panel-head"><div><h4>${english ? "Input / Output Grouping" : "گروهبندی ورودی / خروجی"}</h4><small>${english ? `${inputRefs.length} inputs · ${outputRefs.length} outputs` : `${faDigits(inputRefs.length)} ورودی · ${faDigits(outputRefs.length)} خروجی`}</small></div><b>${faDigits(grouped.length)}</b></div><div class="group-device-list">${groupedList}</div></section></div><div class="group-form-grid group-parameters"><label class="group-field"><span>${english ? "Active Count" : "تعداد فعال"}</span><input type="number" min="${activeMax ? 1 : 0}" max="${Math.max(activeMax, 0)}" value="${Math.min(group.activeCount || (activeMax ? 1 : 0), activeMax)}" data-io-active-count${disabledAttr}></label><label class="group-field"><span>${english ? "Output Active for" : "فعال‌سازی خروجی برای"}</span><select data-io-output-active${disabledAttr}>${outputOptions.map(([value, label]) => `<option value="${value}" ${group.outputActiveFor === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label class="group-field"><span>${english ? "Delay (0–999 Sec)" : "تاخیر (۰ تا ۹۹۹ ثانیه)"}</span><input type="number" min="0" max="999" value="${group.delay ?? 0}" data-io-delay${disabledAttr}></label><label class="group-switch-field"><span><b>${english ? "Status" : "وضعیت"}</b><small>${english ? "Enable or disable this grouping." : "این گروه‌بندی را فعال یا غیرفعال کنید."}</small></span><span class="group-switch-wrap"><em>${group.status ? (english ? "Enable" : "فعال") : (english ? "Disable" : "غیرفعال")}</em><input type="checkbox" data-io-status ${group.status ? "checked" : ""}${disabledAttr}><i class="network-toggle"></i></span></label></div><div class="group-preview-row"><button type="button" class="btn-secondary compact" data-io-preview${disabledAttr}>${icons.dashboard}${english ? "Pre View" : "پیش نمایش"}</button>${state.groupPreviewOpen ? `<div class="group-preview"><b>${english ? "Input & Output Group Preview" : "پیش‌نمایش گروه ورودی و خروجی"}</b><span>${grouped.length ? grouped.map(({ ref }) => groupDeviceLabel(ref, english)).join(" · ") : (english ? "No devices selected" : "دیوایسی انتخاب نشده است")}</span></div>` : ""}</div>${actions("io", true)}</article>`;
}

function renderInputOutputGroupSetting() {
  const english = state.language === "en";
  const disabled = false;
  const disabledAttr = panelRequiredAttr(disabled);
  const relation = getIoGroup();
  const inputRefs = state.ioInputGroups[state.ioInputGroupNumber] || [];
  const outputRefs = state.ioOutputGroups[state.ioOutputGroupNumber] || [];
  const selectedLoop = state.loopCards.find((card) => card.id === state.ioLoopCardId) || state.loopCards[0];
  const inputKeys = new Set(inputRefs.map((ref) => groupDeviceKey(ref.loopId, ref.deviceId)));
  const outputKeys = new Set(outputRefs.map((ref) => groupDeviceKey(ref.loopId, ref.deviceId)));
  const availableInputs = (selectedLoop?.devices || []).filter((device) => !isOutputGroupDevice(device) && !inputKeys.has(groupDeviceKey(selectedLoop.id, device.id)));
  const availableOutputs = (selectedLoop?.devices || []).filter((device) => isOutputGroupDevice(device) && !outputKeys.has(groupDeviceKey(selectedLoop.id, device.id)));
  const selectedLoopLabel = selectedLoop?.label || (english ? "Selected loop card" : "کارت لوپ انتخاب‌شده");
  const grouped = [...inputRefs.map((ref) => ({ ref, kind: "input" })), ...outputRefs.map((ref) => ({ ref, kind: "output" }))];
  const selectField = (label, attr, options) => `<label class="group-field"><span>${label}</span><select ${attr}${disabledAttr}>${options}</select></label>`;
  const outputOptions = [["fire", english ? "Fire" : "حریق"], ["supervisory", english ? "Supervisory" : "نظارتی"], ["fault", english ? "Fault" : "خطا"], ["reset", english ? "Reset" : "ریست"], ["pre-alarm", english ? "Pre Alarm" : "پیش هشدار"]];
  const conditionLabel = outputOptions.find(([value]) => value === relation.outputActiveFor)?.[1] || outputOptions[0][1];
  const delay = Number(relation.delay) || 0;
  const relationSummary = describeIoRelation(state.ioInputGroupNumber, state.ioOutputGroupNumber, relation, conditionLabel, english);
  const loopNumber = Math.max(1, state.loopCards.findIndex((item) => item.id === selectedLoop?.id) + 1);
  const list = (devices) => devices.length ? devices.map((device) => `<button type="button" class="group-device-entry" data-io-add-device="${device.id}" data-io-loop-id="${selectedLoop.id}" data-io-kind="${isOutputGroupDevice(device) ? "output" : "input"}"${disabledAttr}><span class="group-device-meta"><small>${english ? "Loop" : "لوپ"}: ${faDigits(loopNumber)}</small><small>${english ? "Address" : "آدرس"}: ${faDigits(device.number)}</small></span><span class="group-device-icon">${deviceIconMarkup(device.type)}</span><span class="group-device-copy"><b>${english ? (loopDeviceTypes.find((item) => item.key === device.type)?.en || "Device") : (loopDeviceTypes.find((item) => item.key === device.type)?.fa || "دیوایس")}</b><small>${escapeHtml(loopDeviceLocationLabel(device))}</small></span></button>`).join("") : `<div class="group-device-empty">${english ? "No devices available on this loop." : "دیوایسی برای این لوپ وجود ندارد."}</div>`;
  const groupedList = grouped.length ? grouped.map(({ ref, kind }) => `<div class="group-member-row"><span class="group-member-type">${kind === "input" ? (english ? "IN" : "ورودی") : (english ? "OUT" : "خروجی")}</span>${renderGroupListItem(ref, english, state.groupSelectedDeviceKey === groupDeviceKey(ref.loopId, ref.deviceId))}</div>`).join("") : `<div class="group-device-empty">${english ? "Add devices from the lists above." : "دیوایس‌ها را از لیست‌های بالا اضافه کنید."}</div>`;
  const activeCount = Math.max(1, Math.min(16, Number(relation.activeCount) || 1));
  const activeCountOptions = Array.from({ length: 16 }, (_, index) => index + 1).map((value) => `<option value="${value}" ${activeCount === value ? "selected" : ""}>${faDigits(value)}</option>`).join("");
  const bottomActions = `<div class="group-actions"><span></span><button type="button" class="btn-secondary compact" data-group-print${disabledAttr}>${icons.report}${english ? "Print" : "چاپ"}</button><button type="button" class="btn-secondary compact" data-group-save="io"${disabledAttr}>${icons.check}${english ? "Save" : "ذخیره"}</button><button type="button" class="btn-primary compact" data-group-update="io"${disabledAttr}>${icons.refresh}${english ? "Update All" : "به‌روزرسانی همه"}</button></div>`;
  const tabs = `<div class="group-tabs" role="tablist"><button type="button" class="group-tab" data-group-tab="zone" role="tab">${english ? "Zone Group" : "گروهبندی زون"}</button><button type="button" class="group-tab active" data-group-tab="io" role="tab" aria-selected="true">${english ? "Input & Output Group" : "گروهبندی ورودی و خروجی"}</button></div>`;
  return `<article class="sub-card group-setting io-group-setting"><div class="sub-card-head"><div><h3>${english ? "Input & Output Group" : "گروهبندی ورودی و خروجی"}</h3><p>${english ? "Create input and output groups independently, then connect them with an activation rule." : "گروه‌های ورودی و خروجی را جداگانه بسازید و سپس با یک شرط مشخص به هم مرتبط کنید."}</p></div><span class="status-chip ${disabled ? "amber" : "green"}">${disabled ? (english ? "Not connected" : "متصل نیست") : (english ? "Ready" : "آماده")}</span></div>${tabs}<div class="group-toolbar"><button type="button" class="btn-secondary compact" data-group-read-all="io"${disabledAttr}>${icons.refresh}${english ? "Read All Groups" : "خواندن همه گروه‌ها"}</button><span class="group-connection-note ${disabled ? "offline" : "online"}">${disabled ? (english ? "Connect a panel to manage groups" : "برای مدیریت گروه‌ها پنل را متصل کنید") : (english ? "Panel connection active" : "اتصال پنل فعال است")}</span></div><section class="group-relation-card${state.groupRelationCollapsed ? " collapsed" : ""}"><button type="button" class="group-relation-toggle" data-group-relation-toggle aria-expanded="${!state.groupRelationCollapsed}"><span><h4>${english ? "Group Relation" : "ارتباط گروه‌ها"}</h4><small>${english ? "Select the input and output group numbers for this rule." : "شماره گروه ورودی و خروجی این ارتباط را انتخاب کنید."}</small></span><span class="group-relation-badge">${icons.chevronLeft}</span></button><div class="group-relation-body"><div class="group-form-grid io-group-selects">${selectField(english ? "Input Group Number (1–96)" : "شماره گروه ورودی (۱ تا ۹۶)", "data-io-input-group", groupNumberOptions(state.ioInputGroupNumber, 96))}${selectField(english ? "Output Group Number (1–96)" : "شماره گروه خروجی (۱ تا ۹۶)", "data-io-output-group", groupNumberOptions(state.ioOutputGroupNumber, 96))}</div><div class="group-relation-summary">${icons.check}<span>${relationSummary}</span></div></div></section><section class="group-loop-selector"><div><h4>${english ? "Loop Card Devices" : "دیوایس‌های کارت لوپ"} <em class="group-loop-label">${selectedLoopLabel}</em></h4><small>${english ? "Choose a loop card to show its input and output devices below." : "یک کارت لوپ را انتخاب کنید تا دیوایس‌های ورودی و خروجی آن در ادامه نمایش داده شوند."}</small></div>${selectField(english ? "Loop Number" : "شماره لوپ کارت", "data-io-loop", groupLoopOptions(state.ioLoopCardId))}</section><div class="group-device-columns io-source-columns"><section class="group-device-panel"><div class="group-panel-head"><div><h4>${english ? "Input Group Devices" : "دیوایس‌های گروه ورودی"} <em class="group-loop-label">${selectedLoopLabel}</em></h4><small>${english ? `Available for Input Group ${state.ioInputGroupNumber}` : `قابل افزودن به گروه ورودی ${faDigits(state.ioInputGroupNumber)}`}</small></div><b>${faDigits(availableInputs.length)}</b></div><div class="group-device-list">${list(availableInputs)}</div><button type="button" class="group-transfer-button" data-io-add-all="input"${disabledAttr}>&lt;&lt; ${english ? "Add all to input group" : "افزودن همه به گروه ورودی"}</button></section><section class="group-device-panel"><div class="group-panel-head"><div><h4>${english ? "Output Group Devices" : "دیوایس‌های گروه خروجی"} <em class="group-loop-label">${selectedLoopLabel}</em></h4><small>${english ? `Available for Output Group ${state.ioOutputGroupNumber}` : `قابل افزودن به گروه خروجی ${faDigits(state.ioOutputGroupNumber)}`}</small></div><b>${faDigits(availableOutputs.length)}</b></div><div class="group-device-list">${list(availableOutputs)}</div><button type="button" class="group-transfer-button" data-io-add-all="output"${disabledAttr}>&lt;&lt; ${english ? "Add all to output group" : "افزودن همه به گروه خروجی"}</button></section></div><div class="group-config-layout"><section class="group-device-panel grouped-panel"><div class="group-panel-head"><div><h4>${english ? "Input / Output Grouping" : "گروهبندی ورودی و خروجی"}</h4><small>${english ? `${inputRefs.length} inputs · ${outputRefs.length} outputs` : `${faDigits(inputRefs.length)} ورودی · ${faDigits(outputRefs.length)} خروجی`}</small></div><b>${faDigits(grouped.length)}</b></div><div class="group-device-list">${groupedList}</div><div class="group-member-actions"><button type="button" class="btn-danger compact" data-group-delete="io"${disabledAttr}>${english ? "Delete" : "حذف"}</button><button type="button" class="btn-danger compact" data-group-delete-all="io"${disabledAttr}>${english ? "Delete All" : "حذف همه"}</button></div></section><aside class="group-parameters-rail"><label class="group-switch-field"><span><b>${english ? "Status" : "وضعیت"}</b><small>${english ? "Enable or disable this relation." : "این ارتباط را فعال یا غیرفعال کنید."}</small></span><span class="group-switch-wrap"><em>${relation.status ? (english ? "Enable" : "فعال") : (english ? "Disable" : "غیرفعال")}</em><input type="checkbox" data-io-status ${relation.status ? "checked" : ""}${disabledAttr}><i class="network-toggle"></i></span></label><label class="group-field"><span>${english ? "Active Count" : "تعداد فعال"}</span><select data-io-active-count${disabledAttr}>${activeCountOptions}</select></label><label class="group-field"><span>${english ? "Output Active for" : "فعال‌سازی خروجی برای"}</span><select data-io-output-active${disabledAttr}>${outputOptions.map(([value, label]) => `<option value="${value}" ${relation.outputActiveFor === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label class="group-field"><span>${english ? "Delay (0–999 Sec)" : "تاخیر (۰ تا ۹۹۹ ثانیه)"}</span><input type="number" min="0" max="999" value="${delay}" data-io-delay${disabledAttr}></label></aside></div>${bottomActions}${renderSettingActions()}</article>`;
}

function renderGroupSetting() {
  return state.groupTab === "io" ? renderInputOutputGroupSetting() : renderGroupSettingZone();
}

function redrawGroupSetting() {
  const root = document.querySelector(".group-setting");
  if (!root) return;
  root.outerHTML = renderGroupSetting();
  bindGroupSettingEvents();
}

function closeGroupConnectionWarning() {
  document.querySelector(".group-connection-modal")?.remove();
  state.groupConnectionWarningOpen = false;
}

function showPanelConnectionWarning() {
  closeGroupConnectionWarning();
  state.groupConnectionWarningOpen = true;
  const english = state.language === "en";
  const modal = document.createElement("div");
  modal.className = "group-connection-modal";
  modal.setAttribute("role", "presentation");
  modal.innerHTML = `<div class="group-connection-dialog" role="dialog" aria-modal="true" aria-labelledby="group-connection-title"><div class="group-connection-icon">!</div><div><h3 id="group-connection-title">${english ? "Panel connection required" : "اتصال پنل لازم است"}</h3><p>${english ? "Connect the selected panel before reading from it or uploading settings to it." : "برای خواندن از پنل یا آپلود تنظیمات روی آن، ابتدا پنل انتخاب‌شده را متصل کنید."}</p></div><div class="group-connection-actions"><button type="button" class="btn-primary" data-group-warning-close>${english ? "Got it" : "متوجه شدم"}</button></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector("[data-group-warning-close]")?.addEventListener("click", closeGroupConnectionWarning);
  modal.addEventListener("click", (event) => { if (event.target === modal) closeGroupConnectionWarning(); });
}

function isCurrentPanelConnected() {
  return state.connectedPanelId === findPanel()?.id;
}

function requireCurrentPanelConnection() {
  if (isCurrentPanelConnected()) return true;
  showPanelConnectionWarning();
  return false;
}

function scrollSelectedGroupDevice() {
  const key = state.groupSelectedDeviceKey;
  if (!key) return;
  requestAnimationFrame(() => {
    const item = [...document.querySelectorAll(".group-setting [data-group-selected-key]")].find((entry) => entry.dataset.groupSelectedKey === key);
    const scroller = item?.closest(".group-device-list");
    if (!item || !scroller) return;
    const items = [...scroller.querySelectorAll("[data-group-selected-key]")];
    const index = Math.max(0, items.indexOf(item));
    const rowHeight = item.offsetHeight + (parseFloat(getComputedStyle(scroller).rowGap || getComputedStyle(scroller).gap) || 0);
    const targetTop = Math.max(0, (index - 5) * rowHeight);
    scroller.scrollTo({ top: targetTop, behavior: "smooth" });
  });
}

function groupConnectionGuard() {
  return true;
}

function arrangeIoGroupLayout() {
  const root = document.querySelector(".io-group-setting");
  const relationCard = root?.querySelector(".group-relation-card");
  splitIoGroupedPanels();
  const loopSelector = root?.querySelector(".group-loop-selector");
  const configLayout = root?.querySelector(".group-config-layout");
  if (relationCard && loopSelector && configLayout) {
    let relationConfigBox = root.querySelector(":scope > .group-relation-config-box");
    if (!relationConfigBox) {
      relationConfigBox = document.createElement("div");
      relationConfigBox.className = "group-relation-config-box";
      loopSelector.after(relationConfigBox);
    }
    const relationToggle = relationCard.querySelector("[data-group-relation-toggle]");
    if (relationToggle && relationToggle.parentElement === relationCard) relationConfigBox.prepend(relationToggle);
    if (relationCard.parentElement !== relationConfigBox) relationConfigBox.append(relationCard);
    const parametersRail = configLayout.querySelector(":scope > .group-parameters-rail");
    if (parametersRail && parametersRail.parentElement !== relationConfigBox) relationConfigBox.append(parametersRail);
    relationConfigBox.classList.toggle("collapsed", state.groupRelationCollapsed);
    const actions = root.querySelector(":scope > .group-actions");
    if (actions && actions.previousElementSibling !== relationConfigBox) relationConfigBox.after(actions);
  }
  mountSavedIoRelations(root);
}

function mountSavedIoRelations(root) {
  const rail = root?.querySelector(".group-parameters-rail");
  if (!rail) return;
  rail.querySelector(".saved-io-relations")?.remove();
  const host = root.querySelector(".group-config-layout") || rail;
  host.querySelector(":scope > .saved-io-relations")?.remove();
  const english = state.language === "en";
  const entries = Object.entries(state.ioSavedRelations || {});
  const outputOptions = [["fire", english ? "Fire" : "حریق"], ["supervisory", english ? "Supervisory" : "نظارتی"], ["fault", english ? "Fault" : "خطا"], ["reset", english ? "Reset" : "ریست"], ["pre-alarm", english ? "Pre Alarm" : "پیش هشدار"]];
  const content = entries.length ? entries.map(([key, saved]) => {
    const inputGroup = Number(saved.inputGroupNumber || key.split("-")[0]);
    const outputGroup = Number(saved.outputGroupNumber || key.split("-")[1]);
    const condition = outputOptions.find(([value]) => value === saved.outputActiveFor)?.[1] || outputOptions[0][1];
    const summary = describeIoRelation(inputGroup, outputGroup, saved, condition, english);
    return `<button type="button" class="saved-io-relation${key === `${state.ioInputGroupNumber}-${state.ioOutputGroupNumber}` ? " active" : ""}${saved.status ? "" : " inactive"}" data-io-saved-relation="${key}"><span class="saved-io-relation-groups"><b>${english ? `Input ${inputGroup}` : `ورودی ${faDigits(inputGroup)}`}</b><i>&gt;</i><b>${english ? `Output ${outputGroup}` : `خروجی ${faDigits(outputGroup)}`}</b></span><span class="saved-io-relation-summary">${summary}</span></button>`;
  }).join("") : `<div class="saved-io-relation-empty">${english ? "Saved input/output relations will remain visible here." : "ارتباط‌های ذخیره‌شده‌ی ورودی و خروجی در این بخش باقی می‌مانند."}</div>`;
  const section = document.createElement("section");
  section.className = "saved-io-relations";
  section.innerHTML = `<div class="saved-io-relations-head"><div><h4>${english ? "Saved Group Relations" : "ارتباط‌های ذخیره‌شده گروه‌ها"}</h4><small>${english ? "Saved input/output links remain visible here." : "ارتباط‌های ذخیره‌شده ورودی و خروجی همیشه در این بخش قابل مشاهده هستند."}</small></div><b>${faDigits(entries.length)}</b></div><div class="saved-io-relations-list">${content}</div>`;
  host.append(section);
}

function splitIoGroupedPanels() {
  const root = document.querySelector(".io-group-setting");
  const configLayout = root?.querySelector(".group-config-layout");
  const groupedPanel = configLayout?.querySelector(":scope > .grouped-panel");
  if (!configLayout || !groupedPanel) return;
  const english = state.language === "en";
  const inputRefs = state.ioInputGroups[state.ioInputGroupNumber] || [];
  const outputRefs = state.ioOutputGroups[state.ioOutputGroupNumber] || [];
  const renderBox = (kind, refs, groupNumber) => {
    const title = kind === "input" ? (english ? "Input Group Devices" : "دیوایس‌های گروه ورودی") : (english ? "Output Group Devices" : "دیوایس‌های گروه خروجی");
    const description = kind === "input" ? (english ? `Devices assigned to Input Group ${groupNumber}` : `دیوایس‌های اختصاص‌یافته به گروه ورودی ${faDigits(groupNumber)}`) : (english ? `Devices assigned to Output Group ${groupNumber}` : `دیوایس‌های اختصاص‌یافته به گروه خروجی ${faDigits(groupNumber)}`);
    const rows = refs.length ? refs.map((ref) => renderGroupListItem(ref, english, state.groupSelectedDeviceKey === groupDeviceKey(ref.loopId, ref.deviceId))).join("") : `<div class="group-device-empty">${english ? "No devices in this group." : "هنوز دیوایسی در این گروه قرار نگرفته است."}</div>`;
    return `<section class="group-device-panel grouped-panel grouped-${kind}-panel"><div class="group-panel-head"><div><h4>${title}</h4><small>${description}</small></div><b>${faDigits(refs.length)}</b></div><div class="group-device-list">${rows}</div><div class="group-member-actions"><button type="button" class="btn-danger compact" data-group-delete="io-${kind}">${english ? "Delete" : "حذف"}</button><button type="button" class="btn-danger compact" data-group-delete-all="io-${kind}">${english ? "Delete All" : "حذف همه"}</button></div></section>`;
  };
  const wrapper = document.createElement("div");
  wrapper.className = "grouped-panels-wrap";
  wrapper.innerHTML = `${renderBox("input", inputRefs, state.ioInputGroupNumber)}${renderBox("output", outputRefs, state.ioOutputGroupNumber)}`;
  groupedPanel.replaceWith(wrapper);
}

function bindGroupSettingEvents() {
  const root = document.querySelector(".group-setting");
  if (!root) return;
  arrangeIoGroupLayout();
  root.querySelector("[data-group-relation-toggle]")?.addEventListener("click", () => {
    if (!groupConnectionGuard()) return;
    state.groupRelationCollapsed = !state.groupRelationCollapsed;
    redrawGroupSetting();
  });
  root.querySelectorAll("[data-group-tab]").forEach((button) => button.addEventListener("click", () => {
    state.groupTab = button.dataset.groupTab;
    state.groupSelectedDeviceKey = null;
    state.groupPreviewOpen = false;
    redrawGroupSetting();
  }));
  root.querySelector("[data-zone-group-number]")?.addEventListener("change", (event) => { if (groupConnectionGuard()) { state.zoneGroupNumber = Number(event.target.value); state.groupSelectedDeviceKey = null; redrawGroupSetting(); } });
  root.querySelector("[data-zone-loop]")?.addEventListener("change", (event) => { if (groupConnectionGuard()) { state.zoneLoopCardId = event.target.value; state.groupSelectedDeviceKey = null; redrawGroupSetting(); } });
  root.querySelector("[data-zone-prealarm]")?.addEventListener("change", (event) => {
    if (!groupConnectionGuard()) return;
    state.zonePreAlarm[state.zoneGroupNumber] = event.target.checked;
    const status = event.target.closest(".group-switch-wrap")?.querySelector("em");
    if (status) status.textContent = event.target.checked ? (state.language === "en" ? "Enable" : "فعال") : (state.language === "en" ? "Disable" : "غیرفعال");
  });
  root.querySelectorAll("[data-zone-input-device]").forEach((button) => button.addEventListener("click", () => {
    if (!groupConnectionGuard()) return;
    const group = state.zoneGroups[state.zoneGroupNumber] || (state.zoneGroups[state.zoneGroupNumber] = []);
    const ref = { loopId: state.zoneLoopCardId, deviceId: button.dataset.zoneInputDevice };
    if (!group.some((item) => groupDeviceKey(item.loopId, item.deviceId) === groupDeviceKey(ref.loopId, ref.deviceId))) {
      group.push(ref); state.groupSelectedDeviceKey = groupDeviceKey(ref.loopId, ref.deviceId);
    }
    redrawGroupSetting();
  }));
  root.querySelector("[data-io-input-group]")?.addEventListener("change", (event) => { if (groupConnectionGuard()) { state.ioInputGroupNumber = Number(event.target.value); state.groupSelectedDeviceKey = null; redrawGroupSetting(); } });
  root.querySelector("[data-io-output-group]")?.addEventListener("change", (event) => { if (groupConnectionGuard()) { state.ioOutputGroupNumber = Number(event.target.value); state.groupSelectedDeviceKey = null; redrawGroupSetting(); } });
  root.querySelector("[data-io-loop]")?.addEventListener("change", (event) => { if (groupConnectionGuard()) { state.ioLoopCardId = event.target.value; state.groupSelectedDeviceKey = null; redrawGroupSetting(); } });
  root.querySelectorAll("[data-io-add-device]").forEach((button) => button.addEventListener("click", () => {
    if (!groupConnectionGuard()) return;
    const kind = button.dataset.ioKind;
    const list = kind === "output" ? (state.ioOutputGroups[state.ioOutputGroupNumber] || (state.ioOutputGroups[state.ioOutputGroupNumber] = [])) : (state.ioInputGroups[state.ioInputGroupNumber] || (state.ioInputGroups[state.ioInputGroupNumber] = []));
    const ref = { loopId: button.dataset.ioLoopId || state.ioLoopCardId, deviceId: button.dataset.ioAddDevice };
    if (!list.some((item) => groupDeviceKey(item.loopId, item.deviceId) === groupDeviceKey(ref.loopId, ref.deviceId))) list.push(ref);
    state.groupSelectedDeviceKey = groupDeviceKey(ref.loopId, ref.deviceId);
    redrawGroupSetting();
  }));
  root.querySelectorAll("[data-io-add-all]").forEach((button) => button.addEventListener("click", () => {
    if (!groupConnectionGuard()) return;
    const selectedLoop = state.loopCards.find((card) => card.id === state.ioLoopCardId);
    const kind = button.dataset.ioAddAll;
    const list = kind === "output" ? (state.ioOutputGroups[state.ioOutputGroupNumber] || (state.ioOutputGroups[state.ioOutputGroupNumber] = [])) : (state.ioInputGroups[state.ioInputGroupNumber] || (state.ioInputGroups[state.ioInputGroupNumber] = []));
    (selectedLoop?.devices || []).filter((device) => (kind === "output" ? isOutputGroupDevice(device) : !isOutputGroupDevice(device))).forEach((device) => {
      const ref = { loopId: selectedLoop.id, deviceId: device.id };
      if (!list.some((item) => groupDeviceKey(item.loopId, item.deviceId) === groupDeviceKey(ref.loopId, ref.deviceId))) list.push(ref);
    });
    state.groupSelectedDeviceKey = null;
    redrawGroupSetting();
  }));
  root.querySelector("[data-io-active-count]")?.addEventListener("change", (event) => { if (groupConnectionGuard()) { const group = getIoGroup(); group.activeCount = Math.max(1, Math.min(16, Number(event.target.value) || 1)); redrawGroupSetting(); } });
  root.querySelector("[data-io-output-active]")?.addEventListener("change", (event) => { if (groupConnectionGuard()) { getIoGroup().outputActiveFor = event.target.value; redrawGroupSetting(); } });
  root.querySelector("[data-io-delay]")?.addEventListener("change", (event) => { if (groupConnectionGuard()) { getIoGroup().delay = Math.max(0, Math.min(999, Number(event.target.value) || 0)); redrawGroupSetting(); } });
  root.querySelector("[data-io-status]")?.addEventListener("change", (event) => {
    if (!groupConnectionGuard()) return;
    getIoGroup().status = event.target.checked;
    const status = event.target.closest(".group-switch-wrap")?.querySelector("em");
    if (status) status.textContent = event.target.checked ? (state.language === "en" ? "Enable" : "فعال") : (state.language === "en" ? "Disable" : "غیرفعال");
  });
  root.querySelector("[data-io-preview]")?.addEventListener("click", () => { if (groupConnectionGuard()) { state.groupPreviewOpen = !state.groupPreviewOpen; redrawGroupSetting(); } });
  root.querySelectorAll("[data-group-selected-key]").forEach((button) => button.addEventListener("click", () => {
    if (!groupConnectionGuard()) return;
    state.groupSelectedDeviceKey = button.dataset.groupSelectedKey;
    root.querySelectorAll("[data-group-selected-key]").forEach((item) => item.classList.toggle("selected", item === button));
    scrollSelectedGroupDevice();
  }));
  root.querySelectorAll("[data-io-saved-relation]").forEach((button) => button.addEventListener("click", () => {
    if (!groupConnectionGuard()) return;
    const key = button.dataset.ioSavedRelation;
    const saved = state.ioSavedRelations?.[key];
    if (!saved) return;
    state.ioInputGroupNumber = Number(saved.inputGroupNumber || key.split("-")[0]);
    state.ioOutputGroupNumber = Number(saved.outputGroupNumber || key.split("-")[1]);
    state.ioRelations[key] = { ...saved };
    state.groupSelectedDeviceKey = null;
    redrawGroupSetting();
  }));
  root.querySelectorAll("[data-group-read-all]").forEach((button) => button.addEventListener("click", () => {
    if (!requireCurrentPanelConnection()) return;
    if (button.dataset.groupReadAll === "zone") {
      state.zoneGroups = {};
      state.loopCards.slice(0, 2).forEach((card, index) => { state.zoneGroups[index + 1] = card.devices.slice(0, 2).map((device) => ({ loopId: card.id, deviceId: device.id })); });
      state.zonePreAlarm = { 1: true, 2: false };
    } else {
      const card = state.loopCards.find((item) => item.id === state.ioLoopCardId) || state.loopCards[0];
      state.ioInputGroups[state.ioInputGroupNumber] = (card?.devices || []).filter((device) => !isOutputGroupDevice(device)).map((device) => ({ loopId: card.id, deviceId: device.id }));
      state.ioOutputGroups[state.ioOutputGroupNumber] = (card?.devices || []).filter(isOutputGroupDevice).map((device) => ({ loopId: card.id, deviceId: device.id }));
      state.ioRelations[`${state.ioInputGroupNumber}-${state.ioOutputGroupNumber}`] = { activeCount: 1, outputActiveFor: "fire", delay: 0, status: true };
    }
    state.groupSelectedDeviceKey = null;
    redrawGroupSetting();
    showToast(state.language === "en" ? "Groups were read from the panel." : "گروه‌ها از پنل خوانده شدند.");
  }));
  root.querySelectorAll("[data-group-delete]").forEach((button) => button.addEventListener("click", () => {
    if (!groupConnectionGuard()) return;
    if (!state.groupSelectedDeviceKey) {
      showToast(state.language === "en" ? "Select a device to delete first." : "ابتدا دیوایسی را برای حذف انتخاب کنید.", "info");
      return;
    }
    if (!window.confirm(state.language === "en" ? "Delete the selected device from this group?" : "دیوایس انتخاب‌شده از این گروه حذف شود؟")) return;
    if (button.dataset.groupDelete === "zone") {
      const group = state.zoneGroups[state.zoneGroupNumber] || [];
      state.zoneGroups[state.zoneGroupNumber] = group.filter((ref) => groupDeviceKey(ref.loopId, ref.deviceId) !== state.groupSelectedDeviceKey);
    } else if (button.dataset.groupDelete === "io-input" || button.dataset.groupDelete === "io-output") {
      const targetKind = button.dataset.groupDelete === "io-output" ? "output" : "input";
      const groups = targetKind === "output" ? state.ioOutputGroups : state.ioInputGroups;
      const groupNumber = targetKind === "output" ? state.ioOutputGroupNumber : state.ioInputGroupNumber;
      const group = groups[groupNumber] || [];
      groups[groupNumber] = group.filter((ref) => groupDeviceKey(ref.loopId, ref.deviceId) !== state.groupSelectedDeviceKey);
    } else {
      const inputGroup = state.ioInputGroups[state.ioInputGroupNumber] || [];
      const outputGroup = state.ioOutputGroups[state.ioOutputGroupNumber] || [];
      state.ioInputGroups[state.ioInputGroupNumber] = inputGroup.filter((ref) => groupDeviceKey(ref.loopId, ref.deviceId) !== state.groupSelectedDeviceKey);
      state.ioOutputGroups[state.ioOutputGroupNumber] = outputGroup.filter((ref) => groupDeviceKey(ref.loopId, ref.deviceId) !== state.groupSelectedDeviceKey);
    }
    state.groupSelectedDeviceKey = null;
    redrawGroupSetting();
  }));
  root.querySelectorAll("[data-group-delete-all]").forEach((button) => button.addEventListener("click", () => {
    if (!groupConnectionGuard()) return;
    if (!window.confirm(state.language === "en" ? "Delete all group data?" : "تمام اطلاعات گروه‌بندی حذف شود؟")) return;
    if (button.dataset.groupDeleteAll === "zone") { state.zoneGroups = {}; state.zonePreAlarm = {}; }
    else if (button.dataset.groupDeleteAll === "io-input") { delete state.ioInputGroups[state.ioInputGroupNumber]; }
    else if (button.dataset.groupDeleteAll === "io-output") { delete state.ioOutputGroups[state.ioOutputGroupNumber]; }
    else { state.ioInputGroups = {}; state.ioOutputGroups = {}; state.ioRelations = {}; state.ioSavedRelations = {}; state.ioGroups = {}; }
    state.groupSelectedDeviceKey = null;
    redrawGroupSetting();
    showToast(state.language === "en" ? "All group data was deleted." : "تمام اطلاعات گروه‌بندی حذف شد.", "info");
  }));
  root.querySelectorAll("[data-group-save]").forEach((button) => button.addEventListener("click", () => {
    if (!groupConnectionGuard()) return;
    if (button.dataset.groupSave === "io") {
      const key = `${state.ioInputGroupNumber}-${state.ioOutputGroupNumber}`;
      state.ioSavedRelations[key] = {
        ...getIoGroup(),
        inputGroupNumber: state.ioInputGroupNumber,
        outputGroupNumber: state.ioOutputGroupNumber,
        loopCardId: state.ioLoopCardId,
      };
      redrawGroupSetting();
      showToast(state.language === "en" ? "The input/output relation was saved and added to the list." : "ارتباط ورودی و خروجی ذخیره شد و به فهرست اضافه شد.");
      return;
    }
    showToast(state.language === "en" ? "Group changes were saved locally." : "تغییرات گروه‌بندی در نرم‌افزار ذخیره شد.");
  }));
  root.querySelectorAll("[data-group-update]").forEach((button) => button.addEventListener("click", () => showToast(state.language === "en" ? "Group changes are ready in the draft. Upload them from Saved Settings." : "تغییرات گروه‌بندی در پیش‌نویس آماده است؛ برای اعمال روی پنل از تنظیمات ذخیره‌شده آپلود کنید.", "info")));
  root.querySelector("[data-group-print]")?.addEventListener("click", () => window.print());
  scrollSelectedGroupDevice();
}

function renderFeaturesSetting() {
  return `<article class="sub-card"><div class="sub-card-head"><div><h3>قابلیت‌های پنل</h3><p>رفتارهای پیشرفته‌ی سیستم اعلام حریق را کنترل کنید.</p></div><span class="status-chip green">۵ فعال</span></div><div class="feature-grid">${renderToggleRow("تأخیر پیش‌هشدار", "مدت تأخیر قبل از فعال شدن آژیر", true)}${renderToggleRow("یادآوری خطا", "نمایش یادآوری برای خطاهای باز", true)}${renderToggleRow("خاموش‌سازی خودکار", "خاموشی خودکار خروجی پس از رخداد", false)}${renderToggleRow("قفل خروجی صدا", "جلوگیری از قطع صدای آژیر", true)}${renderToggleRow("تأیید دو مرحله‌ای", "تأیید عملیات حساس روی پنل", true)}${renderToggleRow("ثبت تاریخچه عملیات", "ذخیره اقدامات کاربران", true)}</div>${renderSettingActions()}</article>`;
}

async function loadPanelEventProfiles(panel) {
  if (!panel?.id || !findProject()?.id || panelEventProfilesCache.has(panel.id) || panelEventProfilesPending.has(panel.id)) return null;
  panelEventProfilesPending.add(panel.id);
  try {
    const project = findProject();
    const url = `/api/projects/${encodeURIComponent(project.id)}/panels/${encodeURIComponent(panel.id)}/user-profiles`;
    const response = await apiFetch(url, { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { panelEventProfilesCache.set(panel.id, []); return []; }
    const profiles = Array.isArray(result.profiles) ? result.profiles : [];
    panelEventProfilesCache.set(panel.id, profiles);
    return profiles;
  } catch {
    panelEventProfilesCache.set(panel.id, []);
    return [];
  } finally {
    panelEventProfilesPending.delete(panel.id);
  }
}

function exportPanelEventsToExcel(panel, events, isSample) {
  const english = state.language === "en";
  const project = findProject();
  const exportedAt = new Date();
  const formatTime = (date) => new Intl.DateTimeFormat(english ? "en-US" : "fa-IR-u-ca-persian", { dateStyle: "full", timeStyle: "short" }).format(date);
  const toDate = (value) => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date;
  };
  const types = {
    fire: english ? "Fire" : "حریق",
    fault: english ? "Fault" : "خطا",
    "pre-alarm": english ? "Pre-alarm" : "پیش‌هشدار",
    supervisory: english ? "Supervisory" : "نظارتی",
    normal: english ? "Restored" : "بازگشت به عادی",
  };
  const rows = events.map((event, index) => {
    const eventType = types[event.type || event.tone] || (english ? "Event" : "رویداد");
    const title = event.isSample ? (english ? event.titleEn : event.titleFa) : event.title || event.name || "";
    const description = event.isSample ? (english ? event.descriptionEn : event.descriptionFa) : event.description || event.detail || "";
    return [
      index + 1,
      eventType,
      title,
      description,
      project?.name || "",
      panel?.name || "",
      toDate(event.occurredAt || event.createdAt || event.timestamp || event.time),
      event.acknowledgedBy || event.acknowledged?.by || event.acknowledgedByName || "",
      toDate(event.acknowledgedAt || event.acknowledged?.at),
      event.silencedBy || event.silenced?.by || event.silencedByName || "",
      toDate(event.silencedAt || event.silenced?.at),
      event.isSample || isSample ? (english ? "Sample" : "نمونه") : (english ? "Live panel data" : "دادهٔ پنل"),
    ];
  });
  const reporter = sessionUser?.displayName || sessionUser?.username || (english ? "Unknown user" : "کاربر نامشخص");
  const label = (fa, en, value) => `${english ? en : fa}: ${value}`;
  const headers = english
    ? ["No.", "Type", "Event", "Details", "Project", "Panel", "Occurred at", "Acknowledged by", "Acknowledged at", "Silenced by", "Silenced at", "Record type"]
    : ["ردیف", "نوع", "رویداد", "جزئیات", "پروژه", "پنل", "زمان رخداد", "تأییدکننده", "زمان تأیید", "سایلنت‌کننده", "زمان سایلنت", "نوع داده"];
  const stamp = exportedAt.toISOString().replace(/[:.]/g, "-");
  const safePanelCode = String(panel?.code || panel?.id || "panel").replace(/[^a-zA-Z0-9_-]/g, "-");
  downloadXlsx({
    filename: `panel-events-${safePanelCode}-${stamp}.xlsx`,
    title: english ? "Panel Event Report" : "گزارش رویدادهای پنل",
    creator: reporter,
    sheetName: english ? "Panel events" : "رویدادهای پنل",
    metadata: [
      label("گزارش صادرشده برای کاربر", "Report generated for", reporter),
      label("تاریخ و ساعت صدور", "Exported at", formatTime(exportedAt)),
      label("پروژه", "Project", project?.name || "—"),
      label("پنل", "Panel", panel?.name || "—"),
      label("وضعیت داده", "Data status", isSample ? (english ? "Sample records" : "رویدادهای نمونه") : (english ? "Panel event history" : "تاریخچهٔ پنل")),
    ],
    headers,
    rows,
    rightToLeft: !english,
  });
}

function renderEventsSetting() {
  const english = state.language === "en";
  const panel = findPanel();
  const realEvents = !demoMode && Array.isArray(panel?.events) ? panel.events : [];
  const isSample = realEvents.length === 0;
  const events = isSample ? createSamplePanelEvents(panel, panelEventProfilesCache.get(panel?.id) || [], english ? "en" : "fa") : realEvents;
  const formatEventTime = (value) => {
    if (!value) return english ? "Not recorded" : "ثبت نشده";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(english ? "en-US" : "fa-IR-u-ca-persian", { dateStyle: "medium", timeStyle: "short" }).format(date);
  };
  const eventTypes = {
    fire: english ? "Fire" : "حریق",
    fault: english ? "Fault" : "خطا",
    "pre-alarm": english ? "Pre-alarm" : "پیش‌هشدار",
    supervisory: english ? "Supervisory" : "نظارتی",
    normal: english ? "Restored" : "بازگشت به عادی",
  };
  const eventRows = events.map((event) => {
    const rawType = event.type || event.tone || "normal";
    const type = Object.hasOwn(eventTypes, rawType) ? rawType : "normal";
    const occurredAt = event.occurredAt || event.createdAt || event.timestamp || event.time;
    const acknowledgedBy = event.acknowledgedBy || event.acknowledged?.by || event.acknowledgedByName || "";
    const acknowledgedAt = event.acknowledgedAt || event.acknowledged?.at || "";
    const silencedBy = event.silencedBy || event.silenced?.by || event.silencedByName || "";
    const silencedAt = event.silencedAt || event.silenced?.at || "";
    const title = event.isSample ? (english ? event.titleEn : event.titleFa) : event.title || event.name;
    const description = event.isSample ? (english ? event.descriptionEn : event.descriptionFa) : event.description || event.detail;
    const actionStatus = (label, actor, time) => `<div class="event-history-action"><small>${label}</small><b>${actor ? escapeHtml(actor) : (english ? "Not recorded" : "ثبت نشده")}</b><time>${formatEventTime(time)}</time></div>`;
    return `<article class="event-row ${type}${event.isSample ? " is-sample-event" : ""}"><span class="event-icon">${type === "fire" ? icons.fire : ["fault", "pre-alarm", "supervisory"].includes(type) ? icons.alertTriangle : icons.check}</span><div class="event-row-copy"><div class="event-row-title"><b>${escapeHtml(title || (english ? "Panel event" : "رویداد پنل"))}</b><span class="event-type-badge ${type}">${eventTypes[type]}</span>${event.isSample ? `<span class="event-sample-badge">${english ? "Sample" : "نمونه"}</span>` : ""}</div><small>${escapeHtml(description || "—")}</small></div><div class="event-history-meta"><div class="event-history-action"><small>${english ? "Occurred" : "زمان رخداد"}</small><b>${formatEventTime(occurredAt)}</b></div>${actionStatus(english ? "Acknowledged by" : "تأیید توسط", acknowledgedBy, acknowledgedAt)}${actionStatus(english ? "Silenced by" : "سایلنت توسط", silencedBy, silencedAt)}</div></article>`;
  }).join("");
  const sampleNotice = isSample ? `<div class="event-sample-notice" role="note">${english ? "These example events are sample records for review. They are not live panel alarms." : "این رویدادها نمونه و صرفاً برای بررسی هستند؛ هشدار زندهٔ پنل نیستند."}</div>` : "";
  const noPanel = !panel ? `<div class="panel-empty-state" role="status">${english ? "Select a panel to view its events." : "برای دیدن رویدادها یک پنل انتخاب کنید."}</div>` : "";
  return `<article class="sub-card"><div class="sub-card-head"><div><h3>${english ? "Panel events" : "رویدادهای پنل"}</h3><p>${english ? `Event history for ${escapeHtml(panel?.name || "Selected panel")}` : `تاریخچهٔ رویدادهای ${escapeHtml(panel?.name || "پنل انتخاب‌شده")}`}</p></div><div class="sub-actions"><button type="button" class="btn-secondary compact" data-events-read>${icons.refresh}${english ? "Read events" : "خواندن رویدادها"}</button><button type="button" class="btn-secondary compact" data-events-export>${icons.report}${english ? "Export Excel" : "خروجی Excel"}</button></div></div>${sampleNotice}<div class="events-list">${noPanel || eventRows}</div>${renderSettingActions()}</article>`;
}

function renderRemoteSetting() {
  const panel = findPanel();
  const peers = demoMode ? demoData?.demoRemotePanels || [] : Array.isArray(panel?.remotePanels) ? panel.remotePanels : [];
  const connectionStatus = demoMode
    ? demoData?.demoRemoteConnectionStatus || ""
    : panel?.remoteConnectionStatus || "وضعیت اتصال گزارش نشده";
  const peerRows = peers.map((peer) => `<div><span>${icons.panel}</span><b>${escapeHtml(peer.code || peer.name || "—")}</b><em>${escapeHtml(peer.status || "—")}</em></div>`).join("");
  return `<div class="remote-layout"><article class="sub-card remote-status"><div class="remote-graphic">${icons.wifi}<span></span></div><span class="status-chip amber">${escapeHtml(connectionStatus)}</span><h3>پنل از راه دور</h3><p>برای مشاهده و همگام‌سازی پنل‌های دور، ابتدا ارتباط اینترنتی یا شبکه را تنظیم کنید.</p><button type="button" class="btn-secondary" data-remote-connect>تنظیم ارتباط</button>${renderSettingActions()}</article><article class="sub-card"><div class="sub-card-head"><div><h3>پنل‌های همکار</h3><p>پنل‌هایی که برای همگام‌سازی انتخاب شده‌اند</p></div></div><div class="remote-list">${peerRows || `<div class="panel-empty-state" role="status">${demoMode ? "در دادهٔ Demo پنل همکار دیگری ثبت نشده است." : "هنوز پنل همکاری برای همگام‌سازی ثبت نشده است."}</div>`}</div></article></div>`;
}

function renderReportSetting() {
  const panel = findPanel();
  const report = demoMode ? demoData?.demoReport : null;
  const deviceCount = report?.deviceCount ?? (Array.isArray(state.loopCards) ? state.loopCards.reduce((sum, card) => sum + (card.devices?.length || 0), 0) : null);
  const openEvents = report?.openEvents ?? panel?.openEventCount ?? panel?.openAlarmCount ?? null;
  const groupCount = report?.configuredGroups ?? new Set([
    ...Object.keys(state.zoneGroups || {}).map((number) => `zone:${number}`),
    ...Object.keys(state.ioRelations || {}).map((number) => `io:${number}`),
  ]).size;
  const status = report?.panelStatus || panel?.operationalStatus || (demoMode ? panel?.status : panel?.connectionState) || "ثبت نشده";
  const panelCode = report?.panelCode || panel?.code || "—";
  const generatedAt = report?.generatedAt || (panel?.lastReportGeneratedAt
    ? new Intl.DateTimeFormat(state.language === "en" ? "en-US" : "fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(panel.lastReportGeneratedAt))
    : "هنوز گزارشی تولید نشده است");
  return `<article class="sub-card"><div class="sub-card-head"><div><h3>گزارش تنظیمات پنل</h3><p>گزارش خلاصه از وضعیت پیکربندی و دیوایس‌ها</p></div><button type="button" class="btn-primary compact" data-report-generate>${icons.report}تولید گزارش</button></div><div class="report-preview"><div><span>${icons.panel}</span><b>وضعیت پنل</b><strong>${escapeHtml(status)}</strong></div><div><span>${icons.grid}</span><b>تعداد دیوایس‌ها</b><strong>${deviceCount === null ? "—" : faDigits(deviceCount)}</strong></div><div><span>${icons.bell}</span><b>رویدادهای باز</b><strong>${openEvents === null ? "—" : faDigits(openEvents)}</strong></div><div><span>${icons.check}</span><b>گروه‌های تنظیم‌شده</b><strong>${faDigits(groupCount)}</strong></div></div><div class="report-file">${icons.report}<span><b>گزارش پیکربندی ${escapeHtml(panelCode)}</b><small>آخرین تولید: ${escapeHtml(generatedAt)} · PDF</small></span><button type="button" class="btn-secondary compact" data-report-download>دانلود</button></div>${renderSettingActions()}</article>`;
}

function renderGsmSetting() {
  const panel = findPanel();
  const phoneNumber = demoMode ? demoData?.demoGsmPhoneNumber : panel?.gsmSettings?.primaryPhoneNumber;
  return `<div class="setting-panel-grid"><article class="sub-card"><div class="sub-card-head"><div><h3>تلفن‌کننده GSM</h3><p>وضعیت ارسال پیامک و تماس صوتی</p></div><span class="status-chip amber">${demoMode ? "آماده‌سازی Demo" : panel?.gsmSettings?.status || "وضعیت گزارش نشده"}</span></div><div class="gsm-number"><span>${icons.bell}</span><div><b>${escapeHtml(phoneNumber || "شماره‌ای ثبت نشده")}</b><small>شماره اصلی دریافت هشدار</small></div><button type="button" class="btn-secondary compact" data-gsm-edit>ویرایش</button></div>${renderToggleRow("تماس صوتی هنگام حریق", "ارسال تماس به شماره‌های ثبت‌شده", true)}${renderToggleRow("ارسال پیامک خطا", "گزارش خطاهای پنل از طریق پیامک", true)}${renderSettingActions()}</article><article class="sub-card"><div class="sub-card-head"><div><h3>رویدادهای قابل ارسال</h3><p>انتخاب رخدادهای مهم</p></div></div>${renderToggleRow("حریق", "Fire Alarm", true)}${renderToggleRow("خطا", "Fault", true)}${renderToggleRow("نظارت", "Supervisory", false)}${renderToggleRow("بازگشت به حالت عادی", "Restore", false)}</article></div>`;
}

function renderCustomizeSetting() {
  const project = findProject();
  const projectTitle = project?.name || "عنوان پروژه ثبت نشده";
  const messageLanguage = state.language === "en" ? "English" : "فارسی";
  return `<article class="sub-card"><div class="sub-card-head"><div><h3>سفارشی‌سازی اعلان‌ها</h3><p>متن و قالب پیام‌های ارسالی تلفن‌کننده را تعیین کنید.</p></div></div><div class="form-area compact-form"><div class="field-block"><label>عنوان پروژه در پیامک</label><div class="fake-input"><span>${escapeHtml(projectTitle)}</span></div></div><div class="field-block"><label>زبان پیام</label><div class="fake-input"><span>${messageLanguage}</span>${icons.chevronDown}</div></div><div class="field-block full"><label>قالب پیام حریق</label><textarea class="sample-textarea" data-persist-setting>هشدار حریق در {PROJECT} - {PANEL} - {TIME}</textarea></div></div>${renderSettingActions()}</article>`;
}
function renderLocationSetting() {
  const project = findProject();
  const panel = findPanel();
  const location = panel?.location || project?.location || "موقعیت ثبت نشده";
  const installationLocation = panel?.installationLocation || (demoMode ? demoData?.demoLocation?.installationLocation : "") || "موقعیت نصب ثبت نشده";
  const coordinates = demoMode && demoData?.demoLocation?.coordinates
    ? demoData.demoLocation.coordinates
    : project?.coordinates?.lat !== undefined && project?.coordinates?.lng !== undefined
    ? `${Number(project.coordinates.lat).toFixed(4)}, ${Number(project.coordinates.lng).toFixed(4)}`
    : "ثبت نشده";
  const hasLocation = Boolean(panel?.location || project?.location || (demoMode && demoData?.demoLocation));
  return `<article class="sub-card"><div class="sub-card-head"><div><h3>موقعیت پنل</h3><p>محل نصب پنل را برای نمایش در نقشه ثبت کنید.</p></div><span class="status-chip ${hasLocation ? "green" : "amber"}">${hasLocation ? "ثبت شده" : "ثبت نشده"}</span></div><div class="location-map"><div class="map-grid"></div><span class="map-pin">${icons.panel}</span><div class="map-label"><b>${escapeHtml(project?.name || "پروژه انتخاب نشده")}</b><small>${escapeHtml(location)}</small></div></div><div class="form-area compact-form"><div class="field-block"><label>طبقه / بخش</label><div class="fake-input"><span>${escapeHtml(installationLocation)}</span></div></div><div class="field-block"><label>مختصات پروژه</label><div class="fake-input" dir="ltr"><span>${escapeHtml(coordinates)}</span></div></div></div>${renderSettingActions()}</article>`;
}
function renderMonitoringSetting() {
  const entries = getPanelDirectoryEntries();
  const connectedCount = entries.filter((entry) => entry.key === "connected").length;
  const hasReportedState = entries.some((entry) => entry.key !== "unknown");
  const status = demoMode ? demoData?.demoMonitoringStatus || "مانیتورینگ Demo" : hasReportedState ? `${faDigits(connectedCount)} پنل متصل گزارش شده` : "وضعیت زنده دریافت نشده";
  return `<div class="monitoring-grid"><article class="sub-card monitoring-hero"><div class="monitoring-ring"><span>${icons.dashboard}</span></div><span class="status-chip ${hasReportedState ? "green" : "amber"}">${escapeHtml(status)}</span><h3>مرکز مانیتورینگ</h3><p>وضعیت پنل‌ها، اتصال‌ها و رخدادها را از یک نمای واحد دنبال کنید.</p><button type="button" class="btn-primary" data-monitoring-open>ورود به مانیتورینگ</button></article><article class="sub-card"><div class="sub-card-head"><div><h3>وضعیت سرویس‌ها</h3><p>آخرین بررسی خودکار سیستم</p></div></div>${renderToggleRow("مانیتورینگ زنده", "دریافت وضعیت پنل‌ها در لحظه", true)}${renderToggleRow("اعلان رخداد جدید", "نمایش هشدار در داشبورد نصاب", true)}${renderToggleRow("ثبت لاگ ارتباطات", "ثبت زمان و کاربر هر اتصال", true)}${renderSettingActions()}</article></div>`;
}

function getPanelDirectoryState(project, panel) {
  const english = state.language === "en";
  const demoStatus = demoMode ? demoData?.demoPanelStates?.[panel.id] : null;
  const reportedStatus = demoStatus?.status || panel.connectionState;
  const normalizedStatus = String(reportedStatus || "").toLowerCase();
  const status = demoStatus?.status || ({
    connected: "connected", online: "connected", "متصل": "connected", "آنلاین": "connected",
    offline: "offline", "آفلاین": "offline", error: "error", connecting: "connecting",
    unconfigured: "unconfigured", "نیاز به راه‌اندازی": "unconfigured",
  })[normalizedStatus] || "unknown";
  const lastSeenDate = panel.lastSeenAt ? new Date(panel.lastSeenAt) : null;
  const lastSeen = demoStatus?.lastSeen?.[english ? "en" : "fa"] || (lastSeenDate && !Number.isNaN(lastSeenDate.valueOf())
    ? new Intl.DateTimeFormat(english ? "en-US" : "fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(lastSeenDate)
    : (english ? "No connection data received" : "دادهٔ ارتباطی دریافت نشده"));
  const states = {
    connected: { label: english ? "Connected" : "متصل", tone: "connected", icon: icons.check },
    offline: { label: english ? "Disconnected" : "قطع ارتباط", tone: "offline", icon: icons.alert },
    connecting: { label: english ? "Connecting" : "در حال برقراری ارتباط", tone: "connecting", icon: icons.loader },
    unconfigured: { label: english ? "Needs setup" : "نیاز به راه‌اندازی", tone: "unconfigured", icon: icons.info },
    error: { label: english ? "Connection error" : "خطا در ارتباط", tone: "error", icon: icons.alert },
    unknown: { label: english ? "Status not reported" : "وضعیت دریافت نشده", tone: "unknown", icon: icons.info },
  };
  const key = states[status] ? status : "unknown";
  return { key, ...states[key], lastSeen, project, panel };
}

function getPanelDirectoryEntries() {
  return projects.flatMap((project) => project.panels.map((panel) => getPanelDirectoryState(project, panel)));
}

function renderPanelStateChip(entry) {
  return `<span class="panel-directory-status ${entry.tone}"><i>${entry.icon}</i><b>${entry.label}</b></span>`;
}

function renderPanelsPage() {
  const english = state.language === "en";
  const entries = getPanelDirectoryEntries();
  const connected = entries.filter((entry) => entry.key === "connected").length;
  const attention = entries.filter((entry) => ["offline", "error"].includes(entry.key)).length;
  const unknown = entries.filter((entry) => entry.key === "unknown").length;
  const sites = projects.filter((project) => project.panels.length);
  const connectionSummary = !demoMode && unknown > 0
    ? `${faDigits(entries.length)} ${english ? "panels" : "پنل"} · ${faDigits(connected)} ${english ? "connected reported" : "متصل گزارش‌شده"} · ${faDigits(unknown)} ${english ? "status unknown" : "وضعیت نامعلوم"}`
    : `${faDigits(entries.length)} ${english ? "panels" : "پنل"} · ${faDigits(connected)} ${english ? "connected" : "متصل"}`;
  const connectedLabel = !demoMode && unknown > 0 ? (english ? "Reported connected" : "متصل گزارش‌شده") : (english ? "Connected" : "متصل");
  const attentionLabel = !demoMode && unknown > 0 ? (english ? "Reported attention" : "بررسی گزارش‌شده") : (english ? "Needs attention" : "نیازمند بررسی");
  return `<section class="panel-directory-page">
    <section class="breadcrumb"><b>${english ? "My panels" : "پنل‌های من"}</b></section>
    <section class="page-intro panel-directory-intro"><div class="page-intro-copy"><div class="eyebrow">${english ? "FIRE PANEL MANAGEMENT" : "مدیریت پنل‌های اعلام حریق"}</div><h2>${english ? "My panels" : "پنل‌های من"}</h2><p>${english ? "Manage every fire panel by its site and installation location." : "همه پنل‌های اعلام حریق را بر اساس سایت و محل نصب مدیریت کنید."}</p></div><div class="page-intro-actions"><div class="project-summary panel-summary"><span>${icons.panel}</span><div><small>${english ? "Panel overview" : "نمای کلی پنل‌ها"}</small><b>${connectionSummary}</b></div></div><button type="button" class="btn-primary" data-panel-directory-add>${icons.plus}${english ? "Add new panel" : "افزودن پنل جدید"}</button></div></section>
    <section class="panel-directory-stat-grid"><div class="panel-directory-stat"><span class="connected">${icons.check}</span><div><small>${connectedLabel}</small><b>${faDigits(connected)}</b></div></div><div class="panel-directory-stat"><span class="offline">${icons.alert}</span><div><small>${attentionLabel}</small><b>${faDigits(attention)}</b></div></div><div class="panel-directory-stat"><span class="sites">${icons.location}</span><div><small>${english ? "Sites" : "سایت‌ها"}</small><b>${faDigits(sites.length)}</b></div></div></section>
    ${sites.length ? sites.map((project) => {
      const projectEntries = entries.filter((entry) => entry.project.id === project.id);
      return `<section class="panel-site-section"><div class="panel-site-heading"><div class="panel-site-title"><span class="panel-site-icon">${icons.location}</span><div><span class="eyebrow">${english ? "SITE" : "سایت"}</span><h3>${escapeHtml(project.name)}</h3><p>${icons.location}${escapeHtml(project.location)}</p></div></div><span class="panel-site-count">${faDigits(projectEntries.length)} ${english ? "panels" : "پنل"}</span></div><div class="panel-directory-grid">${projectEntries.map((entry) => `<article class="panel-directory-card ${entry.tone}"><div class="panel-directory-card-head"><span class="panel-directory-card-icon">${icons.panel}</span><span class="panel-directory-code" dir="ltr">${escapeHtml(entry.panel.code || "—")}</span></div><div class="panel-directory-card-copy"><h4>${escapeHtml(entry.panel.name)}</h4><p>${icons.location}${escapeHtml(project.location)}</p></div>${renderPanelStateChip(entry)}<div class="panel-directory-last-seen"><span>${icons.clock}</span><span>${english ? "Last connection" : "آخرین ارتباط"}<b>${entry.lastSeen}</b></span></div><button type="button" class="panel-directory-manage" data-panel-directory-open data-project-id="${escapeHtml(project.id)}" data-panel-id="${escapeHtml(entry.panel.id)}">${english ? "Manage" : "مدیریت"}${icons.chevronLeft}</button></article>`).join("")}</div></section>`;
    }).join("") : `<div class="panel-directory-empty"><span>${icons.panel}</span><h3>${english ? "No panels yet" : "هنوز پنلی ثبت نشده است"}</h3><p>${english ? "Add your first panel to start managing your fire protection sites." : "اولین پنل خود را اضافه کنید تا مدیریت سایت‌های اعلام حریق را شروع کنید."}</p><button type="button" class="btn-primary" data-panel-directory-add>${icons.plus}${english ? "Add new panel" : "افزودن پنل جدید"}</button></div>`}
  </section>`;
}

function findPanelDirectoryEntry() {
  return getPanelDirectoryEntries().find((entry) => entry.panel.id === state.panelDirectoryPanelId) || getPanelDirectoryEntries()[0] || null;
}

function renderPanelDetailPage() {
  const english = state.language === "en";
  const entry = findPanelDirectoryEntry();
  if (!entry) return renderPanelsPage();
  const tab = state.panelDirectoryTab || "status";
  const detailFixture = demoMode ? demoData : null;
  const technicalId = entry.panel.gatewayId || (detailFixture ? detailFixture.demoGatewayId : "");
  const firmware = entry.panel.firmware || (detailFixture ? detailFixture.demoFirmwareVersion : "");
  const events = detailFixture?.demoPanelEvents || (Array.isArray(entry.panel.events) ? entry.panel.events : []);
  const openAlarms = demoMode ? entry.panel.openAlarmCount ?? entry.panel.alarms ?? 0 : entry.panel.openAlarmCount ?? null;
  const deviceCount = entry.panel.deviceCount ?? (detailFixture ? detailFixture.demoPanelDeviceCount + Number(entry.panel.alarms || 0) : null);
  const noData = english ? "Not reported" : "گزارش نشده";
  const eventRows = events.map((event) => {
    const type = event.type || event.tone || "normal";
    const time = event.time || (event.createdAt
      ? new Intl.DateTimeFormat(english ? "en-US" : "fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(event.createdAt))
      : "—");
    return `<div class="panel-event-row ${escapeHtml(type)}"><span>${type === "danger" || type === "fire" ? icons.alert : icons.check}</span><div><b>${escapeHtml(event.title || event.name || "—")}</b><small>${escapeHtml(event.detail || event.description || "—")}</small></div><time>${escapeHtml(time)}</time></div>`;
  }).join("");
  const eventEmpty = Array.isArray(entry.panel.events)
    ? (english ? "No events have been recorded for this panel." : "برای این پنل رویدادی ثبت نشده است.")
    : (english ? "Panel event history has not been received." : "تاریخچهٔ رویدادهای پنل دریافت نشده است.");
  const eventContent = eventRows || `<div class="panel-empty-state" role="status">${detailFixture ? (english ? "Demo event history is empty." : "تاریخچهٔ نمونهٔ Demo خالی است.") : eventEmpty}</div>`;
  const healthMessage = entry.key === "unknown"
    ? (english ? "No connection status has been reported for this panel." : "وضعیت ارتباطی از این پنل دریافت نشده است.")
    : detailFixture && entry.key === "connected"
      ? (english ? "The panel is responding normally in this demo." : "پنل در این Demo به‌صورت عادی پاسخ می‌دهد.")
      : (english ? `Reported panel status: ${entry.label}.` : `وضعیت گزارش‌شدهٔ پنل: ${entry.label}.`);
  const settingsNotice = detailFixture
    ? (english ? "This screen does not connect to a real panel. Settings remain in the current application state." : "این صفحه به پنل واقعی متصل نمی‌شود و تنظیمات در وضعیت فعلی برنامه نگهداری می‌شوند.")
    : (english ? "Panel settings are stored in this workspace." : "تنظیمات پنل در فضای کاری ذخیره می‌شوند.");
  const quickOverviewCopy = detailFixture
    ? (english ? "Current demo readings for this panel." : "خوانش‌های Demo فعلی این پنل.")
    : (english ? "Latest values reported for this panel." : "آخرین مقادیر گزارش‌شده از این پنل.");
  return `<section class="panel-detail-page"><section class="panel-detail-breadcrumb"><button type="button" data-panels-back>${icons.chevronRight}${english ? "My panels" : "پنل‌های من"}</button><span>${icons.chevronLeft}</span><b>${escapeHtml(entry.project.name)}</b><span>${icons.chevronLeft}</span><strong>${escapeHtml(entry.panel.name)}</strong></section><section class="panel-detail-hero"><div class="panel-detail-hero-icon">${icons.panel}</div><div class="panel-detail-hero-copy"><span class="eyebrow">${english ? "PANEL MANAGEMENT" : "مدیریت پنل"}</span><h2>${escapeHtml(entry.panel.name)}</h2><p>${icons.location}${escapeHtml(entry.project.name)} · ${escapeHtml(entry.project.location)}</p></div><div class="panel-detail-hero-status">${renderPanelStateChip(entry)}<small>${escapeHtml(entry.lastSeen)}</small></div></section><nav class="panel-detail-tabs" aria-label="${english ? "Panel management sections" : "بخش‌های مدیریت پنل"}"><button type="button" class="${tab === "status" ? "active" : ""}" data-panel-detail-tab="status">${icons.dashboard}${english ? "Status" : "وضعیت"}</button><button type="button" class="${tab === "settings" ? "active" : ""}" data-panel-detail-tab="settings">${icons.settings}${english ? "Settings" : "تنظیمات"}</button><button type="button" class="${tab === "events" ? "active" : ""}" data-panel-detail-tab="events">${icons.bell}${english ? "Events" : "رویدادها"}${openAlarms ? `<em>${faDigits(openAlarms)}</em>` : ""}</button></nav>${tab === "settings" ? `<section class="panel-detail-content"><article class="panel-detail-card panel-detail-settings-card"><div class="panel-detail-card-heading"><span>${icons.settings}</span><div><h3>${english ? "Panel configuration" : "پیکربندی پنل"}</h3><p>${english ? "Open the existing configuration workspace for this panel." : "فضای تنظیمات موجود پنل را برای پیکربندی باز کنید."}</p></div></div><button type="button" class="btn-primary" data-panel-detail-settings>${icons.arrowUpRight}${english ? "Open panel settings" : "ورود به تنظیمات پنل"}</button></article><article class="panel-detail-card"><div class="panel-detail-card-heading"><span>${icons.info}</span><div><h3>${english ? "Panel settings" : "تنظیمات پنل"}</h3><p>${escapeHtml(settingsNotice)}</p></div></div></article></section>` : tab === "events" ? `<section class="panel-detail-content"><article class="panel-detail-card"><div class="panel-detail-card-heading"><span>${icons.bell}</span><div><h3>${english ? "Recent events" : "رویدادهای اخیر"}</h3><p>${english ? "A clear history for the selected panel." : "تاریخچه‌ی واضح پنل انتخاب‌شده."}</p></div></div><div class="panel-event-list">${eventContent}</div></article></section>` : `<section class="panel-detail-content"><div class="panel-detail-overview-grid"><article class="panel-detail-card panel-health-card"><div class="panel-detail-card-heading"><span>${entry.tone === "connected" ? icons.shield : icons.alert}</span><div><h3>${english ? "Connection health" : "سلامت ارتباط"}</h3><p>${escapeHtml(healthMessage)}</p></div></div><div class="panel-health-meter ${entry.tone}"><i></i><b>${entry.key === "unknown" ? noData : entry.label}</b></div></article><article class="panel-detail-card"><div class="panel-detail-card-heading"><span>${icons.dashboard}</span><div><h3>${english ? "Quick overview" : "نمای سریع"}</h3><p>${escapeHtml(quickOverviewCopy)}</p></div></div><div class="panel-quick-metrics"><div><small>${english ? "Open alarms" : "هشدار باز"}</small><b>${openAlarms === null ? "—" : faDigits(openAlarms)}</b></div><div><small>${english ? "Devices" : "دیوایس‌ها"}</small><b>${deviceCount === null ? "—" : faDigits(deviceCount)}</b></div><div><small>${english ? "Last seen" : "آخرین ارتباط"}</small><b>${escapeHtml(entry.lastSeen)}</b></div></div></article></div><article class="panel-detail-card panel-technical-card"><div class="panel-detail-card-heading"><span>${icons.info}</span><div><h3>${english ? "Technical information" : "اطلاعات فنی"}</h3><p>${english ? "Visible here for technicians; it is hidden from the primary user flow." : "این بخش برای تکنسین‌هاست و در مسیر اصلی کاربر نمایش داده نمی‌شود."}</p></div></div><div class="panel-technical-grid"><div><small>${english ? "Panel ID" : "شناسه پنل"}</small><b dir="ltr">${escapeHtml(entry.panel.code || "—")}</b></div><div><small>${english ? "Gateway" : "Gateway"}</small><b dir="ltr">${escapeHtml(technicalId || "—")}</b></div><div><small>${english ? "Firmware" : "Firmware"}</small><b dir="ltr">${escapeHtml(firmware || "—")}</b></div><div><small>${english ? "Last connection" : "آخرین ارتباط"}</small><b>${escapeHtml(entry.lastSeen)}</b></div></div></article></section>`}</section>`;
}

function showPanelOnboarding() {
  closeSettingsModal();
  const english = state.language === "en";
  const backdrop = document.createElement("div");
  backdrop.className = "settings-modal-backdrop panel-onboarding-backdrop";
  let step = 1;
  let identified = null;
  const referenceProject = projects.find((project) => project.panels.length) || projects[0];
  const renderStep = () => {
    const defaultCode = demoMode ? demoData?.demoOnboardingCode || "" : "";
    const projectOptions = projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)} · ${escapeHtml(project.location)}</option>`).join("");
    backdrop.innerHTML = `<div class="settings-modal-card panel-onboarding-card" role="dialog" aria-modal="true" aria-labelledby="panel-onboarding-title"><div class="panel-onboarding-progress"><span class="active"></span><span class="${step > 1 ? "active" : ""}"></span><span class="${step > 2 ? "active" : ""}"></span></div>${step === 1 ? `<div class="settings-modal-head panel-onboarding-heading"><div class="helper-icon">${icons.panel}</div><div><span class="eyebrow">${english ? "ADD PANEL" : "افزودن پنل"}</span><h3 id="panel-onboarding-title">${english ? "Add a new panel" : "افزودن پنل جدید"}</h3><p>${english ? "Enter the identifier printed on the panel." : "شناسه یا کدی را که روی پنل نوشته شده وارد کنید."}</p></div></div><div class="panel-onboarding-form"><label>${english ? "Panel identifier" : "شناسه پنل"}<input type="text" data-onboarding-code value="${defaultCode}" dir="ltr" placeholder="PNL-8F42-19"><small>${english ? "You do not need to know any network or hardware details." : "لازم نیست اطلاعات شبکه یا سخت‌افزار را بدانید."}</small></label><div class="panel-qr-divider"><span>${english ? "or" : "یا"}</span></div><button type="button" class="btn-secondary panel-scan-button" data-onboarding-scan>${icons.qr}${english ? "Scan QR Code" : "اسکن QR Code"}</button></div><div class="settings-modal-actions"><button type="button" class="btn-secondary" data-onboarding-cancel>${english ? "Cancel" : "انصراف"}</button><button type="button" class="btn-primary" data-onboarding-next>${english ? "Continue" : "ادامه"}${icons.chevronLeft}</button></div>` : step === 2 ? `<div class="panel-onboarding-success"><div class="panel-success-icon">${icons.check}</div><span class="eyebrow">${demoMode ? (english ? "DEMO IDENTIFICATION" : "شناسایی آزمایشی") : (english ? "IDENTIFIER ENTERED" : "شناسه وارد شد")}</span><h3 id="panel-onboarding-title">${demoMode ? (english ? "Demo panel identified" : "پنل Demo شناسایی شد") : (english ? "Panel identifier recorded" : "شناسه پنل ثبت شد")} ✓</h3><p>${english ? "The panel is ready to be named for everyday use." : "پنل برای نام‌گذاری و استفاده روزمره آماده است."}</p><div class="panel-identified-code"><small>${english ? "Panel identifier" : "شناسه پنل"}</small><b dir="ltr">${escapeHtml(identified.code)}</b></div><div class="panel-identified-context"><span>${icons.location}</span><div><small>${demoMode ? (english ? "Demo site information" : "اطلاعات سایت Demo") : (english ? "Installation site" : "محل نصب")}</small><b>${escapeHtml(referenceProject?.name || "")}</b><em>${escapeHtml(referenceProject?.location || "")}</em></div></div></div><div class="settings-modal-actions"><button type="button" class="btn-secondary" data-onboarding-back>${english ? "Back" : "بازگشت"}</button><button type="button" class="btn-primary" data-onboarding-next>${english ? "Continue" : "ادامه"}${icons.chevronLeft}</button></div>` : `<div class="settings-modal-head panel-onboarding-heading"><div class="helper-icon">${icons.panel}</div><div><span class="eyebrow">${english ? "FINAL STEP" : "مرحله پایانی"}</span><h3 id="panel-onboarding-title">${english ? "Name your panel" : "نام‌گذاری پنل"}</h3><p>${english ? "Choose a clear name and installation site for daily management." : "یک نام روشن و محل نصب پنل را برای مدیریت روزمره انتخاب کنید."}</p></div></div><div class="panel-onboarding-form panel-onboarding-naming"><label>${english ? "Panel name" : "نام پنل"}<input type="text" data-onboarding-name value="${english ? "First floor panel" : "پنل طبقه اول"} autofocus></label><label>${english ? "Installation site" : "سایت / پروژه"}<select data-onboarding-project>${projectOptions}</select></label><label>${english ? "Installation location (optional)" : "محل نصب (اختیاری)"}<input type="text" data-onboarding-location value="${escapeHtml(referenceProject?.location || "")}" placeholder="${english ? "Building, floor or zone" : "ساختمان، طبقه یا بخش"}"></label></div><div class="settings-modal-actions"><button type="button" class="btn-secondary" data-onboarding-back>${english ? "Back" : "بازگشت"}</button><button type="button" class="btn-primary" data-onboarding-save>${icons.check}${english ? "Save panel" : "ذخیره پنل"}</button></div>`}`;
    backdrop.querySelector("[data-onboarding-code]")?.focus();
    backdrop.querySelector("[data-onboarding-scan]")?.addEventListener("click", () => { const input = backdrop.querySelector("[data-onboarding-code]"); if (demoMode && defaultCode) { input.value = defaultCode; input.classList.add("is-scanned"); showToast(english ? "Demo QR code recognized." : "QR Code به‌صورت Demo شناسایی شد.", "info"); } else { input.focus(); showToast(english ? "Enter the identifier printed on the panel." : "شناسهٔ چاپ‌شده روی پنل را وارد کنید.", "info"); } });
    backdrop.querySelector("[data-onboarding-cancel]")?.addEventListener("click", closeSettingsModal);
    backdrop.querySelector("[data-onboarding-back]")?.addEventListener("click", () => { step = Math.max(1, step - 1); renderStep(); });
    backdrop.querySelector("[data-onboarding-next]")?.addEventListener("click", () => {
      if (step === 1) {
        const code = backdrop.querySelector("[data-onboarding-code]")?.value.trim();
        if (!code) { showToast(english ? "Enter the panel identifier first." : "ابتدا شناسه پنل را وارد کنید.", "info"); return; }
        const duplicate = getPanelDirectoryEntries().some((entry) => entry.panel.code?.toLowerCase() === code.toLowerCase());
        if (duplicate) { showToast(english ? "This panel identifier is already in use." : "این شناسه پنل قبلاً ثبت شده است.", "info"); return; }
        identified = { code, ...(demoMode ? { gatewayId: demoData?.demoOnboardingGatewayId, firmware: demoData?.demoFirmwareVersion } : {}) };
      }
      step = Math.min(3, step + 1);
      renderStep();
    });
    backdrop.querySelector("[data-onboarding-save]")?.addEventListener("click", async () => {
      const name = backdrop.querySelector("[data-onboarding-name]")?.value.trim();
      const projectId = backdrop.querySelector("[data-onboarding-project]")?.value;
      const location = backdrop.querySelector("[data-onboarding-location]")?.value.trim();
      const project = projects.find((item) => item.id === projectId) || referenceProject;
      if (!name || !project) { showToast(english ? "Enter a panel name first." : "ابتدا نام پنل را وارد کنید.", "info"); return; }
      const panel = { id: createEntityId("panel"), name, code: identified.code, connectionState: "unconfigured", ...(identified.gatewayId ? { gatewayId: identified.gatewayId } : {}), ...(identified.firmware ? { firmware: identified.firmware } : {}), location: location || project.location };
      project.panels.push(panel);
      state.selectedProjectId = project.id;
      state.selectedPanelId = panel.id;
      state.panelDirectoryPanelId = panel.id;
      state.panelDirectoryTab = "status";
      state.view = "panel-detail";
      closeSettingsModal();
      await saveApplicationStateNow({ workspace: true });
      renderApp();
      showToast(english ? `${name} was added to your panels.` : `پنل «${name}» به پنل‌های شما اضافه شد.`);
    });
  };
  document.body.appendChild(backdrop);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) closeSettingsModal(); });
  renderStep();
}

function renderWorkspace(project) {
  const panel = findPanel() || { id: "", name: state.language === "en" ? "No panel selected" : "پنلی انتخاب نشده", code: "—" };
  const collapsed = settingsMenuCollapsed();
  const shellClasses = ["workspace-shell", collapsed ? "" : "settings-menu-open"].filter(Boolean).join(" ");
  const layoutClasses = ["workspace-layout", collapsed ? "settings-tree-minimized" : ""].filter(Boolean).join(" ");
  return `<section class="workspace-breadcrumb"><button type="button" data-back-projects>${icons.chevronRight}پروژه‌ها</button>${icons.chevronLeft}<span>${project.name}</span>${icons.chevronLeft}<b>${panel.name}</b></section>${renderProjectStrip(project)}<section class="${shellClasses}">${renderPanelList(project, panel)}<section class="${layoutClasses}">${renderSettingsTree()}<main class="setting-detail-column">${renderSettingDetail(panel)}</main></section></section>`;
}

function renderApp() {
  const project = findProject();
  const content = document.querySelector("#content-root");
  if (!content) return;
  activeLanguage = state.language;
  const floorPlanCaption = document.querySelector("#floor-plan-nav-caption");
  const floorPlanNavLabel = document.querySelector("#floor-plan-nav-label");
  if (floorPlanCaption) floorPlanCaption.textContent = state.language === "en" ? "Devices and panels" : "تجهیزات و پنل‌ها";
  if (floorPlanNavLabel) floorPlanNavLabel.textContent = state.language === "en" ? "Floor Plan Layout" : "نقشه و چیدمان";
  if (state.view === "workspace" && !project) {
    state.view = "projects";
    state.selectedProjectId = null;
    state.selectedPanelId = null;
    state.connectedPanelId = null;
  }
  syncApplicationHistory();
  const isUserManagement = state.view === "user-management";
  const isActivityReport = state.view === "activity-report";
  const isPanelDirectory = state.view === "panels";
  const isPanelDetail = state.view === "panel-detail";
  const isWorkspace = state.view === "workspace" && Boolean(project);
  const isProjectImages = state.view === "project-images";
  const isTalk = state.view === "talk";
  const isFloorPlan = state.view === "floor-plans";
  const currentFloorPlanRoot = content.querySelector("#floor-plan-module");
  const preserveFloorPlan = isFloorPlan && Boolean(currentFloorPlanRoot);
  const detailEntry = isPanelDetail ? findPanelDirectoryEntry() : null;
  document.querySelector("#topbar-title").textContent = isUserManagement ? (state.language === "en" ? "User management" : "مدیریت کاربران") : isActivityReport ? (state.language === "en" ? "Activity report" : "گزارش فعالیت") : isTalk ? (state.language === "en" ? "Talk" : "صحبت") : isWorkspace ? project.name : isPanelDetail ? detailEntry?.panel.name || "مدیریت پنل" : isPanelDirectory ? "پنل‌های من" : isProjectImages ? (state.language === "en" ? "Project images" : "عکس‌های پروژه") : "پروژه‌ها";
  if (isFloorPlan) document.querySelector("#topbar-title").textContent = state.language === "en" ? "Floor Plan Layout" : "نقشه و چیدمان دیوایس‌ها";
  document.querySelector("#topbar-subtitle").textContent = isUserManagement ? (state.language === "en" ? "Manage accounts, projects, and access" : "مدیریت حساب‌ها، پروژه‌ها و دسترسی‌ها") : isActivityReport ? (state.language === "en" ? "Review sign-ins, access changes, and operations" : "بررسی ورودها، تغییرات دسترسی و عملیات انجام‌شده") : isTalk ? (state.language === "en" ? "Experimental ESP8266 command console" : "کنسول آزمایشی ارتباط با ESP8266") : isWorkspace ? `${project.panels.length} پنل · مدیریت تنظیمات و مانیتورینگ` : isPanelDetail ? `${detailEntry?.project.name || ""} · مدیریت وضعیت و رویدادها` : isPanelDirectory ? "مدیریت پنل‌ها بر اساس سایت و محل نصب" : isProjectImages ? (state.language === "en" ? "Add and update project card images" : "افزودن و تغییر تصویر کارت پروژه‌ها") : "پروژه‌ها و پنل‌های تحت مدیریت شما";
  if (isFloorPlan) document.querySelector("#topbar-subtitle").textContent = state.language === "en" ? "Place fire alarm devices on a PDF floor plan and export a vector-stamped copy." : "دیوایس‌های اعلام حریق را روی نقشه PDF قرار دهید و نسخهٔ برداری آن را خروجی بگیرید.";
  const hasSettingShortcut = state.view === "workspace" && [...document.querySelectorAll("[data-nav-setting]")].some((item) => item.dataset.navSetting === state.selectedSettingId);
  document.querySelectorAll("[data-nav-view]").forEach((item) => {
    const active = item.dataset.navView === state.view && (item.dataset.navSetting ? item.dataset.navSetting === state.selectedSettingId : !hasSettingShortcut);
    item.classList.toggle("active", active);
  });
  if (!isFloorPlan && currentFloorPlanRoot?._floorPlanCleanup) currentFloorPlanRoot._floorPlanCleanup();
  if (!preserveFloorPlan) {
    content.innerHTML = isFloorPlan ? `<section id="floor-plan-module"></section>` : isUserManagement ? renderUserManagement(state.language, sessionUser) : isActivityReport ? renderActivityReport(state.language) : isTalk ? renderTalkPage() : isWorkspace ? renderWorkspace(project) : isPanelDirectory ? renderPanelsPage() : isPanelDetail ? renderPanelDetailPage() : state.view === "project-images" ? renderProjectImagesPage() : renderProjectsPage();
  }
  if (!preserveFloorPlan && !isWorkspace && !isPanelDirectory && !isPanelDetail && !isTalk && !isUserManagement) {
    hydrateProjectCardImages(content);
    hydrateProjectGalleryImages(content);
  }
  if (!preserveFloorPlan) {
    restoreGenericSettingControls();
    bindViewEvents();
    const userManagementRoot = content.querySelector(".user-management-root");
    if (userManagementRoot) bindUserManagement(userManagementRoot, renderApp, state.language);
    const activityReportRoot = content.querySelector(".activity-report-root");
    if (activityReportRoot) bindActivityReport(activityReportRoot, renderApp, state.language);
  }
  if (isFloorPlan && !preserveFloorPlan) {
    const panelGroupSettings = {};
    const panelDevices = Object.fromEntries(projects.flatMap((item) => item.panels.map((panel) => {
      const saved = [...(state.savedSettingFiles || [])].filter((file) => file.panelId === panel.id && Array.isArray(file.snapshot?.loopCards)).sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))[0];
      const activeDevices = panel.id === state.selectedPanelId && Array.isArray(state.loopCards) ? state.loopCards : null;
      const activeHasDevices = activeDevices?.some((card) => Array.isArray(card.devices) && card.devices.length > 0);
      const savedDevices = saved?.snapshot?.loopCards;
      // Prefer the live registry for the active panel, but fall back to its saved
      // snapshot when the live settings have not loaded any devices yet.
      const devices = activeHasDevices ? activeDevices : savedDevices || activeDevices || [];
      return [panel.id, devices];
    })));
    const selectedPanelProject = projects.find((item) => item.panels.some((panel) => panel.id === state.selectedPanelId));
    const initialProjectId = selectedPanelProject?.id || projects.find((item) => item.id === state.selectedProjectId)?.id || "";
    const initialPanelId = selectedPanelProject ? state.selectedPanelId : "";
    const floorPlanDeviceIcons = Object.fromEntries(loopDeviceTypes.map(({ key }) => [key, deviceIconMarkup(key)]));
    const floorPlanDeviceIconUrls = Object.fromEntries(Object.entries(deviceIconFiles).map(([key, file]) => [key, `/icons/${file}`]));
    const floorPlanDeviceIconHoverUrls = Object.fromEntries([
      ...["smoke", "heat", "multi"].map((key) => [key, "/icons/detector-hover.svg"]),
      ["input", "/icons/MODULE-hover.webp"],
    ]);
    const floorPlanRoot = content.querySelector("#floor-plan-module");
    const panelEntries = projects.flatMap((project) => (project.panels || []).map((panel) => ({ project, panel })));
    void Promise.all(panelEntries.map(async ({ project, panel }) => {
      try {
        const result = await workspaceStore.loadPanelSettings(project.id, panel.id);
        panelDevices[panel.id] = result.settings?.loopCards || [];
        panelGroupSettings[panel.id] = result.settings || {};
      } catch { panelDevices[panel.id] = []; panelGroupSettings[panel.id] = {}; }
    })).then(() => import("./floor-plan.js")).then(({ mountFloorPlanModule }) => {
      if (!floorPlanRoot.isConnected || state.view !== "floor-plans" || content.querySelector("#floor-plan-module") !== floorPlanRoot) return;
      return mountFloorPlanModule(floorPlanRoot, { projects, panelDevices, panelGroupSettings, initialProjectId, initialPanelId, language: state.language, deviceIcons: floorPlanDeviceIcons, deviceIconUrls: floorPlanDeviceIconUrls, deviceIconHoverUrls: floorPlanDeviceIconHoverUrls, loopDeviceTypes, onDeviceAddressChange: updateFloorPlanDeviceAddress, onRegisterFloorPlanDevice: registerFloorPlanDevice });
    }).catch((error) => {
      if (floorPlanRoot.isConnected && state.view === "floor-plans") showToast(error.message, "error");
    });
  }
  if (isTalk) void bindTalkConsole(content);
  else if (talkRefreshTimer) { clearInterval(talkRefreshTimer); talkRefreshTimer = null; }
  if (isWorkspace) void loadSelectedPanelSettings();
  document.documentElement.lang = state.language === "en" ? "en" : "fa";
  document.documentElement.dir = state.language === "en" ? "ltr" : "rtl";
  updateConnectionStatus();
  updateSidebarState();
  translateUI(document.querySelector("#app"));
  document.querySelector("[data-notifications]")?.addEventListener("click", () => showToast(state.language === "en" ? "Notifications are up to date." : "اعلان جدیدی وجود ندارد.", "info"));
  document.querySelector("[data-upgrade-account]")?.addEventListener("click", () => showToast(state.language === "en" ? "The professional account upgrade is not configured yet." : "ارتقای حساب حرفه‌ای هنوز پیکربندی نشده است.", "info"));
  updateThemeButton();
  if (demoMode) content.insertAdjacentHTML("afterbegin", `<div class="demo-mode-banner" role="status">${state.language === "en" ? "Demo mode · read-only · no live panel connection" : "حالت دمو · فقط‌خواندنی · بدون اتصال به پنل واقعی"}</div>`);
  if (workspaceDataError) content.insertAdjacentHTML("afterbegin", `<div class="workspace-integrity-warning" role="alert"><b>${state.language === "en" ? "Workspace changes are paused" : "ذخیرهٔ فضای کاری متوقف شده است"}</b><span>${escapeHtml(workspaceDataError)}</span><small>${state.language === "en" ? "Stored data was preserved. Reload after resolving the conflict or having an administrator review the data." : "دادهٔ ذخیره‌شده حفظ شده است. پس از رفع تعارض یا بررسی داده توسط مدیر، صفحه را دوباره بارگذاری کنید."}</small><button type="button" class="btn-secondary" data-workspace-reload>${state.language === "en" ? "Reload workspace" : "بارگذاری دوباره"}</button></div>`);
  if (applicationSaveFailure && !workspaceDataError) content.insertAdjacentHTML("afterbegin", `<div class="save-error-banner" data-save-error-banner role="alert"><strong>${state.language === "en" ? "Changes were not saved" : "تغییرات ذخیره نشد"}</strong><span>${state.language === "en" ? "Your edits are still in this tab." : "تغییرات فعلی در همین صفحه نگه داشته شده‌اند."}</span><button type="button" class="btn-secondary" data-save-retry>${state.language === "en" ? "Retry save" : "تلاش دوباره"}</button></div>`);
  content.querySelector("[data-workspace-reload]")?.addEventListener("click", () => {
    const message = state.language === "en" ? "Reload the workspace? Unsaved changes in this tab will be lost." : "فضای کاری دوباره بارگذاری شود؟ تغییرات ذخیره‌نشده این صفحه از دست می‌روند.";
    if (window.confirm(message)) window.location.reload();
  });
  content.querySelector("[data-save-retry]")?.addEventListener("click", () => {
    applicationSaveFailure = false;
    void saveApplicationStateNow({ workspace: lastSaveWasWorkspace });
  });
  persistUiPreferences();
}

function renderCalendar() {
  if (!state.calendarOpen) return `<div class="calendar-popover hidden" id="calendar-popover"></div>`;
  const english = state.language === "en";
  const months = english ? englishMonthNames : monthNames;
  const days = english ? englishWeekDays : weekDays;
  const header = `<div class="calendar-header"><button class="calendar-nav" type="button" data-calendar-nav="prev" aria-label="${english ? "Previous" : "قبلی"}">${icons.chevronRight}</button><div class="calendar-title"><button type="button" class="calendar-select-button" data-calendar-view="months">${months[state.draftMonth - 1]}</button><button type="button" class="calendar-select-button year" data-calendar-view="years">${faDigits(state.draftYear)}</button></div><button class="calendar-nav" type="button" data-calendar-nav="next" aria-label="${english ? "Next" : "بعدی"}">${icons.chevronLeft}</button></div>`;
  const calendarActions = `<div class="calendar-actions"><button type="button" class="btn-ghost" data-date-cancel>${english ? "Cancel" : "انصراف"}</button><button type="button" class="btn-primary" data-date-confirm>${icons.check}${english ? "Confirm date" : "تأیید تاریخ"}</button></div>`;

  if (state.calendarMode === "months") {
    return `<div class="calendar-popover" id="calendar-popover" role="dialog" aria-label="${english ? "Select month" : "انتخاب ماه"}">${header}<div class="picker-grid month-picker">${months.map((month, index) => `<button type="button" class="picker-option${state.draftMonth === index + 1 ? " selected" : ""}" data-month-select="${index + 1}">${month}</button>`).join("")}</div><button class="today-button" type="button" data-today="true">${english ? "Today" : "امروز"}، ${faDigits(today[0])}/${faDigits(pad(today[1]))}/${faDigits(pad(today[2]))}</button>${calendarActions}</div>`;
  }

  if (state.calendarMode === "years") {
    const years = Array.from({ length: 12 }, (_, index) => state.calendarYearPage + index);
    return `<div class="calendar-popover" id="calendar-popover" role="dialog" aria-label="${english ? "Select year" : "انتخاب سال"}">${header}<div class="picker-grid year-picker">${years.map((year) => `<button type="button" class="picker-option${state.draftYear === year ? " selected" : ""}" data-year-select="${year}">${faDigits(year)}</button>`).join("")}</div><button class="today-button" type="button" data-today="true">${english ? "Today" : "امروز"}، ${faDigits(today[0])}/${faDigits(pad(today[1]))}/${faDigits(pad(today[2]))}</button>${calendarActions}</div>`;
  }

  const firstDay = new Date(`${toGregorian(state.draftYear, state.draftMonth, 1)}T12:00:00`).getDay();
  const saturdayIndex = (firstDay + 1) % 7;
  const cells = [];
  for (let i = 0; i < saturdayIndex; i++) cells.push(`<span class="calendar-day empty"></span>`);
  for (let day = 1; day <= daysInMonth(state.draftYear, state.draftMonth); day++) {
    const selected = day === state.draftDay ? " selected" : "";
    cells.push(`<button class="calendar-day${selected}" data-day="${day}" type="button">${faDigits(day)}</button>`);
  }
  return `<div class="calendar-popover" id="calendar-popover" role="dialog" aria-label="${english ? "Select date" : "انتخاب تاریخ"}">${header}<div class="week-row">${days.map((day) => `<span>${english ? day : day.slice(0, 2)}</span>`).join("")}</div><div class="days-grid">${cells.join("")}</div><button class="today-button" type="button" data-today="true">${english ? "Today" : "امروز"}، ${faDigits(today[0])}/${faDigits(pad(today[1]))}/${faDigits(pad(today[2]))}</button>${calendarActions}</div>`;
}

function renderHolidayCalendar() {
  if (!state.holidayCalendarOpen) return `<div class="calendar-popover hidden" id="holiday-calendar-popover"></div>`;
  const english = state.language === "en";
  const months = english ? englishMonthNames : monthNames;
  const days = english ? englishWeekDays : weekDays;
  const header = `<div class="calendar-header"><button class="calendar-nav" type="button" data-holiday-calendar-nav="prev" aria-label="${english ? "Previous" : "قبلی"}">${icons.chevronRight}</button><div class="calendar-title"><button type="button" class="calendar-select-button" data-holiday-calendar-view="months">${months[state.draftHolidayMonth - 1]}</button><button type="button" class="calendar-select-button year" data-holiday-calendar-view="years">${faDigits(state.draftHolidayYear)}</button></div><button class="calendar-nav" type="button" data-holiday-calendar-nav="next" aria-label="${english ? "Next" : "بعدی"}">${icons.chevronLeft}</button></div>`;
  const actions = `<div class="calendar-actions"><button type="button" class="btn-ghost" data-holiday-date-cancel>${english ? "Cancel" : "انصراف"}</button><button type="button" class="btn-primary" data-holiday-date-confirm>${icons.check}${english ? "Confirm date" : "تأیید تاریخ"}</button></div>`;
  const todayButton = `<button class="today-button" type="button" data-holiday-today="true">${english ? "Today" : "امروز"}، ${faDigits(today[0])}/${faDigits(pad(today[1]))}/${faDigits(pad(today[2]))}</button>`;
  if (state.holidayCalendarMode === "months") return `<div class="calendar-popover" id="holiday-calendar-popover" role="dialog" aria-label="${english ? "Select month" : "انتخاب ماه"}">${header}<div class="picker-grid month-picker">${months.map((month, index) => `<button type="button" class="picker-option${state.draftHolidayMonth === index + 1 ? " selected" : ""}" data-holiday-month-select="${index + 1}">${month}</button>`).join("")}</div>${todayButton}${actions}</div>`;
  if (state.holidayCalendarMode === "years") {
    const years = Array.from({ length: 12 }, (_, index) => state.holidayCalendarYearPage + index);
    return `<div class="calendar-popover" id="holiday-calendar-popover" role="dialog" aria-label="${english ? "Select year" : "انتخاب سال"}">${header}<div class="picker-grid year-picker">${years.map((year) => `<button type="button" class="picker-option${state.draftHolidayYear === year ? " selected" : ""}" data-holiday-year-select="${year}">${faDigits(year)}</button>`).join("")}</div>${todayButton}${actions}</div>`;
  }
  const firstDay = new Date(`${toGregorian(state.draftHolidayYear, state.draftHolidayMonth, 1)}T12:00:00`).getDay();
  const saturdayIndex = (firstDay + 1) % 7;
  const cells = [];
  for (let i = 0; i < saturdayIndex; i++) cells.push(`<span class="calendar-day empty"></span>`);
  for (let day = 1; day <= daysInMonth(state.draftHolidayYear, state.draftHolidayMonth); day++) {
    const selected = day === state.draftHolidayDay ? " selected" : "";
    cells.push(`<button class="calendar-day${selected}" data-holiday-day="${day}" type="button">${faDigits(day)}</button>`);
  }
  return `<div class="calendar-popover" id="holiday-calendar-popover" role="dialog" aria-label="${english ? "Select date" : "انتخاب تاریخ"}">${header}<div class="week-row">${days.map((day) => `<span>${english ? day : day.slice(0, 2)}</span>`).join("")}</div><div class="days-grid">${cells.join("")}</div>${todayButton}${actions}</div>`;
}

function renderNightTimePicker(kind, english) {
  if (state.nightTimeOpen !== kind) return `<div class="time-popover hidden" data-night-time-popover="${kind}"></div>`;
  const isStart = kind === "start";
  const hour = isStart ? state.draftNightStartHour : state.draftNightEndHour;
  const minute = isStart ? state.draftNightStartMinute : state.draftNightEndMinute;
  const wheel = (items, selected, field) => `<div class="wheel-viewport"><div class="wheel-options night-wheel ${field}-wheel" data-night-wheel="${field}"><span class="wheel-spacer" aria-hidden="true"></span>${items.map((value) => `<button type="button" class="time-option${selected === value ? " selected" : ""}" data-night-wheel-value="${value}">${faDigits(pad(value))}</button>`).join("")}<span class="wheel-spacer" aria-hidden="true"></span></div><div class="wheel-selection-band" aria-hidden="true"></div></div>`;
  return `<div class="time-popover night-time-popover" data-night-time-popover="${kind}" role="dialog" aria-label="${english ? "Select time" : "انتخاب ساعت"}"><div class="time-popover-head"><div><b>${english ? "Set time" : "تنظیم ساعت"}</b><small>${english ? "Scroll to the desired row" : "ردیف موردنظر را اسکرول کنید"}</small></div><strong data-night-draft-time="${kind}">${faDigits(pad(hour))}:${faDigits(pad(minute))}</strong></div><div class="time-picker-columns"><div class="time-picker-column"><label>${english ? "Hour" : "ساعت"}</label>${wheel(Array.from({ length: 24 }, (_, value) => value), hour, `${kind}-hour`)}</div><div class="time-picker-column"><label>${english ? "Minute" : "دقیقه"}</label>${wheel(Array.from({ length: 60 }, (_, value) => value), minute, `${kind}-minute`)}</div></div><div class="time-popover-actions"><button type="button" class="btn-ghost" data-night-time-cancel>${english ? "Cancel" : "انصراف"}</button><button type="button" class="btn-primary" data-night-time-confirm>${icons.check}${english ? "Confirm time" : "تأیید ساعت"}</button></div></div>`;
}

function renderTimePicker() {
  if (!state.timeOpen) return `<div class="time-popover hidden" id="time-popover"></div>`;
  const english = state.language === "en";
  const minuteOptions = Array.from({ length: 60 }, (_, minute) => minute);
  const wheel = (items, selected, attribute, type) => `<div class="wheel-viewport"><div class="wheel-options ${type}-wheel" data-wheel-type="${type}" data-selected="${selected}"><span class="wheel-spacer" aria-hidden="true"></span>${items.map((value) => `<button type="button" class="time-option${selected === value ? " selected" : ""}" data-${attribute}="${value}">${faDigits(pad(value))}</button>`).join("")}<span class="wheel-spacer" aria-hidden="true"></span></div><div class="wheel-selection-band" aria-hidden="true"></div></div>`;
  return `<div class="time-popover" id="time-popover" role="dialog" aria-label="${english ? "Select time" : "انتخاب ساعت"}"><div class="time-popover-head"><div><b>${english ? "Set panel time" : "انتخاب ساعت پنل"}</b><small>${english ? "Scroll to the desired row" : "ردیف موردنظر را اسکرول کنید"}</small></div><strong id="draft-time">${faDigits(pad(state.draftHour))}:${faDigits(pad(state.draftMinute))}</strong></div><div class="time-picker-columns"><div class="time-picker-column"><label>${english ? "Hour" : "ساعت"}</label>${wheel(Array.from({ length: 24 }, (_, hour) => hour), state.draftHour, "hour", "hour")}</div><div class="time-picker-column"><label>${english ? "Minute" : "دقیقه"}</label>${wheel(minuteOptions, state.draftMinute, "minute", "minute")}</div></div><div class="time-popover-actions"><button type="button" class="btn-ghost" data-time-cancel>${english ? "Cancel" : "انصراف"}</button><button type="button" class="btn-primary" data-time-confirm>${icons.check}${english ? "Confirm time" : "تأیید ساعت"}</button></div></div>`;
}

function showToast(message, tone = "success") {
  const toast = document.querySelector("#toast");
  toast.className = `toast ${tone}`;
  toast.innerHTML = `${tone === "success" ? icons.check : icons.wifi}<span>${message}</span>`;
  requestAnimationFrame(() => toast.classList.add("show"));
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3600);
}
window.addEventListener("app:toast", (event) => {
  const detail = event.detail || {};
  showToast(escapeHtml(String(detail.message || "")), detail.tone || "success");
});
function updateSummary() {
  const dateInput = document.querySelector("#date-input");
  const timeInput = document.querySelector("#time-input");
  const summary = document.querySelector("#selection-summary");
  if (dateInput) dateInput.value = `${faDigits(state.year)}/${faDigits(pad(state.month))}/${faDigits(pad(state.day))}`;
  if (timeInput) timeInput.value = `${faDigits(pad(state.hour))}:${faDigits(pad(state.minute))}`;
  if (summary) summary.textContent = `${faDigits(state.year)}/${faDigits(pad(state.month))}/${faDigits(pad(state.day))}${state.language === "en" ? ", time " : "، ساعت "}${faDigits(pad(state.hour))}:${faDigits(pad(state.minute))}`;
  const gregorian = document.querySelector("#gregorian-summary");
  if (gregorian) gregorian.textContent = `${state.language === "en" ? "Gregorian equivalent: " : "معادل میلادی: "}${toGregorian(state.year, state.month, state.day)}`;
}
function redrawCalendar() {
  const wrapper = document.querySelector(".date-field-wrap");
  if (!wrapper) return;
  const old = wrapper.querySelector("#calendar-popover");
  old?.remove();
  wrapper.insertAdjacentHTML("beforeend", renderCalendar());
  document.querySelector("#date-input")?.setAttribute("aria-expanded", String(state.calendarOpen));
}
function redrawTimePicker() {
  const wrapper = document.querySelector(".time-field-wrap");
  if (!wrapper) return;
  const old = wrapper.querySelector("#time-popover");
  old?.remove();
  wrapper.insertAdjacentHTML("beforeend", renderTimePicker());
  document.querySelector("#time-input")?.setAttribute("aria-expanded", String(state.timeOpen));
  if (state.timeOpen) requestAnimationFrame(() => {
    const hourWheel = document.querySelector(".hour-wheel");
    const minuteWheel = document.querySelector(".minute-wheel");
    setWheelPosition(hourWheel, state.draftHour);
    setWheelPosition(minuteWheel, state.draftMinute);
    bindWheel(hourWheel, "hour");
    bindWheel(minuteWheel, "minute");
  });
}

function setWheelPosition(wheel, value) {
  if (!wheel) return;
  const option = wheel.querySelector(`[data-${wheel.dataset.wheelType}="${value}"]`);
  if (option) wheel.scrollTop = option.offsetTop - (wheel.clientHeight - option.offsetHeight) / 2;
}

function updateWheelDraft(type, value) {
  if (type === "hour") state.draftHour = value;
  if (type === "minute") state.draftMinute = value;
  const wheel = document.querySelector(`.${type}-wheel`);
  wheel?.querySelectorAll(".time-option").forEach((option) => option.classList.toggle("selected", Number(option.dataset[type]) === value));
  const draftTime = document.querySelector("#draft-time");
  if (draftTime) draftTime.textContent = `${faDigits(pad(state.draftHour))}:${faDigits(pad(state.draftMinute))}`;
}

function getCenteredWheelValue(wheel) {
  if (!wheel) return null;
  const center = wheel.scrollTop + wheel.clientHeight / 2;
  let closest = null;
  let distance = Infinity;
  wheel.querySelectorAll(".time-option").forEach((option) => {
    const optionCenter = option.offsetTop + option.offsetHeight / 2;
    const currentDistance = Math.abs(optionCenter - center);
    if (currentDistance < distance) { closest = option; distance = currentDistance; }
  });
  return closest ? Number(closest.dataset[wheel.dataset.wheelType]) : null;
}

function bindWheel(wheel, type) {
  if (!wheel) return;
  let scrollTimer;
  wheel.addEventListener("scroll", () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const value = getCenteredWheelValue(wheel);
      if (value !== null) updateWheelDraft(type, value);
    }, 70);
  }, { passive: true });
}
function changeMonth(delta) {
  state.calendarOpen = true;
  state.calendarMode = "days";
  state.draftMonth += delta;
  if (state.draftMonth === 13) { state.draftMonth = 1; state.draftYear += 1; }
  if (state.draftMonth === 0) { state.draftMonth = 12; state.draftYear -= 1; }
  state.draftDay = Math.min(state.draftDay, daysInMonth(state.draftYear, state.draftMonth));
  state.calendarYearPage = Math.floor(state.draftYear / 12) * 12;
  redrawCalendar();
}

function openDatePicker() {
  state.draftYear = state.year;
  state.draftMonth = state.month;
  state.draftDay = state.day;
  state.calendarYearPage = Math.floor(state.draftYear / 12) * 12;
  state.calendarMode = "days";
  state.calendarOpen = true;
}

function confirmDate() {
  state.year = state.draftYear;
  state.month = state.draftMonth;
  state.day = state.draftDay;
  state.calendarOpen = false;
  state.calendarMode = "days";
  redrawCalendar();
  updateSummary();
  showToast("تاریخ جدید انتخاب شد.");
}

function cancelDate() {
  state.draftYear = state.year;
  state.draftMonth = state.month;
  state.draftDay = state.day;
  state.calendarOpen = false;
  state.calendarMode = "days";
  redrawCalendar();
}
function updateThemeButton() {
  const button = document.querySelector("#theme-toggle");
  if (!button) return;
  const dark = document.documentElement.classList.contains("dark");
  button.innerHTML = dark ? icons.sun : icons.moon;
  const english = state.language === "en";
  button.setAttribute("aria-label", dark ? (english ? "Switch to light mode" : "فعال‌سازی حالت روشن") : (english ? "Switch to dark mode" : "فعال‌سازی حالت تاریک"));
  button.title = dark ? (english ? "Light mode" : "حالت روشن") : (english ? "Dark mode" : "حالت تاریک");
}
function bindDateTimeEvents() {
  const $ = (selector) => document.querySelector(selector);
  const dateInput = $("#date-input");
  const dateField = $(".date-field-wrap");
  const timeField = $(".time-field-wrap");
  if (!dateInput || !dateField || !timeField) return;

  dateInput.addEventListener("click", () => {
    if (state.timeOpen) { showToast("ابتدا ساعت را تأیید یا لغو کنید.", "info"); return; }
    if (!state.calendarOpen) openDatePicker();
    redrawCalendar();
  });
  dateField.addEventListener("click", (event) => {
    const dayButton = event.target.closest("[data-day]");
    const calendarView = event.target.closest("[data-calendar-view]");
    const calendarNav = event.target.closest("[data-calendar-nav]");
    const monthSelect = event.target.closest("[data-month-select]");
    const yearSelect = event.target.closest("[data-year-select]");
    const todayButton = event.target.closest("[data-today]");
    const dateConfirm = event.target.closest("[data-date-confirm]");
    const dateCancel = event.target.closest("[data-date-cancel]");
    if (dayButton) { state.draftDay = Number(dayButton.dataset.day); redrawCalendar(); }
    if (calendarView) {
      state.calendarMode = calendarView.dataset.calendarView;
      if (state.calendarMode === "years") state.calendarYearPage = Math.floor(state.draftYear / 12) * 12;
      redrawCalendar();
    }
    if (calendarNav) {
      if (state.calendarMode === "years") {
        state.calendarYearPage += calendarNav.dataset.calendarNav === "next" ? 12 : -12;
        redrawCalendar();
      } else if (state.calendarMode === "months") {
        state.draftYear += calendarNav.dataset.calendarNav === "next" ? 1 : -1;
        state.draftDay = Math.min(state.draftDay, daysInMonth(state.draftYear, state.draftMonth));
        state.calendarYearPage = Math.floor(state.draftYear / 12) * 12;
        redrawCalendar();
      } else changeMonth(calendarNav.dataset.calendarNav === "next" ? 1 : -1);
    }
    if (monthSelect) { state.draftMonth = Number(monthSelect.dataset.monthSelect); state.draftDay = Math.min(state.draftDay, daysInMonth(state.draftYear, state.draftMonth)); state.calendarMode = "days"; redrawCalendar(); }
    if (yearSelect) { state.draftYear = Number(yearSelect.dataset.yearSelect); state.draftDay = Math.min(state.draftDay, daysInMonth(state.draftYear, state.draftMonth)); state.calendarYearPage = Math.floor(state.draftYear / 12) * 12; state.calendarMode = "days"; redrawCalendar(); }
    if (todayButton) { [state.draftYear, state.draftMonth, state.draftDay] = today; state.calendarMode = "days"; redrawCalendar(); }
    if (dateConfirm) confirmDate();
    if (dateCancel) cancelDate();
  });
  timeField.addEventListener("click", (event) => {
    const hourOption = event.target.closest("[data-hour]");
    const minuteOption = event.target.closest("[data-minute]");
    const confirmButton = event.target.closest("[data-time-confirm]");
    const cancelButton = event.target.closest("[data-time-cancel]");
    if (event.target.closest("#time-input")) {
      if (state.calendarOpen) { showToast("ابتدا تاریخ را تأیید یا لغو کنید.", "info"); return; }
      if (!state.timeOpen) { state.draftHour = state.hour; state.draftMinute = state.minute; state.timeOpen = true; }
      redrawTimePicker();
    }
    if (hourOption) { hourOption.scrollIntoView({ block: "center", behavior: "smooth" }); updateWheelDraft("hour", Number(hourOption.dataset.hour)); }
    if (minuteOption) { minuteOption.scrollIntoView({ block: "center", behavior: "smooth" }); updateWheelDraft("minute", Number(minuteOption.dataset.minute)); }
    if (confirmButton) { state.hour = state.draftHour; state.minute = state.draftMinute; state.timeOpen = false; redrawTimePicker(); updateSummary(); showToast("ساعت جدید انتخاب شد."); }
    if (cancelButton) { state.draftHour = state.hour; state.draftMinute = state.minute; state.timeOpen = false; redrawTimePicker(); }
  });
}

function updateNightDraftValue(field, value) {
  const [kind, unit] = field.split("-");
  if (kind === "start" && unit === "hour") state.draftNightStartHour = value;
  if (kind === "start" && unit === "minute") state.draftNightStartMinute = value;
  if (kind === "end" && unit === "hour") state.draftNightEndHour = value;
  if (kind === "end" && unit === "minute") state.draftNightEndMinute = value;
  const hour = kind === "start" ? state.draftNightStartHour : state.draftNightEndHour;
  const minute = kind === "start" ? state.draftNightStartMinute : state.draftNightEndMinute;
  const root = document.querySelector(".night-settings-root");
  root?.querySelector(`[data-night-draft-time="${kind}"]`)?.replaceChildren(document.createTextNode(`${faDigits(pad(hour))}:${faDigits(pad(minute))}`));
  root?.querySelectorAll(`[data-night-wheel="${field}"] .time-option`).forEach((option) => option.classList.toggle("selected", Number(option.dataset.nightWheelValue) === value));
}

function setNightWheelPosition(wheel, value) {
  if (!wheel) return;
  const option = wheel.querySelector(`[data-night-wheel-value="${value}"]`);
  if (option) wheel.scrollTop = option.offsetTop - (wheel.clientHeight - option.offsetHeight) / 2;
}

function getCenteredNightWheelValue(wheel) {
  if (!wheel) return null;
  const center = wheel.scrollTop + wheel.clientHeight / 2;
  let closest = null;
  let distance = Infinity;
  wheel.querySelectorAll(".time-option").forEach((option) => {
    const optionCenter = option.offsetTop + option.offsetHeight / 2;
    const currentDistance = Math.abs(optionCenter - center);
    if (currentDistance < distance) { closest = option; distance = currentDistance; }
  });
  return closest ? Number(closest.dataset.nightWheelValue) : null;
}

function bindNightWheel(wheel) {
  if (!wheel) return;
  let scrollTimer;
  wheel.addEventListener("scroll", () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const value = getCenteredNightWheelValue(wheel);
      if (value !== null) updateNightDraftValue(wheel.dataset.nightWheel, value);
    }, 70);
  }, { passive: true });
}

function redrawNightSetting() {
  const root = document.querySelector(".night-settings-root");
  if (!root) return;
  root.outerHTML = renderNightSetting();
  bindNightSettingEvents();
}

function resetNightSettings() {
  state.dailyDayNightEnabled = false;
  state.nightStartHour = 22;
  state.nightStartMinute = 0;
  state.nightEndHour = 7;
  state.nightEndMinute = 0;
  state.weekendEnabled = false;
  state.weekendDay1 = "friday";
  state.weekendDay2 = "thursday";
  state.holidayEnabled = false;
  state.nightTimeOpen = null;
  state.holidayCalendarOpen = false;
  state.holidayCalendarMode = "days";
  state.holidayYear = today[0];
  state.holidayMonth = 1;
  state.holidayDay = 1;
  state.draftHolidayYear = today[0];
  state.draftHolidayMonth = 1;
  state.draftHolidayDay = 1;
  state.selectedHolidayIndex = 0;
  state.holidayDates = [];
}

function bindNightSettingEvents() {
  const root = document.querySelector(".night-settings-root");
  if (!root) return;
  const connected = true;
  root.querySelectorAll("[data-night-toggle]").forEach((input) => input.addEventListener("change", () => {
    if (!connected) return;
    if (input.dataset.nightToggle === "daily") state.dailyDayNightEnabled = input.checked;
    if (input.dataset.nightToggle === "weekend") state.weekendEnabled = input.checked;
    if (input.dataset.nightToggle === "holiday") state.holidayEnabled = input.checked;
    redrawNightSetting();
  }));
  root.querySelectorAll("[data-weekend-day]").forEach((select) => select.addEventListener("change", () => {
    if (select.dataset.weekendDay === "1") state.weekendDay1 = select.value;
    if (select.dataset.weekendDay === "2") state.weekendDay2 = select.value;
  }));
  root.querySelectorAll("[data-night-time-input]").forEach((input) => input.addEventListener("click", () => {
    if (!connected) return;
    const kind = input.dataset.nightTimeInput;
    state.nightTimeOpen = kind;
    state.holidayCalendarOpen = false;
    if (kind === "start") { state.draftNightStartHour = state.nightStartHour; state.draftNightStartMinute = state.nightStartMinute; }
    if (kind === "end") { state.draftNightEndHour = state.nightEndHour; state.draftNightEndMinute = state.nightEndMinute; }
    redrawNightSetting();
  }));
  root.querySelectorAll(".night-wheel").forEach((wheel) => {
    bindNightWheel(wheel);
    const fieldParts = wheel.dataset.nightWheel.split("-");
    const kind = fieldParts[0];
    const unit = fieldParts[1];
    const value = kind === "start" ? (unit === "hour" ? state.draftNightStartHour : state.draftNightStartMinute) : (unit === "hour" ? state.draftNightEndHour : state.draftNightEndMinute);
    setNightWheelPosition(wheel, value);
  });
  root.addEventListener("click", (event) => {
    const wheelOption = event.target.closest("[data-night-wheel-value]");
    const wheel = event.target.closest(".night-wheel");
    const confirmTime = event.target.closest("[data-night-time-confirm]");
    const cancelTime = event.target.closest("[data-night-time-cancel]");
    const holidayInput = event.target.closest("[data-holiday-date-input]");
    const holidayDay = event.target.closest("[data-holiday-day]");
    const holidayView = event.target.closest("[data-holiday-calendar-view]");
    const holidayNav = event.target.closest("[data-holiday-calendar-nav]");
    const holidayMonth = event.target.closest("[data-holiday-month-select]");
    const holidayYear = event.target.closest("[data-holiday-year-select]");
    const holidayToday = event.target.closest("[data-holiday-today]");
    const holidayConfirm = event.target.closest("[data-holiday-date-confirm]");
    const holidayCancel = event.target.closest("[data-holiday-date-cancel]");
    const holidaySelect = event.target.closest("[data-holiday-select]");
    const holidayAdd = event.target.closest("[data-holiday-add]");
    const holidayDelete = event.target.closest("[data-holiday-delete]");
    const deleteAll = event.target.closest("[data-night-delete-all]");
    if (wheelOption && wheel) { updateNightDraftValue(wheel.dataset.nightWheel, Number(wheelOption.dataset.nightWheelValue)); wheelOption.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
    if (confirmTime && connected) {
      if (state.nightTimeOpen === "start") { state.nightStartHour = state.draftNightStartHour; state.nightStartMinute = state.draftNightStartMinute; }
      if (state.nightTimeOpen === "end") { state.nightEndHour = state.draftNightEndHour; state.nightEndMinute = state.draftNightEndMinute; }
      state.nightTimeOpen = null; redrawNightSetting(); return;
    }
    if (cancelTime) { state.nightTimeOpen = null; redrawNightSetting(); return; }
    if (deleteAll && connected) {
      const message = state.language === "en" ? "Delete all day/night settings and holiday dates?" : "همه تنظیمات شب و روز و تاریخ‌های تعطیلات حذف شود؟";
      if (!window.confirm(message)) return;
      resetNightSettings();
      redrawNightSetting();
      showToast(state.language === "en" ? "All day/night settings were deleted." : "تمام تنظیمات شب و روز حذف شد.", "info");
      return;
    }
    if (holidayInput && connected) {
      state.nightTimeOpen = null; state.holidayCalendarOpen = true; state.holidayCalendarMode = "days"; state.draftHolidayYear = state.holidayYear; state.draftHolidayMonth = state.holidayMonth; state.draftHolidayDay = state.holidayDay; state.holidayCalendarYearPage = Math.floor(state.draftHolidayYear / 12) * 12; redrawNightSetting(); return;
    }
    if (holidayDay) { state.draftHolidayDay = Number(holidayDay.dataset.holidayDay); redrawNightSetting(); return; }
    if (holidayView) { state.holidayCalendarMode = holidayView.dataset.holidayCalendarView; if (state.holidayCalendarMode === "years") state.holidayCalendarYearPage = Math.floor(state.draftHolidayYear / 12) * 12; redrawNightSetting(); return; }
    if (holidayNav) {
      const direction = holidayNav.dataset.holidayCalendarNav === "next" ? 1 : -1;
      if (state.holidayCalendarMode === "years") state.holidayCalendarYearPage += direction * 12;
      else if (state.holidayCalendarMode === "months") state.draftHolidayYear += direction;
      else { state.draftHolidayMonth += direction; if (state.draftHolidayMonth === 13) { state.draftHolidayMonth = 1; state.draftHolidayYear += 1; } if (state.draftHolidayMonth === 0) { state.draftHolidayMonth = 12; state.draftHolidayYear -= 1; } state.draftHolidayDay = Math.min(state.draftHolidayDay, daysInMonth(state.draftHolidayYear, state.draftHolidayMonth)); }
      redrawNightSetting(); return;
    }
    if (holidayMonth) { state.draftHolidayMonth = Number(holidayMonth.dataset.holidayMonthSelect); state.draftHolidayDay = Math.min(state.draftHolidayDay, daysInMonth(state.draftHolidayYear, state.draftHolidayMonth)); state.holidayCalendarMode = "days"; redrawNightSetting(); return; }
    if (holidayYear) { state.draftHolidayYear = Number(holidayYear.dataset.holidayYearSelect); state.draftHolidayDay = Math.min(state.draftHolidayDay, daysInMonth(state.draftHolidayYear, state.draftHolidayMonth)); state.holidayCalendarMode = "days"; state.holidayCalendarYearPage = Math.floor(state.draftHolidayYear / 12) * 12; redrawNightSetting(); return; }
    if (holidayToday) { [state.draftHolidayYear, state.draftHolidayMonth, state.draftHolidayDay] = today; state.holidayCalendarMode = "days"; redrawNightSetting(); return; }
    if (holidayConfirm) { state.holidayYear = state.draftHolidayYear; state.holidayMonth = state.draftHolidayMonth; state.holidayDay = state.draftHolidayDay; state.holidayCalendarOpen = false; state.holidayCalendarMode = "days"; redrawNightSetting(); return; }
    if (holidayCancel) { state.draftHolidayYear = state.holidayYear; state.draftHolidayMonth = state.holidayMonth; state.draftHolidayDay = state.holidayDay; state.holidayCalendarOpen = false; state.holidayCalendarMode = "days"; redrawNightSetting(); return; }
    if (holidaySelect && connected) { const index = Number(holidaySelect.dataset.holidaySelect); const selected = state.holidayDates[index]; if (selected) { state.selectedHolidayIndex = index; state.holidayYear = selected.year; state.holidayMonth = selected.month; state.holidayDay = selected.day; } redrawNightSetting(); return; }
    if (holidayAdd && connected) {
      const exists = state.holidayDates.some((holiday) => holiday.year === state.holidayYear && holiday.month === state.holidayMonth && holiday.day === state.holidayDay);
      if (exists) { showToast(state.language === "en" ? "This holiday date is already in the list." : "این تاریخ قبلاً در فهرست تعطیلات وجود دارد.", "info"); return; }
      state.holidayDates.push({ year: state.holidayYear, month: state.holidayMonth, day: state.holidayDay }); state.selectedHolidayIndex = state.holidayDates.length - 1; redrawNightSetting(); return;
    }
    if (holidayDelete && connected) {
      if (!state.holidayDates.length) return;
      state.holidayDates.splice(state.selectedHolidayIndex, 1); state.selectedHolidayIndex = Math.max(0, Math.min(state.selectedHolidayIndex, state.holidayDates.length - 1));
      const selected = state.holidayDates[state.selectedHolidayIndex]; if (selected) { state.holidayYear = selected.year; state.holidayMonth = selected.month; state.holidayDay = selected.day; }
      redrawNightSetting();
    }
  });
}

function closeSettingsModal() {
  document.querySelector(".settings-modal-backdrop")?.remove();
}


function showProjectDialog() {
  closeSettingsModal();
  const english = state.language === "en";
  const backdrop = document.createElement("div");
  let projectImageReadPromise = Promise.resolve("");
  backdrop.className = "settings-modal-backdrop entity-modal-backdrop";
  backdrop.innerHTML = '<div class="settings-modal-card entity-modal-card" role="dialog" aria-modal="true">'
    + '<div class="settings-modal-head entity-modal-heading"><div class="helper-icon">' + icons.project + '</div><div><span class="eyebrow">' + (english ? "PROJECT SETUP" : "تعریف پروژه") + '</span><h3>' + (english ? "Create project" : "ایجاد پروژه") + '</h3><p>' + (english ? "Define the project, its visual identity and location. You can add panels in the next step." : "مشخصات پروژه، تصویر و موقعیت را تعریف کنید؛ افزودن پنل در مرحله بعد انجام می‌شود.") + '</p></div></div>'
    + '<div class="settings-modal-form entity-modal-grid">'
    + '<label class="entity-field-wide">' + (english ? "Project name" : "نام پروژه") + '<input type="text" data-project-modal-name autofocus></label>'
    + '<label>' + (english ? "Project type" : "نوع پروژه") + '<input type="text" data-project-modal-type placeholder="' + (english ? "Office, hotel, factory..." : "مثلاً مجتمع اداری") + '"></label>'
    + '<label>' + (english ? "Project image" : "تصویر پروژه") + '<input type="file" data-project-modal-image accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp"><small class="field-hint">' + (english ? "PNG, JPG, WebP or AVIF · max 2 MB" : "PNG، JPG، WebP یا AVIF · حداکثر ۲ مگابایت") + '</small></label>'
    + '<label class="entity-field-wide">' + (english ? "Location title" : "عنوان موقعیت") + '<input type="text" data-project-modal-location placeholder="' + (english ? "Address or site description" : "آدرس یا توضیح محل پروژه") + '"></label>'
    + '<div class="project-image-preview-wrap entity-field-wide"><div class="project-image-preview" data-project-image-preview><span>' + icons.project + '</span><small>' + (english ? "Project image preview" : "پیش‌نمایش تصویر پروژه") + '</small></div></div>'
    + '<div class="project-map-picker entity-field-wide" data-project-map><div class="project-map-grid"></div><div class="project-map-copy"><span class="map-pin">' + icons.project + '</span><b>' + (english ? "Choose project location" : "موقعیت پروژه را روی نقشه تعیین کنید") + '</b><small>' + (english ? "Map API can be connected later. Click anywhere to place the marker." : "API نقشه بعداً قابل اتصال است؛ برای تعیین نقطه روی نقشه کلیک کنید.") + '</small></div><span class="project-map-marker" data-project-map-marker hidden>' + icons.project + '</span></div>'
    + '<label>' + (english ? "Latitude" : "عرض جغرافیایی") + '<input type="number" step="0.000001" min="-90" max="90" data-project-modal-latitude placeholder="35.689200" dir="ltr"></label>'
    + '<label>' + (english ? "Longitude" : "طول جغرافیایی") + '<input type="number" step="0.000001" min="-180" max="180" data-project-modal-longitude placeholder="51.389000" dir="ltr"></label>'
    + '</div><div class="settings-modal-actions"><button type="button" class="btn-secondary" data-entity-modal-cancel>' + (english ? "Cancel" : "انصراف") + '</button><button type="button" class="btn-primary" data-project-modal-confirm>' + icons.plus + (english ? "Create project" : "ایجاد پروژه") + '</button></div></div>';
  document.body.appendChild(backdrop);
  backdrop.querySelector(".entity-modal-heading .helper-icon")?.remove();
  backdrop.querySelector(".entity-modal-heading .eyebrow")?.remove();
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) closeSettingsModal(); });
  backdrop.querySelector("[data-entity-modal-cancel]")?.addEventListener("click", closeSettingsModal);
  const updateMapMarker = () => {
    const latitude = Number(backdrop.querySelector("[data-project-modal-latitude]")?.value);
    const longitude = Number(backdrop.querySelector("[data-project-modal-longitude]")?.value);
    const marker = backdrop.querySelector("[data-project-map-marker]");
    if (!marker || !Number.isFinite(latitude) || !Number.isFinite(longitude)) { marker?.setAttribute("hidden", ""); return; }
    marker.style.left = `${((longitude + 180) / 360) * 100}%`;
    marker.style.top = `${((90 - latitude) / 180) * 100}%`;
    marker.removeAttribute("hidden");
  };
  backdrop.querySelector("[data-project-modal-image]")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      event.target.value = "";
      showToast(english ? "Choose an image smaller than 2 MB." : "یک تصویر معتبر کوچک‌تر از ۲ مگابایت انتخاب کنید.", "info");
      return;
    }
    const reader = new FileReader();
    let resolveProjectImage;
    projectImageReadPromise = new Promise((resolve) => {
      resolveProjectImage = resolve;
      reader.addEventListener("error", () => resolve(""), { once: true });
      reader.addEventListener("abort", () => resolve(""), { once: true });
    });
    reader.addEventListener("load", () => {
      if (!isSafeImageData(reader.result)) {
        resolveProjectImage?.("");
        showToast(english ? "This image format is not supported. Use PNG, JPG, WebP or AVIF." : "این فرمت تصویر پشتیبانی نمی‌شود. از PNG، JPG، WebP یا AVIF استفاده کنید.", "info");
        return;
      }
      backdrop.dataset.projectImage = reader.result;
      resolveProjectImage?.(reader.result);
      projectImageReadPromise = Promise.resolve(reader.result);
      const preview = backdrop.querySelector("[data-project-image-preview]");
      if (preview) preview.innerHTML = `<img src="${escapeHtml(reader.result)}" alt="${english ? "Project preview" : "پیش‌نمایش پروژه"}"><button type="button" class="project-image-remove" data-project-image-remove aria-label="${english ? "Remove image" : "حذف تصویر"}">${icons.x}</button>`;
    });
    reader.readAsDataURL(file);
  });
  backdrop.addEventListener("click", (event) => {
    if (event.target.closest("[data-project-image-remove]")) {
      delete backdrop.dataset.projectImage;
      projectImageReadPromise = Promise.resolve("");
      const input = backdrop.querySelector("[data-project-modal-image]");
      if (input) input.value = "";
      const preview = backdrop.querySelector("[data-project-image-preview]");
      if (preview) preview.innerHTML = `<span>${icons.project}</span><small>${english ? "Project image preview" : "پیش‌نمایش تصویر پروژه"}</small>`;
    }
  });
  backdrop.querySelector("[data-project-map]")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-project-image-remove]")) return;
    const map = event.currentTarget;
    const rect = map.getBoundingClientRect();
    const longitude = Math.max(-180, Math.min(180, -180 + ((event.clientX - rect.left) / rect.width) * 360));
    const latitude = Math.max(-90, Math.min(90, 90 - ((event.clientY - rect.top) / rect.height) * 180));
    const latitudeInput = backdrop.querySelector("[data-project-modal-latitude]");
    const longitudeInput = backdrop.querySelector("[data-project-modal-longitude]");
    if (latitudeInput) latitudeInput.value = latitude.toFixed(6);
    if (longitudeInput) longitudeInput.value = longitude.toFixed(6);
    updateMapMarker();
  });
  backdrop.querySelectorAll("[data-project-modal-latitude], [data-project-modal-longitude]").forEach((input) => input.addEventListener("input", updateMapMarker));
  backdrop.querySelector("[data-project-modal-name]")?.focus();
  backdrop.querySelector("[data-project-modal-confirm]")?.addEventListener("click", async () => {
    const projectImage = await projectImageReadPromise;
    const name = backdrop.querySelector("[data-project-modal-name]")?.value.trim();
    const type = backdrop.querySelector("[data-project-modal-type]")?.value.trim() || (english ? "Project" : "پروژه");
    const location = backdrop.querySelector("[data-project-modal-location]")?.value.trim() || (english ? "Not specified" : "موقعیت ثبت نشده");
    const latitudeValue = backdrop.querySelector("[data-project-modal-latitude]")?.value.trim();
    const longitudeValue = backdrop.querySelector("[data-project-modal-longitude]")?.value.trim();
    if (!name) {
      backdrop.querySelector("[data-project-modal-name]")?.focus();
      showToast(english ? "Enter a project name first." : "ابتدا نام پروژه را وارد کنید.", "info");
      return;
    }
    if (projects.some((project) => project.name.trim().toLowerCase() === name.toLowerCase())) {
      backdrop.querySelector("[data-project-modal-name]")?.focus();
      showToast(english ? "A project with this name already exists." : "پروژه‌ای با این نام از قبل وجود دارد.", "info");
      return;
    }
    const projectId = createEntityId("project");
    const project = {
      id: projectId,
      name,
      location,
      type,
      image: isSafeImageData(projectImage) ? projectImage : (isSafeImageData(backdrop.dataset.projectImage) ? backdrop.dataset.projectImage : ""),
      coordinates: latitudeValue !== "" && longitudeValue !== "" && Number.isFinite(Number(latitudeValue)) && Number.isFinite(Number(longitudeValue))
        ? { lat: Number(latitudeValue), lng: Number(longitudeValue), address: location }
        : { lat: null, lng: null, address: location },
      panels: [],
      images: isSafeImageData(projectImage) ? [{ id: `${projectId}-cover`, src: projectImage, name: "", createdAt: new Date().toISOString() }] : [],
    };
    projects.push(project);
    state.selectedProjectId = project.id;
    state.selectedPanelId = null;
    state.connectedPanelId = null;
    state.view = "workspace";
    state.selectedSettingId = "date-time";
    state.projectMenuOpen = false;
    state.panelMenuOpen = false;
    state.settingsTreeCollapsed = true;
    const confirmButton = backdrop.querySelector("[data-project-modal-confirm]");
    if (confirmButton) confirmButton.disabled = true;
    closeSettingsModal();
    await saveApplicationStateNow({ workspace: true });
    renderApp();
    showToast(english ? name + " was created. Add its first panel to continue." : "پروژه «" + name + "» ایجاد شد؛ حالا اولین پنل را اضافه کنید.");
    requestAnimationFrame(() => showPanelDialog(true));
  });
}

function showPanelDialog(isFirstPanel = false) {
  closeSettingsModal();
  const project = findProject();
  if (!project) return;
  const english = state.language === "en";
  const defaultCode = "FIRE-CTRL-" + String(project.panels.length + 1).padStart(2, "0");
  const backdrop = document.createElement("div");
  backdrop.className = "settings-modal-backdrop entity-modal-backdrop";
  backdrop.innerHTML = '<div class="settings-modal-card entity-modal-card" role="dialog" aria-modal="true">'
    + '<div class="settings-modal-head entity-modal-heading"><div class="helper-icon">' + icons.panel + '</div><div><span class="eyebrow">' + (english ? "PANEL SETUP" : "تعریف پنل") + '</span><h3>' + (english ? (isFirstPanel ? "Add the first panel" : "Add panel") : (isFirstPanel ? "افزودن اولین پنل" : "افزودن پنل")) + '</h3><p>' + (english ? "Add a panel to " + escapeHtml(project.name) + "." : "یک پنل به «" + escapeHtml(project.name) + "» اضافه کنید.") + '</p></div></div>'
    + '<div class="settings-modal-form entity-modal-grid">'
    + '<label>' + (english ? "Panel name" : "نام پنل") + '<input type="text" data-panel-modal-name autofocus></label>'
    + '<label>' + (english ? "Panel code" : "کد پنل") + '<input type="text" data-panel-modal-code value="' + escapeHtml(defaultCode) + '" dir="ltr"></label>'
    + '<label>' + (english ? "Initial status" : "وضعیت اولیه") + '<select data-panel-modal-status><option value="آفلاین">' + (english ? "Offline" : "آفلاین") + '</option><option value="آنلاین">' + (english ? "Online" : "آنلاین") + '</option></select></label>'
    + '</div><div class="settings-modal-actions"><button type="button" class="btn-secondary" data-entity-modal-cancel>' + (english ? (isFirstPanel ? "Add later" : "Cancel") : (isFirstPanel ? "بعداً اضافه می‌کنم" : "انصراف")) + '</button><button type="button" class="btn-primary" data-panel-modal-confirm>' + icons.plus + (english ? "Add panel" : "افزودن پنل") + '</button></div></div>';
  document.body.appendChild(backdrop);
  backdrop.querySelector(".entity-modal-heading .helper-icon")?.remove();
  backdrop.querySelector(".entity-modal-heading .eyebrow")?.remove();
  backdrop.querySelector("[data-panel-modal-status]")?.closest("label")?.remove();
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) closeSettingsModal(); });
  backdrop.querySelector("[data-entity-modal-cancel]")?.addEventListener("click", closeSettingsModal);
  backdrop.querySelector("[data-panel-modal-name]")?.focus();
  backdrop.querySelector("[data-panel-modal-confirm]")?.addEventListener("click", () => {
    const name = backdrop.querySelector("[data-panel-modal-name]")?.value.trim();
    const code = backdrop.querySelector("[data-panel-modal-code]")?.value.trim() || defaultCode;
    if (!name) {
      backdrop.querySelector("[data-panel-modal-name]")?.focus();
      showToast(english ? "Enter a panel name first." : "ابتدا نام پنل را وارد کنید.", "info");
      return;
    }
    if (project.panels.some((panel) => panel.code.toLowerCase() === code.toLowerCase())) {
      backdrop.querySelector("[data-panel-modal-code]")?.focus();
      showToast(english ? "A panel with this code already exists in this project." : "پنلی با این کد در این پروژه وجود دارد.", "info");
      return;
    }
    const number = Math.max(0, ...project.panels.map((item) => Number(item.number) || 0)) + 1;
    const panel = { id: createEntityId("panel"), number, name, code, connectionState: "unconfigured" };
    project.panels.push(panel);
    state.selectedPanelId = panel.id;
    state.connectedPanelId = null;
    state.settingsDirty = false;
    closeSettingsModal();
    void saveApplicationStateNow({ workspace: true });
    renderApp();
    showToast(english ? name + " was added to the project." : "پنل «" + name + "» به پروژه اضافه شد.");
  });
}

function showSettingsFileDialog(onSaved, onCancel) {
  closeSettingsModal();
  const english = state.language === "en";
  const panel = findPanel();
  const drafts = (state.savedSettingFiles || []).filter((file) => file.panelId === panel?.id && file.source === "draft");
  const options = [`<option value="__new__">${english ? "Create a new file" : "ایجاد فایل جدید"}</option>`, ...drafts.map((file) => `<option value="${file.id}"${file.id === state.selectedSavedSettingId ? " selected" : ""}>${escapeHtml(file.name)}</option>`)].join("");
  const backdrop = document.createElement("div");
  backdrop.className = "settings-modal-backdrop";
  backdrop.innerHTML = `<div class="settings-modal-card" role="dialog" aria-modal="true"><div class="settings-modal-head"><div class="helper-icon">${icons.report}</div><div><h3>${english ? "Save settings" : "ذخیره تنظیمات"}</h3><p>${english ? "Which file should contain these settings?" : "این تنظیمات داخل کدام فایل ذخیره شود؟"}</p></div></div><div class="settings-modal-form"><label>${english ? "Target file" : "فایل مقصد"}<select data-settings-file-picker>${options}</select></label><label>${english ? "New file name" : "نام فایل جدید"}<input type="text" data-settings-modal-name placeholder="${english ? "For example: Main panel draft" : "مثلاً: پیش‌نویس پنل اصلی"} "></label></div><div class="settings-modal-actions"><button type="button" class="btn-secondary" data-settings-modal-cancel>${english ? "Cancel" : "انصراف"}</button><button type="button" class="btn-primary" data-settings-modal-confirm>${icons.check}${english ? "Save" : "ذخیره"}</button></div></div>`;
  document.body.appendChild(backdrop);
  const cancel = () => { closeSettingsModal(); onCancel?.(); };
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) cancel(); });
  backdrop.querySelector("[data-settings-modal-cancel]")?.addEventListener("click", cancel);
  backdrop.querySelector("[data-settings-file-picker]")?.focus();
  backdrop.querySelector("[data-settings-modal-confirm]")?.addEventListener("click", () => {
    const picker = backdrop.querySelector("[data-settings-file-picker]");
    const nameInput = backdrop.querySelector("[data-settings-modal-name]");
    const pickedId = picker?.value;
    let file = drafts.find((item) => item.id === pickedId);
    if (pickedId === "__new__") {
      const name = nameInput?.value.trim();
      if (!name) { nameInput?.focus(); showToast(english ? "Enter a file name first." : "ابتدا نام فایل را وارد کنید.", "info"); return; }
      file = createSettingsFile(name, "draft");
      state.savedSettingFiles = [...(state.savedSettingFiles || []), file];
    } else if (file) {
      file.snapshot = captureSettingsSnapshot();
      file.updatedAt = new Date().toISOString();
    }
    if (!file) return;
    state.selectedSavedSettingFileId = file.id;
    state.settingsDirty = false;
    state.settingsBaselineSnapshot = captureSettingsSnapshot();
    persistSettingsFiles();
    closeSettingsModal();
    if (onSaved) onSaved(file);
    else renderApp();
    void saveApplicationStateNow().then((saved) => {
      if (saved) showToast(english ? `Settings saved to ${file.name}.` : `تنظیمات در فایل «${file.name}» ذخیره شد.`);
    });
  });
}

function showUnsavedSettingsDialog(onSave, onDiscard, onCancel) {
  closeSettingsModal();
  const english = state.language === "en";
  const backdrop = document.createElement("div");
  backdrop.className = "settings-modal-backdrop";
  backdrop.innerHTML = `<div class="settings-modal-card" role="dialog" aria-modal="true"><div class="settings-modal-head"><div class="helper-icon">${icons.settings}</div><div><h3>${english ? "Unsaved changes" : "تغییرات ذخیره‌نشده"}</h3><p>${english ? "You changed these settings. Do you want to save them before continuing?" : "در این بخش تغییراتی ایجاد کرده‌اید. قبل از ادامه، تغییرات ذخیره شوند؟"}</p></div></div><div class="settings-modal-actions settings-modal-three-actions"><button type="button" class="btn-secondary" data-settings-modal-cancel>${english ? "Cancel" : "انصراف"}</button><button type="button" class="btn-ghost" data-settings-modal-discard>${english ? "Continue without saving" : "ادامه بدون ذخیره"}</button><button type="button" class="btn-primary" data-settings-modal-save>${icons.check}${english ? "Save changes" : "ذخیره تغییرات"}</button></div></div>`;
  document.body.appendChild(backdrop);
  const cancel = () => { closeSettingsModal(); onCancel?.(); };
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) cancel(); });
  backdrop.querySelector("[data-settings-modal-cancel]")?.addEventListener("click", cancel);
  backdrop.querySelector("[data-settings-modal-discard]")?.addEventListener("click", () => { closeSettingsModal(); state.settingsDirty = false; onDiscard?.(); });
  backdrop.querySelector("[data-settings-modal-save]")?.addEventListener("click", () => { closeSettingsModal(); showSettingsFileDialog(() => { state.settingsDirty = false; onSave?.(); }, onCancel); });
}

function requestSettingsTransition(action, onCancel) {
  const hasChanges = hasUncommittedSettingsChanges();
  if (!hasChanges) { state.settingsDirty = false; action(); return true; }
  showUnsavedSettingsDialog(action, () => {
    applySettingsSnapshot(state.settingsBaselineSnapshot || DEFAULT_PANEL_SETTINGS);
    action();
  }, onCancel);
  return false;
}

function decorateProjectDeleteControls(content) {
  content.querySelectorAll(".project-card[data-project-id] .project-card-title").forEach((title) => {
    if (title.querySelector("[data-project-delete]")) return;
    const projectId = title.closest("[data-project-id]")?.dataset.projectId;
    if (!projectId) return;
    const control = document.createElement("span");
    control.className = "project-delete-button";
    control.dataset.projectDelete = projectId;
    control.setAttribute("role", "button");
    control.setAttribute("tabindex", "0");
    control.setAttribute("aria-label", state.language === "en" ? "Delete project" : "\u062d\u0630\u0641 \u067e\u0631\u0648\u0698\u0647");
    control.title = state.language === "en" ? "Delete project" : "\u062d\u0630\u0641 \u067e\u0631\u0648\u0698\u0647";
    control.innerHTML = icons.trash;
    title.appendChild(control);
  });
}

function bindViewEvents() {
  const content = document.querySelector("#content-root");
  if (!content) return;
  decorateProjectDeleteControls(content);
  if (!content.dataset.settingsDirtyTrackingBound) {
    const isUtilityControl = (target) => target.closest("[data-save-setting], [data-settings-file-select], [data-settings-file-delete], [data-settings-file-create], [data-settings-file-name], [data-read-panel], [data-upload-panel], [data-settings-connect-panel], [data-user-create], [data-managed-user-select], [data-user-save], [data-user-delete], [data-user-project], [data-user-panel], [data-managed-user-field], [data-new-user-name], [data-new-user-password], [data-panel-user-save], [data-panel-user-name], [data-panel-user-password], [data-panel-user-photo-input]");
    content.addEventListener("input", (event) => {
      if (event.target.closest(".detail-body") && !isUtilityControl(event.target)) { state.settingsDirty = true; syncGenericSettingControls(); queueApplicationStateSave(); }
    }, true);
    content.addEventListener("change", (event) => {
      if (event.target.closest(".detail-body") && !isUtilityControl(event.target)) { state.settingsDirty = true; syncGenericSettingControls(); queueApplicationStateSave(); }
    }, true);
    content.addEventListener("click", (event) => {
      const target = event.target;
      if (target.closest(".detail-body") && target.closest("button, label, input, select, textarea") && !isUtilityControl(target)) { state.settingsDirty = true; queueApplicationStateSave(); }
    }, true);
    content.dataset.settingsDirtyTrackingBound = "true";
  }
  if (!content.dataset.projectNavigationBound) {
    content.addEventListener("click", (event) => {
      const deleteControl = event.target.closest("[data-project-delete]");
      if (deleteControl && content.contains(deleteControl)) {
        event.preventDefault();
        event.stopPropagation();
        deleteProject(deleteControl.dataset.projectDelete);
        return;
      }
      // Project cards and the project selector inside the workspace both
      // navigate to a project. Other controls that carry a project id (such as
      // gallery actions) stay inside their current view.
      const button = event.target.closest(".project-card[data-project-id], .project-strip-item[data-project-id]");
      if (!button || !content.contains(button)) return;
      const selectedProject = projects.find((project) => project.id === button.dataset.projectId);
      if (!selectedProject) return;
      requestSettingsTransition(() => {
        state.selectedProjectId = selectedProject.id;
        state.selectedPanelId = selectedProject.panels[0]?.id || null;
        if (!selectedProject.panels.some((panel) => panel.id === state.connectedPanelId)) state.connectedPanelId = null;
        state.selectedSettingId = "date-time";
        state.projectMenuOpen = false;
        // Start the configuration sidebar minimized on every viewport.
        state.panelMenuOpen = false;
        state.settingsTreeCollapsed = true;
        state.view = "workspace";
        renderApp();
      });
    });
    content.addEventListener("keydown", (event) => {
      const deleteControl = event.target.closest("[data-project-delete]");
      if (!deleteControl || !content.contains(deleteControl) || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      event.stopPropagation();
      deleteProject(deleteControl.dataset.projectDelete);
    });
    content.dataset.projectNavigationBound = "true";
  }
  content.querySelectorAll("[data-project-create]").forEach((button) => button.addEventListener("click", () => requestSettingsTransition(() => showProjectDialog())));
  content.querySelectorAll("[data-panel-create]").forEach((button) => button.addEventListener("click", () => requestSettingsTransition(() => showPanelDialog())));
  content.querySelectorAll("[data-panel-directory-add]").forEach((button) => button.addEventListener("click", () => requestSettingsTransition(() => showPanelOnboarding())));
  content.querySelectorAll("[data-panel-directory-open]").forEach((button) => button.addEventListener("click", () => {
    state.panelDirectoryPanelId = button.dataset.panelId;
    state.panelDirectoryTab = "status";
    state.selectedProjectId = button.dataset.projectId;
    state.selectedPanelId = button.dataset.panelId;
    state.view = "panel-detail";
    renderApp();
  }));
  content.querySelectorAll("[data-panels-back]").forEach((button) => button.addEventListener("click", () => {
    state.view = "panels";
    renderApp();
  }));
  content.querySelectorAll("[data-panel-detail-tab]").forEach((button) => button.addEventListener("click", () => {
    state.panelDirectoryTab = button.dataset.panelDetailTab;
    renderApp();
  }));
  content.querySelectorAll("[data-panel-detail-settings]").forEach((button) => button.addEventListener("click", () => {
    const entry = findPanelDirectoryEntry();
    if (!entry) return;
    state.selectedProjectId = entry.project.id;
    state.selectedPanelId = entry.panel.id;
    state.selectedSettingId = "date-time";
    state.view = "workspace";
    state.panelMenuOpen = false;
    state.settingsTreeCollapsed = true;
    renderApp();
  }));
  content.querySelectorAll("[data-project-images-open], [data-project-images-open-button]").forEach((control) => control.addEventListener("click", (event) => {
    event.stopPropagation();
    state.projectImagesProjectId = control.dataset.projectImageProjectId;
    renderApp();
  }));
  content.querySelectorAll("[data-project-images-back]").forEach((button) => button.addEventListener("click", () => {
    state.projectImagesProjectId = null;
    renderApp();
  }));
  content.querySelectorAll("[data-project-image-input]").forEach((input) => input.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    const project = projects.find((item) => item.id === event.target.dataset.projectId);
    if (!file || !project) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      event.target.value = "";
      showToast(state.language === "en" ? "Choose an image smaller than 2 MB." : "یک تصویر معتبر کوچک‌تر از ۲ مگابایت انتخاب کنید.", "info");
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", async () => {
      if (!isSafeImageData(reader.result)) {
        showToast(state.language === "en" ? "This image format is not supported." : "این فرمت تصویر پشتیبانی نمی‌شود.", "info");
        return;
      }
      project.images = normalizeProjectGallery(project);
      const image = { id: createEntityId("project-image"), src: reader.result, name: file.name, createdAt: new Date().toISOString() };
      project.images.push(image);
      if (!isSafeImageSource(project.image)) project.image = image.src;
      await saveApplicationStateNow({ workspace: true });
      renderApp();
      showToast(state.language === "en" ? "Project image updated." : "تصویر پروژه به‌روزرسانی شد.");
    }, { once: true });
    reader.readAsDataURL(file);
  }));
  content.querySelectorAll("[data-project-gallery-remove]").forEach((button) => button.addEventListener("click", async () => {
    const project = projects.find((item) => item.id === button.dataset.projectId);
    const imageIndex = project?.images?.findIndex((item) => item.id === button.dataset.projectGalleryImageId) ?? -1;
    if (!project || imageIndex < 0) return;
    const [removed] = project.images.splice(imageIndex, 1);
    if (removed.src === project.image) project.image = project.images[0]?.src || "";
    renderApp();
    await saveApplicationStateNow({ workspace: true });
    showToast(state.language === "en" ? "Project image removed." : "تصویر پروژه حذف شد.");
  }));
  content.querySelectorAll("[data-project-image-cover]").forEach((button) => button.addEventListener("click", async () => {
    const project = projects.find((item) => item.id === button.dataset.projectId);
    const image = project?.images?.find((item) => item.id === button.dataset.projectGalleryImageId);
    if (!project || !image) return;
    project.image = image.src;
    renderApp();
    await saveApplicationStateNow({ workspace: true });
    showToast(state.language === "en" ? "Project cover updated." : "کاور پروژه به‌روزرسانی شد.");
  }));

  content.querySelectorAll("[data-group-new]").forEach((button) => button.addEventListener("click", () => {
    const numbers = state.groupTab === "zone"
      ? Object.keys(state.zoneGroups || {}).map(Number)
      : [...Object.keys(state.ioInputGroups || {}), ...Object.keys(state.ioOutputGroups || {})].map(Number);
    const nextNumber = Math.max(0, ...numbers.filter(Number.isFinite)) + 1;
    if (state.groupTab === "zone") {
      state.zoneGroupNumber = nextNumber;
      state.zoneGroups[nextNumber] = [];
    } else {
      state.ioInputGroupNumber = nextNumber;
      state.ioOutputGroupNumber = nextNumber;
      state.ioInputGroups[nextNumber] = [];
      state.ioOutputGroups[nextNumber] = [];
    }
    state.groupSelectedDeviceKey = null;
    state.settingsDirty = true;
    queueApplicationStateSave();
    renderApp();
    showToast(state.language === "en" ? "A new group was created." : "گروه جدید ایجاد شد.");
  }));
  content.querySelectorAll("[data-events-read]").forEach((button) => button.addEventListener("click", () => {
    if (!requireCurrentPanelConnection()) return;
    showToast(state.language === "en" ? "Panel events were refreshed." : "رویدادهای پنل به‌روزرسانی شد.");
  }));
  content.querySelectorAll("[data-events-export]").forEach((button) => button.addEventListener("click", () => {
    const panel = findPanel();
    if (!panel) { showToast(state.language === "en" ? "Select a panel first." : "ابتدا یک پنل انتخاب کنید.", "info"); return; }
    const realEvents = !demoMode && Array.isArray(panel.events) ? panel.events : [];
    const isSample = realEvents.length === 0;
    const events = isSample ? createSamplePanelEvents(panel, panelEventProfilesCache.get(panel.id) || [], state.language) : realEvents;
    try {
      exportPanelEventsToExcel(panel, events, isSample);
      showToast(state.language === "en" ? "The Excel report was downloaded." : "گزارش Excel دانلود شد.");
    } catch (error) {
      console.error("Panel event export failed:", error);
      showToast(state.language === "en" ? "Could not create the Excel report." : "ساخت گزارش Excel ناموفق بود.", "error");
    }
  }));
  const eventPanel = state.view === "workspace" && state.selectedSettingId === "events" ? findPanel() : null;
  if (!demoMode && eventPanel && !eventPanel.events?.length && !panelEventProfilesCache.has(eventPanel.id) && !panelEventProfilesPending.has(eventPanel.id)) {
    void loadPanelEventProfiles(eventPanel).then((profiles) => {
      if (profiles && state.view === "workspace" && state.selectedSettingId === "events" && String(findPanel()?.id) === String(eventPanel.id)) renderApp();
    });
  }
  content.querySelectorAll("[data-remote-connect]").forEach((button) => button.addEventListener("click", () => {
    state.selectedSettingId = "saved-settings";
    renderApp();
    showToast(state.language === "en" ? "Configure the panel connection from Saved Settings." : "اتصال پنل را از منوی تنظیمات ذخیره‌شده تنظیم کنید.", "info");
  }));
  content.querySelectorAll("[data-report-generate]").forEach((button) => button.addEventListener("click", () => {
    showToast(state.language === "en" ? "The configuration report is ready to print." : "گزارش تنظیمات برای چاپ آماده شد.");
    window.print();
  }));
  content.querySelectorAll("[data-report-download]").forEach((button) => button.addEventListener("click", () => {
    window.print();
  }));
  content.querySelectorAll("[data-gsm-edit]").forEach((button) => button.addEventListener("click", () => {
    state.selectedSettingId = "customize";
    renderApp();
  }));
  content.querySelectorAll("[data-monitoring-open]").forEach((button) => button.addEventListener("click", () => {
    showToast(state.language === "en" ? "Monitoring view is ready for a live panel connection." : "نمای مانیتورینگ برای اتصال زنده‌ی پنل آماده است.", "info");
  }));
  content.querySelectorAll("[data-back-projects]").forEach((button) => button.addEventListener("click", () => requestSettingsTransition(() => {
    state.view = "projects";
    state.selectedProjectId = null;
    state.selectedPanelId = null;
    renderApp();
  })));
  content.querySelectorAll("[data-project-menu-toggle]").forEach((button) => button.addEventListener("click", () => {
    state.projectMenuOpen = !state.projectMenuOpen;
    const wrap = button.closest(".project-strip-wrap");
    wrap?.classList.toggle("open", state.projectMenuOpen);
    wrap?.classList.toggle("collapsed", !state.projectMenuOpen);
    button.setAttribute("aria-expanded", String(state.projectMenuOpen));
    button.setAttribute("aria-label", state.projectMenuOpen ? (state.language === "en" ? "Minimize projects" : "مینیمایز کردن پروژه‌ها") : (state.language === "en" ? "Expand projects" : "باز کردن پروژه‌ها"));
    button.innerHTML = state.projectMenuOpen ? icons.chevronUp : icons.chevronDown;
  }));
  content.querySelectorAll("[data-panel-menu-toggle]").forEach((button) => button.addEventListener("click", () => {
    state.panelMenuOpen = !state.panelMenuOpen;
    const popup = button.closest(".panel-popup-wrap");
    popup?.classList.toggle("open", state.panelMenuOpen);
    popup?.classList.toggle("collapsed", !state.panelMenuOpen);
    button.setAttribute("aria-expanded", String(state.panelMenuOpen));
    button.setAttribute("aria-label", state.panelMenuOpen ? (state.language === "en" ? "Minimize panels" : "مینیمایز کردن پنل‌ها") : (state.language === "en" ? "Expand panels" : "باز کردن پنل‌ها"));
    button.innerHTML = state.panelMenuOpen ? icons.chevronUp : icons.chevronDown;
  }));
  content.querySelectorAll("[data-settings-collapse]").forEach((button) => button.addEventListener("click", () => {
    state.settingsTreeCollapsed = !state.settingsTreeCollapsed;
    const tree = button.closest(".settings-tree-column");
    const layout = tree?.closest(".workspace-layout");
    const workspace = tree?.closest(".workspace-shell");
    tree?.classList.toggle("minimized", state.settingsTreeCollapsed);
    layout?.classList.toggle("settings-tree-minimized", state.settingsTreeCollapsed);
    workspace?.classList.toggle("settings-menu-open", !state.settingsTreeCollapsed);
    button.setAttribute("aria-expanded", String(!state.settingsTreeCollapsed));
    button.setAttribute("aria-label", state.settingsTreeCollapsed ? (state.language === "en" ? "Expand panel configuration" : "باز کردن پیکربندی پنل") : (state.language === "en" ? "Minimize panel configuration" : "مینیمایز کردن پیکربندی پنل"));
    button.innerHTML = state.settingsTreeCollapsed ? icons.chevronLeft : icons.chevronRight;
  }));
  content.querySelectorAll("[data-panel-id]").forEach((button) => button.addEventListener("click", () => requestSettingsTransition(() => {
    state.selectedPanelId = button.dataset.panelId;
    state.calendarOpen = false;
    state.timeOpen = false;
    state.selectedSavedSettingFileId = null;
    renderApp();
  })));
  content.querySelectorAll("[data-settings-connect-panel]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const panelId = button.dataset.settingsConnectPanel;
    if (state.connectedPanelId === panelId) {
      state.connectedPanelId = null;
      renderApp();
      showToast(state.language === "en" ? "Sample connection status changed to disconnected." : "وضعیت نمایشی اتصال به حالت قطع تغییر کرد.", "info");
    } else {
      state.connectedPanelId = panelId;
      state.selectedPanelId = panelId;
      renderApp();
      showToast(state.language === "en" ? "Sample connection status changed to connected." : "وضعیت نمایشی اتصال به حالت متصل تغییر کرد.");
    }
  }));
  content.querySelectorAll("[data-tree-parent]").forEach((button) => button.addEventListener("click", () => {
    const id = button.dataset.treeParent;
    const treeColumn = button.closest(".settings-tree-column:not(.minimized)");
    const startHeight = treeColumn?.getBoundingClientRect().height || 0;
    state.openSettingsSections[id] = state.openSettingsSections[id] === false;
    const open = state.openSettingsSections[id];
    const children = button.parentElement?.querySelector(":scope > .tree-children");
    button.classList.toggle("open", open);
    button.classList.toggle("not", !open);
    children?.classList.toggle("open", open);
    children?.classList.toggle("collapsed", !open);

    // Animate the settings card itself as branches open and close. The final
    // inline height is removed after the transition so later content changes
    // remain naturally sized.
    if (treeColumn && startHeight) {
      treeColumn.classList.add("is-resizing");
      treeColumn.style.setProperty("height", `${startHeight}px`, "important");
      requestAnimationFrame(() => {
        treeColumn.style.setProperty("height", `${treeColumn.scrollHeight}px`, "important");
      });
      const finishResize = (event) => {
        if (event.propertyName !== "height") return;
        treeColumn.style.removeProperty("height");
        treeColumn.classList.remove("is-resizing");
        treeColumn.removeEventListener("transitionend", finishResize);
      };
      treeColumn.addEventListener("transitionend", finishResize);
    }
  }));
  content.querySelectorAll("[data-setting-id]").forEach((button) => button.addEventListener("click", () => requestSettingsTransition(() => {
    state.selectedSettingId = button.dataset.settingId;
    state.calendarOpen = false;
    state.timeOpen = false;
    state.nightTimeOpen = null;
    state.holidayCalendarOpen = false;
    renderApp();
  })));
  content.querySelectorAll("[data-panel-refresh]").forEach((button) => button.addEventListener("click", () => showToast("وضعیت پنل‌ها به‌روزرسانی شد.")));
  content.querySelectorAll("[data-save-setting]").forEach((button) => button.addEventListener("click", () => {
    showSettingsFileDialog();
  }));
  content.querySelectorAll("[data-settings-file-create]").forEach((button) => button.addEventListener("click", () => {
    const input = content.querySelector("[data-settings-file-name]");
    const name = input?.value.trim();
    if (!name) { input?.focus(); showToast(state.language === "en" ? "Enter a file name first." : "ابتدا نام فایل را وارد کنید.", "info"); return; }
    const file = createSettingsFile(name, "draft");
    state.savedSettingFiles = [...(state.savedSettingFiles || []), file];
    state.selectedSavedSettingFileId = file.id;
    state.settingsDirty = false;
    state.settingsBaselineSnapshot = captureSettingsSnapshot();
    persistSettingsFiles();
    renderApp();
    showToast(state.language === "en" ? `Draft ${file.name} created.` : `پیش‌نویس «${file.name}» ایجاد شد.`);
  }));
  content.querySelectorAll("[data-settings-file-select]").forEach((button) => button.addEventListener("click", () => {
    const file = state.savedSettingFiles?.find((item) => item.id === button.dataset.settingsFileSelect);
    if (!file) return;
    if (state.selectedSavedSettingFileId === file.id) {
      state.selectedSavedSettingFileId = null;
      renderApp();
      showToast(state.language === "en" ? `${file.name} deselected.` : `انتخاب «${file.name}» لغو شد.`, "info");
      return;
    }
    requestSettingsTransition(() => {
      applySettingsSnapshot(file.snapshot);
      state.selectedSavedSettingFileId = file.id;
      renderApp();
      showToast(state.language === "en" ? `${file.name} loaded.` : `تنظیمات فایل «${file.name}» اعمال شد.`);
    });
  }));
  content.querySelectorAll("[data-settings-file-delete]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const file = state.savedSettingFiles?.find((item) => item.id === button.dataset.settingsFileDelete);
    if (!file || file.source !== "draft") return;
    const english = state.language === "en";
    const message = english
      ? `Delete draft “${file.name}”? This cannot be undone.`
      : `پیش‌نویس «${file.name}» حذف شود؟ این کار قابل بازگشت نیست.`;
    if (!window.confirm(message)) return;
    state.savedSettingFiles = (state.savedSettingFiles || []).filter((item) => item.id !== file.id);
    if (state.selectedSavedSettingFileId === file.id) state.selectedSavedSettingFileId = null;
    persistSettingsFiles();
    renderApp();
    showToast(english ? `Draft “${file.name}” deleted.` : `پیش‌نویس «${file.name}» حذف شد.`, "info");
  }));
  content.querySelectorAll("[data-read-panel]").forEach((button) => button.addEventListener("click", () => {
    if (!requireCurrentPanelConnection()) return;
    requestSettingsTransition(() => {
      const file = createSettingsFile(`${state.language === "en" ? "Panel reading" : "خوانده‌شده از پنل"} ${new Date().toLocaleString(state.language === "en" ? "en-US" : "fa-IR")}`, "panel-read");
      state.savedSettingFiles = [...(state.savedSettingFiles || []), file];
      state.selectedSavedSettingFileId = file.id;
      state.settingsDirty = false;
      state.settingsBaselineSnapshot = captureSettingsSnapshot();
      persistSettingsFiles();
      renderApp();
      showToast(state.language === "en" ? "Panel values were read into a separate file." : "مقادیر پنل در یک فایل جدا ذخیره شد.", "info");
    });
  }));
  content.querySelectorAll("[data-upload-panel]").forEach((button) => button.addEventListener("click", () => {
    if (!requireCurrentPanelConnection()) return;
    const file = state.savedSettingFiles?.find((item) => item.id === state.selectedSavedSettingFileId);
    if (!file) { showToast(state.language === "en" ? "Select a saved settings file first." : "ابتدا یک فایل تنظیمات را انتخاب کنید.", "info"); return; }
    applySettingsSnapshot(file.snapshot);
    state.settingsDirty = false;
    state.settingsBaselineSnapshot = captureSettingsSnapshot();
    renderApp();
    showToast(state.language === "en" ? `${file.name} was uploaded to the panel.` : `فایل «${file.name}» روی پنل آپلود شد.`);
  }));
  content.querySelectorAll("[data-english-only]").forEach((input) => input.addEventListener("input", () => {
    input.value = input.value.replace(/[^A-Za-z0-9 _-]/g, "");
  }));
  content.querySelector("[data-self-password-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const english = state.language === "en";
    if (values.newPassword !== values.confirmPassword) { showToast(english ? "New passwords do not match." : "رمزهای عبور جدید یکسان نیستند.", "error"); return; }
    try {
      const response = await apiFetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errors = { "Current password is incorrect": "رمز عبور فعلی نادرست است.", "Password must contain 10 to 256 characters": "رمز عبور باید بین ۱۰ تا ۲۵۶ نویسه باشد.", "Could not change password.": "تغییر رمز عبور انجام نشد." };
        throw new Error(english ? result.error || "Could not change password." : errors[result.error] || result.error || "تغییر رمز عبور انجام نشد.");
      }
      form.reset();
      showToast(english ? "Password updated." : "رمز عبور تغییر کرد.");
      window.location.reload();
    } catch (error) { showToast(error.message, "error"); }
  });
  const profileRoot = content.querySelector("[data-panel-user-profiles]");
  if (profileRoot?.dataset.endpoint) {
    const english = state.language === "en";
    const localizeProfileError = (message) => english ? message : ({ "Could not load panel user profiles": "بارگذاری مشخصات کاربران پنل انجام نشد.", "Could not save panel user profiles": "ذخیره مشخصات کاربران پنل انجام نشد.", "Panel credential encryption is not configured": "کلید رمزنگاری رمزهای پنل در سرور تنظیم نشده است.", "Database unavailable": "دیتابیس در دسترس نیست.", "Profile photo must be a PNG, JPEG or WebP image under 500 KB": "تصویر باید PNG، JPEG یا WebP و کمتر از ۵۰۰ کیلوبایت باشد." }[message] || message);
    const cards = [...profileRoot.querySelectorAll("[data-panel-user-card]")];
    const setPhoto = (card, dataUrl) => {
      const image = card.querySelector("[data-panel-user-photo]");
      const placeholder = card.querySelector("[data-panel-user-avatar]");
      image.src = dataUrl || "";
      image.hidden = !dataUrl;
      placeholder.classList.toggle("has-photo", Boolean(dataUrl));
    };
    const loadProfiles = async () => {
      try {
        const response = await apiFetch(profileRoot.dataset.endpoint, { cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(localizeProfileError(result.error || (english ? "Could not load panel user profiles" : "Could not load panel user profiles")));
        (result.profiles || []).forEach((profile) => {
          const card = cards[Number(profile.slot) - 1];
          if (!card) return;
          card.querySelector("[data-panel-user-name]").value = profile.name || "";
          card.querySelector("[data-panel-user-password-state]").textContent = profile.passwordSet ? (english ? "Password assigned" : "رمز عبور ثبت شده") : (english ? "Password not set" : "رمز عبور تنظیم نشده");
          card.dataset.passwordSet = profile.passwordSet ? "true" : "false";
          setPhoto(card, profile.photo || "");
        });
      } catch (error) { showToast(error.message, "error"); }
    };
    void loadProfiles();
    cards.forEach((card) => card.querySelector("[data-panel-user-photo-input]")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 4_000_000) { showToast(english ? "Choose a PNG, JPEG or WebP image under 4 MB." : "تصویر PNG، JPEG یا WebP کوچک‌تر از ۴ مگابایت انتخاب کنید.", "error"); event.target.value = ""; return; }
      const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      setPhoto(card, dataUrl);
    }));
    profileRoot.querySelector("[data-panel-user-save]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const profiles = await Promise.all(cards.map(async (card, index) => {
        const image = card.querySelector("[data-panel-user-photo]");
        let photo = image.hidden ? "" : image.src;
        if (photo.startsWith("blob:")) photo = "";
        if (photo.length > 450_000) {
          const resized = await new Promise((resolve) => {
            const img = new Image(); img.onload = () => { const scale = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight)); const canvas = document.createElement("canvas"); canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale); canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL("image/jpeg", 0.78)); }; img.onerror = () => resolve(""); img.src = photo;
          });
          photo = resized;
        }
        return { slot: index + 1, name: card.querySelector("[data-panel-user-name]").value, photo, password: card.querySelector("[data-panel-user-password]").value };
      }));
      button.disabled = true;
      try {
        const response = await apiFetch(profileRoot.dataset.endpoint, { method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ profiles }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(localizeProfileError(result.error || "Could not save panel user profiles"));
        cards.forEach((card) => { card.querySelector("[data-panel-user-password]").value = ""; });
        (result.profiles || []).forEach((profile) => { const card = cards[Number(profile.slot) - 1]; if (card) { card.dataset.passwordSet = profile.passwordSet ? "true" : "false"; card.querySelector("[data-panel-user-password-state]").textContent = profile.passwordSet ? (english ? "Password assigned" : "رمز عبور ثبت شده") : (english ? "Password not set" : "رمز عبور تنظیم نشده"); } });
        showToast(english ? "Panel users saved." : "کاربران پنل ذخیره شدند.");
      } catch (error) { showToast(error.message, "error"); }
      finally { button.disabled = false; }
    });
  }
  bindGroupSettingEvents();
  bindLoopCardEvents();
  bindNightSettingEvents();
  bindDateTimeEvents();
}

function bindEvents() {
  const $ = (selector) => document.querySelector(selector);
  if (!saveFailureWarningBound) {
    window.addEventListener("beforeunload", (event) => {
      if (!applicationSaveFailure) return;
      event.preventDefault();
      event.returnValue = "";
    });
    saveFailureWarningBound = true;
  }
  const accountMenu = $(`[data-account-menu]`);
  const accountToggle = accountMenu?.querySelector(`[data-account-toggle]`);
  const accountPopover = accountMenu?.querySelector(`[data-account-popover]`);
  const setAccountMenuOpen = (open) => {
    if (!accountToggle || !accountPopover) return;
    accountToggle.setAttribute("aria-expanded", String(open));
    accountPopover.hidden = !open;
  };
  accountToggle?.addEventListener("click", () => setAccountMenuOpen(accountToggle.getAttribute("aria-expanded") !== "true"));
  if (!sessionExpiryBound) {
    window.addEventListener("app:session-expired", () => {
      showToast(state.language === "en" ? "Your session expired. Sign in again." : "نشست شما منقضی شده است؛ دوباره وارد شوید.", "error");
      window.setTimeout(() => window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`), 900);
    });
    sessionExpiryBound = true;
  }
  document.addEventListener("click", (event) => {
    if (accountMenu && !accountMenu.contains(event.target)) setAccountMenuOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setAccountMenuOpen(false);
  });
  accountMenu?.querySelector(`[data-site-logout]`)?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const response = await apiFetch("/api/site/logout", { method: "POST" });
      if (!response.ok) throw new Error("Could not end the session.");
      window.location.replace("/login");
    } catch {
      button.disabled = false;
      showToast(state.language === "en" ? "Could not sign out. Please try again." : "خروج انجام نشد؛ دوباره تلاش کنید.", "error");
    }
  });
  const closeMenu = () => {
    state.sidebarOpen = false;
    $("#sidebar").classList.remove("open");
    $("#mobile-overlay").classList.remove("show");
    document.querySelector(".app-shell")?.classList.remove("sidebar-open");
    $("#menu-button")?.setAttribute("aria-expanded", "false");
  };
  $("#menu-button").addEventListener("click", () => {
    if (state.sidebarOpen) {
      closeMenu();
      return;
    }
    state.sidebarCollapsed = false;
    state.sidebarOpen = true;
    updateSidebarState();
    $("#sidebar").classList.add("open");
    $("#mobile-overlay").classList.add("show");
    document.querySelector(".app-shell")?.classList.add("sidebar-open");
    $("#menu-button").setAttribute("aria-expanded", "true");
  });
  $("#sidebar-close").addEventListener("click", closeMenu); $("#mobile-overlay").addEventListener("click", closeMenu);
  $("#sidebar-collapse").addEventListener("click", () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    localStorage.setItem("fire-panel-sidebar-collapsed", state.sidebarCollapsed ? "1" : "0");
    updateSidebarState();
    persistUiPreferences();
  });
  updateThemeButton();
  $("#theme-toggle").addEventListener("click", () => {
    const dark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("fire-panel-theme", dark ? "dark" : "light");
    updateThemeButton();
    persistUiPreferences();
  });
  const languageToggle = $("#language-toggle");
  const languagePopover = $("#language-popover");
  const closeLanguagePopover = () => {
    if (!languagePopover || !languageToggle) return;
    languagePopover.hidden = true;
    languageToggle.setAttribute("aria-expanded", "false");
  };
  languageToggle.addEventListener("click", () => {
    const open = languagePopover.hidden;
    languagePopover.hidden = !open;
    languageToggle.setAttribute("aria-expanded", String(open));
  });
  document.querySelectorAll("[data-language-option]").forEach((button) => button.addEventListener("click", () => {
    const nextLanguage = button.dataset.languageOption;
    if (nextLanguage !== "fa" && nextLanguage !== "en") return;
    if (nextLanguage === state.language) { closeLanguagePopover(); return; }
    state.language = nextLanguage;
    activeLanguage = nextLanguage;
    localStorage.setItem("fire-panel-language", nextLanguage);
    const sidebarCollapsed = state.sidebarCollapsed;
    renderShell();
    state.sidebarCollapsed = sidebarCollapsed;
    bindEvents();
    showToast(state.language === "en" ? "Language changed to English." : "زبان نرم‌افزار به فارسی تغییر کرد.");
  }));
  if (!languagePopoverDismissalBound) {
    document.addEventListener("click", (event) => {
      const menu = document.querySelector("[data-language-menu]");
      if (menu && !menu.contains(event.target)) {
        const popup = menu.querySelector("[data-language-popover]");
        const toggle = menu.querySelector("[data-language-toggle]") || menu.querySelector(".language-toggle");
        if (popup) popup.hidden = true;
        toggle?.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const menu = document.querySelector("[data-language-menu]");
      const popup = menu?.querySelector("[data-language-popover]");
      if (!popup || popup.hidden) return;
      popup.hidden = true;
      menu.querySelector(".language-toggle")?.setAttribute("aria-expanded", "false");
      menu.querySelector(".language-toggle")?.focus();
    });
    languagePopoverDismissalBound = true;
  }
  syncApplicationHistory = bindApplicationRouter({
    root: document,
    state,
    projects,
    canLeave: async () => {
      const floorPlanRoot = state.view === "floor-plans" ? document.querySelector("#floor-plan-module") : null;
      return !floorPlanRoot?._floorPlanBeforeLeave || floorPlanRoot._floorPlanBeforeLeave();
    },
    transition: requestSettingsTransition,
    closeMenu,
    render: renderApp,
  });
  renderApp();
}

async function bootstrap() {
  if (demoMode) {
    demoData = await import("./demo-data.js");
    projects.push(...cloneSettingsData(demoData.demoProjects));
    projects.forEach(ensureProjectPanelNumbers);
    Object.assign(state, cloneSettingsData(demoData.demoInitialSettings));
    defaultLoopDeviceLocations = new Map(state.loopCards.flatMap((card) => card.devices.map((device) => [device.id, device.location])));
    state.settingsBaselineSnapshot = captureSettingsSnapshot();
    DEFAULT_PANEL_SETTINGS = captureSettingsSnapshot();
  }
  if (demoFaultPreviewEnabled) {
    const fixture = await import("./demo-fault-preview.js");
    demoFaultPreview = fixture.demoProjectFaults;
  }
  if (!demoMode) {
    try {
      const response = await apiFetch("/api/auth/me", { cache: "no-store" });
      const result = await response.json();
      sessionUser = result.user || null;
      const permissions = result.user?.globalPermissions || [];
      workspaceWriteAllowed = permissions.includes("*") || permissions.includes("projects:all") || permissions.includes("projects:manage") || permissions.includes("projects:create");
      if (response.ok && result.user?.mustChangePassword) {
        state.view = "workspace";
        state.selectedProjectId = projects[0]?.id || null;
        state.selectedPanelId = projects[0]?.panels?.[0]?.id || null;
        state.selectedSettingId = "password-change";
      }
    } catch {
      workspaceDataError = state.language === "en" ? "Could not verify the current session. Reload after restoring the API connection." : "بررسی نشست ناموفق بود؛ پس از برقراری ارتباط با API صفحه را دوباره بارگذاری کنید.";
    }
  }
  const hasRemoteState = await loadApplicationState();
  if (!hasRemoteState) restoreUiPreferences();
  renderShell();
  if (!hasRemoteState) state.sidebarCollapsed = localStorage.getItem("fire-panel-sidebar-collapsed") === "1";
  bindEvents();
  if (state.view === "workspace" && state.selectedProjectId) void loadSelectedPanelSettings();
}

bootstrap();



