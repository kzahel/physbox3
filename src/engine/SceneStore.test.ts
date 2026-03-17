import * as planck from "planck";
import { beforeEach, describe, expect, it } from "vitest";
import { createWeldJoint, forEachBody } from "./Physics";
import { deserializeScene, serializeScene } from "./SceneStore";

/** Minimal Game-compatible object for testing serialization */
function createTestGame(gravityY = -10) {
  const world = new planck.World(planck.Vec2(0, gravityY));
  const obj = {
    world,
    gravity: gravityY,
    setGravity(g: number) {
      obj.gravity = g;
      world.setGravity(planck.Vec2(0, g));
    },
    inputManager: null,
  };
  return obj as unknown as import("./Game").Game;
}

function countBodies(world: planck.World): number {
  let n = 0;
  forEachBody(world, () => n++);
  return n;
}

function countJoints(world: planck.World): number {
  let n = 0;
  for (let j = world.getJointList(); j; j = j.getNext()) n++;
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
    expect(countBodies(game2.world)).toBe(0);
  });

  it("round-trips a dynamic circle body", () => {
    const body = game.world.createBody({
      type: "dynamic",
      position: planck.Vec2(3, 5),
      angle: 0.5,
    });
    body.createFixture({ shape: planck.Circle(1.5), density: 2, friction: 0.3, restitution: 0.8 });
    body.setUserData({ fill: "red", label: "ball" });

    const data = serializeScene(game);
    expect(data.bodies).toHaveLength(1);
    expect(data.bodies[0].type).toBe("dynamic");
    expect(data.bodies[0].x).toBeCloseTo(3);
    expect(data.bodies[0].y).toBeCloseTo(5);

    const game2 = createTestGame();
    deserializeScene(game2, data);
    expect(countBodies(game2.world)).toBe(1);

    let restored: planck.Body | null = null;
    forEachBody(game2.world, (b) => (restored = b));
    expect(restored).not.toBeNull();
    expect(restored!.getPosition().x).toBeCloseTo(3);
    expect(restored!.getPosition().y).toBeCloseTo(5);
    expect(restored!.getAngle()).toBeCloseTo(0.5);
    expect((restored!.getUserData() as Record<string, unknown>).label).toBe("ball");

    const fixture = restored!.getFixtureList()!;
    expect(fixture.getDensity()).toBe(2);
    expect(fixture.getFriction()).toBeCloseTo(0.3);
    expect(fixture.getRestitution()).toBeCloseTo(0.8);
    const shape = fixture.getShape() as planck.CircleShape;
    expect(shape.getRadius()).toBeCloseTo(1.5);
  });

  it("round-trips a static box body", () => {
    const body = game.world.createBody({
      type: "static",
      position: planck.Vec2(-2, 0),
    });
    body.createFixture({ shape: planck.Box(5, 0.5), density: 0, friction: 1 });
    body.setUserData({ fill: "gray", label: "ground" });

    const data = serializeScene(game);
    const game2 = createTestGame();
    deserializeScene(game2, data);

    let restored: planck.Body | null = null;
    forEachBody(game2.world, (b) => (restored = b));
    expect(restored!.getType()).toBe("static");
    expect(restored!.getPosition().x).toBeCloseTo(-2);
  });

  it("round-trips a weld joint", () => {
    const a = game.world.createBody({ type: "dynamic", position: planck.Vec2(0, 0) });
    a.createFixture({ shape: planck.Circle(0.5), density: 1 });
    const b = game.world.createBody({ type: "dynamic", position: planck.Vec2(1, 0) });
    b.createFixture({ shape: planck.Circle(0.5), density: 1 });
    createWeldJoint(game.world, a, b, planck.Vec2(0.5, 0));

    const data = serializeScene(game);
    expect(data.joints).toHaveLength(1);
    expect(data.joints[0].type).toBe("weld-joint");

    const game2 = createTestGame();
    deserializeScene(game2, data);
    expect(countBodies(game2.world)).toBe(2);
    expect(countJoints(game2.world)).toBe(1);
  });

  it("round-trips a revolute joint with limits", () => {
    const a = game.world.createBody({ type: "dynamic", position: planck.Vec2(0, 0) });
    a.createFixture({ shape: planck.Circle(0.5), density: 1 });
    const b = game.world.createBody({ type: "dynamic", position: planck.Vec2(1, 0) });
    b.createFixture({ shape: planck.Circle(0.5), density: 1 });

    const joint = planck.RevoluteJoint(
      {
        enableLimit: true,
        lowerAngle: -Math.PI / 4,
        upperAngle: Math.PI / 4,
        enableMotor: true,
        motorSpeed: 2,
        maxMotorTorque: 10,
      },
      a,
      b,
      planck.Vec2(0.5, 0),
    );
    game.world.createJoint(joint);

    const data = serializeScene(game);
    expect(data.joints).toHaveLength(1);
    const sj = data.joints[0];
    expect(sj.type).toBe("revolute-joint");
    expect(sj.enableLimit).toBe(true);
    expect(sj.lowerAngle).toBeCloseTo(-Math.PI / 4);
    expect(sj.upperAngle).toBeCloseTo(Math.PI / 4);
    expect(sj.enableMotor).toBe(true);
    expect(sj.motorSpeed).toBe(2);

    const game2 = createTestGame();
    deserializeScene(game2, data);
    expect(countJoints(game2.world)).toBe(1);

    const restored = game2.world.getJointList()!;
    expect(restored.getType()).toBe("revolute-joint");
    const rj = restored as planck.RevoluteJoint;
    expect(rj.isLimitEnabled()).toBe(true);
    expect(rj.getLowerLimit()).toBeCloseTo(-Math.PI / 4);
    expect(rj.getUpperLimit()).toBeCloseTo(Math.PI / 4);
    expect(rj.isMotorEnabled()).toBe(true);
    expect(rj.getMotorSpeed()).toBe(2);
  });

  it("round-trips a distance joint", () => {
    const a = game.world.createBody({ type: "dynamic", position: planck.Vec2(0, 0) });
    a.createFixture({ shape: planck.Circle(0.5), density: 1 });
    const b = game.world.createBody({ type: "dynamic", position: planck.Vec2(3, 0) });
    b.createFixture({ shape: planck.Circle(0.5), density: 1 });

    const joint = planck.DistanceJoint(
      { frequencyHz: 4, dampingRatio: 0.5, length: 3, collideConnected: true },
      a,
      b,
      planck.Vec2(0, 0),
      planck.Vec2(3, 0),
    );
    game.world.createJoint(joint);

    const data = serializeScene(game);
    expect(data.joints[0].type).toBe("distance-joint");
    expect(data.joints[0].length).toBeCloseTo(3);
    expect(data.joints[0].frequencyHz).toBe(4);

    const game2 = createTestGame();
    deserializeScene(game2, data);
    expect(countJoints(game2.world)).toBe(1);

    const restored = game2.world.getJointList() as planck.DistanceJoint;
    expect(restored.getLength()).toBeCloseTo(3);
    expect(restored.getFrequency()).toBe(4);
    expect(restored.getDampingRatio()).toBe(0.5);
  });

  it("round-trips multiple bodies and preserves count", () => {
    for (let i = 0; i < 5; i++) {
      const body = game.world.createBody({ type: "dynamic", position: planck.Vec2(i, 0) });
      body.createFixture({ shape: planck.Circle(0.3), density: 1 });
      body.setUserData({ fill: "blue", label: `body${i}` });
    }

    const data = serializeScene(game);
    expect(data.bodies).toHaveLength(5);

    const game2 = createTestGame();
    deserializeScene(game2, data);
    expect(countBodies(game2.world)).toBe(5);
  });

  it("round-trips polygon fixtures", () => {
    const body = game.world.createBody({ type: "dynamic", position: planck.Vec2(0, 0) });
    body.createFixture({
      shape: planck.Polygon([planck.Vec2(0, 0), planck.Vec2(1, 0), planck.Vec2(0.5, 1)]),
      density: 1,
    });

    const data = serializeScene(game);
    expect(data.bodies[0].fixtures[0].shape).toBe("polygon");
    expect(data.bodies[0].fixtures[0].params).toHaveLength(6); // 3 verts × 2 coords

    const game2 = createTestGame();
    deserializeScene(game2, data);
    expect(countBodies(game2.world)).toBe(1);
  });

  it("round-trips edge fixtures", () => {
    const body = game.world.createBody({ type: "static", position: planck.Vec2(0, 0) });
    body.createFixture({
      shape: planck.Edge(planck.Vec2(-10, 0), planck.Vec2(10, 0)),
    });

    const data = serializeScene(game);
    expect(data.bodies[0].fixtures[0].shape).toBe("edge");

    const game2 = createTestGame();
    deserializeScene(game2, data);
    expect(countBodies(game2.world)).toBe(1);
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
    // Add bodies to game2 that should be removed
    const game2 = createTestGame();
    const old = game2.world.createBody({ type: "dynamic", position: planck.Vec2(99, 99) });
    old.createFixture({ shape: planck.Circle(1), density: 1 });

    const data = serializeScene(game); // empty scene
    deserializeScene(game2, data);
    expect(countBodies(game2.world)).toBe(0);
  });
});
