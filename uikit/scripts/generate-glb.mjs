// デモ用の「透明なクリスタル」GLBを生成する。
// three.js の GLTFExporter をNodeで動かし、半透明の MeshPhysicalMaterial（clearcoat・iridescence付き）を
// glTF の alphaMode: BLEND + KHR_materials_* 拡張として書き出す。
import { writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// GLTFExporter はバイナリ（GLB）を書き出すときにブラウザの FileReader を使うので、Nodeでは最低限の代用品を用意する
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
};

const glass = (color, opacity) =>
  new THREE.MeshPhysicalMaterial({
    color,
    transparent: true,
    opacity,
    roughness: 0.05,
    metalness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    iridescence: 1,
    iridescenceIOR: 1.3,
    iridescenceThicknessMinimum: 200,
    iridescenceThicknessMaximum: 600,
    side: THREE.DoubleSide,
  });

const root = new THREE.Group();
root.name = 'Crystal';

// 縦長の多面体（Polyhedron系はもともと非インデックスなので、法線を計算し直すだけでファセットになる）
const shellGeometry = new THREE.OctahedronGeometry(1, 1);
shellGeometry.scale(0.75, 1.25, 0.75);
shellGeometry.computeVertexNormals();
const shell = new THREE.Mesh(shellGeometry, glass(0x9feaff, 0.28));
shell.name = 'CrystalShell';
root.add(shell);

// 中で光るコア（不透明・発光。ブルームで光らせる）
const coreGeometry = new THREE.IcosahedronGeometry(0.28, 0);
coreGeometry.computeVertexNormals();
const core = new THREE.Mesh(
  coreGeometry,
  new THREE.MeshStandardMaterial({ color: 0xff2bd6, emissive: 0xff2bd6, emissiveIntensity: 3, roughness: 0.4 }),
);
core.name = 'Core';
root.add(core);

// 周回するガラスのリング。細い管なので断面は8分割、円周は64分割で十分なめらかに見える
const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.035, 8, 64), glass(0x7df9ff, 0.4));
ring.name = 'Ring';
ring.rotation.x = Math.PI / 2.4;
root.add(ring);

// テクスチャを貼らないので、UV座標は書き出さない（ファイルが小さくなる）
root.traverse((object) => object.isMesh && object.geometry.deleteAttribute('uv'));

const glb = await new GLTFExporter().parseAsync(root, { binary: true });
const out = new URL('../public/models/crystal.glb', import.meta.url);
await writeFile(out, Buffer.from(glb));
console.log(`wrote ${out.pathname} (${glb.byteLength} bytes)`);
