import { Canvas, Line, Rect, Text, Group, FabricImage } from "fabric";
import * as pdfjs from "pdfjs-dist/build/pdf.mjs";
import { addressToBinary, addressToBits, bitsToAddress, validateDeviceAddress } from "./dip-address.js";
import { mountDipSwitch } from "./dip-switch.js";
import "./floor-plan.css";

// PDF.js worker is bundled by Vite so page rendering remains local to the browser.
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
const kinds = [
  { type: "SD", en: "Smoke Detector", fa: "دتکتور دود" }, { type: "HD", en: "Heat Detector", fa: "دتکتور حرارت" },
  { type: "MS", en: "Multi-Sensor", fa: "دتکتور مولتی" }, { type: "MCP", en: "Manual Call Point", fa: "شستی اعلام حریق" },
  { type: "SND/FL", en: "Sounder / Flasher", fa: "آژیر فلاشر" }, { type: "MOD", en: "Control / Monitor Module", fa: "ماژول کنترل / مانیتور" },
  { type: "FACP", en: "Fire Alarm Control Panel", fa: "پنل اعلام حریق" },
];
const request = async (url, options = {}) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try { message = (await response.json()).error || message; } catch { /* Keep HTTP fallback. */ }
    throw new Error(message);
  }
  return response;
};

