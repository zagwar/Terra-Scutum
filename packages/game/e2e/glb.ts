/**
 * A tiny glTF binary file (.glb), made in code for the tests (F133): a cube
 * standing on the ground, `size` units wide and tall. It stands in for a
 * real model file to prove that a model entry can point at a file instead
 * of a generator.
 */
export function cubeGlb(size = 10): Uint8Array {
  const h = size / 2;
  // 24 corners (4 per face, so each face has its own normal), 12 triangles.
  const faces: [number[], number[][]][] = [
    [
      [1, 0, 0],
      [
        [h, 0, -h],
        [h, size, -h],
        [h, size, h],
        [h, 0, h],
      ],
    ],
    [
      [-1, 0, 0],
      [
        [-h, 0, h],
        [-h, size, h],
        [-h, size, -h],
        [-h, 0, -h],
      ],
    ],
    [
      [0, 1, 0],
      [
        [-h, size, -h],
        [-h, size, h],
        [h, size, h],
        [h, size, -h],
      ],
    ],
    [
      [0, -1, 0],
      [
        [-h, 0, h],
        [-h, 0, -h],
        [h, 0, -h],
        [h, 0, h],
      ],
    ],
    [
      [0, 0, 1],
      [
        [h, 0, h],
        [h, size, h],
        [-h, size, h],
        [-h, 0, h],
      ],
    ],
    [
      [0, 0, -1],
      [
        [-h, 0, -h],
        [-h, size, -h],
        [h, size, -h],
        [h, 0, -h],
      ],
    ],
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  faces.forEach(([normal, corners], face) => {
    for (const corner of corners) {
      positions.push(...corner);
      normals.push(...normal);
    }
    const base = face * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const positionBytes = new Float32Array(positions);
  const normalBytes = new Float32Array(normals);
  const indexBytes = new Uint16Array(indices);
  const binLength = positionBytes.byteLength + normalBytes.byteLength + indexBytes.byteLength;
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.8, 0.2, 0.2, 1] } }],
    buffers: [{ byteLength: binLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength },
      { buffer: 0, byteOffset: positionBytes.byteLength, byteLength: normalBytes.byteLength },
      {
        buffer: 0,
        byteOffset: positionBytes.byteLength + normalBytes.byteLength,
        byteLength: indexBytes.byteLength,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 24,
        type: 'VEC3',
        min: [-h, 0, -h],
        max: [h, size, h],
      },
      { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' },
    ],
  };
  const pad = (length: number) => (4 - (length % 4)) % 4;
  let jsonText = JSON.stringify(json);
  jsonText += ' '.repeat(pad(jsonText.length));
  const jsonBytes = new TextEncoder().encode(jsonText);
  const binPadded = binLength + pad(binLength);
  const total = 12 + 8 + jsonBytes.length + 8 + binPadded;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(jsonBytes, 20);
  let offset = 20 + jsonBytes.length;
  view.setUint32(offset, binPadded, true);
  view.setUint32(offset + 4, 0x004e4942, true); // "BIN"
  offset += 8;
  out.set(new Uint8Array(positionBytes.buffer), offset);
  out.set(new Uint8Array(normalBytes.buffer), offset + positionBytes.byteLength);
  out.set(
    new Uint8Array(indexBytes.buffer),
    offset + positionBytes.byteLength + normalBytes.byteLength,
  );
  return out;
}
