export const demoProjects = [
  {
    id: "aftab",
    name: "مجتمع اداری آفتاب",
    location: "تهران، خیابان ولیعصر",
    type: "مجتمع اداری",
    image: "/project-defaults/project-placeholder.svg",
    status: "آنلاین",
    panels: [
      { id: "aftab-main", name: "پنل اصلی ساختمان", code: "FIRE-CTRL-04", status: "متصل", alarms: 0 },
      { id: "aftab-parking", name: "پنل پارکینگ", code: "FIRE-CTRL-05", status: "متصل", alarms: 1 },
      { id: "aftab-west", name: "پنل ساختمان غربی", code: "FIRE-CTRL-06", status: "آفلاین", alarms: 0 },
    ],
  },
  {
    id: "shahrak",
    name: "برج مسکونی شهرک غرب",
    location: "تهران، شهرک غرب",
    type: "برج مسکونی",
    image: "/project-defaults/project-placeholder.svg",
    status: "آنلاین",
    panels: [
      { id: "shahrak-main", name: "پنل مرکزی برج", code: "FIRE-CTRL-11", status: "متصل", alarms: 0 },
      { id: "shahrak-west", name: "پنل لابی و پارکینگ", code: "FIRE-CTRL-12", status: "متصل", alarms: 2 },
    ],
  },
  {
    id: "mehr",
    name: "کارخانه صنایع مهر",
    location: "البرز، شهرک صنعتی",
    type: "کارخانه صنعتی",
    image: "/project-defaults/project-placeholder.svg",
    status: "نیازمند بررسی",
    panels: [
      { id: "mehr-main", name: "پنل سالن تولید", code: "FIRE-CTRL-21", status: "متصل", alarms: 0 },
      { id: "mehr-office", name: "پنل ساختمان اداری", code: "FIRE-CTRL-22", status: "آفلاین", alarms: 0 },
      { id: "mehr-storage", name: "پنل انبار", code: "FIRE-CTRL-23", status: "متصل", alarms: 1 },
      { id: "mehr-gate", name: "پنل نگهبانی", code: "FIRE-CTRL-24", status: "متصل", alarms: 0 },
    ],
  },
  {
    id: "nik",
    name: "هتل نیکان",
    location: "مشهد، بلوار سجاد",
    type: "هتل",
    image: "/project-defaults/project-placeholder.svg",
    status: "آنلاین",
    panels: [
      { id: "nik-main", name: "پنل اصلی هتل", code: "FIRE-CTRL-31", status: "متصل", alarms: 0 },
      { id: "nik-kitchen", name: "پنل آشپزخانه", code: "FIRE-CTRL-32", status: "متصل", alarms: 0 },
    ],
  },
];

export const demoPanelStates = {
  "aftab-main": { status: "connected", lastSeen: { fa: "همین الان", en: "Just now" } },
  "aftab-parking": { status: "connected", lastSeen: { fa: "همین الان", en: "Just now" } },
  "aftab-west": { status: "offline", lastSeen: { fa: "۱۲ دقیقه پیش", en: "12 minutes ago" } },
  "shahrak-main": { status: "connected", lastSeen: { fa: "همین الان", en: "Just now" } },
  "shahrak-west": { status: "connecting", lastSeen: { fa: "در حال بررسی", en: "Checking now" } },
  "mehr-main": { status: "unconfigured", lastSeen: { fa: "هنوز راه‌اندازی نشده", en: "Not configured yet" } },
  "mehr-office": { status: "offline", lastSeen: { fa: "۱۲ دقیقه پیش", en: "12 minutes ago" } },
  "mehr-storage": { status: "error", lastSeen: { fa: "آخرین تلاش ۸ دقیقه پیش", en: "Last attempt 8 minutes ago" } },
  "mehr-gate": { status: "connected", lastSeen: { fa: "همین الان", en: "Just now" } },
  "nik-main": { status: "connected", lastSeen: { fa: "همین الان", en: "Just now" } },
  "nik-kitchen": { status: "connected", lastSeen: { fa: "همین الان", en: "Just now" } },
};

