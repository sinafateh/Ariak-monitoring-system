const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

const ACTIONS = {
  "auth.login": ["ورود موفق", "Successful sign-in", "login"],
  "auth.login_failed": ["تلاش ناموفق ورود", "Failed sign-in", "login"],
  "auth.logout": ["خروج از سامانه", "Sign-out", "login"],
  "user.created": ["ایجاد حساب کاربری", "Account created", "account"],
  "user.updated": ["ویرایش حساب کاربری", "Account updated", "account"],
  "user.activated": ["فعال‌سازی حساب", "Account enabled", "account"],
  "user.deactivated": ["غیرفعال‌سازی حساب", "Account disabled", "account"],
  "user.access_updated": ["تغییر دسترسی کاربر", "User access changed", "access"],
  "user.password_reset": ["بازنشانی رمز عبور", "Password reset", "account"],
  "user.password_changed": ["تغییر رمز عبور", "Password changed", "account"],
  "project.access_revoked": ["لغو دسترسی پروژه", "Project access revoked", "access"],
  "project.created": ["ایجاد پروژه", "Project created", "project"],
  "panel.settings.saved": ["ذخیره تنظیمات پنل", "Panel settings saved", "panel"],
  "panel.settings.write": ["تغییر تنظیمات پنل", "Panel settings changed", "panel"],
  "device.pairing_created": ["افزودن تجهیز", "Device paired", "panel"],
  "device.revoked": ["لغو اتصال تجهیز", "Device disconnected", "panel"],
  "device.command_queued": ["ارسال فرمان پنل", "Panel command queued", "panel"],
  "workspace.state_saved": ["ذخیره فضای کاری", "Workspace saved", "project"],
};

const DETAIL_LABELS = {
  source: ["مسیر ثبت", "Source"],
  reason: ["علت", "Reason"],
  description: ["شرح", "Description"],
  projectCount: ["تعداد پروژه‌ها", "Project count"],
  panelCount: ["تعداد پنل‌ها", "Panel count"],
  changedFields: ["فیلدهای تغییرکرده", "Changed fields"],
  before: ["وضعیت قبل", "Before"],
  after: ["وضعیت بعد", "After"],
  username: ["نام کاربری", "Username"],
  deviceId: ["شناسه تجهیز", "Device ID"],
};

let report = { events: [], summary: {}, page: 1, pageSize: 25, total: 0, pages: 1 };
let projects = [];
let users = [];
let loading = false;
let exporting = false;
let error = "";
let exportError = "";
let selectedEventId = "";
let hasLoaded = false;
let currentFilters = {};
let filterTimer;

const tx = (persian, english, language) => language === "en" ? english : persian;
const actionLabel = (action, language) => ACTIONS[action] ? tx(ACTIONS[action][0], ACTIONS[action][1], language) : action || tx("عملیات نامشخص", "Unknown action", language);
const actionCategory = (action) => ACTIONS[action]?.[2] || "other";
const categorySymbol = (category) => ({ login: "↪", access: "◇", account: "●", panel: "▣", project: "⌂", other: "•" })[category] || "•";
const outcomeLabel = (outcome, language) => ({
  success: tx("موفق", "Successful", language),
  failure: tx("ناموفق", "Failed", language),
  denied: tx("ردشده", "Denied", language),
})[outcome] || outcome || tx("ثبت نشده", "Not recorded", language);
const outcomeClass = (outcome) => outcome === "success" ? "status-active" : outcome === "denied" ? "status-warning" : "status-danger";
const date = (value, language, options = {}) => value
  ? new Date(value).toLocaleString(language === "en" ? "en-US" : "fa-IR-u-ca-persian", options)
  : "—";
const actorName = (event, language) => event.actorName || event.actorUsername || tx("سامانه", "System", language);
const targetName = (event, language) => event.targetName || event.targetUsername || tx("بدون کاربر هدف", "No target user", language);
const detailsObject = (event) => {
  if (event.details && typeof event.details === "object" && !Array.isArray(event.details)) return event.details;
  if (typeof event.details === "string") {
    try { const parsed = JSON.parse(event.details); return parsed && typeof parsed === "object" ? parsed : { value: event.details }; }
    catch { return { value: event.details }; }
  }
  return {};
};
const printable = (value) => typeof value === "string" ? value : JSON.stringify(value, null, 2);

