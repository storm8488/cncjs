import Toolpath from 'gcode-toolpath';

// Typed-array geometry of a G-code toolpath, built with gcode-toolpath the way
// GCodeVisualizer always has (one vertex per linear move, 31 per arc sampled
// like THREE.ArcCurve.getPoints(30), G17/G18/G19 planes), without any three.js
// object: a Float32Array of positions, one of colours, one vertex index per
// line, and the bounding box. 1 000 000 vertices take 24 MB instead of the
// 100+ MB of a THREE.Geometry made of Vector3 and Color objects, and the result
// can cross a worker boundary as transferable buffers.
//
// buildToolpathBuffers(gcode, options) → {
//   positions: Float32Array (x, y, z per vertex), colors: Float32Array (r, g, b per vertex),
//   frames: Uint32Array (first vertex index of each line), lines: string[] (the lines, when options.keepLines),
//   count: number of vertices, bounds: { min: [x, y, z], max: [x, y, z] } or null when empty
// }
// options.colors: { G0: [r, g, b], G1: …, G2: …, G3: … } in 0..1, options.defaultColor: [r, g, b].

const ARC_DIVISIONS = 30;
const TWO_PI = Math.PI * 2;

// THREE.EllipseCurve.getPoint (three 0.103) for a circle without rotation,
// kept bit for bit so the vertices equal the former ArcCurve sampling. That
// includes the constructor's defaults (`|| 1`, `|| 0`, `|| 2π`): a zero radius
// (an arc whose centre equals its start in the plane's x/y, which the radius
// formula below, unchanged from before, gives for G18/G19 arcs) draws a unit
// circle, an end angle of exactly 0 becomes a full turn.
const arcPoint = (aX, aY, aRadius, aStartAngle, aEndAngle, aClockwise, t) => {
  const cx = aX || 0, cy = aY || 0, radius = aRadius || 1;
  const startAngle = aStartAngle || 0, endAngle = aEndAngle || TWO_PI, clockwise = aClockwise || false;
  let deltaAngle = endAngle - startAngle;
  const samePoints = Math.abs(deltaAngle) < Number.EPSILON;
  while (deltaAngle < 0) {
    deltaAngle += TWO_PI;
  }
  while (deltaAngle > TWO_PI) {
    deltaAngle -= TWO_PI;
  }
  if (deltaAngle < Number.EPSILON) {
    deltaAngle = samePoints ? 0 : TWO_PI;
  }
  if (clockwise === true && !samePoints) {
    deltaAngle = (deltaAngle === TWO_PI) ? -TWO_PI : deltaAngle - TWO_PI;
  }
  const angle = startAngle + t * deltaAngle;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
};

class GrowingBuffer {
  constructor(Type, initial) {
    this.array = new Type(initial);
    this.length = 0;
  }

  push3(a, b, c) {
    if (this.length + 3 > this.array.length) {
      const next = new this.array.constructor(Math.max(this.array.length * 2, 3072));
      next.set(this.array.subarray(0, this.length));
      this.array = next;
    }
    this.array[this.length++] = a;
    this.array[this.length++] = b;
    this.array[this.length++] = c;
  }

  push1(a) {
    if (this.length + 1 > this.array.length) {
      const next = new this.array.constructor(Math.max(this.array.length * 2, 1024));
      next.set(this.array.subarray(0, this.length));
      this.array = next;
    }
    this.array[this.length++] = a;
  }

  trimmed() {
    return this.array.slice(0, this.length);
  }
}

export const DEFAULT_COLORS = {
  G0: [0, 128 / 255, 0], // green
  G1: [0, 0, 1], // blue
  G2: [0, 191 / 255, 1], // deepskyblue
  G3: [0, 191 / 255, 1]
};
export const DEFAULT_COLOR = [211 / 255, 211 / 255, 211 / 255]; // lightgrey

export function buildToolpathBuffers(gcode, options = {}) {
  const colors = options.colors || DEFAULT_COLORS;
  const defaultColor = options.defaultColor || DEFAULT_COLOR;
  const keepLines = options.keepLines !== false;
  const positions = new GrowingBuffer(Float32Array, 3 * 4096);
  const colorBuffer = new GrowingBuffer(Float32Array, 3 * 4096);
  const frames = new GrowingBuffer(Uint32Array, 1024);
  const lines = [];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];

  const add = (x, y, z, color) => {
    positions.push3(x, y, z);
    colorBuffer.push3(color[0], color[1], color[2]);
    if (x < min[0]) {
      min[0] = x;
    }
    if (x > max[0]) {
      max[0] = x;
    }
    if (y < min[1]) {
      min[1] = y;
    }
    if (y > max[1]) {
      max[1] = y;
    }
    if (z < min[2]) {
      min[2] = z;
    }
    if (z > max[2]) {
      max[2] = z;
    }
  };

  const toolpath = new Toolpath({
    addLine: (modal, v1, v2) => {
      add(v2.x, v2.y, v2.z, colors[modal.motion] || defaultColor);
    },
    addArcCurve: (modal, v1, v2, v0) => {
      const { motion, plane } = modal;
      const clockwise = (motion === 'G2');
      const radius = Math.sqrt(((v1.x - v0.x) ** 2) + ((v1.y - v0.y) ** 2));
      const startAngle = Math.atan2(v1.y - v0.y, v1.x - v0.x);
      let endAngle = Math.atan2(v2.y - v0.y, v2.x - v0.x);
      if (startAngle === endAngle) {
        endAngle += TWO_PI;
      }
      const color = colors[motion] || defaultColor;
      const pointCount = ARC_DIVISIONS + 1;
      for (let i = 0; i < pointCount; ++i) {
        const point = arcPoint(v0.x, v0.y, radius, startAngle, endAngle, clockwise, i / ARC_DIVISIONS);
        const z = ((v2.z - v1.z) / pointCount) * i + v1.z;
        if (plane === 'G17') {
          add(point[0], point[1], z, color);
        } else if (plane === 'G18') {
          add(point[1], z, point[0], color);
        } else if (plane === 'G19') {
          add(z, point[0], point[1], color);
        }
      }
    }
  });

  toolpath.loadFromStringSync(gcode, (line) => {
    frames.push1(positions.length / 3);
    if (keepLines) {
      lines.push(line);
    }
  });

  const count = positions.length / 3;
  return {
    positions: positions.trimmed(),
    colors: colorBuffer.trimmed(),
    frames: frames.trimmed(),
    lines,
    count,
    bounds: count ? { min, max } : null
  };
}

export default buildToolpathBuffers;
