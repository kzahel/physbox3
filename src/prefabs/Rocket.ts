import type { Body } from "box2d3";
import { makeBody, makeShapeDef } from "../engine/BodyFactory";
import { isRocket, type RocketData } from "../engine/BodyUserData";
import { b2 } from "../engine/Box2D";
import type { IRenderer } from "../engine/IRenderer";
import { bodyAngle, forEachBodyByLabel } from "../engine/Physics";
import type { PhysWorld } from "../engine/PhysWorld";

export function createRocket(pw: PhysWorld, x: number, y: number, angle = 0): Body {
  const B2 = b2();
  const body = makeBody(pw, x, y, { rotation: angle });

  const shapeDef = makeShapeDef();

  // Main body
  shapeDef.density = 1.5;
  shapeDef.material.friction = 0.3;
  body.CreatePolygonShape(shapeDef, B2.b2MakeBox(0.3, 0.8));

  // Nose cone
  shapeDef.density = 0.5;
  const noseHull = B2.b2ComputeHull([new B2.b2Vec2(-0.3, 0.8), new B2.b2Vec2(0.3, 0.8), new B2.b2Vec2(0, 1.4)]);
  body.CreatePolygonShape(shapeDef, B2.b2MakePolygon(noseHull, 0));

  // Left fin
  shapeDef.density = 0.3;
  const lFinHull = B2.b2ComputeHull([new B2.b2Vec2(-0.3, -0.8), new B2.b2Vec2(-0.7, -1.0), new B2.b2Vec2(-0.3, -0.3)]);
  body.CreatePolygonShape(shapeDef, B2.b2MakePolygon(lFinHull, 0));

  // Right fin
  const rFinHull = B2.b2ComputeHull([new B2.b2Vec2(0.3, -0.8), new B2.b2Vec2(0.7, -1.0), new B2.b2Vec2(0.3, -0.3)]);
  body.CreatePolygonShape(shapeDef, B2.b2MakePolygon(rFinHull, 0));

  pw.setUserData(body, { fill: "rgba(200,200,220,0.9)", label: "rocket", thrust: 40, fuel: 20 } satisfies RocketData);
  return body;
}

/** Apply thrust forces and deplete fuel. Must be called inside the fixed timestep loop. */
export function applyRocketThrust(pw: PhysWorld, dt: number): void {
  const B2 = b2();
  forEachBodyByLabel(
    pw,
    isRocket,
    (b, ud) => {
      if (ud.fuel <= 0) return;
      ud.fuel -= dt;

      const a = bodyAngle(b);
      const fx = -Math.sin(a) * ud.thrust * b.GetMass();
      const fy = Math.cos(a) * ud.thrust * b.GetMass();
      b.ApplyForceToCenter(new B2.b2Vec2(fx, fy), true);
    },
    true,
  );
}

/** Spawn exhaust particles for active rockets. Called once per render frame. */
export function spawnRocketParticles(pw: PhysWorld, renderer: IRenderer): void {
  forEachBodyByLabel(
    pw,
    isRocket,
    (b, ud) => {
      if (ud.fuel <= 0) return;
      const a = bodyAngle(b);
      const pos = b.GetPosition();
      const exhaustX = pos.x + Math.sin(a) * 1.0;
      const exhaustY = pos.y - Math.cos(a) * 1.0;
      renderer.particles.spawnFlame(exhaustX, exhaustY, a);
    },
    true,
  );
}
