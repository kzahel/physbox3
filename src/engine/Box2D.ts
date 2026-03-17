/**
 * Box2D WASM module singleton.
 * Call init() once at startup, then import `b2` everywhere.
 */
import type { MainModule } from "box2d3";
import Box2DFactory from "box2d3-wasm";

export type B2 = MainModule;

let _b2: B2 | null = null;

/** Initialize the Box2D WASM module. Must be called once before anything else. */
export async function initBox2D(): Promise<B2> {
  if (_b2) return _b2;
  _b2 = await Box2DFactory();
  return _b2;
}

/** Get the initialized Box2D module. Throws if not yet initialized. */
export function b2(): B2 {
  if (!_b2) throw new Error("Box2D not initialized — call initBox2D() first");
  return _b2;
}
