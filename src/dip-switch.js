import svgMarkup from "./assets/dip-switch.svg?raw";

// The SVG is bundled with this module so rendering never waits for a second network request.
export function mountDipSwitch(host, { states = Array(8).fill(false), onChange = () => {} } = {}) {
  if (typeof host === "string") host = document.querySelector(host);
  if (!host) throw new Error("DIP switch host element was not found.");
  host._dipSwitchCleanup?.();
  const template = document.createElement("template");
  template.innerHTML = svgMarkup.trim();
  const svg = template.content.querySelector("svg");
  if (!svg || svg.querySelectorAll(".dip-switch").length !== 8) throw new Error("DIP switch SVG must contain exactly eight switches.");
  host.replaceChildren(svg);
  let current = Array(8).fill(false);
  const switches = [...svg.querySelectorAll(".dip-switch")];
  const render = () => switches.forEach((item, index) => {
    const on = current[index];
    const lever = item.querySelector(".lever");
    lever?.setAttribute("transform", on ? "translate(0 0)" : "translate(0 40)");
    item.setAttribute("aria-pressed", String(on));
    item.setAttribute("aria-label", `Switch ${index + 1}, ${on ? "ON" : "OFF"}`);
  });
  const update = (next, notify = true) => {
    if (!Array.isArray(next) || next.length !== 8 || next.some((bit) => typeof bit !== "boolean")) throw new TypeError("Exactly eight Boolean switch states are required.");
    current = [...next]; render();
    if (notify) onChange([...current]);
  };
  const click = (event) => {
    const item = event.target.closest(".dip-switch");
    if (!item || !svg.contains(item)) return;
    const index = Number(item.dataset.index);
    if (index < 0 || index > 7) return;
    const next = [...current]; next[index] = !next[index]; update(next);
  };
  const keydown = (event) => {
    if ((event.key !== "Enter" && event.key !== " ") || !event.target.matches(".dip-switch")) return;
    event.preventDefault();
    const next = [...current]; const index = Number(event.target.dataset.index); next[index] = !next[index]; update(next);
  };
  svg.addEventListener("click", click); svg.addEventListener("keydown", keydown);
  host._dipSwitchCleanup = () => { svg.removeEventListener("click", click); svg.removeEventListener("keydown", keydown); host.replaceChildren(); delete host._dipSwitchCleanup; };
  const api = { setStates: (next) => update(next, false), getStates: () => [...current], destroy: () => host._dipSwitchCleanup?.() };
  update(states, false);
  return api;
}
