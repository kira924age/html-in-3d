import { DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, REVISION } from 'three';
import { Container, Fullscreen, Input, Text } from '@pmndrs/uikit';
import { GLYPHS, T } from './strings.js';

// ターミナル（ダークテーマ）の配色。cyan / magenta / acid はガラスの色やシーンのライトにも使う
export const COLORS = {
  bg: '#0d1117',
  titleBar: '#161b22',
  border: '#30363d',
  text: '#c9d1d9',
  dim: '#6e7681',
  green: '#3fb950',
  yellow: '#d29922',
  cyan: '#39c5cf',
  magenta: '#db61a2',
  acid: '#7ee787',
};

// パネルの 1px あたりのワールド単位（0.005 なら幅 440px のパネルが 2.2）
const PIXEL_SIZE = 0.005;
const FONT_SIZE = 13;

// --- 共通パーツ -------------------------------------------------------------

// ルート要素に渡すフォント設定（子要素へ継承される）
let fontProps = {};
let hoverCount = 0;
// uikit の入力欄にフォーカスがあるか（入力中はキーボードで移動しない）
let inputFocused = false;
let onHoverCountChange = () => {};

// パネルやボタンの上にポインタがあるか数えておき、カーソル表示とOrbitControlsの有効・無効に使う
const trackHover = () => ({
  onPointerEnter: () => onHoverCountChange((hoverCount += 1)),
  onPointerLeave: () => onHoverCountChange((hoverCount = Math.max(0, hoverCount - 1))),
});

function text(parent, value, props = {}) {
  // whiteSpace: 'pre' で、等幅の桁揃えに使う連続した空白を保つ（ただし行末の空白は詰められるので、間隔は margin で取る）
  const element = new Text({ text: value, whiteSpace: 'pre', ...props });
  parent.add(element);
  return element;
}

function row(parent, props = {}) {
  const element = new Container({ flexDirection: 'row', alignItems: 'center', ...props });
  parent.add(element);
  return element;
}

function comment(parent, value) {
  return text(parent, value, { color: COLORS.dim, marginTop: 10 });
}

// 等幅の文字で描く横棒グラフ: ████████░░░░░░░░
function asciiBar(ratio, cells) {
  const filled = Math.round(Math.min(1, Math.max(0, ratio)) * cells);
  return GLYPHS.barFull.repeat(filled) + GLYPHS.barEmpty.repeat(cells - filled);
}

// "[ ラベル ]" 形式のボタン。ホバーで色を反転させる（ターミナルの反転表示）
function button(parent, label, onClick, accent = COLORS.cyan) {
  const element = new Container({
    paddingX: 4,
    borderRadius: 2,
    color: accent,
    hover: { backgroundColor: accent, color: COLORS.bg },
    active: { backgroundColor: COLORS.text, color: COLORS.bg },
    onClick,
    ...trackHover(),
  });
  const labelText = text(element, `[ ${label} ]`);
  parent.add(element);
  return {
    labelText,
    // 選択中の項目は反転表示のままにする
    setSelected(selected) {
      element.setProperties(selected ? { backgroundColor: accent, color: COLORS.bg } : { backgroundColor: '#00000000', color: accent });
    },
  };
}

// 表パネルのすぐ後ろに置く、不透明な両面の板。1枚で2つの役割を持たせる。
// - 表から見たとき: uikit のパネルは深度を書き込まない（半透明扱いで描かれる）ため、後から描かれる奥の
//   ガラスなどがパネル越しに透けて見えてしまう。不透明な板は先に描かれて深度を書き込むので、奥の物体を隠せる
// - 裏から見たとき: uikit のパネルは片面描画で何も見えないので、この板が無地の背面になる
function rearPanel(front) {
  const mesh = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({ color: COLORS.bg, side: DoubleSide, toneMapped: false }),
  );
  mesh.position.z = -0.005;
  mesh.visible = false; // レイアウトが決まってサイズが分かるまでは隠す

  let lastSize;
  return {
    mesh,
    // 表のパネルは中身で高さが決まるので、レイアウト結果のサイズ（px）を板の大きさに反映する
    syncSize() {
      const size = front.size.value;
      if (size == null || (lastSize && lastSize[0] === size[0] && lastSize[1] === size[1])) return;
      lastSize = [...size];
      mesh.scale.set(size[0] * PIXEL_SIZE, size[1] * PIXEL_SIZE, 1);
      mesh.visible = true;
    },
  };
}

