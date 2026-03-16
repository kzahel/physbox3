import { Game } from "./engine/Game";
import { InputManager } from "./interaction/InputManager";
import { SettingsPane } from "./ui/SettingsPane";
import { Toolbar } from "./ui/Toolbar";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const game = new Game(canvas);
const input = new InputManager(game);

new Toolbar(document.getElementById("toolbar")!, input);
new SettingsPane(document.getElementById("settings")!, game);

game.start();
