/**
 * Runtime module declaration for @physbox/box2d3-wasm.
 * Types come via tsconfig paths alias "box2d3" → the actual .d.ts file.
 * This declaration just lets us import the default factory from the npm package at runtime.
 */
declare module "@physbox/box2d3-wasm" {
  import type { MainModule, ModuleOptions } from "box2d3";
  export default function Box2DFactory(options?: ModuleOptions): Promise<MainModule>;
}
