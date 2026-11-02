import { traceToolpath } from './toolpath-trace';

// Typed-array geometry of a G-code toolpath, the same vertices as
// GCodeVisualizer (both walk the program with toolpath-trace.js: one vertex
// per linear move, 31 per arc sampled like THREE.ArcCurve.getPoints(30),
// G17/G18/G19 planes, comments read like the sender, G53/G28/G30 cut the
// path), without any three.js object: a Float32Array of positions, one of
// colours, one vertex index per line, the strip starts, and the bounding box.
// 1 000 000 vertices take 24 MB instead of the 100+ MB of a THREE.Geometry
// made of Vector3 and Color objects, and the result can cross a worker
// boundary as transferable buffers.
//
// buildToolpathBuffers(gcode, options) → {
//   positions: Float32Array (x, y, z per vertex), colors: Float32Array (r, g, b per vertex),
//   frames: Uint32Array (first vertex index of each line),
//   lines: object[] (the parsed lines, gcode-parser 2.2 results, unless options.keepLines is false),
//   breaks: Uint32Array (first vertex index of each strip after the first: the path is
//   cut before it, never joined to the previous vertex), count: number of vertices,
//   bounds: { min: [x, y, z], max: [x, y, z] } or null when empty,
//   position: { x, y, z } at the end of the program, null for an axis left unknown
// }
// options.colors: { G0: [r, g, b], G1: …, G2: …, G3: … } in 0..1, options.defaultColor: [r, g, b].

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

  const breaks = new GrowingBuffer(Uint32Array, 16);
  const { position } = traceToolpath(gcode, {
    vertex: (x, y, z, motion) => add(x, y, z, colors[motion] || defaultColor),
    cut: () => {
      const at = positions.length / 3;
      if (at > 0 && (breaks.length === 0 || breaks.array[breaks.length - 1] !== at)) {
        breaks.push1(at);
      }
    },
    line: (line) => {
      frames.push1(positions.length / 3);
      if (keepLines) {
        lines.push(line);
      }
    }
  });

  const count = positions.length / 3;
  return {
    positions: positions.trimmed(),
    colors: colorBuffer.trimmed(),
    frames: frames.trimmed(),
    lines,
    breaks: breaks.trimmed(),
    count,
    bounds: count ? { min, max } : null,
    position
  };
}

export default buildToolpathBuffers;
