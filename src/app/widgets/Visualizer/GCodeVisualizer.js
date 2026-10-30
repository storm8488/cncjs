import colornames from 'colornames';
import * as THREE from 'three';
import log from 'app/lib/log';
import { traceToolpath } from './toolpath-trace';

const defaultColor = new THREE.Color(colornames('lightgrey'));
const motionColor = {
  'G0': new THREE.Color(colornames('green')),
  'G1': new THREE.Color(colornames('blue')),
  'G2': new THREE.Color(colornames('deepskyblue')),
  'G3': new THREE.Color(colornames('deepskyblue'))
};

class GCodeVisualizer {
  constructor() {
    this.group = new THREE.Object3D();
    this.geometry = new THREE.Geometry();

    // Example
    // [
    //   {
    //     code: 'G1 X1',
    //     vertexIndex: 2
    //   }
    // ]
    this.frames = []; // Example
    this.frameIndex = 0;
    this.strips = [];

    return this;
  }

  // The path is drawn as one THREE.Line per strip: toolpath-trace cuts it
  // where a move cannot be placed in work coordinates (G53, G28, G30), so no
  // false segment joins the last vertex before the cut to the first after.
  // Vertex indices (frames, setFrameIndex) count over all strips.
  render(gcode) {
    const vertices = this.geometry.vertices;
    const colors = this.geometry.colors;
    const strips = []; // [first vertex index, end vertex index)
    let stripStart = 0;

    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      child.geometry.dispose();
    }

    traceToolpath(gcode, {
      vertex: (x, y, z, motion) => {
        vertices.push(new THREE.Vector3(x, y, z));
        colors.push(motionColor[motion] || defaultColor);
      },
      cut: () => {
        if (vertices.length > stripStart) {
          strips.push([stripStart, vertices.length]);
          stripStart = vertices.length;
        }
      },
      line: (line) => {
        this.frames.push({
          data: line,
          vertexIndex: vertices.length // remember current vertex index
        });
      }
    });
    if (vertices.length > stripStart || strips.length === 0) {
      strips.push([stripStart, vertices.length]);
    }

    const material = new THREE.LineBasicMaterial({
      color: defaultColor,
      linewidth: 1,
      vertexColors: THREE.VertexColors,
      opacity: 0.5,
      transparent: true
    });
    this.strips = strips.map(([start, end]) => {
      const workpiece = new THREE.Line(new THREE.Geometry(), material);
      workpiece.geometry.vertices = vertices.slice(start, end);
      workpiece.geometry.colors = colors.slice(start, end);
      this.group.add(workpiece);
      return { start, end, workpiece };
    });

    log.debug({
      strips: this.strips,
      frames: this.frames,
      frameIndex: this.frameIndex
    });

    return this.group;
  }

  // Sets the colour of the vertices [from, to) with color(i), i over all strips.
  recolor(from, to, color) {
    this.strips.forEach(({ start, end, workpiece }) => {
      const a = Math.max(from, start);
      const b = Math.min(to, end);
      if (a >= b) {
        return;
      }
      for (let i = a; i < b; ++i) {
        workpiece.geometry.colors[i - start] = color(i);
      }
      workpiece.geometry.colorsNeedUpdate = true;
    });
  }

  setFrameIndex(frameIndex) {
    if (this.frames.length === 0) {
      return;
    }

    frameIndex = Math.min(frameIndex, this.frames.length - 1);
    frameIndex = Math.max(frameIndex, 0);

    const v1 = this.frames[this.frameIndex].vertexIndex;
    const v2 = this.frames[frameIndex].vertexIndex;

    // Completed path is grayed out
    if (v1 < v2) {
      this.recolor(v1, v2, () => defaultColor);
    }

    // Restore the path to its original colors
    if (v2 < v1) {
      this.recolor(v2, v1, (i) => this.geometry.colors[i]);
    }

    this.frameIndex = frameIndex;
  }
}

export default GCodeVisualizer;