// ターミナルのウィンドウ: タイトルバーと本文
function terminalWindow(title, position, rotationY) {
  const root = new Container({
    pixelSize: PIXEL_SIZE,
    width: 440,
    flexDirection: 'column',
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    overflow: 'hidden',
    color: COLORS.text,
    fontSize: FONT_SIZE,
    lineHeight: '150%',
    ...fontProps,
    ...trackHover(),
  });

  const titleBar = row(root, { height: 30, justifyContent: 'center', backgroundColor: COLORS.titleBar, flexShrink: 0 });
  text(titleBar, title, { color: COLORS.dim, fontSize: 12 });

  const body = new Container({ flexDirection: 'column', paddingX: 16, paddingTop: 4, paddingBottom: 16 });
  root.add(body);

  // 表と背面の板をまとめて配置する
  const group = new Group();
  group.position.copy(position);
  group.rotation.y = rotationY;
  const rear = rearPanel(root);
  group.add(root, rear.mesh);

  return { root, body, group, rear };
}

// --- 左: 診断 ---------------------------------------------------------------

function createDiagnosticsWindow(position) {
  const win = terminalWindow(T.diagnostics.window, position, 0.38);
  const { body } = win;

  comment(body, T.diagnostics.stats);
  const field = (label) => {
    const line = row(body);
    text(line, label, { width: 104, color: COLORS.dim, flexShrink: 0 });
    return line;
  };
  // 時間はバーでも見せる（フレーム間隔は 33.3ms = 30fps を満タンとする）
  const timeField = (label, color) => {
    const line = field(label);
    const bar = text(line, '', { color, marginRight: 8 });
    const value = text(line, '');
    return { bar, value };
  };
  const interval = timeField(T.diagnostics.interval, COLORS.cyan);
  const cpu = timeField(T.diagnostics.cpu, COLORS.green);
  const calls = text(field(T.diagnostics.calls), '');
  const triangles = text(field(T.diagnostics.triangles), '');
  const resources = text(field(T.diagnostics.resources), '', { flexShrink: 1 });

  comment(body, T.diagnostics.frametime);
  const spark = text(body, '', { color: COLORS.cyan, letterSpacing: 1 });
  const frameSummary = text(body, '', { color: COLORS.dim });

  comment(body, T.diagnostics.log);
  // column-reverse にして、後から追加した行ほど上（＝新しい順）に並べる
  const logList = new Container({
    height: 130,
    flexDirection: 'column-reverse',
    justifyContent: 'flex-end',
    overflow: 'scroll',
    scrollbarColor: COLORS.border,
    scrollbarWidth: 4,
  });
  body.add(logList);

  let lastUpdate = 0;
  return {
    ...win,
    log(message, color = COLORS.text) {
      const line = row(logList, { flexShrink: 0, alignItems: 'flex-start' });
      text(line, new Date().toLocaleTimeString('en-GB'), { color: COLORS.dim, marginRight: 12, flexShrink: 0 });
      text(line, message, { color, flexShrink: 1 });
      const rows = logList.children.filter((child) => child instanceof Container);
      if (rows.length > 60) logList.remove(rows[0]);
    },
    clearLog() {
      for (const child of logList.children.filter((c) => c instanceof Container)) logList.remove(child);
    },
    // 数字が読める速さにするため、表示の更新は 4 回/秒に間引く（計測自体は毎フレーム）
    update(time, frame) {
      if (time - lastUpdate < 250) return;
      lastUpdate = time;
      interval.bar.setProperties({ text: asciiBar(frame.averageMs / 33.3, 16) });
      interval.value.setProperties({ text: `${frame.averageMs.toFixed(1)} ms` });
      cpu.bar.setProperties({ text: asciiBar(frame.cpuMs / 33.3, 16) });
      cpu.value.setProperties({ text: `${frame.cpuMs.toFixed(1)} ms` });
      calls.setProperties({ text: frame.calls.toLocaleString('en-US') });
      triangles.setProperties({ text: frame.triangles.toLocaleString('en-US') });
      resources.setProperties({ text: T.diagnostics.resourcesValue(frame.geometries, frame.textures, frame.programs) });
      // 直近のフレーム間隔の推移（33.3ms で最大の高さ）
      spark.setProperties({
        text: frame.history.map((ms) => GLYPHS.spark[Math.min(7, Math.floor((ms / 33.3) * 8))]).join(''),
      });
      frameSummary.setProperties({ text: T.diagnostics.frameSummary(frame.averageMs.toFixed(1), frame.maxMs.toFixed(1)) });
    },
  };
}

