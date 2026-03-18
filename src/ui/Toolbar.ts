import type { InputManager, Tool } from "../interaction/InputManager";

const S = 18; // icon viewBox size

const ICONS: Record<Tool, string> = {
  grab: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><path d="M9 2v6M6 4v7M12 4v7M15 7v4M6 11q0 5 5 5t5-5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  box: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><rect x="3" y="3" width="12" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
  ball: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
  platform: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><line x1="2" y1="13" x2="16" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  car: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><rect x="2" y="7" width="14" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4 7l2-3h6l2 3" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="5" cy="13" r="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="13" cy="13" r="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>`,
  launcher: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><rect x="3" y="14" width="12" height="2" rx="0.5" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="9" y1="14" x2="9" y2="6" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="4" width="10" height="2" rx="0.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M7 14v-2M11 14v-2" stroke="currentColor" stroke-width="0.8" stroke-dasharray="1 1"/></svg>`,
  springball: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><circle cx="9" cy="9" r="2" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="9" cy="2" r="1.5" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="15" cy="6" r="1.5" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="13" cy="14" r="1.5" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="5" cy="14" r="1.5" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="3" cy="6" r="1.5" fill="none" stroke="currentColor" stroke-width="1"/><line x1="9" y1="7" x2="9" y2="3.5" stroke="currentColor" stroke-width="0.8" stroke-dasharray="1.5 1"/><line x1="10.8" y1="8" x2="13.5" y2="6.5" stroke="currentColor" stroke-width="0.8" stroke-dasharray="1.5 1"/><line x1="10.5" y1="10.5" x2="12" y2="13" stroke="currentColor" stroke-width="0.8" stroke-dasharray="1.5 1"/><line x1="7.5" y1="10.5" x2="6" y2="13" stroke="currentColor" stroke-width="0.8" stroke-dasharray="1.5 1"/><line x1="7.2" y1="8" x2="4.5" y2="6.5" stroke="currentColor" stroke-width="0.8" stroke-dasharray="1.5 1"/></svg>`,
  seesaw: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><polygon points="9,14 5,16 13,16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><line x1="3" y1="11" x2="15" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  rocket: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><path d="M9 2L7 8v5l-2 2h8l-2-2V8z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M7.5 15q0 2 1.5 2t1.5-2" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>`,
  conveyor: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><rect x="2" y="7" width="14" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5 9h2M9 9h2M13 9h1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M6 9l-1-1M6 9l-1 1M10 9l-1-1M10 9l-1 1" stroke="currentColor" stroke-width="0.8"/></svg>`,
  dynamite: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><rect x="6" y="6" width="6" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="9" y1="6" x2="9" y2="3" stroke="currentColor" stroke-width="1"/><circle cx="9" cy="2" r="1" fill="currentColor"/></svg>`,
  ropetool: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><circle cx="3" cy="3" r="2" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="15" cy="15" r="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5 4q4 2 3 5t1 6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  spring: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><circle cx="3" cy="3" r="2" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="15" cy="15" r="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5 4l4 1-2 2 4 1-2 2 4 1-2 2 2 2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  erase: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><line x1="4" y1="4" x2="14" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="14" y1="4" x2="4" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  attach: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><circle cx="5" cy="9" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="13" cy="9" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="9" x2="10" y2="9" stroke="currentColor" stroke-width="1.5"/></svg>`,
  detach: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><circle cx="5" cy="9" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="13" cy="9" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="7" x2="10" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="7" x2="8" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  attract: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><circle cx="4" cy="9" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="14" cy="9" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 9h2M10 7l2 2-2 2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  select: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><path d="M4 3l10 6-5 1-2 5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  scale: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><rect x="5" y="5" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1"/><path d="M13 5l3-3M16 2v3h-3M5 13l-3 3M2 16v-3h3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  balloon: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><ellipse cx="9" cy="7" rx="5" ry="6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M9 13q-0.5 1 0 2t-1 2" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>`,
  fan: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><rect x="2" y="6" width="5" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M7 8h4M7 10h5M7 12h3" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-dasharray="2 1.5"/></svg>`,
  cannon: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><rect x="2" y="6" width="8" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="9" y="7" width="5" height="4" rx="0.5" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="5" cy="14" r="2" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="10" cy="14" r="2" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>`,
  ragdoll: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><circle cx="9" cy="3" r="2" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="9" y1="5" x2="9" y2="11" stroke="currentColor" stroke-width="1.3"/><line x1="5" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="9" y1="11" x2="6" y2="16" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="9" y1="11" x2="12" y2="16" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  glue: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><path d="M9 2v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="6" y="6" width="6" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M7 10v3q2 2 4 0v-3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 14q0 1 1 2t1-2" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>`,
  unglue: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><path d="M9 2v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="6" y="6" width="6" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M7 10v3q2 2 4 0v-3" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="4" y1="4" x2="14" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  train: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><rect x="1" y="7" width="6" height="4" rx="0.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="1" y="5" width="3" height="2" rx="0.3" fill="none" stroke="currentColor" stroke-width="1"/><rect x="8" y="6" width="4" height="5" rx="0.3" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="13" y="6" width="4" height="5" rx="0.3" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="7" y1="9" x2="8" y2="9" stroke="currentColor" stroke-width="0.8"/><line x1="12" y1="9" x2="13" y2="9" stroke="currentColor" stroke-width="0.8"/><circle cx="2.5" cy="12.5" r="1.3" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="5.5" cy="12.5" r="1.3" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="10" cy="12.5" r="1.3" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="15" cy="12.5" r="1.3" fill="none" stroke="currentColor" stroke-width="1"/></svg>`,
  draw: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><path d="M3 15L5 5l3 4 3-6 3 8 2-3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 15l2-10 3 4 3-6 3 8 2-3" fill="rgba(120,200,160,0.3)" stroke="none"/></svg>`,
  terrain: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><path d="M1 14l3-5 3 2 4-7 3 4 3-2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 14l3-5 3 2 4-7 3 4 3-2V18H1z" fill="rgba(80,100,60,0.4)" stroke="none"/></svg>`,
  water: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><path d="M3 10q3-3 6 0t6 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M3 14q3-3 6 0t6 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M3 14q3-3 6 0t6 0V18H3z" fill="rgba(60,140,255,0.3)" stroke="none"/></svg>`,
  jelly: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><rect x="3" y="5" width="12" height="8" rx="2" fill="rgba(80,220,80,0.3)" stroke="currentColor" stroke-width="1.3"/><path d="M5 5q0-1.5 4-1.5t4 1.5" fill="none" stroke="currentColor" stroke-width="0.8"/><path d="M5 13q0 1.5 4 1.5t4-1.5" fill="none" stroke="currentColor" stroke-width="0.8"/></svg>`,
  sand: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><circle cx="5" cy="14" r="1.5" fill="rgba(210,180,100,0.9)" stroke="currentColor" stroke-width="0.5"/><circle cx="9" cy="15" r="1.5" fill="rgba(194,164,90,0.9)" stroke="currentColor" stroke-width="0.5"/><circle cx="13" cy="14" r="1.5" fill="rgba(220,190,110,0.9)" stroke="currentColor" stroke-width="0.5"/><circle cx="7" cy="11" r="1.5" fill="rgba(210,180,100,0.9)" stroke="currentColor" stroke-width="0.5"/><circle cx="11" cy="11" r="1.5" fill="rgba(194,164,90,0.9)" stroke="currentColor" stroke-width="0.5"/><circle cx="9" cy="8" r="1.5" fill="rgba(220,190,110,0.9)" stroke="currentColor" stroke-width="0.5"/></svg>`,
};

const TOOLS: { id: Tool; label: string }[] = [
  { id: "grab", label: "Grab" },
  { id: "box", label: "Box" },
  { id: "ball", label: "Ball" },
  { id: "platform", label: "Platform" },
  { id: "car", label: "Car" },
  { id: "springball", label: "Star" },
  { id: "jelly", label: "Jelly" },
  { id: "launcher", label: "Launch" },
  { id: "seesaw", label: "Seesaw" },
  { id: "rocket", label: "Rocket" },
  { id: "balloon", label: "Balloon" },
  { id: "ragdoll", label: "Ragdoll" },
  { id: "fan", label: "Fan" },
  { id: "cannon", label: "Cannon" },
  { id: "draw", label: "Draw" },
  { id: "terrain", label: "Terrain" },
  { id: "train", label: "Train" },
  { id: "conveyor", label: "Belt" },
  { id: "dynamite", label: "TNT" },
  { id: "ropetool", label: "Tie" },
  { id: "spring", label: "Spring" },
  { id: "water", label: "Water" },
  { id: "sand", label: "Sand" },
  { id: "erase", label: "Erase" },
  { id: "glue", label: "Glue" },
  { id: "unglue", label: "Unglue" },
  { id: "attract", label: "Attach" },
  { id: "detach", label: "Detach" },
  { id: "select", label: "Select" },
  { id: "scale", label: "Scale" },
];

export class Toolbar {
  private buttons = new Map<Tool, HTMLButtonElement>();

  constructor(container: HTMLElement, input: InputManager) {
    for (const t of TOOLS) {
      const btn = document.createElement("button");
      btn.innerHTML = `${ICONS[t.id]}<span>${t.label}</span>`;
      btn.title = `${t.label} (${TOOLS.indexOf(t) + 1})`;
      btn.addEventListener("click", () => input.setTool(t.id));
      container.appendChild(btn);
      this.buttons.set(t.id, btn);
    }

    input.onToolChange = (tool) => this.highlight(tool);
    this.highlight(input.tool);

    // Keyboard shortcuts: 1-9
    window.addEventListener("keydown", (e) => {
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < TOOLS.length) {
        input.setTool(TOOLS[idx].id);
      }
    });
  }

  private highlight(tool: Tool) {
    for (const [id, btn] of this.buttons) {
      btn.classList.toggle("active", id === tool);
    }
  }
}
