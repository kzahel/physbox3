import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const DEFAULTS = {
  dt: 1 / 60,
  substeps: 4,
  warmupSteps: 60,
  measureSteps: 240,
  repetitions: 5,
  workers: 0,
};

const sceneIds = ["settle_box", "spill_obstacle", "body_coupling", "spawn_erase_cycle"];

function parseArgs(argv) {
  const options = {
    ...DEFAULTS,
    scenes: [...sceneIds],
    json: false,
    output: null,
  };

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    const [rawKey, rawValue] = arg.split("=", 2);
    const value = rawValue ?? "";
    switch (rawKey) {
      case "--warmup-steps":
        options.warmupSteps = toPositiveInt(value, rawKey);
        break;
      case "--measure-steps":
        options.measureSteps = toPositiveInt(value, rawKey);
        break;
      case "--repetitions":
        options.repetitions = toPositiveInt(value, rawKey);
        break;
      case "--substeps":
        options.substeps = toPositiveInt(value, rawKey);
        break;
      case "--workers":
        options.workers = toNonNegativeInt(value, rawKey);
        break;
      case "--dt":
        options.dt = toPositiveNumber(value, rawKey);
        break;
      case "--scenes":
        options.scenes = value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
        break;
      case "--output":
        options.output = value;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  for (const scene of options.scenes) {
    if (!sceneIds.includes(scene)) {
      throw new Error(`Unknown scene: ${scene}`);
    }
  }

  return options;
}

function toPositiveInt(value, flagName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer`);
  }
  return parsed;
}

function toNonNegativeInt(value, flagName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flagName} must be a non-negative integer`);
  }
  return parsed;
}

