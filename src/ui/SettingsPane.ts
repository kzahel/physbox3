import { isDeluxe } from "../engine/Box2D";
import type { Game } from "../engine/Game";
import { deleteScene, listScenes, loadScene, saveScene } from "../engine/SceneStore";

export class SettingsPane {
  private scenesListEl!: HTMLElement;
  private game: Game;

  constructor(container: HTMLElement, game: Game) {
    this.game = game;

    container.innerHTML = `
      <div class="section-title">Simulation</div>
      <label>Gravity <input type="range" id="s-gravity" min="-30" max="10" step="0.5" value="${game.gravity}"></label>
      <label>Speed <input type="range" id="s-speed" min="0" max="3" step="0.1" value="${game.timeScale}"></label>
      <label>Bounce <input type="range" id="s-bounce" min="0" max="1" step="0.05" value="${game.bounciness}"></label>
      <label>Physics Hz <input type="range" id="s-physics-hz" min="10" max="120" step="10" value="${game.physicsHz}"> <span id="s-physics-hz-val">${game.physicsHz}</span></label>
      <label>Sand Limit <input type="range" id="s-max-sand" min="100" max="5000" step="100" value="${game.maxSand}"> <span id="s-max-sand-val">${game.maxSand}</span></label>
      <label>Fluid Limit <input type="range" id="s-max-fluid" min="500" max="12000" step="100" value="${game.maxFluidParticles}"> <span id="s-max-fluid-val">${game.maxFluidParticles}</span></label>

      <div class="section-title">Actions</div>
      <label><button id="s-clear">Clear Dynamic</button></label>
      <label><button id="s-reset">Reset Scene</button></label>
      <label><button id="s-pause">${game.paused ? "Play" : "Pause"}</button></label>
      <label><button id="s-fullscreen">Fullscreen</button></label>
      <label><button id="s-debug-bounds">Debug Bounds</button></label>

      <div class="section-title">Scenes</div>
      <div class="scene-save-row">
        <input type="text" id="s-scene-name" placeholder="Scene name" maxlength="40" />
        <button id="s-save">Save</button>
      </div>
      <div id="s-scenes-list" class="scenes-list"></div>

      <div class="section-title debug-toggle" id="s-debug-toggle">Debug Stats &#9660;</div>
      <div id="debug-panel" class="debug-panel" style="display:none">
        <div class="debug-row" id="d-engine"></div>
        <div class="debug-row" id="d-fps"></div>
        <div class="debug-row" id="d-fluid"></div>
        <div class="debug-row" id="d-render"></div>
        <div class="debug-row" id="d-step"></div>
        <div class="debug-bar-section">
          <div class="debug-label">Frame breakdown (ms)</div>
          <div class="debug-bars" id="d-frame-bars"></div>
        </div>
        <div class="debug-bar-section">
          <div class="debug-label">Step breakdown (ms)</div>
          <div class="debug-bars" id="d-bars"></div>
        </div>
        <div class="debug-row" id="d-counts"></div>
        <div class="debug-row" id="d-mem"></div>
      </div>
    `;

    const bindSlider = (id: string, handler: (v: number) => void, parse = parseFloat) => {
      const el = container.querySelector<HTMLInputElement>(id)!;
      el.addEventListener("input", () => handler(parse(el.value)));
    };

    bindSlider("#s-gravity", (v) => game.setGravity(v));
    bindSlider("#s-speed", (v) => {
      game.timeScale = v;
    });
    bindSlider("#s-bounce", (v) => game.setBounciness(v));
    const hzVal = container.querySelector<HTMLSpanElement>("#s-physics-hz-val")!;
    bindSlider(
      "#s-physics-hz",
      (v) => {
        game.physicsHz = v;
        hzVal.textContent = String(v);
      },
      (s) => parseInt(s, 10),
    );

    const sandVal = container.querySelector<HTMLSpanElement>("#s-max-sand-val")!;
    bindSlider(
      "#s-max-sand",
      (v) => {
        game.maxSand = v;
        sandVal.textContent = String(v);
      },
      (s) => parseInt(s, 10),
    );

    const fluidVal = container.querySelector<HTMLSpanElement>("#s-max-fluid-val")!;
    bindSlider(
      "#s-max-fluid",
      (v) => {
        game.setMaxFluidParticles(v);
        fluidVal.textContent = String(game.maxFluidParticles);
      },
      (s) => parseInt(s, 10),
    );

    container.querySelector("#s-clear")!.addEventListener("click", () => game.clearDynamic());
    container.querySelector("#s-reset")!.addEventListener("click", () => game.reset());

    const pauseBtn = container.querySelector<HTMLButtonElement>("#s-pause")!;
    pauseBtn.addEventListener("click", () => {
      game.paused = !game.paused;
    });
    const prevOnPause = game.onPauseChange;
    game.onPauseChange = () => {
      prevOnPause?.();
      pauseBtn.textContent = game.paused ? "Play" : "Pause";
    };

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

    const debugBtn = container.querySelector<HTMLButtonElement>("#s-debug-bounds")!;
    debugBtn.addEventListener("click", () => {
      const r = game.renderer as { debug?: boolean };
      if ("debug" in r) {
        r.debug = !r.debug;
        debugBtn.textContent = r.debug ? "Debug Bounds: ON" : "Debug Bounds";
      }
    });

    // Scene save/load
    const nameInput = container.querySelector<HTMLInputElement>("#s-scene-name")!;
    const saveBtn = container.querySelector<HTMLButtonElement>("#s-save")!;
    this.scenesListEl = container.querySelector("#s-scenes-list")!;

    saveBtn.addEventListener("click", async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      await saveScene(name, game);
      nameInput.value = "";
      this.refreshScenesList();
    });

    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveBtn.click();
      e.stopPropagation(); // prevent WASD camera pan while typing
    });
    nameInput.addEventListener("keyup", (e) => e.stopPropagation());

    this.scenesListEl.addEventListener("click", async (e) => {
      const target = e.target as HTMLElement;
      const item = target.closest(".scene-item") as HTMLElement | null;
      if (!item) return;
      const name = item.dataset.name!;
      if (target.closest(".scene-load")) {
        await loadScene(name, this.game);
      } else if (target.closest(".scene-delete")) {
        await deleteScene(name);
        this.refreshScenesList();
      }
    });

    this.refreshScenesList();

    // Debug panel toggle
    const debugToggle = container.querySelector<HTMLElement>("#s-debug-toggle")!;
    const debugPanel = container.querySelector<HTMLElement>("#debug-panel")!;
    debugToggle.addEventListener("click", () => {
      const open = debugPanel.style.display !== "none";
      debugPanel.style.display = open ? "none" : "block";
      debugToggle.innerHTML = `Debug Stats ${open ? "&#9660;" : "&#9650;"}`;
    });

    // Engine info (static)
    const engineEl = container.querySelector<HTMLElement>("#d-engine")!;
    const flavor = isDeluxe ? "Deluxe (SIMD + threads)" : "Compat (no SIMD)";
    const workers = game.pw.workerCount;
    engineEl.textContent = `${flavor} | ${workers > 0 ? `${workers} workers` : "single-threaded"}`;

    // Stats update
    const fpsEl = container.querySelector<HTMLElement>("#d-fps")!;
    const fluidEl = container.querySelector<HTMLElement>("#d-fluid")!;
    const renderEl = container.querySelector<HTMLElement>("#d-render")!;
    const stepEl = container.querySelector<HTMLElement>("#d-step")!;
    const frameBarsEl = container.querySelector<HTMLElement>("#d-frame-bars")!;
    const barsEl = container.querySelector<HTMLElement>("#d-bars")!;
    const countsEl = container.querySelector<HTMLElement>("#d-counts")!;
    const memEl = container.querySelector<HTMLElement>("#d-mem")!;

    const frameBarColors: Record<string, string> = {
      physics: "#e88",
      render: "#8be",
      idle: "#5a5a6a",
    };
    const barColors: Record<string, string> = {
      collide: "#e88",
      solve: "#8be",
      bullets: "#eb8",
      sensors: "#8e8",
    };

    setInterval(() => {
      const p = game.profile;
      const fluidCount = game.particleSystem.getCount();
      const fluidLimit = game.particleSystem.getMaxParticles();
      const fluidBufferKB = (game.particleSystem.getPositionBuffer().byteLength / 1024).toFixed(1);
      const rendererMode = game.renderer.constructor.name === "ThreeJSRenderer" ? "3D points" : "2D circles";

      fpsEl.textContent = `FPS: ${game.fps} | Bodies: ${game.bodyCount} | Sand: ${game.sandBodies.length}`;
      fluidEl.textContent = `Fluid: ${fluidCount}/${fluidLimit || "∞"} | Radius: ${game.particleSystem.getParticleRadius().toFixed(2)} | Buffer: ${fluidBufferKB}KB`;
      renderEl.textContent = `Render: ${rendererMode} | Step: combined WASM | Hz: ${game.physicsHz} x ${game.physicsSubSteps}`;

      // Frame breakdown bar
      const ft = game.frameTiming;
      const frameParts = [
        { key: "physics", val: ft.physics },
        { key: "render", val: ft.render },
        { key: "idle", val: ft.idle },
      ];
      const frameTotal = Math.max(
        frameParts.reduce((s, x) => s + x.val, 0),
        0.01,
      );
      frameBarsEl.innerHTML = frameParts
        .map((x) => {
          const pct = Math.max((x.val / frameTotal) * 100, 0);
          return `<div class="debug-bar" style="width:${pct.toFixed(1)}%;background:${frameBarColors[x.key]}" title="${x.key}: ${x.val.toFixed(2)}ms"></div>`;
        })
        .join("");

      if (!p) return;

      stepEl.textContent = `Step: ${p.step.toFixed(2)}ms | Awake: ${p.awakeBodyCount}`;

      // Bar chart
      const parts = [
        { key: "collide", val: p.collide },
        { key: "solve", val: p.solve },
        { key: "bullets", val: p.bullets },
        { key: "sensors", val: p.sensors },
      ];
      const total = Math.max(
        parts.reduce((s, x) => s + x.val, 0),
        0.01,
      );
      barsEl.innerHTML = parts
        .map((x) => {
          const pct = Math.max((x.val / total) * 100, 0);
          return `<div class="debug-bar" style="width:${pct.toFixed(1)}%;background:${barColors[x.key]}" title="${x.key}: ${x.val.toFixed(2)}ms"></div>`;
        })
        .join("");

      countsEl.textContent = `Shapes: ${p.shapeCount} | Contacts: ${p.contactCount} | Joints: ${p.jointCount} | Islands: ${p.islandCount}`;
      memEl.textContent = `WASM mem: ${(p.byteCount / 1024).toFixed(0)}KB | Tasks: ${p.taskCount}`;
    }, 500);
  }

  private async refreshScenesList() {
    const scenes = await listScenes();
    if (scenes.length === 0) {
      this.scenesListEl.innerHTML = '<div class="scenes-empty">No saved scenes</div>';
      return;
    }

    this.scenesListEl.innerHTML = scenes
      .map(
        (s) => `
      <div class="scene-item" data-name="${s.name.replace(/"/g, "&quot;")}">
        <span class="scene-name">${s.name}</span>
        <div class="scene-actions">
          <button class="scene-load" title="Load">&#9654;</button>
          <button class="scene-delete" title="Delete">&times;</button>
        </div>
      </div>
    `,
      )
      .join("");
  }
}
