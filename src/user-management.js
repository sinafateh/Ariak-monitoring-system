const GLOBAL_PERMISSIONS = [
  ["users:read", "View users"], ["users:manage", "Manage accounts"],
  ["projects:create", "Create projects"], ["projects:manage", "Manage all projects"],
  ["permissions:delegate", "Delegate permissions"], ["audit:read", "View activity log"], ["devices:manage", "Manage ESP devices"],
  ["projects:all", "Access all projects"], ["panels:all", "Access all panels"],
];
const PROJECT_PERMISSIONS = [["project:manage", "Manage project"], ["permissions:delegate", "Delegate project permissions"], ["audit:read", "View project activity"], ["devices:manage", "Manage project devices"]];
let users = [];
let workspaceProjects = [];
let selectedId = "";
let activeTab = "info";
let loaded = false;
let loading = false;
let loadError = "";
let currentLanguage = "fa";
let capabilities = { canManageAccounts: false, canManageAccess: false, canManageAllProjects: false, manageableProjectIds: [], canChangeGlobalPermissions: false };
let detailOpen = false;
let accessOpen = false;
let accessBaseline = null;
let accessDraft = null;
let accessReviewOpen = false;
let accessExpanded = {};
let userFilters = { search: "", status: "all", project: "all" };


const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const findRenderedUser = (id) => users.find((user) => user.id === id) || null;
const currentUser = () => findRenderedUser(selectedId);
const cloneAccess = (access) => ({ globalPermissions: [...(access?.globalPermissions || [])], projects: (access?.projects || []).map((project) => ({ projectId: String(project.projectId), isActive: Boolean(project.isActive), panelIds: [...(project.panelIds || [])], permissions: [...(project.permissions || [])] })) });
const accessProject = (draft, id) => draft?.projects.find((project) => String(project.projectId) === String(id));
const permissionCount = (user) => (user?.globalPermissions?.includes("*") ? 1 : (user?.globalPermissions || []).length) + Number(user?.projectPermissionCount ?? (user?.projectPermissionsSummary || []).length);
const canManageProject = (id) => capabilities.canManageAllProjects || capabilities.manageableProjectIds.includes(String(id));
const actionIcon = (name) => ({
  view: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  access: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  at: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M16 12a4 4 0 1 1-1.2-2.8V12a2 2 0 0 0 4 0 7 7 0 1 0-2 5"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3H5a2 2 0 0 0-2 2c0 8.8 7.2 16 16 16a2 2 0 0 0 2-2v-2l-5-2-2 3a14 14 0 0 1-6-6l3-2-2-5Z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 9h18"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  building: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2m2 0h2M9 11h2m2 0h2M9 15h2m2 0h2M10 21v-3h4v3"/></svg>',
  panel: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h4m-4 4h7"/><circle cx="17" cy="15" r="1"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m7 7-7-7 7-7"/></svg>',
  key: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="5"/><path d="m12 11 8-8m-3 3 2 2m-5 1 2 2"/></svg>',
})[name];
const callApi = async (url, options = {}) => {
  const response = await fetch(url, { cache: "no-store", ...options, headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${url} returned ${response.status}${data.error ? `: ${data.error}` : ""}`);
  return data;
};
const notify = (message, tone = "success") => window.dispatchEvent(new CustomEvent("app:toast", { detail: { message, tone } }));
function openUserActionDialog(root, kind, user, language) {
  const fa = language !== "en", text = (persian, english) => fa ? persian : english;
  root.querySelector("[data-account-action-dialog]")?.remove();
  const dialog = kind === "reset"
    ? `<dialog class="modal" data-account-action-dialog><header class="modal-header"><div><h2>${text("بازنشانی رمز عبور", "Reset password")}</h2><p>${text("برای", "For")} ${esc(user.displayName)} ${text("رمز موقت جدید تعیین کنید.", "set a new temporary password.")}</p></div><button class="modal-close" type="button" data-close-account-dialog aria-label="${text("بستن", "Close")}">×</button></header><form class="form-grid" data-user-reset-form><label class="form-field full">${text("رمز اولیه جدید *", "New temporary password *")}<input name="password" type="password" minlength="10" maxlength="256" required autocomplete="new-password"></label><label class="form-field full">${text("تأیید رمز *", "Confirm password *")}<input name="confirmPassword" type="password" minlength="10" maxlength="256" required autocomplete="new-password"></label><p class="form-hint">${text("پس از ورود، کاربر باید رمز خود را تغییر دهد.", "The user must change this password after signing in.")}</p><div class="modal-actions"><button class="btn btn-primary" type="submit">${text("تأیید بازنشانی", "Confirm reset")}</button><button class="btn btn-secondary" type="button" data-close-account-dialog>${text("انصراف", "Cancel")}</button></div></form></dialog>`
    : `<dialog class="modal" data-account-action-dialog><header class="modal-header"><div><h2>${user.isActive ? text("غیرفعال‌سازی حساب", "Disable account") : text("فعال‌سازی حساب", "Enable account")}</h2><p>${esc(user.displayName)}</p></div><button class="modal-close" type="button" data-close-account-dialog aria-label="${text("بستن", "Close")}">×</button></header><div class="subtle-box">${user.isActive ? text("حساب غیرفعال می‌شود و نشست‌های فعال آن لغو خواهند شد.", "The account will be disabled and its active sessions revoked.") : text("حساب دوباره فعال می‌شود؛ دسترسی‌های لغوشده بازگردانده نمی‌شوند.", "The account will be enabled; revoked permissions will not be restored.")}</div><div class="modal-actions"><button class="btn ${user.isActive ? "btn-danger" : "btn-primary"}" type="button" data-confirm-user-status="${!user.isActive}">${user.isActive ? text("غیرفعال‌سازی حساب", "Disable account") : text("فعال‌سازی حساب", "Enable account")}</button><button class="btn btn-secondary" type="button" data-close-account-dialog>${text("انصراف", "Cancel")}</button></div></dialog>`;
  root.insertAdjacentHTML("beforeend", dialog);
  root.querySelector("[data-account-action-dialog]")?.showModal();
}

async function refreshData() {
  loading = true;
  loadError = "";
  try {
    const userData = await callApi("/api/users");
    users = userData.users || [];
    if (!users.some((user) => user.id === selectedId)) selectedId = users[0]?.id || "";
    const selected = users.find((user) => user.id === selectedId);
    if (selected) {
      const access = await callApi(`/api/users/${encodeURIComponent(selected.id)}/access`);
      selected.projects = access.projects || [];
      selected.globalPermissions = access.globalPermissions || [];
      workspaceProjects = selected.projects.map((project) => ({ id: project.projectId, name: project.projectName, panels: project.panels || [] }));
    } else {
      workspaceProjects = [];
    }
    loaded = true;
  } catch (error) {
    loadError = error.message;
  }
  finally { loading = false; }
}

function renderUserDetailReference(user, language) {
  const fa = language !== "en";
  const text = (persian, english) => fa ? persian : english;
  const dateLocale = fa ? "fa-IR-u-ca-persian" : "en-US";
  const projects = (user.projects || []).filter((project) => project.isActive);
  const globalPermissions = user.globalPermissions || [];
  const globalRows = GLOBAL_PERMISSIONS.map(([key, label]) => `<div class="permission-row ${globalPermissions.includes(key) || globalPermissions.includes("*") ? "allowed" : "denied"}">${globalPermissions.includes(key) || globalPermissions.includes("*") ? actionIcon("check") : actionIcon("minus")}<div><strong>${text(({ "users:read": "مشاهده کاربران", "users:manage": "مدیریت حساب‌ها", "projects:create": "ایجاد پروژه", "projects:manage": "مدیریت پروژه‌ها", "permissions:delegate": "واگذاری دسترسی", "audit:read": "مشاهده گزارش فعالیت", "devices:manage": "مدیریت تجهیزات", "projects:all": "دسترسی به همه پروژه‌ها", "panels:all": "دسترسی به همه پنل‌ها" })[key], label)}</strong></div></div>`).join("");
  if (activeTab === "info") {
    const rows = [
      ["user", text("نام نمایشی", "Display name"), user.displayName || "—"],
      ["at", text("نام کاربری", "Username"), user.username || "—"],
      ["mail", text("رایانامه", "Email"), user.email || text("ثبت نشده", "Not provided")],
      ["phone", text("شماره تماس", "Phone"), user.phone || text("ثبت نشده", "Not provided")],
      ["check", text("وضعیت حساب", "Account status"), user.isActive ? text("فعال", "Active") : text("غیرفعال", "Disabled")],
      ["calendar", text("تاریخ ایجاد حساب", "Account created"), user.createdAt ? new Date(user.createdAt).toLocaleString(dateLocale) : text("ثبت نشده", "Not recorded")],
      ["clock", text("آخرین ورود یا فعالیت", "Last sign-in or activity"), user.lastLoginAt || user.lastActivityAt ? new Date(user.lastLoginAt || user.lastActivityAt).toLocaleString(dateLocale) : text("ثبت نشده", "Not recorded")],
    ];
    return `<section class="section-card"><div class="section-heading"><div><h2>${text("اطلاعات حساب کاربری", "Account information")}</h2><p class="section-subtitle">${text("شناسه ورود و اطلاعات پایه این حساب", "Login identity and basic account information")}</p></div>${capabilities.canManageAccounts ? `<button class="btn btn-secondary btn-small" type="button" data-user-edit-dialog-open>${actionIcon("edit")}${text("ویرایش اطلاعات", "Edit account")}</button>` : ""}</div><div class="info-grid">${rows.map(([icon, label, value]) => `<div class="info-row"><div class="info-icon">${actionIcon(icon)}</div><div><span class="info-label">${esc(label)}</span><span class="info-value">${esc(value)}</span></div></div>`).join("")}</div></section><section class="section-card"><div class="section-heading"><div><h2>${text("امنیت حساب", "Account security")}</h2><p class="section-subtitle">${text("رمز عبور به دلایل امنیتی قابل مشاهده نیست.", "Passwords are hidden for security.")}</p></div></div><div class="inline-actions">${capabilities.canManageAccounts ? `<button class="btn btn-secondary" type="button" data-user-reset-password>${text("بازنشانی رمز عبور", "Reset password")}</button><button class="btn ${user.isActive ? "btn-danger" : "btn-primary"}" type="button" data-user-toggle-status="${!user.isActive}">${user.isActive ? text("غیرفعال‌سازی حساب", "Disable account") : text("فعال‌سازی حساب", "Enable account")}</button>` : `<span class="status-pill ${user.isActive ? "status-active" : "status-disabled"}">${user.isActive ? text("فعال", "Active") : text("غیرفعال", "Disabled")}</span>`}</div></section>`;
  }
  if (activeTab === "projects") {
    if (!projects.length) return `<section class="section-card"><div class="empty-state"><div class="empty-icon">${actionIcon("folder")}</div><h3>${text("پروژه‌ای به کاربر اختصاص داده نشده است", "No project is assigned to this user")}</h3><p>${text("برای تعیین محدوده دسترسی، مدیریت دسترسی را باز کنید.", "Open access management to assign a scope.")}</p>${capabilities.canManageAccess ? `<button class="btn btn-primary" type="button" data-open-user-access>${actionIcon("access")}${text("مدیریت دسترسی", "Manage access")}</button>` : ""}</div></section>`;
    return `${projects.map((project) => { const allowedPanels = (project.panels || []).filter((panel) => (project.panelIds || []).includes(panel.id) || panel.allowed); return `<article class="project-access-card"><div class="project-access-head"><div class="project-icon">${actionIcon("building")}</div><div class="project-access-main"><strong>${esc(project.projectName)}</strong><small>${Number(allowedPanels.length).toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")} ${text("پنل دارای دسترسی", "panels allowed")}</small></div><span class="status-pill status-active">${text("مجاز", "Allowed")}</span></div><div class="project-access-body"><div class="divider"></div><div class="section-subtitle">${text("پنل‌های دارای دسترسی کامل", "Panels with full access")}</div>${allowedPanels.length ? allowedPanels.map((panel) => `<div class="panel-access-row"><div class="panel-symbol">${actionIcon("panel")}</div><div class="panel-access-copy"><strong>${esc(panel.name || panel.id)}</strong><small>${esc(panel.id)}</small></div><span class="panel-access-status">${actionIcon("check")} ${text("دسترسی کامل", "Full access")}</span></div>`).join("") : `<div class="subtle-box">${text("در این پروژه پنلی به کاربر اختصاص داده نشده است.", "No panel is assigned to this user in this project.")}</div>`}</div></article>`; }).join("")}${capabilities.canManageAccess ? `<button class="btn btn-primary" type="button" data-open-user-access>${text("ویرایش پروژه‌ها و پنل‌ها", "Edit projects and panels")}</button>` : ""}`;
  }
  if (activeTab === "permissions") {
    const projectSections = projects.map((project) => { const assigned = PROJECT_PERMISSIONS.filter(([key]) => (project.permissions || []).includes(key)); return `<section class="section-card"><div class="section-heading"><h2>${esc(project.projectName)}</h2><span class="count-chip">${assigned.length.toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")} ${text("اختیار", "permissions")}</span></div><div class="permission-list">${PROJECT_PERMISSIONS.map(([key, label]) => `<div class="permission-row ${(project.permissions || []).includes(key) ? "allowed" : "denied"}">${(project.permissions || []).includes(key) ? actionIcon("check") : actionIcon("minus")}<div><strong>${text(({ "project:manage": "مدیریت پروژه", "permissions:delegate": "واگذاری دسترسی پروژه", "audit:read": "مشاهده رویدادهای پروژه", "devices:manage": "مدیریت تجهیزات پروژه" })[key], label)}</strong></div></div>`).join("")}</div></section>`; }).join("");
    return `<section class="section-card"><div class="section-heading"><div><h2>${text("اختیارات سراسری", "Global permissions")}</h2><p class="section-subtitle">${text("مجوزهای مربوط به کل سامانه", "Permissions that apply across the system")}</p></div></div><div class="permission-list">${globalRows}</div></section>${projectSections || `<div class="subtle-box">${text("برای نمایش اختیارات پروژه‌ای، ابتدا پروژه‌ای به کاربر اختصاص دهید.", "Assign a project to show project permissions.")}</div>`}${capabilities.canManageAccess ? `<button class="btn btn-primary" type="button" data-open-user-access>${text("ویرایش مجوزها", "Edit permissions")}</button>` : ""}`;
  }
  return `<section class="section-card"><div class="section-heading"><div><h2>${text(`سوابق فعالیت ${user.displayName}`, `Activity history for ${user.displayName}`)}</h2><p class="section-subtitle">${text("رویدادهایی که به این کاربر مرتبط هستند", "Events associated with this account")}</p></div><button class="btn btn-secondary btn-small" type="button" data-user-activity-full>${text("گزارش کامل", "Full report")}</button></div><div data-user-activity role="status">${text("در حال بارگذاری…", "Loading…")}</div></section>`;
}

function renderUserAuditActivity(events, language) {
  const fa = language !== "en", text = (persian, english) => fa ? persian : english;
  const labels = { "auth.login": text("ورود موفق", "Successful sign-in"), "auth.login_failed": text("تلاش ناموفق ورود", "Failed sign-in"), "auth.logout": text("خروج از سامانه", "Sign-out"), "user.created": text("ایجاد حساب کاربری", "Account created"), "user.updated": text("ویرایش حساب کاربری", "Account updated"), "user.activated": text("فعال‌سازی حساب", "Account enabled"), "user.deactivated": text("غیرفعال‌سازی حساب", "Account disabled"), "user.access_updated": text("تغییر دسترسی کاربر", "User access changed"), "user.password_reset": text("بازنشانی رمز عبور", "Password reset"), "user.password_changed": text("تغییر رمز عبور", "Password changed"), "project.access_revoked": text("لغو دسترسی پروژه", "Project access revoked"), "project.created": text("ایجاد پروژه", "Project created"), "panel.settings.saved": text("ذخیره تنظیمات پنل", "Panel settings saved"), "panel.settings.read": text("دسترسی به تنظیمات پنل", "Panel settings access"), "panel.settings.write": text("تغییر تنظیمات پنل", "Panel settings changed"), "device.pairing_created": text("افزودن تجهیز", "Device paired"), "device.revoked": text("لغو اتصال تجهیز", "Device disconnected"), "device.command_queued": text("ارسال فرمان پنل", "Panel command queued"), "device.message_queued": text("ارسال پیام به تجهیز", "Message queued for device"), "workspace.state_saved": text("ذخیره فضای کاری", "Workspace saved") };
  if (!events.length) return `<div class="empty-state"><div class="empty-icon">${actionIcon("clock")}</div><h3>${text("فعالیتی ثبت نشده است", "No activity recorded")}</h3></div>`;
  return `<div class="activity-list">${events.slice(0, 8).map((event) => `<div class="activity-item"><div class="activity-icon">${actionIcon(event.action?.startsWith("auth.") ? "arrow" : event.action?.includes("access") ? "access" : "user")}</div><div class="activity-copy"><strong>${esc(labels[event.action] || event.action)}</strong><p>${esc(event.actorName || text("سامانه", "System"))} · ${text("هدف:", "Target:")} ${esc(event.targetName || event.targetUsername || text("بدون کاربر هدف", "No target user"))}</p><small>${esc([event.projectName, event.panelName, new Date(event.createdAt).toLocaleString(fa ? "fa-IR-u-ca-persian" : "en-US")].filter(Boolean).join(" · "))}</small></div><span class="status-pill ${event.outcome === "success" ? "status-active" : event.outcome === "denied" ? "status-warning" : "status-danger"}">${event.outcome === "success" ? text("موفق", "Successful") : event.outcome === "denied" ? text("ردشده", "Denied") : text("ناموفق", "Failed")}</span></div>`).join("")}</div>`;
}

function accessChanges(before, after, language) {
  const fa = language !== "en", text = (persian, english) => fa ? persian : english;
  const changes = [];
  const beforeGlobals = new Set(before?.globalPermissions || []), afterGlobals = new Set(after?.globalPermissions || []);
  for (const key of afterGlobals) if (!beforeGlobals.has(key)) changes.push({ add: true, text: `${text("افزودن اختیار سراسری", "Add global permission")}: ${key}` });
  for (const key of beforeGlobals) if (!afterGlobals.has(key)) changes.push({ add: false, text: `${text("لغو اختیار سراسری", "Remove global permission")}: ${key}` });
  const projectLabel = (id) => workspaceProjects.find((project) => String(project.id) === String(id))?.name || id;
  for (const project of after?.projects || []) {
    const old = accessProject(before, project.projectId) || { isActive: false, panelIds: [], permissions: [] };
    const name = projectLabel(project.projectId);
    if (!old.isActive && project.isActive) changes.push({ add: true, text: `${text("افزودن پروژه", "Assign project")}: ${name}` });
    if (old.isActive && !project.isActive) changes.push({ add: false, text: `${text("لغو پروژه و دسترسی‌های وابسته", "Revoke project and dependent access")}: ${name}` });
    if (project.isActive) {
      for (const panelId of project.panelIds) if (!old.panelIds.includes(panelId)) changes.push({ add: true, text: `${text("دسترسی کامل به پنل", "Grant full panel access")}: ${name} · ${panelId}` });
      for (const panelId of old.panelIds) if (!project.panelIds.includes(panelId)) changes.push({ add: false, text: `${text("لغو دسترسی پنل", "Revoke panel access")}: ${name} · ${panelId}` });
      for (const permission of project.permissions) if (!old.permissions.includes(permission)) changes.push({ add: true, text: `${text("افزودن اختیار", "Add permission")}: ${name} · ${permission}` });
      for (const permission of old.permissions) if (!project.permissions.includes(permission)) changes.push({ add: false, text: `${text("لغو اختیار", "Remove permission")}: ${name} · ${permission}` });
    }
  }
  return changes;
}

function renderUserAccessPage(user, language) {
  const fa = language !== "en", text = (persian, english) => fa ? persian : english;
  const changes = accessChanges(accessBaseline, accessDraft, language);
  const globals = GLOBAL_PERMISSIONS.map(([key, label]) => `<label class="permission-check-row"><input type="checkbox" data-access-global="${esc(key)}" ${(accessDraft?.globalPermissions || []).includes(key) || (accessDraft?.globalPermissions || []).includes("*") ? "checked" : ""} ${!capabilities.canChangeGlobalPermissions ? "disabled" : ""}><span><strong>${text(({ "users:read": "مشاهده کاربران", "users:manage": "مدیریت حساب‌ها", "projects:create": "ایجاد پروژه", "projects:manage": "مدیریت پروژه‌ها", "permissions:delegate": "واگذاری دسترسی", "audit:read": "گزارش فعالیت", "devices:manage": "مدیریت تجهیزات", "projects:all": "دسترسی به همه پروژه‌ها", "panels:all": "دسترسی به همه پنل‌ها" })[key], label)}</strong></span></label>`).join("");
  const projects = workspaceProjects.map((project) => { const item = accessProject(accessDraft, project.id) || { projectId: String(project.id), isActive: false, panelIds: [], permissions: [] }; const expanded = Boolean(accessExpanded[project.id]); const projectManageable = canManageProject(project.id); return `<article class="project-access-card"><div class="project-access-head"><div class="project-icon">${actionIcon("building")}</div><div class="project-access-main"><strong>${esc(project.name)}</strong><small>${(project.panels || []).length.toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")} ${text("پنل در پروژه", "panels in project")}</small></div><label class="checkbox-control"><input type="checkbox" data-access-project="${esc(project.id)}" ${item.isActive ? "checked" : ""} ${!projectManageable ? "disabled" : ""}> ${text("تخصیص پروژه", "Assign project")}</label></div>${item.isActive ? `<div class="project-access-body"><div class="divider"></div><div class="section-heading"><div><h2>${text("پنل‌های پروژه", "Project panels")}</h2><p class="section-subtitle">${text("دسترسی هر پنل کامل است یا غیرفعال.", "Panel access is either full or disabled.")}</p></div><button class="btn btn-ghost btn-small" type="button" data-toggle-project-permissions="${esc(project.id)}" ${!projectManageable ? "disabled" : ""}>${text("اختیارات مدیریتی", "Management permissions")} ${expanded ? "−" : "+"}</button></div>${(project.panels || []).map((panel) => `<div class="panel-access-row"><div class="panel-symbol">${actionIcon("panel")}</div><div class="panel-access-copy"><strong>${esc(panel.name || panel.id)}</strong><small>${esc(panel.id)}</small></div><label class="checkbox-control"><input type="checkbox" data-access-panel="${esc(panel.id)}" data-access-project-id="${esc(project.id)}" ${item.panelIds.includes(panel.id) ? "checked" : ""} ${!projectManageable ? "disabled" : ""}> ${text("دسترسی کامل", "Full access")}</label></div>`).join("")}${expanded ? `<div class="permission-group"><h3>${text("اختیارات مدیریتی پروژه", "Project management permissions")}</h3>${PROJECT_PERMISSIONS.map(([key, label]) => `<label class="permission-check-row"><input type="checkbox" data-access-project-permission="${esc(key)}" data-access-project-id="${esc(project.id)}" ${item.permissions.includes(key) ? "checked" : ""} ${!projectManageable ? "disabled" : ""}><span><strong>${text(({ "project:manage": "مدیریت پروژه", "permissions:delegate": "واگذاری دسترسی پروژه", "audit:read": "مشاهده رویدادهای پروژه", "devices:manage": "مدیریت تجهیزات پروژه" })[key], label)}</strong></span></label>`).join("")}</div>` : ""}</div>` : `<div class="project-access-body"><div class="subtle-box">${text("این پروژه به کاربر اختصاص ندارد. با فعال‌کردن پروژه، پنل‌ها همچنان بدون دسترسی می‌مانند تا جداگانه انتخاب شوند.", "This project is unassigned. Enabling it does not grant panel access until panels are selected.")}</div></div>`}</article>`; }).join("");
  return `<section class="user-access-page"><button class="back-link" type="button" data-user-access-back>${actionIcon("arrow")}${text("بازگشت به جزئیات کاربر", "Back to user details")}</button><div class="toolbar"><div><div class="eyebrow">${text("کاربر", "User")} / ${esc(user.username)}</div><h1>${text("مدیریت دسترسی‌ها", "Manage access")}</h1><p>${esc(user.displayName)} · ${text("تعیین پروژه‌ها، پنل‌ها و اختیارات مدیریتی مستقل", "Assign projects, panels, and independent management permissions")}</p></div><div class="toolbar-actions"><button class="btn btn-secondary" type="button" data-cancel-access>${text("لغو تغییرات", "Discard changes")}</button><button class="btn btn-primary" type="button" data-open-access-review ${changes.length ? "" : "disabled"}>${text("بازبینی تغییرات", "Review changes")}${changes.length ? ` (${changes.length})` : ""}</button></div></div><div class="access-intro"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg><div><strong>${text("دسترسی پنل کامل است یا بدون دسترسی", "Panel access is full or disabled")}</strong><p>${text("دسترسی پنل، مستقل از اختیارات مدیریتی پروژه است. لغو دسترسی در سرور اعمال و برای درخواست‌های بعدی بررسی می‌شود.", "Panel access is separate from project management permissions. Revocations are enforced by the server on subsequent requests.")}</p></div></div><h2 class="access-section-title">1. ${text("اختیارات سراسری سامانه", "Global system permissions")}</h2><section class="section-card">${globals}</section><h2 class="access-section-title">2. ${text("پروژه‌ها و پنل‌ها", "Projects and panels")}</h2><p class="section-subtitle">${text("ابتدا پروژه را اختصاص دهید و سپس پنل‌های مجاز را جداگانه انتخاب کنید.", "Assign a project first, then select allowed panels explicitly.")}</p>${projects}${accessReviewOpen ? `<section class="review-box"><h2>${text("بازبینی تغییرات", "Review changes")}</h2><p>${text("محدوده و نتیجه تغییرات را پیش از ثبت بررسی کنید.", "Review the scope and result before saving.")}</p>${changes.length ? `<div class="change-list">${changes.map((change) => `<div class="change-item ${change.add ? "add" : "remove"}"><span aria-hidden="true">${change.add ? "＋" : "−"}</span><span>${esc(change.text)}</span></div>`).join("")}</div>` : `<div class="subtle-box">${text("تغییری برای ثبت وجود ندارد.", "There are no changes to save.")}</div>`}<div class="review-actions"><button class="btn btn-primary" type="button" data-confirm-access ${changes.length ? "" : "disabled"}>${text("تأیید و ذخیره", "Confirm and save")}</button><button class="btn btn-secondary" type="button" data-close-access-review>${text("بازگشت به ویرایش", "Return to editing")}</button></div></section>` : ""}</section>`;
}

export function renderUserManagement(language = "fa", sessionUser = null) {
  currentLanguage = language;
  const globalPermissions = sessionUser?.globalPermissions || [];
  const scopedManagers = Object.entries(sessionUser?.projectPermissions || {}).filter(([, permissions]) => permissions.includes("project:manage")).map(([projectId]) => String(projectId));
  capabilities = {
    canManageAccounts: globalPermissions.includes("users:manage") || globalPermissions.includes("*"),
    canManageAccess: globalPermissions.includes("*") || (globalPermissions.includes("users:manage") && (globalPermissions.includes("projects:manage") || globalPermissions.includes("projects:all"))) || scopedManagers.length > 0,
    canManageAllProjects: globalPermissions.includes("*") || globalPermissions.includes("projects:manage") || globalPermissions.includes("projects:all"),
    manageableProjectIds: scopedManagers,
    canChangeGlobalPermissions: globalPermissions.includes("*"),
  };
  const fa = language !== "en";
  const text = (persian, english) => fa ? persian : english;
  const selected = currentUser();
  const projectLabel = (id) => workspaceProjects.find((project) => String(project.id) === String(id))?.name || id;
  const userRows = users.map((user) => {
    const status = user.isActive ? text("فعال", "Active") : text("غیرفعال", "Disabled");
    const lastActivity = user.lastActivityAt ? new Date(user.lastActivityAt).toLocaleString(fa ? "fa-IR-u-ca-persian" : "en-US") : text("بدون فعالیت", "No activity");
    const globalLabels = { "users:manage": text("مدیریت کاربران", "Manage users"), "projects:manage": text("مدیریت پروژه‌ها", "Manage projects"), "permissions:delegate": text("واگذاری دسترسی", "Delegate access"), "audit:read": text("گزارش فعالیت", "Activity report"), "devices:manage": text("مدیریت تجهیزات", "Manage devices"), "projects:create": text("ایجاد پروژه", "Create projects") };
    const projectLabels = { "project:manage": text("مدیریت پروژه", "Manage project"), "permissions:delegate": text("واگذاری دسترسی", "Delegate access"), "devices:manage": text("مدیریت تجهیزات", "Manage devices") };
    const globalSummary = user.globalPermissions?.includes("*") ? text("مدیر کل", "Global admin") : (user.globalPermissions || []).map((permission) => globalLabels[permission]).filter(Boolean);
    const scopedSummary = (user.projectPermissionsSummary || []).map((permission) => projectLabels[permission]).filter(Boolean);
    const summary = [...new Set([...(Array.isArray(globalSummary) ? globalSummary : [globalSummary]), ...scopedSummary])];
    return `<tr data-user-row data-user-name="${esc(`${user.displayName} ${user.username} ${user.email || ""} ${user.id}`).toLocaleLowerCase()}" data-user-projects="${esc((user.projectIds || []).join(","))}" data-user-active="${Boolean(user.isActive)}"><td data-label="${text("کاربر", "User")}"><div class="user-cell"><div class="avatar">${esc(String(user.displayName || user.username).trim().slice(0, 1))}</div><div><strong>${esc(user.displayName)}</strong><small>${esc(user.username)}</small></div></div></td><td data-label="${text("وضعیت حساب", "Account status")}"><span class="status-pill ${user.isActive ? "status-active" : "status-disabled"}">${status}</span></td><td data-label="${text("پروژه‌ها", "Projects")}"><span class="count-chip">${Number(user.projectCount || 0).toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")} ${text("پروژه", "projects")}</span></td><td data-label="${text("پنل‌های مجاز", "Allowed panels")}"><span class="count-chip">${Number(user.panelCount || 0).toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")} ${text("پنل", "panels")}</span></td><td data-label="${text("اختیارات مدیریتی", "Management permissions")}"><span class="permission-summary">${actionIcon(permissionCount(user) ? "access" : "minus")} ${permissionCount(user) ? `${Number(permissionCount(user)).toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")} ${text("مجوز", "permissions")}` : text("بدون اختیار مدیریتی", "No management permissions")}</span></td><td data-label="${text("آخرین فعالیت", "Last activity")}"><span class="last-activity">${esc(lastActivity)}</span></td><td data-label="${text("عملیات", "Actions")}"><div class="row-actions"><button class="icon-action" type="button" data-select-user="${esc(user.id)}" data-user-target-tab="info" title="${text("جزئیات کاربر", "User details")}" aria-label="${text("جزئیات کاربر", "User details")}">${actionIcon("view")}</button>${capabilities.canManageAccess ? `<button class="icon-action" type="button" data-open-user-access="${esc(user.id)}" title="${text("مدیریت دسترسی", "Manage access")}" aria-label="${text("مدیریت دسترسی", "Manage access")}">${actionIcon("access")}</button>` : ""}${capabilities.canManageAccounts ? `<button class="icon-action" type="button" data-user-edit-account="${esc(user.id)}" title="${text("ویرایش اطلاعات", "Edit account")}" aria-label="${text("ویرایش اطلاعات", "Edit account")}">${actionIcon("edit")}</button><button class="icon-action" type="button" data-user-more="${esc(user.id)}" title="${text("عملیات بیشتر", "More actions")}" aria-label="${text("عملیات بیشتر", "More actions")}">${actionIcon("more")}</button>` : ""}</div></td></tr>`;
  }).join("");
  const listPage = `<section class="user-list-page"><header class="page-heading"><div><div class="eyebrow">${text("مدیریت سامانه", "System management")}</div><h1>${text("مدیریت کاربران", "User management")}</h1><p>${text("حساب‌های کاربری، پروژه‌های اختصاص‌یافته و دسترسی به پنل‌ها را مدیریت کنید.", "Manage user accounts, assigned projects, and panel access.")}</p></div>${capabilities.canManageAccounts ? `<button class="btn btn-primary" type="button" data-toggle-create>${actionIcon("plus")}${text("افزودن کاربر", "Add user")}</button>` : ""}</header>
    <div class="stat-grid stat-grid-two"><article class="stat-card"><div class="stat-icon blue" aria-hidden="true">${actionIcon("user")}</div><div class="stat-copy"><span>${text("کل کاربران", "Total users")}</span><strong>${Number(users.length).toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")}</strong><small>${text("حساب‌های ثبت‌شده", "Registered accounts")}</small></div></article><article class="stat-card"><div class="stat-icon green" aria-hidden="true">${actionIcon("check")}</div><div class="stat-copy"><span>${text("حساب‌های فعال", "Active accounts")}</span><strong>${Number(users.filter((user) => user.isActive).length).toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")}</strong><small>${text("مجاز به ورود", "Can sign in")}</small></div></article></div>
    <section class="panel-card filter-card user-list-card" aria-label="${text("جست‌وجو و فیلتر کاربران", "Search and filter users")}"><div class="filter-heading"><div><h2>${text("فهرست کاربران", "User directory")}</h2><p>${text("جست‌وجو و فیلتر حساب‌ها بر اساس وضعیت یا پروژه", "Search and filter accounts by status or project")}</p></div><span class="results-count" data-user-result-count>${Number(users.length).toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")} ${text("کاربر", "users")}</span></div>
      <div class="filter-controls user-list-filters"><label class="search-control">${actionIcon("search")}<input type="search" data-user-search value="${esc(userFilters.search)}" placeholder="${text("جست‌وجو بر اساس نام، نام کاربری یا شناسه…", "Search name, username, or ID…")}" autocomplete="off"></label><label class="select-control"><span class="field-label">${text("وضعیت حساب", "Account status")}</span><select data-user-status-filter><option value="all" ${userFilters.status === "all" ? "selected" : ""}>${text("همه وضعیت‌ها", "All statuses")}</option><option value="active" ${userFilters.status === "active" ? "selected" : ""}>${text("فعال", "Active")}</option><option value="disabled" ${userFilters.status === "disabled" ? "selected" : ""}>${text("غیرفعال", "Disabled")}</option></select></label><label class="select-control"><span class="field-label">${text("پروژه", "Project")}</span><select data-user-project-filter><option value="all" ${userFilters.project === "all" ? "selected" : ""}>${text("همه پروژه‌ها", "All projects")}</option>${workspaceProjects.map((project) => `<option value="${esc(project.id)}" ${userFilters.project === String(project.id) ? "selected" : ""}>${esc(project.name)}</option>`).join("")}</select></label><button class="btn btn-ghost filter-reset" type="button" data-clear-user-filters>${text("پاک‌کردن فیلترها", "Clear filters")}</button></div>
      <div class="table-wrap user-table-wrap"><table class="data-table user-table"><thead><tr><th>${text("کاربر", "User")}</th><th>${text("وضعیت حساب", "Account status")}</th><th>${text("پروژه‌ها", "Projects")}</th><th>${text("پنل‌های مجاز", "Allowed panels")}</th><th>${text("اختیارات مدیریتی", "Management permissions")}</th><th>${text("آخرین فعالیت", "Last activity")}</th><th class="actions-column">${text("عملیات", "Actions")}</th></tr></thead><tbody>${userRows || `<tr class="user-no-accounts"><td colspan="7">${text("هنوز حسابی ثبت نشده است.", "No accounts have been created yet.")}</td></tr>`}<tr class="user-filter-empty" hidden><td colspan="7">${text("کاربری با این فیلترها پیدا نشد.", "No users match these filters.")}</td></tr></tbody></table></div><div class="table-footer"><span data-user-table-summary>${text("نمایش", "Showing")} ${Number(users.length).toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")} ${text("کاربر", "users")}</span></div></section>
    ${capabilities.canManageAccounts ? `<dialog class="user-create-dialog" data-user-create-dialog><header class="modal-header"><div><h2>${text("افزودن کاربر", "Add user")}</h2><p>${text("اطلاعات حساب جدید را وارد کنید.", "Enter the new account details.")}</p></div><button class="modal-close" type="button" data-close-create aria-label="${text("بستن", "Close")}">×</button></header><form data-user-create-form class="form-grid"><label class="form-field">${text("نام نمایشی", "Display name")}<input name="displayName" required maxlength="160"></label><label class="form-field">${text("نام کاربری", "Username")}<input name="username" required minlength="3" maxlength="64" autocomplete="off"></label><label class="form-field">${text("رایانامه (اختیاری)", "Email (optional)")}<input name="email" type="email" maxlength="254" autocomplete="email"></label><label class="form-field">${text("تلفن (اختیاری)", "Phone (optional)")}<input name="phone" maxlength="40" autocomplete="tel"></label><label class="form-field">${text("رمز اولیه", "Initial password")}<input name="password" type="password" required minlength="10" autocomplete="new-password"></label><label class="form-field">${text("تکرار رمز", "Confirm password")}<input name="confirmPassword" type="password" required minlength="10" autocomplete="new-password"></label><div class="modal-actions"><button class="btn btn-primary" type="submit">${text("ایجاد حساب", "Create account")}</button><button class="btn btn-secondary" type="button" data-close-create>${text("انصراف", "Cancel")}</button></div></form></dialog><dialog class="user-create-dialog user-actions-dialog" data-user-actions-dialog><header class="modal-header"><div><h2>${text("عملیات کاربر", "User actions")}</h2><p>${text("نمایش اطلاعات و دسترسی‌های این حساب", "Open this account's details or access")}</p></div><button class="modal-close" type="button" data-close-user-actions aria-label="${text("بستن", "Close")}">×</button></header><div class="user-actions-grid"><button class="btn btn-secondary" type="button" data-user-more-tab="info">${text("جزئیات و ویرایش اطلاعات", "Details and account information")}</button><button class="btn btn-secondary" type="button" data-user-more-tab="projects">${text("پروژه‌ها و پنل‌ها", "Projects and panels")}</button><button class="btn btn-secondary" type="button" data-user-more-tab="permissions">${text("مجوزها", "Permissions")}</button><button class="btn btn-secondary" type="button" data-user-more-tab="activity">${text("سوابق فعالیت", "Activity history")}</button></div></dialog>` : ""}</section>`;
  const detailPage = selected ? `<section class="user-detail-page"><div class="user-detail-heading"><button class="back-link" type="button" data-user-back>${actionIcon("arrow")}${text("بازگشت به فهرست کاربران", "Back to user directory")}</button><div class="page-title"><div class="eyebrow">${text("مدیریت سامانه / کاربران", "System management / Users")}</div><h1>${text("جزئیات کاربر", "User details")}</h1><p>${text("اطلاعات حساب، محدوده دسترسی و سوابق فعالیت کاربر را بررسی کنید.", "Review this account, its access scope, and activity history.")}</p></div></div><div class="profile-head"><div class="avatar avatar-large">${esc(String(selected.displayName || selected.username).trim().slice(0, 1))}</div><div class="profile-main"><div class="profile-name-row"><h1>${esc(selected.displayName)}</h1><span class="status-pill ${selected.isActive ? "status-active" : "status-disabled"}">${selected.isActive ? text("فعال", "Active") : text("غیرفعال", "Disabled")}</span></div><p>${esc(selected.username)}${selected.email ? ` · ${esc(selected.email)}` : ""}</p><div class="profile-actions">${capabilities.canManageAccounts ? `<button class="btn btn-secondary" type="button" data-user-target-tab="info" data-user-edit-dialog-open>${text("ویرایش اطلاعات", "Edit account")}</button>` : ""}${capabilities.canManageAccess ? `<button class="btn btn-primary" type="button" data-open-user-access>${text("مدیریت دسترسی", "Manage access")}</button>` : ""}${capabilities.canManageAccounts ? `<button class="btn btn-secondary" type="button" data-user-reset-password>${actionIcon("key")}${text("بازنشانی رمز", "Reset password")}</button>` : ""}</div></div></div><div class="profile-stats"><div class="mini-stat"><span>${text("پروژه‌های مجاز", "Allowed projects")}</span><strong>${Number(selected.projectCount || 0).toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")}</strong></div><div class="mini-stat"><span>${text("پنل‌های دارای دسترسی", "Panels with access")}</span><strong>${Number(selected.panelCount || 0).toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")}</strong></div><div class="mini-stat"><span>${text("اختیارات مدیریتی", "Management permissions")}</span><strong>${Number(permissionCount(selected)).toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")}</strong></div></div><nav class="tabs user-reference-tabs" role="tablist">${[["info", text("اطلاعات", "Information")], ["projects", text("پروژه‌ها و پنل‌ها", "Projects and panels")], ["permissions", text("مجوزها", "Permissions")], ["activity", text("سوابق فعالیت", "Activity history")]].map(([id, label]) => `<button class="tab-button ${activeTab === id ? "active" : ""}" type="button" role="tab" aria-selected="${activeTab === id}" data-user-tab="${id}">${actionIcon(({ info: "user", projects: "building", permissions: "access", activity: "clock" })[id])}${label}</button>`).join("")}</nav><div class="tab-panel user-detail-card">${renderUserDetailReference(selected, language)}</div>${capabilities.canManageAccounts ? `<dialog class="modal user-edit-dialog" data-user-edit-dialog><header class="modal-header"><div><h2>${text("ویرایش اطلاعات کاربر", "Edit user account")}</h2><p>${esc(selected.username)}</p></div><button class="modal-close" type="button" data-close-user-edit aria-label="${text("بستن", "Close")}">×</button></header><form class="form-grid" data-user-edit-form><label class="form-field">${text("نام نمایشی", "Display name")}<input name="displayName" required maxlength="160" value="${esc(selected.displayName)}"></label><label class="form-field">${text("نام کاربری", "Username")}<input value="${esc(selected.username)}" disabled></label><label class="form-field">${text("رایانامه", "Email")}<input name="email" type="email" maxlength="254" value="${esc(selected.email||"")}"></label><label class="form-field">${text("تلفن", "Phone")}<input name="phone" maxlength="40" value="${esc(selected.phone||"")}"></label><div class="modal-actions"><button class="btn btn-primary" type="submit">${text("ذخیره تغییرات", "Save changes")}</button><button class="btn btn-secondary" type="button" data-close-user-edit>${text("انصراف", "Cancel")}</button></div></form></dialog>` : ""}</section>` : `<p class="user-empty-state">${text("کاربری برای نمایش انتخاب کنید.", "Select a user to view details.")}</p>`;
  return `<div class="user-management-root reference-admin" dir="${fa ? "rtl" : "ltr"}" data-can-manage-accounts="${capabilities.canManageAccounts}">${!loaded ? `<section class="panel-card user-load-state" role="status">${loading ? text("در حال بارگذاری کاربران…", "Loading users…") : esc(loadError || text("مدیریت کاربران برای این حساب در دسترس نیست.", "User management is not available for this account."))}</section>` : accessOpen ? renderUserAccessPage(selected, language) : detailOpen ? detailPage : listPage}</div>`;
}
export function bindUserManagement(root, rerender, language = currentLanguage) {
  currentLanguage = language;
  const fa = currentLanguage !== "en";
  if (!loaded && !loading) void refreshData().then(rerender);
  const applyFilters = () => {
    const query = root.querySelector("[data-user-search]")?.value.trim().toLocaleLowerCase() || "";
    const status = root.querySelector("[data-user-status-filter]")?.value || "all";
    const project = root.querySelector("[data-user-project-filter]")?.value || "all";
    userFilters = { search: query, status, project };
    let shown = 0;
    root.querySelectorAll("[data-user-row]").forEach((row) => {
      const matchesText = !query || row.dataset.userName.includes(query);
      const isActive = row.dataset.userActive === "true";
      const matchesProject = project === "all" || row.dataset.userProjects.split(",").includes(project);
      row.hidden = !matchesText || !matchesProject || (status === "active" && !isActive) || (status === "disabled" && isActive);
      if (!row.hidden) shown += 1;
    });
    const empty = root.querySelector(".user-filter-empty");
    if (empty) empty.hidden = shown !== 0 || users.length === 0;
    const count = root.querySelector("[data-user-result-count]");
    const summary = root.querySelector("[data-user-table-summary]");
    if (count) count.textContent = `${shown.toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")} ${fa ? "کاربر" : "users"}`;
    if (summary) summary.textContent = `${fa ? "نمایش" : "Showing"} ${shown.toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")} ${fa ? "کاربر" : "users"} · ${users.length.toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")} ${fa ? "حساب" : "accounts"}`;
  };
  root.querySelector("[data-user-search]")?.addEventListener("input", applyFilters);
  root.querySelector("[data-user-status-filter]")?.addEventListener("change", applyFilters);
  root.querySelector("[data-user-project-filter]")?.addEventListener("change", applyFilters);
  applyFilters();
  root.addEventListener("change", (event) => {
    const input = event.target;
    if (!accessOpen || !accessDraft || !(input instanceof HTMLInputElement)) return;
    if (input.dataset.accessGlobal) {
      const permissions = new Set(accessDraft.globalPermissions.filter((permission) => permission !== "*"));
      input.checked ? permissions.add(input.dataset.accessGlobal) : permissions.delete(input.dataset.accessGlobal);
      accessDraft.globalPermissions = [...permissions];
    } else if (input.dataset.accessProject) {
      const project = accessProject(accessDraft, input.dataset.accessProject);
      if (project) {
        project.isActive = input.checked;
        if (!input.checked) { project.panelIds = []; project.permissions = []; }
      }
    } else if (input.dataset.accessPanel) {
      const project = accessProject(accessDraft, input.dataset.accessProjectId);
      if (project) project.panelIds = input.checked ? [...new Set([...project.panelIds, input.dataset.accessPanel])] : project.panelIds.filter((id) => id !== input.dataset.accessPanel);
    } else if (input.dataset.accessProjectPermission) {
      const project = accessProject(accessDraft, input.dataset.accessProjectId);
      if (project) project.permissions = input.checked ? [...new Set([...project.permissions, input.dataset.accessProjectPermission])] : project.permissions.filter((permission) => permission !== input.dataset.accessProjectPermission);
    } else return;
    accessReviewOpen = false;
    rerender();
    requestAnimationFrame(() => {
      const page = document.querySelector(".user-access-page");
      if (!page) return;
      const next = [...page.querySelectorAll("input")].find((candidate) => ["accessGlobal", "accessProject", "accessPanel", "accessProjectPermission"].some((key) => candidate.dataset[key] && candidate.dataset[key] === input.dataset[key]));
      next?.focus({ preventScroll: true });
      const review = page.querySelector("[data-open-access-review]");
      const count = accessChanges(accessBaseline, accessDraft, currentLanguage).length;
      if (review) { review.disabled = count === 0; review.textContent = `${fa ? "بازبینی تغییرات" : "Review changes"}${count ? ` (${count})` : ""}`; }
    });
  });
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    try {
      if (button.hasAttribute("data-toggle-create")) { root.querySelector("[data-user-create-dialog]")?.showModal(); root.querySelector("[name=displayName]")?.focus(); return; }
      if (button.dataset.openUserAccess !== undefined) {
        selectedId = button.dataset.openUserAccess; activeTab = "projects"; detailOpen = true; accessOpen = true; accessReviewOpen = false; accessExpanded = {};
        await refreshData();
        accessBaseline = cloneAccess(currentUser()); accessDraft = cloneAccess(accessBaseline); rerender(); return;
      }
      if (button.hasAttribute("data-user-edit-dialog-open")) { root.querySelector("[data-user-edit-dialog]")?.showModal(); return; }
      if (button.hasAttribute("data-close-user-edit")) { root.querySelector("[data-user-edit-dialog]")?.close(); return; }
      if (button.hasAttribute("data-close-account-dialog")) { root.querySelector("[data-account-action-dialog]")?.close(); return; }
      if (button.dataset.userToggleStatus !== undefined) { openUserActionDialog(root, "status", currentUser(), currentLanguage); return; }
      if (button.dataset.userResetPassword !== undefined) { openUserActionDialog(root, "reset", currentUser(), currentLanguage); return; }
      if (button.dataset.confirmUserStatus !== undefined) {
        const isActive = button.dataset.confirmUserStatus === "true";
        await callApi(`/api/users/${encodeURIComponent(selectedId)}/status`, { method: "PATCH", body: JSON.stringify({ isActive }) });
        root.querySelector("[data-account-action-dialog]")?.close(); await refreshData(); rerender(); notify(fa ? (isActive ? "حساب کاربر فعال شد." : "حساب کاربر غیرفعال و نشست‌های آن لغو شد.") : (isActive ? "Account enabled." : "Account disabled and sessions revoked.")); return;
      }
      if (button.dataset.toggleProjectPermissions !== undefined) { accessExpanded = { ...accessExpanded, [button.dataset.toggleProjectPermissions]: !accessExpanded[button.dataset.toggleProjectPermissions] }; rerender(); return; }
      if (button.hasAttribute("data-open-access-review")) { accessReviewOpen = true; rerender(); root.querySelector("[data-open-access-review]")?.scrollIntoView({ block: "nearest" }); return; }
      if (button.hasAttribute("data-close-access-review")) { accessReviewOpen = false; rerender(); return; }
      if (button.hasAttribute("data-cancel-access") || button.hasAttribute("data-user-access-back")) { accessOpen = false; accessReviewOpen = false; accessBaseline = null; accessDraft = null; detailOpen = true; rerender(); return; }
      if (button.hasAttribute("data-confirm-access")) {
        const changes = accessChanges(accessBaseline, accessDraft, currentLanguage);
        if (!changes.length || !accessDraft) return;
        const payload = { globalPermissions: accessDraft.globalPermissions, projects: accessDraft.projects.filter((project) => canManageProject(project.projectId)) };
        await callApi(`/api/users/${encodeURIComponent(selectedId)}/access`, { method: "PUT", body: JSON.stringify(payload) });
        accessOpen = false; accessReviewOpen = false; accessBaseline = null; accessDraft = null; detailOpen = true;
        await refreshData(); rerender(); notify(fa ? "دسترسی‌های کاربر ذخیره شد." : "User access saved."); return;
      }
      if (button.dataset.userMore) {
        selectedId = button.dataset.userMore;
        root.querySelector("[data-user-actions-dialog]")?.showModal();
        return;
      }
      if (button.hasAttribute("data-close-user-actions")) { root.querySelector("[data-user-actions-dialog]")?.close(); return; }
      if (button.dataset.userMoreTab) {
        root.querySelector("[data-user-actions-dialog]")?.close();
        activeTab = button.dataset.userMoreTab;
        detailOpen = true;
        await refreshData();
        rerender();
        return;
      }
      if (button.hasAttribute("data-close-create")) { root.querySelector("[data-user-create-dialog]")?.close(); return; }
      if (button.hasAttribute("data-clear-user-filters")) { userFilters = { search: "", status: "all", project: "all" }; rerender(); return; }
      if (button.hasAttribute("data-user-back")) { detailOpen = false; rerender(); return; }
      if (button.dataset.userEditAccount !== undefined) { selectedId = button.dataset.userEditAccount; activeTab = "info"; accessOpen = false; detailOpen = true; await refreshData(); rerender(); document.querySelector("[data-user-edit-dialog]")?.showModal(); return; }
      if (button.dataset.selectUser) { selectedId = button.dataset.selectUser; activeTab = button.dataset.userTargetTab || "info"; detailOpen = true; accessOpen = false; await refreshData(); return rerender(); }
      if (button.dataset.userTab) {
        activeTab = button.dataset.userTab;
        detailOpen = true;
        rerender();
        if (activeTab === "activity") {
          const activity = document.querySelector("#content-root [data-user-activity]");
          try {
            const data = await callApi(`/api/audit?userId=${encodeURIComponent(selectedId)}`);
            if (activity?.isConnected) activity.innerHTML = renderUserAuditActivity(data.events || [], currentLanguage);
          } catch (error) { if (activity?.isConnected) activity.textContent = error.message; notify(error.message, "error"); }
        }
        return;
      }
      if (button.hasAttribute("data-user-activity-full")) { document.querySelector('[data-nav-view="activity-report"]')?.click(); return; }
    } catch (error) { notify(fa && error.message === "Passwords do not match" ? "رمزها با هم مطابقت ندارند." : error.message, "error"); }
  });
  root.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches("[data-user-reset-form]")) return;
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    if (values.password !== values.confirmPassword) { notify(fa ? "رمزها با هم مطابقت ندارند." : "Passwords do not match.", "error"); return; }
    try {
      await callApi(`/api/users/${encodeURIComponent(selectedId)}/password-reset`, { method: "POST", body: JSON.stringify({ password: values.password }) });
      root.querySelector("[data-account-action-dialog]")?.close(); form.reset(); notify(fa ? "رمز بازنشانی شد؛ کاربر پس از ورود باید آن را تغییر دهد." : "Password reset; the user must change it after signing in.");
    } catch (error) { notify(error.message, "error"); }
  });
  root.querySelector("[data-user-edit-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      await callApi(`/api/users/${encodeURIComponent(selectedId)}`, { method: "PATCH", body: JSON.stringify(values) });
      root.querySelector("[data-user-edit-dialog]")?.close(); await refreshData(); rerender(); notify(fa ? "اطلاعات کاربر ذخیره شد." : "User information saved.");
    } catch (error) { notify(error.message, "error"); }
  });
  root.querySelector("[data-user-create-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      if (values.password !== values.confirmPassword) throw new Error("Passwords do not match");
      delete values.confirmPassword;
      const data = await callApi("/api/users", { method: "POST", body: JSON.stringify(values) });
      form.reset(); selectedId = data.user.id; activeTab = "info"; detailOpen = true; await refreshData(); rerender(); notify(fa ? "حساب کاربری ایجاد شد." : "User account created.");
    } catch (error) { notify(fa && error.message === "Passwords do not match" ? "رمزها با هم مطابقت ندارند." : error.message, "error"); }
  });
}