async function requestReport(filters = {}, page = 1, pageSize = report.pageSize || 25) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const response = await fetch(`/api/audit?${params}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function load(filters = currentFilters, page = 1) {
  loading = true;
  error = "";
  try {
    const data = await requestReport(filters, page);
    report = { ...report, ...data };
    projects = data.filters?.projects || projects;
    users = data.filters?.users || users;
    selectedEventId = report.events.some((event) => String(event.id) === selectedEventId) ? selectedEventId : "";
  } catch (cause) {
    error = cause.message;
  } finally {
    loading = false;
    hasLoaded = true;
  }
}

function renderSelectOptions(language) {
  const grouped = [
    ["login", tx("ورود و خروج", "Sign-ins", language)],
    ["access", tx("تغییر دسترسی", "Access changes", language)],
    ["account", tx("مدیریت حساب", "Account management", language)],
    ["panel", tx("عملیات پنل و تجهیز", "Panel and device operations", language)],
    ["project", tx("عملیات پروژه", "Project operations", language)],
  ];
  return grouped.map(([category, label]) => {
    const options = Object.entries(ACTIONS).filter(([, action]) => action[2] === category);
    return options.length ? `<optgroup label="${label}">${options.map(([value, action]) => `<option value="${esc(value)}" ${currentFilters.action === value ? "selected" : ""}>${esc(tx(action[0], action[1], language))}</option>`).join("")}</optgroup>` : "";
  }).join("");
}

function renderEventDetails(event, language) {
  const details = detailsObject(event);
  const projectPanel = [event.projectName || event.projectId, event.panelName || event.panelId].filter(Boolean).join(" · ") || "—";
  const fields = [
    [tx("زمان دقیق", "Exact time", language), date(event.createdAt, language)],
    [tx("عامل عملیات", "Actor", language), actorName(event, language)],
    [tx("کاربر هدف", "Target user", language), targetName(event, language)],
    [tx("پروژه / پنل", "Project / panel", language), projectPanel],
    [tx("نتیجه", "Outcome", language), outcomeLabel(event.outcome, language)],
    ...Object.entries(details).map(([key, value]) => [
      tx(DETAIL_LABELS[key]?.[0] || key, DETAIL_LABELS[key]?.[1] || key, language), printable(value),
    ]),
  ];
  return `<div class="activity-detail">${fields.map(([label, value]) => `<div class="detail-field"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}</div>`;
}

function renderEvent(event, language) {
  const category = actionCategory(event.action);
  const projectPanel = [event.projectName || event.projectId, event.panelName || event.panelId].filter(Boolean).join(" · ");
  const expanded = String(event.id) === selectedEventId;
  const info = [projectPanel, date(event.createdAt, language)].filter(Boolean).join(" · ");
  return `<article class="activity-record" data-activity-record="${esc(event.id)}">
    <div class="activity-item">
      <div class="activity-icon activity-icon-${category}" aria-hidden="true">${categorySymbol(category)}</div>
      <div class="activity-copy"><strong>${esc(actionLabel(event.action, language))}</strong><p>${esc(actorName(event, language))} · ${tx("هدف:", "Target:", language)} ${esc(targetName(event, language))}</p><small>${esc(info || tx("رویداد سراسری سامانه", "System-wide event", language))}</small></div>
      <span class="status-pill ${outcomeClass(event.outcome)}">${esc(outcomeLabel(event.outcome, language))}</span>
    </div>
    ${expanded ? renderEventDetails(event, language) : ""}
    <div class="activity-record-actions"><button class="btn btn-ghost btn-small" type="button" data-activity-detail="${esc(event.id)}" aria-expanded="${expanded}">${expanded ? tx("بستن جزئیات", "Hide details", language) : tx("مشاهده جزئیات", "View details", language)} <span aria-hidden="true">${expanded ? "⌄" : "‹"}</span></button></div>
  </article>`;
}

function renderEmptyState(language) {
  const message = loading
    ? tx("در حال دریافت رویدادها…", "Loading events…", language)
    : error || tx("رویدادی پیدا نشد", "No events found", language);
  const hint = loading || error ? "" : tx("فیلترها را تغییر دهید یا جست‌وجو را پاک کنید.", "Change the filters or clear the search.", language);
  return `<div class="activity-empty-state" role="status"><span aria-hidden="true">⌕</span><h3>${esc(message)}</h3>${hint ? `<p>${esc(hint)}</p>` : ""}</div>`;
}

export function renderActivityReport(language = "fa") {
  const summary = report.summary || {};
  const events = report.events || [];
  const metrics = [
    ["total", tx("رویداد ثبت‌شده", "Recorded events", language)],
    ["failedLogins", tx("تلاش ناموفق ورود", "Failed sign-ins", language)],
    ["accessChanges", tx("تغییر دسترسی", "Access changes", language)],
    ["panelOperations", tx("عملیات پنل", "Panel operations", language)],
  ];
  const projectOptions = projects.map((project) => `<option value="${esc(project.id)}" ${currentFilters.projectId === String(project.id) ? "selected" : ""}>${esc(project.name)}</option>`).join("");
  const userOptions = users.map((user) => `<option value="${esc(user.id)}" ${currentFilters.userId === String(user.id) ? "selected" : ""}>${esc(user.displayName)} · ${esc(user.username)}</option>`).join("");
  const page = report.page || 1;
  const pages = report.pages || 1;
  const pageText = tx("صفحه", "Page", language);
  const errorNotice = exportError ? `<p class="activity-export-error" role="alert">${esc(exportError)}</p>` : "";

  return `<section class="activity-report-root" dir="${language === "en" ? "ltr" : "rtl"}">
    <header class="page-heading"><div><div class="eyebrow">${tx("مدیریت سامانه", "SYSTEM MANAGEMENT", language)}</div><h1>${tx("گزارش فعالیت", "Activity report", language)}</h1><p>${tx("بررسی ورودها، تغییر دسترسی‌ها و عملیات انجام‌شده در پروژه‌ها و پنل‌ها.", "Review sign-ins, access changes, and operations across projects and panels.", language)}</p></div><button class="btn btn-secondary" type="button" data-activity-export ${exporting ? "disabled" : ""}>${exporting ? tx("در حال آماده‌سازی…", "Preparing…", language) : tx("خروجی CSV", "Export CSV", language)}</button></header>
    <section class="activity-kpis" aria-label="${tx("خلاصهٔ گزارش فعالیت", "Activity report summary", language)}">${metrics.map(([key, label]) => `<article class="activity-kpi"><span>${label}</span><strong>${Number(summary[key] || 0).toLocaleString(language === "en" ? "en-US" : "fa-IR-u-nu-latn")}</strong></article>`).join("")}</section>
    <section class="section-card activity-filter-card"><div class="section-heading"><div><h2>${tx("فیلتر رویدادها", "Event filters", language)}</h2><p class="section-subtitle">${tx("فیلترها روی گزارش واقعی و محدودهٔ دسترسی شما اعمال می‌شوند.", "Filters apply to the real audit log within your access scope.", language)}</p></div><button class="btn btn-ghost btn-small" type="button" data-activity-reset>${tx("پاک‌کردن فیلترها", "Clear filters", language)}</button></div>
      <form data-activity-filters class="activity-filter-form"><div class="filter-bar">
        <label class="search-control"><span aria-hidden="true">⌕</span><input type="search" name="q" value="${esc(currentFilters.q || "")}" placeholder="${tx("کاربر، شرح، پروژه یا پنل", "User, description, project, or panel", language)}"></label>
        <label class="select-control"><span class="field-label">${tx("نوع فعالیت", "Activity type", language)}</span><select name="action"><option value="">${tx("همهٔ فعالیت‌ها", "All activity", language)}</option>${renderSelectOptions(language)}</select></label>
        <label class="select-control"><span class="field-label">${tx("نتیجه", "Outcome", language)}</span><select name="outcome"><option value="">${tx("همهٔ نتایج", "All outcomes", language)}</option><option value="success" ${currentFilters.outcome === "success" ? "selected" : ""}>${tx("موفق", "Successful", language)}</option><option value="failure" ${currentFilters.outcome === "failure" ? "selected" : ""}>${tx("ناموفق", "Failed", language)}</option><option value="denied" ${currentFilters.outcome === "denied" ? "selected" : ""}>${tx("ردشده", "Denied", language)}</option></select></label>
        <label class="select-control"><span class="field-label">${tx("پروژه", "Project", language)}</span><select name="projectId"><option value="">${tx("همهٔ پروژه‌ها", "All projects", language)}</option>${projectOptions}</select></label>
      </div><div class="filter-bar activity-filter-bar-secondary"><label class="select-control"><span class="field-label">${tx("پنل", "Panel", language)}</span><input class="field-control" type="search" name="panelId" value="${esc(currentFilters.panelId || "")}" placeholder="${tx("شناسهٔ پنل", "Panel ID", language)}"></label></div>
      <details class="activity-advanced-filters"><summary>${tx("فیلترهای تکمیلی", "More filters", language)}</summary><div class="activity-advanced-grid"><label class="select-control"><span class="field-label">${tx("کاربر مرتبط", "Related user", language)}</span><select name="userId"><option value="">${tx("همهٔ کاربران", "All users", language)}</option>${userOptions}</select></label><label class="select-control"><span class="field-label">${tx("از تاریخ", "From", language)}</span><input class="field-control" type="date" name="from" value="${esc(currentFilters.from || "")}"></label><label class="select-control"><span class="field-label">${tx("تا تاریخ", "To", language)}</span><input class="field-control" type="date" name="to" value="${esc(currentFilters.to || "")}"></label></div></details>
      </form>${errorNotice}</section>
    <section class="section-card activity-events-card"><div class="section-heading"><div><h2>${tx("رویدادهای ثبت‌شده", "Recorded events", language)}</h2><p class="section-subtitle">${Number(report.total || 0).toLocaleString(language === "en" ? "en-US" : "fa-IR-u-nu-latn")} ${tx("نتیجه مطابق فیلترهای انتخاب‌شده", "results match the selected filters", language)}</p></div><span class="results-count">${pageText} ${page} ${tx("از", "of", language)} ${pages}</span></div>
      <div class="activity-list">${events.length ? events.map((event) => renderEvent(event, language)).join("") : renderEmptyState(language)}</div>
      ${report.total > report.pageSize ? `<footer class="activity-pagination"><span>${Number(report.total).toLocaleString(language === "en" ? "en-US" : "fa-IR-u-nu-latn")} ${tx("رویداد", "events", language)} · ${pageText} ${page} ${tx("از", "of", language)} ${pages}</span><div><button class="btn btn-secondary btn-small" type="button" data-activity-page="prev" ${page <= 1 ? "disabled" : ""}>${tx("قبلی", "Previous", language)}</button><button class="btn btn-secondary btn-small" type="button" data-activity-page="next" ${page >= pages ? "disabled" : ""}>${tx("بعدی", "Next", language)}</button></div></footer>` : ""}
    </section>
    <aside class="access-intro"><span class="access-intro-icon" aria-hidden="true">i</span><div><strong>${tx("گزارش فعالیت با رویدادهای حریق متفاوت است", "Activity reports are separate from fire events", language)}</strong><p>${tx("این بخش اقدام کاربران و مدیران را ثبت می‌کند. آلارم حریق و خطای واقعی تجهیزات در بخش رویدادهای پنل‌ها نمایش داده می‌شوند.", "This page records actions by users and administrators. Fire alarms and equipment faults appear under panel events.", language)}</p></div></aside>
  </section>`;
}

async function exportCsv(language) {
  exporting = true;
  exportError = "";
  const first = await requestReport(currentFilters, 1, 100);
  const allEvents = [...(first.events || [])];
  for (let page = 2; page <= (first.pages || 1); page += 1) {
    const data = await requestReport(currentFilters, page, 100);
    allEvents.push(...(data.events || []));
  }
  const headers = ["createdAt", "action", "actor", "target", "project", "panel", "outcome", "details"];
  const rows = allEvents.map((event) => [
    event.createdAt,
    actionLabel(event.action, language),
    actorName(event, language),
    event.targetName || event.targetUsername || "",
    event.projectName || event.projectId || "",
    event.panelName || event.panelId || "",
    outcomeLabel(event.outcome, language),
    JSON.stringify(detailsObject(event)),
  ]);
  const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `activity-report-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  exporting = false;
}

export function bindActivityReport(root, rerender, language = "fa") {
  const form = root.querySelector("[data-activity-filters]");
  const collectFilters = () => Object.fromEntries([...new FormData(form).entries()].filter(([, value]) => value));
  const applyFilters = async (delay = 0) => {
    clearTimeout(filterTimer);
    currentFilters = collectFilters();
    selectedEventId = "";
    if (delay) {
      filterTimer = setTimeout(() => { void load(currentFilters, 1).then(rerender); }, delay);
    } else {
      await load(currentFilters, 1);
      rerender();
    }
  };

  if (form) {
    for (const [key, value] of Object.entries(currentFilters)) {
      const field = form.elements.namedItem(key);
      if (field) field.value = value;
    }
    form.addEventListener("submit", (event) => { event.preventDefault(); void applyFilters(); });
    form.addEventListener("change", () => { void applyFilters(); });
    form.elements.namedItem("q")?.addEventListener("input", () => { void applyFilters(350); });
  }
  if (!hasLoaded && !loading) void load(currentFilters, 1).then(rerender);

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-activity-reset")) {
      clearTimeout(filterTimer);
      currentFilters = {};
      selectedEventId = "";
      exportError = "";
      await load(currentFilters, 1);
      rerender();
      return;
    }
    if (button.dataset.activityPage) {
      await load(currentFilters, (report.page || 1) + (button.dataset.activityPage === "next" ? 1 : -1));
      rerender();
      return;
    }
    if (button.dataset.activityDetail) {
      selectedEventId = selectedEventId === button.dataset.activityDetail ? "" : button.dataset.activityDetail;
      rerender();
      return;
    }
    if (button.hasAttribute("data-activity-export")) {
      exporting = true;
      exportError = "";
      rerender();
      try { await exportCsv(language); }
      catch (cause) { exportError = cause.message; exporting = false; }
      rerender();
    }
  });
}