// --- 右: クリスタル操作 -----------------------------------------------------

function createControlWindow(position, actions) {
  const win = terminalWindow(T.control.window, position, -0.38);
  const { body } = win;

  comment(body, T.control.inspect);
  const field = (label) => {
    const line = row(body, { alignItems: 'flex-start' });
    text(line, label, { width: 92, color: COLORS.dim, flexShrink: 0 });
    return text(line, '-', { flexShrink: 1 });
  };
  const fileValue = field(T.control.file);
  const meshesValue = field(T.control.meshes);
  const materialsValue = field(T.control.materials);
  const opacityValue = field(T.control.opacity);
  const rotationValue = field(T.control.rotation);
  const cameraValue = field(T.control.camera);

  comment(body, T.control.tintComment);
  const tintRow = row(body, { gap: 6 });
  const tintButtons = Object.fromEntries(
    Object.keys(T.tints).map((name) => [name, button(tintRow, T.tints[name], () => actions.setTint(name), COLORS[name])]),
  );

  comment(body, T.control.opacityComment);
  const opacityRow = row(body, { gap: 6 });
  button(opacityRow, '-', () => actions.changeOpacity(-0.08));
  const opacityBar = text(opacityRow, '', { color: COLORS.cyan });
  button(opacityRow, '+', () => actions.changeOpacity(0.08));

  comment(body, T.control.actionComment);
  const actionRow = row(body, { gap: 6 });
  const spinButton = button(actionRow, T.control.spinStop, () => actions.toggleSpin(), COLORS.yellow);
  button(actionRow, T.control.scan, () => actions.scan(), COLORS.green);

  // 最下段のプロンプト。uikit の Input をそのまま「コマンド入力欄」にする
  const promptRow = row(body, { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderColor: COLORS.border });
  text(promptRow, T.control.prompt, { color: COLORS.green, fontWeight: 'bold', marginRight: 8 });
  let command = '';
  const input = new Input({
    flexGrow: 1,
    value: '',
    caretColor: COLORS.text,
    caretWidth: 7, // ブロック型のカーソル
    selectionColor: COLORS.border,
    onValueChange: (value) => {
      command = value;
      input.setProperties({ value });
    },
    onFocusChange: (focused) => (inputFocused = focused),
    ...trackHover(),
  });
  promptRow.add(input);
  // uikit の Input には送信イベントがないので、フォーカス中の Enter を拾って実行する
  window.addEventListener('keydown', (e) => {
    if (!inputFocused || e.key !== 'Enter' || command.trim() === '') return;
    actions.runCommand(command.trim());
    command = '';
    input.setProperties({ value: '' });
  });

  let lastUpdate = 0;
  let spin = true;
  return {
    ...win,
    sync(state) {
      for (const [name, b] of Object.entries(tintButtons)) b.setSelected(name === state.tint);
      opacityValue.setProperties({ text: state.opacity.toFixed(2) });
      opacityBar.setProperties({ text: asciiBar(state.opacity / 0.9, 22), color: COLORS[state.tint] });
      spinButton.labelText.setProperties({ text: `[ ${state.spin ? T.control.spinStop : T.control.spinStart} ]` });
      spin = state.spin;
    },
    // 読み込んだGLBの中身（describeModel の結果）
    setModel(model) {
      fileValue.setProperties({ text: T.control.fileValue((model.bytes / 1024).toFixed(1), Math.round(model.loadMs)) });
      meshesValue.setProperties({
        text: T.control.meshesValue(model.meshes, model.vertices.toLocaleString('en-US'), model.triangles.toLocaleString('en-US')),
      });
      materialsValue.setProperties({ text: [...model.materials].map(([type, count]) => `${type} x${count}`).join(' / ') });
    },
    update(time, { crystalAngle, cameraDistance }) {
      if (time - lastUpdate < 250) return;
      lastUpdate = time;
      rotationValue.setProperties({ text: T.control.rotationValue(spin, Math.round(crystalAngle)), color: spin ? COLORS.text : COLORS.yellow });
      cameraValue.setProperties({ text: cameraDistance.toFixed(2) });
    },
  };
}

