export const MAX_LOOP_CARDS_PER_PANEL = 2;

export function findLoopCardLimitViolation(value, path = "payload") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const violation = findLoopCardLimitViolation(value[index], `${path}[${index}]`);
      if (violation) return violation;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;

  for (const [key, item] of Object.entries(value)) {
    const fieldPath = `${path}.${key}`;
    if (key === "loopCards" && Array.isArray(item) && item.length > MAX_LOOP_CARDS_PER_PANEL) {
      return { path: fieldPath, count: item.length, maximum: MAX_LOOP_CARDS_PER_PANEL };
    }
    const violation = findLoopCardLimitViolation(item, fieldPath);
    if (violation) return violation;
  }

  return null;
}