export async function mountFloorPlanModule(root, options = {}) {
  if (!root) return;
  if (root._floorPlanCleanup) root._floorPlanCleanup();
  const { projects = [], panelDevices = {}, panelGroupSettings = {}, initialProjectId = "", initialPanelId = "", language = "fa", deviceIcons = {}, deviceIconUrls = {}, deviceIconHoverUrls = {}, loopDeviceTypes = [], onDeviceAddressChange = null, onRegisterFloorPlanDevice = null } = options;
  let dipSwitch = null, originalAddress = null, draftAddress = null, editorIdentity = "", syncingAddress = false;
  const initialProject = projects.find((project) => project.id === initialProjectId);
  const panelHasLoopCards = (panelId) => Array.isArray(panelDevices[panelId]) && panelDevices[panelId].length > 0;
  const resolvedInitialPanelId = panelHasLoopCards(initialPanelId)
    ? initialPanelId
    : initialProject?.panels.find((panel) => panelHasLoopCards(panel.id))?.id || initialPanelId;
  const panelNumberFor = (panelId, projectId = selectedPlan?.projectId || initialProjectId) => {
    const panels = projects.find((project) => project.id === projectId)?.panels || [];
    const index = panels.findIndex((panel) => panel.id === panelId);
    return index < 0 ? "" : Number(panels[index].number) || index + 1;
  };
  const loopNumberFor = (panelId, loopCardId) => {
    const index = (panelDevices[panelId] || []).findIndex((card) => card.id === loopCardId);
    return index < 0 ? "" : index + 1;
  };
  const isEnglish = language === "en";
  const direction = isEnglish ? "ltr" : "rtl";
  const words = isEnglish ? {
    deviceSettings: "DEVICE SETTINGS", title: "Floor Plan Layout", intro: "Choose a project and panel, map its registered devices, and export the stamped original.",
    upload: "Upload floor plan", save: "Save Layout", export: "Export PDF", deletePlan: "Delete plan", confirmDeletePlan: "Delete this floor plan and all its device layouts? This cannot be undone.", deletedPlan: "Floor plan and layouts deleted.", floorPlan: "Floor plan", choosePlan: "Select a floor plan…", page: "Page",
    choosePdf: "Choose a project and panel, then upload a PDF floor plan.", choosePlanBeforePlace: "Select or upload this project's floor plan first.", project: "Project", panel: "Panel", chooseProject: "Select a project…", choosePanel: "Select a panel…", devicesAvailable: "registered devices available", noDevices: "No saved device registry is available for this panel. Save this panel's device settings first.", lockedProject: "Project is fixed for this floor plan.", toolbox: "Devices for selected panel", dragTip: "Select a device to view its details; drag it onto the plan to place it.", snap: "Snap to grid",
    snapHint: "Shows alignment guides and snaps markers to a 10 pt grid. The guides are not exported.",
    selected: "Selected device", deviceType: "Device type", registered: "Registered device", manual: "Enter metadata manually", deviceId: "Device ID (optional)", enterId: "Enter ID",
    loop: "Loop card", address: "Device address", addressHint: "D024", zone: "Zone", label: "Label", labelHint: "e.g. L1-D024",
    apply: "Apply address", rotate: "Rotate 15°", remove: "Delete", fit: "Fit page", canvasHelp: "Wheel: zoom · Space or right-drag: pan · Select a device to move it",
    loading: "Loading PDF page…", uploading: "Uploading PDF…", pageStatus: (n) => `Page ${n}`,
    planStatus: (name, count) => `${name} · ${count} page${count === 1 ? "" : "s"}`,
    saved: (count, page) => `Saved ${count} device${count === 1 ? "" : "s"} on page ${page}.`,
    preparing: "Preparing vector PDF export…", downloaded: "Export downloaded.",
    error: "Floor plan service temporarily unavailable", apiOutdated: "The API server on port 3001 is outdated. Stop that process and restart it with npm run api.", badPdf: "Could not read or save this PDF", invalidPdf: "The uploaded file is not a valid PDF", requiredPdf: "A PDF file is required",
    unreadablePdf: "The PDF file could not be parsed. It may be damaged or password-protected.",
    projectRequired: "Select a project before uploading a floor plan", projectImmutable: "The project assigned to a floor plan cannot be changed",
  } : {
    deviceSettings: "تنظیمات دیوایس‌ها", title: "نقشه و چیدمان دیوایس‌ها", intro: "پروژه و پنل را انتخاب کنید، دیوایس‌های ثبت‌شدهٔ آن را جانمایی و نسخهٔ اصلی را خروجی بگیرید.",
    upload: "بارگذاری نقشه", save: "ذخیرهٔ چیدمان", export: "خروجی PDF", deletePlan: "حذف نقشه", confirmDeletePlan: "این نقشه و همهٔ چیدمان‌های دیوایس آن حذف شود؟ این کار بازگشت‌پذیر نیست.", deletedPlan: "نقشه و چیدمان‌های آن حذف شدند.", floorPlan: "نقشهٔ طبقه", choosePlan: "انتخاب نقشه…", page: "صفحه",
    choosePdf: "ابتدا پروژه و پنل را انتخاب و سپس نقشهٔ PDF را بارگذاری کنید.", choosePlanBeforePlace: "ابتدا نقشهٔ این پروژه را انتخاب یا بارگذاری کنید.", project: "پروژه", panel: "پنل", chooseProject: "انتخاب پروژه…", choosePanel: "انتخاب پنل…", devicesAvailable: "دیوایس ثبت‌شده در دسترس", noDevices: "برای این پنل فهرست دیوایس ثبت‌شده‌ای پیدا نشد؛ ابتدا تنظیمات دیوایس‌های پنل را ذخیره کنید.", lockedProject: "پروژهٔ این پلان ثابت است.", toolbox: "دیوایس‌های پنل انتخاب‌شده", dragTip: "\u0628\u0631\u0627\u06cc \u0645\u0634\u0627\u0647\u062f\u0647\u0654 \u0645\u0634\u062e\u0635\u0627\u062a \u0631\u0648\u06cc \u062f\u06cc\u0648\u0627\u06cc\u0633 \u06a9\u0644\u06cc\u06a9 \u06a9\u0646\u06cc\u062f\u061b \u0628\u0631\u0627\u06cc \u0686\u06cc\u062f\u0646 \u0622\u0646 \u0631\u0627 \u0628\u06a9\u0634\u06cc\u062f \u0648 \u0631\u0648\u06cc \u0646\u0642\u0634\u0647 \u0631\u0647\u0627 \u06a9\u0646\u06cc\u062f.", snap: "خطوط راهنما",
    snapHint: "خطوط راهنما را نشان می‌دهد و نمادها را روی شبکهٔ ۱۰ پوینتی می‌چسباند؛ خطوط در PDF خروجی چاپ نمی‌شوند.",
    selected: "دیوایس انتخاب‌شده", deviceType: "نوع دیوایس", registered: "دیوایس ثبت‌شده", manual: "ورود دستی مشخصات", deviceId: "شناسهٔ دیوایس (اختیاری)", enterId: "شناسه را وارد کنید",
    loop: "کارت لوپ", address: "آدرس دیوایس", addressHint: "D024", zone: "زون", label: "برچسب", labelHint: "مثلاً L1-D024",
    apply: "ثبت آدرس", rotate: "چرخش ۱۵°", remove: "حذف", fit: "نمایش کامل صفحه", canvasHelp: "چرخ ماوس: بزرگ‌نمایی · Space یا کشیدن با راست‌کلیک: جابه‌جایی نقشه · برای حرکت دیوایس آن را انتخاب کنید",
    loading: "در حال بارگذاری صفحهٔ PDF…", uploading: "در حال بارگذاری فایل PDF…", pageStatus: (n) => `صفحهٔ ${n}`,
    planStatus: (name, count) => `${name} · ${count} صفحه`,
    saved: (count, page) => `${count} دیوایس در صفحهٔ ${page} ذخیره شد.`,
    preparing: "در حال آماده‌سازی خروجی PDF برداری…", downloaded: "فایل خروجی دانلود شد.",
    error: "سرویس نقشه موقتاً در دسترس نیست", apiOutdated: "نسخهٔ API فعال روی پورت ۳۰۰۱ قدیمی است و مسیر نقشه را نمی‌شناسد؛ پردازش آن را متوقف و دوباره با npm run api اجرا کنید.", badPdf: "خواندن یا ذخیرهٔ این PDF ممکن نشد", invalidPdf: "فایل انتخاب‌شده PDF معتبر نیست", requiredPdf: "لطفاً یک فایل PDF انتخاب کنید.",
    unreadablePdf: "خواندن فایل PDF ممکن نشد؛ ممکن است فایل آسیب‌دیده یا رمزدار باشد.",
    projectRequired: "برای بارگذاری نقشه ابتدا پروژه را انتخاب کنید.", projectImmutable: "پروژهٔ اختصاص‌یافته به پلان قابل تغییر نیست.",
  };
  const t = (key) => words[key];
  Object.assign(words, isEnglish ? {
    toolbox: "Devices", grouping: "Grouping", chooseGrouping: "Select a grouping...", noGroupings: "No input/output groupings are defined for this panel.",
    inputDevices: "Input devices", outputDevices: "Output devices", noGroupDevices: "No available devices in this group.", noPanel: "Select a panel first.", loopLabel: "Loop",
    fire: "fire", supervisory: "supervisory", fault: "fault", reset: "reset", preAlarm: "pre-alarm", disabledRelation: "Disabled. ",
  } : {
    toolbox: "\u062f\u06cc\u0648\u0627\u06cc\u0633\u200c\u0647\u0627", grouping: "\u06af\u0631\u0648\u0647\u200c\u0628\u0646\u062f\u06cc", chooseGrouping: "\u0627\u0646\u062a\u062e\u0627\u0628 \u06af\u0631\u0648\u0647\u200c\u0628\u0646\u062f\u06cc...",
    noGroupings: "\u0628\u0631\u0627\u06cc \u0627\u06cc\u0646 \u067e\u0646\u0644 \u06af\u0631\u0648\u0647\u200c\u0628\u0646\u062f\u06cc \u0648\u0631\u0648\u062f\u06cc/\u062e\u0631\u0648\u062c\u06cc \u062a\u0639\u0631\u06cc\u0641 \u0646\u0634\u062f\u0647 \u0627\u0633\u062a.",
    inputDevices: "\u062f\u06cc\u0648\u0627\u06cc\u0633\u200c\u0647\u0627\u06cc \u0648\u0631\u0648\u062f\u06cc", outputDevices: "\u062f\u06cc\u0648\u0627\u06cc\u0633\u200c\u0647\u0627\u06cc \u062e\u0631\u0648\u062c\u06cc", noGroupDevices: "\u062f\u06cc\u0648\u0627\u06cc\u0633 \u062f\u0631 \u0627\u06cc\u0646 \u06af\u0631\u0648\u0647 \u062f\u0631 \u062f\u0633\u062a\u0631\u0633 \u0646\u06cc\u0633\u062a.",
    noPanel: "\u0627\u0628\u062a\u062f\u0627 \u067e\u0646\u0644 \u0631\u0627 \u0627\u0646\u062a\u062e\u0627\u0628 \u06a9\u0646\u06cc\u062f.", loopLabel: "\u0644\u0648\u067e",
    fire: "\u062d\u0631\u06cc\u0642", supervisory: "\u0646\u0638\u0627\u0631\u062a\u06cc", fault: "\u062e\u0637\u0627", reset: "\u0631\u06cc\u0633\u062a", preAlarm: "\u067e\u06cc\u0634\u200c\u0647\u0634\u062f\u0627\u0631", disabledRelation: "\u063a\u06cc\u0631\u0641\u0639\u0627\u0644. ",
  });
  Object.assign(words, isEnglish ? {
    addDevice: "Add device", addDeviceTitle: "Register a device", addDeviceIntro: "The device and its grouping will be saved to this panel's settings.", loopCard: "Loop card", type: "Device type", address: "Address (1–254)", location: "Location", group: "Grouping", groupExisting: "Choose an existing grouping", groupNew: "Create a grouping", groupSide: "Add device as", inputSide: "Input device", outputSide: "Output device", newInputGroup: "New input group number", newOutputGroup: "New output group number", cancel: "Cancel", register: "Register device", savingDevice: "Saving…", registeredDevice: "Device and grouping saved to panel settings.", registeredNoPlan: "Device saved. Upload or select a floor plan to place it.", requiredField: "Complete all required fields.", addressTaken: "This address is already used on the selected loop card.", groupingExists: "That grouping already exists. Choose it from the list.", saveDeviceFailed: "Could not save the device to panel settings.", choosePanelForDevice: "Select a panel with a loop card first."
  } : {
    addDevice: "افزودن دیوایس", addDeviceTitle: "ثبت دیوایس جدید", addDeviceIntro: "دیوایس و گروه‌بندی آن در تنظیمات همین پنل ذخیره می‌شود.", loopCard: "کارت لوپ", type: "نوع دیوایس", address: "آدرس (۱ تا ۲۵۴)", location: "موقعیت", group: "گروه‌بندی", groupExisting: "انتخاب گروه‌بندی موجود", groupNew: "تعریف گروه‌بندی جدید", groupSide: "افزودن دیوایس به‌عنوان", inputSide: "دیوایس ورودی", outputSide: "دیوایس خروجی", newInputGroup: "شماره گروه ورودی", newOutputGroup: "شماره گروه خروجی", cancel: "انصراف", register: "ثبت دیوایس", savingDevice: "در حال ذخیره…", registeredDevice: "دیوایس و گروه‌بندی در تنظیمات پنل ذخیره شدند.", registeredNoPlan: "دیوایس ذخیره شد. برای جانمایی، نقشه‌ای بارگذاری یا انتخاب کنید.", requiredField: "فیلدهای ضروری را کامل کنید.", addressTaken: "این آدرس در کارت لوپ انتخاب‌شده استفاده شده است.", groupingExists: "این گروه‌بندی از قبل وجود دارد؛ آن را از فهرست انتخاب کنید.", saveDeviceFailed: "ذخیره دیوایس در تنظیمات پنل انجام نشد.", choosePanelForDevice: "ابتدا پنلی را انتخاب کنید که کارت لوپ دارد."
  });
  Object.assign(words, isEnglish ? {
    unsavedLayoutTitle: "Unsaved floor plan changes", unsavedLayoutBody: "The floor plan has changes that are not saved yet. Save them before leaving?",
    saveAndLeave: "Save and leave", leaveWithoutSaving: "Discard changes", stayOnPage: "Cancel", layoutSaveFailed: "The layout could not be saved. You can retry or discard the changes.",
  } : {
    unsavedLayoutTitle: "\u062a\u063a\u06cc\u06cc\u0631\u0627\u062a \u0630\u062e\u06cc\u0631\u0647\u200c\u0646\u0634\u062f\u0647\u0654 \u0646\u0642\u0634\u0647", unsavedLayoutBody: "\u0686\u06cc\u062f\u0645\u0627\u0646 \u0646\u0642\u0634\u0647 \u062a\u063a\u06cc\u06cc\u0631 \u06a9\u0631\u062f\u0647 \u0648 \u0647\u0646\u0648\u0632 \u0630\u062e\u06cc\u0631\u0647 \u0646\u0634\u062f\u0647 \u0627\u0633\u062a. \u067e\u06cc\u0634 \u0627\u0632 \u062e\u0631\u0648\u062c\u060c \u0622\u0646 \u0631\u0627 \u0630\u062e\u06cc\u0631\u0647 \u0645\u06cc\u200c\u06a9\u0646\u06cc\u062f\u061f",
    saveAndLeave: "\u0630\u062e\u06cc\u0631\u0647 \u0648 \u062e\u0631\u0648\u062c", leaveWithoutSaving: "\u062e\u0631\u0648\u062c \u0628\u062f\u0648\u0646 \u0630\u062e\u06cc\u0631\u0647", stayOnPage: "\u0627\u0646\u0635\u0631\u0627\u0641", layoutSaveFailed: "\u0630\u062e\u06cc\u0631\u0647\u0654 \u0686\u06cc\u062f\u0645\u0627\u0646 \u0627\u0646\u062c\u0627\u0645 \u0646\u0634\u062f. \u062f\u0648\u0628\u0627\u0631\u0647 \u062a\u0644\u0627\u0634 \u06a9\u0646\u06cc\u062f \u06cc\u0627 \u062a\u063a\u06cc\u06cc\u0631\u0627\u062a \u0631\u0627 \u06a9\u0646\u0627\u0631 \u0628\u06af\u0630\u0627\u0631\u06cc\u062f.",
  });
  const translateError = (message) => ({
    "Floor plan service temporarily unavailable": words.error,
    "Could not read or save this PDF": words.badPdf,
    "The uploaded file is not a valid PDF": words.invalidPdf,
    "A PDF file is required": words.requiredPdf,
    "The uploaded file is not a readable PDF": words.unreadablePdf,
    "Select a project before uploading a floor plan": words.projectRequired,
    "A project is required": words.projectRequired,
    "The project assigned to a floor plan cannot be changed": words.projectImmutable,
  }[message] || (isEnglish ? message : `خطا: ${message}`));
  const groupRelationsForPanel = (panelId) => {
    const settings = panelGroupSettings[panelId] || {};
    const relations = new Map();
    [settings.ioGroups, settings.ioRelations, settings.ioSavedRelations].forEach((store) => {
      Object.entries(store || {}).forEach(([key, relation]) => {
        const match = /^(\d+)-(\d+)$/.exec(key);
        if (!match) return;
        const inputGroup = Number(relation?.inputGroupNumber || match[1]);
        const outputGroup = Number(relation?.outputGroupNumber || match[2]);
        const id = `${inputGroup}-${outputGroup}`;
        relations.set(id, { ...(relations.get(id) || {}), ...(relation || {}), inputGroupNumber: inputGroup, outputGroupNumber: outputGroup });
      });
    });
    return [...relations.entries()].map(([id, relation]) => ({ id, ...relation }))
      .sort((a, b) => a.inputGroupNumber - b.inputGroupNumber || a.outputGroupNumber - b.outputGroupNumber);
  };
  const firstGroupRelationId = (panelId) => groupRelationsForPanel(panelId)[0]?.id || "";
  let plans = [], selectedPlan = null, selectedPlanId = "", selectedProjectId = initialProject?.id || "", selectedPanelId = initialProject?.panels.some((panel) => panel.id === resolvedInitialPanelId) ? resolvedInitialPanelId : "", selectedGroupId = "", selectedToolDevice = null, returnPreviewKey = "", pageNumber = 1, pdfDocument = null, canvas = null, isBusy = false, planLayouts = null, layoutDirty = false;
  selectedGroupId = firstGroupRelationId(selectedPanelId);
  const placingDeviceKeys = new Set();
  let currentBackground = null, snap = false, snapGridLines = [], draggedDeviceMarker = null;
  const canvasCleanups = [];
  const escapeText = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const deviceKind = (device) => ({ smoke: "SD", heat: "HD", multi: "MS", manual: "MCP", sounder: "SND/FL", input: "MOD" }[device.type] || "MOD");
  const addressOf = (device) => { const value = String(device.number ?? device.address ?? device.ip ?? device.id ?? ""); return isQuestionMarkCorruption(value) ? String(device.id ?? "") : value; };
  const iconKeyOf = (device) => device.type || "smoke";
  const deviceKey = (device) => `${device.panelId || ""}:${device.deviceId || ""}`;
  const deviceLabel = (type) => { const kind = kindDetails(type); return isEnglish ? kind.en : kind.fa; };
  const isQuestionMarkCorruption = (value) => /\?{2,}/.test(String(value ?? "").trim()) && /^[\s?/:._-]+$/.test(String(value ?? "").trim());
  const safeDeviceText = (value, fallback = "") => isQuestionMarkCorruption(value) ? fallback : String(value ?? "");
  const toLatinDigits = (value) => String(value ?? "").replace(/[۰-۹٠-٩]/g, (digit) => "0123456789"[digit.charCodeAt(0) >= 0x660 ? digit.charCodeAt(0) - 0x660 : digit.charCodeAt(0) - 0x6f0]);
  const toPersianDigits = (value) => String(value ?? "").replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[digit]);
  const addressPrefix = isEnglish ? "Address:" : "\u0622\u062f\u0631\u0633:";
  const addressInvalidMessage = isEnglish ? "Address must be a whole number from 1 to 254." : "\u0622\u062f\u0631\u0633 \u0628\u0627\u06cc\u062f \u0639\u062f\u062f \u0635\u062d\u06cc\u062d\u06cc \u0628\u06cc\u0646 1 \u062a\u0627 254 \u0628\u0627\u0634\u062f.";
  const mapAddressLabel = (value) => `A:${toLatinDigits(value)}`;
  const mapDeviceMetadataLabel = (data) => `P:${toLatinDigits(data.panelNumber ?? "")}/L:${toLatinDigits(data.loopNumber ?? "")}/${mapAddressLabel(safeDeviceText(data.address, ""))}`;
  const listAddressLabel = (value) => `${addressPrefix}${isEnglish ? toLatinDigits(value) : toPersianDigits(value)}`;
  const kindDetails = (type) => kinds.find((kind) => kind.type === type) || kinds[5];
  const html = `
    <div class="floor-plan-shell" lang="${isEnglish ? "en" : "fa"}" dir="${direction}">
      <header class="floor-plan-header">
        <div><span class="eyebrow">${t("deviceSettings")}</span><h2>${t("title")}</h2><p>${t("intro")}</p></div>
        <div class="floor-plan-header-actions"><button id="fp-upload-trigger" class="fp-button fp-button-primary fp-header-action" type="button" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 14v5h14v-5"/></svg><span>${t("upload")}</span></button><input id="fp-upload" type="file" accept="application/pdf" hidden><button id="fp-delete-plan" class="fp-button fp-danger fp-delete-plan-button fp-header-action" type="button" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg><span>${t("deletePlan")}</span></button><button id="fp-save" class="fp-button fp-button-primary fp-header-action" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12l3 3v13H4V4z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></svg><span>${t("save")}</span></button><button id="fp-export" class="fp-button fp-header-action" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12m0 0 5-5m-5 5-5-5"/><path d="M5 20h14"/></svg><span>${t("export")}</span></button></div>
      </header>
      <div class="fp-plan-bar"><label class="fp-project-field">${t("project")}<select id="fp-project"><option value="">${t("chooseProject")}</option>${projects.map((p) => `<option value="${escapeText(p.id)}">${escapeText(p.name)}</option>`).join("")}</select></label><label>${t("floorPlan")}<select id="fp-plan-select" disabled><option value="">${t("choosePlan")}</option></select></label><label>${t("page")}<select id="fp-page" disabled></select></label><span id="fp-status" role="status">${t("choosePdf")}</span></div>
      <div class="fp-workspace">
        <aside class="fp-toolbox"><h3>${t("toolbox")}</h3><p>${t("dragTip")}</p><label class="fp-panel-field">${t("panel")}<select id="fp-panel" disabled><option value="">${t("choosePanel")}</option></select></label><label class="fp-group-field">${t("grouping")}<select id="fp-group" disabled><option value="">${t("chooseGrouping")}</option></select></label><div id="fp-group-description" class="fp-group-description" role="status">${t("noPanel")}</div><small id="fp-device-count"></small><div id="fp-device-list" class="fp-group-device-columns"></div>
          <div class="fp-snap-control"><label class="fp-check"><input id="fp-snap" type="checkbox"> ${t("snap")}</label><small>${t("snapHint")}</small></div>
          <div class="fp-inspector"><h3>${t("selected")}</h3><label>${t("deviceType")}<input id="fp-type" type="text" readonly disabled></label><label>${t("loop")}<input id="fp-loop" type="text" readonly disabled></label><label>${t("address")}<input id="fp-address" type="number" min="1" max="254" step="1" inputmode="numeric" dir="ltr" placeholder="${t("addressHint")}" disabled></label><div id="fp-dip-switch" class="fp-dip-switch" aria-label="8-bit device address switch"></div><div class="fp-binary-row"><span>${isEnglish ? "Binary address" : "\u0622\u062f\u0631\u0633 \u062f\u0648\u062f\u0648\u0626\u06cc"}</span><output id="fp-binary" dir="ltr">00000000</output></div><small id="fp-address-status" class="fp-address-status" role="status"></small><div class="fp-inspector-actions"><button id="fp-apply" class="fp-button fp-button-primary" disabled>${isEnglish ? "Save address" : "\u0630\u062e\u06cc\u0631\u0647 \u0622\u062f\u0631\u0633"}</button><button id="fp-address-cancel" class="fp-button" disabled>${isEnglish ? "Cancel" : "\u0627\u0646\u0635\u0631\u0627\u0641"}</button><button id="fp-rotate" class="fp-button" disabled>${t("rotate")}</button><button id="fp-delete" class="fp-button fp-danger" disabled>${t("remove")}</button></div></div>
        </aside>
        <section class="fp-canvas-panel"><div class="fp-canvas-tools"><button id="fp-fit" class="fp-button" disabled>${t("fit")}</button><button id="fp-add-device" class="fp-button fp-add-device-button" type="button" disabled><span aria-hidden="true">＋</span>${t("addDevice")}</button><span>${t("canvasHelp")}</span></div><div class="fp-canvas-scroll"><div class="fp-canvas-holder"><canvas id="fp-canvas"></canvas></div></div></section>
      </div>
    </div>`;
  root.innerHTML = html;
  const $ = (selector) => root.querySelector(selector);
  try { dipSwitch = mountDipSwitch($("#fp-dip-switch"), { states: Array(8).fill(false), onChange: (bits) => { if (syncingAddress || draftAddress === null) return; setAddressDraft(bitsToAddress(bits)); } }); }
  catch (error) { $("#fp-address-status").textContent = error.message; }
  const status = (message, error = false) => { const el = $("#fp-status"); el.textContent = message; el.classList.toggle("error", error); };
  const loopCardsForPanel = () => panelDevices[selectedPanelId] || [];
  const selectedGroupRelation = () => groupRelationsForPanel(selectedPanelId).find((relation) => relation.id === selectedGroupId) || null;
  const groupRefs = (relation, kind) => {
    if (!relation) return [];
    const settings = panelGroupSettings[selectedPanelId] || {};
    const groupNumber = kind === "input" ? relation.inputGroupNumber : relation.outputGroupNumber;
    const legacy = settings.ioGroups?.[relation.id] || {};
    const refs = kind === "input" ? (settings.ioInputGroups?.[groupNumber] || legacy.inputs) : (settings.ioOutputGroups?.[groupNumber] || legacy.outputs);
    return Array.isArray(refs) ? refs : [];
  };
  const resolveGroupDevices = (relation, kind) => groupRefs(relation, kind).map((ref) => {
    const card = loopCardsForPanel().find((item) => item.id === ref.loopId);
    const device = card?.devices?.find((item) => item.id === ref.deviceId);
    return card && device ? { card, device, kind } : null;
  }).filter(Boolean);
  const allDevicesForPanel = () => {
    const relation = selectedGroupRelation();
    return [...resolveGroupDevices(relation, "input"), ...resolveGroupDevices(relation, "output")];
  };
  const groupForDevice = (panelId, deviceId) => groupRelationsForPanel(panelId).find((relation) => {
    const settings = panelGroupSettings[panelId] || {};
    const legacy = settings.ioGroups?.[relation.id] || {};
    const inputs = settings.ioInputGroups?.[relation.inputGroupNumber] || legacy.inputs || [];
    const outputs = settings.ioOutputGroups?.[relation.outputGroupNumber] || legacy.outputs || [];
    return [...(Array.isArray(inputs) ? inputs : []), ...(Array.isArray(outputs) ? outputs : [])].some((ref) => ref.deviceId === deviceId);
  }) || null;
  const revealDeviceInList = (deviceId) => {
    const list = $("#fp-device-list");
    const item = [...list.querySelectorAll("[data-device-id]")].find((element) => element.dataset.deviceId === deviceId);
    if (!item) return;
    const listBounds = list.getBoundingClientRect(), itemBounds = item.getBoundingClientRect();
    if (itemBounds.top < listBounds.top) list.scrollTop -= listBounds.top - itemBounds.top;
    else if (itemBounds.bottom > listBounds.bottom) list.scrollTop += itemBounds.bottom - listBounds.bottom;
  };
  const placedDeviceKeys = () => {
    const keys = new Set((planLayouts || []).filter((item) => Number(item.pageNumber) !== pageNumber).map(deviceKey));
    placingDeviceKeys.forEach((key) => keys.add(key));
    canvas?.getObjects().filter((object) => object.fpDevice).forEach((object) => keys.add(deviceKey(object.fpDevice)));
    return keys;
  };
  const updatePanelChoices = () => {
    const project = projects.find((item) => item.id === selectedProjectId);
    const panel = $("#fp-panel");
    panel.disabled = !project;
    panel.innerHTML = `<option value="">${t("choosePanel")}</option>${(project?.panels || []).map((item) => `<option value="${escapeText(item.id)}">${escapeText(item.name)} · ${escapeText(item.code || "")}</option>`).join("")}`;
    if (project?.panels.some((item) => item.id === selectedPanelId)) panel.value = selectedPanelId;
    updateDeviceChoices();
    setUiState();
  };
  const updateDeviceChoices = () => {
    const relations = groupRelationsForPanel(selectedPanelId);
    if (!relations.some((relation) => relation.id === selectedGroupId)) selectedGroupId = relations[0]?.id || "";
    const groupSelect = $("#fp-group");
    groupSelect.innerHTML = `<option value="">${relations.length ? t("chooseGrouping") : t("noGroupings")}</option>${relations.map((relation) => `<option value="${escapeText(relation.id)}">${isEnglish ? `Input ${relation.inputGroupNumber} > Output ${relation.outputGroupNumber}` : `\u0648\u0631\u0648\u062f\u06cc ${toPersianDigits(relation.inputGroupNumber)} > \u062e\u0631\u0648\u062c\u06cc ${toPersianDigits(relation.outputGroupNumber)}`}</option>`).join("")}`;
    groupSelect.disabled = !selectedPanelId || !relations.length || isBusy;
    groupSelect.value = selectedGroupId;
    const relation = selectedGroupRelation();
    const conditionLabels = { fire: t("fire"), supervisory: t("supervisory"), fault: t("fault"), reset: t("reset"), "pre-alarm": t("preAlarm") };
    const inputGroup = relation?.inputGroupNumber;
    const outputGroup = relation?.outputGroupNumber;
    const activeCount = Math.max(1, Number(relation?.activeCount) || 1);
    const delay = Math.max(0, Number(relation?.delay) || 0);
    const condition = conditionLabels[relation?.outputActiveFor] || t("fire");
    const description = !relation ? (selectedPanelId ? t("noGroupings") : t("noPanel")) : isEnglish
      ? `${relation.status === false ? t("disabledRelation") : ""}When at least ${activeCount} device${activeCount === 1 ? "" : "s"} in Input Group ${inputGroup} detect ${condition}, Output Group ${outputGroup}${delay ? ` activates after ${delay} seconds` : " activates"}.`
      : `${relation.status === false ? t("disabledRelation") : ""}\u0628\u0627 \u062a\u0634\u062e\u06cc\u0635 ${condition} \u062a\u0648\u0633\u0637 \u062d\u062f\u0627\u0642\u0644 ${toPersianDigits(activeCount)} \u062f\u06cc\u0648\u0627\u06cc\u0633 \u0627\u0632 \u06af\u0631\u0648\u0647 \u0648\u0631\u0648\u062f\u06cc ${toPersianDigits(inputGroup)}\u060c \u06af\u0631\u0648\u0647 \u062e\u0631\u0648\u062c\u06cc ${toPersianDigits(outputGroup)}${delay ? ` \u067e\u0633 \u0627\u0632 ${toPersianDigits(delay)} \u062b\u0627\u0646\u06cc\u0647` : ""} \u0641\u0639\u0627\u0644 \u0645\u06cc\u200c\u0634\u0648\u062f.`;
    $("#fp-group-description").textContent = description;
    const placed = placedDeviceKeys();
    const inputDevices = resolveGroupDevices(relation, "input").filter(({ device }) => {
      const key = deviceKey({ panelId: selectedPanelId, deviceId: device.id });
      return !placed.has(key) || key === returnPreviewKey || (selectedToolDevice && key === deviceKey({ panelId: selectedPanelId, deviceId: selectedToolDevice.device.id }));
    });
    const outputDevices = resolveGroupDevices(relation, "output").filter(({ device }) => {
      const key = deviceKey({ panelId: selectedPanelId, deviceId: device.id });
      return !placed.has(key) || key === returnPreviewKey || (selectedToolDevice && key === deviceKey({ panelId: selectedPanelId, deviceId: selectedToolDevice.device.id }));
    });
    const availableCount = inputDevices.length + outputDevices.length;
    $("#fp-device-count").textContent = `${availableCount} ${t("devicesAvailable")}`;
    const renderDevices = (devices) => devices.length ? devices.map(({ card, device }) => {
      const type = deviceKind(device), address = addressOf(device), name = safeDeviceText(device.name, "") || deviceLabel(type);
      const location = safeDeviceText(device.location, "");
      const key = deviceKey({ panelId: selectedPanelId, deviceId: device.id });
      const isSelected = selectedToolDevice && key === deviceKey({ panelId: selectedPanelId, deviceId: selectedToolDevice.device.id });
      const isPreview = key === returnPreviewKey;
      const cardLabel = escapeText(card.label || card.id || "");
      return `<button class="fp-device-tool${isSelected ? " is-selected" : ""}${isPreview ? " is-return-preview" : ""}" type="button" draggable="true" data-device-id="${escapeText(device.id)}" aria-pressed="${Boolean(isSelected || isPreview)}"><span class="fp-loop-icon">${deviceIcons[iconKeyOf(device)] || ""}</span><span>${escapeText(name)}<small class="fp-device-address" dir="${direction}">${escapeText(listAddressLabel(address))} · ${cardLabel}</small>${location ? `<small>${escapeText(location)}</small>` : ""}</span></button>`;
    }).join("") : `<div class="fp-group-empty">${t("noGroupDevices")}</div>`;
    $("#fp-device-list").innerHTML = `<section class="fp-group-device-section"><h4>${t("inputDevices")} <span>${inputDevices.length}</span></h4><div class="fp-device-list">${renderDevices(inputDevices)}</div></section><section class="fp-group-device-section"><h4>${t("outputDevices")} <span>${outputDevices.length}</span></h4><div class="fp-device-list">${renderDevices(outputDevices)}</div></section>`;
  };
  const setUiState = () => {
    $("#fp-project").disabled = Boolean(selectedPlan || selectedPlanId) || isBusy;
    $("#fp-panel").disabled = !selectedProjectId || isBusy;
    $("#fp-group").disabled = !selectedPanelId || !groupRelationsForPanel(selectedPanelId).length || isBusy;
    $("#fp-plan-select").disabled = !selectedProjectId || isBusy;
    $("#fp-delete-plan").hidden = !$("#fp-plan-select").value;
    $("#fp-delete-plan").disabled = !$("#fp-plan-select").value || isBusy;
    $("#fp-upload-trigger").disabled = !selectedProjectId || !selectedPanelId || Boolean(selectedPlan || selectedPlanId) || isBusy;
    $("#fp-upload-trigger").hidden = Boolean($("#fp-plan-select").value);
    $("#fp-save").disabled = !canvas || isBusy;
    $("#fp-export").disabled = !canvas || isBusy;
    $("#fp-page").disabled = !canvas || isBusy;
    $("#fp-fit").disabled = !canvas || isBusy;
    $("#fp-add-device").disabled = !selectedPanelId || !(panelDevices[selectedPanelId] || []).length || isBusy;
  };
  const updatePlanChoices = () => {
    const projectPlans = selectedProjectId ? plans.filter((plan) => plan.projectId === selectedProjectId || !plan.projectId) : [];
    $("#fp-plan-select").innerHTML = `<option value="">${t("choosePlan")}</option>${projectPlans.map((plan) => `<option value="${escapeText(plan.id)}">${escapeText(plan.name)}${plan.projectId ? "" : isEnglish ? " · unassigned" : " · بدون پروژه"}</option>`).join("")}`;
    $("#fp-plan-select").value = selectedPlanId || selectedPlan?.id || "";
    setUiState();
  };
  const clearCanvas = () => {
    while (canvasCleanups.length) canvasCleanups.pop()();
    canvas?.dispose(); canvas = null;
    currentBackground = null;
    snapGridLines = [];
  };
  const clearPlan = () => { clearCanvas(); pdfDocument = null; };
  let addDeviceModal = null;
  const cleanup = () => { clearPlan(); dipSwitch?.destroy(); dipSwitch = null; addDeviceModal?.remove(); addDeviceModal = null; };
  root._floorPlanCleanup = cleanup;
  const syncSnapGrid = () => {
    if (!canvas) return;
    if (snapGridLines.length) canvas.remove(...snapGridLines);
    snapGridLines = [];
    if (snap) {
      // At PDF.js scale 2, a 20 px interval is a 10 pt PDF-space grid.
      const step = 20;
      const guideOptions = { stroke: "rgba(32, 116, 174, 0.24)", strokeWidth: 0.6, selectable: false, evented: false, excludeFromExport: true };
      for (let x = step; x < canvas.getWidth(); x += step) snapGridLines.push(new Line([x, 0, x, canvas.getHeight()], guideOptions));
      for (let y = step; y < canvas.getHeight(); y += step) snapGridLines.push(new Line([0, y, canvas.getWidth(), y], guideOptions));
      canvas.add(...snapGridLines);
      canvas.getObjects().filter((object) => object.fpDevice).forEach((object) => canvas.bringObjectToFront(object));
    }
    canvas.requestRenderAll();
  };

  const setAddressDraft = (value) => {
    draftAddress = Number(value);
    syncingAddress = true;
    $("#fp-address").value = String(value);
    try {
      $("#fp-binary").textContent = addressToBinary(value);
      dipSwitch?.setStates(addressToBits(value));
      let validForDevice = true;
      try { validateDeviceAddress(draftAddress); } catch { validForDevice = false; }
      const changed = draftAddress !== originalAddress;
      $("#fp-address-status").textContent = !validForDevice
        ? (isEnglish ? "This switch pattern is address 0 or 255; loop-card addresses must be 1–254." : "\u0627\u06cc\u0646 \u062a\u0631\u06a9\u06cc\u0628 \u0622\u062f\u0631\u0633 \u06f0 \u06cc\u0627 \u06f2\u06f5\u06f5 \u0627\u0633\u062a\u061b \u0622\u062f\u0631\u0633 \u06a9\u0627\u0631\u062a \u0644\u0648\u067e \u0628\u0627\u06cc\u062f \u0628\u06cc\u0646 \u06f1 \u062a\u0627 \u06f2\u06f5\u06f4 \u0628\u0627\u0634\u062f.")
        : (changed ? (isEnglish ? "Unsaved changes" : "\u062a\u063a\u06cc\u06cc\u0631\u0627\u062a \u0630\u062e\u06cc\u0631\u0647 \u0646\u0634\u062f\u0647") : "");
      $("#fp-apply").disabled = !validForDevice || !changed;
      $("#fp-address-cancel").disabled = !changed;
    } catch (error) {
      $("#fp-address-status").textContent = isEnglish ? "Enter an 8-bit address (1–254 to save)." : "\u0622\u062f\u0631\u0633 \u0628\u0627\u06cc\u062f \u06cc\u06a9 \u0639\u062f\u062f ۸ \u0628\u06cc\u062a\u06cc \u0628\u0627\u0634\u062f (\u0628\u0631\u0627\u06cc \u0630\u062e\u06cc\u0631\u0647 ۱ \u062a\u0627 ۲۵۴).";
      $("#fp-apply").disabled = true;
      $("#fp-address-cancel").disabled = originalAddress === null;
    } finally { syncingAddress = false; }
  };
  const showDeviceDetails = (device, { placed = false } = {}) => {
    const nextIdentity = `${device.panelId || selectedPanelId}:${device.deviceId || device.id || ""}`;
    if (editorIdentity && editorIdentity !== nextIdentity && draftAddress !== originalAddress) {
      const discard = window.confirm(isEnglish ? "Discard this device's unsaved address change and select another device?" : "\u062a\u063a\u06cc\u06cc\u0631 \u0630\u062e\u06cc\u0631\u0647\u200c\u0646\u0634\u062f\u0647\u0654 \u0622\u062f\u0631\u0633 \u0631\u0627 \u0631\u0647\u0627 \u0648 \u062f\u06cc\u0648\u0627\u06cc\u0633 \u062f\u06cc\u06af\u0631 \u0631\u0627 \u0627\u0646\u062a\u062e\u0627\u0628 \u0645\u06cc\u200c\u06a9\u0646\u06cc\u062f\u061f");
      if (!discard) {
        const prior = allDevicesForPanel().find(({ device: item }) => `${selectedPanelId}:${item.id}` === editorIdentity);
        const priorMarker = canvas?.getObjects().find((item) => item.fpDevice && `${item.fpDevice.panelId || selectedPanelId}:${item.fpDevice.deviceId}` === editorIdentity);
        if (priorMarker) canvas.setActiveObject(priorMarker);
        else if (prior) { selectedToolDevice = prior; setSelected(null); }
        return;
      }
    }
    editorIdentity = nextIdentity;
    $("#fp-type").disabled = false;
    $("#fp-loop").disabled = false;
    $("#fp-address").disabled = false;
    $("#fp-apply").disabled = true;
    $("#fp-address-cancel").disabled = true;
    $("#fp-rotate").disabled = !placed;
    $("#fp-delete").disabled = !placed;
    $("#fp-type").value = deviceLabel(device.type);
    $("#fp-loop").value = device.loop || "";
    originalAddress = Number(toLatinDigits(addressOf(device)));
    setAddressDraft(originalAddress);
    $("#fp-apply").disabled = true;
  };
  const setSelected = (object) => {
    if (object?.fpDevice) {
      selectedToolDevice = null;
      showDeviceDetails(object.fpDevice, { placed: true });
      updateDeviceChoices();
      return;
    }
    if (selectedToolDevice) {
      showDeviceDetails({ ...selectedToolDevice.device, type: deviceKind(selectedToolDevice.device), loop: selectedToolDevice.card.label || selectedToolDevice.card.id || "" });
      return;
    }
    ["#fp-loop", "#fp-address", "#fp-type", "#fp-apply", "#fp-address-cancel", "#fp-rotate", "#fp-delete"].forEach((selector) => { $(selector).disabled = true; });
    $("#fp-type").value = "";
    $("#fp-loop").value = "";
    $("#fp-address").value = "";
    originalAddress = draftAddress = null;
    $("#fp-binary").textContent = "00000000";
    $("#fp-address-status").textContent = "";
    dipSwitch?.setStates(Array(8).fill(false));
    updateDeviceChoices();
  };
  const loadDeviceSymbol = async (iconUrl) => {
    const response = await fetch(iconUrl);
    if (!response.ok) throw new Error(`Could not load device symbol (${response.status})`);
    const source = await response.text();
    const normalizedSvg = source.replace(/<svg\b([^>]*)>/i, (_tag, attributes) => {
      // SVGs without explicit dimensions default to a 300x150 image viewport in
      // Fabric. Give them a square viewport so the full symbol stays visible.
      const viewAttributes = attributes.replace(/\s+(?:width|height|preserveAspectRatio)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
      return `<svg${viewAttributes} width="32" height="32" preserveAspectRatio="xMidYMid meet">`;
    });
    if (normalizedSvg === source) throw new Error("The device symbol SVG is invalid");
    const objectUrl = URL.createObjectURL(new Blob([normalizedSvg], { type: "image/svg+xml" }));
    try { return await FabricImage.fromURL(objectUrl); }
    finally { URL.revokeObjectURL(objectUrl); }
  };
  const buildDevice = async (data, x, y) => {
    const type = data.type || "SD", iconKey = data.iconType || "smoke";
    const iconUrl = deviceIconUrls[iconKey] || deviceIconUrls.smoke || "/icons/detector-normal.svg";
    const hoverIconUrl = deviceIconHoverUrls[iconKey];
    const nameText = safeDeviceText(data.name, deviceLabel(type));
    const metadataText = mapDeviceMetadataLabel(data);
    if (document.fonts?.load) await document.fonts.load(`600 10px Vazirmatn`, nameText);
    const icon = await loadDeviceSymbol(iconUrl);
    const iconScale = Math.min(28 / (icon.width || 32), 28 / (icon.height || 32));
    icon.set({ originX: "center", originY: "center", left: 0, top: -10, scaleX: iconScale, scaleY: iconScale, objectCaching: false });
    const hoverIcon = hoverIconUrl ? await loadDeviceSymbol(hoverIconUrl) : null;
    if (hoverIcon) hoverIcon.set({ originX: "center", originY: "center", left: 0, top: -10, scaleX: iconScale, scaleY: iconScale, objectCaching: false, visible: false, evented: false, selectable: false });
    const name = new Text(nameText, { fontFamily: "Vazirmatn", fontSize: 10, fontWeight: "600", fill: "#102a43", direction: isEnglish ? "ltr" : "rtl", originX: "center", originY: "center", left: 0, top: 14, textAlign: "center", splitByGrapheme: true });
    const labelOptions = { fontFamily: "Arial", fontSize: 8, fill: "#102a43", direction: "ltr", originX: "center", originY: "center", left: 0, textAlign: "center", splitByGrapheme: true };
    const metadata = new Text(metadataText, { ...labelOptions, top: 26 });
    // An invisible padding shape keeps Fabric's group bounds wider than the SVG,
    // avoiding edge clipping while retaining a small symbol on the plan.
    const bounds = new Rect({ width: 36, height: 42, left: 0, top: -10, originX: "center", originY: "center", fill: "rgba(0,0,0,0)", stroke: "rgba(0,0,0,0)", selectable: false, evented: false });
    const group = new Group(hoverIcon ? [icon, name, metadata, bounds, hoverIcon] : [icon, name, metadata, bounds], { left: x, top: y, originX: "center", originY: "center", angle: Number(data.rotation) || 0, hasControls: true, lockScalingX: true, lockScalingY: true, objectCaching: false, fpDevice: { ...data, type, iconType: iconKey } });
    group.fpHoverIcon = hoverIcon;
    group.fpNormalIcon = icon;
    group.fpMetadataText = metadata;
    // Keep the icon's center on the actual PDF coordinate even though its labels
    // extend below it and change the group's overall center.
    const iconObject = group.getObjects()[0];
    group.fpIconOffset = { x: iconObject.left || 0, y: iconObject.top || 0 };
    placeMarkerIconAt(group, x, y);
    return group;
  };
  const placeMarkerIconAt = (marker, x, y) => {
    const offset = marker.fpIconOffset || { x: 0, y: 0 }, radians = (marker.angle || 0) * Math.PI / 180;
    marker.set({ left: x - offset.x * Math.cos(radians) + offset.y * Math.sin(radians), top: y - offset.x * Math.sin(radians) - offset.y * Math.cos(radians) });
  };
  const markerIconPoint = (marker) => {
    const offset = marker.fpIconOffset || { x: 0, y: 0 }, radians = (marker.angle || 0) * Math.PI / 180;
    return { x: marker.left + offset.x * Math.cos(radians) - offset.y * Math.sin(radians), y: marker.top + offset.x * Math.sin(radians) + offset.y * Math.cos(radians) };
  };
  const renderPage = async () => {
    if (!selectedPlan) return;
    clearCanvas();
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const pdfCanvas = document.createElement("canvas");
    pdfCanvas.width = Math.ceil(viewport.width); pdfCanvas.height = Math.ceil(viewport.height);
    // PDF.js v4 expects the 2D context; passing the canvas element itself leaves
    // its internal canvasContext undefined and fails while reading `.canvas`.
    const pdfContext = pdfCanvas.getContext("2d", { alpha: false });
    await page.render({ canvasContext: pdfContext, viewport }).promise;
    canvas = new Canvas($("#fp-canvas"), { width: pdfCanvas.width, height: pdfCanvas.height, preserveObjectStacking: true, selection: true, backgroundColor: "#fff" });
    $(".fp-canvas-holder").style.width = `${pdfCanvas.width}px`;
    $(".fp-canvas-holder").style.height = `${pdfCanvas.height}px`;
    currentBackground = await FabricImage.fromURL(pdfCanvas.toDataURL("image/png"));
    currentBackground.set({ left: 0, top: 0, selectable: false, evented: false });
    canvas.backgroundImage = currentBackground;
    if (planLayouts === null) {
      const response = await request(`/api/floor-plans/${selectedPlan.id}/layout?allPages=true`);
      const layoutDevices = (await response.json()).devices || [];
      planLayouts = layoutDevices.filter((device) => ![device.type, device.deviceType, device.iconType].some((type) => ["zone", "io"].includes(type)));
    }
    for (const item of planLayouts.filter((device) => Number(device.pageNumber) === pageNumber)) {
      const loopCards = panelDevices[item.panelId] || [];
      const registeredEntry = loopCards.map((card) => ({ card, device: (card.devices || []).find((device) => device.id === item.deviceId) })).find((entry) => entry.device);
      const registered = registeredEntry?.device;
      const typeName = registered ? safeDeviceText(registered.name, "") || deviceLabel(deviceKind(registered)) : safeDeviceText(item.name, "") || deviceLabel(item.deviceType);
      const loopIndex = registeredEntry ? loopCards.findIndex((card) => card.id === registeredEntry.card.id) : -1;
      const loopNumber = loopIndex >= 0 ? loopIndex + 1 : Number(item.loop) || Number(String(item.loop || "").match(/\d+$/)?.[0]) || Number(String(item.loopCardId || "").match(/\d+$/)?.[0]) || "";
      const markerData = { ...item, projectId: selectedPlan.projectId, type: item.deviceType, iconType: item.iconType || registered?.type || "smoke", name: typeName, address: registered ? addressOf(registered) : safeDeviceText(item.address, ""), panelNumber: panelNumberFor(item.panelId, selectedPlan.projectId) || Number(item.panelNumber) || "", loopCardId: registeredEntry?.card.id || item.loopCardId || "", loopNumber, loop: String(loopNumber || "") };
      const marker = await buildDevice(markerData, item.normX * canvas.getWidth(), item.normY * canvas.getHeight());
      marker.fpDevice.deviceId = item.deviceId || "";
      canvas.add(marker);
    }
    syncSnapGrid();
    canvas.on("selection:created", (event) => setSelected(event.selected?.[0]));
    canvas.on("selection:updated", (event) => setSelected(event.selected?.[0]));
    canvas.on("selection:cleared", () => setSelected(null));
    canvas.on("object:added", () => { layoutDirty = true; });
    canvas.on("object:removed", () => { layoutDirty = true; });
    canvas.on("object:modified", () => { layoutDirty = true; });
    canvas.on("mouse:over", (event) => {
      const marker = event.target;
      if (!marker?.fpHoverIcon) return;
      marker.fpNormalIcon.set("visible", false);
      marker.fpHoverIcon.set("visible", true);
      canvas.requestRenderAll();
    });
    canvas.on("mouse:out", (event) => {
      const marker = event.target;
      if (!marker?.fpHoverIcon) return;
      marker.fpHoverIcon.set("visible", false);
      marker.fpNormalIcon.set("visible", true);
      canvas.requestRenderAll();
    });
    canvas.on("object:moving", (event) => {
      if (!event.target?.fpDevice) return;
      draggedDeviceMarker = event.target;
      if (!snap) return;
      // At PDF.js scale 2, 20 canvas pixels correspond to a 10 pt PDF grid.
      event.target.set({ left: Math.round(event.target.left / 20) * 20, top: Math.round(event.target.top / 20) * 20 });
    });
    // Holding Space temporarily enables drag-to-pan without interfering with symbol selection.
    let spaceDown = false;
    const keyDown = (event) => {
      if (event.code !== "Space" || event.target?.closest?.("input, textarea, select, button, [contenteditable='true'], [role='button']")) return;
      event.preventDefault();
      spaceDown = true;
      canvas.defaultCursor = "grab";
    };
    const keyUp = (event) => {
      if (event.code !== "Space" || !spaceDown) return;
      event.preventDefault();
      spaceDown = false;
      canvas.defaultCursor = "default";
    };
    const resetSpacePan = () => { spaceDown = false; if (canvas) canvas.defaultCursor = "default"; };
    const mouseDown = (event) => {
      if (spaceDown || event.e.button === 2) {
        draggedDeviceMarker = null;
        canvas.isDragging = true; canvas.selection = false; canvas.lastPosX = event.e.clientX; canvas.lastPosY = event.e.clientY; canvas.defaultCursor = "grabbing";
      } else {
        // Record the pressed symbol as the drag source; some pointer paths do not
        // emit Fabric's object:moving event before releasing outside the canvas.
        draggedDeviceMarker = event.target?.fpDevice ? event.target : null;
      }
    };
    const mouseMove = (event) => { if (!canvas.isDragging) return; const vpt = canvas.viewportTransform; vpt[4] += event.e.clientX - canvas.lastPosX; vpt[5] += event.e.clientY - canvas.lastPosY; canvas.lastPosX = event.e.clientX; canvas.lastPosY = event.e.clientY; canvas.requestRenderAll(); };
    const mouseUp = () => { canvas.isDragging = false; canvas.selection = true; canvas.defaultCursor = "default"; };
    const deviceList = $("#fp-device-list");
    const updateReturnPreview = (event) => {
      const marker = draggedDeviceMarker;
      if (!marker?.fpDevice) return;
      const bounds = deviceList.getBoundingClientRect();
      const isOverList = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      const nextKey = isOverList ? deviceKey(marker.fpDevice) : "";
      if (nextKey === returnPreviewKey) return;
      returnPreviewKey = nextKey;
      deviceList.classList.toggle("is-drop-target", Boolean(returnPreviewKey));
      if (returnPreviewKey) {
        const entry = (panelDevices[marker.fpDevice.panelId || selectedPanelId] || []).map((card) => ({ card, device: card.devices?.find((item) => item.id === marker.fpDevice.deviceId) })).find((item) => item.device);
        if (entry) selectedToolDevice = entry;
        setSelected(null);
        updateDeviceChoices();
        revealDeviceInList(marker.fpDevice.deviceId);
      } else {
        if (selectedToolDevice?.device.id === marker.fpDevice.deviceId) selectedToolDevice = null;
        updateDeviceChoices();
        setSelected(marker);
      }
    };
    // Show a highlighted copy of the device under the pointer before the drop,
    // then return it to the available list when released there.
    const returnDeviceToList = (event) => {
      const marker = draggedDeviceMarker;
      if (!marker) return;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const shouldReturn = Boolean(target && deviceList.contains(target));
      draggedDeviceMarker = null;
      returnPreviewKey = "";
      deviceList.classList.remove("is-drop-target");
      if (!shouldReturn) {
        if (selectedToolDevice?.device.id === marker.fpDevice?.deviceId) selectedToolDevice = null;
        updateDeviceChoices();
        setSelected(marker);
        return;
      }
      const entry = (panelDevices[marker.fpDevice.panelId || selectedPanelId] || []).map((card) => ({ card, device: card.devices?.find((item) => item.id === marker.fpDevice.deviceId) })).find((item) => item.device);
      if (entry) selectedToolDevice = entry;
      const returnedPanelId = marker.fpDevice.panelId || selectedPanelId;
      const returnedGroup = groupForDevice(returnedPanelId, marker.fpDevice.deviceId);
      if (returnedGroup) {
        selectedPanelId = returnedPanelId;
        selectedGroupId = returnedGroup.id;
        $("#fp-panel").value = selectedPanelId;
        $("#fp-group").value = selectedGroupId;
      }
      canvas.remove(marker);
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      setSelected(null);
      updateDeviceChoices();
      revealDeviceInList(marker.fpDevice.deviceId);
      status(isEnglish ? "Device returned to the available list." : "\u062f\u06cc\u0648\u0627\u06cc\u0633 \u0628\u0647 \u0641\u0647\u0631\u0633\u062a \u062f\u06cc\u0648\u0627\u06cc\u0633\u200c\u0647\u0627\u06cc \u062f\u0631 \u062f\u0633\u062a\u0631\u0633 \u0628\u0631\u06af\u0634\u062a.");
    };
    const wheel = (event) => { const delta = event.e.deltaY; let zoom = canvas.getZoom() * (0.999 ** delta); zoom = Math.max(0.12, Math.min(5, zoom)); canvas.zoomToPoint({ x: event.e.offsetX, y: event.e.offsetY }, zoom); event.e.preventDefault(); event.e.stopPropagation(); };
    canvas.on("mouse:down", mouseDown); canvas.on("mouse:move", mouseMove); canvas.on("mouse:up", mouseUp); canvas.on("mouse:wheel", wheel);
    window.addEventListener("keydown", keyDown); window.addEventListener("keyup", keyUp); window.addEventListener("blur", resetSpacePan);
    window.addEventListener("pointermove", updateReturnPreview);
    window.addEventListener("pointerup", returnDeviceToList);
    window.addEventListener("mouseup", returnDeviceToList);
    canvasCleanups.push(() => { window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); window.removeEventListener("blur", resetSpacePan); window.removeEventListener("pointermove", updateReturnPreview); window.removeEventListener("pointerup", returnDeviceToList); window.removeEventListener("mouseup", returnDeviceToList); deviceList.classList.remove("is-drop-target"); draggedDeviceMarker = null; });
    canvas.requestRenderAll();
    const fit = Math.min($(".fp-canvas-scroll").clientWidth / canvas.getWidth(), $(".fp-canvas-scroll").clientHeight / canvas.getHeight(), 1);
    canvas.setZoom(Math.max(0.12, fit));
    updateDeviceChoices(); setSelected(null); setUiState();
  };
  const loadPlan = async (id) => {
    if (!id) {
      selectedPlan = null; selectedPlanId = ""; planLayouts = null; clearPlan();
      $("#fp-page").replaceChildren(); updateDeviceChoices(); setUiState();
      return;
    }
    const nextPlan = plans.find((item) => item.id === id);
    if (!nextPlan || !selectedProjectId || (nextPlan.projectId && nextPlan.projectId !== selectedProjectId)) {
      selectedPlanId = selectedPlan?.id || "";
      $("#fp-plan-select").value = selectedPlanId;
      status(t("choosePdf"), true);
      return;
    }
    if (selectedPlanId !== id) planLayouts = null;
    selectedPlanId = id;
    selectedPlan = nextPlan;
    clearPlan(); canvas = null;
    isBusy = true; setUiState(); updateDeviceChoices();
    try {
      status(t("loading"));
      // Assign old unbound plans before opening them. The project selector is already locked,
      // and a failed migration clears the attempted selection instead of freezing the page.
      if (!selectedPlan.projectId) {
        const response = await request(`/api/floor-plans/${selectedPlan.id}/project`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: selectedProjectId }) });
        const assignment = await response.json();
        selectedPlan.projectId = assignment.projectId;
        const planRecord = plans.find((item) => item.id === selectedPlan.id);
        if (planRecord) planRecord.projectId = assignment.projectId;
        updatePlanChoices();
      }
      if (selectedPlan.projectId !== selectedProjectId) throw new Error("The project assigned to a floor plan cannot be changed");
      const activePlan = selectedPlan;
      pdfDocument = await pdfjs.getDocument(`/api/floor-plans/${selectedPlan.id}/file`).promise;
      $("#fp-page").innerHTML = Array.from({ length: activePlan.pageCount }, (_, i) => `<option value="${i + 1}">${t("pageStatus")(i + 1)}</option>`).join("");
      $("#fp-page").value = "1"; pageNumber = 1;
      await renderPage(); status(t("planStatus")(activePlan.name, activePlan.pageCount));
    } catch (error) {
      clearPlan(); canvas = null; selectedPlan = null;
      $("#fp-page").replaceChildren();
      updatePlanChoices(); updateDeviceChoices();
      const message = error.message === "Request failed (404)" && !nextPlan.projectId ? t("apiOutdated") : translateError(error.message);
      status(message, true);
    } finally { isBusy = false; updateDeviceChoices(); setUiState(); }
  };
  const refreshPlans = async () => {
    const response = await request("/api/floor-plans");
    plans = (await response.json()).plans;
    updatePlanChoices();
  };
  const deleteSelectedPlan = async () => {
    const id = $("#fp-plan-select").value;
    if (!id || !window.confirm(t("confirmDeletePlan"))) return;
    isBusy = true; setUiState();
    try {
      const response = await request(`/api/floor-plans/${encodeURIComponent(id)}`, { method: "DELETE" });
      await response.json();
      plans = plans.filter((plan) => plan.id !== id);
      selectedPlan = null; selectedPlanId = ""; pageNumber = 1; planLayouts = null;
      clearPlan(); $("#fp-page").replaceChildren();
      updatePlanChoices(); updateDeviceChoices(); status(t("deletedPlan"));
    } catch (error) { status(translateError(error.message), true); }
    finally { isBusy = false; setUiState(); }
  };
  $("#fp-project").addEventListener("change", (event) => {
    if (selectedPlan || selectedPlanId || isBusy) { event.currentTarget.value = selectedProjectId; return; }
    selectedProjectId = event.currentTarget.value;
    selectedPlan = null; selectedPlanId = "";
    selectedPanelId = ""; $("#fp-panel").value = "";
    clearPlan(); canvas = null;
    updatePanelChoices(); updatePlanChoices(); updateDeviceChoices(); setUiState();
    status(t("choosePdf"));
  });
  $("#fp-panel").addEventListener("change", (event) => { selectedPanelId = event.currentTarget.value; selectedGroupId = firstGroupRelationId(selectedPanelId); selectedToolDevice = null; setSelected(null); updateDeviceChoices(); setUiState(); });
  $("#fp-group").addEventListener("change", (event) => { selectedGroupId = event.currentTarget.value; selectedToolDevice = null; setSelected(null); updateDeviceChoices(); setUiState(); });
  $("#fp-plan-select").addEventListener("change", async (event) => {
    const nextPlanId = event.target.value;
    if (!(await confirmLeaveWithUnsavedLayout())) { event.target.value = selectedPlan?.id || ""; return; }
    selectedPlanId = selectedPlan?.id || "";
    setUiState();
    try { await loadPlan(nextPlanId); } catch (error) { status(translateError(error.message), true); }
  });
  $("#fp-delete-plan").addEventListener("click", deleteSelectedPlan);
  $("#fp-page").addEventListener("change", async (event) => {
    const nextPage = Number(event.currentTarget.value);
    if (!(await confirmLeaveWithUnsavedLayout())) { event.currentTarget.value = String(pageNumber); return; }
    pageNumber = nextPage; isBusy = true; setUiState();
    try { await renderPage(); status(t("pageStatus")(pageNumber)); }
    catch (error) { clearPlan(); status(translateError(error.message), true); }
    finally { isBusy = false; updateDeviceChoices(); setUiState(); }
  });
  $("#fp-upload-trigger").addEventListener("click", () => { if (!$("#fp-upload-trigger").disabled) $("#fp-upload").click(); });
  $("#fp-upload").addEventListener("change", async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    isBusy = true; setUiState();
    try {
      status(t("uploading"));
      if (!selectedProjectId || !selectedPanelId) throw new Error(t("choosePdf"));
      const form = new FormData(); form.append("pdf", file); form.append("name", file.name.replace(/\.pdf$/i, "")); form.append("projectId", selectedProjectId);
      const response = await request("/api/floor-plans", { method: "POST", body: form });
      const { plan } = await response.json();
      await refreshPlans();
      isBusy = false;
      selectedPlanId = plan.id;
      $("#fp-plan-select").value = plan.id;
      await loadPlan(plan.id);
    } catch (error) { status(translateError(error.message), true); }
    finally { isBusy = false; setUiState(); }
    event.target.value = "";
  });
  const addDevice = async (type, x, y, registered = null) => {
    if (!selectedPlan || !selectedPanelId || !registered) return;
    const { card, device } = registered;
    const key = deviceKey({ panelId: selectedPanelId, deviceId: device.id });
    if (placedDeviceKeys().has(key)) return;
    const targetCanvas = canvas, targetPlanId = selectedPlan.id, targetPage = pageNumber;
    placingDeviceKeys.add(key); updateDeviceChoices();
    try {
      const address = addressOf(device), name = safeDeviceText(device.name, "") || deviceLabel(type);
      const data = { type, iconType: iconKeyOf(device), name, projectId: selectedPlan.projectId, panelId: selectedPanelId, panelNumber: panelNumberFor(selectedPanelId, selectedPlan.projectId), loopCardId: card.id, loopNumber: loopNumberFor(selectedPanelId, card.id), deviceId: device.id, address, zone: device.zone || "", label: `${card.label || ""}-${address}`.replace(/^-|-$/g, ""), loop: String(loopNumberFor(selectedPanelId, card.id)), rotation: 0 };
      const marker = await buildDevice(data, x ?? canvas.getWidth() / 2, y ?? canvas.getHeight() / 2);
      if (!canvas || canvas !== targetCanvas || selectedPlan?.id !== targetPlanId || pageNumber !== targetPage) return;
      canvas.add(marker); canvas.setActiveObject(marker); canvas.requestRenderAll(); setSelected(marker);
    } catch (error) { status(translateError(error.message), true); }
    finally { placingDeviceKeys.delete(key); updateDeviceChoices(); }
  };
  const openAddDeviceModal = () => {
    if (!selectedPanelId || !(panelDevices[selectedPanelId] || []).length) { status(t("choosePanelForDevice"), true); return; }
    const types = loopDeviceTypes.length ? loopDeviceTypes : [
      { key: "smoke", fa: "دتکتور دود", en: "Smoke Detector" }, { key: "heat", fa: "دتکتور حرارت", en: "Heat Detector" },
      { key: "multi", fa: "دتکتور ترکیبی", en: "Multi Detector" }, { key: "manual", fa: "شستی اعلام حریق", en: "Manual Call Point" },
      { key: "sounder", fa: "آژیر / خروجی", en: "Sounder/Output" }, { key: "input", fa: "ماژول ورودی", en: "Input Module" },
    ];
    const cards = panelDevices[selectedPanelId] || [];
    const relations = groupRelationsForPanel(selectedPanelId);
    const settings = panelGroupSettings[selectedPanelId] || {};
    const numbers = [...new Set([
      ...relations.flatMap((item) => [item.inputGroupNumber, item.outputGroupNumber]),
      ...Object.keys(settings.ioInputGroups || {}).map(Number), ...Object.keys(settings.ioOutputGroups || {}).map(Number),
    ])];
    const nextUnusedGroup = () => { for (let number = 1; number <= 96; number += 1) if (!numbers.includes(number)) return number; return 1; };
    const relationOptions = relations.map((relation) => `<option value="${escapeText(relation.id)}">${isEnglish ? `Input ${relation.inputGroupNumber} > Output ${relation.outputGroupNumber}` : `ورودی ${toPersianDigits(relation.inputGroupNumber)} > خروجی ${toPersianDigits(relation.outputGroupNumber)}`}</option>`).join("");
    addDeviceModal?.remove();
    addDeviceModal = document.createElement("div");
    addDeviceModal.className = "fp-device-modal-backdrop";
    addDeviceModal.innerHTML = `<form class="fp-device-modal" role="dialog" aria-modal="true" aria-labelledby="fp-device-modal-title"><header class="fp-device-modal-heading"><span class="fp-device-modal-icon" aria-hidden="true">＋</span><div><h3 id="fp-device-modal-title">${t("addDeviceTitle")}</h3><p>${t("addDeviceIntro")}</p></div><button type="button" class="fp-device-modal-close" data-device-close aria-label="${t("cancel")}">×</button></header><div class="fp-device-modal-grid"><label>${t("loopCard")}<select name="loopCardId" required>${cards.map((card, index) => `<option value="${escapeText(card.id)}">${escapeText(card.label || `${t("loopLabel")} ${index + 1}`)}</option>`).join("")}</select></label><label>${t("type")}<select name="type" required>${types.map((type) => `<option value="${escapeText(type.key)}">${escapeText(isEnglish ? type.en : type.fa)}</option>`).join("")}</select></label><label>${t("address")}<input name="address" type="number" min="1" max="254" step="1" required placeholder="1–254"></label><label>${t("location")}<input name="location" maxlength="120" placeholder="${isEnglish ? "e.g. Floor 1, north hall" : "مثلاً طبقهٔ اول، راهروی شمالی"}"></label></div><section class="fp-device-group-fields"><div class="fp-device-group-title"><strong>${t("group")}</strong><span>${isEnglish ? "Choose where this device belongs" : "جایگاه دیوایس را در گروه تعیین کنید"}</span></div><label>${t("group")}<select name="groupMode"><option value="${relations.length ? "existing" : "new"}" ${relations.length ? "" : "disabled"}>${t("groupExisting")}</option><option value="new" ${relations.length ? "" : "selected"}>${t("groupNew")}</option></select></label><div data-existing-group ${relations.length ? "" : "hidden"}><label>${t("groupExisting")}<select name="relationId" ${relations.length ? "" : "disabled"}>${relationOptions}</select></label></div><div data-new-group ${relations.length ? "hidden" : ""}><div class="fp-device-modal-grid"><label>${t("newInputGroup")}<input name="inputGroupNumber" type="number" min="1" max="96" step="1" value="${nextUnusedGroup()}"></label><label>${t("newOutputGroup")}<input name="outputGroupNumber" type="number" min="1" max="96" step="1" value="${nextUnusedGroup()}"></label></div></div><label>${t("groupSide")}<select name="side"><option value="input">${t("inputSide")}</option><option value="output">${t("outputSide")}</option></select></label></section><p class="fp-device-modal-error" data-device-error role="alert"></p><footer class="fp-device-modal-actions"><button type="button" class="fp-button" data-device-close>${t("cancel")}</button><button type="submit" class="fp-button fp-button-primary" data-device-submit>${t("register")}</button></footer></form>`;
    document.body.append(addDeviceModal);
    const form = addDeviceModal.querySelector("form");
    const mode = form.elements.groupMode;
    const toggleGroupMode = () => {
      const isNew = mode.value === "new";
      form.querySelector("[data-existing-group]").hidden = isNew;
      form.querySelector("[data-new-group]").hidden = !isNew;
    };
    mode.addEventListener("change", toggleGroupMode);
    form.querySelectorAll("[data-device-close]").forEach((button) => button.addEventListener("click", () => { addDeviceModal?.remove(); addDeviceModal = null; }));
    addDeviceModal.addEventListener("click", (event) => { if (event.target === addDeviceModal) { addDeviceModal.remove(); addDeviceModal = null; } });
    form.elements.type.addEventListener("change", () => { form.elements.side.value = form.elements.type.value === "sounder" ? "output" : "input"; });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const groupMode = String(data.get("groupMode"));
      const address = Number(data.get("address"));
      const card = cards.find((item) => String(item.id) === String(data.get("loopCardId")));
      const relationId = groupMode === "existing" ? String(data.get("relationId") || "") : `${Number(data.get("inputGroupNumber"))}-${Number(data.get("outputGroupNumber"))}`;
      const error = form.querySelector("[data-device-error]");
      if (!card || !Number.isInteger(address) || address < 1 || address > 254 || !String(data.get("type") || "") || (card.devices || []).some((device) => Number(device.number) === address)) { error.textContent = (card?.devices || []).some((device) => Number(device.number) === address) ? t("addressTaken") : t("requiredField"); return; }
      if (groupMode === "new") {
        const inputNumber = Number(data.get("inputGroupNumber")), outputNumber = Number(data.get("outputGroupNumber"));
        if (![inputNumber, outputNumber].every((value) => Number.isInteger(value) && value >= 1 && value <= 96)) { error.textContent = t("requiredField"); return; }
        if (relations.some((item) => item.id === relationId)) { error.textContent = t("groupingExists"); return; }
      }
      if (!onRegisterFloorPlanDevice) { error.textContent = t("saveDeviceFailed"); return; }
      const submit = form.querySelector("[data-device-submit]"); submit.disabled = true; submit.textContent = t("savingDevice"); error.textContent = "";
      const result = await onRegisterFloorPlanDevice({ panelId: selectedPanelId, loopCardId: card.id, type: String(data.get("type")), address, location: String(data.get("location") || "").trim(), groupMode, relationId, inputGroupNumber: Number(data.get("inputGroupNumber")), outputGroupNumber: Number(data.get("outputGroupNumber")), side: String(data.get("side")) });
      if (!result?.ok) { error.textContent = escapeText(result?.error || t("saveDeviceFailed")); submit.disabled = false; submit.textContent = t("register"); return; }
      panelDevices[selectedPanelId] = result.cards;
      panelGroupSettings[selectedPanelId] = result.settings;
      selectedGroupId = result.relationId;
      updateDeviceChoices();
      const registered = { card: result.cards.find((item) => item.id === card.id), device: result.device };
      addDeviceModal?.remove(); addDeviceModal = null;
      if (canvas && registered.card) { await addDevice(deviceKind(registered.device), canvas.getWidth() / 2, canvas.getHeight() / 2, registered); status(t("registeredDevice")); }
      else status(t("registeredNoPlan"));
      setUiState();
    });
    form.elements.address.focus();
  };
  $("#fp-add-device").addEventListener("click", openAddDeviceModal);
  $("#fp-device-list").addEventListener("click", (event) => {
    const tool = event.target.closest("[data-device-id]"); if (!tool) return;
    const found = allDevicesForPanel().find(({ device }) => device.id === tool.dataset.deviceId);
    if (!found) return;
    selectedToolDevice = found;
    if (canvas?.getActiveObject()) canvas.discardActiveObject();
    setSelected(null);
    updateDeviceChoices();
  });
  $("#fp-device-list").addEventListener("dragstart", (event) => {
    const tool = event.target.closest("[data-device-id]");
    if (!tool) { event.preventDefault(); return; }
    if (!canvas) { event.preventDefault(); status(t("choosePlanBeforePlace")); return; }
    const found = allDevicesForPanel().find(({ device }) => device.id === tool.dataset.deviceId);
    if (found) {
      selectedToolDevice = found;
      if (canvas.getActiveObject()) canvas.discardActiveObject();
      showDeviceDetails({ ...found.device, type: deviceKind(found.device), loop: found.card.label || found.card.id || "" });
      $("#fp-device-list").querySelectorAll(".fp-device-tool.is-selected").forEach((item) => item.classList.remove("is-selected"));
      tool.classList.add("is-selected");
    }
    event.dataTransfer.setData("text/plain", JSON.stringify({ deviceId: tool.dataset.deviceId }));
  });
  const canvasHolder = $(".fp-canvas-holder");
  canvasHolder.addEventListener("dragover", (event) => event.preventDefault());
  canvasHolder.addEventListener("drop", (event) => { event.preventDefault(); if (!canvas) return; let item; try { item = JSON.parse(event.dataTransfer.getData("text/plain")); } catch { return; } const found = allDevicesForPanel().find(({ device }) => device.id === item.deviceId); if (!found) return; const point = canvas.getScenePoint(event); void addDevice(deviceKind(found.device), point.x, point.y, found); });
  $("#fp-snap").addEventListener("change", (event) => { snap = event.target.checked; syncSnapGrid(); });
  const showAddressDialog = ({ current, requested, occupied }) => new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "fp-address-modal-backdrop";
    const conflict = Boolean(occupied);
    const title = conflict ? (isEnglish ? "Address already in use" : "\u0622\u062f\u0631\u0633 \u0642\u0628\u0644\u0627\u064b \u0627\u0633\u062a\u0641\u0627\u062f\u0647 \u0634\u062f\u0647") : (isEnglish ? "Confirm device address change" : "\u062a\u0623\u06cc\u06cc\u062f \u062a\u063a\u06cc\u06cc\u0631 \u0622\u062f\u0631\u0633 \u062f\u06cc\u0648\u0627\u06cc\u0633");
    const message = conflict
      ? (isEnglish ? `Address ${requested} is used by ${occupied.device.name || occupied.device.type || "another device"}. Swap the two addresses, or assign a different free address to this device.` : `\u0622\u062f\u0631\u0633 ${toPersianDigits(requested)} \u062f\u0631 \u0627\u062e\u062a\u06cc\u0627\u0631 \u00ab${occupied.device.name || occupied.device.type || "\u062f\u06cc\u0648\u0627\u06cc\u0633 \u062f\u06cc\u06af\u0631"}\u00bb \u0627\u0633\u062a. \u0622\u062f\u0631\u0633\u200c\u0647\u0627 \u062c\u0627\u0628\u0647\u200c\u062c\u0627 \u0634\u0648\u0646\u062f \u06cc\u0627 \u0628\u0631\u0627\u06cc \u0627\u06cc\u0646 \u062f\u06cc\u0648\u0627\u06cc\u0633 \u0622\u062f\u0631\u0633 \u0622\u0632\u0627\u062f \u062f\u06cc\u06af\u0631\u06cc \u062a\u0639\u06cc\u06cc\u0646 \u06a9\u0646\u06cc\u062f.`)
      : (isEnglish ? `Change this device's address from ${current} to ${requested}?` : `\u0622\u062f\u0631\u0633 \u0627\u06cc\u0646 \u062f\u06cc\u0648\u0627\u06cc\u0633 \u0627\u0632 ${toPersianDigits(current)} \u0628\u0647 ${toPersianDigits(requested)} \u062a\u063a\u06cc\u06cc\u0631 \u06a9\u0646\u062f\u061f`);
    modal.innerHTML = `<section class="fp-address-modal" role="dialog" aria-modal="true" aria-labelledby="fp-address-modal-title"><h3 id="fp-address-modal-title">${title}</h3><p>${escapeText(message)}</p>${conflict ? `<label>${isEnglish ? "New free address" : "\u0622\u062f\u0631\u0633 \u0622\u0632\u0627\u062f \u062c\u062f\u06cc\u062f"}<input type="number" min="1" max="254" data-address-alternative placeholder="1-254"></label><small data-address-modal-error></small>` : ""}<div class="fp-address-modal-actions">${conflict ? `<button type="button" class="fp-button fp-button-primary" data-address-swap>${isEnglish ? "Swap addresses" : "\u062c\u0627\u0628\u0647\u200c\u062c\u0627\u06cc\u06cc \u0622\u062f\u0631\u0633\u200c\u0647\u0627"}</button><button type="button" class="fp-button fp-button-primary" data-address-reassign>${isEnglish ? "Use new address" : "\u062b\u0628\u062a \u0622\u062f\u0631\u0633 \u062c\u062f\u06cc\u062f"}</button>` : `<button type="button" class="fp-button fp-button-primary" data-address-confirm>${isEnglish ? "Confirm" : "\u062a\u0623\u06cc\u06cc\u062f \u062a\u063a\u06cc\u06cc\u0631"}</button>`}<button type="button" class="fp-button" data-address-cancel>${isEnglish ? "Cancel" : "\u0627\u0646\u0635\u0631\u0627\u0641"}</button></div></section>`;
    const finish = (choice) => { modal.remove(); resolve(choice); };
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-address-cancel]")) return finish(null);
      if (event.target.closest("[data-address-confirm]")) return finish({ resolution: "confirm" });
      if (event.target.closest("[data-address-swap]")) return finish({ resolution: "swap" });
      if (event.target.closest("[data-address-reassign]")) {
        const value = Number(toLatinDigits(modal.querySelector("[data-address-alternative]").value));
        const error = modal.querySelector("[data-address-modal-error]");
        if (!Number.isInteger(value) || value < 1 || value > 254 || (value !== current && occupied.card.devices.some((item) => item.id !== occupied.device.id && Number(addressOf(item)) === value))) {
          error.textContent = isEnglish ? "Enter an unused address from 1 to 254." : "\u06cc\u06a9 \u0622\u062f\u0631\u0633 \u0622\u0632\u0627\u062f \u0628\u06cc\u0646 \u06f1 \u062a\u0627 \u06f2\u06f5\u06f4 \u0648\u0627\u0631\u062f \u06a9\u0646\u06cc\u062f.";
          return;
        }
        return finish({ resolution: "reassign", replacementAddress: value });
      }
    });
    root.append(modal);
    modal.querySelector("[data-address-alternative]")?.focus();
  });
  $("#fp-address").addEventListener("input", (event) => {
    if (syncingAddress || draftAddress === null) return;
    const raw = event.currentTarget.value.trim();
    if (!/^\d+$/.test(toLatinDigits(raw))) { $("#fp-address-status").textContent = addressInvalidMessage; $("#fp-apply").disabled = true; return; }
    const value = Number(toLatinDigits(raw));
    if (value < 0 || value > 255) { $("#fp-address-status").textContent = addressInvalidMessage; $("#fp-apply").disabled = true; return; }
    setAddressDraft(value);
    $("#fp-address").value = raw;
  });
  $("#fp-address-cancel").addEventListener("click", () => { if (originalAddress !== null) setAddressDraft(originalAddress); });
  $("#fp-apply").addEventListener("click", () => {
    void (async () => {
      const marker = canvas?.getActiveObject()?.fpDevice ? canvas.getActiveObject() : null;
      const entry = selectedToolDevice || (marker ? (panelDevices[marker.fpDevice.panelId || selectedPanelId] || []).map((card) => ({ card, device: card.devices?.find((item) => item.id === marker.fpDevice.deviceId) })).find((item) => item.device) : null);
      if (!entry?.device) { status(isEnglish ? "Select a registered device first." : "\u0627\u0628\u062a\u062f\u0627 \u06cc\u06a9 \u062f\u06cc\u0648\u0627\u06cc\u0633 \u062b\u0628\u062a\u200c\u0634\u062f\u0647 \u0631\u0627 \u0627\u0646\u062a\u062e\u0627\u0628 \u06a9\u0646\u06cc\u062f.", true); return; }
      const rawAddress = $("#fp-address").value.trim();
      let address;
      try { address = validateDeviceAddress(toLatinDigits(rawAddress)); }
      catch { status(addressInvalidMessage, true); $("#fp-address").focus(); return; }
      const occupiedDevice = entry.card.devices.find((device) => device.id !== entry.device.id && Number(addressOf(device)) === address);
      const occupied = occupiedDevice ? { device: occupiedDevice, card: entry.card } : null;
      const decision = await showAddressDialog({ current: Number(addressOf(entry.device)), requested: address, occupied });
      if (!decision) return;
      const applyButton = $("#fp-apply");
      applyButton.disabled = true;
      try {
        const result = onDeviceAddressChange
          ? await onDeviceAddressChange({ panelId: marker?.fpDevice.panelId || selectedPanelId, loopCardId: entry.card.id, deviceId: entry.device.id, address, conflictResolution: decision.resolution, replacementAddress: decision.replacementAddress })
          : { ok: true, address };
        if (!result?.ok) { status(result?.error || (isEnglish ? "Could not update the loop card address." : "\u0622\u062f\u0631\u0633 \u06a9\u0627\u0631\u062a \u0644\u0648\u067e \u062a\u063a\u06cc\u06cc\u0631 \u0646\u06a9\u0631\u062f."), true); return; }
        entry.device.number = Number(result.address ?? address);
        originalAddress = Number(entry.device.number);
        setAddressDraft(originalAddress);
        if (result.swapped) {
          const swappedDevice = entry.card.devices.find((device) => device.id === result.swapped.deviceId);
          if (swappedDevice) swappedDevice.number = Number(result.swapped.address);
        }
        const updateMarker = (deviceId, number) => canvas?.getObjects().filter((object) => object.fpDevice?.panelId === (marker?.fpDevice.panelId || selectedPanelId) && object.fpDevice?.deviceId === deviceId).forEach((object) => {
          object.fpDevice = { ...object.fpDevice, address: String(number), loop: String(loopNumberFor(marker?.fpDevice.panelId || selectedPanelId, entry.card.id)), loopCardId: entry.card.id };
          object.fpMetadataText?.set("text", mapDeviceMetadataLabel(object.fpDevice));
        });
        updateMarker(entry.device.id, entry.device.number);
        if (result.swapped) updateMarker(result.swapped.deviceId, result.swapped.address);
        if (marker) canvas.requestRenderAll();
        if (marker) layoutDirty = true;
        if (selectedToolDevice) selectedToolDevice.device = entry.device;
        updateDeviceChoices();
        setSelected(marker || null);
        status(isEnglish ? "Loop card and floor plan device address updated." : "\u0622\u062f\u0631\u0633 \u062f\u06cc\u0648\u0627\u06cc\u0633 \u062f\u0631 \u06a9\u0627\u0631\u062a \u0644\u0648\u067e \u0648 \u0646\u0642\u0634\u0647 \u0628\u0647\u200c\u0631\u0648\u0632 \u0634\u062f.");
      } catch (error) {
        status(error.message || (isEnglish ? "Could not update the loop card address." : "\u0622\u062f\u0631\u0633 \u06a9\u0627\u0631\u062a \u0644\u0648\u067e \u062a\u063a\u06cc\u06cc\u0631 \u0646\u06a9\u0631\u062f."), true);
      } finally {
        if (canvas?.getActiveObject()?.fpDevice || selectedToolDevice) applyButton.disabled = draftAddress === originalAddress;
      }
    })();
  });
  $("#fp-rotate").addEventListener("click", () => { const marker = canvas?.getActiveObject(); if (!marker?.fpDevice) return; const point = markerIconPoint(marker); marker.rotate((marker.angle + 15) % 360); marker.fpDevice.rotation = marker.angle; placeMarkerIconAt(marker, point.x, point.y); canvas.requestRenderAll(); layoutDirty = true; });
  $("#fp-delete").addEventListener("click", () => {
    void (async () => {
      const marker = canvas?.getActiveObject();
      if (!marker?.fpDevice) return;
      const info = marker.fpDevice;
      const entry = (panelDevices[info.panelId || selectedPanelId] || []).map((card) => ({ card, device: card.devices?.find((item) => item.id === info.deviceId) })).find((item) => item.device);
      canvas.remove(marker);
      canvas.discardActiveObject();
      if (entry) {
        selectedPanelId = info.panelId || selectedPanelId;
        selectedGroupId = groupForDevice(selectedPanelId, entry.device.id)?.id || firstGroupRelationId(selectedPanelId);
        $("#fp-panel").value = selectedPanelId;
        $("#fp-group").value = selectedGroupId;
        selectedToolDevice = entry;
      } else selectedToolDevice = null;
      updateDeviceChoices();
      setSelected(null);
      if (entry) {
        showDeviceDetails({ ...entry.device, type: deviceKind(entry.device), loop: entry.card.label || entry.card.id || "" });
        revealDeviceInList(entry.device.id);
      }
      layoutDirty = true;
      status(isEnglish ? "Device returned to its loop card and removed from the plan. Save the layout to keep this change." : "دیوایس به کارت لوپ خودش برگشت و از نقشه برداشته شد. برای ثبت تغییر، چیدمان را ذخیره کنید.");
    })();
  });
  $("#fp-fit").addEventListener("click", () => { if (!canvas) return; const zoom = Math.min($(".fp-canvas-scroll").clientWidth / canvas.getWidth(), $(".fp-canvas-scroll").clientHeight / canvas.getHeight(), 1); canvas.setViewportTransform([zoom, 0, 0, zoom, 0, 0]); canvas.requestRenderAll(); });
  const saveCurrentLayout = async () => {
    if (!canvas || !selectedPlan) throw new Error(t("choosePdf"));
    const devices = canvas.getObjects().filter((object) => object.fpDevice).map((object) => { const point = markerIconPoint(object); return { ...object.fpDevice, projectId: selectedPlan.projectId, deviceType: object.fpDevice.type, normX: Math.max(0, Math.min(1, point.x / canvas.getWidth())), normY: Math.max(0, Math.min(1, point.y / canvas.getHeight())), rotation: Math.round(object.angle) }; });
    const response = await request(`/api/floor-plans/${selectedPlan.id}/layout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: pageNumber, devices }) });
    await response.json();
    planLayouts = (planLayouts || []).filter((item) => Number(item.pageNumber) !== pageNumber).concat(devices.map((item) => ({ ...item, pageNumber, deviceId: item.deviceId, panelId: item.panelId })));
    layoutDirty = false;
    updateDeviceChoices();
    return devices.length;
  };
  const confirmLeaveWithUnsavedLayout = () => new Promise((resolve) => {
    if (!layoutDirty) { resolve(true); return; }
    const modal = document.createElement("div");
    modal.className = "fp-unsaved-backdrop";
    modal.innerHTML = `<section class="fp-unsaved-dialog" role="dialog" aria-modal="true" aria-labelledby="fp-unsaved-title"><h3 id="fp-unsaved-title">${t("unsavedLayoutTitle")}</h3><p>${t("unsavedLayoutBody")}</p><p class="fp-unsaved-error" role="status" hidden></p><div class="fp-unsaved-actions"><button type="button" class="fp-button" data-fp-stay>${t("stayOnPage")}</button><button type="button" class="fp-button fp-danger" data-fp-discard>${t("leaveWithoutSaving")}</button><button type="button" class="fp-button fp-button-primary" data-fp-save>${t("saveAndLeave")}</button></div></section>`;
    const finish = (canLeave) => { modal.remove(); resolve(canLeave); };
    modal.querySelector("[data-fp-stay]").addEventListener("click", () => finish(false));
    modal.querySelector("[data-fp-discard]").addEventListener("click", () => { layoutDirty = false; finish(true); });
    modal.querySelector("[data-fp-save]").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try { await saveCurrentLayout(); finish(true); }
      catch { modal.querySelector(".fp-unsaved-error").textContent = t("layoutSaveFailed"); modal.querySelector(".fp-unsaved-error").hidden = false; button.disabled = false; }
    });
    root.append(modal);
    modal.querySelector("[data-fp-save]").focus();
  });
  root._floorPlanBeforeLeave = confirmLeaveWithUnsavedLayout;
  $("#fp-save").addEventListener("click", async () => {
    try { const count = await saveCurrentLayout(); status(t("saved")(count, pageNumber)); }
    catch (error) { status(translateError(error.message), true); }
  });
  $("#fp-export").addEventListener("click", async () => {
    if (!selectedPlan) return;
    try {
      status(t("preparing"));
      // Export the same current canvas state the operator sees, including recent moves or metadata edits.
      await saveCurrentLayout();
      const response = await request(`/api/floor-plans/${selectedPlan.id}/export?page=${pageNumber}&lang=${isEnglish ? "en" : "fa"}`);
      const blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `${selectedPlan.name.replace(/[^a-z0-9_-]+/gi, "-")}-mapped.pdf`; link.click(); URL.revokeObjectURL(url); status(t("downloaded"));
    } catch (error) { status(translateError(error.message), true); }
  });
  $("#fp-project").value = selectedProjectId;
  updatePanelChoices();
  try { await refreshPlans(); } catch (error) { status(translateError(error.message), true); }
}