// --- 画面下の tmux 風ステータスバー ------------------------------------------

function createStatusBar(renderer) {
  const hud = new Fullscreen(renderer, {
    distanceToCamera: 0.5,
    pointerEvents: 'none',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    fontSize: 12,
    color: COLORS.text,
    ...fontProps,
  });

  const bar = row(hud, { height: 24, backgroundColor: COLORS.titleBar });
  const session = row(bar, { height: '100%', paddingX: 10, backgroundColor: COLORS.green });
  text(session, 'uikit', { color: COLORS.bg, fontWeight: 'bold' });
  text(bar, `three.js r${REVISION} / WebGL`, { color: COLORS.dim, marginLeft: 12 });
  bar.add(new Container({ flexGrow: 1 }));
  text(bar, T.hud.hint, { color: COLORS.dim, marginRight: 12 });
  const fps = text(bar, '', { color: COLORS.text, paddingX: 10 });
  const clockArea = row(bar, { height: '100%', paddingX: 10, backgroundColor: COLORS.cyan });
  const clock = text(clockArea, '', { color: COLORS.bg, fontWeight: 'bold' });

  let lastSecond = -1;
  return {
    root: hud,
    // fps は createFrameStats の平均フレーム間隔から出す。表示は1秒ごとに更新する
    update(frame) {
      const now = new Date();
      if (now.getSeconds() === lastSecond) return;
      lastSecond = now.getSeconds();
      clock.setProperties({ text: now.toLocaleTimeString('en-GB') });
      fps.setProperties({ text: `${Math.round(1000 / Math.max(frame.averageMs, 1))} fps` });
    },
  };
}

// --- 組み立て --------------------------------------------------------------

export function createUI({ scene, camera, renderer, positions, actions, onHoverChange, fontFamilies }) {
  onHoverCountChange = onHoverChange;
  fontProps = { fontFamilies, fontFamily: Object.keys(fontFamilies)[0] };

  const diagnostics = createDiagnosticsWindow(positions.left);
  const control = createControlWindow(positions.right, actions);
  const statusBar = createStatusBar(renderer);

  scene.add(diagnostics.group, control.group);
  camera.add(statusBar.root);

  const rears = [diagnostics.rear, control.rear];
  const roots = [diagnostics.root, control.root, statusBar.root];
  return {
    log: diagnostics.log,
    clearLog: diagnostics.clearLog,
    sync: control.sync,
    setModel: control.setModel,
    // 文字入力中か、ポインタがUIの上にあるか（移動・見回しの操作と取り合わないようにする）
    busy: () => ({ typing: inputFocused, hovering: hoverCount > 0 }),
    // measured: { frame: createFrameStats の snapshot, crystalAngle, cameraDistance }
    update(time, delta, measured) {
      diagnostics.update(time, measured.frame);
      control.update(time, measured);
      statusBar.update(measured.frame);
      for (const rear of rears) rear.syncSize();
      // uikit はルート要素ごとに毎フレーム update(delta) を呼ぶ
      for (const root of roots) root.update(delta);
    },
  };
}
