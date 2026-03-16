import type { InputManager, Tool } from "../interaction/InputManager";

const S = 18; // icon viewBox size

const ICONS: Record<Tool, string> = {
  grab: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><path d="M9 2v6M6 4v7M12 4v7M15 7v4M6 11q0 5 5 5t5-5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  box: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><rect x="3" y="3" width="12" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
  ball: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
  platform: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><line x1="2" y1="13" x2="16" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  rope: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><path d="M9 2q-4 4 0 7t0 7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  erase: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><line x1="4" y1="4" x2="14" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="14" y1="4" x2="4" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  attach: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><circle cx="5" cy="9" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="13" cy="9" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="9" x2="10" y2="9" stroke="currentColor" stroke-width="1.5"/></svg>`,
  detach: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><circle cx="5" cy="9" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="13" cy="9" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="7" x2="10" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="7" x2="8" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  attract: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><circle cx="4" cy="9" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="14" cy="9" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 9h2M10 7l2 2-2 2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  select: `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><path d="M4 3l10 6-5 1-2 5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
};

const TOOLS: { id: Tool; label: string }[] = [
  { id: "grab", label: "Grab" },
  { id: "box", label: "Box" },
  { id: "ball", label: "Ball" },
  { id: "platform", label: "Platform" },
  { id: "rope", label: "Rope" },
  { id: "erase", label: "Erase" },
  { id: "attach", label: "Attach" },
  { id: "detach", label: "Detach" },
  { id: "attract", label: "Attach+" },
  { id: "select", label: "Select" },
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
