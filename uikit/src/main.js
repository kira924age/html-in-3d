import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { reversePainterSortStable } from '@pmndrs/uikit';
import { forwardHtmlEvents } from '@pmndrs/pointer-events';
import { COLORS, createUI } from './ui.js';
import { loadMonoFont } from './fonts.js';
import { COMMANDS, T } from './strings.js';
import { createFrameStats, describeModel, measureSize } from './metrics.js';
import { createNavigation } from './navigation.js';
import { createOverlay } from './overlay.js';

// --- レンダラー・シーン ------------------------------------------------------

const canvas = document.getElementById('root');
// ブルームなどのポストエフェクトは使わず、直接描く（高解像度の画面ではブルームだけでGPU時間の大半を使っていた）。
// 直接描くので antialias: true もそのまま効く
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
// uikit に必要な設定: スクロール領域のクリッピングと、UIの描画順を決めるソート
renderer.localClippingEnabled = true;
renderer.setTransparentSort(reversePainterSortStable);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111a2b);
scene.fog = new THREE.FogExp2(0x111a2b, 0.03);

// ガラスの反射用の環境マップ
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
camera.position.set(0, 1.7, 5.4);
scene.add(camera); // 画面に貼り付くHUD（Fullscreen）をカメラの子にするため

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.35, 0);
controls.enableDamping = true;
controls.minDistance = 3;
controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI * 0.55;

const magentaLight = new THREE.PointLight(COLORS.magenta, 12, 8);
magentaLight.position.set(-2, 3, 2);
const cyanLight = new THREE.PointLight(COLORS.cyan, 12, 8);
cyanLight.position.set(2, 0.5, 2);
scene.add(magentaLight, cyanLight);

// --- 背景: グリッド床・足元の光 ------------------------------------

const grid = new THREE.GridHelper(40, 60, COLORS.cyan, COLORS.cyan);
grid.material.transparent = true;
grid.material.opacity = 0.25;
scene.add(grid);