export function createInitialLoopCards() {
  return [
    {
      id: "loop-1",
      label: "LoopCard1",
      devices: [
        {
          id: "loop-1-device-1",
          number: 1,
          enabled: true,
          style: "class-b",
          type: "smoke",
          category: "other",
          ip: "001.001",
          inputType: "alarm",
          deactivation: "silence",
          sensitivity: "medium",
          nightMode: "day",
          location: "طبقه ۱ / راهروی شمالی",
        },
        {
          id: "loop-1-device-2",
          number: 2,
          enabled: true,
          style: "class-b",
          type: "heat",
          category: "other",
          ip: "001.002",
          inputType: "alarm",
          deactivation: "silence",
          sensitivity: "medium",
          nightMode: "day",
          location: "طبقه ۱ / موتورخانه",
        },
        {
          id: "loop-1-device-3",
          number: 3,
          enabled: true,
          style: "class-b",
          type: "manual",
          category: "control",
          ip: "001.003",
          inputType: "alarm",
          deactivation: "silence",
          sensitivity: "medium",
          nightMode: "day",
          location: "طبقه ۱ / ورودی اصلی",
        },
        {
          id: "loop-1-device-4",
          number: 4,
          enabled: false,
          style: "class-b",
          type: "sounder",
          category: "relay",
          ip: "001.004",
          inputType: "alarm",
          deactivation: "silence",
          sensitivity: "medium",
          nightMode: "night",
          location: "طبقه ۱ / راهروی شمالی",
        },
      ],
    },
    {
      id: "loop-2",
      label: "LoopCard2",
      devices: [
        {
          id: "loop-2-device-1",
          number: 1,
          enabled: true,
          style: "class-b",
          type: "multi",
          category: "other",
          ip: "002.001",
          inputType: "alarm",
          deactivation: "silence",
          sensitivity: "medium",
          nightMode: "day",
          location: "طبقه ۱ / راهروی شمالی",
        },
        {
          id: "loop-2-device-3",
          number: 3,
          enabled: true,
          style: "class-b",
          type: "input",
          category: "control",
          ip: "002.003",
          inputType: "alarm",
          deactivation: "silence",
          sensitivity: "medium",
          nightMode: "day",
          location: "پارکینگ / ورودی",
        },
      ],
    },
  ];
}

export const demoInitialSettings = {
  loopCards: createInitialLoopCards(),
  zoneGroups: { 1: [{ loopId: "loop-1", deviceId: "loop-1-device-1" }] },
  zonePreAlarm: { 1: true },
  ioGroups: { "1-1": { inputs: [], outputs: [], activeCount: 1, outputActiveFor: "fire", delay: 0, status: true } },
  ioInputGroups: { 1: [] },
  ioOutputGroups: { 1: [] },
  ioRelations: { "1-1": { activeCount: 1, outputActiveFor: "fire", delay: 0, status: true } },
};

export const demoPanelEvents = [
  { title: "حریق", description: "دتکتور دود · طبقه ۲", time: "امروز، ۰۹:۴۲", type: "fire" },
  { title: "خطای ارتباط", description: "Loop Card 2", time: "امروز، ۰۸:۱۵", type: "fault" },
  { title: "بازگشت به حالت عادی", description: "زون ۰۳", time: "دیروز، ۱۸:۲۱", type: "normal" },
];
export const demoNotificationCount = 2;
export const demoRelayCount = 3;
export const demoRelayLastRead = {
  fa: "آخرین خواندن: امروز، ۱۰:۲۴",
  en: "Last read: Today, 10:24",
};
export const demoRelayRows = [
  { name: "Relay 1", key: "fire", value: "حریق / Fire" },
  { name: "Relay 2", key: "fault", value: "خطا / Fault" },
  { name: "Relay 3", key: "pre", value: "پیش‌هشدار / Pre-Alarm" },
];

export const demoRemotePanels = [
  { code: "FIRE-CTRL-05", status: "در انتظار اتصال" },
  { code: "FIRE-CTRL-06", status: "آفلاین" },
  { code: "FIRE-CTRL-07", status: "غیرفعال" },
];
export const demoRemoteConnectionStatus = "اتصال برقرار نیست";

export const demoReport = {
  panelStatus: "آماده",
  deviceCount: 24,
  openEvents: 2,
  configuredGroups: 3,
  panelCode: "FIRE-CTRL-04",
  generatedAt: "امروز، ۱۰:۳۰",
};

export const demoGsmPhoneNumber = "۰۹۱۲ ۳۴۵ ۶۷۸۹";
export const demoLocation = {
  installationLocation: "اتاق کنترل، طبقه همکف",
  coordinates: "35.7219, 51.3347",
};
export const demoMonitoringStatus = "مانیتورینگ آماده";
export const demoGatewayId = "GW-A83F21";
export const demoFirmwareVersion = "v1.4.2";
export const demoPanelDeviceCount = 12;
export const demoOnboardingCode = "PNL-8F42-19";
export const demoOnboardingGatewayId = "GW-A83F21";
