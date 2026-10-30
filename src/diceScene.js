// The 3D dice tray (docs/PIANO_DADI_ONLINE.md, lot D-2): three.js draws the dice and the tray of Owlbear Rodeo Dice
// (assets in public/dice, GPLv3), cannon-es rolls them. The roll is simulated in advance from the roller's throw;
// then each die is turned inside its collider by one of its symmetries so that the value the roller drew is the one
// on top (diceFaceCore.js), and the recorded roll is played back. Every client gets the same values even if its
// physics drifts a little from the roller's.
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Group,
  LinearSRGBColorSpace,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { ConvexHull } from "three/examples/jsm/math/ConvexHull.js";
import {
  Body,
  ContactMaterial,
  ConvexPolyhedron,
  Material,
  Plane,
  Vec3,
  World,
} from "cannon-es";
import assets from "./diceAssets.json";
import { physicalDiceOf } from "./diceCore.js";
import { dieCentroid, faceSymmetry, multiplyQuaternions, physicalDieAsset, upFaceValue } from "./diceFaceCore.js";

export const DICE_STYLES = Object.freeze(Object.entries(assets.styles)
  .filter(([key]) => key !== "tray")
  .map(([key, style]) => ({ key, label: style.label })));
export { DEFAULT_DICE_STYLE } from "./diceStyles.js";
import { DEFAULT_DICE_STYLE } from "./diceStyles.js";

// The tray of Owlbear Rodeo Dice: walls at ±0.46 and ±0.96, a roof at 1.5; gravity doubled for the small dice.
const TRAY = Object.freeze({ halfWidth: 0.46, halfDepth: 0.96, roof: 1.5 });
const STEP = 1 / 240;
const STEPS_PER_FRAME = 4;
const MAX_SECONDS = 5;
const REST_SPEED = 0.005;

const gltfLoader = new GLTFLoader();
const textureLoader = new TextureLoader();
const meshCache = new Map();
const materialCache = new Map();

function assetUrl(base, file) {
  return `${String(base || "/").replace(/\/?$/, "/")}${file}`;
}

function loadGltf(url) {
  if (!meshCache.has(url)) meshCache.set(url, gltfLoader.loadAsync(url));
  return meshCache.get(url);
}

function loadTexture(url, colorSpace) {
  return textureLoader.loadAsync(url).then((texture) => {
    texture.flipY = false;
    texture.colorSpace = colorSpace;
    return texture;
  });
}

// The material of a style, as Owlbear Rodeo Dice sets it up (src/materials/*): albedo in sRGB, the packed
// occlusion/roughness/metalness and the normal map linear; glass uses a transmission mask instead.
function loadMaterial(base, key) {
  const cacheKey = `${base}|${key}`;
  if (materialCache.has(cacheKey)) return materialCache.get(cacheKey);
  const style = assets.styles[key] || assets.styles[DEFAULT_DICE_STYLE];
  const promise = Promise.all(Object.entries(style.maps).map(([map, file]) => (
    loadTexture(assetUrl(base, file), map === "albedo" ? SRGBColorSpace : LinearSRGBColorSpace).then((texture) => [map, texture])
  ))).then((entries) => {
    const maps = Object.fromEntries(entries);
    const params = { ...style.params };
    for (const colorKey of ["sheenColor", "attenuationColor"]) if (params[colorKey]) params[colorKey] = new Color(params[colorKey]);
    const material = style.material === "physical" ? new MeshPhysicalMaterial(params) : new MeshStandardMaterial(params);
    material.map = maps.albedo || null;
    if (maps.orm) {
      material.aoMap = maps.orm;
      material.roughnessMap = maps.orm;
      material.metalnessMap = maps.orm;
    }
    if (maps.normal) material.normalMap = maps.normal;
    if (maps.mask) material.transmissionMap = maps.mask;
    return material;
  });
  materialCache.set(cacheKey, promise);
  return promise;
}

function firstMesh(gltf) {
  let found = null;
  gltf.scene.traverse((object) => { if (!found && object.isMesh) found = object; });
  return found;
}

const shapeCache = new Map();

// The die's collider as a cannon-es convex polyhedron centred on the die's centre (the body's origin).
function dieShape(key) {
  if (shapeCache.has(key)) return shapeCache.get(key);
  const entry = assets.dice[key];
  const centre = dieCentroid(entry);
  const points = entry.collider.map(([x, y, z]) => new Vector3(x - centre[0], y - centre[1], z - centre[2]));
  const hull = new ConvexHull().setFromPoints(points);
  const index = (point) => points.findIndex((candidate) => candidate.distanceToSquared(point) < 1e-12);
  const faces = hull.faces.map((face) => {
    const loop = [];
    let edge = face.edge;
    do {
      loop.push(index(edge.head().point));
      edge = edge.next;
    } while (edge !== face.edge);
    return loop;
  });
  const shape = new ConvexPolyhedron({ vertices: points.map((p) => new Vec3(p.x, p.y, p.z)), faces });
  shapeCache.set(key, shape);
  return shape;
}

