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
