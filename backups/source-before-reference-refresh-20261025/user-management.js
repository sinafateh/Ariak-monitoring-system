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
let pendingAccess = null;
let capabilities = { canManageAccounts: false, canManageAccess: false, canChangeGlobalPermissions: false };
let detailOpen = false;
let userFilters = { search: "", status: "all", project: "all" };


const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const findRenderedUser = (id) => users.find((user) => user.id === id) || null;
const currentUser = () => findRenderedUser(selectedId);
const actionIcon = (name) => ({
  view: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  access: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
})[name];
const callApi = async (url, options = {}) => {
  const response = await fetch(url, { cache: "no-store", ...options, headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${url} returned ${response.status}${data.error ? `: ${data.error}` : ""}`);
  return data;
};

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

function renderUserDetail(user, language) {
  const fa = language !== "en";
  const text = (persian, english) => fa ? persian : english;
  if (!user) return `<div class="user-empty-state">${text("کاربری برای نمایش انتخاب کنید.", "Select a user to view account details.")}</div>`;
  const preview = false;
  const globalPermissions = user.globalPermissions || [];
  const projects = user.projects || [];
  const availableProjects = workspaceProjects;
  const projectById = new Map(projects.map((item) => [item.projectId, item]));
  const projectPermissions = PROJECT_PERMISSIONS.map(([key]) => [key, ({ "project:manage": text("مدیریت پروژه", "Manage project"), "permissions:delegate": text("واگذاری دسترسی‌های پروژه", "Delegate project permissions"), "audit:read": text("مشاهدهٔ رویدادهای پروژه", "View project activity"), "devices:manage": text("مدیریت تجهیزات پروژه", "Manage project devices") })[key]]);
  const globalPermissionLabels = { "users:read": text("مشاهدهٔ کاربران", "View users"), "users:manage": text("مدیریت حساب‌ها", "Manage accounts"), "projects:create": text("ایجاد پروژه", "Create projects"), "projects:manage": text("مدیریت همهٔ پروژه‌ها", "Manage all projects"), "permissions:delegate": text("واگذاری دسترسی‌ها", "Delegate permissions"), "audit:read": text("مشاهدهٔ گزارش فعالیت", "View activity log"), "devices:manage": text("مدیریت تجهیزات", "Manage ESP devices"), "projects:all": text("دسترسی به همهٔ پروژه‌ها", "Access all projects"), "panels:all": text("دسترسی به همهٔ پنل‌ها", "Access all panels") };
  const dateLocale = fa ? "fa-IR-u-ca-persian" : "en-US";
  const body = activeTab === "info"
    ? `<div class="user-editor-fields"><label>${text("نام نمایشی", "Display name")}<input data-user-field="displayName" value="${esc(user.displayName)}" ${!capabilities.canManageAccounts ? "disabled" : ""}></label><label>${text("نام کاربری", "Username")}<input value="${esc(user.username)}" disabled></label><label>${text("رایانامه", "Email")}<input data-user-field="email" value="${esc(user.email || "")}" type="email" ${!capabilities.canManageAccounts ? "disabled" : ""}></label><label>${text("تلفن", "Phone")}<input data-user-field="phone" value="${esc(user.phone || "")}" ${!capabilities.canManageAccounts ? "disabled" : ""}></label><p>${text("ایجاد", "Created")} ${esc(new Date(user.createdAt).toLocaleString(dateLocale))} · ${text("آخرین ورود", "Last login")} ${user.lastLoginAt ? esc(new Date(user.lastLoginAt).toLocaleString(dateLocale)) : text("هرگز", "Never")}</p>${capabilities.canManageAccounts ? `<div class="user-editor-actions"><button class="btn-primary" data-user-save-profile>${text("ذخیرهٔ حساب", "Save account")}</button><button class="btn-secondary" data-user-toggle-status="${!user.isActive}">${user.isActive ? text("غیرفعال‌کردن حساب", "Disable account") : text("فعال‌کردن حساب", "Enable account")}</button><button class="btn-secondary" data-user-reset-password>${text("بازنشانی رمز", "Reset password")}</button></div>` : ""}</div>`
    : activeTab === "projects"
      ? `<div class="user-permission-list">${availableProjects.map((project) => { const assignment = projectById.get(project.id); const allPanels = globalPermissions.includes("*") || globalPermissions.includes("projects:all") || globalPermissions.includes("panels:all"); const enabled = Boolean(assignment?.isActive); return `<section class="user-permission-project"><label class="user-permission-project-head"><input type="checkbox" data-access-project-enabled="${esc(project.id)}" ${enabled ? "checked" : ""} ${!capabilities.canManageAccess ? "disabled" : ""}><span><b>${esc(project.name)}</b><small>${enabled ? text("دسترسی پروژه فعال", "Project access enabled") : text("دسترسی پروژه غیرفعال", "Project access disabled")}</small></span><i aria-hidden="true">${enabled ? "✓" : ""}</i></label><div class="user-permission-panels">${(project.panels || []).map((panel) => `<label class="user-permission-panel"><input type="checkbox" data-access-panel="${esc(panel.id)}" data-access-project="${esc(project.id)}" ${allPanels || assignment?.panelIds?.includes(panel.id) ? "checked" : ""} ${!enabled || !capabilities.canManageAccess ? "disabled" : ""}><span><b>${esc(panel.name || panel.id)}</b><small>${esc(panel.id)}</small></span><i aria-hidden="true">${assignment?.panelIds?.includes(panel.id) ? "✓" : ""}</i></label>`).join("")}</div></section>`; }).join("")}</div>${capabilities.canManageAccess ? `<button class="btn-primary" data-user-save-access>${text("بازبینی دسترسی‌ها", "Review access changes")}</button>` : ""}`
      : activeTab === "permissions"
        ? `<h4 class="user-permission-section-title">${text("اختیارات سراسری سامانه", "Global system permissions")}</h4><div class="user-permission-list">${GLOBAL_PERMISSIONS.map(([key]) => `<label class="user-permission-panel"><input type="checkbox" data-global-permission="${key}" ${globalPermissions.includes(key) || globalPermissions.includes("*") ? "checked" : ""} ${!capabilities.canChangeGlobalPermissions ? "disabled" : ""}><span>${globalPermissionLabels[key]}</span></label>`).join("")}</div><h4 class="user-permission-section-title">${text("اختیارات مدیریتی پروژه‌ها", "Project management permissions")}</h4><div class="user-permission-list">${availableProjects.map((project) => { const assignment = projectById.get(project.id); return `<section class="user-permission-project"><h4>${esc(project.name)}</h4>${projectPermissions.map(([key, label]) => `<label class="user-permission-panel"><input type="checkbox" data-access-project-permission="${key}" data-access-project="${esc(project.id)}" ${assignment?.permissions?.includes(key) ? "checked" : ""} ${!assignment?.isActive || !capabilities.canManageAccess ? "disabled" : ""}><span>${label}</span></label>`).join("")}</section>`; }).join("")}</div>${capabilities.canManageAccess ? `<button class="btn-primary" data-user-save-access>${text("بازبینی دسترسی‌ها", "Review access changes")}</button>` : ""}`
        : `<div data-user-activity>${text("در حال بارگذاری فعالیت…", "Loading activity…")}</div>`;
  const status = user.isActive ? text("فعال", "Active") : text("غیرفعال", "Disabled");
  return `<div class="user-detail-body">${body}</div>`;
}

export function renderUserManagement(language = "fa", sessionUser = null) {
  currentLanguage = language;
  const globalPermissions = sessionUser?.globalPermissions || [];
  capabilities = {
    canManageAccounts: globalPermissions.includes("users:manage") || globalPermissions.includes("*"),
    canManageAccess: globalPermissions.includes("users:manage") || globalPermissions.includes("projects:manage") || globalPermissions.includes("*") || Object.values(sessionUser?.projectPermissions || {}).some((permissions) => permissions.includes("project:manage")),
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
    return `<tr data-user-row data-user-name="${esc(`${user.displayName} ${user.username} ${user.email || ""} ${user.id}`).toLocaleLowerCase()}" data-user-projects="${esc((user.projectIds || []).join(","))}" data-user-active="${Boolean(user.isActive)}"><td data-label="${text("کاربر", "User")}"><div class="user-cell"><div class="avatar">${esc(String(user.displayName || user.username).trim().slice(0, 1))}</div><div><strong>${esc(user.displayName)}</strong><small>${esc(user.username)}</small></div></div></td><td data-label="${text("وضعیت حساب", "Account status")}"><span class="status-chip ${user.isActive ? "green" : "amber"}">${status}</span></td><td data-label="${text("پروژه‌ها", "Projects")}"><span class="user-table-count">${Number(user.projectCount || 0).toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")}</span></td><td data-label="${text("پنل‌های مجاز", "Allowed panels")}"><span class="user-table-count">${Number(user.panelCount || 0).toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")}</span></td><td data-label="${text("اختیارات مدیریتی", "Management permissions")}"><span class="user-admin-summary">${esc(summary.join("، ") || text("بدون اختیار مدیریتی", "No management permissions"))}</span></td><td data-label="${text("آخرین فعالیت", "Last activity")}"><span class="user-last-activity">${esc(lastActivity)}</span></td><td data-label="${text("عملیات", "Actions")}"><div class="row-actions"><button class="icon-action" type="button" data-select-user="${esc(user.id)}" data-user-target-tab="info" title="${text("جزئیات کاربر", "User details")}" aria-label="${text("جزئیات کاربر", "User details")}">${actionIcon("view")}</button>${capabilities.canManageAccess ? `<button class="icon-action" type="button" data-select-user="${esc(user.id)}" data-user-target-tab="projects" title="${text("مدیریت دسترسی", "Manage access")}" aria-label="${text("مدیریت دسترسی", "Manage access")}">${actionIcon("access")}</button>` : ""}<button class="icon-action" type="button" data-select-user="${esc(user.id)}" data-user-target-tab="info" title="${text("ویرایش اطلاعات", "Edit account")}" aria-label="${text("ویرایش اطلاعات", "Edit account")}">${actionIcon("edit")}</button><button class="icon-action" type="button" data-user-more="${esc(user.id)}" title="${text("عملیات بیشتر", "More actions")}" aria-label="${text("عملیات بیشتر", "More actions")}">${actionIcon("more")}</button></div></td></tr>`;
  }).join("");
  const listPage = `<section class="user-list-page"><header class="page-heading"><div><div class="eyebrow">${text("مدیریت سامانه", "System management")}</div><h1>${text("مدیریت کاربران", "User management")}</h1><p>${text("حساب‌های کاربری، پروژه‌های اختصاص‌یافته و دسترسی به پنل‌ها را مدیریت کنید.", "Manage user accounts, assigned projects, and panel access.")}</p></div>${capabilities.canManageAccounts ? `<button class="btn btn-primary" type="button" data-toggle-create><span aria-hidden="true">＋</span>${text("افزودن کاربر", "Add user")}</button>` : ""}</header>
    <div class="stat-grid stat-grid-two"><article class="stat-card"><div class="stat-icon blue" aria-hidden="true">♙</div><div class="stat-copy"><span>${text("کل کاربران", "Total users")}</span><strong>${Number(users.length).toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")}</strong><small>${text("حساب‌های ثبت‌شده", "Registered accounts")}</small></div></article><article class="stat-card"><div class="stat-icon green" aria-hidden="true">✓</div><div class="stat-copy"><span>${text("حساب‌های فعال", "Active accounts")}</span><strong>${Number(users.filter((user) => user.isActive).length).toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")}</strong><small>${text("مجاز به ورود", "Can sign in")}</small></div></article></div>
    <section class="panel-card filter-card user-list-card" aria-label="${text("جست‌وجو و فیلتر کاربران", "Search and filter users")}"><div class="filter-heading"><div><h2>${text("فهرست کاربران", "User directory")}</h2><p>${text("جست‌وجو و فیلتر حساب‌ها بر اساس وضعیت یا پروژه", "Search and filter accounts by status or project")}</p></div><span class="results-count" data-user-result-count>${Number(users.length).toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")} ${text("کاربر", "users")}</span></div>
      <div class="filter-controls user-list-filters"><label class="search-control"><span aria-hidden="true">⌕</span><input type="search" data-user-search value="${esc(userFilters.search)}" placeholder="${text("جست‌وجو بر اساس نام، نام کاربری یا شناسه…", "Search name, username, or ID…")}" autocomplete="off"></label><label class="select-control"><span class="field-label">${text("وضعیت حساب", "Account status")}</span><select data-user-status-filter><option value="all" ${userFilters.status === "all" ? "selected" : ""}>${text("همه وضعیت‌ها", "All statuses")}</option><option value="active" ${userFilters.status === "active" ? "selected" : ""}>${text("فعال", "Active")}</option><option value="disabled" ${userFilters.status === "disabled" ? "selected" : ""}>${text("غیرفعال", "Disabled")}</option></select></label><label class="select-control"><span class="field-label">${text("پروژه", "Project")}</span><select data-user-project-filter><option value="all" ${userFilters.project === "all" ? "selected" : ""}>${text("همه پروژه‌ها", "All projects")}</option>${workspaceProjects.map((project) => `<option value="${esc(project.id)}" ${userFilters.project === String(project.id) ? "selected" : ""}>${esc(project.name)}</option>`).join("")}</select></label><button class="btn btn-ghost filter-reset" type="button" data-clear-user-filters>${text("پاک‌کردن فیلترها", "Clear filters")}</button></div>
      <div class="table-wrap user-table-wrap"><table class="data-table user-table"><thead><tr><th>${text("کاربر", "User")}</th><th>${text("وضعیت حساب", "Account status")}</th><th>${text("پروژه‌ها", "Projects")}</th><th>${text("پنل‌های مجاز", "Allowed panels")}</th><th>${text("اختیارات مدیریتی", "Management permissions")}</th><th>${text("آخرین فعالیت", "Last activity")}</th><th class="actions-column">${text("عملیات", "Actions")}</th></tr></thead><tbody>${userRows || `<tr class="user-no-accounts"><td colspan="7">${text("هنوز حسابی ثبت نشده است.", "No accounts have been created yet.")}</td></tr>`}<tr class="user-filter-empty" hidden><td colspan="7">${text("کاربری با این فیلترها پیدا نشد.", "No users match these filters.")}</td></tr></tbody></table></div><div class="table-footer"><span data-user-table-summary>${text("نمایش", "Showing")} ${Number(users.length).toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")} ${text("کاربر", "users")}</span></div></section>
    ${capabilities.canManageAccounts ? `<dialog class="user-create-dialog" data-user-create-dialog><header class="modal-header"><div><h2>${text("افزودن کاربر", "Add user")}</h2><p>${text("اطلاعات حساب جدید را وارد کنید.", "Enter the new account details.")}</p></div><button class="modal-close" type="button" data-close-create aria-label="${text("بستن", "Close")}">×</button></header><form data-user-create-form class="form-grid"><label class="form-field">${text("نام نمایشی", "Display name")}<input name="displayName" required maxlength="160"></label><label class="form-field">${text("نام کاربری", "Username")}<input name="username" required minlength="3" maxlength="64" autocomplete="off"></label><label class="form-field">${text("رایانامه (اختیاری)", "Email (optional)")}<input name="email" type="email" maxlength="254" autocomplete="email"></label><label class="form-field">${text("تلفن (اختیاری)", "Phone (optional)")}<input name="phone" maxlength="40" autocomplete="tel"></label><label class="form-field">${text("رمز اولیه", "Initial password")}<input name="password" type="password" required minlength="10" autocomplete="new-password"></label><label class="form-field">${text("تکرار رمز", "Confirm password")}<input name="confirmPassword" type="password" required minlength="10" autocomplete="new-password"></label><div class="modal-actions"><button class="btn btn-primary" type="submit">${text("ایجاد حساب", "Create account")}</button><button class="btn btn-secondary" type="button" data-close-create>${text("انصراف", "Cancel")}</button></div></form></dialog><dialog class="user-create-dialog user-actions-dialog" data-user-actions-dialog><header class="modal-header"><div><h2>${text("عملیات کاربر", "User actions")}</h2><p>${text("نمایش اطلاعات و دسترسی‌های این حساب", "Open this account's details or access")}</p></div><button class="modal-close" type="button" data-close-user-actions aria-label="${text("بستن", "Close")}">×</button></header><div class="user-actions-grid"><button class="btn btn-secondary" type="button" data-user-more-tab="info">${text("جزئیات و ویرایش اطلاعات", "Details and account information")}</button><button class="btn btn-secondary" type="button" data-user-more-tab="projects">${text("پروژه‌ها و پنل‌ها", "Projects and panels")}</button><button class="btn btn-secondary" type="button" data-user-more-tab="permissions">${text("مجوزها", "Permissions")}</button><button class="btn btn-secondary" type="button" data-user-more-tab="activity">${text("سوابق فعالیت", "Activity history")}</button></div></dialog>` : ""}</section>`;
  const detailPage = selected ? `<section class="user-detail-page"><button class="back-link" type="button" data-user-back>${text("بازگشت به فهرست کاربران", "Back to user directory")}</button><div class="page-title"><div class="eyebrow">${text("مدیریت سامانه / کاربران", "System management / Users")}</div><h1>${text("جزئیات کاربر", "User details")}</h1><p>${text("اطلاعات حساب، محدوده دسترسی و سوابق فعالیت کاربر را بررسی کنید.", "Review this account, its access scope, and activity history.")}</p></div><div class="profile-head"><div class="avatar avatar-large">${esc(String(selected.displayName || selected.username).trim().slice(0, 1))}</div><div class="profile-main"><div class="profile-name-row"><h1>${esc(selected.displayName)}</h1><span class="status-pill ${selected.isActive ? "status-active" : "status-disabled"}">${selected.isActive ? text("فعال", "Active") : text("غیرفعال", "Disabled")}</span></div><p>${esc(selected.username)}${selected.email ? ` · ${esc(selected.email)}` : ""}</p><div class="profile-actions"><button class="btn btn-secondary" type="button" data-user-target-tab="info" data-focus-user-edit>${text("ویرایش اطلاعات", "Edit account")}</button>${capabilities.canManageAccess ? `<button class="btn btn-primary" type="button" data-user-tab="projects">${text("مدیریت دسترسی", "Manage access")}</button>` : ""}<button class="btn btn-secondary" type="button" data-user-reset-password>${text("بازنشانی رمز", "Reset password")}</button></div></div></div><div class="profile-stats"><div class="mini-stat"><span>${text("پروژه‌های مجاز", "Allowed projects")}</span><strong>${Number(selected.projectCount || 0).toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")}</strong></div><div class="mini-stat"><span>${text("پنل‌های دارای دسترسی", "Panels with access")}</span><strong>${Number(selected.panelCount || 0).toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")}</strong></div><div class="mini-stat"><span>${text("اختیارات مدیریتی", "Management permissions")}</span><strong>${Number((selected.globalPermissions || []).length + (selected.projectPermissionsSummary || []).length).toLocaleString(fa ? "fa-IR-u-nu-latn" : "en-US")}</strong></div></div><nav class="tabs user-reference-tabs" role="tablist">${[["info", text("اطلاعات", "Information")], ["projects", text("پروژه‌ها و پنل‌ها", "Projects and panels")], ["permissions", text("مجوزها", "Permissions")], ["activity", text("سوابق فعالیت", "Activity history")]].map(([id, label]) => `<button class="tab-button ${activeTab === id ? "active" : ""}" type="button" role="tab" aria-selected="${activeTab === id}" data-user-tab="${id}">${label}</button>`).join("")}</nav><section class="section-card user-detail-card">${renderUserDetail(selected, language)}</section></section>` : `<p class="user-empty-state">${text("کاربری برای نمایش انتخاب کنید.", "Select a user to view details.")}</p>`;
  return `<div class="user-management-root" dir="${fa ? "rtl" : "ltr"}" data-can-manage-accounts="${capabilities.canManageAccounts}">${!loaded ? `<section class="panel-card user-load-state" role="status">${loading ? text("در حال بارگذاری کاربران…", "Loading users…") : esc(loadError || text("مدیریت کاربران برای این حساب در دسترس نیست.", "User management is not available for this account."))}</section>` : detailOpen ? detailPage : listPage}</div>`;
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
  root.querySelectorAll("[data-access-project-enabled]").forEach((input) => input.addEventListener("change", () => {
    const section = input.closest(".user-permission-project");
    section?.querySelectorAll("[data-access-panel], [data-access-project-permission]").forEach((control) => { control.disabled = !input.checked; });
    const state = section?.querySelector(".user-permission-project-head small");
    if (state) state.textContent = input.checked ? (fa ? "دسترسی پروژه فعال" : "Project access enabled") : (fa ? "دسترسی پروژه غیرفعال" : "Project access disabled");
  }));
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    try {
      if (button.hasAttribute("data-toggle-create")) { root.querySelector("[data-user-create-dialog]")?.showModal(); root.querySelector("[name=displayName]")?.focus(); return; }
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
      if (button.hasAttribute("data-focus-user-edit")) {
        activeTab = "info";
        detailOpen = true;
        rerender();
        root.querySelector('[data-user-field="displayName"]')?.focus();
        return;
      }
      if (button.hasAttribute("data-close-create")) { root.querySelector("[data-user-create-dialog]")?.close(); return; }
      if (button.hasAttribute("data-clear-user-filters")) { userFilters = { search: "", status: "all", project: "all" }; rerender(); return; }
      if (button.hasAttribute("data-user-back")) { detailOpen = false; rerender(); return; }
      if (button.dataset.selectUser) { selectedId = button.dataset.selectUser; activeTab = button.dataset.userTargetTab || "info"; detailOpen = true; await refreshData(); return rerender(); }
      if (button.dataset.userTab) {
        activeTab = button.dataset.userTab;
        detailOpen = true;
        rerender();
        if (activeTab === "activity") {
          const activity = document.querySelector("#content-root [data-user-activity]");
          try {
            const data = await callApi(`/api/audit?userId=${encodeURIComponent(selectedId)}`);
            if (activity?.isConnected) activity.innerHTML = data.events.length ? `<ul>${data.events.map((item) => `<li>${esc(new Date(item.createdAt).toLocaleString(fa ? "fa-IR-u-ca-persian" : "en-US"))} · ${esc(item.action)} · ${esc(item.actorName || (fa ? "سامانه" : "System"))}</li>`).join("")}</ul>` : (fa ? "فعالیتی ثبت نشده است." : "No activity recorded.");
          } catch (error) { if (activity?.isConnected) activity.textContent = error.message; }
        }
        return;
      }
      if (button.dataset.userSaveProfile !== undefined) {
        const profile = Object.fromEntries(["displayName", "email", "phone"].map((key) => [key, root.querySelector(`[data-user-field="${key}"]`)?.value || ""]));
        await callApi(`/api/users/${encodeURIComponent(selectedId)}`, { method: "PATCH", body: JSON.stringify(profile) });
        await refreshData(); rerender(); return;
      }
      if (button.dataset.userToggleStatus !== undefined) {
        const enable = button.dataset.userToggleStatus === "true";
        if (!window.confirm(fa ? (enable ? "این حساب فعال شود؟" : "این حساب غیرفعال و نشست‌های آن لغو شوند؟") : (enable ? "Enable this account?" : "Disable this account and revoke its sessions?"))) return;
        await callApi(`/api/users/${encodeURIComponent(selectedId)}/status`, { method: "PATCH", body: JSON.stringify({ isActive: button.dataset.userToggleStatus === "true" }) });
        await refreshData(); rerender(); return;
      }
      if (button.dataset.userResetPassword !== undefined) {
        const password = window.prompt(fa ? "رمز موقت را وارد کنید (حداقل ۱۰ نویسه):" : "Enter a temporary password (10 or more characters):");
        if (!password) return;
        await callApi(`/api/users/${encodeURIComponent(selectedId)}/password-reset`, { method: "POST", body: JSON.stringify({ password }) });
        window.alert(fa ? "رمز بازنشانی شد. کاربر باید پس از ورود آن را تغییر دهد." : "Password reset. The user must change it after signing in."); return;
      }
      if (button.dataset.userSaveAccess !== undefined) {
        const byProject = new Map(workspaceProjects.map((project) => [String(project.id), { projectId: String(project.id), isActive: false, panelIds: [], permissions: [] }]));
        root.querySelectorAll("[data-access-panel]:checked").forEach((input) => byProject.get(input.dataset.accessProject)?.panelIds.push(input.dataset.accessPanel));
        root.querySelectorAll("[data-access-project-permission]:checked").forEach((input) => byProject.get(input.dataset.accessProject)?.permissions.push(input.dataset.accessProjectPermission));
        const globalPermissions = [...root.querySelectorAll("[data-global-permission]:checked")].map((input) => input.dataset.globalPermission);
        const access = await callApi(`/api/users/${encodeURIComponent(selectedId)}/access`);
        for (const item of access.projects || []) {
          const target = byProject.get(item.projectId);
          if (target) { target.isActive = Boolean(item.isActive); target.panelIds = [...item.panelIds]; target.permissions = [...item.permissions]; }
        }
        for (const input of root.querySelectorAll("[data-access-project-enabled]")) {
          const target = byProject.get(input.dataset.accessProjectEnabled);
          if (target) target.isActive = input.checked;
        }
        for (const input of root.querySelectorAll("[data-access-panel]")) {
          const target = byProject.get(input.dataset.accessProject);
          if (!target) continue;
          target.panelIds = target.panelIds.filter((id) => id !== input.dataset.accessPanel);
          if (input.checked) target.panelIds.push(input.dataset.accessPanel);
        }
        for (const input of root.querySelectorAll("[data-access-project-permission]")) {
          const target = byProject.get(input.dataset.accessProject);
          if (!target) continue;
          target.permissions = target.permissions.filter((id) => id !== input.dataset.accessProjectPermission);
          if (input.checked) target.permissions.push(input.dataset.accessProjectPermission);
        }
        for (const target of byProject.values()) {
          if (!target.isActive) { target.panelIds = []; target.permissions = []; }
          target.panelIds = [...new Set(target.panelIds)];
          target.permissions = [...new Set(target.permissions)];
        }
        const previousByProject = new Map((access.projects || []).map((p) => [String(p.projectId), p]));
        const projectName = (id) => workspaceProjects.find((p) => String(p.id) === id)?.name || id;
        const addedProjects = [], removedProjects = [], addedPanels = [], removedPanels = [], addedPermissions = [], removedPermissions = [];
        for (const [id, next] of byProject) {
          const previous = previousByProject.get(id) || { isActive: false, panelIds: [], permissions: [] };
          if (!previous.isActive && next.isActive) addedProjects.push(projectName(id));
          if (previous.isActive && !next.isActive) removedProjects.push(projectName(id));
          for (const panel of next.panelIds) if (!(previous.panelIds || []).includes(panel)) addedPanels.push(`${projectName(id)} · ${panel}`);
          for (const panel of previous.panelIds || []) if (!next.panelIds.includes(panel)) removedPanels.push(`${projectName(id)} · ${panel}`);
          for (const permission of next.permissions) if (!(previous.permissions || []).includes(permission)) addedPermissions.push(`${projectName(id)} · ${permission}`);
          for (const permission of previous.permissions || []) if (!next.permissions.includes(permission)) removedPermissions.push(`${projectName(id)} · ${permission}`);
        }
        const oldGlobal = access.globalPermissions || [], newGlobal = activeTab === "permissions" ? globalPermissions : oldGlobal;
        for (const permission of newGlobal) if (!oldGlobal.includes(permission)) addedPermissions.push(permission);
        for (const permission of oldGlobal) if (!newGlobal.includes(permission)) removedPermissions.push(permission);
        const summary = [
          ...(addedProjects.length ? [`+ ${fa ? "پروژه‌های افزوده‌شده" : "Projects added"}: ${addedProjects.join("، ")}`] : []),
          ...(removedProjects.length ? [`− ${fa ? "پروژه‌های لغوشده (همراه پنل‌ها و مجوزهای وابسته)" : "Projects revoked (including dependent panels and permissions)"}: ${removedProjects.join("، ")}`] : []),
          ...(addedPanels.length ? [`+ ${fa ? "دسترسی کامل پنل" : "Full panel access"}: ${addedPanels.join("، ")}`] : []),
          ...(removedPanels.length ? [`− ${fa ? "دسترسی پنل لغوشده" : "Panel access removed"}: ${removedPanels.join("، ")}`] : []),
          ...(addedPermissions.length ? [`+ ${fa ? "مجوزها" : "Permissions"}: ${addedPermissions.join("، ")}`] : []),
          ...(removedPermissions.length ? [`− ${fa ? "مجوزهای لغوشده" : "Permissions removed"}: ${removedPermissions.join("، ")}`] : []),
        ];
        if (!summary.length) { window.alert(fa ? "تغییری برای ذخیره وجود ندارد." : "There are no changes to save."); return; }
        if (!window.confirm(`${fa ? "بازبینی تغییرات دسترسی" : "Review access changes"}\n\n${summary.join("\n")}`)) return;
        await callApi(`/api/users/${encodeURIComponent(selectedId)}/access`, { method: "PUT", body: JSON.stringify({ globalPermissions: activeTab === "permissions" ? globalPermissions : access.globalPermissions, projects: [...byProject.values()] }) });
        await refreshData(); rerender(); return;
      }
    } catch (error) { window.alert(fa && error.message === "Passwords do not match" ? "رمزها با هم مطابقت ندارند." : error.message); }
  });
  root.querySelector("[data-user-create-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      if (values.password !== values.confirmPassword) throw new Error("Passwords do not match");
      delete values.confirmPassword;
      const data = await callApi("/api/users", { method: "POST", body: JSON.stringify(values) });
      form.reset(); selectedId = data.user.id; activeTab = "info"; detailOpen = true; await refreshData(); rerender();
    } catch (error) { window.alert(fa && error.message === "Passwords do not match" ? "رمزها با هم مطابقت ندارند." : error.message); }
  });
}
