import { Game } from "./engine/Game";
import { InputManager } from "./interaction/InputManager";
import { TiltGravity } from "./interaction/TiltGravity";
import { SettingsPane } from "./ui/SettingsPane";
import { Toolbar } from "./ui/Toolbar";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const game = new Game(canvas);
const input = new InputManager(game);
game.inputManager = input;
game.renderer.setInputManager(input);

new Toolbar(document.getElementById("toolbar")!, input);

// Bottom tools bar (play/pause + extras)
const bottomTools = document.getElementById("bottom-tools")!;

// Play/Pause button
const playPauseBtn = document.createElement("button");
playPauseBtn.setAttribute("aria-label", "Play/Pause");
playPauseBtn.style.fontSize = "20px";
playPauseBtn.style.width = "44px";
playPauseBtn.style.borderRadius = "50%";
playPauseBtn.style.padding = "8px";
const updatePlayPause = () => {
  playPauseBtn.textContent = game.paused ? "\u25B6" : "\u23F8";
};
updatePlayPause();
playPauseBtn.addEventListener("click", () => {
  game.paused = !game.paused;
});
game.onPauseChange = updatePlayPause;
bottomTools.appendChild(playPauseBtn);

// Multi-place toggle
const multiBtn = document.createElement("button");
multiBtn.textContent = "Multi";
multiBtn.addEventListener("click", () => {
  input.multiPlace = !input.multiPlace;
  multiBtn.classList.toggle("active", input.multiPlace);
  multiBtn.textContent = input.multiPlace ? "Multi: ON" : "Multi";
});
bottomTools.appendChild(multiBtn);

// Follow selected body toggle
const followBtn = document.createElement("button");
followBtn.textContent = "Follow";
followBtn.addEventListener("click", () => {
  game.followSelected = !game.followSelected;
  followBtn.classList.toggle("active", game.followSelected);
  followBtn.textContent = game.followSelected ? "Follow: ON" : "Follow";
});
bottomTools.appendChild(followBtn);

// Tilt gravity (only on devices with orientation sensor)
if (TiltGravity.isSupported()) {
  const tilt = new TiltGravity(game);
  const tiltBtn = document.createElement("button");
  tiltBtn.textContent = "Tilt Gravity";
  tiltBtn.addEventListener("click", async () => {
    const on = await tilt.toggle();
    tiltBtn.classList.toggle("active", on);
    tiltBtn.textContent = on ? "Tilt: ON" : "Tilt Gravity";
  });
  bottomTools.appendChild(tiltBtn);
}

// 3D renderer toggle
let is3D = false;
const renderBtn = document.createElement("button");
renderBtn.textContent = "3D";
renderBtn.addEventListener("click", async () => {
  if (!is3D) {
    const { ThreeJSRenderer } = await import("./engine/ThreeJSRenderer");
    const renderer3d = new ThreeJSRenderer(canvas);
    game.setRenderer(renderer3d);
    is3D = true;
    renderBtn.classList.add("active");
    renderBtn.textContent = "3D: ON";
  } else {
    const { Renderer } = await import("./engine/Renderer");
    const renderer2d = new Renderer(canvas);
    game.setRenderer(renderer2d);
    is3D = false;
    renderBtn.classList.remove("active");
    renderBtn.textContent = "3D";
  }
});
bottomTools.appendChild(renderBtn);

// Light/Dark mode toggle
const DARK_BG = "#1a1a2e";
const LIGHT_BG = "#d8d8e0";
let darkMode = localStorage.getItem("physbox-dark-mode") !== "false";

function applyTheme() {
  document.body.style.background = darkMode ? DARK_BG : LIGHT_BG;
  themeBtn.textContent = darkMode ? "\u263E" : "\u2600";
}

const themeBtn = document.createElement("button");
themeBtn.setAttribute("aria-label", "Toggle light/dark mode");
themeBtn.style.fontSize = "18px";
themeBtn.style.width = "44px";
themeBtn.style.borderRadius = "50%";
themeBtn.style.padding = "8px";
themeBtn.addEventListener("click", () => {
  darkMode = !darkMode;
  localStorage.setItem("physbox-dark-mode", String(darkMode));
  applyTheme();
});
bottomTools.appendChild(themeBtn);
applyTheme();

// Settings pane (after onPauseChange is set so it can chain)
new SettingsPane(document.getElementById("settings")!, game);

// Mobile hamburger sidebar toggle
const hamburger = document.getElementById("hamburger")!;
const settings = document.getElementById("settings")!;
const overlay = document.getElementById("sidebar-overlay")!;

function toggleSidebar(open?: boolean) {
  const isOpen = open ?? !settings.classList.contains("open");
  settings.classList.toggle("open", isOpen);
  overlay.classList.toggle("open", isOpen);
}

hamburger.addEventListener("click", () => toggleSidebar());
overlay.addEventListener("click", () => toggleSidebar(false));

game.start();