// Plays the physics of a throw in advance: the pose of every die at 60 frames a second until all of them rest.
function simulate(dice, throws) {
  const world = new World({ gravity: new Vec3(0, -9.81 * 2, 0), allowSleep: false });
  world.solver.iterations = 12;
  const diceMaterial = new Material("dice");
  const floorMaterial = new Material("floor");
  const wallMaterial = new Material("wall");
  // Rapier averages the two materials' values: the Dice's leather floor, wooden walls and dice give these.
  world.addContactMaterial(new ContactMaterial(diceMaterial, floorMaterial, { friction: 5.05, restitution: 0.25 }));
  world.addContactMaterial(new ContactMaterial(diceMaterial, wallMaterial, { friction: 0.55, restitution: 0.45 }));
  world.addContactMaterial(new ContactMaterial(diceMaterial, diceMaterial, { friction: 0.1, restitution: 0 }));
  const wall = (position, axis, angle, material) => {
    const body = new Body({ mass: 0, material, shape: new Plane() });
    body.position.set(...position);
    body.quaternion.setFromAxisAngle(new Vec3(...axis), angle);
    world.addBody(body);
  };
  wall([0, 0, 0], [1, 0, 0], -Math.PI / 2, floorMaterial);
  wall([0, TRAY.roof, 0], [1, 0, 0], Math.PI / 2, wallMaterial);
  wall([TRAY.halfWidth, 0, 0], [0, 1, 0], -Math.PI / 2, wallMaterial);
  wall([-TRAY.halfWidth, 0, 0], [0, 1, 0], Math.PI / 2, wallMaterial);
  wall([0, 0, TRAY.halfDepth], [0, 1, 0], Math.PI, wallMaterial);
  wall([0, 0, -TRAY.halfDepth], [0, 1, 0], 0, wallMaterial);

  const bodies = dice.map((die, index) => {
    const shape = dieShape(die.key);
    const density = Number(assets.styles[die.style]?.density) || 1;
    const body = new Body({ mass: shape.volume() * density * 1000, material: diceMaterial, shape });
    const t = throws[index];
    body.position.set(t.position.x, t.position.y, t.position.z);
    body.quaternion.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
    body.quaternion.normalize();
    body.velocity.set(t.velocity.x, t.velocity.y, t.velocity.z);
    body.angularVelocity.set(t.angularVelocity.x, t.angularVelocity.y, t.angularVelocity.z);
    world.addBody(body);
    return body;
  });

  const frames = [];
  const record = () => frames.push(bodies.map((body) => ({
    position: [body.position.x, body.position.y, body.position.z],
    quaternion: { x: body.quaternion.x, y: body.quaternion.y, z: body.quaternion.z, w: body.quaternion.w },
  })));
  record();
  const maxFrames = Math.ceil(MAX_SECONDS / (STEP * STEPS_PER_FRAME));
  let restingFrames = 0;
  for (let frame = 0; frame < maxFrames && restingFrames < 15; frame += 1) {
    for (let step = 0; step < STEPS_PER_FRAME; step += 1) world.step(STEP);
    record();
    const resting = bodies.every((body) => body.velocity.length() + body.angularVelocity.length() < REST_SPEED * 20);
    restingFrames = resting ? restingFrames + 1 : 0;
  }
  return frames;
}

