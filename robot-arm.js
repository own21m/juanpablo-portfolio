/* Juanpablo / 21 — articulated, dependency-free WebGL study of my real arm. */
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const radians = degrees => degrees * Math.PI / 180;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const subtract = (a, b) => a.map((v, i) => v - b[i]);
  const scale = (a, value) => a.map(v => v * value);
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const normalize = a => scale(a, 1 / (Math.hypot(...a) || 1));
  const mix = (a, b, t) => a + (b - a) * t;
  const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  function multiply(a, b) {
    const result = new Array(16).fill(0);
    for (let column = 0; column < 4; column++) {
      for (let row = 0; row < 4; row++) {
        for (let k = 0; k < 4; k++) result[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
      }
    }
    return result;
  }

  function transform(matrix, point, w = 1) {
    return [0, 1, 2, 3].map(row => matrix[row] * point[0] + matrix[4 + row] * point[1] + matrix[8 + row] * point[2] + matrix[12 + row] * w);
  }

  function basis(x, y, z, position) {
    return [...x, 0, ...y, 0, ...z, 0, ...position, 1];
  }

  function translation(x, y, z) {
    const matrix = identity();
    matrix[12] = x; matrix[13] = y; matrix[14] = z;
    return matrix;
  }

  function rotateY(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
  }

  function rotateX(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
  }

  function ortho(left, right, bottom, top, near, far) {
    return [2 / (right - left), 0, 0, 0, 0, 2 / (top - bottom), 0, 0, 0, 0, -2 / (far - near), 0,
      -(right + left) / (right - left), -(top + bottom) / (top - bottom), -(far + near) / (far - near), 1];
  }

  function lookAt(eye, target) {
    const z = normalize(subtract(eye, target));
    const x = normalize(cross([0, 1, 0], z));
    const y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
  }

  // Shared triangle meshes also produce the portable SVG fallback; no external assets.
  function boxMesh() {
    const output = [];
    const faces = [
      [[1, 0, 0], [[.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [.5, -.5, .5]]],
      [[-1, 0, 0], [[-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-.5, -.5, -.5]]],
      [[0, 1, 0], [[-.5, .5, -.5], [-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5]]],
      [[0, -1, 0], [[-.5, -.5, .5], [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5]]],
      [[0, 0, 1], [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]]],
      [[0, 0, -1], [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]]],
    ];
    for (const [normal, vertices] of faces) for (const index of [0, 1, 2, 0, 2, 3]) output.push(...vertices[index], ...normal);
    return output;
  }

  function cylinderMesh(sides = 18) {
    const output = [];
    const vertex = (p, n) => output.push(...p, ...n);
    for (let index = 0; index < sides; index++) {
      const a = index / sides * TAU, b = (index + 1) / sides * TAU;
      const na = [Math.cos(a), 0, Math.sin(a)], nb = [Math.cos(b), 0, Math.sin(b)];
      const a0 = [na[0] * .5, -.5, na[2] * .5], a1 = [na[0] * .5, .5, na[2] * .5];
      const b0 = [nb[0] * .5, -.5, nb[2] * .5], b1 = [nb[0] * .5, .5, nb[2] * .5];
      for (const [p, n] of [[a0, na], [a1, na], [b1, nb], [a0, na], [b1, nb], [b0, nb]]) vertex(p, n);
      for (const p of [[0, .5, 0], b1, a1]) vertex(p, [0, 1, 0]);
      for (const p of [[0, -.5, 0], a0, b0]) vertex(p, [0, -1, 0]);
    }
    return output;
  }

  const meshes = Object.freeze({ box: boxMesh(), cylinder: cylinderMesh(), bolt: cylinderMesh(6), wire: cylinderMesh(7) });

  // Weld triangle topology to real feature edges; planar face diagonals disappear.
  function topologyEdges(mesh) {
    const edges = new Map();
    const key = point => point.map(value => Math.round(value * 100000)).join(',');
    for (let i = 0; i < mesh.length; i += 18) {
      const a = mesh.slice(i, i + 3), b = mesh.slice(i + 6, i + 9), c = mesh.slice(i + 12, i + 15);
      const normal = normalize(cross(subtract(b, a), subtract(c, a)));
      for (const [start, end] of [[a, b], [b, c], [c, a]]) {
        const ka = key(start), kb = key(end), id = ka < kb ? ka + '/' + kb : kb + '/' + ka;
        if (!edges.has(id)) edges.set(id, { start, end, normals: [] });
        edges.get(id).normals.push(normal);
      }
    }
    return [...edges.values()].filter(edge => edge.normals.length === 1 || dot(edge.normals[0], edge.normals[1]) < .9999)
      .map(edge => ({ ...edge, hard: edge.normals.length === 1 || dot(edge.normals[0], edge.normals[1]) < Math.cos(radians(36)) }));
  }
  const edgeMeshes = Object.freeze(Object.fromEntries(Object.entries(meshes).map(([name, mesh]) => [name, topologyEdges(mesh)])));
  const materials = Object.freeze({
    frame: [.078, .086, .1, .84, .34],
    edge: [.16, .18, .20, .88, .24],
    base: [.045, .052, .064, .7, .42],
    silver: [.67, .71, .76, .96, .2],
    screw: [.33, .36, .39, .93, .22],
    rubber: [.017, .021, .025, .08, .8],
    servo: [.035, .16, .24, .46, .3],
    board: [.025, .09, .067, .35, .58],
    brass: [.68, .46, .13, .82, .33],
    red: [.82, .012, .026, .16, .42],
    orange: [.79, .22, .035, .16, .5],
    purple: [.31, .16, .49, .12, .5],
    blue: [.025, .22, .48, .2, .36],
  });
  const poses = Object.freeze({
    saludo: { shoulder: 126, elbow: 205, wrist: 192, yaw: -8, label: 'Exploración' },
    alcance: { shoulder: 143, elbow: 183, wrist: 175, yaw: 8, label: 'Alcance' },
    reposo: { shoulder: 107, elbow: 230, wrist: 210, yaw: -15, label: 'Reposo' },
  });
  const defaultCamera = Object.freeze({ azimuth: .63, elevation: .36 });

  function resolvePose(name, time = 0) {
    const p = typeof name === 'object' ? name : (poses[name] || poses.saludo);
    return {
      shoulder: p.shoulder + Math.sin(time * .48) * 4,
      elbow: p.elbow + Math.sin(time * .48 + .7) * 5,
      wrist: p.wrist + Math.sin(time * .42 + 1) * 4,
      yaw: p.yaw + Math.sin(time * .28) * 6,
      label: p.label,
    };
  }

  function createScene(poseName = 'saludo', grip = .62, time = 0) {
    const parts = [];
    const p = resolvePose(poseName, time);
    const yaw = rotateY(radians(p.yaw));
    let assemblyParent = identity();
    const addPart = (geometry, matrix, material, tag, parent = assemblyParent) => parts.push({ geometry, matrix: multiply(parent, matrix), material: materials[material], tag });
    const box = (center, dimensions, material = 'frame', tag = 'frame') => addPart('box', basis([dimensions[0], 0, 0], [0, dimensions[1], 0], [0, 0, dimensions[2]], center), material, tag);
    const cylinder = (a, b, diameter, material = 'silver', tag = 'joint', geometry = 'cylinder') => {
      const axis = subtract(b, a), length = Math.hypot(...axis), y = normalize(axis);
      const x = normalize(cross(y, Math.abs(y[2]) > .9 ? [1, 0, 0] : [0, 0, 1]));
      addPart(geometry, basis(scale(x, diameter), scale(y, length), scale(cross(x, y), diameter), scale(add(a, b), .5)), material, tag);
    };
    const bar = (a, b, width, depth, material = 'frame', tag = 'rail') => {
      const x = normalize(subtract(b, a)), y = [-x[1], x[0], 0], length = Math.hypot(...subtract(b, a));
      addPart('box', basis(scale(x, length), scale(y, width), [0, 0, depth], scale(add(a, b), .5)), material, tag);
    };
    const bolt = (point, diameter = .09) => {
      cylinder(add(point, [0, 0, -.018]), add(point, [0, 0, .018]), diameter * 1.35, 'screw', 'washer');
      cylinder(add(point, [0, 0, .018]), add(point, [0, 0, .05]), diameter, 'silver', 'hex-bolt', 'bolt');
      cylinder(add(point, [0, 0, .05]), add(point, [0, 0, .053]), diameter * .34, 'rubber', 'bolt-socket', 'bolt');
    };
    const wire = (a, control, b, color) => {
      let previous = a;
      for (let i = 1; i <= 10; i++) {
        const t = i / 10, u = 1 - t;
        const next = a.map((v, index) => u * u * v + 2 * u * t * control[index] + t * t * b[index]);
        cylinder(previous, next, .019, color, 'servo-wire', 'wire'); previous = next;
      }
    };
    const joint = (point, radius = .18) => {
      cylinder(add(point, [0, 0, -.4]), add(point, [0, 0, .4]), .095, 'silver', 'joint-shaft');
      for (const side of [-1, 1]) {
        cylinder(add(point, [0, 0, side * .26]), add(point, [0, 0, side * .34]), radius * 2, 'frame', 'joint-bearing');
        cylinder(add(point, [0, 0, side * .34]), add(point, [0, 0, side * .37]), radius * 1.3, 'edge', 'bearing-ring');
        bolt(add(point, [0, 0, side * .39]), radius * .58);
      }
    };
    const servo = (point, label = 'servo') => {
      box(point, [.33, .43, .24], 'servo', label);
      box(add(point, [0, -.01, .126]), [.29, .27, .015], 'edge', 'servo-label-plate');
      box(add(point, [0, .02, .137]), [.18, .045, .01], 'brass', 'servo-label');
      box(add(point, [0, -.065, .137]), [.12, .018, .01], 'silver', 'servo-label-line');
      for (const dx of [-.12, .12]) for (const dy of [-.16, .16]) bolt(add(point, [dx, dy, .13]), .029);
      box(add(point, [0, .24, 0]), [.44, .06, .28], 'rubber', 'servo-mount');
    };

    // A thin square chassis, visible electronics and the kit's exposed fasteners.
    box([0, .10, 0], [1.48, .14, 1.32], 'base', 'square-base-plate');
    box([0, .173, 0], [1.39, .013, 1.23], 'frame', 'base-top-face');
    for (const x of [-.61, .61]) for (const z of [-.53, .53]) {
      cylinder([x, .025, z], [x, .055, z], .15, 'rubber', 'rubber-foot');
      cylinder([x, .18, z], [x, .2, z], .09, 'silver', 'base-fastener', 'bolt');
    }
    cylinder([0, .18, 0], [0, .31, 0], .82, 'edge', 'turntable-edge');
    cylinder([0, .31, 0], [0, .36, 0], .75, 'base', 'turntable');
    box([.17, .26, -.42], [.62, .05, .30], 'board', 'controller-board');
    for (let i = 0; i < 6; i++) box([-.05 + i * .07, .30, -.44], [.027, .035, .05], 'brass', 'pin-header');
    box([.38, .30, -.42], [.16, .06, .16], 'silver', 'usb-port');
    wire([.46, .30, -.44], [1.05, .48, -.53], [1.22, .38, -.67], 'blue');
    box([.93, .40, -.59], [.24, .12, .14], 'rubber', 'usb-connector');
    // The chassis and its electronics remain fixed while the upper platform turns.
    assemblyParent = yaw;
    for (const side of [-1, 1]) {
      box([0, .51, side * .27], [.52, .36, .085], 'frame', 'shoulder-bracket');
      box([.02, .35, side * .28], [.80, .075, .16], 'edge', 'bracket-foot');
    }
    const shoulder = [0, .72, 0];
    const upperAngle = radians(p.shoulder), lowerAngle = radians(p.elbow), wristAngle = radians(p.wrist);
    const upperLength = 1.42, lowerLength = 1.64;
    const elbow = add(shoulder, [Math.cos(upperAngle) * upperLength, Math.sin(upperAngle) * upperLength, 0]);
    const wrist = add(elbow, [Math.cos(lowerAngle) * lowerLength, Math.sin(lowerAngle) * lowerLength, 0]);
    joint(shoulder, .215); joint(elbow, .18); joint(wrist, .135);
    servo([.10, .64, .52], 'shoulder-servo');

    // Each link has two open parallel plates, mirrored on the other side of the arm.
    const rails = (a, b, spacing, width) => {
      const normal = normalize([-(b[1] - a[1]), b[0] - a[0], 0]);
      for (const z of [-.28, .28]) {
        for (const offset of [-spacing, spacing]) {
          const shift = add(scale(normal, offset), [0, 0, z]);
          bar(add(a, shift), add(b, shift), width, .065, 'frame', 'parallel-link-rail');
          for (const t of [.12, .88]) bolt(add(add(scale(a, 1 - t), scale(b, t)), add(shift, [0, 0, .04])), .048);
        }
      }
      for (const t of [.12, .88]) {
        const c = add(scale(a, 1 - t), scale(b, t));
        cylinder(add(c, [0, 0, -.32]), add(c, [0, 0, .32]), .07, 'silver', 'link-cross-spacer');
      }
    };
    rails(shoulder, elbow, .135, .09);
    rails(elbow, wrist, .12, .075);
    servo(add(elbow, [.10, -.15, .47]), 'elbow-servo');
    bar(add(shoulder, [.24, -.05, -.32]), add(elbow, [.18, -.05, -.32]), .07, .055, 'edge', 'parallelogram-linkage');
    joint(add(elbow, [.18, -.05, 0]), .085);

    const wireStart = [.11, .72, .63], wireMiddle = add(elbow, [.08, -.15, .50]), wireEnd = add(wrist, [.18, 0, .29]);
    for (const [index, color] of ['red', 'orange', 'purple'].entries()) {
      const offset = [0, index * .026, index * -.026];
      wire(add(wireStart, offset), add(shoulder, [.56, 1.2 + index * .04, .64]), add(wireMiddle, offset), color);
      wire(add(wireMiddle, offset), add(scale(add(elbow, wrist), .5), [0, -.08 + index * .026, .40]), add(wireEnd, offset), color);
    }
    for (const t of [.28, .68]) {
      const c = add(add(scale(elbow, 1 - t), scale(wrist, t)), [0, -.1, .35]);
      box(c, [.06, .18, .10], 'rubber', 'cable-tie');
    }

    // Two opposing finger jaws: visible teeth, gear pivots and open negative space.
    // The real pinza opens horizontally: rotate its entire mechanism around its X axis.
    const hand = multiply(multiply(translation(...wrist), [Math.cos(wristAngle), Math.sin(wristAngle), 0, 0, -Math.sin(wristAngle), Math.cos(wristAngle), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), rotateX(Math.PI / 2));
    assemblyParent = multiply(yaw, hand);
    const handBox = box;
    handBox([.20, 0, 0], [.44, .34, .43], 'frame', 'wrist-gripper-plate');
    handBox([.14, 0, .26], [.30, .31, .12], 'servo', 'gripper-servo');
    for (const side of [-1, 1]) {
      const spread = .10 + clamp(grip, 0, 1) * .19;
      const pivot = [.36, side * .13, 0];
      const end = [.80, side * (.13 + spread), 0];
      bar(pivot, end, .115, .12, 'frame', 'gripper-jaw');
      const tip = [1.02, side * (.13 + spread - .07), 0];
      bar(end, tip, .13, .12, 'edge', 'gripper-hook');
      for (let tooth = 0; tooth < 5; tooth++) {
        const cx = .68 + tooth * .055, cy = side * (.13 + spread - .064) - side * tooth * .011;
        handBox([cx, cy, 0], [.025, .048, .13], 'frame', 'gripper-teeth');
      }
      cylinder(add(pivot, [0, 0, -.085]), add(pivot, [0, 0, .085]), .18, 'edge', 'gripper-gear');
      bolt(add(pivot, [0, 0, .10]), .071);
      // The thin link behind each jaw follows the same articulated opening.
      bar([.20, side * .1, -.12], [.61, side * (.19 + spread * .55), -.12], .045, .04, 'screw', 'gripper-linkage');
    }
    return parts;
  }

  function cameraMatrix(aspect = 1.4, azimuth = defaultCamera.azimuth, elevation = defaultCamera.elevation, vertices = null) {
    const target = [-.98, 1.25, 0];
    const distance = 8;
    const eye = add(target, [Math.sin(azimuth) * Math.cos(elevation) * distance, Math.sin(elevation) * distance, Math.cos(azimuth) * Math.cos(elevation) * distance]);
    const view = lookAt(eye, target);
    const geometry = vertices || sceneVertices(createScene());
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < geometry.length; i += 11) {
      const x = view[0] * geometry[i] + view[4] * geometry[i + 1] + view[8] * geometry[i + 2] + view[12];
      const y = view[1] * geometry[i] + view[5] * geometry[i + 1] + view[9] * geometry[i + 2] + view[13];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    // Fit the actual posed geometry: the pinza and USB lead stay inside every viewport.
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    const halfHeight = Math.max((maxY - minY) / 2, (maxX - minX) / (2 * Math.max(.2, aspect))) * 1.13;
    const halfWidth = halfHeight * aspect;
    const projection = ortho(centerX - halfWidth, centerX + halfWidth, centerY - halfHeight, centerY + halfHeight, .1, 30);
    return { matrix: multiply(projection, view), view, projection, eye, target, halfHeight };
  }

  function sceneVertices(parts, reusable = null) {
    let vertexCount = 0;
    for (const part of parts) vertexCount += meshes[part.geometry].length / 6;
    const output = reusable && reusable.length === vertexCount * 11 ? reusable : new Float32Array(vertexCount * 11);
    let index = 0;
    for (const part of parts) {
      const mesh = meshes[part.geometry], matrix = part.matrix;
      const inverseX = 1 / (matrix[0] ** 2 + matrix[1] ** 2 + matrix[2] ** 2 || 1);
      const inverseY = 1 / (matrix[4] ** 2 + matrix[5] ** 2 + matrix[6] ** 2 || 1);
      const inverseZ = 1 / (matrix[8] ** 2 + matrix[9] ** 2 + matrix[10] ** 2 || 1);
      for (let i = 0; i < mesh.length; i += 6) {
        const x = mesh[i], y = mesh[i + 1], z = mesh[i + 2];
        const nx = mesh[i + 3] * inverseX, ny = mesh[i + 4] * inverseY, nz = mesh[i + 5] * inverseZ;
        const ax = matrix[0] * nx + matrix[4] * ny + matrix[8] * nz;
        const ay = matrix[1] * nx + matrix[5] * ny + matrix[9] * nz;
        const az = matrix[2] * nx + matrix[6] * ny + matrix[10] * nz;
        const inverseLength = 1 / (Math.sqrt(ax * ax + ay * ay + az * az) || 1);
        output[index] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
        output[index + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
        output[index + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
        output[index + 3] = ax * inverseLength; output[index + 4] = ay * inverseLength; output[index + 5] = az * inverseLength;
        for (let component = 0; component < 5; component++) output[index + 6 + component] = part.material[component];
        index += 11;
      }
    }
    return output;
  }

  function featureVertices(parts, eye, reusable = null) {
    let capacity = 0;
    for (const part of parts) capacity += (part.tag === 'servo-wire' ? 1 : edgeMeshes[part.geometry].length) * 22;
    const vertices = reusable && reusable.length === capacity ? reusable : new Float32Array(capacity);
    let index = 0;
    const tags = [];
    for (const part of parts) {
      const matrix = part.matrix, isWire = part.tag === 'servo-wire';
      const edges = isWire ? [{ start: [0, -.5, 0], end: [0, .5, 0], hard: true, normals: [] }] : edgeMeshes[part.geometry];
      const wireBias = isWire ? scale(normalize(subtract(eye, [matrix[12], matrix[13], matrix[14]])), .011) : [0, 0, 0];
      const normalMatrix = [0, 1, 2].map(column => {
        const j = column * 4, inverse = 1 / (matrix[j] ** 2 + matrix[j + 1] ** 2 + matrix[j + 2] ** 2 || 1);
        return [matrix[j] * inverse, matrix[j + 1] * inverse, matrix[j + 2] * inverse];
      });
      for (const edge of edges) {
        if (!edge.hard) {
          const midpoint = scale(add(transform(matrix, edge.start).slice(0, 3), transform(matrix, edge.end).slice(0, 3)), .5);
          const view = subtract(eye, midpoint);
          const facing = edge.normals.map(normal => dot([0, 1, 2].map(row => normalMatrix.reduce((sum, column, col) => sum + column[row] * normal[col], 0)), view));
          if (facing.length < 2 || facing[0] * facing[1] >= 0) continue;
        }
        for (const point of [edge.start, edge.end]) {
          const x = point[0], y = point[1], z = point[2];
          vertices[index] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12] + wireBias[0];
          vertices[index + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13] + wireBias[1];
          vertices[index + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14] + wireBias[2];
          vertices[index + 3] = 0; vertices[index + 4] = 1; vertices[index + 5] = 0;
          vertices[index + 6] = isWire ? 1 : 0; vertices[index + 7] = 0; vertices[index + 8] = 0;
          vertices[index + 9] = 0; vertices[index + 10] = 0; index += 11;
        }
        tags.push(part.tag);
      }
    }
    return { vertices, count: index / 11, tags };
  }

  function technicalFaceColor(normal, material, lightTheme) {
    const diffuse = .2 + Math.max(dot(normal, normalize([.3, .9, .65])), 0) * .8;
    const gray = (lightTheme ? .94 - diffuse * .07 : .065 + diffuse * .045) + material[4] * .002;
    const accent = material[0] > .5 && material[0] > material[1] * 2;
    return (accent ? [lightTheme ? .68 : .60, .035, .065] : [gray * .94, gray * .98, gray * 1.04])
      .map(value => Math.round(clamp(value, 0, 1) * 255));
  }

  function projectScene(width, height, poseName = 'saludo', options = {}) {
    const parts = createScene(poseName, options.grip === undefined ? .62 : options.grip, options.time || 0);
    const vertices = sceneVertices(parts);
    const camera = cameraMatrix(width / height, options.azimuth, options.elevation, vertices);
    const triangles = [], bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    const worldBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (let i = 0; i < vertices.length; i += 33) {
      const points = [], coordinates = [], normals = [], depths = [];
      let depth = 0;
      for (let j = 0; j < 3; j++) {
        const offset = i + j * 11, point = Array.from(vertices.slice(offset, offset + 3));
        coordinates.push(point); normals.push(Array.from(vertices.slice(offset + 3, offset + 6)));
        const clip = transform(camera.matrix, point);
        points.push([(clip[0] / clip[3] * .5 + .5) * width, (.5 - clip[1] / clip[3] * .5) * height]);
        depth += clip[2] / clip[3];
        depths.push(clip[2] / clip[3]);
        point.forEach((value, axis) => { worldBounds.min[axis] = Math.min(worldBounds.min[axis], value); worldBounds.max[axis] = Math.max(worldBounds.max[axis], value); });
      }
      const geometricNormal = cross(subtract(coordinates[1], coordinates[0]), subtract(coordinates[2], coordinates[0]));
      // Software fallback only includes front-facing triangles; WebGL uses depth testing.
      if (dot(geometricNormal, subtract(camera.eye, coordinates[0])) <= 0) continue;
      for (const [x, y] of points) { bounds.left = Math.min(bounds.left, x); bounds.top = Math.min(bounds.top, y); bounds.right = Math.max(bounds.right, x); bounds.bottom = Math.max(bounds.bottom, y); }
      const normal = normalize(scale(add(add(normals[0], normals[1]), normals[2]), 1 / 3));
      const color = technicalFaceColor(normal, vertices.slice(i + 6, i + 11), Boolean(options.lightTheme));
      triangles.push({ points, depths, depth: depth / 3, color });
    }
    triangles.sort((a, b) => b.depth - a.depth);
    // Rasterize depth only, then retain visible runs of actual feature edges.
    // This is an offline poster helper, not the realtime rendering path.
    const rasterWidth = Math.ceil(width), rasterHeight = Math.ceil(height);
    const depthBuffer = new Float32Array(rasterWidth * rasterHeight); depthBuffer.fill(Infinity);
    for (const triangle of triangles) {
      const [a, b, c] = triangle.points;
      const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(denominator) < .00001) continue;
      const left = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), right = Math.min(rasterWidth - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const top = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), bottom = Math.min(rasterHeight - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
        const px = x + .5, py = y + .5;
        const u = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / denominator;
        const v = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / denominator;
        const w = 1 - u - v;
        if (u < -.0001 || v < -.0001 || w < -.0001) continue;
        const z = triangle.depths[0] * u + triangle.depths[1] * v + triangle.depths[2] * w, offset = y * rasterWidth + x;
        if (z < depthBuffer[offset]) depthBuffer[offset] = z;
      }
    }
    const lines = featureVertices(parts, camera.eye), edges = [];
    for (let i = 0; i < lines.count * 11; i += 22) {
      const a = transform(camera.matrix, lines.vertices.slice(i, i + 3)), b = transform(camera.matrix, lines.vertices.slice(i + 11, i + 14));
      const start = [(a[0] * .5 + .5) * width, (.5 - a[1] * .5) * height], end = [(b[0] * .5 + .5) * width, (.5 - b[1] * .5) * height];
      const steps = Math.max(2, Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) * 1.5));
      const isRed = lines.vertices[i + 6] > .5;
      const color = isRed ? [options.lightTheme ? 218 : 255, 20, 37] : (options.lightTheme ? [31, 37, 44] : [225, 233, 242]);
      let runStart = null;
      for (let sample = 0; sample <= steps; sample++) {
        const t = sample / steps, x = mix(start[0], end[0], t), y = mix(start[1], end[1], t), z = mix(a[2], b[2], t);
        const px = Math.floor(x), py = Math.floor(y);
        const shown = px >= 0 && py >= 0 && px < rasterWidth && py < rasterHeight && z <= depthBuffer[py * rasterWidth + px] + .0007;
        if (shown && runStart === null) runStart = t;
        if ((!shown || sample === steps) && runStart !== null) {
          const runEnd = shown ? t : Math.max(runStart, (sample - 1) / steps);
          if (runEnd - runStart > .001) edges.push({ points: [[mix(start[0], end[0], runStart), mix(start[1], end[1], runStart)], [mix(start[0], end[0], runEnd), mix(start[1], end[1], runEnd)]], depth: (a[2] + b[2]) / 2, color, tag: lines.tags[i / 22] });
          runStart = null;
        }
      }
    }
    return { triangles, edges, bounds, worldBounds, style: 'technical' };
  }

  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec3 aColor;
    attribute vec2 aSurface;
    uniform mat4 uViewProjection;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec3 vColor;
    varying vec2 vSurface;
    void main() {
      vPosition = aPosition; vNormal = aNormal; vColor = aColor; vSurface = aSurface;
      gl_Position = uViewProjection * vec4(aPosition, 1.0);
    }
  `;
  const fragmentSource = `
    precision mediump float;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec3 vColor;
    varying vec2 vSurface;
    uniform float uLightTheme;
    uniform float uLinePass;
    void main() {
      if (uLinePass > 0.5) {
        vec3 neutral = mix(vec3(0.88, 0.915, 0.95), vec3(0.12, 0.145, 0.17), uLightTheme);
        vec3 red = mix(vec3(1.0, 0.078, 0.145), vec3(0.855, 0.078, 0.145), uLightTheme);
        gl_FragColor = vec4(mix(neutral, red, step(0.5, vColor.r)), 1.0);
        return;
      }
      vec3 N = normalize(vNormal);
      if (!gl_FrontFacing) N = -N;
      vec3 L = normalize(vec3(0.3, 0.9, 0.65));
      float diffuse = 0.2 + max(dot(N, L), 0.0) * 0.8;
      float gray = mix(0.065 + diffuse * 0.045, 0.94 - diffuse * 0.07, uLightTheme);
      gray += vSurface.y * 0.002;
      float accent = step(0.5, vColor.r) * step(vColor.g * 2.0, vColor.r);
      vec3 color = mix(vec3(gray * 0.94, gray * 0.98, gray * 1.04), vec3(mix(0.60, 0.68, uLightTheme), 0.035, 0.065), accent);
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `;

  // A small, deterministic core supports geometry and fallback validation without a browser.
  const core = Object.freeze({ createScene, sceneVertices, featureVertices, edgeMeshes, projectScene, cameraMatrix, resolvePose, poses, materials, meshes, multiply, transform, vertexSource, fragmentSource, defaultCamera });
  globalThis.JPRobotArmCore = core;
  if (typeof document === 'undefined') return;
  const section = document.getElementById('robotica');
  const canvas = document.getElementById('robot-arm-canvas');
  if (!section || !canvas) return;

  const stage = section.querySelector('.robot-stage') || canvas.parentElement;
  const root = document.documentElement;
  const playButton = section.querySelector('#robot-play');
  const gripButton = section.querySelector('#robot-grip');
  const resetButton = section.querySelector('#robot-reset');
  const poseButtons = [...section.querySelectorAll('[data-robot-pose]')];
  const poseLabel = section.querySelector('#robot-pose-label');
  const status = section.querySelector('#robot-status');
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let gl = null, program = null, buffer = null, lineBuffer = null, contextLost = false, failed = false;
  let locations = null, visible = false, frame = 0, previousTime = 0, clock = 0, lastPaint = 0;
  let playRequested = !motionPreference.matches;
  let poseName = 'saludo', open = true;
  let azimuth = defaultCamera.azimuth, elevation = defaultCamera.elevation;
  let pendingPose = null, transitionStart = 0, transitionFrom = null;
  let reusableVertices = null;
  let reusableLines = null;
  let drag = null, destroyed = false;
  const globallyPaused = () => root.classList.contains('motion-off');
  const galleryOpen = () => section.dataset.galleryOpen === 'true';
  const canAnimate = () => visible && !document.hidden && !galleryOpen() && !failed && !contextLost && !destroyed && playRequested && !globallyPaused();
  const say = message => { if (status && status.textContent !== message) status.textContent = message; };

  function updateControls() {
    const running = playRequested && !globallyPaused() && !galleryOpen() && !failed && !contextLost;
    section.dataset.robotPlaying = String(running);
    if (playButton) {
      playButton.setAttribute('aria-pressed', String(running));
      playButton.setAttribute('aria-label', running ? 'Pausar el brazo 3D' : 'Animar el brazo 3D');
      const label = playButton.querySelector('[data-robot-play-label]');
      if (label) label.textContent = running ? 'Pausar' : 'Animar';
    }
    if (gripButton) {
      gripButton.setAttribute('aria-pressed', String(open));
      gripButton.setAttribute('aria-label', open ? 'Cerrar la pinza' : 'Abrir la pinza');
      const label = gripButton.querySelector('[data-robot-grip-label]');
      if (label) label.textContent = open ? 'Cerrar pinza' : 'Abrir pinza';
    }
    for (const button of poseButtons) button.setAttribute('aria-pressed', String(button.dataset.robotPose === poseName));
    if (poseLabel) poseLabel.textContent = poses[poseName].label;
  }

  function fallback(message) {
    failed = true;
    section.dataset.renderer = 'fallback';
    cancelAnimationFrame(frame); frame = 0;
    for (const control of section.querySelectorAll('[data-robot-only]')) control.disabled = true;
    canvas.tabIndex = -1;
    canvas.setAttribute('aria-hidden', 'true');
    say(message || 'Vista estática del modelo. El 3D no está disponible en este dispositivo.');
    updateControls();
  }

  function compile(type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Shader allocation failed');
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader); throw new Error('Shader compilation failed');
    }
    return shader;
  }

  function initialize() {
    if (failed || contextLost || destroyed) return false;
    if (gl && program) return true;
    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: true, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
      if (!gl) throw new Error('WebGL unavailable');
      const vertex = compile(gl.VERTEX_SHADER, vertexSource), fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
      program = gl.createProgram();
      gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
      gl.deleteShader(vertex); gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Program link failed');
      buffer = gl.createBuffer(); lineBuffer = gl.createBuffer();
      gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const stride = 11 * 4, attributes = [];
      for (const [name, count, offset] of [['aPosition', 3, 0], ['aNormal', 3, 3], ['aColor', 3, 6], ['aSurface', 2, 9]]) {
        const location = gl.getAttribLocation(program, name);
        if (location < 0) {
          if (name === 'aPosition') throw new Error('Position attribute unavailable');
          continue; // A conforming GLSL linker may remove an unused optional attribute.
        }
        gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, count, gl.FLOAT, false, stride, offset * 4);
        attributes.push({ location, count, offset: offset * 4 });
      }
      locations = { matrix: gl.getUniformLocation(program, 'uViewProjection'), theme: gl.getUniformLocation(program, 'uLightTheme'), line: gl.getUniformLocation(program, 'uLinePass'), attributes };
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      // Kit plates are deliberately double-sided, with proper back-face lighting.
      gl.disable(gl.CULL_FACE); gl.clearColor(0, 0, 0, 0);
      resize();
      return true;
    } catch (_) { fallback(); return false; }
  }

  function resize() {
    if (!gl || failed || contextLost) return;
    const rect = stage.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(rect.width * ratio)), height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl.viewport(0, 0, width, height);
  }

  function currentPose(now) {
    if (!pendingPose || !transitionFrom) return poseName;
    const progress = clamp((now - transitionStart) / 650, 0, 1);
    const t = progress * progress * (3 - 2 * progress);
    if (progress >= 1) { pendingPose = null; transitionFrom = null; return poseName; }
    const target = poses[poseName], result = { label: target.label };
    for (const key of ['shoulder', 'elbow', 'wrist', 'yaw']) result[key] = mix(transitionFrom[key], target[key], t);
    return result;
  }

  function paint(now = performance.now()) {
    if (!visible || document.hidden || galleryOpen() || !initialize()) return;
    resize();
    const parts = createScene(currentPose(now), open ? .68 : .06, clock);
    const vertices = sceneVertices(parts, reusableVertices);
    reusableVertices = vertices;
    const camera = cameraMatrix(canvas.width / canvas.height, azimuth, elevation, vertices);
    const lines = featureVertices(parts, camera.eye, reusableLines); reusableLines = lines.vertices;
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const attribute of locations.attributes) gl.vertexAttribPointer(attribute.location, attribute.count, gl.FLOAT, false, 44, attribute.offset);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    gl.uniformMatrix4fv(locations.matrix, false, new Float32Array(camera.matrix));
    gl.uniform1f(locations.theme, root.dataset.theme === 'light' ? 1 : 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // Opaque subtle fills establish occlusion; actual feature lines sit on their surfaces.
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1);
    gl.uniform1f(locations.line, 0);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 11);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
    for (const attribute of locations.attributes) gl.vertexAttribPointer(attribute.location, attribute.count, gl.FLOAT, false, 44, attribute.offset);
    gl.bufferData(gl.ARRAY_BUFFER, lines.vertices.subarray(0, lines.count * 11), gl.DYNAMIC_DRAW);
    gl.uniform1f(locations.line, 1); gl.lineWidth(1);
    gl.depthMask(false); gl.drawArrays(gl.LINES, 0, lines.count); gl.depthMask(true);
    if (section.dataset.renderer !== 'webgl') {
      if (gl.getError() !== gl.NO_ERROR) { fallback(); return; }
      section.dataset.renderer = 'webgl';
      say('Modelo 3D listo. Arrastra para explorarlo o utiliza las flechas del teclado.');
    }
    lastPaint = now;
  }

  function loop(now) {
    frame = 0;
    if (!canAnimate() && !pendingPose) { previousTime = 0; return; }
    if (!visible || document.hidden || galleryOpen() || failed || contextLost) return;
    if (!previousTime) previousTime = now;
    const delta = Math.min((now - previousTime) / 1000, .1); previousTime = now;
    if (canAnimate()) clock += delta;
    if (now - lastPaint >= 1000 / 30) paint(now);
    if (canAnimate() || pendingPose) frame = requestAnimationFrame(loop);
  }

  function schedule() {
    if (destroyed) return;
    if (!visible || document.hidden || galleryOpen() || failed || contextLost) {
      cancelAnimationFrame(frame); frame = 0; previousTime = 0; return;
    }
    if (canAnimate() || pendingPose) { if (!frame) frame = requestAnimationFrame(loop); }
    else { cancelAnimationFrame(frame); frame = 0; previousTime = 0; paint(); }
  }

  function togglePlay() {
    if (failed) return;
    if (globallyPaused()) {
      say('Las animaciones están pausadas desde el control superior de la página.');
      return;
    }
    playRequested = !playRequested; updateControls(); schedule();
    say(playRequested ? 'Animación del brazo activada.' : 'Animación pausada. Puedes seguir girando el modelo.');
  }

  function setPose(name) {
    if (!poses[name] || failed) return;
    transitionFrom = typeof currentPose(performance.now()) === 'object' ? currentPose(performance.now()) : { ...poses[poseName] };
    poseName = name;
    if (!motionPreference.matches && !globallyPaused()) { pendingPose = name; transitionStart = performance.now(); }
    else { pendingPose = null; transitionFrom = null; }
    updateControls(); schedule(); say('Postura: ' + poses[name].label + '.');
  }

  if (playButton) playButton.addEventListener('click', togglePlay);
  if (gripButton) gripButton.addEventListener('click', () => {
    if (failed) return;
    open = !open; updateControls(); paint(); say(open ? 'Pinza abierta.' : 'Pinza cerrada.');
  });
  for (const button of poseButtons) button.addEventListener('click', () => setPose(button.dataset.robotPose));
  const resetCamera = () => { azimuth = defaultCamera.azimuth; elevation = defaultCamera.elevation; paint(); say('Vista inicial restaurada.'); };
  if (resetButton) resetButton.addEventListener('click', resetCamera);
  canvas.addEventListener('keydown', event => {
    if (failed) return;
    let handled = true;
    switch (event.key) {
      case 'ArrowLeft': azimuth -= .12; break;
      case 'ArrowRight': azimuth += .12; break;
      case 'ArrowUp': elevation = clamp(elevation + .08, -.12, .8); break;
      case 'ArrowDown': elevation = clamp(elevation - .08, -.12, .8); break;
      case 'Home': resetCamera(); break;
      case ' ': togglePlay(); break;
      default: handled = false;
    }
    if (handled) { event.preventDefault(); paint(); }
  });

  canvas.addEventListener('pointerdown', event => {
    if (failed || (event.pointerType === 'mouse' && event.button !== 0)) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, azimuth, elevation, touch: event.pointerType === 'touch', accepted: false };
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId || failed) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.accepted) {
      if (Math.hypot(dx, dy) < 9) return;
      if (drag.touch && Math.abs(dy) >= Math.abs(dx) * .85) { drag = null; return; }
      drag.accepted = true;
      try { canvas.setPointerCapture(event.pointerId); } catch (_) { /* Capture is optional. */ }
      section.classList.add('robot-is-dragging');
    }
    azimuth = drag.azimuth - dx * .008;
    if (!drag.touch) elevation = clamp(drag.elevation + dy * .006, -.12, .8);
    paint();
  });
  const endDrag = event => {
    if (!drag || drag.id !== event.pointerId) return;
    try { if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); } catch (_) { /* Capture is optional. */ }
    drag = null; section.classList.remove('robot-is-dragging');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', () => { drag = null; section.classList.remove('robot-is-dragging'); });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); contextLost = true;
    fallback('El 3D se ha detenido. Se conserva la vista estática del brazo.');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false; failed = false; gl = null; program = null; buffer = null; lineBuffer = null;
    for (const control of section.querySelectorAll('[data-robot-only]')) control.disabled = false;
    canvas.tabIndex = 0; canvas.removeAttribute('aria-hidden'); schedule();
  });

  const settingsObserver = new MutationObserver(records => {
    if (records.some(record => record.attributeName === 'class')) {
      if (globallyPaused()) { pendingPose = null; transitionFrom = null; }
      updateControls(); schedule();
    }
    if (records.some(record => record.attributeName === 'data-theme')) paint();
  });
  settingsObserver.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  new MutationObserver(() => { updateControls(); schedule(); }).observe(section, { attributes: true, attributeFilter: ['data-gallery-open'] });
  const preferenceChanged = event => {
    if (event.matches) { playRequested = false; pendingPose = null; transitionFrom = null; }
    updateControls(); schedule();
  };
  if (motionPreference.addEventListener) motionPreference.addEventListener('change', preferenceChanged);
  else if (motionPreference.addListener) motionPreference.addListener(preferenceChanged);
  document.addEventListener('visibilitychange', schedule);
  if ('ResizeObserver' in window) new ResizeObserver(() => { if (visible) { resize(); paint(); } }).observe(stage);
  else window.addEventListener('resize', () => { if (visible) { resize(); paint(); } }, { passive: true });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      const entry = entries[entries.length - 1]; visible = entry.isIntersecting;
      if (visible) paint(); schedule();
    }, { threshold: 0 });
    observer.observe(stage);
  } else { visible = true; paint(); schedule(); }
  window.addEventListener('pagehide', () => { destroyed = true; cancelAnimationFrame(frame); frame = 0; });
  window.addEventListener('pageshow', event => { if (event.persisted) { destroyed = false; schedule(); } });
  updateControls();
})();
