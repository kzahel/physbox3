import type { Game } from "../engine/Game";

export class SettingsPane {
  constructor(container: HTMLElement, game: Game) {
    container.innerHTML = `
      <div class="section-title">Simulation</div>
      <label>Gravity <input type="range" id="s-gravity" min="-30" max="10" step="0.5" value="${game.gravity}"></label>
      <label>Speed <input type="range" id="s-speed" min="0" max="3" step="0.1" value="${game.timeScale}"></label>

      <div class="section-title">Actions</div>
      <label><button id="s-clear">Clear Dynamic</button></label>
      <label><button id="s-pause">${game.paused ? "Play" : "Pause"}</button></label>
      <label><button id="s-fullscreen">Fullscreen</button></label>

      <div id="stats"></div>
    `;

    const gravSlider = container.querySelector<HTMLInputElement>("#s-gravity")!;
    gravSlider.addEventListener("input", () => game.setGravity(parseFloat(gravSlider.value)));

    const speedSlider = container.querySelector<HTMLInputElement>("#s-speed")!;
    speedSlider.addEventListener("input", () => {
      game.timeScale = parseFloat(speedSlider.value);
    });

    container.querySelector("#s-clear")!.addEventListener("click", () => game.clearDynamic());

    const pauseBtn = container.querySelector<HTMLButtonElement>("#s-pause")!;
    pauseBtn.addEventListener("click", () => {
      game.paused = !game.paused;
      pauseBtn.textContent = game.paused ? "Play" : "Pause";
    });

    const fsBtn = container.querySelector<HTMLButtonElement>("#s-fullscreen")!;
    fsBtn.addEventListener("click", () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    });
    document.addEventListener("fullscreenchange", () => {
      fsBtn.textContent = document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen";
    });

    // Stats update
    const statsEl = container.querySelector("#stats")!;
    setInterval(() => {
      statsEl.textContent = `FPS: ${game.fps} | Bodies: ${game.bodyCount}`;
    }, 500);
  }
}
