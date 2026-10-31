const offsetDate = (minutesAgo, now) => new Date(now.getTime() - minutesAgo * 60_000);

export function createSamplePanelEvents(panel, profiles = [], language = "fa", now = new Date()) {
  const userName = (slot) => profiles.find((profile) => Number(profile.slot) === slot)?.name?.trim() || (language === "en" ? `Panel user ${slot}` : `کاربر پنل ${slot}`);
  const event = (id, type, title, description, occurredMinutesAgo, ackSlot, ackMinutesAgo, silenceSlot = null, silenceMinutesAgo = null) => ({
    id: `sample-${id}`,
    type,
    titleFa: title[0],
    titleEn: title[1],
    descriptionFa: description[0],
    descriptionEn: description[1],
    panelId: panel?.id || "",
    isSample: true,
    occurredAt: offsetDate(occurredMinutesAgo, now).toISOString(),
    acknowledgedBy: ackSlot ? userName(ackSlot) : "",
    acknowledgedAt: ackSlot ? offsetDate(ackMinutesAgo, now).toISOString() : "",
    silencedBy: silenceSlot ? userName(silenceSlot) : "",
    silencedAt: silenceSlot ? offsetDate(silenceMinutesAgo, now).toISOString() : "",
  });

  return [
    event("fire-01", "fire", ["حریق", "Fire alarm"], ["شستی اعلام حریق · طبقهٔ دوم", "Manual call point · Floor 2"], 38, 1, 35, 2, 32),
    event("prealarm-02", "pre-alarm", ["پیش‌هشدار دود", "Smoke pre-alarm"], ["دتکتور دود · راهروی شرقی", "Smoke detector · East corridor"], 96, 3, 92),
    event("loop-open-03", "fault", ["خطای مدار باز لوپ", "Loop open-circuit fault"], ["Loop 1 · آدرس 018", "Loop 1 · Address 018"], 218, 4, 211),
    event("mains-fault-04", "fault", ["قطع برق شهر", "Mains power failure"], ["ورودی تغذیهٔ اصلی پنل", "Panel mains power input"], 575, 2, 568),
    event("battery-fault-05", "fault", ["خطای باتری پشتیبان", "Backup battery fault"], ["باتری شمارهٔ ۱ · ولتاژ پایین", "Battery 1 · Low voltage"], 1_510, 1, 1_495),
    event("waterflow-06", "supervisory", ["جریان آب اسپرینکلر", "Sprinkler water flow"], ["رایزر شمالی · طبقهٔ همکف", "North riser · Ground floor"], 2_140, 3, 2_133, 4, 2_127),
    event("restored-07", "normal", ["بازگشت به حالت عادی", "Condition restored"], ["مدار تغذیه پس از رفع خطا عادی شد", "Power circuit returned to normal after repair"], 2_195, null, null),
  ];
}
