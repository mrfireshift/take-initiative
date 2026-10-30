// Which number a die shows and how to make it show the value drawn (docs/PIANO_DADI_ONLINE.md, lot D-2). Pure math.
// The dice meshes come from Owlbear Rodeo Dice with a locator per number (src/diceAssets.json): the number read is
// the locator pointing most upward. The roller's value never comes from the physics: once the dice rest, the mesh is
// turned inside its own collider by a symmetry of the solid that brings the drawn number where the physics left
// the top one. The collider does not change, so the roll the physics computed stays the same.

function rotationMatrixFromEuler([x, y, z]) {
  // three.js "XYZ" order: R = Rx · Ry · Rz.
  const [a, b] = [Math.cos(x), Math.sin(x)];
  const [c, d] = [Math.cos(y), Math.sin(y)];
  const [e, f] = [Math.cos(z), Math.sin(z)];
  return [
    [c * e, -c * f, d],
    [a * f + b * e * d, a * e - b * f * d, -b * c],
    [b * f - a * e * d, b * e + a * f * d, a * c],
  ];
}

const apply = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (v) => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

const directionCache = new WeakMap();

// The centre of the die: the centroid of its collider's corners. The physics turns the die around it (the scene
// moves the collider and the mesh so that it is the body's origin).
export function dieCentroid(entry) {
  const points = entry.collider || [];
  const sum = points.reduce((total, p) => [total[0] + p[0], total[1] + p[1], total[2] + p[2]], [0, 0, 0]);
  return points.length ? sum.map((value) => value / points.length) : [0, 0, 0];
}

// value → unit direction of its locator from the die's centre, in the collider's frame. A locator sits in the mesh's
// frame, which the asset turns by meshRotation and scales like the collider.
export function locatorDirections(entry) {
  if (directionCache.has(entry)) return directionCache.get(entry);
  const rotation = rotationMatrixFromEuler(entry.meshRotation || [0, 0, 0]);
  const scale = Number(entry.scale) || 1;
  const centre = dieCentroid(entry);
  const directions = new Map(entry.locators.map((locator) => {
    const p = apply(rotation, locator.position);
    return [locator.value, normalize([p[0] * scale - centre[0], p[1] * scale - centre[1], p[2] * scale - centre[2]])];
  }));
  directionCache.set(entry, directions);
  return directions;
}

export function rotateVector(q, v) {
  const [x, y, z] = v;
  const ix = q.w * x + q.y * z - q.z * y;
  const iy = q.w * y + q.z * x - q.x * z;
  const iz = q.w * z + q.x * y - q.y * x;
  const iw = -q.x * x - q.y * y - q.z * z;
  return [
    ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  ];
}

// The number on top of a die resting with orientation `q`.
export function upFaceValue(entry, q) {
  let best = null;
  let bestY = -Infinity;
  for (const [value, direction] of locatorDirections(entry)) {
    const y = rotateVector(q, direction)[1];
    if (y > bestY) {
      bestY = y;
      best = value;
    }
  }
  return best;
}

function frame(first, second) {
  const a = normalize(first);
  const b = normalize([second[0] - dot(second, a) * a[0], second[1] - dot(second, a) * a[1], second[2] - dot(second, a) * a[2]]);
  return [a, b, cross(a, b)];
}

function quaternionFromMatrix(m) {
  const trace = m[0][0] + m[1][1] + m[2][2];
  let q;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    q = { w: 0.25 / s, x: (m[2][1] - m[1][2]) * s, y: (m[0][2] - m[2][0]) * s, z: (m[1][0] - m[0][1]) * s };
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = 2 * Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]);
    q = { w: (m[2][1] - m[1][2]) / s, x: 0.25 * s, y: (m[0][1] + m[1][0]) / s, z: (m[0][2] + m[2][0]) / s };
  } else if (m[1][1] > m[2][2]) {
    const s = 2 * Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]);
    q = { w: (m[0][2] - m[2][0]) / s, x: (m[0][1] + m[1][0]) / s, y: 0.25 * s, z: (m[1][2] + m[2][1]) / s };
  } else {
    const s = 2 * Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]);
    q = { w: (m[1][0] - m[0][1]) / s, x: (m[0][2] + m[2][0]) / s, y: (m[1][2] + m[2][1]) / s, z: 0.25 * s };
  }
  const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

const groupCache = new WeakMap();

// Every rotation about the centre that maps the collider's corners onto themselves: the die's symmetries (12 for the
// d4, 24 for the d6 and d8, 10 for the d10, 60 for the d12 and d20).
export function dieSymmetries(entry) {
  if (groupCache.has(entry)) return groupCache.get(entry);
  const centre = dieCentroid(entry);
  const corners = (entry.collider || []).map((p) => [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]]);
  const size = Math.max(...corners.map((p) => Math.hypot(p[0], p[1], p[2])));
  const tolerance = size * 2e-3;
  const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < tolerance;
  const length = (p) => Math.hypot(p[0], p[1], p[2]);
  const first = corners[0];
  const second = corners.find((p) => Math.abs(dot(normalize(p), normalize(first))) < 0.95);
  const rotations = [];
  for (const a of corners) {
    if (Math.abs(length(a) - length(first)) > tolerance) continue;
    for (const b of corners) {
      if (b === a || Math.abs(length(b) - length(second)) > tolerance) continue;
      if (Math.abs(dot(a, b) - dot(first, second)) > tolerance * size) continue;
      const source = frame(first, second);
      const target = frame(a, b);
      const matrix = [0, 1, 2].map((row) => [0, 1, 2].map((column) => (
        target[0][row] * source[0][column] + target[1][row] * source[1][column] + target[2][row] * source[2][column]
      )));
      if (corners.every((p) => corners.some((q) => close(apply(matrix, p), q)))) rotations.push(quaternionFromMatrix(matrix));
    }
  }
  groupCache.set(entry, rotations);
  return rotations;
}

const symmetryCache = new WeakMap();

// The symmetry of the die that takes the number `fromValue` where `toValue` was (a quaternion about the die's
// centre), or null when the values are not on this die.
export function faceSymmetry(entry, fromValue, toValue) {
  const directions = locatorDirections(entry);
  const from = directions.get(fromValue);
  const to = directions.get(toValue);
  if (!from || !to) return null;
  let cache = symmetryCache.get(entry);
  if (!cache) symmetryCache.set(entry, cache = new Map());
  const key = `${fromValue}>${toValue}`;
  if (cache.has(key)) return cache.get(key);
  let best = null;
  let bestDot = -Infinity;
  for (const q of dieSymmetries(entry)) {
    const d = dot(rotateVector(q, from), to);
    if (d > bestDot) {
      bestDot = d;
      best = q;
    }
  }
  // The locators are rounded to 1/100 of the mesh: the right symmetry lines them up almost exactly.
  const found = bestDot > 0.97 ? best : null;
  cache.set(key, found);
  return found;
}

export function multiplyQuaternions(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

// The asset of a physical die (diceCore.physicalDiceOf) and the locator value it must show: a d10 shows 0 for 10,
// the tens die of a d100 uses its own mesh.
export function physicalDieAsset(physical) {
  if (physical?.percentile === "tens") return { key: "d100", value: physical.face };
  if (physical?.percentile === "units") return { key: "d10", value: physical.face };
  if (physical?.sides === 10) return { key: "d10", value: physical.face === 10 ? 0 : physical.face };
  return { key: `d${physical?.sides}`, value: physical?.face };
}