function toPositiveNumber(value, flagName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive number`);
  }
  return parsed;
}

function createWorld(B2, workers) {
  const worldDef = B2.b2DefaultWorldDef();
  worldDef.gravity = new B2.b2Vec2(0, -10);
  worldDef.enableSleep = true;
  worldDef.enableContinuous = true;
  worldDef.workerCount = workers;
  return new B2.World(worldDef);
}

function createParticleSystem(B2, world, maxParticles = 4000) {
  const def = new B2.ParticleSystemDef();
  def.radius = 0.09;
  def.density = 1.0;
  def.gravityScale = 1.0;
  def.initialCapacity = 1024;
  def.maxParticles = maxParticles;
  const system = B2.createParticleSystem(world, def);
  if (!system) {
    throw new Error("Failed to create particle system");
  }
  return system;
}

function createStaticBox(B2, world, x, y, halfW, halfH) {
  const bodyDef = B2.b2DefaultBodyDef();
  bodyDef.type = B2.b2BodyType.b2_staticBody;
  bodyDef.position = new B2.b2Vec2(x, y);
  const body = world.CreateBody(bodyDef);
  const shapeDef = B2.b2DefaultShapeDef();
  body.CreatePolygonShape(shapeDef, B2.b2MakeBox(halfW, halfH));
  return body;
}

function createDynamicBox(B2, world, x, y, halfW, halfH, density = 0.18) {
  const bodyDef = B2.b2DefaultBodyDef();
  bodyDef.type = B2.b2BodyType.b2_dynamicBody;
  bodyDef.position = new B2.b2Vec2(x, y);
  bodyDef.motionLocks.angularZ = true;
  const body = world.CreateBody(bodyDef);
  const shapeDef = B2.b2DefaultShapeDef();
  shapeDef.density = density;
  body.CreatePolygonShape(shapeDef, B2.b2MakeBox(halfW, halfH));
  return body;
}

function spawnCircle(B2, system, x, y, radius, spacing = 0.16) {
  return system.SpawnParticlesInCircle(new B2.b2Vec2(x, y), radius, spacing, new B2.b2Vec2(0, 0));
}

function destroyCircle(B2, system, x, y, radius) {
  return system.DestroyParticlesInCircle(new B2.b2Vec2(x, y), radius);
}

function runSteps(world, system, stepCount, dt, substeps) {
  const startedAt = performance.now();
  for (let i = 0; i < stepCount; i++) {
    system.StepWithWorld(dt, substeps);
  }
  const elapsedMs = performance.now() - startedAt;
  return {
    elapsedMs,
    wallMsPerUnit: elapsedMs / stepCount,
    unitCount: stepCount,
    unitLabel: "step",
    profile: world.GetProfile(),
    counters: world.GetCounters(),
    awakeBodyCount: world.GetAwakeBodyCount(),
  };
}

function sampleParticles(system) {
  const count = system.GetParticleCount();
  const buffer = system.GetPositionBuffer();
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let sumX = 0;
  let sumY = 0;
  let finite = true;

  for (let i = 0; i < buffer.length; i += 2) {
    const x = buffer[i];
    const y = buffer[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      finite = false;
      continue;
    }
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    sumX += x;
    sumY += y;
  }

  return {
    count,
    finite,
    bounds:
      count > 0
        ? {
            minX,
            maxX,
            minY,
            maxY,
          }
        : null,
    centroid:
      count > 0
        ? {
            x: sumX / count,
            y: sumY / count,
          }
        : null,
    bufferBytes: buffer.byteLength,
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function makeSceneFactories(B2) {
  return {
    settle_box(options) {
      const world = createWorld(B2, options.workers);
      createStaticBox(B2, world, 0, -1, 4.5, 1);
      createStaticBox(B2, world, -4.5, 2.5, 1, 4.5);
      createStaticBox(B2, world, 4.5, 2.5, 1, 4.5);
      const system = createParticleSystem(B2, world, 2000);
      const created = spawnCircle(B2, system, 0, 3.9, 1.35, 0.14);

      return {
        label: "Settle box",
        world,
        system,
        created,
        warmup() {
          runSteps(world, system, options.warmupSteps, options.dt, options.substeps);
        },
        measure() {
          const timing = runSteps(world, system, options.measureSteps, options.dt, options.substeps);
          return {
            ...timing,
            extra: {
              created,
            },
          };
        },
      };
    },

    spill_obstacle(options) {
      const world = createWorld(B2, options.workers);
      createStaticBox(B2, world, 0, -1, 5, 1);
      createStaticBox(B2, world, -5, 2.5, 1, 4.5);
      createStaticBox(B2, world, 5, 2.5, 1, 4.5);
      createStaticBox(B2, world, 0, 1.0, 0.5, 1.25);
      const system = createParticleSystem(B2, world, 2400);
      const created = spawnCircle(B2, system, 0, 4.0, 1.45, 0.14);

      return {
        label: "Spill obstacle",
        world,
        system,
        created,
        warmup() {
          runSteps(world, system, options.warmupSteps, options.dt, options.substeps);
        },
        measure() {
          const timing = runSteps(world, system, options.measureSteps, options.dt, options.substeps);
          return {
            ...timing,
            extra: {
              created,
            },
          };
        },
      };
    },

    body_coupling(options) {
      const world = createWorld(B2, options.workers);
      createStaticBox(B2, world, 0, -1, 4.5, 1);
      createStaticBox(B2, world, -4.5, 2.5, 1, 4.5);
      createStaticBox(B2, world, 4.5, 2.5, 1, 4.5);
      const body = createDynamicBox(B2, world, 0.8, 0.25, 0.28, 0.28, 0.12);
      const startX = body.GetPosition().x;
      const system = createParticleSystem(B2, world, 1800);
      const created = spawnCircle(B2, system, -1.45, 1.05, 1.0, 0.14);

      return {
        label: "Body coupling",
        world,
        system,
        created,
        warmup() {
          runSteps(world, system, options.warmupSteps, options.dt, options.substeps);
        },
        measure() {
          const timing = runSteps(world, system, options.measureSteps, options.dt, options.substeps);
          return {
            ...timing,
            extra: {
              created,
              bodyDisplacementX: body.GetPosition().x - startX,
            },
          };
        },
      };
    },

    spawn_erase_cycle(options) {
      const world = createWorld(B2, options.workers);
      createStaticBox(B2, world, 0, -1, 4.5, 1);
      createStaticBox(B2, world, -4.5, 2.5, 1, 4.5);
      createStaticBox(B2, world, 4.5, 2.5, 1, 4.5);
      const system = createParticleSystem(B2, world, 900);

      const runCycles = (cycleCount) => {
        let spawned = 0;
        let removed = 0;
        const startedAt = performance.now();
        for (let cycle = 0; cycle < cycleCount; cycle++) {
          system.SetMaxParticles(cycle % 2 === 0 ? 900 : 720);
          spawned += spawnCircle(B2, system, cycle % 2 === 0 ? -1.3 : 1.3, 2.9, 0.88, 0.14);
          runSteps(world, system, 30, options.dt, options.substeps);
          removed += destroyCircle(B2, system, cycle % 2 === 0 ? -0.9 : 0.9, 1.0, 0.72);
          runSteps(world, system, 20, options.dt, options.substeps);
        }
        const elapsedMs = performance.now() - startedAt;
        return {
          elapsedMs,
          wallMsPerUnit: elapsedMs / cycleCount,
          unitCount: cycleCount,
          unitLabel: "cycle",
          profile: world.GetProfile(),
          counters: world.GetCounters(),
          awakeBodyCount: world.GetAwakeBodyCount(),
          extra: {
            spawned,
            removed,
            finalCount: system.GetParticleCount(),
          },
        };
      };

      return {
        label: "Spawn/erase cycle",
        world,
        system,
        warmup() {
          runCycles(2);
        },
        measure() {
          return runCycles(Math.max(3, Math.round(options.measureSteps / 60)));
        },
      };
    },
  };
}

function finalizeResult(sceneId, label, timing, particleSample) {
  return {
    sceneId,
    label,
    unitLabel: timing.unitLabel,
    unitCount: timing.unitCount,
    wallMs: timing.elapsedMs,
    wallMsPerUnit: timing.wallMsPerUnit,
    particleCount: particleSample.count,
    particleFinite: particleSample.finite,
    particleBounds: particleSample.bounds,
    particleCentroid: particleSample.centroid,
    particleBufferBytes: particleSample.bufferBytes,
    profile: {
      step: timing.profile.step,
      collide: timing.profile.collide,
      solve: timing.profile.solve,
      bullets: timing.profile.bullets,
      sensors: timing.profile.sensors,
    },
    counters: {
      bodies: timing.counters.bodyCount,
      shapes: timing.counters.shapeCount,
      contacts: timing.counters.contactCount,
      joints: timing.counters.jointCount,
      islands: timing.counters.islandCount,
      bytes: timing.counters.byteCount,
      tasks: timing.counters.taskCount,
      awakeBodies: timing.awakeBodyCount,
    },
    extra: timing.extra ?? {},
  };
}

function summarizeSceneRuns(sceneId, label, runs) {
  const msPerUnitValues = runs.map((run) => run.wallMsPerUnit);
  const particleCounts = runs.map((run) => run.particleCount);
  return {
    sceneId,
    label,
    unitLabel: runs[0].unitLabel,
    repetitions: runs.length,
    medianWallMsPerUnit: median(msPerUnitValues),
    minWallMsPerUnit: Math.min(...msPerUnitValues),
    maxWallMsPerUnit: Math.max(...msPerUnitValues),
    medianParticleCount: median(particleCounts),
    lastRun: runs[runs.length - 1],
  };
}

function printSummary(metadata, summaries) {
  console.log(`Particle benchmark (${metadata.runtimeLabel})`);
  console.log(
    `dt=${metadata.dt.toFixed(5)} substeps=${metadata.substeps} warmupSteps=${metadata.warmupSteps} measureSteps=${metadata.measureSteps} repetitions=${metadata.repetitions}`,
  );
  console.log("");

  const header = [
    padRight("scene", 20),
    padLeft("median", 10),
    padLeft("min", 10),
    padLeft("max", 10),
    padLeft("unit", 8),
    padLeft("particles", 10),
    padLeft("p.step", 10),
    padLeft("p.solve", 10),
    padLeft("contacts", 10),
  ].join(" ");
  console.log(header);
  console.log("-".repeat(header.length));

  for (const summary of summaries) {
    const lastRun = summary.lastRun;
    console.log(
      [
        padRight(summary.sceneId, 20),
        padLeft(summary.medianWallMsPerUnit.toFixed(3), 10),
        padLeft(summary.minWallMsPerUnit.toFixed(3), 10),
        padLeft(summary.maxWallMsPerUnit.toFixed(3), 10),
        padLeft(summary.unitLabel, 8),
        padLeft(String(Math.round(summary.medianParticleCount)), 10),
        padLeft(lastRun.profile.step.toFixed(3), 10),
        padLeft(lastRun.profile.solve.toFixed(3), 10),
        padLeft(String(lastRun.counters.contacts), 10),
      ].join(" "),
    );
  }

  console.log("");
  console.log("Last-run extras:");
  for (const summary of summaries) {
    const extras = formatExtras(summary.lastRun.extra);
    const centroid = summary.lastRun.particleCentroid;
    const centroidLabel = centroid ? `centroid=(${centroid.x.toFixed(2)}, ${centroid.y.toFixed(2)})` : "centroid=n/a";
    console.log(`- ${summary.sceneId}: ${extras}; ${centroidLabel}`);
  }
}

function formatExtras(extra) {
  const entries = Object.entries(extra);
  if (entries.length === 0) return "no extra metrics";
  return entries
    .map(([key, value]) => `${key}=${typeof value === "number" ? value.toFixed(3).replace(/\.000$/, "") : value}`)
    .join(", ");
}

function padLeft(value, width) {
  return String(value).padStart(width, " ");
}

function padRight(value, width) {
  return String(value).padEnd(width, " ");
}

function printHelp() {
  console.log("Usage: node scripts/benchmark-particles.mjs [options]");
  console.log("");
  console.log("Options:");
  console.log("  --scenes=settle_box,spill_obstacle,body_coupling,spawn_erase_cycle");
  console.log("  --warmup-steps=60");
  console.log("  --measure-steps=240");
  console.log("  --repetitions=5");
  console.log("  --substeps=4");
  console.log("  --dt=0.0166666667");
  console.log("  --workers=0");
  console.log("  --json");
  console.log("  --output=tmp/particles-benchmark.json");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const { default: Box2DFactory } = await import(
    new URL("../reference/box2d3-wasm/box2d3-wasm/build/dist/es/deluxe/Box2D.deluxe.mjs", import.meta.url)
  );
  const B2 = await Box2DFactory();
  if (typeof B2.createParticleSystem !== "function" || typeof B2.ParticleSystemDef !== "function") {
    throw new Error("Local deluxe box2d3-wasm build does not expose the particle benchmark API");
  }

  const factories = makeSceneFactories(B2);
  const allRuns = [];
  const summaries = [];

  for (const sceneId of options.scenes) {
    const runs = [];
    for (let repetition = 0; repetition < options.repetitions; repetition++) {
      const scene = factories[sceneId](options);
      try {
        scene.warmup();
        const timing = scene.measure();
        const particleSample = sampleParticles(scene.system);
        runs.push(finalizeResult(sceneId, scene.label, timing, particleSample));
      } finally {
        B2.destroyParticleSystem(scene.system);
        scene.world.Destroy();
      }
    }
    allRuns.push(...runs);
    summaries.push(summarizeSceneRuns(sceneId, runs[0].label, runs));
  }

  const report = {
    metadata: {
      runtimeLabel: `local deluxe WASM, workers=${options.workers}`,
      dt: options.dt,
      substeps: options.substeps,
      warmupSteps: options.warmupSteps,
      measureSteps: options.measureSteps,
      repetitions: options.repetitions,
      generatedAt: new Date().toISOString(),
    },
    summaries,
    runs: allRuns,
  };

  printSummary(report.metadata, summaries);

  if (options.output) {
    const outputPath = path.resolve(process.cwd(), options.output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`\nWrote JSON report to ${outputPath}`);
  }

  if (options.json) {
    console.log(`\n${JSON.stringify(report, null, 2)}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