// 中心から外へ透明になっていく丸いグラデーション（加算合成で「光」として使う）
function radialTexture(inner, middle) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, middle);
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
const floorGlow = new THREE.Mesh(
  new THREE.PlaneGeometry(4, 4),
  new THREE.MeshBasicMaterial({
    map: radialTexture('rgba(0, 240, 255, 0.9)', 'rgba(0, 120, 255, 0.25)'),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
floorGlow.rotation.x = -Math.PI / 2;
floorGlow.position.y = 0.01;
scene.add(floorGlow);

// --- 透明なGLB --------------------------------------------------------------

const crystalAnchor = new THREE.Group();
crystalAnchor.position.set(0, 1.35, 0.3);
scene.add(crystalAnchor);

let crystal = null;
const glassMaterials = [];
let coreMaterial = null;
let ring = null;

// UIの準備ができてから読み込む（読み込み完了とファイルの中身をUIに出すため）。
// ファイルサイズと読み込み時間を測りたいので、fetch で取得してから GLTFLoader.parseAsync に渡す
async function loadCrystal() {
  const start = performance.now();
  const buffer = await (await fetch(`${import.meta.env.BASE_URL}models/crystal.glb`)).arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  const loadMs = performance.now() - start;
  crystal = gltf.scene;
  crystal.scale.setScalar(0.8);
  crystal.traverse((object) => {
    if (!object.isMesh) return;
    // 半透明のガラスはUIより後に描く（uikit の透明ソートはUI同士の順序を優先するため）
    object.renderOrder = 10;
    if (object.material.transparent) {
      object.material.depthWrite = false;
      glassMaterials.push(object.material);
    } else {
      coreMaterial = object.material;
    }
    if (object.name === 'Ring') ring = object;
  });
  crystalAnchor.add(crystal);
  coreGlow.visible = true;
  applyState();
  ui.setModel(describeModel(crystal, buffer.byteLength, loadMs));
  ui.log(T.log.loaded((buffer.byteLength / 1024).toFixed(1), Math.round(loadMs)), COLORS.acid);
}

// コアの光。ブルーム（ポストエフェクト）は重いので使わず、加算合成のスプライトを重ねて光って見せる
const coreGlow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: radialTexture('rgba(255, 90, 230, 0.9)', 'rgba(255, 40, 200, 0.22)'),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
coreGlow.scale.setScalar(1.3);
coreGlow.renderOrder = 12; // ガラスより後に描いて、中から光が漏れて見えるようにする
coreGlow.visible = false; // クリスタルを読み込むまでは出さない
crystalAnchor.add(coreGlow);

// スキャン演出: クリスタルを下から上へ走る光のリング（SCAN_MS かけて走り、終わったら外形を計測する）
const SCAN_MS = 1500;
const scanRing = new THREE.Mesh(
  new THREE.RingGeometry(0.9, 1.05, 96),
  new THREE.MeshBasicMaterial({ color: COLORS.acid, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
);
scanRing.rotation.x = -Math.PI / 2;
scanRing.renderOrder = 11;
crystalAnchor.add(scanRing);

// --- 状態と操作 -------------------------------------------------------------

const state = { tint: 'cyan', opacity: 0.28, spin: true, scanStart: -Infinity };

function applyState() {
  for (const material of glassMaterials) {
    material.color.set(COLORS[state.tint]);
    material.opacity = state.opacity;
  }
  ui.sync(state);
}

const actions = {
  setTint(name) {
    state.tint = name;
    applyState();
    ui.log(T.log.tint(T.tints[name]), COLORS[name]);
  },
  changeOpacity(delta) {
    actions.setOpacity(state.opacity + delta);
  },
  setOpacity(value) {
    state.opacity = THREE.MathUtils.clamp(value, 0.04, 0.9);
    applyState();
    ui.log(T.log.opacity(state.opacity.toFixed(2)));
  },
  toggleSpin() {
    state.spin = !state.spin;
    applyState();
    ui.log(state.spin ? T.control.spinStart : T.log.spinOff, state.spin ? COLORS.text : COLORS.yellow);
  },
  // スキャン演出のあと、クリスタルの実際の外形（バウンディングボックスの寸法）をログに出す
  scan() {
    if (!crystal) return;
    state.scanStart = performance.now();
    ui.log(T.log.scanStart, COLORS.acid);
    setTimeout(() => {
      const size = measureSize(crystal);
      ui.log(T.log.scanDone(size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2)), COLORS.acid);
    }, SCAN_MS);
  },
  setCameraMode(mode) {
    navigation.setMode(mode);
    updateControlsEnabled();
    overlay.setMode(mode);
    ui?.log(T.log.cameraMode(T.cameraModes[mode]), COLORS.cyan);
  },
  runCommand(command) {
    const [name, arg] = command.toLowerCase().split(/\s+/);
    ui.log(`$ ${command}`, COLORS.green);
    const tint = Object.keys(T.tints).find((key) => key === arg || T.tints[key] === arg);
    const opacity = Number.parseFloat(arg);
    if (COMMANDS.scan.includes(name)) actions.scan();
    else if (COMMANDS.spin.includes(name)) actions.toggleSpin();
    else if (COMMANDS.tint.includes(name) && tint) actions.setTint(tint);
    else if (COMMANDS.opacity.includes(name) && Number.isFinite(opacity)) actions.setOpacity(opacity);
    else if (COMMANDS.clear.includes(name)) ui.clearLog();
    else if (COMMANDS.help.includes(name)) T.log.help.forEach((line) => ui.log(line, COLORS.dim));
    else ui.log(T.log.unknown(name), COLORS.magenta);
  },
};

// --- UI ---------------------------------------------------------------------

let ui = null;

// OrbitControls は Orbit モードで、かつポインタがUIの上にないときだけ有効にする（UIの上ではクリックやドラッグをUIに渡す）
function updateControlsEnabled() {
  const hovering = ui?.busy().hovering ?? false;
  controls.enabled = navigation.mode === 'orbit' && !hovering;
  canvas.style.cursor = hovering ? 'pointer' : 'grab';
}

// フォントのMSDF化が終わってからUIを組み立てる（それまではシーンだけ描く）
loadMonoFont().then(({ fontFamilies, stats }) => {
  ui = createUI({
    scene,
    camera,
    renderer,
    fontFamilies,
    positions: { left: new THREE.Vector3(-2.05, 1.45, -0.2), right: new THREE.Vector3(2.05, 1.45, -0.2) },
    actions,
    onHoverChange: updateControlsEnabled,
  });
  ui.sync(state);
  ui.log(T.log.booted, COLORS.cyan);
  ui.log(T.log.font(stats.chars, Math.round(stats.ms), stats.width, stats.height));
  ui.log(T.log.loading);
  loadCrystal().catch((error) => ui.log(error.message, COLORS.magenta));
  document.getElementById('loading').remove();
}).catch((error) => {
  console.error(error);
  document.getElementById('loading').textContent = `Failed to start: ${error.message}`;
});

// three.js にはイベントシステムがないので、DOMのポインタイベントをシーンへ転送する。
// 既定ではイベントをフレーム単位でまとめて処理するが、フレームが間引かれると古い位置で判定されるので即時処理にする
const pointerEvents = forwardHtmlEvents(canvas, camera, scene, { batchEvents: false });

// 視点の移動（WASD・矢印キー・画面のスティック）と、Orbit / First Person の切り替え
const navigation = createNavigation({
  camera,
  controls,
  canvas,
  isUiBusy: () => ui?.busy() ?? { typing: false, hovering: false },
});
const overlay = createOverlay({
  onModeChange: (mode) => actions.setCameraMode(mode),
  onStick: (x, y) => navigation.setStick(x, y),
});

// UIの上では OrbitControls を止めているので、トラックパッドのピンチ（ctrl+ホイール）がページのズームにならないよう抑える
canvas.addEventListener('wheel', (e) => e.ctrlKey && e.preventDefault(), { passive: false });

function resize() {
  const pixelRatio = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();

  // 縦長の画面でも左右のパネル（x = ±3.1 あたりまで）が収まるよう、カメラを引く（Orbit のときだけ）
  if (navigation.mode !== 'orbit') return;
  const halfFovTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fitDistance = Math.max(5.4, 3.3 / (halfFovTan * camera.aspect));
  controls.maxDistance = Math.max(9, fitDistance + 2);
  const offset = camera.position.clone().sub(controls.target);
  camera.position.copy(controls.target).add(offset.setLength(Math.max(offset.length(), fitDistance)));
}
resize();
addEventListener('resize', resize);

// --- ループ -----------------------------------------------------------------

const frameStats = createFrameStats(renderer);
const measured = { frame: frameStats.snapshot, crystalAngle: 0, cameraDistance: 0 };

let previous;
renderer.setAnimationLoop((time) => {
  frameStats.begin();
  const delta = previous == null ? 0 : time - previous;
  previous = time;
  const t = time / 1000;

  if (crystal) {
    if (state.spin) crystal.rotation.y += delta * 0.0004;
    crystal.position.y = Math.sin(t * 1.2) * 0.08;
    if (ring) ring.rotation.z = t * 0.6;
    if (coreMaterial) coreMaterial.emissiveIntensity = 1.8 + Math.sin(t * 3) * 0.9;
    coreGlow.position.y = crystal.position.y;
    coreGlow.material.opacity = 0.75 + Math.sin(t * 3) * 0.25;
  }

  const scanProgress = (time - state.scanStart) / SCAN_MS;
  if (scanProgress >= 0 && scanProgress <= 1) {
    scanRing.position.y = -1.3 + scanProgress * 2.6;
    scanRing.material.opacity = Math.sin(scanProgress * Math.PI);
  } else {
    scanRing.material.opacity = 0;
  }

  floorGlow.material.opacity = 0.7 + Math.sin(t * 2) * 0.15;

  navigation.update(delta);
  pointerEvents.update();
  measured.crystalAngle = crystal ? THREE.MathUtils.radToDeg(crystal.rotation.y) % 360 : 0;
  measured.cameraDistance = camera.position.distanceTo(crystalAnchor.position);
  ui?.update(time, delta, measured);
  renderer.render(scene, camera);
  frameStats.end(time);
});
