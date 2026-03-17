import { beforeAll, describe, expect, it } from "vitest";
import { b2, initBox2D } from "./Box2D";
import {
  areWelded,
  bodyRadius,
  clamp,
  createWeldJoint,
  distance,
  getWeldJoints,
  markDestroyed,
  queryBodiesInRadius,
} from "./Physics";
import { PhysWorld } from "./PhysWorld";

beforeAll(async () => {
  await initBox2D();
});

describe("clamp", () => {
  it("returns value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps to min", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("clamps to max", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("handles equal min and max", () => {
    expect(clamp(5, 3, 3)).toBe(3);
  });

  it("returns boundary values exactly", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

describe("distance", () => {
  it("returns 0 for same point", () => {
    expect(distance({ x: 3, y: 4 }, { x: 3, y: 4 })).toBe(0);
  });

  it("computes horizontal distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(3);
  });

  it("computes diagonal distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("is symmetric", () => {
    const a = { x: 1, y: 2 };
    const b = { x: 4, y: 6 };
    expect(distance(a, b)).toBe(distance(b, a));
  });

  it("handles negative coordinates", () => {
    expect(distance({ x: -1, y: -1 }, { x: 2, y: 3 })).toBe(5);
  });
});

describe("markDestroyed", () => {
  it("sets destroyed flag on body userData", () => {
    const pw = new PhysWorld(0, -10);
    const B2 = b2();
    const bodyDef = B2.b2DefaultBodyDef();
    bodyDef.type = B2.b2BodyType.b2_dynamicBody;
    bodyDef.position = new B2.b2Vec2(0, 0);
    const body = pw.createBody(bodyDef);
    pw.setUserData(body, { label: "test" });
    markDestroyed(pw, body);
    expect(pw.getUserData(body)?.destroyed).toBe(true);
  });

  it("creates userData if none exists", () => {
    const pw = new PhysWorld(0, -10);
    const B2 = b2();
    const bodyDef = B2.b2DefaultBodyDef();
    bodyDef.type = B2.b2BodyType.b2_dynamicBody;
    bodyDef.position = new B2.b2Vec2(0, 0);
    const body = pw.createBody(bodyDef);
    markDestroyed(pw, body);
    expect(pw.getUserData(body)?.destroyed).toBe(true);
  });
});

describe("weld joint helpers", () => {
  function twoBodyWorld() {
    const pw = new PhysWorld(0, -10);
    const B2 = b2();

    const defA = B2.b2DefaultBodyDef();
    defA.type = B2.b2BodyType.b2_dynamicBody;
    defA.position = new B2.b2Vec2(0, 0);
    const a = pw.createBody(defA);
    const shapeDefA = B2.b2DefaultShapeDef();
    shapeDefA.density = 1;
    const circA = new B2.b2Circle();
    circA.center = new B2.b2Vec2(0, 0);
    circA.radius = 0.5;
    a.CreateCircleShape(shapeDefA, circA);

    const defB = B2.b2DefaultBodyDef();
    defB.type = B2.b2BodyType.b2_dynamicBody;
    defB.position = new B2.b2Vec2(1, 0);
    const b = pw.createBody(defB);
    const shapeDefB = B2.b2DefaultShapeDef();
    shapeDefB.density = 1;
    const circB = new B2.b2Circle();
    circB.center = new B2.b2Vec2(0, 0);
    circB.radius = 0.5;
    b.CreateCircleShape(shapeDefB, circB);

    return { pw, a, b };
  }

  it("areWelded returns false when no joint exists", () => {
    const { pw, a, b } = twoBodyWorld();
    expect(areWelded(pw, a, b)).toBe(false);
  });

  it("areWelded returns true after creating weld joint", () => {
    const { pw, a, b } = twoBodyWorld();
    createWeldJoint(pw, a, b, { x: 0.5, y: 0 });
    expect(areWelded(pw, a, b)).toBe(true);
    expect(areWelded(pw, b, a)).toBe(true);
  });

  it("getWeldJoints returns empty array when no welds", () => {
    const { pw, a } = twoBodyWorld();
    expect(getWeldJoints(pw, a)).toHaveLength(0);
  });

  it("getWeldJoints returns weld joints", () => {
    const { pw, a, b } = twoBodyWorld();
    createWeldJoint(pw, a, b, { x: 0.5, y: 0 });
    expect(getWeldJoints(pw, a)).toHaveLength(1);
    expect(getWeldJoints(pw, b)).toHaveLength(1);
  });
});

describe("bodyRadius", () => {
  it("returns circle radius", () => {
    const pw = new PhysWorld(0, -10);
    const B2 = b2();
    const bodyDef = B2.b2DefaultBodyDef();
    bodyDef.type = B2.b2BodyType.b2_dynamicBody;
    const body = pw.createBody(bodyDef);
    const shapeDef = B2.b2DefaultShapeDef();
    shapeDef.density = 1;
    const circ = new B2.b2Circle();
    circ.center = new B2.b2Vec2(0, 0);
    circ.radius = 2.5;
    body.CreateCircleShape(shapeDef, circ);
    expect(bodyRadius(body)).toBe(2.5);
  });

  it("returns max radius across multiple shapes", () => {
    const pw = new PhysWorld(0, -10);
    const B2 = b2();
    const bodyDef = B2.b2DefaultBodyDef();
    bodyDef.type = B2.b2BodyType.b2_dynamicBody;
    const body = pw.createBody(bodyDef);
    const shapeDef = B2.b2DefaultShapeDef();
    shapeDef.density = 1;

    const c1 = new B2.b2Circle();
    c1.center = new B2.b2Vec2(0, 0);
    c1.radius = 1;
    body.CreateCircleShape(shapeDef, c1);

    const c2 = new B2.b2Circle();
    c2.center = new B2.b2Vec2(0, 0);
    c2.radius = 3;
    body.CreateCircleShape(shapeDef, c2);

    expect(bodyRadius(body)).toBe(3);
  });

  it("returns 0 for body with no shapes", () => {
    const pw = new PhysWorld(0, -10);
    const B2 = b2();
    const bodyDef = B2.b2DefaultBodyDef();
    bodyDef.type = B2.b2BodyType.b2_dynamicBody;
    const body = pw.createBody(bodyDef);
    expect(bodyRadius(body)).toBe(0);
  });

  it("computes radius for polygon shapes", () => {
    const pw = new PhysWorld(0, -10);
    const B2 = b2();
    const bodyDef = B2.b2DefaultBodyDef();
    bodyDef.type = B2.b2BodyType.b2_dynamicBody;
    const body = pw.createBody(bodyDef);
    const shapeDef = B2.b2DefaultShapeDef();
    shapeDef.density = 1;
    const poly = B2.b2MakeBox(2, 1);
    body.CreatePolygonShape(shapeDef, poly);
    const r = bodyRadius(body);
    // Box(2,1) → half-extents 2×1, diagonal ≈ √(4²+2²)/2 = √20/2 ≈ 2.236
    expect(r).toBeGreaterThan(2);
    expect(r).toBeLessThan(3);
  });
});

describe("queryBodiesInRadius", () => {
  it("finds bodies within radius", () => {
    const pw = new PhysWorld(0, -10);
    const B2 = b2();

    const def1 = B2.b2DefaultBodyDef();
    def1.type = B2.b2BodyType.b2_dynamicBody;
    def1.position = new B2.b2Vec2(1, 0);
    const body = pw.createBody(def1);
    const sd1 = B2.b2DefaultShapeDef();
    sd1.density = 1;
    const c1 = new B2.b2Circle();
    c1.center = new B2.b2Vec2(0, 0);
    c1.radius = 0.5;
    body.CreateCircleShape(sd1, c1);

    const def2 = B2.b2DefaultBodyDef();
    def2.type = B2.b2BodyType.b2_dynamicBody;
    def2.position = new B2.b2Vec2(100, 0);
    const far = pw.createBody(def2);
    const sd2 = B2.b2DefaultShapeDef();
    sd2.density = 1;
    const c2 = new B2.b2Circle();
    c2.center = new B2.b2Vec2(0, 0);
    c2.radius = 0.5;
    far.CreateCircleShape(sd2, c2);

    const found = queryBodiesInRadius(pw, 0, 0, 5);
    expect(found).toContain(body);
    expect(found).not.toContain(far);
  });

  it("respects exclude parameter", () => {
    const pw = new PhysWorld(0, -10);
    const B2 = b2();

    const def1 = B2.b2DefaultBodyDef();
    def1.type = B2.b2BodyType.b2_dynamicBody;
    def1.position = new B2.b2Vec2(0, 0);
    const body = pw.createBody(def1);
    const sd = B2.b2DefaultShapeDef();
    sd.density = 1;
    const c = new B2.b2Circle();
    c.center = new B2.b2Vec2(0, 0);
    c.radius = 0.5;
    body.CreateCircleShape(sd, c);

    const found = queryBodiesInRadius(pw, 0, 0, 5, body);
    expect(found).not.toContain(body);
  });
});
