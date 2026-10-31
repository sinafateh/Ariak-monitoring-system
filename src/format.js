export const monthNames = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];
export const weekDays = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
export const englishMonthNames = [
  "Farvardin",
  "Ordibehesht",
  "Khordad",
  "Tir",
  "Mordad",
  "Shahrivar",
  "Mehr",
  "Aban",
  "Azar",
  "Dey",
  "Bahman",
  "Esfand",
];
export const englishWeekDays = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

export const pad = (value) => String(value).padStart(2, "0");

const digitMaps = new Map();
const gregorianDateFormatter = new Intl.DateTimeFormat("en-CA-u-ca-gregory", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC",
});

export function formatDigits(value, language = "fa") {
  const locale = language === "en" ? "en-US-u-nu-latn" : "fa-IR-u-nu-arabext";
  if (!digitMaps.has(locale)) {
    const formatter = new Intl.NumberFormat(locale, { useGrouping: false });
    digitMaps.set(
      locale,
      Array.from({ length: 10 }, (_, digit) => formatter.format(digit)),
    );
  }
  const digits = digitMaps.get(locale);
  return String(value).replace(/\d/g, (digit) => digits[Number(digit)]);
}

function div(a, b) {
  return ~~(a / b);
}
function mod(a, b) {
  return a - ~~(a / b) * b;
}

function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}

function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return [gy, gm, gd];
}

function jalCal(jy) {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
  ];
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jump;
  for (let i = 1; i < breaks.length && jy >= breaks[i]; i++) {
    const jm = breaks[i];
    jump = jm - jp;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  const leap = mod(mod(n + 1, 33) - 1, 4);
  return [leap === 0 ? 0 : leap + 1, gy, march];
}

function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r[1], 3, r[2]) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn) {
  const g = d2g(jdn);
  let jy = g[0] - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(g[0], 3, r[2]);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) return [jy, 1 + div(k, 31), mod(k, 31) + 1];
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r[0] === 1) k += 1;
  }
  return [jy, 7 + div(k, 30), mod(k, 30) + 1];
}

export function isLeapJalaaliYear(year) {
  return jalCal(year)[0] === 0;
}

export function todayJalali() {
  const now = new Date();
  return d2j(g2d(now.getFullYear(), now.getMonth() + 1, now.getDate()));
}

export function toGregorian(jy, jm, jd) {
  const [gy, gm, gd] = d2g(j2d(jy, jm, jd));
  const date = new Date(0);
  date.setUTCFullYear(gy, gm - 1, gd);
  date.setUTCHours(0, 0, 0, 0);
  const parts = Object.fromEntries(gregorianDateFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function daysInMonth(year, month) {
  return month <= 6 ? 31 : month <= 11 ? 30 : isLeapJalaaliYear(year) ? 30 : 29;
}
