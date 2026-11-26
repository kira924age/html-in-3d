// UIに出す文言。フォントは「ここに出てくる文字＋ASCII＋ターミナル用の記号」だけをMSDF化するので、文言はすべてここに集める
export const T = {
  hud: {
    hint: 'drag to look | WASD / arrows / stick to move (Shift: faster)',
  },
  diagnostics: {
    window: 'renderer',
    stats: '# render stats (renderer.info)',
    interval: 'frame time',
    cpu: 'CPU (JS)',
    calls: 'draw calls',
    triangles: 'triangles',
    resources: 'resources',
    resourcesValue: (geometries, textures, programs) => `${geometries} geometries / ${textures} textures / ${programs} shaders`,
    frametime: '# frame time history',
    frameSummary: (avg, max) => `avg ${avg} ms / max ${max} ms`,
    log: '# event log',
  },
  control: {
    window: 'crystal.glb',
    inspect: '# GLB contents',
    file: 'file',
    fileValue: (kb, ms) => `${kb} KB (loaded in ${ms} ms)`,
    meshes: 'meshes',
    meshesValue: (meshes, vertices, triangles) => `${meshes} / ${vertices} vertices / ${triangles} triangles`,
    materials: 'materials',
    opacity: 'opacity',
    rotation: 'rotation',
    rotationValue: (running, degrees) => `${running ? 'running' : 'stopped'} ${degrees}°`,
    camera: 'distance',
    tintComment: '# glass tint',
    opacityComment: '# opacity',
    actionComment: '# rotation and measurement',
    spinStop: 'stop rotation',
    spinStart: 'resume rotation',
    scan: 'scan',
    prompt: '>',
  },
  tints: { cyan: 'cyan', magenta: 'magenta', acid: 'acid' },
  cameraModes: { orbit: 'Orbit', firstPerson: 'First Person' },
  log: {
    booted: 'uikit HUD started',
    font: (chars, ms, width, height) => `font generated: ${chars} chars x 2 weights / ${ms} ms / atlas ${width}x${height}`,
    loading: 'loading crystal.glb ...',
    loaded: (kb, ms) => `GLB loaded: ${kb} KB / ${ms} ms`,
    tint: (name) => `tint => ${name}`,
    opacity: (value) => `opacity => ${value}`,
    spinOff: 'rotation stopped',
    cameraMode: (name) => `view => ${name}`,
    scanStart: 'scanning ...',
    scanDone: (x, y, z) => `scan done: bounds ${x} x ${y} x ${z} (world units)`,
    unknown: (name) => `unknown command: ${name} (try help)`,
    help: [
      'scan            measure the crystal bounds',
      'spin            toggle rotation',
      'tint <color>    cyan / magenta / acid',
      'opacity <0-1>   set opacity',
      'clear           clear the log',
    ],
  },
};

// コマンド入力で受け付ける語
export const COMMANDS = {
  scan: ['scan'],
  spin: ['spin'],
  tint: ['tint'],
  opacity: ['opacity'],
  clear: ['clear'],
  help: ['help'],
};

// ターミナル風の表示に使う記号（バーとグラフ）
export const GLYPHS = {
  barFull: '█',
  barEmpty: '░',
  spark: '▁▂▃▄▅▆▇█',
};

// フォントに含める文字: ASCII一式と、上の文言・コマンド・記号に出てくる文字すべて
export function collectCharset() {
  const texts = [];
  const walk = (value) => {
    if (typeof value === 'string') texts.push(value);
    // 引数で文言が変わる関数もあるので、真偽どちらでも呼んで両方の文字を集める
    else if (typeof value === 'function') texts.push(value(true, '0', '0', '0'), value(false, '0', '0', '0'));
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(T);
  walk(COMMANDS);
  walk(GLYPHS);
  let ascii = '';
  for (let code = 0x20; code < 0x7f; code++) ascii += String.fromCharCode(code);
  return [...new Set(ascii + texts.join(''))].join('');
}
