import { T } from './strings.js';

// 画面に重ねる2DのHTML（視点モードの切り替えと、移動用のスティック）。
// 3D空間のUIは uikit で描いているが、この2つは画面に固定の操作部品なので、普通のDOMで作る
export function createOverlay({ onModeChange, onStick }) {
  // 右上: Orbit / First Person の切り替え
  const modeButtons = [...document.querySelectorAll('#mode-switch button')];
  for (const button of modeButtons) {
    button.textContent = T.cameraModes[button.dataset.mode];
    button.addEventListener('click', () => {
      onModeChange(button.dataset.mode);
      // キー入力がボタンではなくシーン（WASD・矢印キー）に行くよう、フォーカスを外す
      button.blur();
    });
  }

  // 左下: リングの中のノブをドラッグして動かすスティック。リングの縁まで倒すと最高速、離すと止まる
  const stick = document.getElementById('stick');
  const knob = stick.querySelector('span');
  let active = null;
  const move = (e) => {
    const rect = stick.getBoundingClientRect();
    const radius = rect.width / 2;
    let x = (e.clientX - rect.left - radius) / radius;
    let y = (e.clientY - rect.top - radius) / radius;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    knob.style.transform = `translate(${x * radius * 0.6}px, ${y * radius * 0.6}px)`;
    onStick(x, -y); // 画面の上が「前」
  };
  const release = (e) => {
    if (e.pointerId !== active) return;
    active = null;
    knob.style.transform = '';
    onStick(0, 0);
  };
  stick.addEventListener('pointerdown', (e) => {
    if (active !== null) return;
    active = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    move(e);
  });
  stick.addEventListener('pointermove', (e) => e.pointerId === active && move(e));
  stick.addEventListener('pointerup', release);
  stick.addEventListener('pointercancel', release);

  return {
    setMode(mode) {
      for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    },
  };
}