// The tray drawn in `canvas`. roll(record, { style }) throws the record's dice and resolves with the values shown.
export async function createDiceTray({ canvas, base = import.meta.env?.BASE_URL || "/", reducedMotion = null } = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));

  const scene = new Scene();
  const camera = new PerspectiveCamera(28, 0.5, 0.1, 20);
  camera.position.set(0, 4.3, 0);
  camera.rotation.set(-Math.PI / 2, 0, 0);

  const light = new DirectionalLight(0xffffff, 1.2);
  light.position.set(0.6, 3, 0.4);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, { left: -1.2, right: 1.2, top: 1.2, bottom: -1.2, near: 0.5, far: 5 });
  light.shadow.radius = 4;
  scene.add(light);

  const pmrem = new PMREMGenerator(renderer);
  const environment = new HDRLoader().loadAsync(assetUrl(base, assets.environment)).then((texture) => {
    scene.environment = pmrem.fromEquirectangular(texture).texture;
    texture.dispose();
  });

  const tray = Promise.all([loadGltf(assetUrl(base, assets.tray.mesh)), loadMaterial(base, assets.tray.material)])
    .then(([gltf, material]) => {
      const mesh = firstMesh(gltf).clone();
      mesh.material = material;
      mesh.receiveShadow = true;
      mesh.position.set(0, assets.tray.offsetY, 0);
      const group = new Group();
      group.scale.setScalar(assets.tray.scale);
      group.add(mesh);
      scene.add(group);
    });

  const diceGroup = new Group();
  scene.add(diceGroup);
  let frameRequest = 0;
  let rollRevision = 0;

  const render = () => renderer.render(scene, camera);
  // The camera looks straight down from just high enough to frame the whole tray, whatever the canvas proportions.
  const resize = (width, height) => {
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    camera.position.y = Math.max((TRAY.halfDepth + 0.09) / tan, (TRAY.halfWidth + 0.09) / (tan * camera.aspect));
    camera.updateProjectionMatrix();
    render();
  };
  const prefersReducedMotion = () => (reducedMotion ?? globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) === true;

  async function dieObject(key, style) {
    const entry = assets.dice[key];
    const [gltf, material] = await Promise.all([loadGltf(assetUrl(base, entry.mesh)), loadMaterial(base, style)]);
    const mesh = firstMesh(gltf).clone();
    mesh.material = material;
    mesh.castShadow = true;
    mesh.rotation.set(...entry.meshRotation);
    // The asset's frame: scaled like the collider, then moved so the die's centre is the body's origin.
    const assetFrame = new Group();
    assetFrame.scale.setScalar(entry.scale);
    assetFrame.add(mesh);
    const centre = dieCentroid(entry);
    const container = new Group();
    container.position.set(-centre[0], -centre[1], -centre[2]);
    container.add(assetFrame);
    const pivot = new Group();
    pivot.add(container);
    const body = new Group();
    body.add(pivot);
    return { body, pivot };
  }

  async function roll(record, { style = DEFAULT_DICE_STYLE } = {}) {
    const revision = ++rollRevision;
    cancelAnimationFrame(frameRequest);
    const physical = physicalDiceOf(record);
    const dice = physical.map((die) => ({ ...physicalDieAsset(die), style }));
    const throws = Array.isArray(record.throws) && record.throws.length === dice.length ? record.throws : null;
    if (!throws) throw new Error("Lancio senza parametri per ogni dado.");
    const [objects] = await Promise.all([
      Promise.all(dice.map((die) => dieObject(die.key, style))),
      environment,
      tray,
    ]);
    if (revision !== rollRevision) return null;
    diceGroup.clear();
    for (const object of objects) diceGroup.add(object.body);

    const frames = simulate(dice, throws);
    const last = frames.at(-1);
    // Each die shows the value drawn: the symmetry that takes it where the physics left the top number.
    const shown = dice.map((die, index) => {
      const entry = assets.dice[die.key];
      const landed = upFaceValue(entry, last[index].quaternion);
      const symmetry = faceSymmetry(entry, die.value, landed) || { x: 0, y: 0, z: 0, w: 1 };
      objects[index].pivot.quaternion.set(symmetry.x, symmetry.y, symmetry.z, symmetry.w);
      return upFaceValue(entry, multiplyQuaternions(last[index].quaternion, symmetry));
    });

    const pose = (frame) => {
      frame.forEach((state, index) => {
        objects[index].body.position.set(...state.position);
        objects[index].body.quaternion.set(state.quaternion.x, state.quaternion.y, state.quaternion.z, state.quaternion.w);
      });
      render();
    };
    if (prefersReducedMotion()) {
      pose(last);
      return shown;
    }
    await new Promise((resolve) => {
      const start = performance.now();
      const tick = (now) => {
        if (revision !== rollRevision) return resolve();
        const index = Math.min(frames.length - 1, Math.floor(((now - start) / 1000) * 60));
        pose(frames[index]);
        if (index >= frames.length - 1) return resolve();
        frameRequest = requestAnimationFrame(tick);
      };
      frameRequest = requestAnimationFrame(tick);
    });
    return shown;
  }

  function dispose() {
    rollRevision += 1;
    cancelAnimationFrame(frameRequest);
    pmrem.dispose();
    renderer.dispose();
  }

  await Promise.all([environment, tray]);
  render();
  return { roll, resize, render, dispose };
}
