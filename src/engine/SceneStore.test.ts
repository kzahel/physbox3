import type { Body, b2ShapeId } from "box2d3";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { b2, initBox2D } from "./Box2D";
import { bodyAngle, createRevoluteJoint, createWeldJoint, isDynamic } from "./Physics";
import { PhysWorld } from "./PhysWorld";
import { deserializeScene, serializeScene } from "./SceneStore";

beforeAll(async () => {
  await initBox2D();
});

/** Minimal Game-compatible object for testing serialization */
function createTestGame(gravityY = -10) {
  const pw = new PhysWorld(0, gravityY);
  const obj = {
    pw,
    gravity: gravityY,
    setGravity(g: number) {
      obj.gravity = g;
      pw.setGravity(0, g);
    },
    inputManager: null,
  };
  return obj as unknown as import("./Game").Game;
}

function countBodies(pw: PhysWorld): number {
  let n = 0;
  pw.forEachBody(() => n++);
  return n;
}

function countJoints(pw: PhysWorld): number {
  let n = 0;
  pw.forEachJoint(() => n++);
  return n;
}

describe("SceneStore round-trip serialization", () => {
  let game: ReturnType<typeof createTestGame>;

  beforeEach(() => {
    game = createTestGame(-10);
  });

  it("serializes and deserializes an empty scene", () => {
    const data = serializeScene(game);
    expect(data.bodies).toHaveLength(0);
    expect(data.joints).toHaveLength(0);
    expect(data.gravity).toBe(-10);

    const game2 = createTestGame(0);
    deserializeScene(game2, data);
    expect(game2.gravity).toBe(-10);
    expect(countBodies(game2.pw)).toBe(0);
  });

  it("round-trips a dynamic circle body", () => {
    const B2 = b2();
    const bodyDef = B2.b2DefaultBodyDef();
    bodyDef.type = B2.b2BodyType.b2_dynamicBody;
    bodyDef.position = new B2.b2Vec2(3, 5);
    bodyDef.rotation = B2.b2MakeRot(0.5);
    const body = game.pw.createBody(bodyDef);

    const shapeDef = B2.b2DefaultShapeDef();
    shapeDef.density = 2;
    shapeDef.material.friction = 0.3;
    shapeDef.material.restitution = 0.8;
    shapeDef.enableHitEvents = true;
    const circ = new B2.b2Circle();
    circ.center = new B2.b2Vec2(0, 0);
    circ.radius = 1.5;
    body.CreateCircleShape(shapeDef, circ);

    game.pw.setUserData(body, { fill: "red", label: "ball" });

    const data = serializeScene(game);
    expect(data.bodies).toHaveLength(1);
    expect(data.bodies[0].type).toBe("dynamic");
    expect(data.bodies[0].x).toBeCloseTo(3);
    expect(data.bodies[0].y).toBeCloseTo(5);

    const game2 = createTestGame();
    deserializeScene(game2, data);
    expect(countBodies(game2.pw)).toBe(1);

    let restored: Body | null = null;
    game2.pw.forEachBody((b) => (restored = b));
    expect(restored).not.toBeNull();
    expect(restored!.GetPosition().x).toBeCloseTo(3);
    expect(restored!.GetPosition().y).toBeCloseTo(5);
    expect(bodyAngle(restored!)).toBeCloseTo(0.5);
    expect(game2.pw.getUserData(restored!)?.label).toBe("ball");

    const shapeIds: b2ShapeId[] = restored!.GetShapes() ?? [];
    expect(shapeIds.length).toBe(1);
    expect(B2.b2Shape_GetDensity(shapeIds[0])).toBe(2);
    expect(B2.b2Shape_GetFriction(shapeIds[0])).toBeCloseTo(0.3);
    expect(B2.b2Shape_GetRestitution(shapeIds[0])).toBeCloseTo(0.8);
    const circle = B2.b2Shape_GetCircle(shapeIds[0]);
    expect(circle.radius).toBeCloseTo(1.5);
  });

  it("round-trips a static box body", () => {
    const B2 = b2();
    const bodyDef = B2.b2DefaultBodyDef();
    bodyDef.type = B2.b2BodyType.b2_staticBody;
    bodyDef.position = new B2.b2Vec2(-2, 0);
    const body = game.pw.createBody(bodyDef);

    const shapeDef = B2.b2DefaultShapeDef();
    shapeDef.density = 0;
    shapeDef.material.friction = 1;
    const poly = B2.b2MakeBox(5, 0.5);
    body.CreatePolygonShape(shapeDef, poly);

    game.pw.setUserData(body, { fill: "gray", label: "ground" });

    const data = serializeScene(game);
    const game2 = createTestGame();
    deserializeScene(game2, data);

    let restored: Body | null = null;
    game2.pw.forEachBody((b) => (restored = b));
    expect(!isDynamic(restored!)).toBe(true);
    expect(restored!.GetPosition().x).toBeCloseTo(-2);
  });

  it("round-trips a weld joint", () => {
    const B2 = b2();

    const defA = B2.b2DefaultBodyDef();
    defA.type = B2.b2BodyType.b2_dynamicBody;
    defA.position = new B2.b2Vec2(0, 0);
    const a = game.pw.createBody(defA);
    const sdA = B2.b2DefaultShapeDef();
    sdA.density = 1;
    const cA = new B2.b2Circle();
    cA.center = new B2.b2Vec2(0, 0);
    cA.radius = 0.5;
    a.CreateCircleShape(sdA, cA);

    const defB = B2.b2DefaultBodyDef();
    defB.type = B2.b2BodyType.b2_dynamicBody;
    defB.position = new B2.b2Vec2(1, 0);
    const b = game.pw.createBody(defB);
    const sdB = B2.b2DefaultShapeDef();
    sdB.density = 1;
    const cB = new B2.b2Circle();
    cB.center = new B2.b2Vec2(0, 0);
    cB.radius = 0.5;
    b.CreateCircleShape(sdB, cB);

    createWeldJoint(game.pw, a, b, { x: 0.5, y: 0 });

    const data = serializeScene(game);
    expect(data.joints).toHaveLength(1);
    expect(data.joints[0].type).toBe("weld");

    const game2 = createTestGame();
    deserializeScene(game2, data);
    expect(countBodies(game2.pw)).toBe(2);
    expect(countJoints(game2.pw)).toBe(1);
  });

  it("round-trips a revolute joint with limits", () => {
    const B2 = b2();

    const defA = B2.b2DefaultBodyDef();
    defA.type = B2.b2BodyType.b2_dynamicBody;
    defA.position = new B2.b2Vec2(0, 0);
    const a = game.pw.createBody(defA);
    const sdA = B2.b2DefaultShapeDef();
    sdA.density = 1;
    const cA = new B2.b2Circle();
    cA.center = new B2.b2Vec2(0, 0);
    cA.radius = 0.5;
    a.CreateCircleShape(sdA, cA);

    const defB = B2.b2DefaultBodyDef();
    defB.type = B2.b2BodyType.b2_dynamicBody;
    defB.position = new B2.b2Vec2(1, 0);
    const b = game.pw.createBody(defB);
    const sdB = B2.b2DefaultShapeDef();
    sdB.density = 1;
    const cB = new B2.b2Circle();
    cB.center = new B2.b2Vec2(0, 0);
    cB.radius = 0.5;
    b.CreateCircleShape(sdB, cB);

    createRevoluteJoint(
      game.pw,
      a,
      b,
      { x: 0.5, y: 0 },
      {
        enableLimit: true,
        lowerAngle: -Math.PI / 4,
        upperAngle: Math.PI / 4,
        enableMotor: true,
        motorSpeed: 2,
        maxMotorTorque: 10,
      },
    );

    const data = serializeScene(game);
    expect(data.joints).toHaveLength(1);
    const sj = data.joints[0];
    expect(sj.type).toBe("revolute");
    expect(sj.enableMotorLimit).toBe(true);
    expect(sj.lowerAngle).toBeCloseTo(-Math.PI / 4);
    expect(sj.upperAngle).toBeCloseTo(Math.PI / 4);
    expect(sj.enableMotor).toBe(true);
    expect(sj.motorSpeed).toBe(2);

    const game2 = createTestGame();
    deserializeScene(game2, data);
    expect(countJoints(game2.pw)).toBe(1);
  });

  it("round-trips multiple bodies and preserves count", () => {
    const B2 = b2();
    for (let i = 0; i < 5; i++) {
      const bodyDef = B2.b2DefaultBodyDef();
      bodyDef.type = B2.b2BodyType.b2_dynamicBody;
      bodyDef.position = new B2.b2Vec2(i, 0);
      const body = game.pw.createBody(bodyDef);
      const shapeDef = B2.b2DefaultShapeDef();
      shapeDef.density = 1;
      const circ = new B2.b2Circle();
      circ.center = new B2.b2Vec2(0, 0);
      circ.radius = 0.3;
      body.CreateCircleShape(shapeDef, circ);
      game.pw.setUserData(body, { fill: "blue", label: `body${i}` });
    }

    const data = serializeScene(game);
    expect(data.bodies).toHaveLength(5);

    const game2 = createTestGame();
    deserializeScene(game2, data);
    expect(countBodies(game2.pw)).toBe(5);
  });

  it("round-trips polygon shapes", () => {
    const B2 = b2();
    const bodyDef = B2.b2DefaultBodyDef();
    bodyDef.type = B2.b2BodyType.b2_dynamicBody;
    bodyDef.position = new B2.b2Vec2(0, 0);
    const body = game.pw.createBody(bodyDef);

    const verts = [new B2.b2Vec2(0, 0), new B2.b2Vec2(1, 0), new B2.b2Vec2(0.5, 1)];
    const hull = B2.b2ComputeHull(verts);
    const poly = B2.b2MakePolygon(hull, 0);
    const shapeDef = B2.b2DefaultShapeDef();
    shapeDef.density = 1;
    body.CreatePolygonShape(shapeDef, poly);

    const data = serializeScene(game);
    expect(data.bodies[0].shapes[0].type).toBe("polygon");
    expect(data.bodies[0].shapes[0].params.length).toBe(6); // 3 verts × 2 coords

    const game2 = createTestGame();
    deserializeScene(game2, data);
    expect(countBodies(game2.pw)).toBe(1);
  });

  it("round-trips segment shapes", () => {
    const B2 = b2();
    const bodyDef = B2.b2DefaultBodyDef();
    bodyDef.type = B2.b2BodyType.b2_staticBody;
    bodyDef.position = new B2.b2Vec2(0, 0);
    const body = game.pw.createBody(bodyDef);

    const seg = new B2.b2Segment();
    seg.point1 = new B2.b2Vec2(-10, 0);
    seg.point2 = new B2.b2Vec2(10, 0);
    const shapeDef = B2.b2DefaultShapeDef();
    body.CreateSegmentShape(shapeDef, seg);

    const data = serializeScene(game);
    expect(data.bodies[0].shapes[0].type).toBe("segment");

    const game2 = createTestGame();
    deserializeScene(game2, data);
    expect(countBodies(game2.pw)).toBe(1);
  });

  it("preserves gravity across serialization", () => {
    game.setGravity(-5);
    const data = serializeScene(game);
    expect(data.gravity).toBe(-5);

    const game2 = createTestGame(-20);
    deserializeScene(game2, data);
    expect(game2.gravity).toBe(-5);
  });

  it("clears existing bodies on deserialize", () => {
    const B2 = b2();
    const game2 = createTestGame();
    const bodyDef = B2.b2DefaultBodyDef();
    bodyDef.type = B2.b2BodyType.b2_dynamicBody;
    bodyDef.position = new B2.b2Vec2(99, 99);
    const old = game2.pw.createBody(bodyDef);
    const shapeDef = B2.b2DefaultShapeDef();
    shapeDef.density = 1;
    const circ = new B2.b2Circle();
    circ.center = new B2.b2Vec2(0, 0);
    circ.radius = 1;
    old.CreateCircleShape(shapeDef, circ);

    const data = serializeScene(game); // empty scene
    deserializeScene(game2, data);
    expect(countBodies(game2.pw)).toBe(0);
  });
});
