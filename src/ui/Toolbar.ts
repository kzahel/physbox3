import type { InputManager, Tool } from "../interaction/InputManager";

const TOOLS: { id: Tool; label: string }[] = [
  { id: "grab", label: "Grab" },
  { id: "box", label: "Box" },
  { id: "ball", label: "Ball" },
  { id: "platform", label: "Platform" },
  { id: "rope", label: "Rope" },
  { id: "erase", label: "Erase" },
];

export class Toolbar {
  private buttons = new Map<Tool, HTMLButtonElement>();

  constructor(container: HTMLElement, input: InputManager) {
    for (const t of TOOLS) {
      const btn = document.createElement("button");
      btn.textContent = t.label;
      btn.addEventListener("click", () => input.setTool(t.id));
      container.appendChild(btn);
      this.buttons.set(t.id, btn);
    }

    input.onToolChange = (tool) => this.highlight(tool);
    this.highlight(input.tool);

    // Keyboard shortcuts: 1-6
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
