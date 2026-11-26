import { Box3, Vector3 } from 'three';

// 1フレームごとの実測値を集める。UIに表示する数字はすべてここから取る
export function createFrameStats(renderer, historyLength = 40) {
  // 1フレームで render が複数回呼ばれても合計を数えられるよう、自動リセットを止めてフレームの頭でリセットする
  renderer.info.autoReset = false;

  const intervals = [];
  let cpuStart = 0;
  let previousTime = null;

  const snapshot = {
    averageMs: 0,
    maxMs: 0,
    cpuMs: 0, // このフレームの JavaScript 側の処理時間（GPUの処理時間は含まない）
    calls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    programs: 0,
    history: intervals,
  };

  return {
    snapshot,
    begin() {
      renderer.info.reset();
      cpuStart = performance.now();
    },
    end(time) {
      snapshot.cpuMs = performance.now() - cpuStart;
      if (previousTime != null) {
        intervals.push(time - previousTime);
        if (intervals.length > historyLength) intervals.shift();
      }
      previousTime = time;
      snapshot.averageMs = intervals.reduce((sum, v) => sum + v, 0) / Math.max(1, intervals.length);
      snapshot.maxMs = Math.max(0, ...intervals);
      const { render, memory, programs } = renderer.info;
      snapshot.calls = render.calls;
      snapshot.triangles = render.triangles;
      snapshot.geometries = memory.geometries;
      snapshot.textures = memory.textures;
      snapshot.programs = programs?.length ?? 0;
    },
  };
}

// 読み込んだGLBの中身を数える
export function describeModel(root, bytes, loadMs) {
  let meshes = 0;
  let vertices = 0;
  let triangles = 0;
  const materials = new Map();
  root.traverse((object) => {
    if (!object.isMesh) return;
    meshes += 1;
    const geometry = object.geometry;
    vertices += geometry.attributes.position.count;
    triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
    const type = object.material.type.replace(/^Mesh|Material$/g, '');
    materials.set(type, (materials.get(type) ?? 0) + 1);
  });
  return { bytes, loadMs, meshes, vertices, triangles, materials };
}

// オブジェクトの外形（ワールド座標でのバウンディングボックスの寸法）
export function measureSize(object) {
  return new Box3().setFromObject(object).getSize(new Vector3());
}
