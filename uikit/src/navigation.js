import { MathUtils, Vector2, Vector3 } from 'three';

const SPEED = 3; // ワールド単位/秒（Shift を押している間は2倍）
const LOOK_SPEED = 0.004; // ラジアン/px（First Person のドラッグで見回す速さ）
const PAN_SPEED = 0.006; // ワールド単位/px（First Person の右ドラッグで平行移動する速さ）
const WHEEL_SPEED = 0.004; // ワールド単位/ホイール1単位（First Person で前後に進む速さ）
const MAX_PITCH = MathUtils.degToRad(85);
const EYE_HEIGHT = 1.6;
const AREA_RADIUS = 14; // これより遠くへは行けない
const MIN_HEIGHT = 0.2; // 床より下には潜らない

// キーと入力の向き: x が右、y が前
const MOVE_KEYS = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

// 視点の移動。
// - Orbit: OrbitControls で注視点の周りを回る
// - First Person: カメラ自体を回す（ドラッグで見回す）。右ドラッグで上下左右に平行移動、ホイールで前後に進む
// どちらのモードでも、WASD・矢印キー・スティックでは見ている方向を基準に動く（上を向いて W を押せば上がる）。
// Orbit では注視点も一緒に動かすので、見え方を保ったまま平行移動する
// UIパネルの上でのドラッグやホイールはUIに渡し、UIの入力欄に文字を打っている間はキーで動かない
export function createNavigation({ camera, controls, canvas, isUiBusy }) {
  let mode = 'orbit';
  let yaw = 0;
  let pitch = 0;
  const held = new Set();
  const stick = new Vector2(); // 画面のスティック: x が右、y が前（-1〜1）
  let drag = null; // First Person のドラッグ中: { id, x, y, pan }

  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || isUiBusy().typing) return;
    held.add(e.code);
    if (e.code in MOVE_KEYS) e.preventDefault();
  });
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => held.clear());

  canvas.addEventListener('pointerdown', (e) => {
    if (mode !== 'firstPerson' || drag || isUiBusy().hovering) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, pan: e.pointerType === 'mouse' && e.button === 2 };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.pan) {
      // 右ドラッグ: ポインタに景色がついてくる向きに、カメラの左右・上下へ平行移動する
      const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      camera.position.addScaledVector(right, -dx * PAN_SPEED).addScaledVector(up, dy * PAN_SPEED);
    } else {
      yaw -= dx * LOOK_SPEED;
      pitch = MathUtils.clamp(pitch - dy * LOOK_SPEED, -MAX_PITCH, MAX_PITCH);
    }
  });
  const endDrag = (e) => {
    if (drag?.id === e.pointerId) drag = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  // First Person では右クリックをメニューではなく平行移動に使う
  canvas.addEventListener('contextmenu', (e) => mode === 'firstPerson' && e.preventDefault());
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (mode !== 'firstPerson' || isUiBusy().hovering) return;
      e.preventDefault();
      camera.position.addScaledVector(camera.getWorldDirection(new Vector3()), -e.deltaY * WHEEL_SPEED);
    },
    { passive: false },
  );

  const input = new Vector2();
  const forward = new Vector3();
  const right = new Vector3();
  const move = new Vector3();

  // 行ける範囲に収める（水平方向は半径 AREA_RADIUS、高さは床より上）
  function keepInArea() {
    const horizontal = Math.hypot(camera.position.x, camera.position.z);
    if (horizontal > AREA_RADIUS) {
      const back = (horizontal - AREA_RADIUS) / horizontal;
      move.set(-camera.position.x * back, 0, -camera.position.z * back);
      camera.position.add(move);
      if (mode === 'orbit') controls.target.add(move);
    }
    // 床より下には潜らない。Orbit では注視点も同じだけ戻して、見え方を保つ
    const below = MIN_HEIGHT - camera.position.y;
    if (below > 0) {
      camera.position.y += below;
      if (mode === 'orbit') controls.target.y += below;
    }
  }

  return {
    get mode() {
      return mode;
    },
    setMode(next) {
      if (next === mode) return;
      mode = next;
      drag = null;
      camera.getWorldDirection(forward);
      if (mode === 'firstPerson') {
        // 今見ている向きを引き継いで、目の高さに下ろす
        yaw = Math.atan2(-forward.x, -forward.z);
        pitch = Math.asin(MathUtils.clamp(forward.y, -1, 1));
        camera.position.y = EYE_HEIGHT;
      } else {
        // 今見ている方向の少し先を、回転の中心にする
        controls.target.copy(camera.position).addScaledVector(forward, 4);
        controls.target.y = MathUtils.clamp(controls.target.y, 0.5, 3);
      }
    },
    // 画面のスティックから: x が右、y が前（-1〜1、離したら 0, 0）
    setStick(x, y) {
      stick.set(x, y);
    },
    update(deltaMs) {
      input.set(0, 0);
      if (!isUiBusy().typing) {
        for (const code of held) if (MOVE_KEYS[code]) input.add(new Vector2(...MOVE_KEYS[code]));
      }
      if (input.lengthSq() > 1) input.normalize();
      input.add(stick);
      if (input.lengthSq() > 1) input.normalize();

      if (input.lengthSq() > 0) {
        const fast = held.has('ShiftLeft') || held.has('ShiftRight');
        const step = (SPEED * (fast ? 2 : 1) * deltaMs) / 1000;
        camera.getWorldDirection(forward);
        right.set(1, 0, 0).applyQuaternion(camera.quaternion);
        move.set(0, 0, 0).addScaledVector(forward, input.y * step).addScaledVector(right, input.x * step);
        camera.position.add(move);
        if (mode === 'orbit') controls.target.add(move);
      }
      keepInArea();

      if (mode === 'orbit') {
        controls.update();
      } else {
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
      }
    },
  };
}
