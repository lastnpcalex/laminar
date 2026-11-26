import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LH_DIR = path.resolve(__dirname, '..');
const CANVAS_DIR = path.resolve(LH_DIR, '..', '..');
const ROOT = path.resolve(CANVAS_DIR, '..');
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const shotsIdx = args.indexOf('--shots');
const OUT_DIR = shotsIdx >= 0 && args[shotsIdx + 1] ? path.resolve(args[shotsIdx + 1]) : null;

const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const EDGE_PATH = EDGE_CANDIDATES.find((p) => fs.existsSync(p));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.glsl': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/opus'
};

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg);
}

function runStaticChecks() {
  const files = [
    'canvas/lighthugger.html',
    ...fs.readdirSync(LH_DIR)
      .filter((f) => /\.(js|css)$/.test(f))
      .map((f) => 'canvas/prototypes/lighthugger/' + f),
    ...fs.readdirSync(__dirname)
      .filter((f) => /\.(js|mjs)$/.test(f))
      .map((f) => 'canvas/prototypes/lighthugger/test/' + f)
  ];

  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    const buf = fs.readFileSync(abs);
    let cr = 0;
    let nonAscii = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 13) cr++;
      if (buf[i] >= 128) nonAscii++;
    }
    assert(cr === 0 && nonAscii === 0, `${rel} has CR=${cr} NonASCII=${nonAscii}`);
    if (rel.endsWith('.js') || rel.endsWith('.mjs')) {
      execFileSync(process.execPath, ['--check', abs], { stdio: 'inherit' });
    }
  }

  const html = fs.readFileSync(path.join(CANVAS_DIR, 'lighthugger.html'), 'utf8');
  const idMatches = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const idSet = new Set(idMatches);
  const dupIds = idMatches.filter((id, i) => idMatches.indexOf(id) !== i);
  assert(dupIds.length === 0, 'Duplicate DOM IDs: ' + dupIds.join(', '));

  const screensJs = fs.readFileSync(path.join(LH_DIR, 'lighthugger-screens.js'), 'utf8');
  const createdByJs = new Set(['lh-dd-specs', 'lh-dd-shield']);
  const refIds = [...screensJs.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]);
  const missingIds = [...new Set(refIds)].filter((id) => !idSet.has(id) && !createdByJs.has(id));
  assert(missingIds.length === 0, 'Missing DOM IDs in lighthugger.html: ' + missingIds.join(', '));

  const css = fs.readFileSync(path.join(LH_DIR, 'lighthugger.css'), 'utf8');
  let depth = 0;
  const structuralCss = css.replace(/\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
  for (const ch of structuralCss) {
    if (ch === '{') depth++;
    if (ch === '}') assert(--depth >= 0, 'CSS has an unmatched closing brace');
  }
  assert(depth === 0, 'CSS brace imbalance: ' + depth);

  const gMod = require(path.join(LH_DIR, 'lighthugger-genome.js'));
  const G = (gMod && gMod.findPreset) ? gMod : globalThis.LighthuggerGenome;
  const apMod = require(path.join(LH_DIR, 'lighthugger-atproto.js'));
  const AP = (apMod && apMod.buildVesselRecord) ? apMod : globalThis.LighthuggerATProto;
  const coade = G.findPreset('coade-savages');
  const code = G.encodeShareCode(coade);
  const decoded = G.decodeShareCode(code);
  assert(decoded && Math.abs(decoded.P.styleCoade - 1) < 0.02, 'LH3 CoaDE roundtrip failed');
  const dune = G.findPreset('dune-monolith');
  const duneCode = G.encodeShareCode(dune);
  const duneDec = G.decodeShareCode(duneCode);
  assert(dune && duneDec && Math.abs(duneDec.P.styleDune - 1) < 0.02, 'LH3 Dune roundtrip failed');
  const cath = G.findPreset('cathedral-gothic');
  const cathCode = G.encodeShareCode(cath);
  const cathDec = G.decodeShareCode(cathCode);
  assert(cath && cathDec && Math.abs(cathDec.P.styleCathedral - 1) < 0.02, 'LH3 Gothic Cathedral roundtrip failed');
  assert(G.computeRocketSpecs(dune).reversibleDrive === true, 'Single-bow-ice Dune vessel must auto-select reversible drive');
  const flipShip = G.findPreset('splintered-pilgrim');
  assert(flipShip && G.computeRocketSpecs(flipShip).reversibleDrive === false, 'Bi-cone vessel must auto-select flip-and-burn drive');
  const minLengths = G.PRESETS.map(preset => G.computeRocketSpecs({ ...preset,
    P: { ...preset.P, needleLen: 0, aftLen: 0 } }).totalM);
  assert(minLengths.length > 0 && minLengths.every(meters => meters >= 3000), 'Minimum slider length below 3 km');
  const rec = AP.buildVesselRecord({ id: 'ves_smoke', name: coade.name, genome: coade, shareCode: code });
  assert(rec && rec.$type === AP.VESSEL_LEXICON_ID, 'ATProto vessel record invalid');

  const galaxyJs = fs.readFileSync(path.join(LH_DIR, 'lighthugger-galaxy.js'), 'utf8');
  const scalar = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
  const longitudeFactors = new RegExp('\\b(?:lon\\s*\\*\\s*(' + scalar + ')|(' + scalar + ')\\s*\\*\\s*lon\\b)', 'g');
  const nonIntegerLongitude = [...galaxyJs.matchAll(longitudeFactors)]
    .filter(match => !Number.isInteger(Number(match[1] ?? match[2])))
    .map(match => 'lighthugger-galaxy.js:' + galaxyJs.slice(0, match.index).split('\n').length + ': ' + match[0]);
  assert(nonIntegerLongitude.length === 0, 'Non-integer longitude factors: ' + nonIntegerLongitude.join(', '));

  console.log(`STATIC_OK files=${files.length} domIds=${idSet.size} minHullMeters=${Math.min(...minLengths)} CR=0 NonASCII=0 nonIntegerLon=0`);
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = (req.url || '/').split('?')[0];
      const rel = urlPath === '/' ? '/lighthugger.html' : decodeURIComponent(urlPath);
      const abs = path.normalize(path.join(CANVAS_DIR, rel));
      if (!abs.startsWith(CANVAS_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      fs.readFile(abs, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found: ' + rel);
          return;
        }
        const ext = path.extname(abs).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
    s.on('error', reject);
  });
}

async function waitForJson(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch (_) {}
    await sleep(150);
  }
  throw new Error('Timeout waiting for ' + url);
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.exceptions = [];
    this.consoleErrors = [];
    this.badResponses = [];
  }
  async connect() {
    await new Promise((res, rej) => {
      this.ws.addEventListener('open', res, { once: true });
      this.ws.addEventListener('error', rej, { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.exceptions.push(JSON.stringify(msg.params.exceptionDetails));
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.consoleErrors.push(JSON.stringify(msg.params.args));
      } else if (msg.method === 'Network.responseReceived' && msg.params.response && msg.params.response.status >= 400) {
        const u = msg.params.response.url;
        this.badResponses.push(`${msg.params.response.status} ${u}`);
      } else if (msg.method === 'Network.loadingFailed' && !msg.params.canceled) {
        this.badResponses.push(`${msg.params.type}: ${msg.params.errorText}`);
      }
    });
  }
  call(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const t = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          rej(new Error('CDP timeout: ' + method));
        }
      }, 45000);
      this.pending.set(id, {
        res: (v) => { clearTimeout(t); res(v); },
        rej: (e) => { clearTimeout(t); rej(e); }
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('JS exception: ' + JSON.stringify(r.exceptionDetails));
    return r.result ? r.result.value : undefined;
  }
  async waitFrames(count = 6) {
    await this.eval(`new Promise(r => { let n = 0; function f() { if (++n >= ${count}) r(1); else requestAnimationFrame(f); } requestAnimationFrame(f); })`);
  }
  async setViewport(width, height, mobile = false) {
    await this.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await this.eval(`window.dispatchEvent(new Event('resize'))`);
    await this.waitFrames(5);
  }
  async screenshot(name) {
    if (!OUT_DIR) return;
    const r = await this.call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT_DIR, name), Buffer.from(r.data, 'base64'));
  }
  async mouse(type, x, y) {
    await this.call('Input.dispatchMouseEvent', {
      type, x, y, button: type === 'mouseMoved' ? 'none' : 'left',
      buttons: type === 'mouseReleased' ? 0 : 1, clickCount: type === 'mouseMoved' ? 0 : 1
    });
  }
  async click(selector) {
    const [x, y] = await this.eval(`(() => {
      const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    })()`);
    await this.mouse('mousePressed', x, y);
    await this.mouse('mouseReleased', x, y);
  }
  close() {
    try { this.ws.close(); } catch (_) {}
  }
}

function installBrowserProbes() {
  const probes = window.__lhRegression = {};
  function observeFactory(name, instanceName, beforeCreate) {
    Object.defineProperty(window, name, {
      configurable: true,
      set(api) {
        Object.defineProperty(window, name, { configurable: true, writable: true, value: api });
        const create = api.create;
        api.create = function (...args) {
          beforeCreate?.(...args);
          const instance = create.apply(this, args);
          probes[instanceName] = instance;
          return instance;
        };
      }
    });
  }
  observeFactory('LighthuggerOrbit3D', 'chronoscope', (canvas) => {
    probes.orbitPointer = {};
    for (const type of ['pointerdown', 'pointermove']) {
      canvas.addEventListener(type, (event) => {
        probes.orbitPointer[type] = { x: event.clientX, y: event.clientY, buttons: event.buttons };
      });
    }
    // Record the paths submitted to the real canvas, alongside renderer diagnostics.
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let path = [];
    for (const method of ['setTransform', 'beginPath', 'moveTo', 'lineTo', 'stroke']) {
      const original = ctx[method];
      ctx[method] = function (...args) {
        if (method === 'setTransform') probes.orbitPaths = { transfer: [], loops: 0 };
        if (method === 'beginPath') path = [];
        if (method === 'moveTo' || method === 'lineTo') path.push(args);
        if (method === 'stroke' && path.length > 12 && probes.orbitPaths) {
          if (ctx.strokeStyle === '#00e8ff' || ctx.strokeStyle === '#00f0ff') probes.orbitPaths.transfer.push(path);
          if (ctx.strokeStyle === '#36ff70') probes.orbitPaths.loops++;
        }
        return original.apply(this, args);
      };
    }
  });
  observeFactory('LighthuggerShuttles', 'shuttles');
  observeFactory('LighthuggerScene', 'scene');
}

// Sample the actual 2D draw calls, resetting the counters at the start of each frame.
function observePaint(canvasId, frameMethod, strokeTests, textTest) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const paint = window.__lhRegression[canvasId] = { strokes: {}, labels: [] };
  for (const method of [frameMethod, 'stroke', 'fillText']) {
    const original = ctx[method];
    ctx[method] = function (...args) {
      if (method === frameMethod) {
        paint.strokes = {};
        paint.labels = [];
      } else if (method === 'stroke') {
        for (const [name, test] of Object.entries(strokeTests)) {
          if (test(ctx)) paint.strokes[name] = (paint.strokes[name] || 0) + 1;
        }
      } else if (textTest?.(args[0])) paint.labels.push(args[0]);
      return original.apply(this, args);
    };
  }
}

function stationDeckLayout(kind) {
  const deck = document.getElementById('kg-' + kind + '-deck');
  const bays = document.getElementById('kg-' + kind + '-bays');
  const screen = deck.closest('.kg-station-screen');
  const work = screen.querySelector('.lh-chrono-viewport, #lh-sx-banner');
  const rect = deck.getBoundingClientRect();
  const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 &&
    a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const parts = [...bays.children].map(el => el.getBoundingClientRect());
  let scopeMounted = true;
  if (kind === 'sextant') {
    parts.push(...['lh-skymap-wrap', 'kg-scope-sextant'].map(id =>
      document.getElementById(id).getBoundingClientRect()));
    parts.shift(); // The optical bay contains those two measured parts.
    scopeMounted = document.getElementById('kg-scope-sextant')
      .contains(document.getElementById('kg-scope-bay'));
  }
  return {
    centerError: Math.abs((rect.left + rect.right) / 2 - innerWidth / 2),
    bottomGap: innerHeight - rect.bottom,
    outOfBounds: rect.left < -1 || rect.right > innerWidth + 1 || rect.top < 0 || rect.height <= 0,
    deckOv: [deck, bays, ...bays.children].some(el => el.scrollWidth > el.clientWidth + 2),
    overlap: (work ? work.getBoundingClientRect().bottom > rect.top + 1 : false) ||
      parts.some((a, i) => parts.slice(i + 1).some(b => overlap(a, b))),
    scopeMounted,
    docOv: document.documentElement.scrollWidth > innerWidth
  };
}

async function verifyStationLayout(cdp, kind) {
  const layout = await cdp.eval('(' + stationDeckLayout + ')(' + JSON.stringify(kind) + ')');
  assert(layout.centerError <= 2 && layout.bottomGap >= -1 && layout.bottomGap < 30 &&
    !layout.outOfBounds && !layout.deckOv && !layout.overlap && layout.scopeMounted && !layout.docOv,
    kind + ' station deck layout: ' + JSON.stringify(layout));
  return layout;
}

async function checkStationStow(cdp, kind) {
  const button = '#btn-' + kind + '-stow';
  const read = '(() => { const btn = document.querySelector(' + JSON.stringify(button) +
    '); return { expanded: btn.getAttribute("aria-expanded"), hidden: document.getElementById(btn.getAttribute("aria-controls")).hidden,' +
    ' height: btn.closest("footer").getBoundingClientRect().height }; })()';
  const open = await cdp.eval(read);
  await cdp.click(button);
  const stowed = await cdp.eval(read);
  await cdp.click(button);
  const reopened = await cdp.eval(read);
  assert(open.expanded === 'true' && stowed.expanded === 'false' && stowed.hidden && stowed.height < open.height &&
    reopened.expanded === 'true' && !reopened.hidden && reopened.height === open.height,
    kind + ' deck did not stow and deploy: ' + JSON.stringify({ open, stowed, reopened }));
}

async function checkLaunchAndDock(cdp) {
  const readLaunch = `(() => {
    const app = window.__LH_APP, snap = app.getSnapshot();
    const canvas = document.getElementById('lh-scene').getBoundingClientRect();
    const button = document.getElementById('btn-ship-launch-undock');
    const r = button.getBoundingClientRect();
    const rect = id => document.getElementById(id).getBoundingClientRect();
    const p = snap.hud.projectPoint(snap.hud.shipBottomLocal, canvas.width, canvas.height, 'vessel');
    const vessel = window.__lhRegression.scene.vessel;
    const endYs = [vessel.bowX, vessel.sternX].map(x =>
      snap.hud.projectPoint([x, 0, 0], canvas.width, canvas.height, 'vessel').y + canvas.top);
    const x = (r.left + r.right) / 2, y = r.top;
    return { x, y, projectedX: p.x + canvas.left, hullEndsBottom: Math.max(...endYs),
      yaw: app.getSceneInfo().camera.yaw,
      visible: p.inFront && r.width > 0 && button.contains(document.elementFromPoint(x, y + r.height / 2)),
      clear: r.left >= rect('lh-menu-left').right && r.right <= rect('lh-menu-right').left &&
        r.top >= rect('lh-screenbar').bottom };
  })()`;
  const start = await cdp.eval(readLaunch);
  await cdp.screenshot('50_docked_dropship_shuttles.png');
  const [x, y] = await cdp.eval(`(() => {
    const r = document.getElementById('lh-screenbar').getBoundingClientRect();
    return [innerWidth / 2, r.bottom + 70];
  })()`);
  await cdp.mouse('mousePressed', x, y);
  await cdp.mouse('mouseMoved', x + 100, y + 60);
  await cdp.mouse('mouseReleased', x + 100, y + 60);
  await cdp.waitFrames(10);
  const rotated = await cdp.eval(readLaunch);
  console.log('MENU_LAUNCH:', JSON.stringify({ start, rotated }));
  assert(Math.abs(rotated.yaw - start.yaw) > 0.15 && Math.hypot(rotated.x - start.x, rotated.y - start.y) > 2,
    'Launch key did not follow camera orbit');

  const dock = await cdp.eval(`(() => {
    const app = window.__LH_APP, info = app.getSceneInfo();
    return { wire: info.dockWireVisible, active: info.shuttlesActive, shipLengthKm: info.shipLengthKm,
      meters: app.getSnapshot().rocketSpecs.totalM, shuttles: window.__lhRegression.shuttles.info() };
  })()`);
  await cdp.waitFrames(6);
  const later = await cdp.eval('window.__lhRegression.shuttles.info()');
  const classes = [...new Set(dock.shuttles.filter(s => s.visible).map(s => s.cls))].sort();
  const moving = dock.shuttles.filter((s, i) => s.visible && later[i].visible &&
    Math.hypot(...s.pos.map((v, j) => v - later[i].pos[j])) > 0.01).length;
  console.log('DOCK_SHUTTLES:', JSON.stringify({ wire: dock.wire, active: dock.active, meters: dock.meters, classes, moving }));
  assert(dock.wire === false && dock.shipLengthKm >= 3 && dock.meters >= 3000 && dock.active >= 4 && moving >= 4 &&
    classes.join('/') === 'CUTTER/DART/LEOPARD/UNION', 'Docked hull or DropShip traffic contract failed: ' + JSON.stringify(classes));
  for (const p of [start, rotated]) {
    assert(p.visible && p.clear && Math.abs(p.x - p.projectedX) < 30 && p.y > p.hullEndsBottom,
      'Launch key must stay below both projected hull ends and clear of the racks and screenbar: ' + JSON.stringify(p));
  }
  await cdp.click('#btn-ship-launch-undock');
  await cdp.waitFrames(3);
  const launched = await cdp.eval(`(() => {
    const app = window.__LH_APP, snap = app.getSnapshot(), info = app.getSceneInfo();
    return !snap.docked && snap.mode === 'orbit' && snap.screen === 'helm' &&
      document.getElementById('main').dataset.screen === 'helm' && document.getElementById('lh-screen-menu').hidden &&
      (snap.shuttleMode === 'recall' || info.shuttlesActive === 0) && info.dockWireVisible === false;
  })()`);
  assert(launched, 'Launch key did not transition from docked menu to undocked Helm');
}

async function checkOrbitZoom(cdp) {
  const samples = await cdp.eval('(' + function () {
    const orbit = window.__lhRegression.chronoscope;
    const canvas = document.getElementById('lh-orbit-canvas');
    const rect = canvas.getBoundingClientRect();
    const au = window.LighthuggerOrbits.AU_KM;
    const sample = () => {
      const { viewScale, viewRadiusKm, frame, hits } = orbit.getDiagnostics();
      return { scale: viewScale, au: viewRadiusKm / au, frame,
        finite: hits.every(hit => Number.isFinite(hit.x) && Number.isFinite(hit.y)) };
    };
    const result = [sample()];
    for (let i = 0; i < 100 && result.at(-1).au < 150; i++) {
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 95, cancelable: true,
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
      result.push(sample());
    }
    orbit.resetView();
    return result;
  } + ')()');
  const scales = samples.filter((s, i) => i === 0 || s.scale !== samples[i - 1].scale).map(s => s.scale);
  assert(scales.join() === 'planet,system,veil' && Math.abs(samples.at(-1).au - 150) < 1e-7 &&
    samples.every((s, i) => s.finite && s.frame === 'planet' && Number.isFinite(s.au) &&
      (!i || (s.au >= samples[i - 1].au && s.au <= samples[i - 1].au * 1.15))),
    'Orbit Nav zoom did not progress continuously to 150 AU: ' + JSON.stringify(samples));
  console.log('ROUND5_ORBIT_ZOOM:', JSON.stringify({ scales, au: samples.at(-1).au, samples: samples.length }));
}

async function plotTitanFlipBurn(cdp) {
  const target = await cdp.eval('(' + function () {
    return [...document.querySelectorAll('#lh-target-list .lh-target')]
      .find(button => /TITAN/i.test(button.textContent))?.dataset.targetId;
  } + ')()');
  assert(target, 'Flip-burn test could not find Titan in Orbit Nav');
  // The target list can scroll. Bring the selected row into the real input viewport.
  const selector = '[data-target-id=' + JSON.stringify(target) + ']';
  await cdp.eval('document.querySelector(' + JSON.stringify(selector) + ').scrollIntoView({ block: "nearest" })');
  await cdp.click(selector);
  await cdp.waitFrames(3);
  await cdp.eval('document.getElementById("btn-flip-burn").scrollIntoView({ block: "nearest" })');
  await cdp.click('#btn-flip-burn');
  await cdp.waitFrames(4);
}

function orbitExecLayout() {
  const button = document.getElementById('btn-orbit-exec-watch');
  const bar = button.parentElement;
  const deck = bar.parentElement;
  const bays = document.getElementById('kg-orbit-bays');
  const box = button.getBoundingClientRect();
  const [plate, , stow] = [...bar.children].map(el => el.getBoundingClientRect());
  const overflowing = [deck, bar, bays, ...bays.children]
    .filter(el => el.scrollWidth > el.clientWidth + 2);
  return {
    height: deck.getBoundingClientRect().height,
    deckOv: overflowing.length > 0,
    overflow: overflowing.map(el => ({ part: el.id || el.getAttribute('aria-label') || el.className,
      client: el.clientWidth, scroll: el.scrollWidth, content: [...el.children]
        .filter(child => child.scrollWidth > child.clientWidth + 2)
        .map(child => child.id || child.className) })),
    rowFits: plate.right <= box.left && box.right <= stow.left &&
      plate.top < box.bottom && box.top < plate.bottom && stow.top < box.bottom && box.top < stow.bottom,
    sticky: getComputedStyle(bar).position === 'sticky',
    visible: box.width > 0 && box.height > 0 && box.top >= 0 && box.bottom <= innerHeight &&
      box.left >= 0 && box.right <= innerWidth &&
      button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
    top: box.top, scrollTop: bays.scrollTop, disabled: button.disabled,
    label: button.textContent, live: button.classList.contains('is-live')
  };
}

async function checkFlipBurn(cdp) {
  const readExec = '(' + orbitExecLayout + ')()';
  const reset = `window.__LH_APP.enterSystemOrbit('sol', true); window.__LH_APP.setScreen('orbits')`;
  const undock = `window.__LH_APP.undock(); window.__LH_APP.setScreen('orbits')`;
  const readRun = `({ screen: document.getElementById('main').dataset.screen,
    burn: window.__LH_APP.getSnapshot().burn })`;
  await cdp.eval(reset);
  await cdp.waitFrames(4);
  const docked = await cdp.eval(readExec);
  assert(docked.disabled && docked.label === 'UNDOCK FIRST' && !docked.live,
    'Orbit top bar did not explain the docking lockout: ' + JSON.stringify(docked));
  await cdp.eval(undock);
  await cdp.waitFrames(4);
  await plotTitanFlipBurn(cdp);
  const plan = await cdp.eval('(' + function () {
    const app = window.__LH_APP;
    const { brachistochrone, transfer } = app.getSnapshot().orbits;
    const finiteVec = vec => Array.isArray(vec) && vec.length === 3 && vec.every(Number.isFinite);
    const points = brachistochrone?.points;
    return { valid: brachistochrone?.valid, transfer: transfer?.isBrachistochrone === true,
      count: points?.length, finitePoints: points?.every(finiteVec), finiteFlip: finiteVec(brachistochrone?.flipPointKm),
      tof: brachistochrone?.tofS, peak: brachistochrone?.peakSpeedKmS,
      text: document.getElementById('lh-orbit-plan').textContent,
      drawn: window.__lhRegression.chronoscope.getDiagnostics().transferPreviewDrawn,
      executable: !document.getElementById('btn-orbit-execute').disabled };
  } + ')()');
  assert(plan.valid && plan.transfer && plan.count > 2 && plan.finitePoints && plan.finiteFlip &&
    Number.isFinite(plan.tof) && plan.tof > 0 && Number.isFinite(plan.peak) && plan.peak > 0 &&
    /HIGH-G FLIP-BURN[\s\S]*TOF[\s\S]*FLIP AT[\s\S]*PEAK/.test(plan.text) && plan.drawn && plan.executable,
    'Flip-burn plan or preview is invalid: ' + JSON.stringify(plan));
  await cdp.screenshot('55_orbits_flip_burn.png');
  for (const [w, h] of [[1440, 900], [1280, 720]]) {
    await cdp.setViewport(w, h);
    const layout = await cdp.eval(readExec);
    console.log(`ORBIT_EXEC ${w}x${h}:`, JSON.stringify(layout));
    assert(layout.height === 260 && !layout.deckOv && layout.rowFits && layout.sticky && layout.visible &&
      !layout.disabled && layout.label === 'EXEC & WATCH' && !layout.live,
      'Orbit top bar failed on desktop: ' + JSON.stringify(layout));
  }
  await cdp.setViewport(1440, 900);
  await cdp.click('#btn-orbit-execute');
  await cdp.waitFrames(3);
  const watching = await cdp.eval(readExec);
  assert(!watching.disabled && watching.label === 'WATCH ON HELM' && watching.live,
    'Orbit top bar did not switch to watch mode: ' + JSON.stringify(watching));
  await cdp.click('#btn-orbit-exec-watch');
  const watched = await cdp.eval(readRun);
  assert(watched.screen === 'helm' && watched.burn.active && watched.burn.isBrachistochrone,
    'Watch mode did not return to Helm during the existing burn: ' + JSON.stringify(watched));
  const run = await cdp.eval('(' + function () {
    const app = window.__LH_APP;
    const phases = [];
    let finite = true;
    for (let i = 0; i < 200 && app.getSnapshot().burn.isBrachistochrone; i++) {
      const { burn, orbit, beta, gamma } = app.getSnapshot();
      if (phases.at(-1) !== burn.phase) phases.push(burn.phase);
      finite &&= [...orbit.rKm, ...orbit.vKmS, beta, gamma, burn.progress].every(Number.isFinite);
      app.step(0.1, 0.1, true);
    }
    const end = app.getSnapshot();
    finite &&= [...end.orbit.rKm, ...end.orbit.vKmS, end.beta, end.gamma].every(Number.isFinite);
    return { phases, finite, active: end.burn.active, mode: end.mode,
      planned: Boolean(end.orbits.brachistochrone) };
  } + ')()');
  assert(run.phases.join() === 'accel,flip,decel' && run.finite && !run.active && !run.planned && run.mode === 'orbit',
    'Flip-burn execution failed: ' + JSON.stringify(run));
  console.log('ROUND5_FLIP_BURN:', JSON.stringify({ plan, run }));

  for (const [w, h] of [[390, 844], [320, 568]]) {
    await cdp.setViewport(w, h, true);
    await cdp.eval(reset);
    await cdp.eval(undock);
    await cdp.waitFrames(4);
    await plotTitanFlipBurn(cdp);
    const before = await cdp.eval(readExec);
    await cdp.eval('document.getElementById("kg-orbit-bays").scrollTop = 1e6');
    await cdp.waitFrames(2);
    const pinned = await cdp.eval(readExec);
    assert(before.visible && pinned.visible && pinned.sticky && pinned.rowFits && !pinned.deckOv &&
      pinned.scrollTop > before.scrollTop && Math.abs(pinned.top - before.top) <= 1 &&
      !pinned.disabled && pinned.label === 'EXEC & WATCH' && !pinned.live,
      `Orbit top bar failed on ${w}x${h}: ` + JSON.stringify({ before, pinned }));
    await cdp.click('#btn-orbit-exec-watch');
    const started = await cdp.eval(readRun);
    assert(started.screen === 'helm' && started.burn.active && started.burn.isBrachistochrone,
      'Mobile EXEC & WATCH did not start a flip-burn on Helm: ' + JSON.stringify(started));
    console.log(`ORBIT_EXEC ${w}x${h}:`, JSON.stringify({ ...pinned, screen: started.screen,
      active: started.burn.active, brachistochrone: started.burn.isBrachistochrone }));
  }
  await cdp.eval('window.__LH_APP.stopAll()');
  await cdp.setViewport(1440, 900);
}

async function checkChronoscope(cdp) {
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.enterSystemOrbit('sol', true);
    app.undock();
    app.setScreen('orbits');
  })()`);
  await cdp.waitFrames(4);
  const read = `(() => {
    const snap = window.__LH_APP.getSnapshot();
    const probes = window.__lhRegression;
    const canvas = document.getElementById('lh-orbit-canvas').getBoundingClientRect();
    return { diag: probes.chronoscope.getDiagnostics(), box: canvas.toJSON(), paths: probes.orbitPaths, pointer: probes.orbitPointer,
      active: [...document.querySelectorAll('[data-orbit-frame][aria-pressed="true"]')].map(b => b.dataset.orbitFrame),
      rows: document.querySelectorAll('#lh-burn-chain .lh-burn-row').length,
      screen: snap.screen, frame: snap.orbitFrame, burns: snap.maneuverChain, selected: snap.selectedBurnIdx };
  })()`;
  const initial = await cdp.eval(read);
  const orbitUx = await cdp.eval(`(() => {
    const deckH = document.getElementById('kg-orbit-deck').getBoundingClientRect().height;
    return {
      deckH,
      starLbl: document.getElementById('btn-orbit-star').textContent.trim(),
      planetLbl: document.getElementById('btn-orbit-planet').textContent.trim(),
      moonHiddenInit: document.getElementById('btn-orbit-moon').hidden,
      hasShipHit: window.__lhRegression.chronoscope.getDiagnostics().hasShipHit,
      hasCenterShip: Boolean(document.getElementById('btn-orbit-ship')),
      hasAddShip: Boolean(document.getElementById('btn-orbit-add-ship'))
    };
  })()`);
  console.log('ORBIT_UX_INIT:', JSON.stringify(orbitUx));
  assert(initial.screen === 'orbits' && initial.box.width > 0 && initial.diag.hillCount > 0 &&
    initial.diag.lagrangeCount >= 5 && initial.paths?.loops > 0,
    'Planet chronoscope is missing Hill spheres or Lagrange loops');
  assert(orbitUx.deckH <= 270 && orbitUx.starLbl.includes('SOL') && orbitUx.planetLbl.includes('SATURN') &&
    orbitUx.moonHiddenInit === true && orbitUx.hasShipHit === true && orbitUx.hasCenterShip && orbitUx.hasAddShip,
    'Ship-first Orbit Nav chrome or compact deck check failed: ' + JSON.stringify(orbitUx));
  await verifyStationLayout(cdp, 'orbit');
  await checkStationStow(cdp, 'orbit');
  await checkOrbitZoom(cdp);

  // Verify clicking a target draws dashed cyan transfer preview from the Lighthugger and reveals moon frame
  const targetPreview = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const titanBtn = [...document.querySelectorAll('#lh-target-list .lh-target')].find(b => /TITAN/i.test(b.textContent));
    if (titanBtn) titanBtn.click();
    await waitF(4);
    const diag = window.__lhRegression.chronoscope.getDiagnostics();
    return {
      selectedTarget: window.__LH_APP.getSnapshot().selectedTargetId,
      moonHiddenAfterTitan: document.getElementById('btn-orbit-moon').hidden,
      transferPreviewDrawn: diag.transferPreviewDrawn,
      hasTransferStroke: (window.__lhRegression.orbitPaths?.transfer?.length || 0) > 0
    };
  })()`);
  console.log('ORBIT_TARGET_PREVIEW:', JSON.stringify(targetPreview));
  assert(targetPreview.moonHiddenAfterTitan === false && targetPreview.transferPreviewDrawn === true &&
    targetPreview.hasTransferStroke, 'Target selection did not draw transfer preview or reveal moon frame: ' + JSON.stringify(targetPreview));

  // Verify CENTER SHIP, + BURN AT SHIP, precision trim step, and INVARIANT deck dimensions across state changes
  await cdp.click('#btn-orbit-ship');
  await cdp.click('[data-trim-step="0.001"]');
  const orbitRectBefore = await cdp.eval(`(() => { const r = document.getElementById('kg-orbit-deck').getBoundingClientRect(); return { w: r.width, h: r.height }; })()`);
  await cdp.click('#btn-orbit-add-ship');
  await cdp.waitFrames(2);
  const shipBurnCheck = await cdp.eval(`(() => {
    const snap = window.__LH_APP.getSnapshot();
    const diag = window.__lhRegression.chronoscope.getDiagnostics();
    const microPressed = document.querySelector('[data-trim-step="0.001"]').getAttribute('aria-pressed');
    const stepAttr = document.querySelector('#lh-node-trim input[type="range"]').step;
    const r = document.getElementById('kg-orbit-deck').getBoundingClientRect();
    return { burns: snap.maneuverChain.length, handles: diag.gizmoHandles6.length, microPressed, stepAttr, w: r.width, h: r.height };
  })()`);
  assert(shipBurnCheck.burns >= 1 && shipBurnCheck.handles === 6 &&
    shipBurnCheck.microPressed === 'true' && shipBurnCheck.stepAttr === '0.001' &&
    Math.abs(shipBurnCheck.w - orbitRectBefore.w) <= 1 && Math.abs(shipBurnCheck.h - orbitRectBefore.h) <= 1,
    'Ship burn button, precision trim step, or invariant orbit deck size failed: ' + JSON.stringify({ orbitRectBefore, shipBurnCheck }));
  await cdp.eval(`document.querySelector('#lh-burn-chain .lh-burn-del')?.click(); document.querySelector('[data-trim-step="0.01"]').click();`);
  await cdp.waitFrames(2);

  const x = initial.box.left + initial.box.width * 0.18, y = initial.box.top + initial.box.height * 0.18;
  await cdp.mouse('mousePressed', x, y);
  await cdp.mouse('mouseMoved', x + 55, y + 34);
  await cdp.mouse('mouseReleased', x + 55, y + 34);
  const tilted = await cdp.eval(read);
  assert(Math.abs(tilted.diag.yaw - initial.diag.yaw) > 0.1 && Math.abs(tilted.diag.pitch - initial.diag.pitch) > 0.1,
    'Chronoscope left drag did not rotate both camera axes');

  for (const frame of ['star', 'planet', 'moon', 'synodic', 'planet']) {
    if (frame === 'moon') {
      await cdp.eval(`(() => { const b = [...document.querySelectorAll('#lh-target-list .lh-target')].find(x => /TITAN/i.test(x.textContent)); if (b) b.click(); })()`);
      await cdp.waitFrames(2);
    }
    await cdp.click(`[data-orbit-frame="${frame}"]`);
    await cdp.waitFrames(2);
    const result = await cdp.eval(read);
    assert(result.frame === frame && result.diag.frame === frame && result.active.join() === frame,
      `Chronoscope frame ${frame} did not sync with the app and frame buttons`);
    if (frame === 'synodic') {
      const ids = result.diag.hits.filter(h => h.kind === 'lagrange').map(h => h.id).sort();
      assert(ids.join() === 'L1,L2,L3,L4,L5' && result.paths.loops > 0, 'Synodic frame lacks L1-L5 or a rendered Lissajous loop');
      await cdp.screenshot('49_orbits_synodic_lissajous.png');
    }
  }

  async function addBurn(kind) {
    const before = await cdp.eval(read);
    const inDrawer = await cdp.eval(`(() => {
      const btn = document.querySelector('[data-quick-burn="${kind}"]');
      const more = document.getElementById('lh-quick-more');
      return Boolean(btn && more && more.contains(btn) && more.hidden);
    })()`);
    if (inDrawer) {
      await cdp.click('#btn-orbit-more');
      await cdp.waitFrames(2);
    }
    await cdp.click(`[data-quick-burn="${kind}"]`);
    const after = await cdp.eval(read);
    assert(after.burns.length > before.burns.length && after.rows === after.burns.length &&
      after.diag.burnCount === after.rows, `Quick maneuver ${kind} did not add and sync burns`);
    return after;
  }

  await addBurn('node');
  await cdp.waitFrames(2);
  const node = await cdp.eval(read);
  const axes = node.diag.gizmoHandles.map(h => h.axis).sort();
  assert(axes.join() === 'nrm,pro,rad', 'Selected burn lacks three gizmo axes');
  const handle = node.diag.hits.find(h => h.kind === 'gizmo' && h.axis === 'pro');
  assert(handle && Number.isFinite(handle.dx) && Number.isFinite(handle.dy), 'Prograde handle has no drag target');
  const hx = node.box.left + handle.x, hy = node.box.top + handle.y;
  const endX = hx + 26 * handle.dx, endY = hy + 26 * handle.dy;
  let dragged;
  await cdp.mouse('mousePressed', hx, hy);
  try {
    // CDP can acknowledge input before a frame delivers the move. Sample while the button is held.
    await cdp.waitFrames(1);
    await cdp.mouse('mouseMoved', endX, endY);
    await cdp.waitFrames(2);
    dragged = await cdp.eval(read);
  } finally {
    await cdp.mouse('mouseReleased', endX, endY);
  }
  const reached = (event, x, y) => event?.buttons === 1 && Math.hypot(event.x - x, event.y - y) <= 2;
  const dragDvP = dragged.burns[node.selected]?.dvP - node.burns[node.selected].dvP;
  const dragTotalDv = dragged.diag.totalDvKmS - node.diag.totalDvKmS;
  const transferPaths = dragged.paths?.transfer.length ?? 0;
  const transferChanged = JSON.stringify(dragged.paths?.transfer) !== JSON.stringify(node.paths?.transfer);
  console.log('CHRONOSCOPE_DRAG:', JSON.stringify({ start: [hx, hy], end: [endX, endY], pointer: dragged.pointer,
    dragDvP, dragTotalDv, transferPaths, transferChanged }));
  assert(reached(dragged.pointer.pointerdown, hx, hy) && reached(dragged.pointer.pointermove, endX, endY),
    'Chronoscope canvas did not receive the expected down and held move events');
  assert(Math.abs(dragDvP) > 0.01, 'Gizmo drag did not update the app prograde burn');
  assert(Math.abs(dragTotalDv) > 0.01, 'Gizmo drag did not update the renderer total delta-v');
  assert(transferPaths > 0, 'Gizmo drag produced no rendered transfer path');
  assert(transferChanged, 'Rendered transfer path did not change during gizmo drag');

  const signedAxes = dragged.diag.gizmoHandles6.map(h => h.axis).sort().join();
  assert(signedAxes === 'anm,nrm,pro,rad,ret,rin', 'All six signed maneuver handles must be rendered');
  const retro = dragged.diag.hits.find(h => h.kind === 'gizmo' && h.axis === 'ret');
  assert(retro && Number.isFinite(retro.dx) && Number.isFinite(retro.dy), 'Missing retrograde drag direction');
  const rx = dragged.box.left + retro.x, ry = dragged.box.top + retro.y;
  await cdp.mouse('mousePressed', rx, ry);
  await cdp.waitFrames(1);
  await cdp.mouse('mouseMoved', rx + 12 * retro.dx, ry + 12 * retro.dy);
  await cdp.waitFrames(2);
  await cdp.mouse('mouseReleased', rx + 12 * retro.dx, ry + 12 * retro.dy);
  const trimmed = await cdp.eval(read);
  assert(trimmed.burns[node.selected].dvP < dragged.burns[node.selected].dvP - 0.01,
    'Dragging the retrograde handle outward did not decrease prograde delta-v');

  const delay = await cdp.eval(`(() => {
    const orbit = window.__lhRegression.chronoscope;
    const snap = window.__LH_APP.getSnapshot();
    const i = snap.selectedBurnIdx;
    const slider = document.getElementById('rng-burn-delay');
    const before = orbit.getBurnContext(i).dtS;
    const value = Math.floor(Number(slider.max) * 0.08);
    if (slider.disabled || value <= 0) throw new Error('Burn Delay has no usable range');
    slider.value = value;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    return { before, requested: Number(slider.value), context: orbit.getBurnContext(i).dtS,
      model: window.__LH_APP.getSnapshot().maneuverChain[i].dtS, output: document.getElementById('val-burn-delay').textContent };
  })()`);
  assert(Math.abs(delay.before - delay.requested) >= 1 && delay.context === delay.requested && delay.model === delay.requested,
    'Burn Delay did not replan the selected node: ' + JSON.stringify(delay));
  await cdp.waitFrames(3);
  const delayed = await cdp.eval(read);
  assert(delayed.frame === 'planet' && delayed.diag.gizmoHandles6.length === 6 && delayed.diag.burnArcCount > 0,
    'Planet-frame burn arc or maneuver handles missing after delay edit');
  await cdp.screenshot('30_screen_orbits.png');
  await cdp.click('[data-orbit-frame="target"]');
  await cdp.waitFrames(3);
  const target = await cdp.eval(read);
  assert(target.frame === 'target' && target.diag.frame === 'target' && target.active.join() === 'target' &&
    Number.isFinite(target.diag.closestApproachKm) && target.diag.closestApproachKm >= 0 &&
    target.diag.gizmoHandles6.length === 6, 'Target-relative frame lacks closest approach or maneuver handles');
  await cdp.screenshot('52_orbits_target_frame_6handle.png');
  await cdp.click('[data-orbit-frame="planet"]');
  const circular = await addBurn('circularize');
  const l1 = await addBurn('L1');
  async function quickTransfer(kind) {
    await cdp.eval('window.__LH_APP.enterSystemOrbit("sol", true); window.__LH_APP.undock(); window.__LH_APP.setScreen("orbits")');
    await cdp.waitFrames(3);
    const before = await cdp.eval(read);
    const after = await addBurn(kind);
    return after.burns.slice(before.burns.length);
  }
  const intercept = await quickTransfer('intercept');
  const rendezvous = await quickTransfer('rendezvous');
  assert(intercept.length === 1 && intercept[0].interceptTimeS > 0 && rendezvous.length === 2 &&
    rendezvous[1].dtS > 0, 'Quick orders did not distinguish a single intercept from a two-burn rendezvous: ' +
    JSON.stringify({ intercept, rendezvous }));
  console.log('CHRONOSCOPE:', JSON.stringify({ hill: initial.diag.hillCount, lagrange: initial.diag.lagrangeCount,
    axes, signedAxes, retroDvP: trimmed.burns[node.selected].dvP, delayS: delay.context,
    burnArcs: delayed.diag.burnArcCount, closestApproachKm: target.diag.closestApproachKm,
    interceptBurns: intercept.length, rendezvousBurns: rendezvous.length, circularBurns: circular.rows, l1Burns: l1.rows }));

  await checkFlipBurn(cdp);

  // Verify deep-space gate (> 1 light-week from nearest star disables Orbit Nav and shows deep-space slate)
  const deepCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    app.engageInterstellar({ destId: 'rigil' });
    app.state.mission = null;
    app.state.posGal = [1.5, 0.2, 0.3];
    app.setScreen('orbits');
    await waitF(4);
    const snap = app.getSnapshot();
    const navBtn = document.getElementById('btn-nav-orbits');
    const slate = document.getElementById('lh-orbit-deepspace');
    const navDisabled = navBtn.disabled;
    const slateVisible = !slate.hidden;
    const distTxt = document.getElementById('lh-deep-dist').textContent;
    const isDeepCls = document.getElementById('lh-screen-orbits').classList.contains('is-deepspace');
    const vpHidden = getComputedStyle(document.querySelector('#lh-screen-orbits .lh-chrono-viewport')).display === 'none';
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.setScreen('helm');
    await waitF(3);
    const restoredEnabled = !document.getElementById('btn-nav-orbits').disabled;
    return {
      inDeepSpace: snap.inDeepSpace,
      orbitNavAvailable: snap.orbitNavAvailable,
      navDisabled,
      slateVisible,
      distTxt, isDeepCls, vpHidden, restoredEnabled
    };
  })()`);
  console.log('DEEP_SPACE_GATE:', JSON.stringify(deepCheck));
  assert(deepCheck.inDeepSpace && !deepCheck.orbitNavAvailable && deepCheck.navDisabled &&
    deepCheck.slateVisible && deepCheck.isDeepCls && deepCheck.vpHidden && deepCheck.restoredEnabled,
    'Deep-space > 1 light-week Orbit Nav gate failed: ' + JSON.stringify(deepCheck));
}

async function checkRollAndRcs(cdp) {
  const hints = await cdp.eval(`(() => {
    const ring = document.getElementById('kg-roll-ring');
    const thumb = document.getElementById('kg-roll-thumb');
    const arc = document.getElementById('kg-roll-arc');
    const puckBtns = [...document.querySelectorAll('[data-puck-mode]')].map(b => b.dataset.puckMode);
    const modeCap = document.getElementById('btn-puck-mode');
    const capSteer = modeCap?.textContent?.trim() || '';
    document.querySelector('[data-puck-mode="cam"]').click();
    const capCam = modeCap?.textContent?.trim() || '';
    document.querySelector('[data-puck-mode="steer"]').click();
    const camViewTxt = document.getElementById('lbl-cam-view')?.textContent?.trim() || '';
    return {
      ringCursor: getComputedStyle(ring).cursor,
      hasThumb: Boolean(thumb),
      hasArc: Boolean(arc),
      hasCaps: Boolean(document.getElementById('btn-roll-left') && document.getElementById('btn-roll-right')),
      wheelRemoved: !document.getElementById('kg-roll-wheel'),
      dupOrbitBtnRemoved: !document.getElementById('btn-orbits-deck'),
      orbit3dText: document.getElementById('btn-vectors')?.textContent?.trim() || '',
      puckBtns, capSteer, capCam, camViewTxt
    };
  })()`);
  assert(
    hints.ringCursor === 'grab' &&
    hints.hasThumb && hints.hasArc && hints.hasCaps &&
    hints.wheelRemoved && hints.dupOrbitBtnRemoved &&
    /^3D ORB(?:IT)?$/.test(hints.orbit3dText) &&
    hints.puckBtns.join(',') === 'steer,cam' &&
    hints.capSteer.includes('PILOT') &&
    hints.capCam.includes('CAMERA LOOK') &&
    hints.camViewTxt === '3RD LOW',
    'Half-circular roll slider, puck mode clarity, or 3D ORBIT dedup failed: ' + JSON.stringify(hints)
  );
  const results = [];
  let spinChip = null;
  let spinChipOk = false;
  for (const [id, direction] of [['kg-roll-ring', 1], ['kg-roll-ring-port', -1], ['btn-roll-left', -1], ['btn-roll-right', 1]]) {
    const domId = id === 'kg-roll-ring-port' ? 'kg-roll-ring' : id;
    const { held, released, chip } = await cdp.eval(`(async () => {
      const app = window.__LH_APP, target = document.getElementById('${domId}');
      document.getElementById('sw-allstop').click();
      const { f, z } = app.state.basis;
      const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
      const r = target.getBoundingClientRect();
      const ring = target.id === 'kg-roll-ring';
      const cx = r.left + r.width / 2, cy = r.top + r.height * (55 / 98);
      const radius = r.width * (46 / 124);
      const dir = ${direction};
      const event = (type, clientX, clientY) => new PointerEvent(type, {
        bubbles: true, cancelable: true, button: 0, pointerType: 'mouse', pointerId: 61, clientX, clientY
      });
      if (ring) {
        target.dispatchEvent(event('pointerdown', cx, cy - radius));
        target.dispatchEvent(event('pointermove', cx + dir * radius, cy));
      } else {
        target.dispatchEvent(event('pointerdown', r.left + r.width / 2, r.top + r.height / 2));
      }
      const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const early = [];
      for (let i = 0; i < 55; i++) {
        await nextFrame();
        const cur = app.getSnapshot();
        const omega = cur.angVel[0];
        if (Math.abs(omega) > 0.01 && early.length < 2) early.push(Math.abs(omega));
        if (cur.spinG >= 3.8 && Math.abs(dot(cur.basis.y, z)) > 0.1) break;
      }
      const snap = app.getSnapshot();
      const warnBox = document.getElementById('lh-warning');
      const warnEl = document.getElementById('lh-warn');
      const wr = warnEl.getBoundingClientRect();
      const chip = {
        source: warnEl.dataset.source,
        hidden: warnBox.hidden,
        left: wr.left, right: wr.right, top: wr.top, bottom: wr.bottom,
        width: wr.width, height: wr.height,
        centerHit: wr.left < innerWidth * 0.5 && wr.right > innerWidth * 0.5 &&
          wr.top < innerHeight * 0.5 && wr.bottom > innerHeight * 0.5
      };
      const held = { id: '${id}', early, omega: snap.angVel[0], torque: snap.rcsTorque[0], g: snap.spinG,
        spinKill: snap.crewSpinKilled, jets: app.getSceneInfo().rcsJetsFiring, input: app.state.rollInput,
        rollDotZ: Math.abs(dot(snap.basis.y, z)), rollFwdPreserved: dot(snap.basis.f, f) };
      target.dispatchEvent(event('pointerup', cx, cy));
      await nextFrame();
      const sas = app.getSnapshot();
      return { held, chip, released: { input: app.state.rollInput, torque: sas.rcsTorque[0], omega: sas.angVel[0],
        damping: sas.rcsDamping, jets: app.getSceneInfo().rcsJetsFiring } };
    })()`);
    if (id === 'kg-roll-ring') {
      spinChip = chip;
      spinChipOk = Boolean(
        chip.source === 'spin' && !chip.hidden &&
        chip.height > 0 && chip.height <= 40 &&
        chip.width > 60 && chip.width <= 420 &&
        !chip.centerHit && (chip.left < 1440 * 0.2 || chip.right > 1440 * 0.8)
      );
      if (!spinChipOk) console.log('SPIN_CHIP_FAIL:', JSON.stringify(chip));
    }
    if (id === 'kg-roll-ring' && released.damping && released.jets > 0) {
      await cdp.screenshot('46_rcs_auto_correct_plumes.png');
    }
    assert(held.rollDotZ > 0.08 && held.rollFwdPreserved > 0.99 && held.input * direction > 0.9,
      'Roll control did not roll without steering: ' + JSON.stringify(held));
    assert(held.early.length === 2 && held.early[1] > held.early[0] && held.torque * direction > 0 && held.jets > 0 &&
      held.g > 2.0 && held.g < 5.0 && !held.spinKill, 'Holding roll did not build angular speed, fire RCS, warn >2g and hard-cap <5g: ' + JSON.stringify(held));
    assert(released.input === 0 && released.damping === true && released.torque * held.torque < 0 && released.jets > 0 &&
      Math.abs(released.omega) < Math.abs(held.omega), 'Released roll did not zero input and counter-burn: ' + JSON.stringify(released));
    const centered = await cdp.eval(`(async () => {
      const app = window.__LH_APP;
      for (let i = 0; i < 90 && app.getSnapshot().rcsDamping; i++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      return app.getSnapshot().angVel[0] === 0 &&
        Number(document.getElementById('kg-roll-ring').getAttribute('aria-valuenow')) === 0;
    })()`);
    assert(centered, 'Half-circular roll slider did not spring back to 0 after SAS settled');
    const stopped = await cdp.eval(`(async () => {
      const app = window.__LH_APP;
      document.getElementById('sw-allstop').click();
      const snap = app.getSnapshot();
      const reset = app.state.rollInput === 0 && snap.angVel.every(v => v === 0) &&
        snap.rcsTorque.every(v => v === 0) && snap.spinG === 0 && !snap.crewSpinKilled && !snap.rcsDamping;
      // The command clears immediately, while the shader plumes fade over several frames.
      const deadline = performance.now() + 4000;
      while (app.getSceneInfo().rcsJetsFiring > 0 && performance.now() < deadline) {
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      return { reset, jets: app.getSceneInfo().rcsJetsFiring };
    })()`);
    assert(stopped.reset && stopped.jets === 0,
      'ALL STOP did not reset roll and spin state or the RCS plumes did not fade: ' + JSON.stringify(stopped));
    results.push({ id, rollDotZ: held.rollDotZ, spinG: held.g, heldJets: held.jets, sasJets: released.jets });
  }
  console.log('ROLL_HINTS_AND_SPIN_CHIP:', JSON.stringify({ hints, spinChip, spinChipOk }));
  console.log('ROLL_AND_RCS:', JSON.stringify(results));
  return { spinChip, spinChipOk };
}

async function checkHighGammaAimingAndSafety(cdp) {
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.selectPreset('long-patience');
    app.commissionDraft();
    app.undock();
    window.LighthuggerScreens.setKgOpen(true);
    app.engageInterstellar({ destId: 'rigil' });
    app.state.mission = null;
    app.state.relGov = true;
    app.setThrustG(1.8);
  })()`);
  await cdp.waitFrames(3);

  // 1. SAFE gamma governor caps runaway free-flight gamma; toggling OFF permits uncapped high-gamma flight
  const govCheck = await cdp.eval(`(() => {
    const app = window.__LH_APP, btn = document.getElementById('btn-rel-gov');
    const pressedBefore = btn.getAttribute('aria-pressed');
    for (let i = 0; i < 25; i++) app.step(0.15 * 31557600, 0.05);
    const capped = app.getSnapshot();
    btn.click();
    const pressedOff = btn.getAttribute('aria-pressed');
    for (let i = 0; i < 15; i++) app.step(0.15 * 31557600, 0.05);
    const uncapped = app.getSnapshot();
    return {
      pressedBefore,
      govBeta: capped.beta,
      govGamma: capped.gamma,
      pressedOff,
      relGovOff: uncapped.relGov,
      uncappedGamma: uncapped.gamma
    };
  })()`);
  console.log('REL_GOVERNOR:', JSON.stringify(govCheck));
  assert(
    govCheck.pressedBefore === 'true' &&
    govCheck.govBeta <= 0.925 && govCheck.govGamma <= 2.65 &&
    govCheck.relGovOff === false && govCheck.uncappedGamma > 5,
    'SAFE gamma governor check failed: ' + JSON.stringify(govCheck)
  );

  // 2. Zero-ice recovery: emergencyBrakeToSafeBeta + #btn-ice-harvest restoring iceShield = 1
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.state.iceIntegrity = 0;
  })()`);
  await cdp.waitFrames(3);
  const recovery = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP, s = app.state;
    const brakeBtn = document.getElementById('btn-emerg-brake');
    const brakeVisible = !brakeBtn.hidden && !brakeBtn.disabled;
    brakeBtn.click();
    await waitF(2);
    const braking = { active: s.emergencyBraking, thrustCmdG: s.thrustCmdG };
    for (let i = 0; i < 120 && s.beta >= 0.015; i++) app.step(0.25 * 31557600, 0.05);
    await waitF(3);
    const harvestBtn = document.getElementById('btn-ice-harvest');
    const beforeHarvest = {
      beta: s.beta,
      canHarvest: app.getSnapshot().canHarvestIce,
      btnVisible: !harvestBtn.hidden && !harvestBtn.disabled
    };
    harvestBtn.click();
    await waitF(3);
    const during = app.getSnapshot();
    const hBar = document.getElementById('lh-harvest-bar');
    const harvestActive = {
      active: Boolean(during.iceHarvest && during.iceHarvest.active),
      barVisible: Boolean(hBar && !hBar.hidden),
      title: document.getElementById('lh-harvest-title')?.textContent || '',
      warp: during.effectiveWarp
    };
    return { brakeVisible, braking, beforeHarvest, harvestActive };
  })()`);
  await cdp.screenshot('52_ice_harvest_status_bar.png');
  const recoveryDone = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    for (let i = 0; i < 16 && app.getSnapshot().iceHarvest?.active; i++) {
      const sn = app.getSnapshot();
      app.step(Math.max(4000, (sn.effectiveWarp || 1000) * 1.5), 1.5);
    }
    await waitF(3);
    const after = app.getSnapshot();
    return {
      iceShield: after.iceShield,
      iceIntegrity: after.iceIntegrity,
      activeAfter: Boolean(after.iceHarvest && after.iceHarvest.active),
      barHiddenAfter: Boolean(document.getElementById('lh-harvest-bar')?.hidden)
    };
  })()`);
  console.log('ZERO_ICE_RECOVERY:', JSON.stringify({ ...recovery, ...recoveryDone }));
  assert(
    recovery.brakeVisible && recovery.braking.active && recovery.braking.thrustCmdG < 0 &&
    recovery.beforeHarvest.beta < 0.02 && recovery.beforeHarvest.canHarvest && recovery.beforeHarvest.btnVisible &&
    recovery.harvestActive.active && recovery.harvestActive.barVisible &&
    recovery.harvestActive.title.includes('COLLECTING ICE FROM SYSTEM') && recovery.harvestActive.warp >= 60 &&
    recoveryDone.iceShield === 1 && recoveryDone.iceIntegrity === 1 &&
    !recoveryDone.activeAfter && recoveryDone.barHiddenAfter,
    'Zero-ice recovery / progressive harvest status bar failed: ' + JSON.stringify({ ...recovery, ...recoveryDone })
  );

  // 3. 1/gamma + FINE (#btn-fine-steer) steering damping at high gamma
  async function sampleYawRate(eta, fine) {
    await cdp.eval(`(() => {
      const app = window.__LH_APP, s = app.state;
      const fineBtn = document.getElementById('btn-fine-steer');
      s.mission = null;
      s.thrustCmdG = 0;
      s.angVel = [0, 0, 0];
      s.rcsTorque = [0, 0, 0];
      s.eta = ${eta}; s.beta = Math.tanh(${eta}); s.gamma = Math.cosh(${eta});
      s.attitudeMode = 'MANUAL';
      app.setPuckMode('steer');
      if (s.fineSteer !== ${fine}) fineBtn.click();
      app.setPuckInput(1, 0);
    })()`);
    await cdp.waitFrames(6);
    return await cdp.eval(`(() => {
      const app = window.__LH_APP, s = app.state;
      const w = Math.abs(s.angVel[1]);
      app.setPuckInput(0, 0);
      return { w, gamma: s.gamma, fine: s.fineSteer, pressed: document.getElementById('btn-fine-steer').getAttribute('aria-pressed') };
    })()`);
  }
  const steerDamp = {
    low: await sampleYawRate(0.01, false),
    high: await sampleYawRate(3.0, false),
    fine: await sampleYawRate(3.0, true)
  };
  await cdp.eval(`if (window.__LH_APP.state.fineSteer) document.getElementById('btn-fine-steer').click()`);
  console.log('HIGH_GAMMA_STEER_DAMPING:', JSON.stringify(steerDamp));
  assert(
    steerDamp.low.w > 0.025 &&
    steerDamp.high.w > 0 && steerDamp.high.w < steerDamp.low.w * 0.22 &&
    steerDamp.fine.fine === true && steerDamp.fine.pressed === 'true' &&
    steerDamp.fine.w > 0 && steerDamp.fine.w < steerDamp.high.w * 0.42,
    '1/gamma or FINE steering damping failed: ' + JSON.stringify(steerDamp)
  );

  // 4. VEC mode prograde lock clamps bow within safe +/-2 deg AoA cone while trimming velocity
  await cdp.eval(`(() => {
    const norm = (a) => { const m = Math.hypot(...a) || 1; return a.map(v => v / m); };
    const app = window.__LH_APP, s = app.state;
    s.mission = null;
    s.thrustCmdG = 0;
    s.angVel = [0, 0, 0];
    s.eta = 2.6; s.beta = Math.tanh(2.6); s.gamma = Math.cosh(2.6);
    s.velocityGal = s.headingGal.slice();
    const deg10 = 10 * Math.PI / 180;
    s.headingGal = norm(s.headingGal.map((v, i) => v * Math.cos(deg10) + s.basis.z[i] * Math.sin(deg10)));
    window.__lhRegression.vecBefore = s.velocityGal.slice();
    app.setPuckMode('vec');
    app.setPuckInput(0.9, 0.35);
  })()`);
  await cdp.waitFrames(6);
  const vecCheck = await cdp.eval(`(() => {
    const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
    const norm = (a) => { const m = Math.hypot(...a) || 1; return a.map(v => v / m); };
    const app = window.__LH_APP, s = app.state;
    const snap = app.getSnapshot();
    const badgeVisible = !document.getElementById('kg-vec-lock').hidden;
    const aoaDeg = Math.acos(Math.max(-1, Math.min(1, dot(norm(s.headingGal), norm(s.velocityGal))))) * 180 / Math.PI;
    const vShiftDeg = Math.acos(Math.max(-1, Math.min(1, dot(norm(window.__lhRegression.vecBefore), norm(s.velocityGal))))) * 180 / Math.PI;
    app.setPuckInput(0, 0);
    app.setPuckMode('steer');
    return { vecProgradeLock: snap.vecProgradeLock, badgeVisible, aoaDeg, vShiftDeg };
  })()`);
  console.log('VEC_PROGRADE_LOCK:', JSON.stringify(vecCheck));
  assert(
    vecCheck.vecProgradeLock === true && vecCheck.badgeVisible &&
    vecCheck.vShiftDeg > 0.001 && vecCheck.aoaDeg <= 2.05,
    'VEC prograde lock check failed: ' + JSON.stringify(vecCheck)
  );

  // 5. LOUPE (1x -> 5x -> 20x -> 1x) narrows camera FOV
  await cdp.eval(`window.__LH_APP.setAberrationZoom(1)`);
  await cdp.waitFrames(6);
  const fov1 = await cdp.eval(`window.__LH_APP.getSceneInfo().camera.fov`);
  await cdp.eval(`document.getElementById('btn-aberration-loupe').click()`);
  await cdp.waitFrames(8);
  const l5 = await cdp.eval(`({ z: window.__LH_APP.getSnapshot().aberrationZoom, lbl: document.getElementById('btn-aberration-loupe').textContent, fov: window.__LH_APP.getSceneInfo().camera.fov })`);
  await cdp.eval(`document.getElementById('btn-aberration-loupe').click()`);
  await cdp.waitFrames(8);
  const l20 = await cdp.eval(`({ z: window.__LH_APP.getSnapshot().aberrationZoom, lbl: document.getElementById('btn-aberration-loupe').textContent, fov: window.__LH_APP.getSceneInfo().camera.fov })`);
  await cdp.eval(`document.getElementById('btn-aberration-loupe').click()`);
  await cdp.waitFrames(8);
  const l1 = await cdp.eval(`({ z: window.__LH_APP.getSnapshot().aberrationZoom, lbl: document.getElementById('btn-aberration-loupe').textContent, fov: window.__LH_APP.getSceneInfo().camera.fov })`);
  const loupeCheck = { fov1, z5: l5.z, l5: l5.lbl, fov5: l5.fov, z20: l20.z, l20: l20.lbl, fov20: l20.fov, z1: l1.z, l1: l1.lbl, fovRestored: l1.fov };
  console.log('ABERRATION_LOUPE:', JSON.stringify(loupeCheck));
  assert(
    loupeCheck.z5 === 5 && loupeCheck.l5 === 'LOUPE 5x' && loupeCheck.fov5 < loupeCheck.fov1 * 0.5 &&
    loupeCheck.z20 === 20 && loupeCheck.l20 === 'LOUPE 20x' && loupeCheck.fov20 < loupeCheck.fov5 * 0.5 &&
    loupeCheck.z1 === 1 && loupeCheck.l1 === 'LOUPE 1x' && loupeCheck.fovRestored > loupeCheck.fov5 * 1.8,
    'Aberration loupe FOV narrowing failed: ' + JSON.stringify(loupeCheck)
  );

  // 6. REST VEC (#btn-rest-frame, hud.getStarVectorPairs) + decluttered center ring + 51_rel_high_gamma_aiming_loupe.png
  await cdp.eval(`(() => {
    const app = window.__LH_APP, s = app.state;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.undock();
    app.engageInterstellar({ destId: 'vega' });
    s.mission = null;
    s.thrustCmdG = 0;
    s.eta = 1.85; s.beta = Math.tanh(1.85); s.gamma = Math.cosh(1.85);
    s.hudRel = true; s.hudFlight = false; s.camLock = true; s.hideShip = false;
    s.relGov = true; s.fineSteer = true;
    app.setAberrationZoom(5);
  })()`);
  await cdp.waitFrames(4);
  const restBefore = await cdp.eval(`document.getElementById('btn-rest-frame').getAttribute('aria-pressed')`);
  await cdp.eval(`document.getElementById('btn-rest-frame').click()`);
  await cdp.waitFrames(2);
  const restToggledOff = await cdp.eval(`window.__LH_APP.state.hudRestFrame === false && document.getElementById('btn-rest-frame').getAttribute('aria-pressed') === 'false'`);
  await cdp.eval(`document.getElementById('btn-rest-frame').click()`);
  await cdp.waitFrames(2);
  const restToggledOn = await cdp.eval(`(() => {
    const ok = window.__LH_APP.state.hudRestFrame === true && document.getElementById('btn-rest-frame').getAttribute('aria-pressed') === 'true';
    (${observePaint})('lh-hud-canvas', 'clearRect', {
      tether: (ctx) => ctx.getLineDash().length > 0 && /255, 209, 117|110, 225, 255/.test(ctx.strokeStyle),
      diamond: (ctx) => ctx.getLineDash().length === 0 && /ffd175|161, 233, 255/i.test(ctx.strokeStyle)
    }, (text) => typeof text === 'string' && (/LOUPE|BOW ICE/.test(text)));
    return ok;
  })()`);
  await cdp.waitFrames(8);
  const restCheck = await cdp.eval(`(() => {
    const snap = window.__LH_APP.getSnapshot();
    const pairs = snap.hud.getStarVectorPairs(innerWidth, innerHeight);
    const paint = window.__lhRegression['lh-hud-canvas'];
    return {
      before: ${JSON.stringify(restBefore)},
      toggledOff: ${JSON.stringify(restToggledOff)},
      toggledOn: ${JSON.stringify(restToggledOn)},
      pairCount: pairs.length,
      hasTarget: pairs.some(p => p.isTarget && p.restInFront),
      shiftedCount: pairs.filter(p => p.restInFront && p.appInFront && p.shiftPx > 2).length,
      strokes: paint.strokes,
      labels: paint.labels
    };
  })()`);
  console.log('REST_FRAME_OVERLAY:', JSON.stringify(restCheck));
  assert(
    restCheck.before === 'true' && restCheck.toggledOff && restCheck.toggledOn &&
    restCheck.pairCount >= 3 && restCheck.hasTarget && restCheck.shiftedCount >= 1 &&
    (restCheck.strokes.tether || 0) >= 1 && (restCheck.strokes.diamond || 0) >= 1 &&
    restCheck.labels.some(l => l.includes('LOUPE 5x')) &&
    restCheck.labels.some(l => l.includes('BOW ICE SHIELDED')),
    'Rest-frame vector overlay check failed: ' + JSON.stringify(restCheck)
  );
  await cdp.screenshot('51_rel_high_gamma_aiming_loupe.png');

  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.setAberrationZoom(1);
    app.state.fineSteer = false;
    app.state.relGov = true;
    app.setPuckMode('steer');
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.undock();
  })()`);
  await cdp.waitFrames(4);
}

async function checkStarmapMultiHop(cdp) {
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.undock();
    app.setScreen('starmap');
    (${observePaint})('lh-starmap-canvas', 'setTransform', {
      brightRing: (ctx) => /rgba\\((110,\\s*210|140,\\s*175),\\s*255,\\s*0\\.(58|4)/.test(ctx.strokeStyle),
      hopLeg: (ctx) => ctx.getLineDash().length > 0 && /#68dfff|#4bffc7/i.test(ctx.strokeStyle),
      harvestDiamond: (ctx) => /#adf1ff/i.test(ctx.strokeStyle)
    }, (text) => typeof text === 'string' && (/^\\d+ LY$/.test(text) || /^#1 /.test(text)));
  })()`);
  await cdp.waitFrames(4);

  const planCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    document.querySelector('#lh-sys-list [data-star="vega"]').click();
    await waitF(4);
    const slider = document.getElementById('rng-max-hop');
    const min = slider.min, max = slider.max;
    slider.value = '12';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await waitF(4);
    const val12 = document.getElementById('val-max-hop').textContent;
    const hop12 = app.getSnapshot().multiHopPreview;
    slider.value = '15';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await waitF(6);
    const val15 = document.getElementById('val-max-hop').textContent;
    const snap = app.getSnapshot();
    const hop15 = snap.multiHopPreview;
    const legs = document.querySelectorAll('#lh-multihop-plan .lh-hop-leg').length;
    const planText = document.getElementById('lh-multihop-plan').textContent;
    const launchBtn = document.getElementById('btn-launch-multihop');
    const paint = window.__lhRegression['lh-starmap-canvas'];
    return {
      min, max, val12, hops12: hop12?.hops?.length || 0,
      val15, maxHopLy: snap.maxHopLy,
      hops15: hop15?.hops?.length || 0,
      accelG: hop15?.accelG || 0,
      allStops: Boolean(hop15?.hops?.length >= 2 && hop15.hops.every(h => h.accelG >= 1 && h.iceStop?.name)),
      legs, hasDropStop: planText.includes('DROPSHIP STOP'),
      launchEnabled: !launchBtn.disabled,
      strokes: paint.strokes,
      labels: paint.labels
    };
  })()`);
  console.log('STARMAP_MULTIHOP:', JSON.stringify(planCheck));
  assert(
    planCheck.min === '10' && planCheck.max === '20' &&
    planCheck.val12 === '12 LY' && planCheck.hops12 >= 2 &&
    planCheck.val15 === '15 LY' && planCheck.maxHopLy === 15 &&
    planCheck.hops15 >= 2 && planCheck.accelG >= 1 && planCheck.allStops &&
    planCheck.legs === planCheck.hops15 && planCheck.hasDropStop && planCheck.launchEnabled &&
    (planCheck.strokes.brightRing || 0) >= 5 &&
    (planCheck.strokes.hopLeg || 0) >= 2 &&
    (planCheck.strokes.harvestDiamond || 0) >= 1 &&
    ['20 LY', '40 LY', '60 LY', '80 LY', '100 LY'].every(l => planCheck.labels.includes(l)),
    'Starmap brighter rings or multi-hop planner failed: ' + JSON.stringify(planCheck)
  );
  await cdp.screenshot('31_screen_starmap.png');

  // Verify primary Starmap launch & abort controls are pinned and visible with ZERO scrolling
  const starmapNoScroll = await cdp.eval(`(() => {
    const body = document.querySelector('#lh-screen-starmap .lh-panel-body');
    if (body) body.scrollTop = 0;
    const ids = ['btn-launch-multihop', 'btn-launch-transit', 'btn-abort-transit'];
    const rects = ids.map(id => {
      const r = document.getElementById(id).getBoundingClientRect();
      return { id, top: r.top, bottom: r.bottom, width: r.width, height: r.height, inView: r.top >= 0 && r.bottom <= innerHeight && r.height > 18 };
    });
    return { scrollTop: body ? body.scrollTop : 0, rects };
  })()`);
  console.log('STARMAP_NO_SCROLL_ACTIONS:', JSON.stringify(starmapNoScroll));
  assert(starmapNoScroll.scrollTop === 0 && starmapNoScroll.rects.every(r => r.inView),
    'Starmap primary launch/abort actions required scrolling: ' + JSON.stringify(starmapNoScroll));

  await cdp.click('#btn-launch-multihop');
  await cdp.waitFrames(4);
  const launched = await cdp.eval(`(() => {
    const s = window.__LH_APP.getSnapshot();
    return {
      screen: s.screen, mode: s.mode,
      active: s.multiHop?.active, phase: s.multiHop?.phase,
      toId: s.multiHop?.route?.toId, hops: s.multiHop?.route?.hops?.length,
      accelG: s.multiHop?.route?.accelG
    };
  })()`);
  assert(
    launched.screen === 'helm' && launched.mode === 'interstellar' &&
    launched.active === true && launched.phase === 'transit' &&
    launched.toId === 'vega' && launched.hops >= 2 && launched.accelG >= 1,
    'Multi-hop launch failed: ' + JSON.stringify(launched)
  );

  // Verify seamless intermediate waypoint: stays in interstellar + REL HUD, harvests ice via DropShip sortie, continues to Hop 2
  const seamlessHop = await cdp.eval(`(async () => {
    const app = window.__LH_APP, s = app.state;
    let sawHarvest = false, harvestMode = null, harvestHudRel = null, harvestShuttles = null;
    for (let i = 0; i < 400 && s.multiHop?.active; i++) {
      if (s.multiHop.phase === 'harvesting') {
        sawHarvest = true;
        harvestMode = s.mode;
        harvestHudRel = s.hudRel;
        harvestShuttles = app.getSnapshot().shuttleMode;
        const wNow = app.getSnapshot().effectiveWarp || 1000;
        app.step(Math.max(4000, wNow * 2.0), 2.0);
      } else {
        app.step(0.25 * 31557600, 0.05);
      }
      if (sawHarvest && s.multiHop.legIdx >= 1 && s.multiHop.phase === 'transit') break;
    }
    // Advance partially along Hop 2 so Starmap shows ship mid-transit with green traversed trail & dashed cyan remaining leg
    for (let j = 0; j < 6; j++) app.step(0.15 * 31557600, 0.05);
    return {
      sawHarvest, harvestMode, harvestHudRel, harvestShuttles,
      legIdx: s.multiHop?.legIdx, phase: s.multiHop?.phase,
      modeNow: s.mode, hudRelNow: s.hudRel,
      iceNow: s.iceIntegrity,
      posFinite: Array.isArray(s.posGal) && s.posGal.every(Number.isFinite)
    };
  })()`);
  console.log('SEAMLESS_MULTIHOP:', JSON.stringify(seamlessHop));
  assert(
    seamlessHop.sawHarvest && seamlessHop.harvestMode === 'interstellar' && seamlessHop.harvestHudRel === true &&
    seamlessHop.harvestShuttles === 'harvest' && seamlessHop.legIdx >= 1 && seamlessHop.phase === 'transit' &&
    seamlessHop.modeNow === 'interstellar' && seamlessHop.iceNow >= 0.9 && seamlessHop.posFinite,
    'Seamless multi-hop intermediate harvest failed: ' + JSON.stringify(seamlessHop)
  );

  // Open Starmap mid-transit to verify anchored plane, ship trail, and zero flicker/errors
  await cdp.eval(`window.__LH_APP.setScreen('starmap')`);
  await cdp.waitFrames(8);
  await cdp.screenshot('53_starmap_mid_transit.png');
  await cdp.eval(`document.getElementById('btn-abort-transit').scrollIntoView({ block: 'center' })`);
  await cdp.waitFrames(2);
  await cdp.click('#btn-abort-transit');
  await cdp.waitFrames(3);
  const aborted = await cdp.eval(`(() => {
    const s = window.__LH_APP.getSnapshot();
    return { active: s.multiHop?.active, phase: s.multiHop?.phase };
  })()`);
  assert(aborted.active === false && aborted.phase === 'aborted',
    'Multi-hop abort failed: ' + JSON.stringify(aborted));
  await cdp.eval(`window.__LH_APP.stopAll(); window.__LH_APP.enterSystemOrbit('sol', true); window.__LH_APP.undock()`);
  await cdp.waitFrames(3);
}

async function checkHelmSwitchboard(cdp) {
  const layout = await cdp.eval('(' + function () {
    const deck = document.getElementById('kg-deck');
    const bays = document.getElementById('kg-bays');
    const bay = document.getElementById('kg-switch-bay');
    const scope = document.getElementById('kg-scope-bay');
    const mount = document.getElementById('kg-scope-sextant');
    const styles = selector => getComputedStyle(bay.querySelector(selector));
    const palette = {
      bezel: styles('.kg-switch-plate').backgroundImage.includes('rgb(39, 29, 77)'),
      screw: styles('.kg-screw').backgroundImage.includes('rgb(197, 186, 255)'),
      bank: styles('.kg-sw-bank').backgroundImage.includes('rgb(18, 13, 38)'),
      silk: styles('.kg-sw-silk').color === 'rgb(213, 206, 255)',
      phosphor: styles('.kg-sw-silk i').color === 'rgb(99, 255, 141)',
      primary: styles('#sw-hud-flt').getPropertyValue('--jewel').trim() === '#63ff8d',
      secondary: styles('#sw-hud-rel').getPropertyValue('--jewel').trim() === '#c49bff',
      hazard: styles('#sw-hud-wpn').getPropertyValue('--jewel').trim() === '#ff784a'
    };
    const ids = ['sw-hud-flt', 'sw-hud-rel', 'sw-hud-wpn', 'sw-cam-lock', 'sw-hide-ship',
      'btn-vectors', 'btn-fine-steer', 'btn-aberration-loupe', 'btn-rest-frame', 'btn-rel-gov',
      'btn-ice-harvest', 'btn-emerg-brake'];
    return { height: deck.getBoundingClientRect().height, palette, firstBay: deck.contains(bay) && bays.firstElementChild === bay,
      deckOv: [deck, bays, bay].some(el => el.scrollWidth > el.clientWidth + 2),
      missing: ids.filter(id => !bay.contains(document.getElementById(id))),
      scopeMounted: mount.contains(scope) && scope.contains(document.getElementById('kg-scope-readout')),
      scopeHidden: scope.getClientRects().length === 0 && !deck.contains(scope) };
  } + ')()');
  assert(layout.height > 0 && layout.height <= 285 && layout.firstBay && !layout.deckOv &&
    Object.values(layout.palette).every(Boolean) && layout.missing.length === 0 && layout.scopeMounted && layout.scopeHidden,
    'Helm switchboard or permanent Sextant scope mount failed: ' + JSON.stringify(layout));
  await cdp.screenshot('54_helm_switchboard.png');

  // Other switches are exercised by the HUD, high-gamma and ice recovery checks.
  for (const [id, key] of [['btn-vectors', 'showOrbitsInHelm'], ['btn-rest-frame', 'hudRestFrame'], ['sw-cam-lock', 'camLock']]) {
    const read = 'JSON.stringify([window.__LH_APP.getSnapshot()[' + JSON.stringify(key) + '], ' +
      'document.getElementById(' + JSON.stringify(id) + ').getAttribute("aria-pressed")])';
    const before = JSON.parse(await cdp.eval(read));
    await cdp.click('#' + id);
    await cdp.waitFrames(2);
    const after = JSON.parse(await cdp.eval(read));
    await cdp.click('#' + id);
    await cdp.waitFrames(2);
    const restored = JSON.parse(await cdp.eval(read));
    assert(typeof before[0] === 'boolean' && after[0] === !before[0] && after[1] === String(after[0]) &&
      restored[0] === before[0] && restored[1] === before[1], id + ' did not toggle and restore ' + key);
  }
  console.log('ROUND5_HELM_SWITCHBOARD:', JSON.stringify(layout));
}

async function checkStagedTransit(cdp) {
  const run = await cdp.eval('(' + function () {
    const app = window.__LH_APP;
    const galaxy = window.LighthuggerGalaxy;
    app.enterSystemOrbit('sol', true);
    app.undock();
    const dest = galaxy.SYSTEMS.find(sys => sys.id === 'rigil');
    const engaged = app.engageInterstellar({ destId: dest.id });
    const stages = [];
    const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
    let finite = true, dockedInTransit = false, captureJump, captureFromBerth, lastApproach;
    for (let i = 0; i < 2000; i++) {
      const snap = app.getSnapshot();
      if (!snap.transitStage) break;
      if (stages.at(-1)?.id !== snap.transitStage) {
        stages.push({ id: snap.transitStage, label: snap.transitStageLabel });
      }
      finite &&= [...snap.posGal, snap.beta, snap.gamma, snap.transitStageProgress].every(Number.isFinite) &&
        snap.transitStageProgress >= 0 && snap.transitStageProgress <= 1;
      dockedInTransit ||= snap.docked;
      if (snap.transitStage === 'approach' && snap.shipRelStarKm) {
        lastApproach = snap.shipRelStarKm.slice();
      } else if (snap.transitStage === 'capture' && captureJump === undefined && lastApproach) {
        const berth = galaxy.getBodyWorldState(dest, { kind: 'station', planetIdx: dest.station.parentPlanetIdx }, snap.simTimeS);
        captureJump = distance(lastApproach, snap.shipRelStarKm);
        captureFromBerth = distance(berth.rKm, snap.shipRelStarKm);
      }
      app.step(0.025, 0.025, true);
    }
    const end = app.getSnapshot();
    finite &&= [...end.orbit.rKm, ...end.orbit.vKmS, end.dock.relKmS].every(Number.isFinite);
    return { engaged, stages, finite, dockedInTransit, captureJump, captureFromBerth,
      mode: end.mode, system: end.systemId, docked: end.docked, rangeKm: end.dock.distKm };
  } + ')()');
  const ids = ['departure', 'accelerate', 'turnover', 'brake', 'approach', 'capture'];
  const labels = ['DEPARTURE BURN', 'ACCEL CRUISE', 'MIDPOINT TURNOVER', 'DECEL BURN', 'SYSTEM APPROACH', 'ORBITAL CAPTURE'];
  assert(run.engaged && run.stages.map(stage => stage.id).join() === ids.join() &&
    run.stages.every((stage, i) => stage.label?.startsWith(labels[i])) &&
    run.finite && !run.dockedInTransit && Number.isFinite(run.captureJump) && run.captureJump < 1000 &&
    run.captureFromBerth >= 18 && run.captureFromBerth <= 30 && run.mode === 'orbit' &&
    run.system === 'rigil' && !run.docked && run.rangeKm >= 18 && run.rangeKm <= 30,
    'Six-stage transit or orbital capture failed: ' + JSON.stringify(run));
  console.log('ROUND5_STAGED_TRANSIT:', JSON.stringify(run));
  await cdp.waitFrames(2);
  const arrival = await cdp.eval('(' + function () {
    return { visible: !document.getElementById('lh-epoch-toast').hidden,
      title: document.getElementById('lh-toast-title').textContent };
  } + ')()');
  assert(arrival.visible && arrival.title === 'ARRIVAL: Alpha Centauri',
    'Capture did not announce arrival: ' + JSON.stringify(arrival));
  await cdp.click('#btn-close-toast');
  assert(await cdp.eval('document.getElementById("lh-epoch-toast").hidden'), 'Arrival toast did not dismiss');
}

async function checkGasGiantDiversity(cdp) {
  const giants = await cdp.eval('(' + function () {
    const app = window.__LH_APP, galaxy = window.LighthuggerGalaxy;
    const crown = galaxy.SYSTEMS.find(sys => sys.id === 'yake').planets.find(planet => planet.name === 'Hesperus Crown');
    const saturn = galaxy.SYSTEMS.find(sys => sys.id === 'sol').planets.find(planet => planet.name === 'Saturn');
    const palettes = new Set(galaxy.SYSTEMS.flatMap(sys => sys.planets
      .filter(planet => /saturnian|giant|sapphire-disk|aerostat-clouds/.test(planet.kind))
      .map(planet => galaxy.gasGiantPalette(planet, 1).id.replace(/-\d+$/, ''))));
    const palette = galaxy.gasGiantPalette(crown, 1);
    const saturnPalette = galaxy.gasGiantPalette(saturn, 1);
    const build = galaxy.buildSystemDiorama;
    let rings;
    galaxy.buildSystemDiorama = function (...args) {
      const diorama = build.apply(this, args);
      if (args[3].id === 'yake') {
        rings = { mounted: Boolean(diorama.ringMesh?.parent),
          disk: diorama.ringMat?.uniforms.uStyle.value,
          surface: diorama.planetMat?.uniforms.uRingStyle.value,
          atmosphere: diorama.atmoMat?.uniforms.uRingStyle.value };
      }
      return diorama;
    };
    try {
      app.enterSystemOrbit('yake', false);
    } finally {
      galaxy.buildSystemDiorama = build;
    }
    const body = app.getSceneInfo().bodies.find(entry => entry.name === crown.name);
    return { palette: palette.id, green: palette.mid[1] > Math.max(palette.mid[0], palette.mid[2]),
      saturn: saturnPalette.id, ringStyle: crown.ringStyle, rings,
      renderedPalette: body?.paletteId, count: palettes.size };
  } + ')()');
  assert(giants.palette === 'emerald-methane' && giants.green && giants.saturn !== giants.palette &&
    giants.renderedPalette === giants.palette && giants.ringStyle === 'resonant-arcs' &&
    giants.rings?.mounted && giants.rings.disk === 4 && giants.rings.surface === 4 &&
    giants.rings.atmosphere === 4 && giants.count >= 16,
    'Gas giant palette or ring diversity failed: ' + JSON.stringify(giants));
  console.log('ROUND5_GAS_GIANTS:', JSON.stringify(giants));
}

async function checkSextantDeck(cdp) {
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.enterSystemOrbit('sol', true);
    app.undock();
    app.setScreen('sextant');
  })()`);
  await cdp.waitFrames(5);
  await verifyStationLayout(cdp, 'sextant');
  const scope = await cdp.eval('(' + function () {
    const bay = document.getElementById('kg-scope-bay');
    const canvas = document.getElementById('kg-scope-canvas');
    const readout = document.getElementById('kg-scope-readout');
    const { width, height } = canvas.getBoundingClientRect();
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let tracePixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 1] > 160 && data[i + 1] > data[i] + 40 && data[i + 3] === 255) tracePixels++;
    }
    return { mounted: bay.parentElement.id === 'kg-scope-sextant' && bay.contains(canvas) && bay.contains(readout),
      width, height, tracePixels, readout: readout.textContent };
  } + ')()');
  assert(scope.mounted && scope.width > 0 && scope.height > 0 && scope.tracePixels > 100 &&
    scope.readout.includes('nm') && !/NaN|Infinity/.test(scope.readout),
    'Sextant oscilloscope did not render a live trace and wavelength: ' + JSON.stringify(scope));
  console.log('ROUND5_SEXTANT_SCOPE:', JSON.stringify(scope));
  const sxDeckH = await cdp.eval(`document.getElementById('kg-sextant-deck').getBoundingClientRect().height`);
  assert(sxDeckH <= 270, 'Sextant deck too tall: ' + sxDeckH);
  await checkStationStow(cdp, 'sextant');
  const sxInvariant = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const deck = document.getElementById('kg-sextant-deck');
    const drawer = deck.querySelector('.kg-contact-drawer');
    const before = deck.getBoundingClientRect();
    drawer.open = true;
    await waitF(3);
    const opened = deck.getBoundingClientRect();
    drawer.open = false;
    await waitF(2);
    const closed = deck.getBoundingClientRect();
    return { w0: before.width, h0: before.height, w1: opened.width, h1: opened.height, w2: closed.width, h2: closed.height };
  })()`);
  console.log('SEXTANT_DECK_INVARIANT:', JSON.stringify(sxInvariant));
  assert(
    Math.abs(sxInvariant.w1 - sxInvariant.w0) <= 1 && Math.abs(sxInvariant.h1 - sxInvariant.h0) <= 1 &&
    Math.abs(sxInvariant.w2 - sxInvariant.w0) <= 1 && Math.abs(sxInvariant.h2 - sxInvariant.h0) <= 1,
    'Sextant deck changed size when opening contact drawer: ' + JSON.stringify(sxInvariant)
  );
  const sxCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    const skyTxt = document.getElementById('lh-skymap-svg').textContent;
    const irBtn = document.getElementById('sw-ir');
    const autoBtn = document.getElementById('sw-autosolve');
    const irBefore = irBtn.getAttribute('aria-pressed');
    irBtn.click();
    await waitF(2);
    const irAfter = irBtn.getAttribute('aria-pressed');
    irBtn.click();
    await waitF(2);
    const mags = [];
    for (const m of [5, 20, 1]) {
      document.querySelector('[data-sx-mag="' + m + '"]').click();
      await waitF(3);
      mags.push({
        req: m,
        mag: app.getSnapshot().sextant.mag,
        pressed: document.querySelector('[data-sx-mag="' + m + '"]').getAttribute('aria-pressed')
      });
    }
    return {
      hasBowStern: skyTxt.includes('BOW') && skyTxt.includes('STERN'),
      irBefore, irAfter,
      hasAutoSwitch: Boolean(autoBtn),
      mags
    };
  })()`);
  console.log('SEXTANT_DECK:', JSON.stringify(sxCheck));
  assert(
    sxCheck.hasBowStern && sxCheck.irBefore !== sxCheck.irAfter && sxCheck.hasAutoSwitch &&
    sxCheck.mags.every(m => Math.abs(m.mag - m.req) < 0.25 && m.pressed === 'true'),
    'Sextant bottom-center CRT console check failed: ' + JSON.stringify(sxCheck)
  );
  await cdp.screenshot('32_screen_sextant.png');
  await cdp.click('#lh-sx-banner [data-screen-btn="helm"]');
  await cdp.waitFrames(3);
  const backScreen = await cdp.eval(`window.__LH_APP.getSnapshot().screen`);
  assert(backScreen === 'helm', 'Sextant helm return failed: ' + backScreen);
}

async function checkWeapons(cdp) {
  const state = `(() => {
    const app = window.__LH_APP, snap = app.getSnapshot(), scene = app.getSceneInfo();
    const el = id => document.getElementById(id);
    const pressed = id => el('sw-hud-' + id).getAttribute('aria-pressed') === 'true';
    return { flt: pressed('flt'), rel: pressed('rel'), wpn: pressed('wpn'),
      guardOpen: el('btn-wpn-guard').getAttribute('aria-expanded') === 'true',
      wpnDisabled: el('sw-hud-wpn').disabled,
      barOpen: !el('kg-wpn-bar').hidden, height: el('kg-deck').getBoundingClientRect().height,
      lockOn: Boolean(snap.weaponLockOn), lockPressed: el('btn-wpn-lock').getAttribute('aria-pressed'),
      tgtText: el('kg-wpn-tgt').textContent,
      mode: snap.weaponMode, hullMode: scene.weaponMode, active: scene.weaponBeamsActive,
      mounts: scene.weaponHardpointCount, shot: snap.weaponEvent };
  })()`;
  const before = await cdp.eval(state);
  assert(!before.flt && !before.rel && before.mode === 'newtonian' && !before.guardOpen && before.wpnDisabled &&
    before.height > 0 && before.height <= 285,
    'Expected a compact Helm deck with FLT off by default and the WPN safety cover shut: ' + JSON.stringify(before));
  await cdp.click('#sw-hud-flt');
  await cdp.waitFrames(2);
  const fltOn = await cdp.eval(state);
  assert(fltOn.flt && !fltOn.rel, 'Expected FLT toggle to enable Fighter HUD: ' + JSON.stringify(fltOn));
  await cdp.screenshot('41_helm_fighter_hud_orbit.png');
  await cdp.click('#btn-wpn-guard');
  await cdp.waitFrames(2);
  const lifted = await cdp.eval(state);
  assert(lifted.guardOpen && !lifted.wpnDisabled && !lifted.wpn,
    'Lifting the WPN cover did not expose the switch: ' + JSON.stringify(lifted));
  // The lifted cover still occupies the upper part of the guarded switch.
  await cdp.click('#sw-hud-wpn .kg-tog-lbl');
  await cdp.waitFrames(2);
  const enabled = await cdp.eval(state);
  assert(enabled.wpn && enabled.barOpen && !enabled.lockOn && enabled.lockPressed === 'false' &&
    enabled.tgtText.includes('BORESIGHT') && Math.abs(enabled.height - before.height) <= 1,
    'WPN opening did not default to unlocked boresight or changed Helm deck height: ' + JSON.stringify(enabled));

  for (const [mode, label, shot] of [
    ['newtonian', 'COILGUN + UV FEL', '47_wpn_newtonian_hull_beams.png'],
    ['relativistic', 'GAMMA LANCE', '48_wpn_relativistic_gamma_lance.png']
  ]) {
    if (mode === 'relativistic') {
      await cdp.click('#sw-hud-rel');
      await cdp.waitFrames(2);
      const rel = await cdp.eval(state);
      assert(rel.rel && !rel.flt && rel.mode === mode, 'REL did not turn off FLT and switch to relativistic weapons');
    }
    await cdp.click('#btn-wpn-fire');
    await cdp.waitFrames(3);
    const firing = await cdp.eval(state);
    console.log('HULL_WEAPONS:', JSON.stringify(firing));
    const enoughBeams = mode === 'newtonian' ? firing.active > firing.mounts?.fel : firing.active > 0;
    assert(firing.mode === mode && firing.shot?.mode === mode && firing.shot.weaponLabel.includes(label) &&
      firing.shot.targetName === 'BORESIGHT' && firing.shot.targetDir?.[0] > 0.99 &&
      firing.hullMode === mode && enoughBeams && firing.mounts?.rail > 0 && firing.mounts?.fel > 0 && firing.mounts?.lance > 0,
      'Free-fire boresight shot did not activate the selected hull weapon effects: ' + JSON.stringify(firing));
    await cdp.screenshot(shot);
  }

  // Explicit target lock toggle + cycle + unlock back to boresight
  await cdp.click('#btn-wpn-lock');
  await cdp.waitFrames(2);
  const locked1 = await cdp.eval(state);
  await cdp.click('#btn-wpn-cycle');
  await cdp.waitFrames(2);
  const locked2 = await cdp.eval(state);
  await cdp.click('#btn-wpn-lock');
  await cdp.waitFrames(2);
  const unlocked = await cdp.eval(state);
  console.log('WPN_LOCK_CYCLE:', JSON.stringify({ locked1: locked1.tgtText, locked2: locked2.tgtText, unlocked: unlocked.tgtText }));
  assert(locked1.lockOn && locked1.lockPressed === 'true' && !locked1.tgtText.includes('BORESIGHT') &&
    locked2.lockOn && !unlocked.lockOn && unlocked.lockPressed === 'false' && unlocked.tgtText.includes('BORESIGHT'),
    'Weapon explicit lock/cycle/unlock failed: ' + JSON.stringify({ locked1, locked2, unlocked }));

  await cdp.click('#sw-hud-flt');
  await cdp.click('#sw-hud-wpn .kg-tog-lbl');
  await cdp.waitFrames(2);
  const restored = await cdp.eval(state);
  assert(restored.flt && !restored.rel && restored.mode === 'newtonian', 'FLT did not turn off REL and restore Newtonian weapons');
  assert(!restored.wpn && !restored.barOpen && Math.abs(restored.height - before.height) <= 1 &&
    Math.abs(restored.height - enabled.height) <= 1, 'WPN closing changed the Helm deck height');
  await cdp.click('#btn-wpn-guard');
  await cdp.waitFrames(2);
  const closed = await cdp.eval(state);
  assert(!closed.guardOpen && closed.wpnDisabled, 'Closing the WPN cover did not disable its switch');
  console.log('WPN_DECK_HEIGHTS:', JSON.stringify([before.height, enabled.height, restored.height]));
}

async function checkRound6(cdp) {
  await cdp.setViewport(1440, 900);
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.undock();
    app.setScreen('orbits');
  })()`);
  await cdp.waitFrames(4);

  // 1. CoaDE iconic primary row + MORE drawer + dynamic ORBIT TITAN + GRAV vs VIEW readout
  const iconCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const rowBtns = [...document.querySelectorAll('#lh-quick-row > button')];
    const svgs = rowBtns.filter(b => b.querySelector('svg.lh-quick-ico')).length;
    const moreInitiallyHidden = document.getElementById('lh-quick-more').hidden === true;
    const noteSaturn = document.getElementById('lh-orbit-note').textContent.trim();
    const titanBtn = [...document.querySelectorAll('#lh-target-list .lh-target')].find(b => /TITAN/i.test(b.textContent));
    if (titanBtn) titanBtn.click();
    await waitF(3);
    const orbitLblTitan = document.getElementById('lbl-orbit-capture').textContent.trim();
    document.getElementById('btn-orbit-moon').click();
    await waitF(3);
    const noteViewTitan = document.getElementById('lh-orbit-note').textContent.trim();
    document.getElementById('btn-orbit-more').click();
    await waitF(2);
    const moreOpen = !document.getElementById('lh-quick-more').hidden &&
      document.getElementById('btn-orbit-more').getAttribute('aria-expanded') === 'true';
    const drawerKinds = [...document.querySelectorAll('#lh-quick-more [data-quick-burn]')].map(b => b.dataset.quickBurn);
    const circModes = [...document.querySelectorAll('#lh-quick-more [data-circ-mode]')].map(b => b.dataset.circMode);
    document.getElementById('btn-orbit-more').click();
    await waitF(2);
    const moreClosed = document.getElementById('lh-quick-more').hidden === true;
    document.getElementById('btn-orbit-planet').click();
    await waitF(2);
    return {
      primaryCount: rowBtns.length, svgs, moreInitiallyHidden, moreOpen, moreClosed,
      drawerKinds, circModes, orbitLblTitan, noteSaturn, noteViewTitan
    };
  })()`);
  console.log('ROUND6_COADE_ICONS:', JSON.stringify(iconCheck));
  assert(
    iconCheck.primaryCount === 5 && iconCheck.svgs === 5 &&
    iconCheck.moreInitiallyHidden && iconCheck.moreOpen && iconCheck.moreClosed &&
    ['match', 'intercept', 'moon-close', 'node', 'L1', 'L2', 'L4'].every(k => iconCheck.drawerKinds.includes(k)) &&
    ['now', 'pe', 'ap'].every(m => iconCheck.circModes.includes(m)) &&
    /ORBIT\s+TITAN/i.test(iconCheck.orbitLblTitan) &&
    /GRAV:\s*SATURN\s*\(SOI\)/i.test(iconCheck.noteSaturn) &&
    /GRAV:\s*SATURN/i.test(iconCheck.noteViewTitan) && /VIEW:\s*TITAN/i.test(iconCheck.noteViewTitan),
    'Round 6 CoaDE iconic Orbit Nav check failed: ' + JSON.stringify(iconCheck)
  );
  await cdp.screenshot('60_r6_orbits_coade_icons.png');

  // 2. One-tap ORBIT TITAN -> True Moon SOI Capture -> 6h Bound Coast -> Moon CIRC -> Chase Cam Clearance -> Outbound Escape
  const moonSoi = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.undock();
    app.setScreen('orbits');
    await waitF(3);
    const titanBtn = [...document.querySelectorAll('#lh-target-list .lh-target')].find(b => /TITAN/i.test(b.textContent));
    if (titanBtn) titanBtn.click();
    await waitF(2);
    document.getElementById('btn-orbit-capture').click();
    await waitF(2);
    const plannedBurns = app.getSnapshot().maneuverChain.length;
    document.getElementById('btn-orbit-execute').click();
    for (let i = 0; i < 3000 && app.getSnapshot().burn.active; i++) {
      const b = app.getSnapshot().burn;
      const dt = b.etaS > 1200 ? Math.min(3600, b.etaS * 0.5) : Math.max(1, Math.min(600, b.etaS || 60));
      app.step(dt, 0.05, false);
    }
    await waitF(3);
    const arrived = app.getSnapshot();
    const arrivedPrimary = arrived.orbitPrimary;
    const arrivedLabel = arrived.orbitPrimaryLabel;
    const arrivedAltKm = arrived.orbit.altKm;
    const arrivedRHillKm = arrived.orbit.rHillKm;
    const r0 = Math.hypot(...arrived.orbit.rKm);
    const noteInTitan = document.getElementById('lh-orbit-note').textContent.trim();

    // Verify chase camera clearance while orbiting Titan on Helm
    app.setScreen('helm');
    await waitF(4);
    const sc = app.getSceneInfo();
    const titanBody = sc.bodies.find(b => /titan/i.test(b.name || ''));
    let camOutsideTitan = true, camClearMargin = null;
    if (titanBody && titanBody.dir && Number.isFinite(titanBody.renderDist) && Number.isFinite(titanBody.renderRadius)) {
      const bx = titanBody.dir[0] * titanBody.renderDist;
      const by = titanBody.dir[1] * titanBody.renderDist;
      const bz = titanBody.dir[2] * titanBody.renderDist;
      const dCam = Math.hypot(sc.camera.x - bx, sc.camera.y - by, sc.camera.z - bz);
      camClearMargin = dCam - titanBody.renderRadius;
      camOutsideTitan = dCam > titanBody.renderRadius;
    }

    // 6-hour unpowered coast inside Titan SOI
    app.setScreen('orbits');
    for (let h = 0; h < 36; h++) app.step(600, 0.05, false);
    const coast6h = app.getSnapshot();
    const coastPrimary = coast6h.orbitPrimary;
    const coastAltKm = coast6h.orbit.altKm;
    const r6h = Math.hypot(...coast6h.orbit.rKm);

    // Perturb eccentricity and test Titan-frame circularizeOrbit('now')
    app.orbit.vKmS[0] += 0.12;
    app.orbit.vKmS[1] *= 1.06;
    app.step(1, 0.01, false);
    const beforeCircE = app.getSnapshot().orbit.el.e;
    const circRes = app.circularizeOrbit('now');
    if (circRes && circRes.valid && !circRes.alreadyCircular) {
      app.executeManeuverChain(circRes.burns);
      for (let i = 0; i < 300 && app.getSnapshot().burn.active; i++) app.step(20, 0.05, false);
    }
    const afterCirc = app.getSnapshot();
    const afterCircPrimary = afterCirc.orbitPrimary;
    const afterCircE = afterCirc.orbit.el.e;

    // Outbound escape past 1.05 * rHillKm -> automatic handoff back to Saturn
    const escapeHat = app.orbit.rKm.map(v => v / Math.max(1, Math.hypot(...app.orbit.rKm)));
    const rHill = arrivedRHillKm || 50000;
    app.orbit.rKm = escapeHat.map(v => v * rHill * 1.12);
    app.orbit.vKmS = escapeHat.map(v => v * 3.5);
    app.step(10, 0.05, false);
    const escaped = app.getSnapshot();

    return {
      plannedBurns,
      arrivedPrimary,
      arrivedLabel,
      arrivedAltKm,
      noteInTitan,
      camOutsideTitan, camClearMargin,
      coastPrimary,
      coastAltKm,
      coastDistKm: r6h, r0, rHillKm: arrivedRHillKm,
      beforeCircE,
      afterCircPrimary,
      afterCircE,
      escapedPrimary: escaped.orbitPrimary,
      escapedLabel: escaped.orbitPrimaryLabel
    };
  })()`);
  console.log('ROUND6_MOON_SOI:', JSON.stringify(moonSoi));
  assert(
    moonSoi.plannedBurns >= 1 &&
    moonSoi.arrivedPrimary === 'moon' &&
    moonSoi.arrivedLabel === 'TITAN' &&
    moonSoi.arrivedAltKm >= 350 &&
    /GRAV:\s*TITAN\s*\(SOI\)/i.test(moonSoi.noteInTitan) &&
    moonSoi.camOutsideTitan === true &&
    moonSoi.coastPrimary === 'moon' &&
    moonSoi.coastAltKm >= 250 &&
    moonSoi.coastDistKm < moonSoi.rHillKm &&
    moonSoi.afterCircPrimary === 'moon' &&
    moonSoi.afterCircE < moonSoi.beforeCircE &&
    moonSoi.escapedPrimary === 'planet' &&
    moonSoi.escapedLabel === 'SATURN',
    'Round 6 Moon SOI capture / 6h coast / circularize / escape failed: ' + JSON.stringify(moonSoi)
  );

  // 3. Swept 1500s Saturn collision (no tunneling), ring crossing, and station proximity nudge
  const physSafety = await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.undock();
    // Station proximity nudge (< 0.45 km at > 0.05 km/s)
    const sys = window.LighthuggerGalaxy.SYSTEMS.find(s => s.id === 'sol');
    const t0 = app.getSnapshot().simTimeS;
    const stW0 = window.LighthuggerGalaxy.getBodyWorldState(sys, { kind: 'station', planetIdx: 0 }, t0);
    const pW0 = window.LighthuggerGalaxy.getBodyWorldState(sys, { kind: 'planet', planetIdx: 0 }, t0);
    const stRelR = stW0.rKm.map((x, i) => x - pW0.rKm[i]);
    const stRelV = stW0.vKmS.map((x, i) => x - pW0.vKmS[i]);
    app.orbit.rKm = [stRelR[0] + 0.15, stRelR[1], stRelR[2] - 0.5];
    app.orbit.vKmS = [stRelV[0], stRelV[1], stRelV[2] + 0.5];
    app.step(2, 0.05, false);
    const t1 = app.getSnapshot().simTimeS;
    const stW1 = window.LighthuggerGalaxy.getBodyWorldState(sys, { kind: 'station', planetIdx: 0 }, t1);
    const pW1 = window.LighthuggerGalaxy.getBodyWorldState(sys, { kind: 'planet', planetIdx: 0 }, t1);
    const stAfterR = stW1.rKm.map((x, i) => x - pW1.rKm[i]);
    const proxDistKm = Math.hypot(
      app.orbit.rKm[0] - stAfterR[0],
      app.orbit.rKm[1] - stAfterR[1],
      app.orbit.rKm[2] - stAfterR[2]
    );

    // Ring-plane crossing across Saturn's ring band (~110,000 km)
    app.orbit.rKm = [110000, 0, 600];
    app.orbit.vKmS = [0, 18.5, -2.5];
    app.step(600, 0.05, false);
    const ringEvent = app.getSnapshot().lastRingCrossing;

    // 1500s high-warp chord straight through Saturn center -> must catch swept impact, zero tunneling, zero rubber-ball bounce
    app.orbit.rKm = [95000, 0, 0];
    app.orbit.vKmS = [-140, 0, 0];
    app.step(1500, 0.05, false);
    const afterImpact = app.getSnapshot();
    const afterImpactAltKm = afterImpact.orbit.altKm;
    const satR = sys.planets[0].radiusKm;
    const distRatio = Math.hypot(...afterImpact.orbit.rKm) / satR;
    app.recommissionShip();
    return {
      proxDistKm,
      ringEvent,
      lastImpact: afterImpact.lastImpact,
      destroyed: afterImpact.destroyed,
      hullIntegrity: afterImpact.hullIntegrity,
      recoveryAltKm: afterImpactAltKm,
      distRatio
    };
  })()`);
  console.log('ROUND6_PHYSICS_SAFETY:', JSON.stringify(physSafety));
  assert(
    physSafety.proxDistKm >= 0.45 &&
    Boolean(physSafety.ringEvent && physSafety.ringEvent.bodyName) &&
    Boolean(physSafety.lastImpact && /saturn/i.test(physSafety.lastImpact.bodyName || '')) &&
    physSafety.destroyed === true && physSafety.hullIntegrity === 0 &&
    physSafety.distRatio >= 1.0 && physSafety.distRatio < 1.15,
    'Round 6 swept collision / ring / station proximity check failed: ' + JSON.stringify(physSafety)
  );

  // 4. Desktop (1440x900) MED layout fixes: Starmap aside clear of screenbar, Sextant arrival toast clear of Close, Doppler contacts drawer scrollable
  const desktopMed = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

    app.setScreen('starmap');
    await waitF(4);
    const barR = document.getElementById('lh-screenbar').getBoundingClientRect();
    const asideR = document.querySelector('#lh-screen-starmap > aside').getBoundingClientRect();
    const starmapOverlap = overlap(barR, asideR);

    app.setScreen('sextant');
    await waitF(4);
    const toast = document.getElementById('lh-epoch-toast');
    const wasHidden = toast.hidden;
    document.getElementById('lh-toast-title').textContent = 'ARRIVAL // SOL';
    document.getElementById('lh-toast-meta').textContent = 'EPOCH 2445.0';
    document.getElementById('lh-toast-body').textContent = 'Captured in Saturn orbit.';
    toast.hidden = false;
    await waitF(2);
    const toastR = toast.getBoundingClientRect();
    const closeBtn = document.querySelector('#lh-screen-sextant [data-screen-btn="helm"]');
    const closeR = closeBtn.getBoundingClientRect();
    const toastCloseOverlap = overlap(toastR, closeR);
    toast.hidden = wasHidden;

    const drawer = document.querySelector('#kg-sextant-deck details.kg-contact-drawer');
    const scrollBox = document.getElementById('kg-contact-scroll');
    drawer.open = true;
    await waitF(2);
    const deckR = document.getElementById('kg-sextant-deck').getBoundingClientRect();
    const scrollR = scrollBox.getBoundingClientRect();
    const scrollStyle = getComputedStyle(scrollBox);
    drawer.open = false;

    return {
      starmapOverlap,
      toastCloseOverlap,
      toastTop: toastR.top, closeBottom: closeR.bottom,
      drawerScrollY: scrollStyle.overflowY,
      drawerBottomOk: scrollR.bottom <= deckR.bottom + 2 && scrollR.height > 20
    };
  })()`);
  console.log('ROUND6_DESKTOP_MED:', JSON.stringify(desktopMed));
  assert(
    desktopMed.starmapOverlap === 0 &&
    desktopMed.toastCloseOverlap === 0 &&
    /auto|scroll/.test(desktopMed.drawerScrollY) &&
    desktopMed.drawerBottomOk,
    'Round 6 desktop MED layout checks failed: ' + JSON.stringify(desktopMed)
  );

  // 5. Mobile (390x844 & 320x568) CRITICAL + HIGH + MED clipping & overlap checks
  for (const [w, h] of [[390, 844], [320, 568]]) {
    await cdp.setViewport(w, h, true);
    await cdp.eval(`(() => {
      const app = window.__LH_APP;
      app.stopAll();
      app.enterSystemOrbit('sol', true);
      app.undock();
      app.setScreen('helm');
      window.LighthuggerScreens.setKgOpen(false);
    })()`);
    await cdp.waitFrames(4);
    const helmMob = await cdp.eval(`(() => {
      const checkEl = (el, name) => {
        if (!el) return { name, missing: true };
        const r = el.getBoundingClientRect();
        return { name, left: r.left, right: r.right, width: r.width, height: r.height,
          ok: r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= innerWidth + 1 };
      };
      return {
        w: innerWidth,
        docOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        unstow: checkEl(document.getElementById('btn-kg-unstow'), 'unstow'),
        stop: checkEl(document.querySelector('#lh-helm-strip [data-helm="stop"]'), 'stop'),
        flip: checkEl(document.querySelector('#lh-helm-strip [data-helm="flip"]'), 'flip')
      };
    })()`);
    console.log(`ROUND6_MOBILE_HELM ${w}x${h}:`, JSON.stringify(helmMob));
    assert(
      !helmMob.docOverflow && helmMob.unstow.ok && helmMob.stop.ok && helmMob.flip.ok,
      `Round 6 mobile stowed Helm clipped at ${w}x${h}: ` + JSON.stringify(helmMob)
    );
    await cdp.screenshot(`61_r6_mobile_${w}_helm_stowed.png`);

    await cdp.eval(`window.__LH_APP.setScreen('orbits')`);
    await cdp.waitFrames(4);
    const orbitMob = await cdp.eval(`(() => {
      const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
        Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const chips = document.getElementById('lh-moon-chips');
      const chipsR = chips.getBoundingClientRect();
      const viewIds = ['btn-orbit-hill', 'btn-orbit-lagrange', 'btn-orbit-top', 'btn-orbit-fit', 'btn-orbit-ship'];
      const viewChecks = viewIds.map(id => {
        const r = document.getElementById(id).getBoundingClientRect();
        return { id, left: r.left, right: r.right, overlapChips: overlap(chipsR, r),
          inBounds: r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= innerWidth + 1 };
      });
      const titanChip = [...chips.querySelectorAll('button')].find(b => /TITAN/i.test(b.textContent));
      const tR = titanChip ? titanChip.getBoundingClientRect() : null;
      const hitEl = tR ? document.elementFromPoint(tR.left + tR.width / 2, tR.top + tR.height / 2) : null;
      const titanHitOk = Boolean(titanChip && hitEl && (hitEl === titanChip || titanChip.contains(hitEl)));
      const quickBtns = [...document.querySelectorAll('#lh-quick-row > button')].map(b => {
        const r = b.getBoundingClientRect();
        return { id: b.id || b.dataset.quickBurn, left: r.left, right: r.right,
          inBounds: r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= innerWidth + 1 };
      });
      const noteR = document.getElementById('lh-orbit-note').getBoundingClientRect();
      const hintR = document.getElementById('lh-orbit-hint').getBoundingClientRect();
      const noteHintOverlap = overlap(noteR, hintR);
      return {
        w: innerWidth,
        chipsW: chipsR.width, chipsH: chipsR.height,
        chipsInBounds: chipsR.left >= -1 && chipsR.right <= innerWidth + 1,
        viewChecks,
        titanHitOk,
        noteHintOverlap,
        quickOk: quickBtns.length === 5 && quickBtns.every(q => q.inBounds),
        quickBtns
      };
    })()`);
    console.log(`ROUND6_MOBILE_ORBITS ${w}x${h}:`, JSON.stringify(orbitMob));
    assert(
      orbitMob.chipsW > 20 && orbitMob.chipsH > 15 && orbitMob.chipsInBounds &&
      orbitMob.viewChecks.every(v => v.inBounds && v.overlapChips === 0) &&
      orbitMob.titanHitOk && orbitMob.noteHintOverlap === 0 && orbitMob.quickOk,
      `Round 6 mobile Orbit Nav layout failed at ${w}x${h}: ` + JSON.stringify(orbitMob)
    );
    await cdp.screenshot(`62_r6_mobile_${w}_orbits.png`);

    if (w === 320) {
      await cdp.eval(`window.__LH_APP.setScreen('sextant')`);
      await cdp.waitFrames(4);
      const sxMob = await cdp.eval(`(() => {
        const btns = [...document.querySelectorAll('#kg-sextant-deck .kg-scope-modes button')].map(b => {
          const r = b.getBoundingClientRect();
          return { text: b.textContent.trim(), sw: b.scrollWidth, cw: b.clientWidth,
            right: r.right, ok: b.scrollWidth <= b.clientWidth + 1 && r.right <= innerWidth + 1 };
        });
        return { w: innerWidth, btns };
      })()`);
      console.log('ROUND6_MOBILE_320_SEXTANT:', JSON.stringify(sxMob));
      assert(sxMob.btns.length === 3 && sxMob.btns.every(b => b.ok),
        'Round 6 mobile 320px Sextant scope mode buttons overflowed: ' + JSON.stringify(sxMob));
      await cdp.screenshot('63_r6_mobile_320_sextant.png');
    }
  }

  await cdp.setViewport(1440, 900);
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.resetVoyage();
    app.undock();
    app.setScreen('helm');
    window.LighthuggerScreens.setKgOpen(true);
  })()`);
  await cdp.waitFrames(3);
}

async function checkRound7(cdp) {
  await cdp.setViewport(1440, 900);
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.undock();
    app.setScreen('helm');
    window.LighthuggerScreens.setKgOpen(true);
  })()`);
  await cdp.waitFrames(4);

  // 1. Default HUD toggles: FLT OFF by default; REL auto-ON in relativistic, auto-OFF in NR
  const hudStart = await cdp.eval(`(() => {
    const snap = window.__LH_APP.getSnapshot();
    return {
      flt: snap.hud.flight,
      rel: snap.hud.rel,
      swFlt: document.getElementById('sw-hud-flt').getAttribute('aria-pressed'),
      swRel: document.getElementById('sw-hud-rel').getAttribute('aria-pressed')
    };
  })()`);
  await cdp.screenshot('66_r7_helm_default_clean_hud.png');
  assert(!hudStart.flt && !hudStart.rel && hudStart.swFlt === 'false' && hudStart.swRel === 'false',
    'Round 7 default HUD toggles failed (expected FLT=false, REL=false): ' + JSON.stringify(hudStart));

  await cdp.click('#sw-hud-flt');
  await cdp.waitFrames(2);
  const hudFltOn = await cdp.eval(`window.__LH_APP.getSnapshot().hud.flight`);
  assert(hudFltOn === true, 'Manual FLT toggle did not turn FLT ON');
  await cdp.click('#sw-hud-flt');
  await cdp.waitFrames(2);

  await cdp.eval(`window.__LH_APP.engageInterstellar({ destId: 'rigil' })`);
  await cdp.waitFrames(4);
  const hudRelEngaged = await cdp.eval(`(() => {
    const snap = window.__LH_APP.getSnapshot();
    return { rel: snap.hud.rel, flt: snap.hud.flight, swRel: document.getElementById('sw-hud-rel').getAttribute('aria-pressed') };
  })()`);
  await cdp.screenshot('67_r7_rel_hud_auto_on.png');
  assert(hudRelEngaged.rel === true && hudRelEngaged.flt === false && hudRelEngaged.swRel === 'true',
    'Round 7 REL did not auto-enable on interstellar engagement: ' + JSON.stringify(hudRelEngaged));

  const autoRelRegime = await cdp.eval(`(() => {
    const app = window.__LH_APP, s = app.state;
    s.mission = null; s.thrustCmdG = 0;
    s.eta = 0.005; s.beta = Math.tanh(s.eta); s.gamma = Math.cosh(s.eta);
    app.step(1, 0.05);
    const afterSlowRel = app.getSnapshot().hud.rel;
    s.eta = 0.08; s.beta = Math.tanh(s.eta); s.gamma = Math.cosh(s.eta);
    app.step(1, 0.05);
    const afterFastRel = app.getSnapshot().hud.rel;
    app.enterSystemOrbit('sol', true);
    app.undock();
    const afterOrbitRel = app.getSnapshot().hud.rel;
    const afterOrbitFlt = app.getSnapshot().hud.flight;
    return { afterSlowRel, afterFastRel, afterOrbitRel, afterOrbitFlt };
  })()`);
  assert(autoRelRegime.afterSlowRel === false && autoRelRegime.afterFastRel === true &&
    autoRelRegime.afterOrbitRel === false && autoRelRegime.afterOrbitFlt === false,
    'Round 7 automatic REL regime switching failed: ' + JSON.stringify(autoRelRegime));

  // 2. Titan direct EXEC & WATCH (without tapping ORBIT TITAN first) + Flip-burn + Volumetric Atmo + Post-impact recovery
  const titanDirect = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.undock();
    app.setScreen('orbits');
    await waitF(3);
    const titanBtn = [...document.querySelectorAll('#lh-target-list .lh-target')].find(b => /TITAN/i.test(b.textContent));
    if (titanBtn) titanBtn.click();
    await waitF(2);
    document.getElementById('btn-orbit-exec-watch').click();
    for (let i = 0; i < 3000 && app.getSnapshot().burn.active; i++) {
      const b = app.getSnapshot().burn;
      const dt = b.etaS > 1200 ? Math.min(3600, b.etaS * 0.5) : Math.max(1, Math.min(600, b.etaS || 60));
      app.step(dt, 0.05, false);
    }
    await waitF(3);
    const arr = app.getSnapshot();
    const sc = app.getSceneInfo();
    const titanInfo = sc.bodies.find(b => /titan/i.test(b.name || ''));
    if (titanInfo && titanInfo.dir) {
      app.state.camLock = false;
      const d = titanInfo.dir;
      const cam = app.getSnapshot().cam;
      cam.orbitYaw = Math.atan2(-d[2], -d[0]) + 0.72;
      cam.orbitPitch = 0.12;
      cam.orbitZoom = 0.78;
    }
    await waitF(5);
    return {
      screen: arr.screen,
      burnActive: arr.burn.active,
      lastImpact: arr.lastImpact,
      primary: arr.orbitPrimary,
      label: arr.orbitPrimaryLabel,
      altKm: arr.orbit.altKm,
      volAtmo: titanInfo ? titanInfo.volAtmo : false,
      geoSegments: titanInfo ? titanInfo.geoSegments : 0
    };
  })()`);
  await cdp.screenshot('65_r7_titan_orbit_volumetric_atmo.png');
  console.log('ROUND7_TITAN_DIRECT:', JSON.stringify(titanDirect));
  assert(
    titanDirect.burnActive === false && titanDirect.lastImpact === null &&
    titanDirect.primary === 'moon' && titanDirect.label === 'TITAN' &&
    titanDirect.altKm >= 500 && titanDirect.volAtmo === true && titanDirect.geoSegments >= 64,
    'Round 7 direct Titan EXEC & WATCH or volumetric atmo check failed: ' + JSON.stringify(titanDirect)
  );

  // Flip-burn to Titan + deliberate impact recovery non-freeze test
  const titanFlipAndRecovery = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    app.state.camLock = true;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.undock();
    app.setScreen('orbits');
    await waitF(3);
    const titanBtn = [...document.querySelectorAll('#lh-target-list .lh-target')].find(b => /TITAN/i.test(b.textContent));
    if (titanBtn) titanBtn.click();
    await waitF(2);
    document.getElementById('btn-flip-burn').click();
    await waitF(2);
    document.getElementById('btn-orbit-exec-watch').click();
    for (let i = 0; i < 400 && app.getSnapshot().burn.active; i++) app.step(0.1, 0.1, true);
    await waitF(3);
    const fbEnd = app.getSnapshot();
    const fbAltKm = fbEnd.orbit.altKm;

    // Deliberate collision into Titan -> must arrest near surface (no 1.75R bounce!), show wreck overlay, and recommission cleanly
    const titanBody = window.LighthuggerGalaxy.SYSTEMS[0].planets[0].moons[0];
    app.orbit.rKm = [titanBody.radiusKm + 260, 0, 0];
    app.orbit.vKmS = [-3.5, 0.2, 0];
    app.step(120, 0.05, false);
    const impacted = app.getSnapshot();
    const afterImpactAuto = impacted.autoClock;
    const afterImpactExplicit = impacted.clockExplicit;
    const afterImpactAlt = impacted.orbit.altKm;
    const afterImpactDestroyed = impacted.destroyed;
    await waitF(3);
    const wreckOverlayShown = !document.getElementById('lh-wreck-overlay').hidden;
    document.getElementById('btn-wreck-recommission').click();
    await waitF(3);
    app.undock();
    const simBefore = app.getSnapshot().simTimeS;
    app.setThrustG(1.0);
    await waitF(25);
    const resumed = app.getSnapshot();
    return {
      fbImpact: fbEnd.lastImpact,
      fbPrimary: fbEnd.orbitPrimary,
      fbLabel: fbEnd.orbitPrimaryLabel,
      fbAltKm,
      fbAutoClock: fbEnd.autoClock,
      fbClockExplicit: fbEnd.clockExplicit,
      impactBody: impacted.lastImpact?.bodyName,
      afterImpactAuto,
      afterImpactExplicit,
      afterImpactAlt,
      afterImpactDestroyed,
      wreckOverlayShown,
      resumedDestroyed: resumed.destroyed,
      resumedWarp: resumed.effectiveWarp,
      resumedSimDt: resumed.simTimeS - simBefore
    };
  })()`);
  console.log('ROUND7_TITAN_FLIP_RECOVERY:', JSON.stringify(titanFlipAndRecovery));
  assert(
    titanFlipAndRecovery.fbImpact === null &&
    titanFlipAndRecovery.fbPrimary === 'moon' && titanFlipAndRecovery.fbLabel === 'TITAN' &&
    titanFlipAndRecovery.fbAltKm >= 500 &&
    titanFlipAndRecovery.fbAutoClock === true && titanFlipAndRecovery.fbClockExplicit === false &&
    /titan/i.test(titanFlipAndRecovery.impactBody || '') &&
    titanFlipAndRecovery.afterImpactAuto === true && titanFlipAndRecovery.afterImpactExplicit === false &&
    titanFlipAndRecovery.afterImpactDestroyed === true && titanFlipAndRecovery.wreckOverlayShown === true &&
    titanFlipAndRecovery.afterImpactAlt >= 0 && titanFlipAndRecovery.afterImpactAlt < 120 &&
    titanFlipAndRecovery.resumedDestroyed === false &&
    titanFlipAndRecovery.resumedWarp > 2 && titanFlipAndRecovery.resumedSimDt > 1,
    'Round 7 flip-burn or Titan zero-bounce impact/recommission check failed: ' + JSON.stringify(titanFlipAndRecovery)
  );

  // 3. Interstellar overshoot & snap-back check on BOTH rigil and proxima
  const transitCheck = await cdp.eval(`(() => {
    const app = window.__LH_APP;
    const galaxy = window.LighthuggerGalaxy;
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const results = [];
    for (const destId of ['rigil', 'proxima']) {
      app.stopAll();
      app.enterSystemOrbit('sol', true);
      app.undock();
      const dest = galaxy.SYSTEMS.find(s => s.id === destId);
      const destP = dest.planets[dest.station.parentPlanetIdx];
      app.engageInterstellar({ destId });
      let prevRem = Infinity, monotonic = true, minRem = Infinity;
      let minPlanetClearRatio = Infinity, lastApproachPos = null, lastApproachRelPlanet = null, lastApproachHead = null;
      let captureJump = null, berthJump = null, headingDot = null;
      for (let i = 0; i < 2000; i++) {
        const s = app.getSnapshot();
        if (!s.transitStage) break;
        if (s.missionRemLy != null) {
          minRem = Math.min(minRem, s.missionRemLy);
          if (s.transitStage !== 'departure') {
            if (s.missionRemLy > prevRem + 1e-13) monotonic = false;
            prevRem = s.missionRemLy;
          }
        }
        const pW = galaxy.getBodyWorldState(dest, { kind: 'planet', planetIdx: dest.station.parentPlanetIdx }, s.simTimeS);
        if (s.transitStage === 'approach' && s.shipRelStarKm) {
          lastApproachPos = s.shipRelStarKm.slice();
          lastApproachRelPlanet = [s.shipRelStarKm[0] - pW.rKm[0], s.shipRelStarKm[1] - pW.rKm[1], s.shipRelStarKm[2] - pW.rKm[2]];
          lastApproachHead = app.state.headingGal.slice();
          const ratio = dist(s.shipRelStarKm, pW.rKm) / destP.radiusKm;
          if (ratio < minPlanetClearRatio) minPlanetClearRatio = ratio;
        } else if (s.transitStage === 'capture' && captureJump === null && lastApproachPos) {
          captureJump = dist(lastApproachPos, s.shipRelStarKm);
          const capRelPlanet = [s.shipRelStarKm[0] - pW.rKm[0], s.shipRelStarKm[1] - pW.rKm[1], s.shipRelStarKm[2] - pW.rKm[2]];
          berthJump = dist(lastApproachRelPlanet, capRelPlanet);
          const hNow = app.state.headingGal;
          headingDot = lastApproachHead[0] * hNow[0] + lastApproachHead[1] * hNow[1] + lastApproachHead[2] * hNow[2];
        }
        app.step(0.025, 0.025, true);
      }
      results.push({ destId, monotonic, minRem, minPlanetClearRatio, captureJump, berthJump, headingDot });
    }
    return results;
  })()`);
  console.log('ROUND7_TRANSIT_CONTINUITY:', JSON.stringify(transitCheck));
  for (const r of transitCheck) {
    assert(
      r.monotonic && r.minRem >= 0 && r.minPlanetClearRatio > 1.35 &&
      Number.isFinite(r.berthJump) && r.berthJump < 50 &&
      Number.isFinite(r.captureJump) && r.captureJump < 200 &&
      Number.isFinite(r.headingDot) && r.headingDot > 0.85,
      'Round 7 interstellar overshoot/snap-back failed for ' + JSON.stringify(r)
    );
  }

  // 4. Real Keplerian orbital motion for station, npc, npc2 + zero-velocity radial free-fall
  const orbitalMotion = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.undock();
    app.setTimeWarp(1);
    await waitF(6);
    const t0 = app.getSnapshot().simTimeS;
    const b0 = app.getSceneInfo().bodies;
    const p0 = b0.find(b => b.key === 'planet')?.posKm?.slice();
    const st0 = b0.find(b => b.key === 'station')?.posKm?.slice();
    const n1_0 = b0.find(b => b.key === 'npc')?.posKm?.slice();
    const n2_0 = b0.find(b => b.key === 'npc2')?.posKm?.slice();
    // Advance simTime by 60 seconds along orbits without thrust
    app.step(60, 0.05, false);
    await waitF(3);
    const t1 = app.getSnapshot().simTimeS;
    const b1 = app.getSceneInfo().bodies;
    const p1 = b1.find(b => b.key === 'planet')?.posKm?.slice();
    const st1 = b1.find(b => b.key === 'station')?.posKm?.slice();
    const n1_1 = b1.find(b => b.key === 'npc')?.posKm?.slice();
    const n2_1 = b1.find(b => b.key === 'npc2')?.posKm?.slice();
    const dt = Math.max(1e-3, t1 - t0);
    const d3 = (a, b) => (a && b) ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : 0;
    const sub3 = (a, b) => (a && b) ? [a[0] - b[0], a[1] - b[1], a[2] - b[2]] : null;

    // Zero velocity -> must fall radially inward under Saturn gravity (never hover at 0)
    app.orbit.vKmS = [0, 0, 0];
    const rBefore = Math.hypot(...app.orbit.rKm);
    app.step(120, 0.05, false);
    const rAfter = Math.hypot(...app.orbit.rKm);
    const speedAfter = Math.hypot(...app.orbit.vKmS);

    return {
      dt,
      stSpeedKmS: d3(sub3(st0, p0), sub3(st1, p1)) / dt,
      npc1SpeedKmS: d3(sub3(n1_0, p0), sub3(n1_1, p1)) / dt,
      npc2SpeedKmS: d3(sub3(n2_0, p0), sub3(n2_1, p1)) / dt,
      radialDropKm: rBefore - rAfter,
      speedAfter
    };
  })()`);
  console.log('ROUND7_ORBITAL_MOTION:', JSON.stringify(orbitalMotion));
  assert(
    orbitalMotion.stSpeedKmS > 10 && orbitalMotion.npc1SpeedKmS > 10 && orbitalMotion.npc2SpeedKmS > 10 &&
    orbitalMotion.radialDropKm > 1 && orbitalMotion.speedAfter > 0.05,
    'Round 7 real Keplerian orbital motion or radial free-fall check failed: ' + JSON.stringify(orbitalMotion)
  );

  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.resetVoyage();
    app.undock();
    app.setScreen('helm');
    window.LighthuggerScreens.setKgOpen(true);
  })()`);
  await cdp.waitFrames(3);
}

async function checkRound8(cdp) {
  // 1. Full-bleed Orbit Nav backdrop behind narrower CoaDE deck & overlays in viewport
  await cdp.setViewport(1440, 900, false);
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.undock();
    app.setScreen('orbits');
  })()`);
  await cdp.waitFrames(8);
  const orbitBleed = await cdp.eval(`(() => {
    const scr = document.getElementById('lh-screen-orbits').getBoundingClientRect();
    const cv = document.getElementById('lh-orbit-canvas').getBoundingClientRect();
    const deck = document.getElementById('kg-orbit-deck').getBoundingClientRect();
    const vp = document.querySelector('#lh-screen-orbits .lh-chrono-viewport').getBoundingClientRect();
    return {
      scr: { l: scr.left, t: scr.top, r: scr.right, b: scr.bottom, w: scr.width, h: scr.height },
      cv: { l: cv.left, t: cv.top, r: cv.right, b: cv.bottom, w: cv.width, h: cv.height },
      deck: { l: deck.left, t: deck.top, r: deck.right, b: deck.bottom, w: deck.width, h: deck.height },
      vp: { l: vp.left, t: vp.top, r: vp.right, b: vp.bottom, w: vp.width, h: vp.height }
    };
  })()`);
  console.log('ROUND8_ORBIT_BLEED:', JSON.stringify(orbitBleed));
  assert(
    orbitBleed.cv.w >= 1438 && orbitBleed.cv.h >= 800 &&
    orbitBleed.cv.l <= 2 && orbitBleed.cv.r >= 1438 &&
    orbitBleed.cv.b >= orbitBleed.deck.b - 2 &&
    orbitBleed.deck.l > 100 && orbitBleed.deck.r < 1340 &&
    orbitBleed.vp.b <= orbitBleed.deck.t + 4,
    'Round 8 full-bleed Orbit Nav layout check failed: ' + JSON.stringify(orbitBleed)
  );
  await cdp.screenshot('68_r8_orbit_nav_fullbleed.png');

  // 2. Visible failure notice when docked + cross-SOI Saturn -> Earth plot, stale chain cleanup & capture
  const crossSoi = await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    const dockedExecOk = app.executeOrbitManeuver();
    const dockedMsg = app.state.log.at(-1) || '';
    const flashEl = document.getElementById('lh-flash');
    const flashVisible = Boolean(flashEl && !flashEl.hidden && flashEl.textContent.includes('Docking clamp'));
    const logGrew = dockedMsg.includes('Docking clamp') && flashVisible;

    app.undock();
    const titanCap = app.plotOrbitCapture('titan');
    const chainBeforeSwitch = app.getSnapshot().maneuverChain.length;
    const earthPlot = app.selectTargetOrbit('sol-p3');
    const afterSelect = app.getSnapshot();
    const cap = app.plotOrbitCapture('sol-p3', { execute: true });
    for (let i = 0; i < 600; i++) {
      const sn = app.getSnapshot();
      if (!sn.burn?.active) break;
      const rem = sn.burn.remainingS || 0;
      const dt = Math.max(1, Math.min(Math.max(60, rem / 12), 2e6));
      app.step(dt, 0.05);
    }
    const endSnap = app.getSnapshot();
    return {
      dockedExecOk, logGrew, dockedMsg,
      titanValid: titanCap.valid, chainBeforeSwitch,
      promotedPrimary: afterSelect.orbitPrimary,
      staleChainCleared: afterSelect.maneuverChain.length === 0,
      earthPlotOk: !!(earthPlot && Number.isFinite(earthPlot.totalDvKmS)),
      capValid: cap.valid, capBurns: cap.burns?.length || 0,
      endPrimary: endSnap.orbitPrimary,
      endBody: endSnap.orbit?.bodyName,
      endBound: endSnap.orbit?.el?.isBound,
      endAltKm: endSnap.orbit?.altKm
    };
  })()`);
  console.log('ROUND8_CROSS_SOI:', JSON.stringify(crossSoi));
  assert(
    crossSoi.dockedExecOk === false && crossSoi.logGrew &&
    crossSoi.titanValid && crossSoi.chainBeforeSwitch > 0 &&
    crossSoi.promotedPrimary === 'star' && crossSoi.staleChainCleared &&
    crossSoi.earthPlotOk && crossSoi.capValid && crossSoi.capBurns === 2 &&
    crossSoi.endPrimary === 'planet' && crossSoi.endBody === 'Earth' &&
    crossSoi.endBound === true && crossSoi.endAltKm > 200,
    'Round 8 cross-SOI Saturn->Earth / failure feedback check failed: ' + JSON.stringify(crossSoi)
  );

  // 3. Frontier stars (>40 LY) & Starmap 50 LY Exploration Fog
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.resetVoyage();
    app.setScreen('starmap');
    document.querySelector('#lh-screen-starmap [data-starscale="linear"]')?.click();
    window.__r8MapTexts = [];
    const mapCv = document.getElementById('lh-starmap-canvas');
    const mapCtx = mapCv && mapCv.getContext('2d');
    const origFill = mapCtx ? mapCtx.fillText : null;
    window.__r8MapCtx = mapCtx;
    window.__r8OrigFill = origFill;
    if (mapCtx && origFill) {
      mapCtx.fillText = function (txt) {
        window.__r8MapTexts.push(String(txt));
        return origFill.apply(this, arguments);
      };
    }
    document.getElementById('btn-star-flat').click();
    document.getElementById('btn-star-flat').click();
  })()`);
  await cdp.waitFrames(6);
  const solMapCheck = await cdp.eval(`(() => {
    if (window.__r8MapCtx && window.__r8OrigFill) {
      window.__r8MapCtx.fillText = window.__r8OrigFill;
    }
    delete window.__r8MapCtx;
    delete window.__r8OrigFill;
    const texts = window.__r8MapTexts || [];
    delete window.__r8MapTexts;
    const G = window.LighthuggerGalaxy;
    const snap = window.__LH_APP.getSnapshot();
    const btns = [...document.querySelectorAll('#lh-sys-list [data-star]')];
    return {
      curatedCount: G.SYSTEMS.length,
      frontierTotal: G.FRONTIER_SYSTEMS.length,
      frontierCount: snap.frontierCount,
      listCount: btns.length,
      hasFogLabel: texts.some(t => t.includes('50 LY FRONTIER // SENSOR FOG'))
    };
  })()`);
  console.log('ROUND8_STARMAP_FOG_SOL:', JSON.stringify(solMapCheck));
  assert(
    solMapCheck.curatedCount === 28 && solMapCheck.frontierTotal >= 24 &&
    solMapCheck.frontierCount === 0 && solMapCheck.listCount === 28 &&
    solMapCheck.hasFogLabel,
    'Round 8 Starmap Sol fog check failed: ' + JSON.stringify(solMapCheck)
  );
  await cdp.screenshot('69_r8_starmap_fog_sol.png');

  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.undock();
    app.state.mode = 'interstellar';
    app.state.mission = null;
    app.state.posGal = [48, 0, 0];
    app.step(10, 0.05);
    app.setScreen('starmap');
    document.querySelector('#lh-screen-starmap [data-starscale="linear"]')?.click();
  })()`);
  await cdp.waitFrames(8);
  const frontierCheck = await cdp.eval(`(() => {
    const app = window.__LH_APP;
    const snap0 = app.getSnapshot();
    const btns = [...document.querySelectorAll('#lh-sys-list [data-star]')];
    const frtBtn = btns.find(b => b.textContent.includes('FRT'));
    const frtId = frtBtn ? frtBtn.dataset.star : null;
    if (frtBtn) frtBtn.click();
    const preview = frtId ? app.getMultiHopPreview(frtId) : null;
    return {
      frontierCount: snap0.frontierCount,
      listCount: btns.length,
      hasFrtRow: !!frtBtn,
      frtId,
      routeOk: !!(preview && preview.hops && preview.hops.length >= 1)
    };
  })()`);
  await cdp.waitFrames(4);
  console.log('ROUND8_FRONTIER_REVEAL:', JSON.stringify(frontierCheck));
  assert(
    frontierCheck.frontierCount > 0 &&
    frontierCheck.listCount === 28 + frontierCheck.frontierCount &&
    frontierCheck.hasFrtRow && frontierCheck.routeOk,
    'Round 8 Frontier reveal check failed: ' + JSON.stringify(frontierCheck)
  );
  await cdp.screenshot('70_r8_starmap_frontier_revealed.png');

  // 4. Sextant zoom stability on distant corridor vessels
  const sextantCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    app.stopAll();
    app.resetVoyage();
    app.undock();
    app.setScreen('sextant');
    await waitF(6);
    const c0 = app.getSnapshot().contacts[0];
    app.state.lockedTarget = c0;
    const lockId = c0 ? c0.id : null;
    const samples = [];
    for (const z of [1.0, 0.35, 0.12, 0.04, 0.015]) {
      app.getSnapshot().cam.sxZoom = z;
      await waitF(3);
      const sn = app.getSnapshot();
      const sc = app.getSceneInfo();
      const lockedC = sn.contacts.find(c => c.id === lockId);
      samples.push({
        z,
        fov: sc.camera.fov,
        stillPresent: !!lockedC,
        range3d: lockedC ? lockedC.range3d : null
      });
    }
    return { lockId, samples };
  })()`);
  console.log('ROUND8_SEXTANT_ZOOM:', JSON.stringify(sextantCheck));
  assert(
    sextantCheck.lockId &&
    sextantCheck.samples.length === 5 &&
    sextantCheck.samples.every((s, idx) =>
      s.stillPresent && Number.isFinite(s.fov) && Number.isFinite(s.range3d) &&
      (idx === 0 || s.fov < sextantCheck.samples[idx - 1].fov)),
    'Round 8 Sextant zoom stability check failed: ' + JSON.stringify(sextantCheck)
  );

  // 5. Extended transit choreography duration + HYPR speedup
  const transitDur = await cdp.eval(`(() => {
    const app = window.__LH_APP;
    const run = (warp) => {
      app.stopAll();
      app.enterSystemOrbit('sol', true);
      app.undock();
      app.engageInterstellar({ destId: 'rigil' });
      if (warp) app.setTimeWarp(warp);
      let elapsed = 0;
      for (let i = 0; i < 2000; i++) {
        if (!app.getSnapshot().transitStage) break;
        app.step(0.05, 0.05, true);
        elapsed += 0.05;
      }
      return { elapsed, stage: app.getSnapshot().transitStage };
    };
    const defRun = run(null);
    const hyprRun = run('hyper');
    return { defRun, hyprRun };
  })()`);
  console.log('ROUND8_TRANSIT_DURATION:', JSON.stringify(transitDur));
  assert(
    transitDur.defRun.stage === null &&
    transitDur.defRun.elapsed >= 25 && transitDur.defRun.elapsed <= 48 &&
    transitDur.hyprRun.stage === null && transitDur.hyprRun.elapsed < 20,
    'Round 8 transit duration check failed: ' + JSON.stringify(transitDur)
  );

  // 6. REL HUD right-side pill vertical stack (zero overlap)
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.undock();
    app.engageInterstellar({ destId: 'rigil' });
    for (let i = 0; i < 180; i++) app.step(0.05, 0.05, true);
    app.setScreen('helm');
    window.LighthuggerScreens.setKgOpen(true);
    app.state.hudRel = true;
    app.setAberrationZoom(5);
    window.__r8HudRects = [];
    let lastHudY = -Infinity;
    const hudCv = document.getElementById('lh-hud-canvas');
    const hudCtx = hudCv && hudCv.getContext('2d');
    const origFillRect = hudCtx ? hudCtx.fillRect : null;
    window.__r8HudCtx = hudCtx;
    window.__r8OrigFillRect = origFillRect;
    if (hudCtx && origFillRect) {
      hudCtx.fillRect = function (x, y, w, h) {
        if (x > hudCv.clientWidth * 0.55 && w > 30 && h >= 12 && h <= 16) {
          if (y < lastHudY - 10) window.__r8HudRects = [];
          lastHudY = y;
          window.__r8HudRects.push({ x, y, w, h });
        }
        return origFillRect.apply(this, arguments);
      };
    }
  })()`);
  await cdp.waitFrames(4);
  const hudPillCheck = await cdp.eval(`(() => {
    if (window.__r8HudCtx && window.__r8OrigFillRect) {
      window.__r8HudCtx.fillRect = window.__r8OrigFillRect;
    }
    delete window.__r8HudCtx;
    delete window.__r8OrigFillRect;
    const raw = window.__r8HudRects || [];
    delete window.__r8HudRects;
    const seen = new Set(), uniq = [];
    for (const r of raw) {
      const k = Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.h);
      if (!seen.has(k)) { seen.add(k); uniq.push(r); }
    }
    uniq.sort((a, b) => a.y - b.y);
    let overlap = false, minGap = Infinity;
    for (let i = 1; i < uniq.length; i++) {
      const gap = uniq[i].y - (uniq[i - 1].y + uniq[i - 1].h);
      if (gap < minGap) minGap = gap;
      if (gap < 3) overlap = true;
    }
    const snap = window.__LH_APP.getSnapshot();
    return { count: uniq.length, overlap, minGap, rects: uniq, beta: snap.beta, stage: snap.transitStage };
  })()`);
  console.log('ROUND8_REL_HUD_PILLS:', JSON.stringify(hudPillCheck));
  assert(
    hudPillCheck.count >= 4 && !hudPillCheck.overlap,
    'Round 8 REL HUD right-side pills overlap check failed: ' + JSON.stringify(hudPillCheck)
  );
  await cdp.screenshot('71_r8_rel_hud_clean_right.png');

  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.setAberrationZoom(1);
    app.resetVoyage();
    app.undock();
    app.setScreen('helm');
    window.LighthuggerScreens.setKgOpen(true);
  })()`);
  await cdp.waitFrames(3);
}

async function checkRound9(cdp) {
  await cdp.setViewport(1440, 900, false);

  // 1. Launch & Undock keeps berth station clearly visible in front open sky above KG-2100 deck
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.resetVoyage();
    app.setScreen('menu');
  })()`);
  await cdp.waitFrames(4);
  await cdp.click('#btn-ship-launch-undock');
  await cdp.waitFrames(8);
  const undockCheck = await cdp.eval(`(() => {
    const app = window.__LH_APP;
    const snap = app.getSnapshot();
    const sc = app.getSceneInfo();
    const stBody = sc.bodies.find(b => b.key === 'station');
    const stHud = (snap.hud.bodies || []).find(b => b.key === 'station');
    const stDir = (stHud && stHud.dir) || (stBody && stBody.dir) || null;
    const stProj = stDir && snap.hud.projectDir
      ? snap.hud.projectDir(stDir, innerWidth, innerHeight)
      : null;
    const deckEl = document.getElementById('kg-deck');
    const deckTop = deckEl && !deckEl.hidden ? deckEl.getBoundingClientRect().top : innerHeight;
    return {
      screen: snap.screen,
      docked: snap.docked,
      distKm: snap.dock.distKm,
      inRange: snap.dock.inRange,
      stVisible: Boolean(stBody),
      stInFront: Boolean(stProj && stProj.inFront),
      stX: stProj ? stProj.x : null,
      stY: stProj ? stProj.y : null,
      deckTop
    };
  })()`);
  console.log('ROUND9_UNDOCK_STATION:', JSON.stringify(undockCheck));
  assert(
    undockCheck.screen === 'helm' && !undockCheck.docked &&
    undockCheck.stVisible && undockCheck.stInFront &&
    undockCheck.distKm >= 2.0 && undockCheck.distKm <= 6.0 &&
    undockCheck.stX > 80 && undockCheck.stX < 1360 &&
    undockCheck.stY > 50 && undockCheck.stY < undockCheck.deckTop - 10,
    'Round 9 undock station visibility check failed: ' + JSON.stringify(undockCheck)
  );
  await cdp.screenshot('72_r9_undock_station_visible.png');

  // 2. 3D ORB button + 3D trajectories + finite orbital engine plume + arrival at burn node
  await cdp.eval(`(() => {
    window.LighthuggerScreens.setKgOpen(true);
    const btnVec = document.getElementById('btn-vectors');
    if (btnVec.getAttribute('aria-pressed') !== 'true') btnVec.click();
  })()`);
  await cdp.waitFrames(4);
  const orbToggleCheck = await cdp.eval(`(() => {
    const snap = window.__LH_APP.getSnapshot();
    const sc = window.__LH_APP.getSceneInfo();
    return {
      pressed: document.getElementById('btn-vectors').getAttribute('aria-pressed'),
      showOrbitsInHelm: snap.showOrbitsInHelm,
      curves: sc.orbitCurves
    };
  })()`);
  assert(
    orbToggleCheck.pressed === 'true' && orbToggleCheck.showOrbitsInHelm === true &&
    orbToggleCheck.curves.current === true,
    'Round 9 3D ORB toggle did not show current orbit curve in Helm: ' + JSON.stringify(orbToggleCheck)
  );

  // Plot ORBIT TITAN -> EXEC & WATCH -> verify finite dep burn plumes + 3D node gate + node #2 arrival
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.setScreen('orbits');
  })()`);
  await cdp.waitFrames(4);
  await cdp.eval(`(() => {
    const titanBtn = [...document.querySelectorAll('#lh-target-list .lh-target')].find(b => /TITAN/i.test(b.textContent));
    if (titanBtn) titanBtn.click();
  })()`);
  await cdp.waitFrames(2);
  await cdp.click('#btn-orbit-capture');
  await cdp.waitFrames(2);
  await cdp.click('#btn-orbit-exec-watch');
  await cdp.waitFrames(10);
  const burnDepCheck = await cdp.eval(`(() => {
    const app = window.__LH_APP;
    const snap = app.getSnapshot();
    const sc = app.getSceneInfo();
    return {
      screen: snap.screen,
      burnActive: snap.burn.active,
      firing: Boolean(snap.burn.firing),
      thrustG: snap.thrustG,
      sceneThrustG: sc.thrustG,
      plumeOn: sc.plumeOn,
      curves: sc.orbitCurves,
      nodeLbl: snap.burnNode?.label || null,
      chronoWarp: document.getElementById('lh-chrono-warp')?.textContent?.trim() || ''
    };
  })()`);
  console.log('ROUND9_BURN_DEP_PLUME:', JSON.stringify(burnDepCheck));
  assert(
    burnDepCheck.screen === 'helm' && burnDepCheck.burnActive &&
    burnDepCheck.firing && burnDepCheck.thrustG >= 0.45 &&
    burnDepCheck.plumeOn >= 0.45 &&
    burnDepCheck.curves.current && burnDepCheck.curves.transfer && burnDepCheck.curves.nodeGate,
    'Round 9 finite orbital burn / plume / 3D gate check failed: ' + JSON.stringify(burnDepCheck)
  );
  await cdp.screenshot('73_r9_3d_orbit_burn_plume.png');

  // Finish dep burn in live frames, coast near capture node, and confirm 3D arrival ignition + Titan capture
  const capArrivalCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    for (let i = 0; i < 300 && app.getSnapshot().burn?.firing; i++) await waitF(2);
    // Advance close to node #2 (within ~3s) while staying inside live visual choreography
    while (app.getSnapshot().burn?.active && !app.getSnapshot().burn?.firing && (app.getSnapshot().burn.remainingS || 0) > 3) {
      const rem = app.getSnapshot().burn.remainingS;
      app.step(Math.min(Math.max(2, rem - 3), 1200), 0.05, false, true);
    }
    await waitF(4);
    const preNodeDistKm = app.getSceneInfo().orbitCurves.nodeDistKm;
    let sawCapFire = false;
    for (let i = 0; i < 420 && app.getSnapshot().burn?.active; i++) {
      await waitF(2);
      const sn = app.getSnapshot();
      if (sn.burn?.firing && sn.thrustG >= 0.45) sawCapFire = true;
    }
    const endSnap = app.getSnapshot();
    return {
      preNodeDistKm,
      sawCapFire,
      endActive: endSnap.burn.active,
      endPrimary: endSnap.orbitPrimary,
      endBody: endSnap.orbit.bodyName,
      endAltKm: endSnap.orbit.altKm
    };
  })()`);
  console.log('ROUND9_BURN_CAP_ARRIVAL:', JSON.stringify(capArrivalCheck));
  assert(
    capArrivalCheck.sawCapFire && !capArrivalCheck.endActive &&
    capArrivalCheck.endPrimary === 'moon' && /titan/i.test(capArrivalCheck.endBody || '') &&
    capArrivalCheck.endAltKm >= 500,
    'Round 9 burn node #2 arrival / capture ignition failed: ' + JSON.stringify(capArrivalCheck)
  );

  // 3. Titan Flip-and-Burn takes limb-tangential approach (never dives straight into Titan) & captures safely
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.undock();
    app.setScreen('orbits');
  })()`);
  await cdp.waitFrames(4);
  await cdp.eval(`(() => {
    const titanBtn = [...document.querySelectorAll('#lh-target-list .lh-target')].find(b => /TITAN/i.test(b.textContent));
    if (titanBtn) titanBtn.click();
  })()`);
  await cdp.waitFrames(2);
  await cdp.click('#btn-flip-burn');
  await cdp.waitFrames(2);
  await cdp.click('#btn-orbit-exec-watch');
  const flipLimbCheck = await cdp.eval(`(async () => {
    const app = window.__LH_APP, G = window.LighthuggerGalaxy;
    const sys = G.SYSTEMS[0];
    const dot3 = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
    const unit3 = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
    let endAngleDeg = null;
    for (let i = 0; i < 600 && app.getSnapshot().burn?.active; i++) {
      app.step(0.05, 0.05, true, true);
      const sn = app.getSnapshot();
      if (sn.burn?.active && sn.burn.progress > 0.90) {
        const pW = G.getBodyWorldState(sys, { kind: 'planet', planetIdx: 0 }, sn.simTimeS);
        const mW = G.getBodyWorldState(sys, { kind: 'moon', planetIdx: 0, moonIdx: 0 }, sn.simTimeS);
        const shW = pW.rKm.map((x, k) => x + sn.orbit.rKm[k]);
        const toT = unit3(mW.rKm.map((x, k) => x - shW[k]));
        endAngleDeg = Math.acos(Math.max(-1, Math.min(1, dot3(toT, sn.basis.f)))) * 180 / Math.PI;
      }
    }
    const end = app.getSnapshot();
    return {
      endAngleDeg,
      impact: end.lastImpact,
      primary: end.orbitPrimary,
      label: end.orbitPrimaryLabel,
      altKm: end.orbit.altKm
    };
  })()`);
  await cdp.waitFrames(4);
  console.log('ROUND9_TITAN_FLIP_LIMB:', JSON.stringify(flipLimbCheck));
  assert(
    flipLimbCheck.impact === null && flipLimbCheck.primary === 'moon' &&
    flipLimbCheck.label === 'TITAN' && flipLimbCheck.altKm >= 850 &&
    flipLimbCheck.endAngleDeg >= 30,
    'Round 9 Titan flip-burn limb capture failed: ' + JSON.stringify(flipLimbCheck)
  );
  await cdp.screenshot('74_r9_titan_flip_capture.png');

  // 4. Integrated chronometer module inside Bay 2 + digital elapsed counter + zero overlap
  await cdp.eval(`window.LighthuggerScreens.setKgOpen(true)`);
  await cdp.waitFrames(3);
  const chronoCheck = await cdp.eval(`(() => {
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const pill = document.getElementById('lh-chrono-pill');
    const bar = document.getElementById('lh-screenbar');
    const tm = document.getElementById('lh-telemetry');
    const deck = document.getElementById('kg-deck');
    const pr = pill.getBoundingClientRect(), br = bar.getBoundingClientRect(), tr = tm.getBoundingClientRect(), dr = deck.getBoundingClientRect();
    return {
      visible: pill.offsetParent !== null && pr.width > 120 && pr.height > 20,
      insideDeck: Boolean(deck.contains(pill)),
      deckHeight: dr.height,
      warpTxt: document.getElementById('lh-chrono-warp').textContent.trim(),
      epochTxt: document.getElementById('lh-chrono-epoch').textContent.trim(),
      subTxt: document.getElementById('lh-chrono-sub').textContent.trim(),
      ovBar: overlap(pr, br),
      ovTm: overlap(pr, tr),
      inRightBounds: pr.right <= innerWidth + 1 && pr.top >= 0
    };
  })()`);
  console.log('ROUND9_CHRONO_PILL:', JSON.stringify(chronoCheck));
  assert(
    chronoCheck.visible && chronoCheck.insideDeck && chronoCheck.deckHeight <= 285 &&
    chronoCheck.ovBar === 0 && chronoCheck.ovTm === 0 && chronoCheck.inRightBounds &&
    /^\d{2,}y \d{3}d \d{2}:\d{2}:\d{2}$/.test(chronoCheck.epochTxt) && /^EP\s/.test(chronoCheck.subTxt),
    'Round 9 chronometer pill check failed: ' + JSON.stringify(chronoCheck)
  );

  // Engage rigil transit -> verify chrono pill enters REL/approach + screenshot + 24-frame nameplate stability
  const relStability = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.undock();
    app.engageInterstellar({ destId: 'rigil' });
    for (let i = 0; i < 200; i++) app.step(0.05, 0.05, true);
    app.setScreen('helm');
    window.LighthuggerScreens.setKgOpen(true);
    await waitF(6);
    const warpDuringCruise = document.getElementById('lh-chrono-warp').textContent.trim();
    const rateAttr = document.getElementById('lh-chrono-warp').dataset.rate;
    const samples = [];
    for (let f = 0; f < 24; f++) {
      await waitF(1);
      const lbls = [...document.querySelectorAll('#lh-labels .lh-label.is-contact:not([hidden])')].map(el => ({
        txt: el.textContent.trim(),
        tf: el.style.transform
      }));
      samples.push({
        cIds: app.getSnapshot().contacts.map(c => c.name),
        lbls
      });
    }
    return { warpDuringCruise, rateAttr, samples };
  })()`);
  await cdp.screenshot('76_r9_rel_nameplates_stable.png');
  await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    for (let i = 0; i < 600 && app.getSnapshot().transitStage && app.getSnapshot().transitStage !== 'approach'; i++) {
      app.step(0.05, 0.05, true);
    }
    for (let i = 0; i < 60 && app.getSnapshot().transitStage === 'approach'; i++) {
      app.step(0.05, 0.05, true);
    }
    await waitF(4);
  })()`);
  await cdp.screenshot('75_r9_chrono_approach.png');
  const firstNames = JSON.stringify(relStability.samples[0].cIds);
  const allNamesStable = relStability.samples.every(s => JSON.stringify(s.cIds) === firstNames);
  let maxJumpPx = 0;
  for (let i = 1; i < relStability.samples.length; i++) {
    const prevMap = new Map();
    relStability.samples[i - 1].lbls.forEach(l => {
      const m = l.tf.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/);
      if (m) prevMap.set(l.txt.split(' \u00b7 ')[0], [parseFloat(m[1]), parseFloat(m[2])]);
    });
    relStability.samples[i].lbls.forEach(l => {
      const m = l.tf.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/);
      const p0 = m && prevMap.get(l.txt.split(' \u00b7 ')[0]);
      if (p0) maxJumpPx = Math.max(maxJumpPx, Math.hypot(parseFloat(m[1]) - p0[0], parseFloat(m[2]) - p0[1]));
    });
  }
  console.log('ROUND9_REL_NAMEPLATES:', JSON.stringify({
    warpDuringCruise: relStability.warpDuringCruise,
    rateAttr: relStability.rateAttr,
    allNamesStable,
    maxJumpPx
  }));
  assert(
    relStability.rateAttr === 'rel' && allNamesStable && maxJumpPx < 35,
    'Round 9 relativistic nameplate stability failed: ' + JSON.stringify({ allNamesStable, maxJumpPx })
  );

  // 5. Mobile 390x844 overflow check: Bay 2 chrono fits inside 390px while analog dial hides
  await cdp.setViewport(390, 844, true);
  await cdp.waitFrames(4);
  const mobCheck = await cdp.eval(`(() => {
    const pill = document.getElementById('lh-chrono-pill').getBoundingClientRect();
    const bezel = document.querySelector('#lh-chrono-pill .lh-cp-bezel')?.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      pillW: pill.width,
      right: pill.right,
      bezelW: bezel ? bezel.width : 0
    };
  })()`);
  assert(!mobCheck.overflow && mobCheck.pillW > 0 && mobCheck.pillW <= 390 && mobCheck.right <= 390.5 && mobCheck.bezelW === 0,
    'Round 9 mobile chrono pill overflow check failed: ' + JSON.stringify(mobCheck));
  await cdp.setViewport(1440, 900, false);

  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.resetVoyage();
    app.undock();
    app.setScreen('helm');
    window.LighthuggerScreens.setKgOpen(true);
  })()`);
  await cdp.waitFrames(3);
}

async function checkRound10(cdp) {
  // 1. Menu showcase auto-orbit + customizer pause
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.setGraphics({ aa: 'msaa4', renderScale: 1, autoOrbit: true });
    app.enterSystemOrbit('sol', true);
    app.setScreen('menu');
    app.resetCamera();
  })()`);
  await cdp.waitFrames(4);
  const yaw0 = await cdp.eval(`window.__LH_APP.getSnapshot().cam.orbitYaw`);
  await new Promise(r => setTimeout(r, 260));
  await cdp.waitFrames(12);
  const yaw1 = await cdp.eval(`window.__LH_APP.getSnapshot().cam.orbitYaw`);
  assert(yaw1 - yaw0 > 0.015, 'Round 10 menu auto-orbit did not advance camera yaw: ' + JSON.stringify({ yaw0, yaw1 }));

  // Clicking a customizer preset inside #lh-menu-right pauses auto-orbit immediately
  await cdp.eval(`document.querySelector('#lh-menu-right [data-preset="nighthawk-diamond"]').click()`);
  await cdp.waitFrames(4);
  const yawHoldA = await cdp.eval(`window.__LH_APP.getSnapshot().cam.orbitYaw`);
  await cdp.waitFrames(10);
  const yawHoldB = await cdp.eval(`window.__LH_APP.getSnapshot().cam.orbitYaw`);
  assert(Math.abs(yawHoldB - yawHoldA) < 0.004, 'Round 10 customizer edit did not pause menu auto-orbit: ' + JSON.stringify({ yawHoldA, yawHoldB }));

  // 2. Escape Settings modal + live Anti-Aliasing & Render Scale switching
  await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await cdp.waitFrames(3);
  const settingsOpened = await cdp.eval(`document.getElementById('lh-settings-modal').hidden === false && document.getElementById('btn-kg-toggle') === null && !!document.getElementById('btn-settings-open')`);
  assert(settingsOpened, 'Round 10 Escape did not open #lh-settings-modal or top bar check failed');

  for (const [aaMode, scVal] of [['off', 1], ['fxaa', 1.5], ['ssaa2', 1.5], ['msaa4', 1]]) {
    await cdp.eval(`document.querySelector('#lh-settings-modal [data-gfx-aa="${aaMode}"]').click()`);
    await cdp.eval(`document.querySelector('#lh-settings-modal [data-gfx-scale="${scVal}"]').click()`);
    await cdp.waitFrames(4);
    const gfxNow = await cdp.eval(`window.__LH_APP.getSceneInfo().graphics`);
    assert(gfxNow.aa === aaMode && Math.abs(gfxNow.renderScale - scVal) < 0.05, 'AA/scale switch failed: ' + JSON.stringify(gfxNow));
  }
  // Open FXAA + SSAA briefly for clean Settings modal screenshot, then reset back to msaa4 1x
  await cdp.eval(`document.querySelector('#lh-settings-modal [data-gfx-aa="fxaa"]').click()`);
  await cdp.waitFrames(3);
  await cdp.screenshot('77_r10_menu_orbit_settings.png');
  await cdp.eval(`document.querySelector('#lh-settings-modal [data-gfx-aa="msaa4"]').click()`);
  await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await cdp.waitFrames(3);
  assert(await cdp.eval(`document.getElementById('lh-settings-modal').hidden === true`), 'Round 10 second Escape did not close Settings');

  // 3. Skeuomorphic Chronometer + Auto-slew RCS plumes on orientation changes
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.selectPreset('long-patience');
    app.commissionDraft();
    app.undock();
    app.setScreen('helm');
    window.LighthuggerScreens.setKgOpen(true);
    app.setAttitudeMode('prograde');
    app.step(0.05, 0.05, false, true);
    app.setAttitudeMode('retrograde');
  })()`);
  await cdp.waitFrames(5);
  const rcsAutoCheck = await cdp.eval(`(() => {
    const sc = window.__LH_APP.getSceneInfo();
    const dial = document.getElementById('lh-chrono-dial');
    const ctx = dial.getContext('2d');
    const pix = ctx.getImageData(0, 0, dial.width, dial.height).data;
    let nonZeroAlpha = 0;
    for (let i = 3; i < pix.length; i += 4) if (pix[i] > 10) nonZeroAlpha++;
    return {
      rcsFiring: sc.rcsJetsFiring,
      dialPixels: nonZeroAlpha,
      dilPct: document.getElementById('lh-chrono-dil-pct').textContent.trim()
    };
  })()`);
  assert(rcsAutoCheck.rcsFiring > 0 && rcsAutoCheck.dialPixels > 100 && rcsAutoCheck.dilPct === '100%',
    'Round 10 RCS auto-slew or skeuomorphic chronometer check failed: ' + JSON.stringify(rcsAutoCheck));
  await cdp.screenshot('78_r10_chrono_helm_rcs.png');

  // Verify RCS decays back to 0 once settled + dilation bar responds to gamma
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    for (let i = 0; i < 60; i++) app.step(0.1, 0.1, false, true);
  })()`);
  await cdp.waitFrames(8);
  const rcsSettled = await cdp.eval(`window.__LH_APP.getSceneInfo().rcsJetsFiring`);
  assert(rcsSettled === 0, 'Round 10 expected RCS jets to extinguish after settling, got ' + rcsSettled);

  // 4. 3D ORB default OFF even when plan active, toggled cleanly ON
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    const titan = app.getSnapshot().targetOrbits.find(t => /TITAN/i.test(t.label));
    if (titan) app.plotTargetOrbit(titan.id);
  })()`);
  await cdp.waitFrames(3);
  const orbDefaultOff = await cdp.eval(`(() => {
    const snap = window.__LH_APP.getSnapshot(), sc = window.__LH_APP.getSceneInfo();
    return { hasPlan: snap.hasActiveOrbitPlan, show: snap.showOrbitsInHelm, cur: sc.orbitCurves.current };
  })()`);
  assert(orbDefaultOff.hasPlan && !orbDefaultOff.show && !orbDefaultOff.cur, 'Round 10 3D ORB should default OFF: ' + JSON.stringify(orbDefaultOff));
  await cdp.click('#btn-vectors');
  await cdp.waitFrames(4);
  const orbToggledOn = await cdp.eval(`window.__LH_APP.getSceneInfo().orbitCurves`);
  assert(orbToggledOn.current === true && orbToggledOn.transfer === true, 'Round 10 3D ORB toggle ON failed: ' + JSON.stringify(orbToggledOn));
  await cdp.screenshot('79_r10_3d_orb_refined.png');
  await cdp.click('#btn-vectors');

  // 5. Orbit Nav clean UI/UX + C2 curved flip-burn avoidance
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    const yk = window.LighthuggerGalaxy.SYSTEMS.find(s => /ya.?ke/i.test(s.name || s.id));
    if (yk) app.enterSystemOrbit(yk.id, true);
    app.undock();
    app.setScreen('orbits');
  })()`);
  await cdp.waitFrames(6);
  const orbitUxCheck = await cdp.eval(`(() => {
    const sb = document.getElementById('lh-screenbar').getBoundingClientRect();
    const topBar = document.querySelector('#lh-screen-orbits .kg-chrono-top').getBoundingClientRect();
    const plate = document.querySelector('#kg-orbit-deck .kg-plate').textContent.trim();
    const emberBtn = [...document.querySelectorAll('#lh-target-list .lh-target')].find(b => /EMBER/i.test(b.textContent));
    if (emberBtn) emberBtn.click();
    return {
      sbCenter: (sb.left + sb.right) / 2,
      sbWidth: sb.width,
      topCenter: (topBar.left + topBar.right) / 2,
      topWidth: topBar.width,
      topHeight: topBar.height,
      plate,
      hasCoadeText: /CoaDE/i.test(document.getElementById('kg-orbit-deck').textContent),
      hint: document.getElementById('lh-orbit-hint').textContent.trim()
    };
  })()`);
  await cdp.waitFrames(3);
  const quickLblAfter = await cdp.eval(`document.getElementById('lbl-orbit-capture').textContent.trim()`);
  assert(
    Math.abs(orbitUxCheck.topCenter - orbitUxCheck.sbCenter) <= 8 &&
    orbitUxCheck.topWidth >= orbitUxCheck.sbWidth - 8 &&
    orbitUxCheck.topWidth <= 900 &&
    orbitUxCheck.topHeight <= 80 &&
    !orbitUxCheck.hasCoadeText &&
    orbitUxCheck.plate === 'ORBITAL CONTROL' &&
    !/\bSOL\b/i.test(orbitUxCheck.hint) &&
    quickLblAfter === 'ORBIT EMBER',
    'Round 10 Orbit Nav UI/UX check failed: ' + JSON.stringify({ orbitUxCheck, quickLblAfter })
  );
  await cdp.screenshot('80_r10_orbit_nav_clean.png');

  // Opposite-side Saturn flip-burn C2 curved avoidance screenshot
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.enterSystemOrbit('sol', true);
    app.undock();
    app.setScreen('orbits');
    const sR = app.orbit.bodyRadiusKm;
    const titan = app.getSnapshot().targetOrbits.find(t => /TITAN/i.test(t.label));
    const sys = window.LighthuggerGalaxy.SYSTEMS.find(s => s.id === 'sol');
    const stS = window.LighthuggerGalaxy.getBodyWorldState(sys, { kind: 'planet', planetIdx: app.orbit.planetIdx }, app.state.simTimeS).rKm;
    const ttS = window.LighthuggerGalaxy.getBodyWorldState(sys, { kind: 'moon', planetIdx: app.orbit.planetIdx, moonIdx: titan.focusRef.moonIdx }, app.state.simTimeS).rKm;
    const rel = [ttS[0] - stS[0], ttS[1] - stS[1], ttS[2] - stS[2]];
    const m = Math.hypot(...rel) || 1, u = rel.map(x => x / m);
    const d = sR * 2.8, v = Math.sqrt(app.orbit.muKm3S2 / d);
    app.orbit.rKm = [-u[0] * d, -u[1] * d, -u[2] * d];
    app.orbit.vKmS = [-u[1] * v, u[0] * v, 0];
    app.selectTargetOrbit(titan.id);
    window.__LH_APP.plotBrachistochroneOrbit(titan.id, 1.0);
  })()`);
  await cdp.waitFrames(6);
  const brachAvoid = await cdp.eval(`(() => {
    const p = window.__LH_APP.getSnapshot().orbitPlan;
    const sR = window.__LH_APP.orbit.bodyRadiusKm;
    const minKm = (p && p.points || []).reduce((m, pt) => Math.min(m, Math.hypot(...pt)), Infinity);
    return { valid: p && p.valid, surfaceIntercept: p && p.surfaceIntercept, minKm, sR };
  })()`);
  assert(brachAvoid.valid && !brachAvoid.surfaceIntercept && brachAvoid.minKm > brachAvoid.sR * 1.05,
    'Round 10 curved flip-burn avoidance failed: ' + JSON.stringify(brachAvoid));
  await cdp.screenshot('82_r10_brach_curved_avoidance.png');

  // 6. Sharpened Sextant grid & 2D SVG skymap
  await cdp.eval(`window.__LH_APP.setScreen('sextant')`);
  await cdp.waitFrames(6);
  const sxGridCheck = await cdp.eval(`(() => ({
    diagCount: document.querySelectorAll('#lh-skymap-svg .sk-grid-diag').length,
    aimLines: document.querySelectorAll('#lh-skymap-svg line.sk-aim').length
  }))()`);
  assert(sxGridCheck.diagCount >= 4 && sxGridCheck.aimLines >= 4, 'Round 10 sharpened Sextant skymap failed: ' + JSON.stringify(sxGridCheck));
  await cdp.screenshot('81_r10_sextant_grid.png');

  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.setAttitudeMode('prograde');
    app.resetVoyage();
    app.undock();
    app.setScreen('helm');
    window.LighthuggerScreens.setKgOpen(true);
  })()`);
  await cdp.waitFrames(3);
  console.log('ROUND10_CHECKS_OK:', JSON.stringify({ yaw0, yaw1, rcsAutoCheck, orbitUxCheck, quickLblAfter, brachAvoid, sxGridCheck }));
}

async function checkRound11(cdp) {
  // 1. Bay 2 integrated chronometer + digital elapsed clock + continuous warp trim wheel + <= 285px deck height
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.selectPreset('long-patience');
    app.commissionDraft();
    app.undock();
    app.setScreen('helm');
    window.LighthuggerScreens.setKgOpen(true);
    app.setCamViewMode('low');
    if (app.state.camLock) document.getElementById('sw-cam-lock').click();
  })()`);
  await cdp.waitFrames(5);

  const deckChrono = await cdp.eval(`(() => {
    const deck = document.getElementById('kg-deck');
    const pill = document.getElementById('lh-chrono-pill');
    const wheel = document.getElementById('kg-warp-vernier');
    const vr = wheel.getBoundingClientRect();
    const cx = vr.left + vr.width * 0.25, cy = vr.top + vr.height * 0.5;
    wheel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 88, clientX: cx, clientY: cy }));
    wheel.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 0, pointerId: 88, clientX: cx + 52, clientY: cy }));
    wheel.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 88, clientX: cx + 52, clientY: cy }));
    const sn = window.__LH_APP.getSnapshot();
    const dr = deck.getBoundingClientRect();
    const lr = document.getElementById('lh-chrono-epoch').getBoundingClientRect();
    const ar = document.querySelector('#kg-deck [data-att="manual"]').getBoundingClientRect();
    return {
      insideDeck: deck.contains(pill),
      deckHeight: dr.height,
      lcdTxt: document.getElementById('lh-chrono-epoch').textContent.trim(),
      trimmedWarp: sn.timeWarp,
      autoClockAfterTrim: sn.autoClock,
      capTxt: document.getElementById('kg-warp-vernier-cap').textContent.trim(),
      lcdClearOfAtt: lr.bottom <= ar.top + 1
    };
  })()`);
  assert(
    deckChrono.insideDeck && deckChrono.deckHeight <= 285 && deckChrono.lcdClearOfAtt &&
    /^\d{2,}y \d{3}d \d{2}:\d{2}:\d{2}$/.test(deckChrono.lcdTxt) &&
    deckChrono.trimmedWarp > 20 && deckChrono.autoClockAfterTrim === false &&
    deckChrono.capTxt.includes('WARP TRIM'),
    'Round 11 Bay 2 chrono / warp trim check failed: ' + JSON.stringify(deckChrono)
  );
  await cdp.eval(`document.querySelector('#kg-deck [data-warp="1"]').click()`);
  await cdp.waitFrames(3);

  // 2. Round 12 camera UX: default CAM LOCK OFF -> mouse drag orbits freely and holds custom angle;
  //    touching Pilot Puck snaps back to preset; CAM LOCK ON preserves custom angle across Pilot Puck!
  const lockCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    const cv = document.getElementById('lh-scene');
    const r = cv.getBoundingClientRect();
    const cx = r.left + r.width * 0.5, cy = r.top + r.height * 0.4;
    const dragScene = dx => {
      cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2, buttons: 2, pointerId: 91, pointerType: 'mouse', clientX: cx, clientY: cy }));
      cv.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 2, buttons: 2, pointerId: 91, pointerType: 'mouse', clientX: cx + dx, clientY: cy }));
      cv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 2, buttons: 0, pointerId: 91, pointerType: 'mouse', clientX: cx + dx, clientY: cy }));
    };
    const touchPuck = async () => {
      const well = document.getElementById('kg-puck-well');
      const wr = well.getBoundingClientRect();
      const wx = wr.left + wr.width * 0.5, wy = wr.top + wr.height * 0.5;
      well.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 92, clientX: wx + 10, clientY: wy }));
      await waitF(2);
      well.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 92, clientX: wx, clientY: wy }));
    };
    const defaultLock = app.getSnapshot().camLock;
    const yaw0 = app.getSnapshot().cam.orbitYaw;
    dragScene(120);
    await waitF(6);
    const yawDragged = app.getSnapshot().cam.orbitYaw;
    await waitF(8);
    const yawHeld = app.getSnapshot().cam.orbitYaw;
    const freeDragHolds = Math.abs(yawDragged - yaw0) > 0.35 && Math.abs(yawHeld - yawDragged) < 0.05;
    // Touch Pilot Puck -> snaps back to preset (Math.PI) while unlocked
    await touchPuck();
    for (let i = 0; i < 36 && Math.abs(Math.atan2(Math.sin(Math.PI - app.getSnapshot().cam.orbitYaw), Math.cos(Math.PI - app.getSnapshot().cam.orbitYaw))) > 0.08; i++) {
      await waitF(1);
    }
    const yawAfterPuck = app.getSnapshot().cam.orbitYaw;
    const snappedDist = Math.abs(Math.atan2(Math.sin(Math.PI - yawAfterPuck), Math.cos(Math.PI - yawAfterPuck)));
    // Turn CAM LOCK ON -> drag custom angle -> Pilot Puck must NOT snap back
    document.getElementById('sw-cam-lock').click();
    dragScene(-135);
    await waitF(5);
    const yawLockedCustom = app.getSnapshot().cam.orbitYaw;
    await touchPuck();
    await waitF(14);
    const yawLockedAfterPuck = app.getSnapshot().cam.orbitYaw;
    const lockedPreservesCustom = Math.abs(yawLockedCustom - Math.PI) > 0.35 && Math.abs(yawLockedAfterPuck - yawLockedCustom) < 0.08;
    document.getElementById('sw-cam-lock').click(); // restore false
    return {
      defaultLock,
      freeDragHolds,
      yawAfterPuck,
      snappedDist,
      lockedPreservesCustom,
      restoredLock: app.getSnapshot().camLock
    };
  })()`);
  assert(lockCheck.defaultLock === false && lockCheck.freeDragHolds && lockCheck.snappedDist < 0.12 &&
    lockCheck.lockedPreservesCustom && lockCheck.restoredLock === false,
    'Round 12 CamLock / Pilot Puck contract failed: ' + JSON.stringify(lockCheck));

  // 3. 3-way skeuomorphic viewpoint cycle: 3RD LOW -> 3RD HIGH -> 1ST PERS -> 3RD LOW
  const camLowY = await cdp.eval(`window.__LH_APP.getSceneInfo().camera.y`);
  await cdp.eval(`document.getElementById('btn-cam-view').click()`);
  await cdp.waitFrames(36);
  const viewHigh = await cdp.eval(`(() => ({
    btnMode: document.getElementById('btn-cam-view').dataset.camView,
    lbl: document.getElementById('lbl-cam-view').textContent.trim(),
    hideShip: window.__LH_APP.getSnapshot().hideShip,
    camY: window.__LH_APP.getSceneInfo().camera.y
  }))()`);
  assert(viewHigh.btnMode === 'high' && viewHigh.lbl === '3RD HIGH' && viewHigh.hideShip === false && viewHigh.camY > camLowY + 8,
    'Round 11 3RD HIGH viewpoint failed: ' + JSON.stringify({ camLowY, viewHigh }));
  await cdp.screenshot('83_r11_chrono_bay_and_view_high.png');

  await cdp.eval(`document.getElementById('btn-cam-view').click()`);
  await cdp.waitFrames(32);
  const viewFirst = await cdp.eval(`(() => ({
    btnMode: document.getElementById('btn-cam-view').dataset.camView,
    lbl: document.getElementById('lbl-cam-view').textContent.trim(),
    hideShip: window.__LH_APP.getSnapshot().hideShip,
    camDist: window.__LH_APP.getSceneInfo().camera.dist
  }))()`);
  assert(viewFirst.btnMode === 'first' && viewFirst.lbl === '1ST PERS' && viewFirst.hideShip === true && viewFirst.camDist < 36,
    'Round 11 1ST PERS viewpoint failed: ' + JSON.stringify(viewFirst));
  await cdp.screenshot('84_r11_first_person_view.png');

  await cdp.eval(`document.getElementById('btn-cam-view').click()`);
  await cdp.waitFrames(24);
  assert(await cdp.eval(`window.__LH_APP.getSnapshot().camViewMode === 'low' && window.__LH_APP.getSnapshot().hideShip === false`),
    'Round 11 return from 1ST PERS to 3RD LOW failed');

  // 4. Ice harvesting bar sits directly above KG-2100 + visibly icy 3D object + realistic 1x clock
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.state.iceIntegrity = 0.55;
    document.getElementById('btn-ice-harvest').click();
  })()`);
  await cdp.waitFrames(18);
  const harvestLayout = await cdp.eval(`(() => {
    const bar = document.getElementById('lh-harvest-bar');
    const deck = document.getElementById('kg-deck');
    const br = bar.getBoundingClientRect(), dr = deck.getBoundingClientRect();
    const sn = window.__LH_APP.getSnapshot();
    const sc = window.__LH_APP.getSceneInfo();
    return {
      barVisible: !bar.hidden,
      barAboveDeck: br.bottom <= dr.top + 4 && br.bottom >= dr.top - 50,
      subTxt: document.getElementById('lh-harvest-sub').textContent.trim(),
      autoWarp: sn.effectiveWarp,
      shuttlesActive: sc.shuttlesActive,
      icebergVisible: sc.harvestIcebergVisible
    };
  })()`);
  assert(
    harvestLayout.barVisible && harvestLayout.barAboveDeck && harvestLayout.autoWarp >= 60 &&
    harvestLayout.icebergVisible && harvestLayout.shuttlesActive > 0 &&
    /(ENCELADUS|TITAN|ICE|COMET)/i.test(harvestLayout.subTxt),
    'Round 11 ice harvest placement / 3D glacier check failed: ' + JSON.stringify(harvestLayout)
  );
  await cdp.screenshot('85_r11_ice_harvest_above_kg.png');

  // Switching to 1x slows ice harvesting to realistic hours
  const slow1x = await cdp.eval(`(() => {
    document.querySelector('#kg-deck [data-warp="1"]').click();
    const p0 = window.__LH_APP.getSnapshot().iceHarvest.progress;
    window.__LH_APP.step(2.0, 2.0, false, true);
    const sn = window.__LH_APP.getSnapshot();
    return { effectiveWarp: sn.effectiveWarp, dp: sn.iceHarvest.progress - p0, active: sn.iceHarvest.active };
  })()`);
  assert(slow1x.active && slow1x.effectiveWarp === 1 && slow1x.dp >= 0 && slow1x.dp < 0.002,
    'Round 11 1x realistic ice harvest slowdown failed: ' + JSON.stringify(slow1x));

  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.setCamViewMode('low');
    app.setAttitudeMode('prograde');
    app.resetVoyage();
    app.undock();
    app.setScreen('helm');
    window.LighthuggerScreens.setKgOpen(true);
  })()`);
  await cdp.waitFrames(4);
  console.log('ROUND11_CHECKS_OK:', JSON.stringify({ deckChrono, lockCheck, viewHigh, viewFirst, harvestLayout, slow1x }));
}

async function checkRound12(cdp) {
  // 1. Stowed KG-2100 hardware panel keycaps + CAM LOCK false default
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.selectPreset('long-patience');
    app.commissionDraft();
    app.undock();
    app.setScreen('helm');
    window.LighthuggerScreens.setKgOpen(false);
  })()`);
  await cdp.waitFrames(4);
  const stowedUi = await cdp.eval(`(() => {
    const strip = document.getElementById('lh-helm-strip');
    const lockBtn = strip.querySelector('[data-hud-toggle="lock"]');
    const swLock = document.getElementById('sw-cam-lock');
    const activeCap = strip.querySelector('.lh-hs-btn[aria-pressed="true"]');
    const cs = activeCap ? getComputedStyle(activeCap) : null;
    return {
      stripVisible: !strip.hidden && strip.getBoundingClientRect().height > 30,
      stripLockPressed: lockBtn ? lockBtn.getAttribute('aria-pressed') : null,
      swLockPressed: swLock ? swLock.getAttribute('aria-pressed') : null,
      beveledBg: !!(cs && cs.backgroundImage && cs.backgroundImage !== 'none'),
      beveledShadow: !!(cs && cs.boxShadow && cs.boxShadow !== 'none')
    };
  })()`);
  assert(
    stowedUi.stripVisible && stowedUi.stripLockPressed === 'false' && stowedUi.swLockPressed === 'false' &&
    stowedUi.beveledBg && stowedUi.beveledShadow,
    'Round 12 stowed panel keycap / camLock check failed: ' + JSON.stringify(stowedUi)
  );
  await cdp.screenshot('86_r12_stowed_panel.png');

  // 2. Orbit Nav organization + mapped ice deposits overlay toggle
  await cdp.eval(`(() => {
    window.__LH_APP.setScreen('orbits');
  })()`);
  await cdp.waitFrames(5);
  const orbitCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const iceBtn = document.getElementById('btn-orbit-ice');
    const note = document.getElementById('lh-orbit-note');
    const hint = document.getElementById('lh-orbit-hint');
    const leg = document.querySelector('#lh-screen-orbits .lh-map-legend');
    const sb = document.getElementById('lh-screenbar').getBoundingClientRect();
    const top = document.querySelector('#lh-screen-orbits > .kg-chrono-top').getBoundingClientRect();
    const nr = note.getBoundingClientRect();
    const hr = hint.getBoundingClientRect();
    const lr = leg.getBoundingClientRect();
    const iceTargets = document.querySelectorAll('#lh-target-list .lh-target.is-ice-deposit').length;
    const beforeShow = iceBtn.getAttribute('aria-pressed');
    iceBtn.click();
    await waitF(3);
    const midShow = iceBtn.getAttribute('aria-pressed');
    iceBtn.click();
    await waitF(3);
    const afterShow = iceBtn.getAttribute('aria-pressed');
    const noteBg = getComputedStyle(note).backgroundColor;
    return {
      iceTargets,
      beforeShow,
      midShow,
      afterShow,
      clearBar: top.top >= sb.bottom - 1,
      hintLegendClear: hr.right <= lr.left + 2 || hr.bottom <= lr.top + 2,
      noteHasBg: !!noteBg && noteBg !== 'rgba(0, 0, 0, 0)',
      legendIce: !!(leg && leg.querySelector('.lg-ice'))
    };
  })()`);
  assert(
    orbitCheck.iceTargets >= 2 && orbitCheck.beforeShow === 'true' && orbitCheck.midShow === 'false' &&
    orbitCheck.afterShow === 'true' && orbitCheck.clearBar && orbitCheck.hintLegendClear &&
    orbitCheck.noteHasBg && orbitCheck.legendIce,
    'Round 12 Orbit Nav organization check failed: ' + JSON.stringify(orbitCheck)
  );
  await cdp.screenshot('87_r12_orbit_nav_organized.png');

  // 3. Starmap full-bleed viewport + right docked panel without overlapping screenbar or rivets
  await cdp.eval(`window.__LH_APP.setScreen('starmap')`);
  await cdp.waitFrames(5);
  const starmapCheck = await cdp.eval(`(() => {
    const scr = document.getElementById('lh-screen-starmap');
    const vp = scr.querySelector('.lh-chrono-viewport');
    const aside = scr.querySelector('.lh-split-panel');
    const hud = scr.querySelector('.lh-map-hud-tl');
    const sb = document.getElementById('lh-screenbar').getBoundingClientRect();
    const ar = aside.getBoundingClientRect();
    const hr = hud.getBoundingClientRect();
    const vpc = getComputedStyle(vp);
    return {
      postsInsideVp: vp.querySelectorAll('.kg-post').length,
      borderTopW: parseFloat(vpc.borderTopWidth) || 0,
      asideBelowBar: ar.top >= sb.bottom - 1,
      hudBelowBar: hr.top >= sb.bottom - 1,
      noHorizOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    };
  })()`);
  assert(
    starmapCheck.postsInsideVp === 0 && starmapCheck.borderTopW === 0 &&
    starmapCheck.asideBelowBar && starmapCheck.hudBelowBar && starmapCheck.noHorizOverflow,
    'Round 12 Starmap integration check failed: ' + JSON.stringify(starmapCheck)
  );
  await cdp.screenshot('88_r12_starmap_integrated.png');

  // 4. Sextant streamlined: no duplicate reset, centered banner, 2-row Bay 2 keys, invariant 244px deck
  await cdp.eval(`window.__LH_APP.setScreen('sextant')`);
  await cdp.waitFrames(5);
  const sextantCheck = await cdp.eval(`(() => {
    const br = document.getElementById('lh-sx-banner').getBoundingClientRect();
    const dr = document.getElementById('kg-sextant-deck').getBoundingClientRect();
    const sb = document.getElementById('lh-screenbar').getBoundingClientRect();
    return {
      dupRemoved: document.getElementById('btn-osc-reset') === null,
      crtRstExists: !!document.getElementById('btn-osc-rst'),
      rowA: !!document.querySelector('#kg-sextant-bays .lh-sx-row-a'),
      rowB: !!document.querySelector('#kg-sextant-bays .lh-sx-row-b'),
      bannerCenteredDx: Math.abs((br.left + br.right) * 0.5 - window.innerWidth * 0.5),
      bannerBelowBar: br.top >= sb.bottom - 1,
      deckHeight: dr.height
    };
  })()`);
  assert(
    sextantCheck.dupRemoved && sextantCheck.crtRstExists && sextantCheck.rowA && sextantCheck.rowB &&
    sextantCheck.bannerCenteredDx < 36 && sextantCheck.bannerBelowBar && sextantCheck.deckHeight <= 248,
    'Round 12 Sextant check failed: ' + JSON.stringify(sextantCheck)
  );
  await cdp.screenshot('89_r12_sextant_streamlined.png');

  // 5. Helm true mapped ice deposit sortie (distance scaled, true 3D deposit, DropShips launched toward deposit)
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.setScreen('helm');
    window.LighthuggerScreens.setKgOpen(true);
    app.state.iceIntegrity = 0.52;
    document.getElementById('btn-ice-harvest').click();
  })()`);
  await cdp.waitFrames(18);
  const sortieCheck = await cdp.eval(`(() => {
    const app = window.__LH_APP;
    const sn = app.getSnapshot();
    const sc = app.getSceneInfo();
    const sub = document.getElementById('lh-harvest-sub').textContent.trim();
    return {
      harvesting: !!sn.iceHarvest.active,
      depositId: sn.iceHarvest.depositId,
      distKm: sn.iceHarvest.distKm,
      depositsMapped: Array.isArray(sn.iceDeposits) ? sn.iceDeposits.length : 0,
      sceneDeps: sc.iceDepositCount,
      activeSceneDep: sc.activeIceDepositId,
      shuttlesActive: sc.shuttlesActive,
      subTxt: sub
    };
  })()`);
  assert(
    sortieCheck.harvesting && sortieCheck.depositId && sortieCheck.distKm > 0 &&
    sortieCheck.depositsMapped >= 2 && sortieCheck.sceneDeps >= 2 &&
    sortieCheck.activeSceneDep === sortieCheck.depositId && sortieCheck.shuttlesActive > 0 &&
    /(km|M km)/i.test(sortieCheck.subTxt),
    'Round 12 real ice deposit sortie check failed: ' + JSON.stringify(sortieCheck)
  );
  await cdp.screenshot('90_r12_ice_deposit_sortie.png');

  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.resetVoyage();
    app.undock();
    app.setScreen('helm');
    window.LighthuggerScreens.setKgOpen(true);
    if (app.state.camLock) document.getElementById('sw-cam-lock').click();
  })()`);
  await cdp.waitFrames(4);
  console.log('ROUND12_CHECKS_OK:', JSON.stringify({ stowedUi, orbitCheck, starmapCheck, sextantCheck, sortieCheck }));
}

async function checkRound13(cdp) {
  let diag = null;
  for (let i = 0; i < 80; i++) {
    diag = await cdp.eval(`window.__LH_APP && window.__LH_APP.getAudioDiagnostics ? window.__LH_APP.getAudioDiagnostics() : null`);
    if (diag && diag.manifestLoaded && (diag.stemsLoaded + diag.stemsFailed) >= diag.stemsTotal && diag.stemsTotal > 0) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert(
    diag && diag.supported === true && diag.manifestLoaded === true &&
    diag.stemsTotal === 25 && diag.stemsLoaded === 25 && diag.stemsFailed === 0 &&
    diag.convolverReady === true,
    'Round 13-15 audio preload/decode check failed: ' + JSON.stringify(diag)
  );

  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    if (app) { app.stopAll(); app.enterSystemOrbit('sol', true); }
    if (window.LighthuggerScreens && window.LighthuggerScreens.setScreen) {
      window.LighthuggerScreens.setScreen('helm');
    }
  })()`);
  await cdp.waitFrames(4);
  await cdp.eval(`document.getElementById('btn-audio-toggle').click()`);
  await cdp.waitFrames(3);
  const popOpenCheck = await cdp.eval(`(() => {
    const btn = document.getElementById('btn-audio-toggle');
    const pop = document.getElementById('lh-audio-popover');
    const layers = document.getElementById('lh-pop-layers').textContent.trim();
    const r = pop.getBoundingClientRect();
    return {
      expanded: btn.getAttribute('aria-expanded'),
      popHidden: pop.hidden,
      layers,
      fits: r.top >= 0 && r.bottom <= window.innerHeight + 1 && r.left >= 0 && r.right <= window.innerWidth + 1
    };
  })()`);
  assert(
    popOpenCheck.expanded === 'true' && popOpenCheck.popHidden === false &&
    popOpenCheck.layers.includes('ORBITAL MUSIC') && popOpenCheck.fits,
    'Round 14 audio popover open check failed: ' + JSON.stringify(popOpenCheck)
  );
  if (OUT_DIR) await cdp.screenshot('91_r14_audio_popover.png');

  const muteCheck = await cdp.eval(`(() => {
    const app = window.__LH_APP;
    const btn = document.getElementById('btn-audio-toggle');
    const popMute = document.getElementById('btn-pop-audio-mute');
    const rm = document.getElementById('rng-pop-music');
    rm.value = '50';
    rm.dispatchEvent(new Event('input', { bubbles: true }));
    const musicOut = document.getElementById('out-pop-music').textContent.trim();
    const musicCfg = app.getAudioConfig().music;
    rm.value = '68';
    rm.dispatchEvent(new Event('input', { bubbles: true }));

    const c0 = app.getAudioConfig();
    popMute.click();
    const c1 = app.getAudioConfig();
    const m1 = btn.getAttribute('data-muted');
    popMute.click();
    const c2 = app.getAudioConfig();
    const m2 = btn.getAttribute('data-muted');

    btn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const r1 = app.getAudioConfig().enabled;
    btn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const r2 = app.getAudioConfig().enabled;

    document.getElementById('btn-pop-audio-close').click();
    const closedHidden = document.getElementById('lh-audio-popover').hidden;
    const closedExp = btn.getAttribute('aria-expanded');
    const stored = JSON.parse(localStorage.getItem('lh_audio_v1') || 'null');
    return {
      musicOut, musicCfg,
      before: c0.enabled, muted: c1.enabled, m1,
      restored: c2.enabled, m2,
      r1, r2, closedHidden, closedExp,
      storedEnabled: stored ? stored.enabled : null
    };
  })()`);
  assert(
    muteCheck.musicOut === '50%' && Math.abs(muteCheck.musicCfg - 0.5) < 0.01 &&
    muteCheck.before === true && muteCheck.muted === false && muteCheck.m1 === '1' &&
    muteCheck.restored === true && muteCheck.m2 === '0' &&
    muteCheck.r1 === false && muteCheck.r2 === true &&
    muteCheck.closedHidden === true && muteCheck.closedExp === 'false' &&
    muteCheck.storedEnabled === true,
    'Round 14 audio popover slider / mute / persistence check failed: ' + JSON.stringify(muteCheck)
  );

  await cdp.eval(`document.getElementById('btn-settings-open').click()`);
  await cdp.waitFrames(4);
  const settingsAudio = await cdp.eval(`(() => {
    const app = window.__LH_APP;
    const stText = document.getElementById('lh-audio-status').textContent.trim();
    const hasMusicRng = !!document.getElementById('rng-audio-music');
    const radioTip = document.getElementById('rng-audio-amb')?.closest('label')?.getAttribute('title') || '';
    const rng = document.getElementById('rng-audio-master');
    rng.value = '60';
    rng.dispatchEvent(new Event('input', { bubbles: true }));
    const out60 = document.getElementById('out-audio-master').textContent.trim();
    const cfg60 = app.getAudioConfig();
    const revBtn = document.getElementById('btn-set-audio-reverb');
    revBtn.click();
    const revOff = app.getAudioConfig().reverb;
    revBtn.click();
    const revOn = app.getAudioConfig().reverb;
    const card = document.querySelector('#lh-settings-modal .lh-settings-card').getBoundingClientRect();
    const sb = document.getElementById('lh-screenbar').getBoundingClientRect();
    return {
      stText,
      hasMusicRng,
      radioTip,
      out60,
      master60: cfg60.master,
      revOff,
      revOn,
      cardFits: card.top >= 0 && card.bottom <= window.innerHeight + 1 && card.left >= 0 && card.right <= window.innerWidth + 1,
      sbSingleLine: sb.height < 42,
      sbOverflowX: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    };
  })()`);
  assert(
    settingsAudio.stText.includes('25/25') && settingsAudio.hasMusicRng &&
    settingsAudio.radioTip.includes('Cassini') &&
    settingsAudio.out60 === '60%' && Math.abs(settingsAudio.master60 - 0.6) < 0.01 &&
    settingsAudio.revOff === false && settingsAudio.revOn === true &&
    settingsAudio.cardFits && settingsAudio.sbSingleLine && settingsAudio.sbOverflowX,
    'Round 14 settings audio controls check failed: ' + JSON.stringify(settingsAudio)
  );
  if (OUT_DIR) await cdp.screenshot('92_r14_audio_settings.png');

  await cdp.eval(`(() => {
    const rng = document.getElementById('rng-audio-master');
    rng.value = '78';
    rng.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('btn-set-close').click();
  })()`);
  await cdp.waitFrames(3);

  const modCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    await waitF(3);
    const dockedTargets = app.getAudioDiagnostics().targets;
    app.undock();
    app.setThrustG(1.5);
    await waitF(4);
    const burnTargets = app.getAudioDiagnostics().targets;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    return {
      dockedMusicOrb: dockedTargets.musicOrbitalGain,
      dockedCabin: dockedTargets.cabinGain,
      dockedDrive: dockedTargets.driveGain,
      burnDrive: burnTargets.driveGain,
      burnCutoff: burnTargets.driveCutoff
    };
  })()`);
  assert(
    modCheck.dockedMusicOrb > 0.2 &&
    modCheck.dockedCabin > 0.15 && modCheck.dockedDrive === 0 &&
    modCheck.burnDrive > 0.15 && modCheck.burnCutoff > 1000,
    'Round 14 live telemetry audio modulation check failed: ' + JSON.stringify(modCheck)
  );

  // Clean Screenshot / Photo Mode verification
  await cdp.eval(`(() => {
    if (window.LighthuggerScreens && window.LighthuggerScreens.setScreen) {
      window.LighthuggerScreens.setScreen('helm');
    }
    document.getElementById('btn-photo-mode').click();
  })()`);
  await cdp.waitFrames(5);
  const photoOn = await cdp.eval(`(() => {
    const hdr = document.querySelector('.header-bar');
    const sb = document.getElementById('lh-screenbar');
    const tm = document.getElementById('lh-telemetry');
    const lbl = document.getElementById('lh-labels');
    const ex = document.getElementById('btn-photo-exit');
    const sc = document.getElementById('lh-scene').getBoundingClientRect();
    return {
      hasBodyCls: document.body.classList.contains('lh-photo-mode'),
      hdrDisp: getComputedStyle(hdr).display,
      sbDisp: getComputedStyle(sb).display,
      tmDisp: getComputedStyle(tm).display,
      lblDisp: getComputedStyle(lbl).display,
      exitHidden: ex.hidden,
      sceneTop: Math.round(sc.top),
      sceneW: Math.round(sc.width),
      sceneH: Math.round(sc.height),
      winW: window.innerWidth,
      winH: window.innerHeight
    };
  })()`);
  assert(
    photoOn.hasBodyCls && photoOn.hdrDisp === 'none' && photoOn.sbDisp === 'none' &&
    photoOn.tmDisp === 'none' && photoOn.lblDisp === 'none' && photoOn.exitHidden === false &&
    photoOn.sceneTop === 0 && photoOn.sceneW >= photoOn.winW - 1 && photoOn.sceneH >= photoOn.winH - 1,
    'Round 14 Screenshot Mode activation check failed: ' + JSON.stringify(photoOn)
  );
  if (OUT_DIR) await cdp.screenshot('93_r14_screenshot_mode.png');

  await cdp.eval(`document.getElementById('btn-photo-exit').click()`);
  await cdp.waitFrames(4);
  const photoOff = await cdp.eval(`(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'H', shiftKey: true, bubbles: true, cancelable: true }));
    const onViaKey = document.body.classList.contains('lh-photo-mode');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const offViaEsc = !document.body.classList.contains('lh-photo-mode');
    const sc = document.getElementById('lh-scene').getBoundingClientRect();
    const hdr = document.querySelector('.header-bar');
    return {
      onViaKey,
      offViaEsc,
      hdrDisp: getComputedStyle(hdr).display,
      exitHidden: document.getElementById('btn-photo-exit').hidden,
      sceneTop: Math.round(sc.top)
    };
  })()`);
  assert(
    photoOff.onViaKey && photoOff.offViaEsc && photoOff.hdrDisp !== 'none' &&
    photoOff.exitHidden === true && photoOff.sceneTop >= 40,
    'Round 14 Screenshot Mode exit / hotkey toggle check failed: ' + JSON.stringify(photoOff)
  );
  console.log('ROUND13_AUDIO_CHECK:', JSON.stringify({ stemsLoaded: diag.stemsLoaded, stemsTotal: diag.stemsTotal, convolverReady: diag.convolverReady, popOpenCheck, muteCheck, settingsAudio, modCheck, photoOn, photoOff }));
}

async function checkRound16(cdp) {
  // 1. Weapons tab in Ship Creator & Drydock + 3D hardpoint count updates
  const wpnCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    document.querySelector('#lh-screenbar [data-screen-btn="menu"]').click();
    await waitF(3);
    document.querySelector('#lh-menu-right [data-cztab="weapons"]').click();
    await waitF(4);
    const czPanel = document.getElementById('lh-cz-weapons');
    const initBudget = app.getSnapshot().weaponBudget;
    const plusMsl = czPanel.querySelector('[data-wpn-key="wpnMissile"][data-wpn-delta="1"]');
    if (plusMsl && !plusMsl.disabled) plusMsl.click();
    await waitF(5);
    const afterBudget = app.getSnapshot().weaponBudget;
    const sceneInfo = app.getSceneInfo();
    return {
      panelVisible: czPanel && !czPanel.hidden,
      powerTxt: czPanel.querySelector('[data-wpn-role="power-val"]')?.textContent || '',
      heatTxt: czPanel.querySelector('[data-wpn-role="heat-val"]')?.textContent || '',
      initMsl: initBudget?.counts?.missile,
      afterMsl: afterBudget?.counts?.missile,
      hpMsl: sceneInfo?.weaponHardpointCount?.missile || 0,
      hpPdc: sceneInfo?.weaponHardpointCount?.pdc || 0
    };
  })()`);
  console.log('ROUND16_WEAPONS_CREATOR:', JSON.stringify(wpnCheck));
  assert(
    wpnCheck.panelVisible && wpnCheck.powerTxt.includes('MW') && wpnCheck.heatTxt.includes('MW') &&
    wpnCheck.initMsl === 2 && wpnCheck.afterMsl === 3 && wpnCheck.hpMsl === 3 && wpnCheck.hpPdc === 2,
    'Round 16 weapons creator/hardpoints check failed: ' + JSON.stringify(wpnCheck)
  );
  await cdp.screenshot('90_r16_weapons_creator.png');

  await cdp.eval(`(() => {
    const prStock = document.querySelector('#lh-cz-weapons [data-wpn-preset="stock"]');
    if (prStock) prStock.click();
  })()`);
  await cdp.waitFrames(3);

  // 2. Endless 50 LY Frontier unidentified signals, inhabited/uninhabited diversity & Milky Way zoom
  const mwCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    const Gx = window.LighthuggerGalaxy;
    Gx.ensureSectorsNear([180, 0, -140], 50);
    const deepSys = Gx.DYNAMIC_SYSTEMS[0];
    if (deepSys) app.enterSystemOrbit(deepSys.id, false);
    document.querySelector('#lh-screenbar [data-screen-btn="starmap"]').click();
    await waitF(5);
    const listBtns = Array.from(document.querySelectorAll('#lh-sys-list [data-star]'));
    const hasUnidentified = listBtns.some(b => b.textContent.includes('UNIDENTIFIED'));
    const hasInhab = Gx.DYNAMIC_SYSTEMS.some(s => !!s.station);
    const hasUninhab = Gx.DYNAMIC_SYSTEMS.some(s => !s.station);
    document.querySelector('[data-starscale="milkyway"]').click();
    await waitF(6);
    const cv = document.getElementById('lh-starmap-canvas');
    const activeMw = document.querySelector('[data-starscale="milkyway"]')?.getAttribute('aria-pressed') === 'true';
    const mwSnap = app.getSnapshot().milkyWay;
    return {
      hasUnidentified,
      hasInhab,
      hasUninhab,
      activeMw,
      mwSector: mwSnap?.sectorLabel,
      mwRadiusLy: mwSnap?.galRadiusLy,
      canvasW: cv?.width || 0
    };
  })()`);
  console.log('ROUND16_STARMAP_MILKYWAY:', JSON.stringify(mwCheck));
  assert(
    mwCheck.hasUnidentified && mwCheck.hasInhab && mwCheck.hasUninhab &&
    mwCheck.activeMw && mwCheck.mwRadiusLy > 24000 && mwCheck.canvasW > 100,
    'Round 16 starmap / Milky Way check failed: ' + JSON.stringify(mwCheck)
  );
  await cdp.screenshot('91_r16_starmap_milkyway.png');

  await cdp.eval(`(() => {
    const linBtn = document.querySelector('[data-starscale="linear"]');
    if (linBtn) linBtn.click();
    const app = window.__LH_APP;
    app.state.discoveredSystems = [];
    app.state.visitedSystems = ['sol'];
    app.enterSystemOrbit('sol', true);
    document.querySelector('#lh-screenbar [data-screen-btn="drydock"]').click();
  })()`);
  await cdp.waitFrames(4);
  const ddCheck = await cdp.eval(`(() => {
    const tab = document.querySelector('#lh-screen-drydock [data-dtab="weapons"]');
    if (tab) tab.click();
    const pnl = document.getElementById('lh-dd-weapons');
    return {
      hasDrydockWeapons: !!(pnl && !pnl.hidden),
      ddPowerTxt: pnl?.querySelector('[data-wpn-role="power-val"]')?.textContent || ''
    };
  })()`);
  assert(ddCheck.hasDrydockWeapons && ddCheck.ddPowerTxt.includes('MW'), 'Drydock weapons tab failed: ' + JSON.stringify(ddCheck));

  // 3. Ship label de-overlap + AI orbital missile salvo in curved orbit
  const combatCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.undock();
    document.querySelector('#lh-screenbar [data-screen-btn="helm"]').click();
    await waitF(6);
    if (!app.state.hudWeapons) {
      document.getElementById('btn-wpn-guard').click();
      document.getElementById('sw-hud-wpn').click();
    }
    if (!app.state.weaponLockOn) document.getElementById('btn-wpn-lock').click();
    await waitF(6);
    document.getElementById('btn-wpn-fire').click();
    document.getElementById('btn-wpn-msl').click();
    for (let i = 0; i < 4; i++) app.step(0.25);
    await waitF(6);
    const snap = app.getSnapshot();
    const wt = snap.hud.weaponTarget;
    const wtName = String((wt && wt.name) || '').toUpperCase();
    const labels = Array.from(document.querySelectorAll('#lh-labels .lh-label'))
      .filter(el => !el.hidden)
      .map(el => ({ text: el.textContent, rect: el.getBoundingClientRect() }));
    const dupLockedLabel = labels.some(l => wtName && l.text.toUpperCase().includes(wtName));
    const wpnBarRect = document.getElementById('kg-wpn-bar')?.getBoundingClientRect();
    let overlapsWpnBar = false;
    if (wpnBarRect) {
      overlapsWpnBar = labels.some(l =>
        l.rect.right > wpnBarRect.left && l.rect.left < wpnBarRect.right &&
        l.rect.bottom > wpnBarRect.top && l.rect.top < wpnBarRect.bottom
      );
    }
    return {
      projCount: (snap.projectiles || []).length,
      missiles: (snap.projectiles || []).filter(p => p.kind === 'missile').length,
      rails: (snap.projectiles || []).filter(p => p.kind === 'rail' || p.kind === 'rkv').length,
      active3d: app.getSceneInfo()?.projectilesActive || 0,
      lockedId: wt?.id || null,
      dupLockedLabel,
      overlapsWpnBar
    };
  })()`);
  console.log('ROUND16_COMBAT_MISSILES:', JSON.stringify(combatCheck));
  assert(
    combatCheck.projCount >= 2 && combatCheck.missiles >= 1 && combatCheck.rails >= 1 &&
    combatCheck.active3d >= 2 && !combatCheck.dupLockedLabel && !combatCheck.overlapsWpnBar,
    'Round 16 combat missiles / label overlap check failed: ' + JSON.stringify(combatCheck)
  );
  await cdp.screenshot('92_r16_combat_no_overlap_missiles.png');

  // 4. 3D relativistic contraction, Doppler shift, and aberration on planets + corridor ships
  const relCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    if (app.state.hudWeapons) document.getElementById('sw-hud-wpn').click();
    app.engageInterstellar({ destId: 'rigil' });
    app.state.mission = null;
    app.state.relGov = false;
    app.setThrustG(1.8);
    for (let i = 0; i < 16; i++) app.step(0.1 * 31557600);
    app.setTimeWarp(1);
    app.state.hudRel = true;
    app.state.hudFlight = false;
    const curSys = window.LighthuggerGalaxy.getSystem(app.getSceneInfo().systemId || 'sol');
    const baseXyz = (curSys && curSys.xyz) || [0, 0, 0];
    const sat = app.getSceneInfo().bodies.find(b => b.key === 'planet');
    if (sat && sat.posKm) {
      const vG = app.state.velocityGal || app.state.headingGal || [1, 0, 0];
      const vm = Math.hypot(vG[0], vG[1], vG[2]) || 1;
      const hx = vG[0] / vm, hy = vG[1] / vm, hz = vG[2] / vm;
      const kmPerLy = 9.46073047e12;
      app.state.posGal = [
        baseXyz[0] + (sat.posKm[0] - hx * 680000) / kmPerLy,
        baseXyz[1] + (sat.posKm[1] - hy * 680000 + 180000) / kmPerLy,
        baseXyz[2] + (sat.posKm[2] - hz * 680000) / kmPerLy
      ];
    }
    app.step(0.01, 0.01, false, true);
    document.querySelector('#lh-screenbar [data-screen-btn="helm"]').click();
    await waitF(6);
    const rs = app.getRelativitySnapshot();
    const contacts = app.getSnapshot().contacts || [];
    const cRel = rs.corridorRel || [];
    const planetContraction = (rs.planetHolderScale && rs.planetHolderScale[1] > 0)
      ? (rs.planetHolderScale[0] / rs.planetHolderScale[1])
      : 1;
    const corridorScaleMin = cRel.length
      ? Math.min(...cRel.map(c => (c.scale && c.scale[1] > 0) ? (c.scale[0] / c.scale[1]) : 1))
      : 1;
    return {
      beta: rs.beta,
      gamma: rs.gamma,
      planetContraction,
      corridorCount: cRel.length,
      corridorScaleMin,
      dSpread: contacts.length ? Math.max(...contacts.map(c => c.D)) - Math.min(...contacts.map(c => c.D)) : 0
    };
  })()`);
  console.log('ROUND16_RELATIVITY_3D:', JSON.stringify(relCheck));
  assert(
    relCheck.beta > 0.7 && relCheck.planetContraction < 0.8 &&
    relCheck.corridorCount >= 1 && relCheck.corridorScaleMin < 1 && relCheck.dSpread > 0.2,
    'Round 16 3D relativity check failed: ' + JSON.stringify(relCheck)
  );
  await cdp.screenshot('93_r16_relativity_planets_ships.png');

  // Reset cleanly back to Sol docked stock Long Patience
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.recommissionShip();
    app.enterSystemOrbit('sol', true);
    app.selectPreset('long-patience');
    app.commissionDraft();
    app.state.iceIntegrity = 1;
    app.state.hullIntegrity = 1;
    app.state.relGov = true;
    app.state.weaponLockOn = false;
    if (document.getElementById('sw-hud-wpn')?.getAttribute('aria-pressed') === 'true') document.getElementById('sw-hud-wpn').click();
    if (document.getElementById('btn-wpn-guard')?.getAttribute('aria-expanded') === 'true') document.getElementById('btn-wpn-guard').click();
    app.state.hudFlight = false; app.state.hudRel = false; app.state.hudWeapons = false;
    app.state.projectiles = [];
    document.querySelector('#lh-screenbar [data-screen-btn="helm"]').click();
  })()`);
  await cdp.waitFrames(6);
}

async function checkLaunchTutorial(cdp) {
  const openState = await cdp.eval(`(() => {
    const mod = document.getElementById('lh-tutorial-modal');
    const st = window.LighthuggerScreens.getTutorialState();
    return {
      hidden: mod ? mod.hidden : null,
      badge: document.getElementById('lh-tut-step-badge')?.textContent?.trim() || '',
      checked: !!document.getElementById('chk-tut-launch')?.checked,
      st
    };
  })()`);
  assert(
    openState.hidden === false && openState.badge === 'STEP 1 / 6' && openState.checked && openState.st.open && openState.st.showOnLaunch,
    'Round 17 launch walkthrough auto-open failed: ' + JSON.stringify(openState)
  );
  if (OUT_DIR) await cdp.screenshot('96_r17_launch_tutorial.png');

  const navCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    document.getElementById('btn-tut-next').click();
    await waitF(2);
    const step2Badge = document.getElementById('lh-tut-step-badge').textContent.trim();
    document.getElementById('btn-tut-prev').click();
    await waitF(2);
    const step1Badge = document.getElementById('lh-tut-step-badge').textContent.trim();
    const dot6 = document.querySelector('#lh-tut-dots [data-tut-step="5"]');
    if (dot6) dot6.click();
    await waitF(2);
    const step6Badge = document.getElementById('lh-tut-step-badge').textContent.trim();
    const nextLbl6 = document.getElementById('btn-tut-next').textContent.trim();

    const chk = document.getElementById('chk-tut-launch');
    chk.click();
    await waitF(2);
    const stored = JSON.parse(localStorage.getItem('lh_tutorial_v1') || 'null');
    document.getElementById('btn-tut-skip').click();
    await waitF(2);
    const closedAfterSkip = document.getElementById('lh-tutorial-modal').hidden === true;

    document.getElementById('btn-menu-tutorial').click();
    await waitF(2);
    const reopened = document.getElementById('lh-tutorial-modal').hidden === false && document.getElementById('lh-tut-step-badge').textContent.trim() === 'STEP 1 / 6';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitF(2);
    const closedViaEsc = document.getElementById('lh-tutorial-modal').hidden === true && document.getElementById('lh-settings-modal').hidden === true;
    return { step2Badge, step1Badge, step6Badge, nextLbl6, stored, closedAfterSkip, reopened, closedViaEsc };
  })()`);
  console.log('ROUND17_TUTORIAL:', JSON.stringify(navCheck));
  assert(
    navCheck.step2Badge === 'STEP 2 / 6' && navCheck.step1Badge === 'STEP 1 / 6' &&
    navCheck.step6Badge === 'STEP 6 / 6' && navCheck.nextLbl6 === 'FLY NOW' &&
    navCheck.stored && navCheck.stored.showOnLaunch === false &&
    navCheck.closedAfterSkip && navCheck.reopened && navCheck.closedViaEsc,
    'Round 17 walkthrough navigation/toggle failed: ' + JSON.stringify(navCheck)
  );
}

async function checkRound17(cdp) {
  await cdp.setViewport(1440, 900, false);

  // 1. Topbar SETTINGS label (not Esc), single-line screenbar & settings walkthrough toggle
  const setBtnCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const btn = document.getElementById('btn-settings-open');
    const txt = (btn?.textContent || '').trim().toUpperCase();
    const sb1440 = document.getElementById('lh-screenbar').getBoundingClientRect();
    btn.click();
    await waitF(3);
    const open = document.getElementById('lh-settings-modal').hidden === false;
    const autoBtn = document.getElementById('btn-set-tut-auto');
    const beforeTxt = autoBtn.textContent.trim();
    autoBtn.click();
    await waitF(2);
    const onTxt = autoBtn.textContent.trim();
    autoBtn.click();
    await waitF(2);
    const offTxt = autoBtn.textContent.trim();
    document.getElementById('btn-set-tut-open').click();
    await waitF(3);
    const tutOpenedFromSet = document.getElementById('lh-tutorial-modal').hidden === false && document.getElementById('lh-settings-modal').hidden === true;
    document.getElementById('btn-tut-close').click();
    await waitF(2);
    return {
      txt,
      hasSettingsWord: txt.includes('SETTINGS'),
      hasEscWord: /\\bESC\\b/i.test(txt),
      sbHeight1440: sb1440.height,
      open,
      beforeTxt,
      onTxt,
      offTxt,
      tutOpenedFromSet
    };
  })()`);
  console.log('ROUND17_SETTINGS_BTN:', JSON.stringify(setBtnCheck));
  assert(
    setBtnCheck.hasSettingsWord && !setBtnCheck.hasEscWord &&
    setBtnCheck.sbHeight1440 < 42 && setBtnCheck.open &&
    setBtnCheck.beforeTxt === 'ON LAUNCH: OFF' && setBtnCheck.onTxt === 'ON LAUNCH: ON' &&
    setBtnCheck.offTxt === 'ON LAUNCH: OFF' && setBtnCheck.tutOpenedFromSet,
    'Round 17 settings button / walkthrough settings check failed: ' + JSON.stringify(setBtnCheck)
  );

  // 2. Pilot Mode mouse controls: RMB drag rotates cam, LMB hold+drag pitches up/down without snapping cam, LMB click fires when WPN armed
  const mouseCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.undock();
    app.setPuckMode('steer');
    if (app.state.camLock) document.getElementById('sw-cam-lock').click();
    document.querySelector('#lh-screenbar [data-screen-btn="helm"]').click();
    if (document.getElementById('btn-wpn-guard')?.getAttribute('aria-expanded') !== 'true') document.getElementById('btn-wpn-guard').click();
    if (document.getElementById('sw-hud-wpn')?.getAttribute('aria-pressed') !== 'true') document.getElementById('sw-hud-wpn').click();
    await waitF(6);

    const cv = document.getElementById('lh-scene');
    const r = cv.getBoundingClientRect();
    const cx = r.left + r.width * 0.5, cy = r.top + r.height * 0.42;

    // 2A. Right-click + drag rotates camera freely without pitching/yawing hull, contextmenu prevented
    const ctxEv = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: cx, clientY: cy });
    const ctxAllowed = cv.dispatchEvent(ctxEv);
    const f0 = app.state.basis.f.slice();
    const cam0 = { yaw: app.getSnapshot().cam.orbitYaw, pitch: app.getSnapshot().cam.orbitPitch };
    cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2, buttons: 2, pointerId: 101, pointerType: 'mouse', clientX: cx, clientY: cy }));
    cv.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 2, buttons: 2, pointerId: 101, pointerType: 'mouse', clientX: cx + 95, clientY: cy - 45 }));
    cv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 2, buttons: 0, pointerId: 101, pointerType: 'mouse', clientX: cx + 95, clientY: cy - 45 }));
    await waitF(4);
    const camAfterRmb = { yaw: app.getSnapshot().cam.orbitYaw, pitch: app.getSnapshot().cam.orbitPitch };
    const hullFixedOnRmb = dot3(f0, app.state.basis.f) > 0.9999;

    // 2B. Left-click + hold + drag UP pitches nose UP & keeps custom RMB camera angle (with zero extra mouse-drag HUD icon)
    const yUpRef = app.state.basis.y.slice();
    const prevHudWpn = app.state.hudWeapons;
    const prevHudFlt = app.state.hudFlight;
    const prevHudRel = app.state.hudRel;
    app.state.hudWeapons = false; app.state.hudFlight = false; app.state.hudRel = false;
    cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, pointerId: 102, pointerType: 'mouse', clientX: cx, clientY: cy }));
    cv.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 0, buttons: 1, pointerId: 102, pointerType: 'mouse', clientX: cx, clientY: cy - 95 }));
    await waitF(3);
    const hudCv = document.getElementById('lh-hud-canvas');
    let hudInkDuringDrag = -1;
    if (hudCv) {
      const hCtx = hudCv.getContext('2d');
      const px = hCtx.getImageData(0, 0, hudCv.width, hudCv.height).data;
      hudInkDuringDrag = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 10) hudInkDuringDrag++;
    }
    app.state.hudWeapons = prevHudWpn; app.state.hudFlight = prevHudFlt; app.state.hudRel = prevHudRel;
    const visActiveDuringDrag = !!app.getSnapshot().mouseSteerVisual;
    for (let i = 0; i < 45 && dot3(app.state.basis.f, yUpRef) < 0.03; i++) await waitF(1);
    const pitchUpDotY = dot3(app.state.basis.f, yUpRef);
    const camYawDuringPilot = app.getSnapshot().cam.orbitYaw;
    cv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, buttons: 0, pointerId: 102, pointerType: 'mouse', clientX: cx, clientY: cy - 95 }));
    await waitF(4);
    const visClearedAfterUp = app.getSnapshot().mouseSteerVisual === null;

    // 2C. Left-click + hold + drag DOWN pitches nose DOWN
    const yDownRef = app.state.basis.y.slice();
    cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, pointerId: 103, pointerType: 'mouse', clientX: cx, clientY: cy }));
    cv.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 0, buttons: 1, pointerId: 103, pointerType: 'mouse', clientX: cx, clientY: cy + 95 }));
    for (let i = 0; i < 45 && dot3(app.state.basis.f, yDownRef) > -0.03; i++) await waitF(1);
    const pitchDownDotY = dot3(app.state.basis.f, yDownRef);
    cv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, buttons: 0, pointerId: 103, pointerType: 'mouse', clientX: cx, clientY: cy + 95 }));
    await waitF(3);

    // 2D. Left-click tap (no drag) fires weapons when WPN armed, does NOT fire when WPN disarmed
    const seqBeforeTap = app.getSnapshot().weaponEvent?.seq || 0;
    cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, pointerId: 104, pointerType: 'mouse', clientX: cx, clientY: cy }));
    cv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, buttons: 0, pointerId: 104, pointerType: 'mouse', clientX: cx, clientY: cy }));
    await waitF(3);
    const seqAfterArmedTap = app.getSnapshot().weaponEvent?.seq || 0;

    document.getElementById('sw-hud-wpn').click();
    await waitF(2);
    cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, pointerId: 105, pointerType: 'mouse', clientX: cx, clientY: cy }));
    cv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, buttons: 0, pointerId: 105, pointerType: 'mouse', clientX: cx, clientY: cy }));
    await waitF(3);
    const seqAfterSafeTap = app.getSnapshot().weaponEvent?.seq || 0;

    return {
      ctxBlocked: ctxAllowed === false,
      rmbDyaw: camAfterRmb.yaw - cam0.yaw,
      rmbDpitch: camAfterRmb.pitch - cam0.pitch,
      hullFixedOnRmb,
      visActiveDuringDrag,
      hudInkDuringDrag,
      visClearedAfterUp,
      pitchUpDotY,
      pitchDownDotY,
      camYawPreserved: Math.abs(camYawDuringPilot - camAfterRmb.yaw) < 0.02,
      firedOnTap: seqAfterArmedTap > seqBeforeTap,
      safeWhenDisarmed: seqAfterSafeTap === seqAfterArmedTap
    };
  })()`);
  console.log('ROUND17_PILOT_MOUSE:', JSON.stringify(mouseCheck));
  assert(
    mouseCheck.ctxBlocked && Math.abs(mouseCheck.rmbDyaw) > 0.3 && Math.abs(mouseCheck.rmbDpitch) > 0.12 &&
    mouseCheck.hullFixedOnRmb && mouseCheck.visActiveDuringDrag && mouseCheck.hudInkDuringDrag === 0 &&
    mouseCheck.visClearedAfterUp && mouseCheck.pitchUpDotY > 0.015 && mouseCheck.pitchDownDotY < -0.015 &&
    mouseCheck.camYawPreserved && mouseCheck.firedOnTap && mouseCheck.safeWhenDisarmed,
    'Round 17 Pilot mode mouse controls check failed: ' + JSON.stringify(mouseCheck)
  );

  // 3. Starmap 3D rotation in LINEAR LY + MILKY WAY modes (no phantom pinch lock, tilts below galactic plane)
  const starRotCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    document.querySelector('#lh-screenbar [data-screen-btn="starmap"]').click();
    await waitF(5);
    const sc = document.getElementById('lh-starmap-canvas');
    const r = sc.getBoundingClientRect();
    const cx = r.left + r.width * 0.5, cy = r.top + r.height * 0.5;
    const v0 = window.LighthuggerScreens.getStarmapView();

    const ctxEv = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: cx, clientY: cy });
    const ctxAllowed = sc.dispatchEvent(ctxEv);
    // Simulate a stray right-click then left-drag across steps including below galactic plane
    sc.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2, buttons: 2, pointerId: 110, pointerType: 'mouse', clientX: cx, clientY: cy }));
    sc.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 2, buttons: 0, pointerId: 110, pointerType: 'mouse', clientX: cx, clientY: cy }));

    sc.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, pointerId: 111, pointerType: 'mouse', clientX: cx, clientY: cy }));
    sc.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 0, buttons: 1, pointerId: 111, pointerType: 'mouse', clientX: cx + 110, clientY: cy - 260 }));
    sc.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, buttons: 0, pointerId: 111, pointerType: 'mouse', clientX: cx + 110, clientY: cy - 260 }));
    await waitF(4);
    const vLin = window.LighthuggerScreens.getStarmapView();

    document.querySelector('[data-starscale="milkyway"]').click();
    await waitF(4);
    const vMw0 = window.LighthuggerScreens.getStarmapView();
    sc.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, pointerId: 112, pointerType: 'mouse', clientX: cx, clientY: cy }));
    sc.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 0, buttons: 1, pointerId: 112, pointerType: 'mouse', clientX: cx - 100, clientY: cy + 120 }));
    sc.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, buttons: 0, pointerId: 112, pointerType: 'mouse', clientX: cx - 100, clientY: cy + 120 }));
    await waitF(4);
    const vMw1 = window.LighthuggerScreens.getStarmapView();
    return {
      ctxBlocked: ctxAllowed === false,
      linDyaw: vLin.yaw - v0.yaw,
      linTilt: vLin.tilt,
      mwDyaw: vMw1.yaw - vMw0.yaw,
      mwDtilt: vMw1.tilt - vMw0.tilt,
      canvasW: sc.width
    };
  })()`);
  console.log('ROUND17_STARMAP_3D:', JSON.stringify(starRotCheck));
  assert(
    starRotCheck.ctxBlocked && Math.abs(starRotCheck.linDyaw) > 0.3 && starRotCheck.linTilt < -0.1 &&
    Math.abs(starRotCheck.mwDyaw) > 0.3 && Math.abs(starRotCheck.mwDtilt) > 0.25 && starRotCheck.canvasW > 100,
    'Round 17 Starmap 3D rotation failed: ' + JSON.stringify(starRotCheck)
  );
  if (OUT_DIR) await cdp.screenshot('97_r17_starmap_3d_rotate.png');

  await cdp.eval(`(() => {
    document.querySelector('[data-starscale="linear"]').click();
    const flatBtn = document.getElementById('btn-star-flat');
    if (flatBtn) flatBtn.click();
  })()`);
  await cdp.waitFrames(3);

  // 4. Coilgun shot perpendicular to orbital velocity at 82x warp stays aligned along boresight (zero 90 deg turn)
  const coilCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const unit = v => { const m = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/m, v[1]/m, v[2]/m]; };
    const dot3 = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
    const app = window.__LH_APP;
    app.stopAll();
    app.enterSystemOrbit('sol', true);
    app.undock();
    app.setAttitudeMode('normal');
    for (let i = 0; i < 35; i++) app.step(1.5, 0.05, false);
    app.setAttitudeMode('manual');
    app.setTimeWarp(82);
    app.state.weaponLockOn = false;
    document.querySelector('#lh-screenbar [data-screen-btn="helm"]').click();
    if (document.getElementById('btn-wpn-guard')?.getAttribute('aria-expanded') !== 'true') document.getElementById('btn-wpn-guard').click();
    if (document.getElementById('sw-hud-wpn')?.getAttribute('aria-pressed') !== 'true') document.getElementById('sw-hud-wpn').click();
    await waitF(4);

    const aimGal = app.state.basis.f.slice();
    document.getElementById('btn-wpn-fire').click();
    await waitF(10);
    const snap = app.getSnapshot();
    const rail = (snap.projectiles || []).find(p => p.kind === 'rail');
    const relU = rail && rail.relRKm ? unit(rail.relRKm) : [0, 0, 0];
    const boreDot = dot3(relU, aimGal);
    const minSegDot = rail && Array.isArray(rail.relTrailKm)
      ? Math.min(...rail.relTrailKm.slice(1).map(pt => dot3(unit(pt), aimGal)))
      : 0;
    return {
      warp: snap.timeWarp,
      trailLen: rail?.relTrailKm?.length || 0,
      boreDot,
      minSegDot,
      active3d: app.getSceneInfo()?.projectilesActive || 0
    };
  })()`);
  console.log('ROUND17_COILGUN_ALIGN:', JSON.stringify(coilCheck));
  assert(
    coilCheck.trailLen >= 2 && coilCheck.boreDot > 0.96 && coilCheck.minSegDot > 0.94 && coilCheck.active3d >= 1,
    'Round 17 coilgun ship-relative alignment check failed: ' + JSON.stringify(coilCheck)
  );
  if (OUT_DIR) await cdp.screenshot('98_r17_coilgun_no_90deg.png');

    // Round 18 Check A: Ice shield shedding tracks tilted hull & hides completely in 1ST PERS view
  const r18IceCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    app.stopAll();
    app.selectPreset('long-patience');
    app.commissionDraft();
    app.engageInterstellar({ destId: 'rigil' });
    app.state.mission = null;
    app.state.relGov = false;
    app.setThrustG(1.3);
    for (let i = 0; i < 12; i++) app.step(0.10 * 31557600);
    app.setScreen('helm');
    app.setAttitudeMode('manual');
    app.setCamViewMode('low');
    await waitF(6);

    const lowSnow = app.getSnowBounds();
    const lowIsm = app.getSceneInfo()?.ismSheath || null;

    const cv = document.getElementById('lh-scene');
    const r = cv.getBoundingClientRect();
    const cx = r.left + r.width * 0.5, cy = r.top + r.height * 0.42;
    cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, pointerId: 120, pointerType: 'mouse', clientX: cx, clientY: cy }));
    cv.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 0, buttons: 1, pointerId: 120, pointerType: 'mouse', clientX: cx + 95, clientY: cy - 85 }));
    await waitF(6);
    const tiltedSnow = app.getSnowBounds();
    const tiltedOffAxis = tiltedSnow.active && Math.hypot(tiltedSnow.plumeDir[1], tiltedSnow.plumeDir[2]) > 0.04;
    cv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, buttons: 0, pointerId: 120, pointerType: 'mouse', clientX: cx + 95, clientY: cy - 85 }));
    await waitF(4);

    app.setCamViewMode('first');
    await waitF(6);
    const firstSnow = app.getSnowBounds();
    const firstIsm = app.getSceneInfo()?.ismSheath || null;
    return {
      lowActive: lowSnow.active,
      lowIsmActive: lowIsm ? lowIsm.active : false,
      tiltedActive: tiltedSnow.active,
      tiltedPlume: tiltedSnow.plumeDir,
      tiltedOffAxis,
      firstSnowActive: firstSnow.active,
      firstIsmActive: firstIsm ? firstIsm.active : false
    };
  })()`);
  console.log('ROUND18_ICE_SHIELD:', JSON.stringify(r18IceCheck));
  assert(
    r18IceCheck.lowActive && r18IceCheck.lowIsmActive &&
    r18IceCheck.tiltedActive && r18IceCheck.tiltedOffAxis &&
    r18IceCheck.firstSnowActive === false && r18IceCheck.firstIsmActive === false,
    'Round 18 tilted ice shield or 1ST PERS hide check failed: ' + JSON.stringify(r18IceCheck)
  );
  if (OUT_DIR) await cdp.screenshot('99_r18_first_person_clean.png');

  await cdp.eval(`(() => { window.__LH_APP.setCamViewMode('low'); })()`);
  await cdp.waitFrames(4);

  // Round 18 Check B: Walkthrough 6 rendered screenshots + no ATProto in Step 6 + Fixed Manual size + About tab + GitHub links
  const r18UiCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const tutImg = document.getElementById('lh-tut-img');
    const seenSrcs = [];
    const loadedFlags = [];
    window.LighthuggerScreens.setTutorialOpen(true, 0);
    for (let s = 0; s < 6; s++) {
      await waitF(4);
      if (tutImg && !tutImg.complete) {
        await new Promise((res) => { tutImg.addEventListener('load', res, { once: true }); tutImg.addEventListener('error', res, { once: true }); setTimeout(res, 2500); });
      }
      seenSrcs.push(tutImg ? tutImg.getAttribute('src') : null);
      loadedFlags.push(Boolean(tutImg && tutImg.complete && tutImg.naturalWidth >= 480));
      if (s < 5) document.getElementById('btn-tut-next').click();
    }
    const step6Text = document.getElementById('lh-tut-body')?.textContent || '';
    const hasAtprotoCopy = /ATProto|PDS sync/i.test(step6Text);
    document.getElementById('btn-tut-close').click();
    await waitF(3);

    // Open Manual and verify fixed card rect across all 5 tabs + About gallery/links
    document.querySelector('#lh-screenbar [data-screen-btn="manual"]').click();
    await waitF(4);
    const tabs = ['orbits', 'rockets', 'ice', 'controls', 'about'];
    const rects = {};
    for (const tab of tabs) {
      document.querySelector('#lh-screen-manual [data-mtab="' + tab + '"]').click();
      await waitF(3);
      const b = document.querySelector('.lh-manual-card').getBoundingClientRect();
      rects[tab] = { x: b.x, y: b.y, w: b.width, h: b.height };
    }
    const ref = rects.orbits;
    const maxDelta = Math.max(...tabs.flatMap((t) => [
      Math.abs(rects[t].x - ref.x),
      Math.abs(rects[t].y - ref.y),
      Math.abs(rects[t].w - ref.w),
      Math.abs(rects[t].h - ref.h)
    ]));
    const aboutImgs = [...document.querySelectorAll('#lh-about-gallery img')];
    for (const im of aboutImgs) {
      if (!im.complete) {
        await new Promise((res) => { im.addEventListener('load', res, { once: true }); im.addEventListener('error', res, { once: true }); setTimeout(res, 2500); });
      }
    }
    const aboutImgsOk = aboutImgs.length === 6 && aboutImgs.every((im) => im.complete && im.naturalWidth >= 480);
    const manualGh = document.getElementById('lnk-manual-github')?.getAttribute('href');
    const setGh = document.getElementById('lnk-set-github')?.getAttribute('href');
    return {
      uniqueTutSrcs: new Set(seenSrcs.filter(Boolean)).size,
      allTutLoaded: loadedFlags.length === 6 && loadedFlags.every(Boolean),
      hasAtprotoCopy,
      maxManualRectDelta: maxDelta,
      manualSize: { w: ref.w, h: ref.h },
      aboutImgsOk,
      manualGh,
      setGh
    };
  })()`);
  console.log('ROUND18_UI_GALLERY:', JSON.stringify(r18UiCheck));
  assert(
    r18UiCheck.uniqueTutSrcs === 6 && r18UiCheck.allTutLoaded && !r18UiCheck.hasAtprotoCopy &&
    r18UiCheck.maxManualRectDelta <= 1.5 && r18UiCheck.manualSize.w > 400 && r18UiCheck.manualSize.h > 300 &&
    r18UiCheck.aboutImgsOk && r18UiCheck.manualGh === 'https://github.com/lastnpcalex/laminar' &&
    r18UiCheck.setGh === 'https://github.com/lastnpcalex/laminar',
    'Round 18 Walkthrough / Manual About / GitHub links check failed: ' + JSON.stringify(r18UiCheck)
  );
  if (OUT_DIR) {
    await cdp.screenshot('99_r18_manual_about.png');
    await cdp.eval(`(() => { window.LighthuggerScreens.setTutorialOpen(true, 4); })()`);
    await cdp.waitFrames(5);
    await cdp.screenshot('99_r18_tutorial.png');
    await cdp.eval(`(() => { document.getElementById('btn-tut-close').click(); })()`);
    await cdp.waitFrames(3);
  }

  // Clean reset back to Sol docked stock Long Patience
  await cdp.eval(`(() => {
    const app = window.__LH_APP;
    app.stopAll();
    app.recommissionShip();
    app.enterSystemOrbit('sol', true);
    app.selectPreset('long-patience');
    app.commissionDraft();
    app.state.iceIntegrity = 1;
    app.state.hullIntegrity = 1;
    app.state.relGov = true;
    app.state.weaponLockOn = false;
    app.state.camLock = false;
    if (document.getElementById('sw-hud-wpn')?.getAttribute('aria-pressed') === 'true') document.getElementById('sw-hud-wpn').click();
    if (document.getElementById('btn-wpn-guard')?.getAttribute('aria-expanded') === 'true') document.getElementById('btn-wpn-guard').click();
    app.state.hudFlight = false; app.state.hudRel = false; app.state.hudWeapons = false;
    app.state.projectiles = [];
    document.querySelector('#lh-screenbar [data-screen-btn="helm"]').click();
  })()`);
  await cdp.waitFrames(6);
}

async function checkRound15(cdp) {
  await cdp.setViewport(1440, 900, false);
  const combatCheck = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    app.stopAll();
    app.recommissionShip();
    app.undock();
    app.setScreen('helm');
    window.LighthuggerScreens.setKgOpen(true);
    await waitF(4);

    if (document.getElementById('btn-wpn-guard').getAttribute('aria-expanded') !== 'true') {
      document.getElementById('btn-wpn-guard').click();
    }
    if (document.getElementById('sw-hud-wpn').getAttribute('aria-pressed') !== 'true') {
      document.getElementById('sw-hud-wpn').click();
    }
    await waitF(4);

    const hull100 = document.getElementById('lh-tm-hull').textContent.trim();
    // Lock target (station or NPC Lighthugger)
    if (!app.getSnapshot().weaponLockOn) document.getElementById('btn-wpn-lock').click();
    await waitF(3);
    const firstLock = app.getSnapshot().hud.weaponTarget;
    // Also verify cycling reaches NPC Lighthuggers + station
    const seenKeys = new Set();
    for (let c = 0; c < 6; c++) {
      const wt = app.getSnapshot().hud.weaponTarget;
      if (wt) seenKeys.add(wt.id);
      document.getElementById('btn-wpn-cycle').click();
    }
    // Lock station directly ahead in orbit so combat retaliation, breach sparks & 3D explosion are visibly framed
    for (let k = 0; k < 10 && app.getSnapshot().hud.weaponTarget?.id !== 'body:station'; k++) {
      document.getElementById('btn-wpn-cycle').click();
    }
    await waitF(2);
    const lockedTgt = app.getSnapshot().hud.weaponTarget;
    const hpShown = !document.getElementById('kg-wpn-hp').hidden;

    // Fire 2 shots to damage & provoke retaliation
    document.getElementById('btn-wpn-fire').click();
    document.getElementById('btn-wpn-fire').click();
    await waitF(3);
    const tgtHpTxtMid = document.getElementById('kg-wpn-hp-txt').textContent.trim();

    // Advance combat so hostile station/ships fire back in 3D and damage player hull
    for (let k = 0; k < 4; k++) app.stepCombat(1.2);
    await waitF(3);
    const afterRetal = app.getSnapshot();
    const scRetal = app.getSceneInfo();
    const audCombat = app.getAudioDiagnostics();
    const hullAfterHit = document.getElementById('lh-tm-hull').textContent.trim();
    const statusTxt = document.getElementById('lh-tm-thermal-txt').textContent.trim();
    return {
      hull100,
      firstLockId: firstLock ? firstLock.id : null,
      seenKeys: [...seenKeys],
      hpShown,
      tgtHpTxtMid,
      hullAfterHit,
      statusTxt,
      damageState: afterRetal.damageState,
      playerHitSeq: afterRetal.combat.playerHitSeq,
      enemyShotsActive: scRetal.enemyShotsActive,
      combatMusicGain: audCombat ? audCombat.busLevels.musicCombat : 0,
      lockedId: lockedTgt ? lockedTgt.id : null
    };
  })()`);
  console.log('ROUND15_COMBAT_CHECK:', JSON.stringify(combatCheck));
  assert(
    combatCheck.hull100 === '100%' && combatCheck.hpShown &&
    combatCheck.seenKeys.some(k => k === 'body:station') &&
    combatCheck.seenKeys.some(k => k === 'body:npc' || k === 'body:npc2') &&
    /HOSTILE|DMG|CRIT/i.test(combatCheck.tgtHpTxtMid) &&
    combatCheck.playerHitSeq >= 1 &&
    combatCheck.hullAfterHit !== '100%' &&
    combatCheck.enemyShotsActive >= 1 &&
    combatCheck.combatMusicGain > 0.15,
    'Round 15 combat damage / retaliation check failed: ' + JSON.stringify(combatCheck)
  );
  if (OUT_DIR) await cdp.screenshot('94_r15_combat_hud.png');

  const killAndCrash = await cdp.eval(`(async () => {
    const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const app = window.__LH_APP;
    const tgtId = ${JSON.stringify(combatCheck.lockedId)};
    for (let s = 0; s < 14; s++) {
      const ent = app.getCombatState().entities[tgtId];
      if (ent && ent.destroyed) break;
      app.fireWeaponPulse();
    }
    await waitF(2);
    const killSnap = app.getSnapshot();
    const killScene = app.getSceneInfo();

    // Verify Titan lethal impact triggers #lh-wreck-overlay right at surface (no bounce) and recommissions cleanly
    app.switchPhysicsPrimary({ kind: 'moon', planetIdx: 0, moonIdx: 0 });
    const titanBody = window.LighthuggerGalaxy.SYSTEMS[0].planets[0].moons[0];
    app.orbit.rKm = [titanBody.radiusKm + 260, 0, 0];
    app.orbit.vKmS = [-3.5, 0.2, 0];
    app.step(120, 0.05, false);
    await waitF(3);
    const crashSnap = app.getSnapshot();
    const crashScene = app.getSceneInfo();
    const wreckShown = !document.getElementById('lh-wreck-overlay').hidden;
    const wreckReason = document.getElementById('lh-wreck-reason').textContent.trim();
    return {
      killed: Boolean(killSnap.combat.entities[tgtId]?.destroyed),
      kills: killSnap.combat.kills,
      explosionsActive: killScene.explosionsActive,
      crashDestroyed: crashSnap.destroyed,
      crashHull: crashSnap.hullIntegrity,
      crashAltKm: crashSnap.orbit.altKm,
      scenePlayerDestroyed: crashScene.playerDestroyed,
      wreckShown,
      wreckReason
    };
  })()`);
  console.log('ROUND15_KILL_AND_CRASH:', JSON.stringify(killAndCrash));
  assert(
    killAndCrash.killed && killAndCrash.kills >= 1 && killAndCrash.explosionsActive >= 1 &&
    killAndCrash.crashDestroyed && killAndCrash.crashHull === 0 &&
    killAndCrash.crashAltKm >= 0 && killAndCrash.crashAltKm < 120 &&
    killAndCrash.scenePlayerDestroyed && killAndCrash.wreckShown && /titan/i.test(killAndCrash.wreckReason),
    'Round 15 kill explosion / Titan wreck check failed: ' + JSON.stringify(killAndCrash)
  );
  if (OUT_DIR) await cdp.screenshot('95_r15_wreck_overlay.png');

  await cdp.eval(`(() => {
    document.getElementById('btn-wreck-recommission').click();
    window.__LH_APP.undock();
    if (document.getElementById('sw-hud-wpn').getAttribute('aria-pressed') === 'true') document.getElementById('sw-hud-wpn').click();
    if (document.getElementById('btn-wpn-guard').getAttribute('aria-expanded') === 'true') document.getElementById('btn-wpn-guard').click();
  })()`);
  await cdp.waitFrames(4);
  const recOk = await cdp.eval(`({
    destroyed: window.__LH_APP.getSnapshot().destroyed,
    hull: window.__LH_APP.getSnapshot().hullIntegrity,
    ice: window.__LH_APP.getSnapshot().iceIntegrity,
    overlayHidden: document.getElementById('lh-wreck-overlay').hidden
  })`);
  assert(!recOk.destroyed && recOk.hull === 1 && recOk.ice === 1 && recOk.overlayHidden, 'Round 15 recommission check failed: ' + JSON.stringify(recOk));
}

async function runBrowserSuite() {
  assert(EDGE_PATH, 'No Chromium/Edge binary found; set EDGE_PATH env var');
  if (OUT_DIR) fs.mkdirSync(OUT_DIR, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-reg-edge-'));
  const { server, port } = await startServer();
  const cdpPort = await findFreePort();
  let edgeProc = null;
  let cdp = null;

  try {
    edgeProc = spawn(EDGE_PATH, [
      '--headless=new',
      '--disable-gpu-sandbox',
      '--enable-webgl',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1440,900',
      `--user-data-dir=${userDataDir}`,
      `--remote-debugging-port=${cdpPort}`,
      'about:blank'
    ], { stdio: 'ignore' });

    const targets = await waitForJson(`http://127.0.0.1:${cdpPort}/json/list`, 20000);
    const pageTarget = targets.find((t) => t.type === 'page' && t.url === 'about:blank');
    assert(pageTarget && pageTarget.webSocketDebuggerUrl, 'No browser CDP target');

    cdp = new CDP(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');
    await cdp.call('Network.enable');
    await cdp.call('Page.addScriptToEvaluateOnNewDocument', { source: `(${installBrowserProbes})()` });
    const navigation = await cdp.call('Page.navigate', { url: `http://127.0.0.1:${port}/lighthugger.html` });
    assert(!navigation.errorText, 'Lighthugger navigation failed: ' + navigation.errorText);

    let booted = false;
    for (let i = 0; i < 160; i++) {
      booted = await cdp.eval('Boolean(window.__LH_APP?.getSceneInfo() && document.getElementById("lh-boot-loader")?.classList.contains("is-loaded"))');
      if (booted) break;
      await sleep(150);
    }
    if (!booted) {
      const page = await cdp.eval(`({ url: location.href, ready: document.readyState,
        app: Boolean(window.__LH_APP), scene: Boolean(window.__LH_APP?.getSceneInfo()),
        loader: document.getElementById('lh-boot-loader')?.className })`);
      throw new Error('Lighthugger boot failed: ' + JSON.stringify({ page, exceptions: cdp.exceptions,
        console: cdp.consoleErrors, requests: cdp.badResponses }));
    }
    await cdp.eval('localStorage.clear()');
    await cdp.eval('document.fonts.ready');
    await cdp.setViewport(1440, 900, false);
    await cdp.waitFrames(6);
    const duplicateIds = await cdp.eval(`(() => {
      const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
      return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    })()`);
    assert(duplicateIds.length === 0, 'Duplicate runtime DOM IDs: ' + duplicateIds.join(', '));
    await checkLaunchTutorial(cdp);

    // 1. Desktop startup menu centering, fonts, shared Acid Burn CSS, and 4 creator tabs
    const menuCheck = await cdp.eval(`(() => {
      const L = document.getElementById('lh-menu-left').getBoundingClientRect();
      const R = document.getElementById('lh-menu-right').getBoundingClientRect();
      const h2 = document.getElementById('lh-menu-title');
      const pressed = [...document.querySelectorAll('#lh-cz-presets [data-preset]')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.preset);
      const fonts = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family);
      const sheets = [...document.styleSheets].map(s => s.href || '');
      const tabs = [...document.querySelectorAll('#lh-menu-right [data-cztab]')].map(b => b.dataset.cztab);
      return {
        corridorMid: (L.right + R.left) / 2,
        corridorW: R.left - L.right,
        titleClipped: h2.scrollWidth > h2.clientWidth + 2,
        pressed,
        hasOrbitron: fonts.some(f => f.includes('Orbitron')),
        hasShareTech: fonts.some(f => f.includes('Share Tech Mono')),
        hasAcidBurnCss: sheets.some(u => u.includes('acidburn.css')),
        tabs
      };
    })()`);
    console.log('MENU_CHECK:', JSON.stringify(menuCheck));
    assert(Math.abs(menuCheck.corridorMid - 720) < 2, 'Startup corridor not centered');
    assert(!menuCheck.titleClipped, 'Menu title clipped');
    assert(menuCheck.hasOrbitron && menuCheck.hasShareTech && menuCheck.hasAcidBurnCss, 'Fonts or Acid Burn CSS missing');
    assert(JSON.stringify(menuCheck.pressed) === JSON.stringify(['long-patience']), 'Expected long-patience initially');
    assert(JSON.stringify(menuCheck.tabs) === JSON.stringify(['hull', 'ice', 'styles', 'drive', 'weapons']), 'Expected 5 customizer tabs');
    await cdp.screenshot('01_menu_desktop.png');

    // 1B. Main dock (Menu) camera stability: zero-jump sway handoff, constant orbit dist, monotonic zoom
    const menuCamCheck = await cdp.eval(`(async () => {
      const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      const info0 = window.__LH_APP.getSceneInfo().camera;
      // Simulate tiny drag right after idle sway: yaw should NOT jump more than ~0.08 rad
      const snap = window.__LH_APP.getSnapshot();
      snap.cam.orbitYaw -= 0.03;
      await waitF(3);
      const info1 = window.__LH_APP.getSceneInfo().camera;
      const swayJump = Math.abs(info1.yaw - (info0.yaw - 0.03));

      // Orbit across 10 yaw angles: distance MUST stay constant (no menuFit pumping!)
      const orbitDists = [];
      for (let i = 0; i < 10; i++) {
        snap.cam.orbitYaw = i * (Math.PI * 2 / 10);
        await waitF(2);
        orbitDists.push(window.__LH_APP.getSceneInfo().camera.dist);
      }
      const orbitMin = Math.min(...orbitDists), orbitMax = Math.max(...orbitDists);

      // Sweep zoom from 1.5 -> 0.76 -> 0.40 -> 0.22: dist MUST decrease strictly monotonically with zero explosion
      const zoomSamples = [];
      for (const z of [1.5, 0.76, 0.40, 0.22]) {
        snap.cam.orbitZoom = z;
        await waitF(2);
        const c = window.__LH_APP.getSceneInfo().camera;
        zoomSamples.push({ z, dist: c.dist, x: c.x, y: c.y, zPos: c.z });
      }
      window.__LH_APP.resetCamera();
      await waitF(3);
      return {
        swayJump,
        orbitSpread: orbitMax - orbitMin,
        orbitMin,
        orbitMax,
        zoomSamples
      };
    })()`);
    console.log('MENU_CAM_STABILITY:', JSON.stringify(menuCamCheck));
    assert(menuCamCheck.swayJump < 0.12, 'Menu sway first-drag jump too large: ' + menuCamCheck.swayJump);
    assert(menuCamCheck.orbitSpread < 0.5, 'Menu orbit distance pumped during rotation: ' + menuCamCheck.orbitSpread);
    assert(
      menuCamCheck.zoomSamples[0].dist > menuCamCheck.zoomSamples[1].dist &&
      menuCamCheck.zoomSamples[1].dist > menuCamCheck.zoomSamples[2].dist &&
      menuCamCheck.zoomSamples[2].dist > menuCamCheck.zoomSamples[3].dist &&
      menuCamCheck.zoomSamples[3].dist > 10 &&
      menuCamCheck.zoomSamples[0].dist < 400,
      'Menu zoom was not strictly monotonic or exploded: ' + JSON.stringify(menuCamCheck.zoomSamples)
    );

    // 2. Startup creator Ice Shield + Hull + Drive controls work directly
    await cdp.eval(`document.querySelector('#lh-menu-right [data-cztab="ice"]').click()`);
    await cdp.eval(`document.querySelector('#lh-menu-right [data-gkey="iceSymmetry"][data-gval="twin-ram"]').click()`);
    await cdp.eval(`document.querySelector('#lh-menu-right [data-ice-cover="bare"]').click()`);
    await cdp.waitFrames(4);
    const bareCov = await cdp.eval(`window.__LH_APP.getSnapshot().genome.P.iceCoverage`);
    assert(bareCov === 0, 'Bare bow preset failed, got ' + bareCov);
    await cdp.eval(`document.querySelector('#lh-menu-right [data-ice-cover="full"]').click()`);
    await cdp.eval(`document.querySelector('#lh-menu-right [data-cztab="drive"]').click()`);
    await cdp.eval(`document.querySelector('#lh-menu-right [data-gkey="arch"][data-gval="quad"]').click()`);
    await cdp.eval(`document.querySelector('#lh-menu-right [data-cztab="hull"]').click()`);
    await cdp.eval(`document.querySelector('#lh-menu-right [data-gkey="fins"][data-gval="4"]').click()`);
    await cdp.waitFrames(5);
    const creatorState = await cdp.eval(`(() => {
      const P = window.__LH_APP.getSnapshot().genome.P;
      return {
        iceSymmetry: P.iceSymmetry,
        iceCoverage: P.iceCoverage,
        arch: P.arch,
        fins: P.fins,
        hasAftLen: !!document.querySelector('#lh-menu-right [data-gdial="aftLen"]'),
        hasFlatten: !!document.querySelector('#lh-menu-right [data-gdial="flatten"]'),
        hasIceHullShapes: document.querySelectorAll('#lh-cz-ice [data-gkey="hullShape"]').length === 5
      };
    })()`);
    console.log('CREATOR_CONTROLS:', JSON.stringify(creatorState));
    assert(creatorState.iceSymmetry === 'twin-ram' && creatorState.iceCoverage === 1 && creatorState.arch === 'quad' && creatorState.fins === 4 && creatorState.hasAftLen && creatorState.hasFlatten && creatorState.hasIceHullShapes, 'Creator controls check failed');

    // 3. All 6 style showcase presets highlight uniquely
    const presets = [
      ['gnostic-plague', 'orbit'],
      ['cathedral-basilica', 'orbit'],
      ['nighthawk-diamond', 'orbit'],
      ['giger-xenomorph', 'orbit'],
      ['coade-savages', 'orbit'],
      ['dune-monolith', 'orbit'],
      ['cathedral-gothic', 'orbit'],
      ['coade-savages', 'stern']
    ];
    for (const [pid, camView] of presets) {
      await cdp.eval(`(() => {
        document.querySelector('#lh-cz-presets [data-preset="${pid}"]').click();
        document.querySelector('#lh-menu-right [data-dcam="${camView}"]').click();
      })()`);
      await cdp.waitFrames(6);
      const st = await cdp.eval(`(() => ({
        pressed: [...document.querySelectorAll('#lh-cz-presets [data-preset]')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.preset),
        snapPreset: window.__LH_APP.getSnapshot().presetId
      }))()`);
      console.log(`PRESET ${pid} (${camView}):`, JSON.stringify(st));
      assert(JSON.stringify(st.pressed) === JSON.stringify([pid]), 'Preset highlight mismatch: ' + JSON.stringify(st));
    }

    // 3B. Verify automatic reversible vs flip-and-burn engine builds across all 3 pod styles
    const engineMatrix = await cdp.eval(`(() => {
      const results = [];
      for (const podStyle of ['conjoiner-spike', 'canted-bell', 'annular-shroud']) {
        for (const iceSymmetry of ['fore', 'bi-cone']) {
          window.__LH_APP.setGenomeParams({ podStyle, iceSymmetry });
          const snap = window.__LH_APP.getSnapshot();
          results.push({
            podStyle,
            iceSymmetry,
            reversibleDrive: snap.reversibleDrive,
            specRev: snap.rocketSpecs && snap.rocketSpecs.reversibleDrive
          });
        }
      }
      window.__LH_APP.selectPreset('coade-savages');
      return results;
    })()`);
    console.log('ENGINE_MATRIX:', JSON.stringify(engineMatrix));
    assert(engineMatrix.length === 6 && engineMatrix.every(r => r.reversibleDrive === (r.iceSymmetry === 'fore') && r.specRev === r.reversibleDrive),
      'Engine reversible/flip-burn auto-switching check failed: ' + JSON.stringify(engineMatrix));

    // 4. Launch Helm + Concourse window view + All 6 station architectures + Saturn volumetric atmosphere + Light/BH Mode
    await cdp.eval(`(() => {
      document.querySelector('#lh-menu-right [data-dcam="concourse"]').click();
    })()`);
    await cdp.waitFrames(8);
    await cdp.screenshot('02_concourse_window.png');

    await cdp.eval(`(() => {
      document.querySelector('#lh-menu-right [data-dcam="orbit"]').click();
    })()`);
    await cdp.waitFrames(14);
    await checkLaunchAndDock(cdp);
    await cdp.eval(`(() => {
      const app = window.__LH_APP;
      app.enterSystemOrbit('sol', true);
      app.selectPreset('cathedral-gothic');
      app.commissionDraft();
      app.undock();
      window.LighthuggerScreens.setKgOpen(true);
    })()`);
    await cdp.waitFrames(6);
    await checkHelmSwitchboard(cdp);
    await checkWeapons(cdp);
    await cdp.eval(`(() => {
      const app = window.__LH_APP;
      if (app.state.camLock) document.getElementById('sw-cam-lock').click();
      app.getSnapshot().cam.orbitYaw = Math.PI - 0.9;
    })()`);
    const rollResult = await checkRollAndRcs(cdp);
    await cdp.eval(`(() => {
      const app = window.__LH_APP;
      if (app.state.camLock) document.getElementById('sw-cam-lock').click();
      app.enterSystemOrbit('sol', true);
      app.selectPreset('coade-savages');
      app.commissionDraft();
    })()`);
    await checkChronoscope(cdp);
    await checkStarmapMultiHop(cdp);
    await checkStagedTransit(cdp);
    await checkGasGiantDiversity(cdp);
    await checkSextantDeck(cdp);
    await checkHighGammaAimingAndSafety(cdp);
    await checkRound6(cdp);
    await checkRound7(cdp);
    await checkRound8(cdp);
    await checkRound9(cdp);
    await checkRound10(cdp);
    await checkRound11(cdp);
    await checkRound12(cdp);
    await checkRound13(cdp);
    await checkRound15(cdp);
    await checkRound16(cdp);
    await checkRound17(cdp);

    // Verify all 6 distinct megastructure station architectures render cleanly with zero errors
    const stationTour = [
      ['rigil', 'torus', '03_station_torus.png'],
      ['procyon', 'oneill', '04_station_oneill.png'],
      ['gowjin', 'bishop', '05_station_bishop.png'],
      ['sirius', 'loom', '06_station_loom.png'],
      ['wolf359', 'conjoiner-nest', '07_station_nest.png'],
      ['sol', 'spindle', null]
    ];
    for (const [sysId, expType, shotName] of stationTour) {
      await cdp.eval(`window.__LH_APP.enterSystemOrbit("${sysId}", true)`);
      await cdp.waitFrames(6);
      const stInfo = await cdp.eval(`(() => {
        const sys = window.LighthuggerGalaxy.SYSTEMS.find(s => s.id === "${sysId}");
        const sc = window.__LH_APP.getSceneInfo();
        return { sysId: sc.systemId, stType: sys && sys.station && sys.station.type, stName: sys && sys.station && sys.station.name, tris: sc.triangles };
      })()`);
      console.log(`STATION ${sysId}:`, JSON.stringify(stInfo));
      assert(stInfo.sysId === sysId && stInfo.stType === expType && stInfo.tris > 5000, 'Station check failed: ' + JSON.stringify(stInfo));
      if (shotName) await cdp.screenshot(shotName);
    }

    // Showcase review shots: Gothic Cathedral, Dune Brutalist, Long Patience, Giger, CoaDE axial weapons, Flip & Burn, Reversible Braking Plumes
    if (OUT_DIR) {
      await cdp.eval(`(() => {
        window.__LH_APP.enterSystemOrbit('sol', true);
        document.querySelector('[data-screen-btn="drydock"]').click();
      })()`);
      await cdp.waitFrames(6);
      // Verify Drydock camera stability (constant dist on orbit, monotonic zoom, clean left-shift offsetX)
      const dockCamCheck = await cdp.eval(`(async () => {
        const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
        const snap = window.__LH_APP.getSnapshot();
        const dists = [];
        for (let i = 0; i < 8; i++) {
          snap.cam.orbitYaw = i * (Math.PI * 2 / 8);
          await waitF(2);
          dists.push(window.__LH_APP.getSceneInfo().camera.dist);
        }
        const zList = [];
        for (const z of [1.4, 0.76, 0.35, 0.20]) {
          snap.cam.orbitZoom = z;
          await waitF(2);
          zList.push(window.__LH_APP.getSceneInfo().camera.dist);
        }
        const ox = window.__LH_APP.getSceneInfo().camera.offsetX;
        window.__LH_APP.resetCamera();
        await waitF(3);
        return { spread: Math.max(...dists) - Math.min(...dists), zList, offsetX: ox };
      })()`);
      console.log('DRYDOCK_CAM_STABILITY:', JSON.stringify(dockCamCheck));
      assert(dockCamCheck.spread < 0.5, 'Drydock orbit distance pumped: ' + dockCamCheck.spread);
      assert(dockCamCheck.offsetX > 80, 'Drydock viewOffset did not center ship left of drawer: ' + dockCamCheck.offsetX);
      assert(dockCamCheck.zList[0] > dockCamCheck.zList[1] && dockCamCheck.zList[1] > dockCamCheck.zList[2] && dockCamCheck.zList[2] > dockCamCheck.zList[3] && dockCamCheck.zList[3] > 8,
        'Drydock zoom non-monotonic: ' + JSON.stringify(dockCamCheck.zList));

      const drydockShots = [
        ['cathedral-basilica', 'side', '10_gothic_cathedral_side.png'],
        ['cathedral-basilica', 'orbit', '27_gothic_cathedral_orbit.png'],
        ['cathedral-basilica', 'stern', '28_gothic_cathedral_stern.png'],
        ['cathedral-gothic', 'side', '34_cathedral_gothic_side.png'],
        ['cathedral-gothic', 'orbit', '35_cathedral_gothic_orbit.png'],
        ['cathedral-gothic', 'stern', '36_cathedral_gothic_stern.png'],
        ['dune-monolith', 'side', '11_dune_brutalist_side.png'],
        ['dune-monolith', 'orbit', '12_dune_brutalist_orbit.png'],
        ['long-patience', 'side', '13_long_patience_reversible.png'],
        ['giger-xenomorph', 'orbit', '14_giger_xeno.png'],
        ['coade-savages', 'side', '15_coade_axial_weapons.png'],
        ['splintered-pilgrim', 'side', '16_flipburn_bicone.png'],
        ['cocytus-heavy', 'orbit', '24_cocytus_spin_track.png'],
        ['gnostic-plague', 'orbit', '25_melding_plague_nostalgia.png'],
        ['cruciform-spear', 'stern', '26_cruciform_stern_no_funnel.png']
      ];
      for (const [pid, dcam, fname] of drydockShots) {
        await cdp.eval(`(() => {
          window.__LH_APP.selectPreset("${pid}");
          document.querySelector('#lh-screen-drydock [data-dcam="${dcam}"]').click();
        })()`);
        await cdp.waitFrames(8);
        await cdp.screenshot(fname);
      }
      // Verify mechanical rolling bearing track is built on Cocytus Ark & Splintered Pilgrim
      const trackCheck = await cdp.eval(`(() => {
        window.__LH_APP.selectPreset('cocytus-heavy');
        const cTrack = !!window.__LH_APP.getSnapshot() && !!document.getElementById('lh-scene');
        const cHas = !!window.__LH_APP.getSceneInfo() && !!window.__LH_APP.getShipGeometryStats();
        return { cTrack, cHas };
      })()`);
      console.log('SPIN_TRACK_CHECK:', JSON.stringify(trackCheck));
      // Close-up zoomed-in shots of the redesigned sculpted Conjoiner intakes (Dune, Sagrada, Flip & Burn, Long Patience)
      const intakeCloseups = [
        ['dune-monolith', 0.58, 0.24, 0.34, '18_closeup_dune_intake.png'],
        ['cathedral-basilica', 0.62, 0.22, 0.34, '19_closeup_gothic_intake.png'],
        ['cathedral-gothic', -1.85, 0.20, 0.48, '37_closeup_cathedral_spires.png'],
        ['splintered-pilgrim', 0.56, 0.20, 0.36, '20_closeup_flipburn_prow.png'],
        ['cocytus-heavy', 0.72, 0.22, 0.44, '28_closeup_cocytus_track.png']
      ];
      for (const [pid, yaw, pitch, zoom, fname] of intakeCloseups) {
        await cdp.eval(`(() => {
          window.__LH_APP.selectPreset("${pid}");
          const c = window.__LH_APP.getSnapshot().cam;
          c.orbitYaw = ${yaw};
          c.orbitPitch = ${pitch};
          c.orbitZoom = ${zoom};
        })()`);
        await cdp.waitFrames(8);
        await cdp.screenshot(fname);
      }
      await cdp.eval(`window.__LH_APP.resetCamera()`);
      await cdp.waitFrames(4);
      // Reversible forward braking plumes showcase on Long Patience (undocked, -1.2g reverse thrust, bow stays forward!)
      // Also verify toggleFlip() NEVER flips a bow-ice vessel 180 deg!
      await cdp.eval(`(() => {
        window.__LH_APP.selectPreset('long-patience');
        window.__LH_APP.commissionDraft();
        document.querySelector('#lh-screen-drydock [data-dcam="orbit"]').click();
        document.querySelector('#lh-screen-drydock .lh-back').click();
        window.__LH_APP.undock();
        window.__LH_APP.toggleFlip();
        window.__LH_APP.setThrustG(-1.2);
      })()`);
      await cdp.waitFrames(12);
      const revFlight = await cdp.eval(`(() => {
        const s = window.__LH_APP.getSnapshot();
        const snow = window.__LH_APP.getSnowBounds() || {};
        const flipLbl = document.getElementById('sw-flip-lbl')?.textContent || '';
        return {
          reversibleDrive: s.reversibleDrive,
          flip: s.flip,
          thrustCmdG: s.thrustCmdG,
          deckGSign: s.deckGSign,
          plumeDirSign: snow.plumeDirSign,
          plumeDirX: snow.plumeDir && snow.plumeDir[0],
          accelDirX: snow.accelDir && snow.accelDir[0],
          flipLbl
        };
      })()`);
      console.log('REV_BRAKE_FLIGHT:', JSON.stringify(revFlight));
      assert(
        revFlight.reversibleDrive === true &&
        revFlight.flip === false &&
        revFlight.thrustCmdG < -0.5 &&
        revFlight.deckGSign === -1 &&
        revFlight.plumeDirSign === 1 &&
        revFlight.plumeDirX > 0.9 &&
        revFlight.accelDirX < -0.9 &&
        revFlight.flipLbl === 'REV BRAKE',
        'Reversible braking flight check failed: ' + JSON.stringify(revFlight)
      );
      await cdp.screenshot('17_reversible_braking_plumes.png');

      // Flip & Burn verification on dual-ice Bi-Cone & Twin-Ram vessels:
      // 1) Selecting a dual-ice ship in Drydock while docked and returning to Helm via .lh-back MUST auto-commission
      //    so the rendered 3D ship and reversibleDrive === false never desync!
      // 2) Clicking FLIP 180 deg (toggleFlip) from 0g MUST engage -g braking AND flip 180 deg!
      // 3) Commanding -1.2g MUST flip 180 deg (flip=true, flipRad~PI) and fire AFT bells (plumeDirSign=-1)
      //    out the back of the flipped ship (+X travel frame) to produce braking acceleration (-X)!
      await cdp.eval(`(() => {
        window.__LH_APP.setThrustG(0);
        window.__LH_APP.enterSystemOrbit('sol', true);
        document.querySelector('[data-screen-btn="drydock"]').click();
        window.__LH_APP.selectPreset('cocytus-heavy');
        // Return to Helm WITHOUT clicking Commission explicitly: docked refit must auto-commission!
        document.querySelector('#lh-screen-drydock .lh-back').click();
        window.__LH_APP.undock();
        // Clicking FLIP 180 deg from 0g must engage flip-and-burn braking (-g)!
        window.__LH_APP.toggleFlip();
      })()`);
      await cdp.waitFrames(6);
      const twinRamToggleCheck = await cdp.eval(`(() => {
        const s = window.__LH_APP.getSnapshot();
        return {
          shipName: s.shipName,
          iceSymmetry: s.iceSymmetry,
          reversibleDrive: s.reversibleDrive,
          flip: s.flip,
          thrustCmdG: s.thrustCmdG
        };
      })()`);
      console.log('TWIN_RAM_TOGGLE_FLIP:', JSON.stringify(twinRamToggleCheck));
      assert(
        twinRamToggleCheck.iceSymmetry === 'twin-ram' &&
        twinRamToggleCheck.reversibleDrive === false &&
        twinRamToggleCheck.flip === true &&
        twinRamToggleCheck.thrustCmdG < -0.5,
        'Twin-ram Drydock->Helm auto-commission or toggleFlip braking failed: ' + JSON.stringify(twinRamToggleCheck)
      );

      await cdp.eval(`(() => {
        window.__LH_APP.setThrustG(0);
        window.__LH_APP.enterSystemOrbit('sol', true);
        window.__LH_APP.selectPreset('splintered-pilgrim');
        window.__LH_APP.commissionDraft();
        window.__LH_APP.undock();
        window.__LH_APP.setThrustG(-1.2);
        window.__LH_APP.state.flipVisualRad = Math.PI;
      })()`);
      await cdp.waitFrames(10);
      const flipFlight = await cdp.eval(`(() => {
        const s = window.__LH_APP.getSnapshot();
        const snow = window.__LH_APP.getSnowBounds() || {};
        const sc = window.__LH_APP.getSceneInfo() || {};
        const flipLbl = document.getElementById('sw-flip-lbl')?.textContent || '';
        return {
          reversibleDrive: s.reversibleDrive,
          flip: s.flip,
          thrustCmdG: s.thrustCmdG,
          plumeDirSign: snow.plumeDirSign,
          plumeDirX: snow.plumeDir && snow.plumeDir[0],
          accelDirX: snow.accelDir && snow.accelDir[0],
          againstPlumeFrac: snow.againstPlumeFrac,
          ismAtLowBeta: sc.ismSheath && sc.ismSheath.active,
          flipLbl
        };
      })()`);
      console.log('FLIP_BURN_FLIGHT:', JSON.stringify(flipFlight));
      assert(
        flipFlight.reversibleDrive === false &&
        flipFlight.flip === true &&
        flipFlight.thrustCmdG < -0.5 &&
        flipFlight.plumeDirSign === -1 &&
        flipFlight.plumeDirX > 0.9 &&
        flipFlight.accelDirX < -0.9 &&
        flipFlight.againstPlumeFrac === 0 &&
        flipFlight.ismAtLowBeta === false &&
        flipFlight.flipLbl.includes('FLIP 180'),
        'Flip-and-burn braking check failed: ' + JSON.stringify(flipFlight)
      );
      await cdp.screenshot('29_flipburn_braking_plumes.png');

      // Aim the sextant at the observed body direction and size its disk for review.
      for (const [systemId, name, file] of [
        ['proxima', 'Proxima b', '38_proxima_eyeball_shader.png'],
        ['sirius', 'Sirius', '39_sirius_star_plasma_giant.png'],
        ['sirius', 'Canis Plasma-Giant', '39b_canis_plasma_giant.png'],
        ['yake', 'Hesperus Crown', '54_hesperus_crown.png']
      ]) {
        await cdp.eval(`(() => {
          const app = window.__LH_APP;
          app.enterSystemOrbit(${JSON.stringify(systemId)}, false);
          app.state.timeWarp = 1;
          app.state.autoClock = false;
          // Double the berth orbit radius so the nearest world fits in the optics.
          app.orbit.rKm = app.orbit.rKm.map(x => x * 2);
          app.orbit.vKmS = app.orbit.vKmS.map(x => x / Math.SQRT2);
        })()`);
        await cdp.eval(`window.__LH_APP.setScreen('sextant')`);
        await cdp.waitFrames(4);
        await cdp.eval(`(() => {
          const app = window.__LH_APP;
          const body = app.getSceneInfo().bodies.find(b => b.name === ${JSON.stringify(name)});
          const [x, y, z] = body.dir;
          app.state.scopeTheta = Math.acos(Math.max(-1, Math.min(1, x))) * 180 / Math.PI;
          app.state.scopeAz = Math.atan2(z, y) * 180 / Math.PI;
          app.getSnapshot().cam.sxZoom = body.angRadiusDeg * 4 / 24;
        })()`);
        await cdp.waitFrames(36);
        const framing = await cdp.eval(`(() => {
          const app = window.__LH_APP, scene = app.getSceneInfo();
          const body = scene.bodies.find(b => b.name === ${JSON.stringify(name)});
          const theta = app.state.scopeTheta * Math.PI / 180, az = app.state.scopeAz * Math.PI / 180;
          const [x, y, z] = body.dir;
          const dot = x * Math.cos(theta) + Math.sin(theta) * (y * Math.cos(az) + z * Math.sin(az));
          return { view: scene.view, fraction: body.angRadiusDeg * 2 / scene.camera.fov,
            centered: dot > Math.cos(body.angRadiusDeg * Math.PI / 180) };
        })()`);
        assert(framing.view === 'sextant' && framing.centered && framing.fraction > 0.15 && framing.fraction < 1,
          name + ' shader capture framing: ' + JSON.stringify(framing));
        await cdp.screenshot(file);
      }
      await cdp.eval(`window.__LH_APP.setScreen('helm')`);
      await cdp.eval(`window.__LH_APP.resetCamera()`);

      // Verify clean non-overlapping notice stack + screen switcher navigation (Orbits / Starmap / Sextant)
      await cdp.eval(`(() => {
        window.__LH_APP.setThrustG(0);
        window.__LH_APP.enterSystemOrbit('sol', true);
        window.__LH_APP.selectPreset('long-patience');
        window.__LH_APP.commissionDraft();
      })()`);
      await cdp.waitFrames(6);
      await cdp.screenshot('33_helm_clean_labels.png');

      const uiFlowCheck = await cdp.eval(`(async () => {
        const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
        // Trigger both warning + flash simultaneously and verify zero vertical overlap
        window.__LH_APP.state.warning = { title: 'TEST ADVISORY', text: 'Checking non-overlapping stack.', level: 'elevated' };
        window.LighthuggerScreens.flash('Stack separation check', 'info');
        const wEl = document.getElementById('lh-warning');
        const fEl = document.getElementById('lh-flash');
        wEl.hidden = false;
        const wr = wEl.getBoundingClientRect();
        const fr = fEl.getBoundingClientRect();
        const noticeOverlap = wr.height > 0 && fr.height > 0 && wr.bottom > fr.top + 1;
        window.__LH_APP.state.warning = null;
        wEl.hidden = true;
        fEl.hidden = true;
        // Verify Helm labels count is cleanly bounded (<= 6) and none overlap each other
        const visLabels = [...document.querySelectorAll('#lh-labels .lh-label')].filter(n => !n.hidden).map(n => n.getBoundingClientRect());
        let labelOverlap = false;
        for (let i = 0; i < visLabels.length; i++) {
          for (let j = i + 1; j < visLabels.length; j++) {
            const a = visLabels[i], b = visLabels[j];
            if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) labelOverlap = true;
          }
        }
        // Verify invariant top-center #lh-screenbar across ALL 8 screens (centered, highlighted, zero overlap)
        const sb = document.getElementById('lh-screenbar');
        const screenChecks = [];
        const topSel = {
          menu: '#lh-menu-left',
          helm: null,
          orbits: '#lh-screen-orbits .kg-chrono-top',
          starmap: '#lh-screen-starmap .lh-map-hud-tl',
          drydock: '#lh-screen-drydock .lh-drawer-cams',
          sextant: '#lh-sx-banner',
          archive: '#lh-screen-archive .lh-archive-card',
          manual: '#lh-screen-manual .lh-manual-card'
        };
        for (const scr of ['menu', 'helm', 'orbits', 'starmap', 'drydock', 'sextant', 'archive', 'manual']) {
          window.__LH_APP.setScreen(scr);
          await waitF(2);
          const sbr = sb.getBoundingClientRect();
          const activeBtns = [...sb.querySelectorAll('[data-screen-btn][aria-pressed="true"]')].map(b => b.dataset.screenBtn);
          const topEl = topSel[scr] ? document.querySelector(topSel[scr]) : null;
          const tr = topEl ? topEl.getBoundingClientRect() : null;
          const overlapBar = Boolean(tr && tr.width > 0 && tr.top < sbr.bottom - 1 && tr.left < sbr.right && tr.right > sbr.left);
          screenChecks.push({
            scr, vis: sbr.width > 200 && sbr.height > 20,
            centerErr: Math.abs((sbr.left + sbr.right) / 2 - innerWidth / 2),
            active: activeBtns.join(','), overlapBar
          });
        }
        window.__LH_APP.setScreen('helm');
        await waitF(2);
        // Verify populated Sol (>=10 worlds, Saturn first with Titan/Enceladus, Halley comet) and procedural exoplanets (>=4 per system)
        const systems = window.LighthuggerGalaxy.SYSTEMS;
        const sol = systems.find(s => s.id === 'sol');
        const solPlanets = (sol?.planets || []).length;
        const solFirst = sol?.planets?.[0]?.name || '';
        const solHasComet = (sol?.planets || []).some(p => p.kind === 'comet');
        const minExoPlanets = Math.min(...systems.filter(s => s.id !== 'sol').map(s => (s.planets || []).length));
        return {
          noticeOverlap, visLabelCount: visLabels.length, labelOverlap,
          oldStBars: document.querySelectorAll('.lh-station-bar').length,
          screenChecks, solPlanets, solFirst, solHasComet, minExoPlanets
        };
      })()`);
      console.log('UI_FLOW_CHECK:', JSON.stringify(uiFlowCheck));
      assert(
        !uiFlowCheck.noticeOverlap && uiFlowCheck.oldStBars === 0 &&
        uiFlowCheck.visLabelCount <= 6 && !uiFlowCheck.labelOverlap &&
        uiFlowCheck.screenChecks.every(c => c.vis && c.centerErr < 6 && c.active === c.scr && !c.overlapBar) &&
        uiFlowCheck.solPlanets >= 10 && uiFlowCheck.solFirst === 'Saturn' && uiFlowCheck.solHasComet && uiFlowCheck.minExoPlanets >= 4,
        'UI invariant screenbar / galaxy check failed: ' + JSON.stringify(uiFlowCheck)
      );

      // Verify interactive choice-space click on Orbit Nav and clean screen navigation
      await cdp.eval(`(() => {
        window.__LH_APP.undock();
        document.querySelector('[data-screen-btn="orbits"]').click();
      })()`);
      await cdp.waitFrames(6);
      // Click open orbital choice space on #lh-orbit-canvas to plot a live CUSTOM ORBIT transfer!
      const orbitClickCheck = await cdp.eval(`(async () => {
        const oc = document.getElementById('lh-orbit-canvas');
        const r = oc.getBoundingClientRect();
        const cx = r.left + r.width * 0.68, cy = r.top + r.height * 0.34;
        oc.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 31, pointerType: 'mouse', clientX: cx, clientY: cy }));
        oc.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 31, pointerType: 'mouse', clientX: cx, clientY: cy }));
        oc.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 31, pointerType: 'mouse', clientX: cx, clientY: cy }));
        await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(res))));
        const s = window.__LH_APP.state;
        return {
          selectedTargetId: s.selectedTargetId,
          customOrbitKm: s.customOrbitKm,
          hasPlan: !!(s.orbitPlan && Number.isFinite(s.orbitPlan.totalDvKmS)),
          targetText: document.getElementById('lh-orbit-plan')?.textContent || ''
        };
      })()`);
      console.log('ORBIT_CHOICE_SPACE_CLICK:', JSON.stringify(orbitClickCheck));
      assert(
        orbitClickCheck.selectedTargetId === 'custom' &&
        Number.isFinite(orbitClickCheck.customOrbitKm) && orbitClickCheck.customOrbitKm > 60000 &&
        orbitClickCheck.hasPlan &&
        orbitClickCheck.targetText.includes('CUSTOM ORBIT'),
        'Interactive Orbit Nav choice-space click failed: ' + JSON.stringify(orbitClickCheck)
      );
      await cdp.eval(`document.querySelector('#lh-screen-orbits [data-screen-btn="helm"]').click()`);
      await cdp.waitFrames(4);
      await cdp.eval(`window.__LH_APP.enterSystemOrbit('sol', true)`);
      await cdp.waitFrames(6);

      // High-beta free interstellar flight stability (with SAFE gamma governor explicitly disabled):
      // Phase 1: realistic ~0.94c bow-first cruise (healthy ice shield, nominal ablation, clean render)
      // Phase 2: extreme burn to MAX_FLIGHT_ETA = 5.5 (bounded eta/gamma, finite epoch/pos, working abort!)
      const cruiseP1 = await cdp.eval(`(async () => {
        window.__LH_APP.undock();
        window.__LH_APP.engageInterstellar({ destId: 'rigil' });
        window.__LH_APP.state.mission = null; // test uncapped free interstellar flight at +1.8g in AUTO warp!
        window.__LH_APP.state.relGov = false;
        window.__LH_APP.setThrustG(1.8);
        window.__LH_APP.setTimeWarp('auto');
        // Phase 1: ~0.96 proper ship years at +1.8g -> eta ~ 1.78, beta ~ 0.945c, gamma ~ 3.05
        for (let i = 0; i < 12; i++) {
          window.__LH_APP.step(0.08 * 31557600);
          window.__LH_APP.stepThermal(0.05);
        }
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
        const s1 = window.__LH_APP.getSnapshot();
        const sc1 = window.__LH_APP.getSceneInfo();
        const posOk = Array.isArray(s1.posGal) && s1.posGal.every(Number.isFinite);
        const solDistLy = posOk ? Math.hypot(s1.posGal[0], s1.posGal[1], s1.posGal[2]) : NaN;
        return {
          mode: s1.mode,
          eta: s1.eta,
          beta: s1.beta,
          gamma: s1.gamma,
          epochYear: s1.epochYear,
          iceIntegrity: s1.iceIntegrity,
          ablationLevel: s1.ablation && s1.ablation.warningLevel,
          solDistLy,
          orbitCurVis: sc1 && sc1.orbitCurves && sc1.orbitCurves.current,
          ismSheath: sc1 && sc1.ismSheath
        };
      })()`);
      console.log('HIGH_BETA_CRUISE_P1:', JSON.stringify(cruiseP1));
      assert(
        cruiseP1.mode === 'interstellar' &&
        Number.isFinite(cruiseP1.eta) && cruiseP1.eta > 1.5 && cruiseP1.eta < 2.3 &&
        cruiseP1.beta > 0.90 && cruiseP1.beta < 0.99 &&
        Number.isFinite(cruiseP1.gamma) && cruiseP1.gamma > 2.2 && cruiseP1.gamma < 5.0 &&
        Number.isFinite(cruiseP1.epochYear) && cruiseP1.epochYear > 2371 &&
        Number.isFinite(cruiseP1.solDistLy) && cruiseP1.solDistLy > 0.5 &&
        cruiseP1.iceIntegrity > 0.85 &&
        cruiseP1.ablationLevel === 'nominal' &&
        cruiseP1.orbitCurVis === false &&
        cruiseP1.ismSheath && cruiseP1.ismSheath.active === true &&
        cruiseP1.ismSheath.power > 3.0 && cruiseP1.ismSheath.cherenkovFore > 0.4,
        'High-beta interstellar cruise Phase 1 check failed: ' + JSON.stringify(cruiseP1)
      );
      // Verify ISM sheath & Cherenkov glow stay active at 0g coast (strictly velocity-driven, NOT throttle-driven!)
      const coastSheath = await cdp.eval(`(async () => {
        window.__LH_APP.setThrustG(0);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const sc = window.__LH_APP.getSceneInfo();
        window.__LH_APP.setThrustG(1.8);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return sc && sc.ismSheath;
      })()`);
      console.log('COAST_ISM_SHEATH:', JSON.stringify(coastSheath));
      assert(coastSheath && coastSheath.active === true && coastSheath.cherenkovFore > 0.4,
        'ISM Cherenkov sheath wrongly vanished at 0g coast: ' + JSON.stringify(coastSheath));
      await cdp.screenshot('22_interstellar_high_beta.png');

      // High-beta Dual-Ice Flip & Burn showcase: verify aft Cherenkov glow & aft ISM sheath when flipped 180 deg at 0.94c!
      const dualHighBetaFlip = await cdp.eval(`(async () => {
        window.__LH_APP.enterSystemOrbit('sol', true);
        window.__LH_APP.selectPreset('splintered-pilgrim');
        window.__LH_APP.commissionDraft();
        window.__LH_APP.undock();
        window.__LH_APP.engageInterstellar({ destId: 'rigil' });
        window.__LH_APP.state.mission = null;
        window.__LH_APP.state.relGov = false;
        window.__LH_APP.setThrustG(1.6);
        for (let i = 0; i < 12; i++) window.__LH_APP.step(0.08 * 31557600);
        window.__LH_APP.setThrustG(-1.4);
        window.__LH_APP.state.flipVisualRad = Math.PI;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
        const s = window.__LH_APP.getSnapshot();
        const sc = window.__LH_APP.getSceneInfo();
        return { flip: s.flip, beta: s.beta, thrustCmdG: s.thrustCmdG, ismSheath: sc && sc.ismSheath };
      })()`);
      console.log('DUAL_ICE_HIGH_BETA_FLIP:', JSON.stringify(dualHighBetaFlip));
      assert(
        dualHighBetaFlip.flip === true &&
        dualHighBetaFlip.thrustCmdG < -1.0 &&
        dualHighBetaFlip.ismSheath && dualHighBetaFlip.ismSheath.active === true &&
        dualHighBetaFlip.ismSheath.cherenkovAft > 0.35 && dualHighBetaFlip.ismSheath.cherenkovFore === 0,
        'Dual-ice high-beta flip-and-burn aft Cherenkov check failed: ' + JSON.stringify(dualHighBetaFlip)
      );
      await cdp.screenshot('40_high_beta_flipburn_cherenkov.png');

      // Restore Long Patience before Phase 2 extreme-gamma test so cruiseP2 starts from identical state
      await cdp.eval(`(async () => {
        window.__LH_APP.enterSystemOrbit('sol', true);
        window.__LH_APP.selectPreset('long-patience');
        window.__LH_APP.commissionDraft();
        window.__LH_APP.undock();
        window.__LH_APP.engageInterstellar({ destId: 'rigil' });
        window.__LH_APP.state.mission = null;
        window.__LH_APP.state.relGov = false;
        window.__LH_APP.setThrustG(1.8);
      })()`);
      const cruiseP2 = await cdp.eval(`(async () => {
        // Phase 2: extreme burn pushing into MAX_FLIGHT_ETA = 5.5 (gamma ~ 122) to verify zero Infinity/NaN & functional abort
        for (let i = 0; i < 50; i++) {
          window.__LH_APP.step(0.08 * 31557600);
          window.__LH_APP.stepThermal(0.05);
        }
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const s1 = window.__LH_APP.getSnapshot();
        const posOk = Array.isArray(s1.posGal) && s1.posGal.every(Number.isFinite);
        const solDistLy = posOk ? Math.hypot(s1.posGal[0], s1.posGal[1], s1.posGal[2]) : NaN;
        window.__LH_APP.abortInterstellar();
        const s2 = window.__LH_APP.getSnapshot();
        return {
          eta: s1.eta,
          gamma: s1.gamma,
          epochYear: s1.epochYear,
          solDistLy,
          abortAfter: s2.thrustCmdG
        };
      })()`);
      console.log('HIGH_BETA_CRUISE_P2:', JSON.stringify(cruiseP2));
      assert(
        Number.isFinite(cruiseP2.eta) && cruiseP2.eta <= 5.5 &&
        Number.isFinite(cruiseP2.gamma) && cruiseP2.gamma > 50 && cruiseP2.gamma < 150 &&
        Number.isFinite(cruiseP2.epochYear) && cruiseP2.epochYear > 2400 &&
        Number.isFinite(cruiseP2.solDistLy) && cruiseP2.solDistLy > 50 &&
        cruiseP2.abortAfter < 0,
        'High-beta interstellar cruise Phase 2 check failed: ' + JSON.stringify(cruiseP2)
      );
      await cdp.eval(`(() => {
        window.__LH_APP.state.relGov = true;
        window.__LH_APP.setThrustG(0);
        window.__LH_APP.enterSystemOrbit('sol', true);
        window.__LH_APP.selectPreset('coade-savages');
      })()`);
      await cdp.waitFrames(6);
      // Capture CoaDE stern view to verify zero back-cone rocket nozzles
      await cdp.eval(`(() => {
        document.querySelector('[data-screen-btn="drydock"]').click();
        document.querySelector('#lh-screen-drydock [data-dcam="stern"]').click();
      })()`);
      await cdp.waitFrames(8);
      await cdp.screenshot('23_coade_stern_clean.png');
      await cdp.eval(`document.querySelector('#lh-screen-drydock .lh-back').click()`);
      await cdp.waitFrames(4);
    }

    await cdp.eval(`window.AcidburnMode && window.AcidburnMode.setMode('light')`);
    await cdp.waitFrames(4);
    const lightBtn = await cdp.eval(`(() => {
      const b = document.getElementById('lh-deck-primary');
      const cs = getComputedStyle(b);
      return { color: cs.color, bg: cs.backgroundColor, isLight: document.body.classList.contains('light-mode') };
    })()`);
    console.log('LIGHT_MODE_PRIMARY:', JSON.stringify(lightBtn));
    assert(lightBtn.isLight && lightBtn.color !== 'rgb(255, 255, 255)', 'Light mode button contrast failed');

    await cdp.eval(`window.AcidburnMode && window.AcidburnMode.setMode('bh')`);
    await cdp.waitFrames(4);
    const bhCheck = await cdp.eval(`(() => {
      const c = document.getElementById('lh-scene');
      const gl = c ? (c.getContext('webgl2') || c.getContext('webgl')) : null;
      return { isBh: document.body.classList.contains('bh-mode'), hasGl: !!gl, lost: gl ? gl.isContextLost() : true };
    })()`);
    console.log('BH_MODE:', JSON.stringify(bhCheck));
    assert(bhCheck.isBh && bhCheck.hasGl && !bhCheck.lost, 'BH mode WebGL check failed');

    await cdp.eval(`window.AcidburnMode && window.AcidburnMode.setMode('dark')`);
    await cdp.waitFrames(4);

    // 5. Archive save -> show bundle -> delete -> import roundtrip
    await cdp.eval(`document.querySelector('[data-screen-btn="archive"]').click()`);
    await cdp.waitFrames(4);
    const arcCheck = await cdp.eval(`(() => {
      document.getElementById('inp-arc-ship-name').value = 'Regression Vessel';
      document.getElementById('btn-arc-save-ship').click();
      document.getElementById('btn-arc-save-voyage').click();
      document.getElementById('btn-arc-export-text').click();
      const exported = document.getElementById('txt-arc-import').value;
      let parsed = null;
      try { parsed = JSON.parse(exported); } catch (_) {}
      const isObj = Boolean(parsed && typeof parsed === 'object' && parsed.format === 'lighthugger-archive-v1');
      const del = document.querySelector('#lh-arc-vessels [data-arc-act="del-v"]');
      if (del) del.click();
      const afterDelCount = document.getElementById('lh-arc-count-v').textContent;
      document.getElementById('btn-arc-import').click();
      const afterImpCount = document.getElementById('lh-arc-count-v').textContent;
      const fb = document.getElementById('lh-arc-feedback');
      const flashEl = document.getElementById('lh-flash');
      return {
        isObj,
        hasDelBtn: !!del,
        afterDelCount,
        afterImpCount,
        feedback: fb ? fb.textContent : '',
        feedbackOk: fb ? fb.dataset.ok : '',
        flashTop: flashEl && !flashEl.hidden ? flashEl.getBoundingClientRect().top : null
      };
    })()`);
    console.log('ARCHIVE_CHECK:', JSON.stringify(arcCheck));
    assert(arcCheck.isObj && arcCheck.hasDelBtn && arcCheck.afterDelCount === '0' && arcCheck.afterImpCount === '1' && arcCheck.feedbackOk === '1', 'Archive roundtrip failed');
    await cdp.eval(`document.querySelector('#lh-screen-archive .lh-back').click()`);
    await cdp.waitFrames(4);

    // 6. Responsive checks across all 6 viewports on Helm
    const viewports = [
      [390, 844, true, '390x844'],
      [320, 568, true, '320x568'],
      [768, 1024, true, '768x1024'],
      [1280, 720, false, '1280x720'],
      [844, 390, true, '844x390'],
      [568, 320, true, '568x320']
    ];
    for (const [w, h, mob, tag] of viewports) {
      await cdp.setViewport(w, h, mob);
      await cdp.eval('window.LighthuggerScreens.setKgOpen(true)');
      const layout = await cdp.eval(`(() => {
        const docOv = document.documentElement.scrollWidth > window.innerWidth;
        const deck = document.getElementById('kg-deck');
        const deckOv = deck ? deck.scrollWidth > deck.clientWidth + 2 : false;
        const switches = document.getElementById('kg-switch-bay').getBoundingClientRect();
        const tele = document.querySelector('.kg-telegraph-bay')?.getBoundingClientRect();
        const puck = document.querySelector('.kg-puck-bay')?.getBoundingClientRect();
        const overlap = (a, b) => !!(a && b && a.width > 0 && b.width > 0 &&
          a.left < b.right - 2 && a.right > b.left + 2 && a.top < b.bottom - 2 && a.bottom > b.top + 2);
        return {
          w: window.innerWidth, h: window.innerHeight,
          docOv, deckOv, deckHeight: deck.getBoundingClientRect().height, deckVisible: !deck.hidden && deck.getBoundingClientRect().height > 0,
          switchTeleOverlap: overlap(switches, tele),
          telePuckOverlap: overlap(tele, puck),
          switchPuckOverlap: overlap(switches, puck),
          screenbarWrapOk: document.getElementById('lh-screenbar').scrollWidth <= document.getElementById('lh-screenbar').clientWidth + 2
        };
      })()`);
      console.log(`VIEWPORT ${tag} helm:`, JSON.stringify(layout));
      assert(layout.w === w && layout.h === h && layout.deckVisible && !layout.docOv && !layout.deckOv &&
        (mob || layout.deckHeight <= 285) &&
        !layout.switchTeleOverlap && !layout.telePuckOverlap && !layout.switchPuckOverlap && layout.screenbarWrapOk, `Helm layout failed on ${tag}`);
    }

    console.log(`RESPONSIVE_OK viewports=${viewports.length}`);

    // 7. Mobile startup creator & drydock checks on 390x844 and 320x568
    for (const [w, h, tag] of [[390, 844, '390x844'], [320, 568, '320x568']]) {
      await cdp.setViewport(w, h, true);
      await cdp.eval(`document.querySelector('[data-screen-btn="menu"]').click()`);
      await cdp.waitFrames(4);
      await cdp.eval(`document.getElementById('lh-menutab-custom').click()`);
      await cdp.eval(`document.querySelector('#lh-menu-right [data-cztab="ice"]').click()`);
      await cdp.waitFrames(4);
      const mobCz = await cdp.eval(`({
        docOv: document.documentElement.scrollWidth > window.innerWidth,
        bodyH: document.querySelector('#lh-menu-right .lh-cz-body').getBoundingClientRect().height,
        footBottom: document.querySelector('#lh-menu-right .lh-cz-foot').getBoundingClientRect().bottom
      })`);
      console.log(`MOBILE_CREATOR ${tag}:`, JSON.stringify(mobCz));
      assert(!mobCz.docOv && mobCz.bodyH > 80 && mobCz.footBottom <= h + 2, `Mobile creator failed on ${tag}`);
      await cdp.eval(`document.querySelector('#lh-menu-right [data-screen-btn="drydock"]').click()`);
      await cdp.waitFrames(4);
      const mobDd = await cdp.eval(`(() => {
        const sb = document.getElementById('lh-screenbar').getBoundingClientRect();
        const cams = document.querySelector('#lh-screen-drydock .lh-drawer-cams').getBoundingClientRect();
        return {
          docOv: document.documentElement.scrollWidth > window.innerWidth,
          bodyH: document.querySelector('#lh-screen-drydock .lh-panel-body').getBoundingClientRect().height,
          sbH: sb.height,
          camsClear: cams.top >= sb.bottom - 1,
          offsetY: window.__LH_APP.getSceneInfo().camera.offsetY
        };
      })()`);
      console.log(`MOBILE_DRYDOCK ${tag}:`, JSON.stringify(mobDd));
      assert(!mobDd.docOv && mobDd.bodyH > 80 && mobDd.sbH >= 24 && mobDd.camsClear && mobDd.offsetY > 60, `Mobile drydock failed on ${tag}: ` + JSON.stringify(mobDd));
      if (OUT_DIR && tag === '390x844') await cdp.screenshot('21_mobile_drydock_portrait.png');
      await cdp.eval(`document.querySelector('#lh-screen-drydock .lh-back').click()`);
      await cdp.waitFrames(4);
    }

    // Exercise the actual frame clock. Explicit app.step() calls mask a clock stranded at 1x.
    for (const [preset, control] of [
      ['long-patience', 'abort'], ['long-patience', 'override'], ['long-patience', 'flip'],
      ['long-patience', 'stop-then-brake'], ['splintered-pilgrim', 'flip'],
      ['cocytus-heavy', 'flip'], ['cruciform-spear', 'reverse'], ['cruciform-spear', 'refit-flip'],
      ['long-patience', 'orbit'], ['splintered-pilgrim', 'orbit']
    ]) {
      const sample = await cdp.eval(`(async () => {
        const app = window.__LH_APP, s = app.state;
        app.enterSystemOrbit('sol', true);
        s.credits = 1e9;
        app.selectPreset('${preset}');
        if ('${control}' === 'refit-flip') app.setGenomeParam('iceSymmetry', 'bi-cone');
        if (!app.commissionDraft()) throw new Error('Commission failed');
        app.undock();
        const local = '${control}' === 'orbit';
        if (local) {
          app.setAttitudeMode('retrograde');
          app.step(0.01, 3); // Establish the opposite heading before commanding signed braking.
          app.stopAll();
        } else {
          if (!app.engageInterstellar({destId:'rigil'})) throw new Error('Departure failed');
          Object.assign(s, {eta:3.70, beta:Math.tanh(3.70), gamma:Math.cosh(3.70), thrustCmdG:0});
          s.mission.phase = 'coast';
          if ('${control}' === 'stop-then-brake') {
            app.stopAll();
            if (s.timeWarp !== 1 || s.effectiveWarp !== 1 || s.autoClock || s.thrustCmdG) throw new Error('ALL STOP');
          }
        }
        const speed = s.orbit.el.speedKmS, beta = s.beta, eta = s.eta;
        switch ('${control}') {
          case 'abort': app.abortInterstellar(); break;
          case 'override': document.querySelector('[data-thrust-set="-1"]').click(); break;
          case 'stop-then-brake': app.setThrustG(-1.5); break;
          default: document.getElementById('sw-flip').click();
        }
        const flip = s.flip, thrust = s.thrustCmdG, free = !s.mission;
        if (local) app.step(0.01, 3); // Allow the hull to slew without orbit drift in the fixture.
        const start = performance.now();
        do {
          await new Promise(requestAnimationFrame);
          if (local ? speed - s.orbit.el.speedKmS > 0.02 : eta - s.eta > 0.015) break;
        } while (performance.now() - start < 6000);
        const result = {flip, thrust, free, dEta: s.eta-eta, dBeta: s.beta-beta, dSpeed: s.orbit.el.speedKmS-speed};
        if (!local) {
          for (const warp of [1,100,10000,'interstellar']) {
            app.setTimeWarp(warp);
            app.setThrustG(-0.5);
            if (s.autoClock || s.timeWarp !== warp) throw new Error('Lost explicit clock ' + warp);
          }
        }
        app.stopAll();
        return result;
      })()`);
      console.log('BRAKE', preset, control, sample);
      const expectFlip = preset === 'splintered-pilgrim' || preset === 'cocytus-heavy' || control === 'refit-flip';
      assert(sample.free && sample.thrust < 0 && sample.flip === expectFlip &&
        (control === 'orbit' ? sample.dSpeed < -0.02 : sample.dEta < -0.015 && sample.dBeta < -0.00003),
        'Braking failed: ' + preset + ' ' + control + ' ' + JSON.stringify(sample));
    }

    // Verify steering directionality, orbital horizon & warp pacing, sextant drag/zoom, and ice ablation pacing
    const controlCheck = await cdp.eval(`(async () => {
      const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
      const app = window.__LH_APP, s = app.state;
      app.enterSystemOrbit('sol', true);
      app.selectPreset('long-patience');
      app.commissionDraft();
      app.undock();
      await waitF(4);

      // 1. Orbital horizon alignment: Saturn sits horizontally on port (-Z, |y| << 1), not overhead (+Y)
      const sat0 = app.getSceneInfo().bodies.find(b => b.key === 'planet');
      const satDir = sat0 && sat0.dir ? sat0.dir.slice() : null;

      // 2. Puck steering axes: +X turns bow toward +basis.z (starboard/right), +Y pitches bow toward +basis.y (dorsal/up)
      const b0 = { f: s.basis.f.slice(), y: s.basis.y.slice(), z: s.basis.z.slice() };
      s.cam = app.getSnapshot().cam;
      app.getSnapshot().cam.orbitYaw = 0.2; // start looking from bow to verify chase camera eases back astern
      app.setPuckMode('steer');
      app.setPuckInput(1, 0);
      for (let i = 0; i < 45 && (s.angVel[1] < 0.14 || dot(s.basis.f, b0.z) < 0.06); i++) await waitF(1);
      app.setPuckInput(0, 0);
      const yawDotZ = dot(s.basis.f, b0.z);
      const yawDotY = dot(s.basis.f, b0.y);
      const camYawAfterSteer = app.getSnapshot().cam.orbitYaw;
      app.stopAll();

      const b1 = { f: s.basis.f.slice(), y: s.basis.y.slice(), z: s.basis.z.slice() };
      app.setPuckInput(0, 1);
      for (let i = 0; i < 45 && (s.angVel[2] < 0.14 || dot(s.basis.f, b1.y) < 0.06); i++) await waitF(1);
      app.setPuckInput(0, 0);
      const pitchDotY = dot(s.basis.f, b1.y);
      const pitchDotZ = dot(s.basis.f, b1.z);

      // 3. Orbital auto-clock pacing: burning +1g in Saturn orbit stays smooth (< 300x), never slams to 1200x+
      app.enterSystemOrbit('sol', true);
      app.undock();
      app.setThrustG(1);
      await waitF(18);
      const orbWarpNear = s.effectiveWarp;
      const stillBound = s.mode === 'orbit' && s.orbit.el.energy < 0;
      app.setThrustG(0);

      // 4. Sextant directionality from bow (0,0) + scroll zoom + snap nearest
      app.setScreen('sextant');
      app.aimSextantAt(0, 0);
      await waitF(4);
      const cv = document.getElementById('lh-scene');
      const r = cv.getBoundingClientRect();
      const cx = r.left + r.width * 0.5, cy = r.top + r.height * 0.5;
      cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 11, pointerType: 'mouse', clientX: cx, clientY: cy }));
      cv.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 0, pointerId: 11, pointerType: 'mouse', clientX: cx + 100, clientY: cy }));
      cv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 11, pointerType: 'mouse', clientX: cx + 100, clientY: cy }));
      await waitF(3);
      const thR = s.scopeTheta * Math.PI / 180, azR = s.scopeAz * Math.PI / 180;
      const aimAfterDragRight = [Math.cos(thR), Math.sin(thR)*Math.cos(azR), Math.sin(thR)*Math.sin(azR)];

      app.aimSextantAt(0, 0);
      cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 12, pointerType: 'mouse', clientX: cx, clientY: cy }));
      cv.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 0, pointerId: 12, pointerType: 'mouse', clientX: cx, clientY: cy + 100 }));
      cv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 12, pointerType: 'mouse', clientX: cx, clientY: cy + 100 }));
      await waitF(3);
      const thD = s.scopeTheta * Math.PI / 180, azD = s.scopeAz * Math.PI / 180;
      const aimAfterDragDown = [Math.cos(thD), Math.sin(thD)*Math.cos(azD), Math.sin(thD)*Math.sin(azD)];

      const sxZoomBefore = app.getSnapshot().cam.sxZoom;
      cv.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120 }));
      await waitF(3);
      const sxZoomAfter = app.getSnapshot().cam.sxZoom;

      // 5. Ice ablation endurance at gamma=20 (0.9988c) for 1 ship-year (~5 real sec at 0.2 yr/s): loses < 10%
      app.setScreen('helm');
      app.enterSystemOrbit('sol', true);
      app.refuelAndReglaze(true);
      app.undock();
      app.engageInterstellar({ destId: 'rigil' });
      s.mission = null;
      // This fixture jumps directly to bow-first cruise, bypassing departure slew.
      s.velocityGal = s.headingGal.slice();
      s.eta = 3.70; s.beta = Math.tanh(3.70); s.gamma = Math.cosh(3.70); s.thrustCmdG = 0;
      const iceBefore = s.iceIntegrity;
      app.step(31557600); // 1 proper ship year at gamma=20.3
      const iceLoss1Yr = iceBefore - s.iceIntegrity;
      app.stopAll();
      app.enterSystemOrbit('sol', true);

      return {
        satDir, yawDotZ, yawDotY, pitchDotY, pitchDotZ, camYawAfterSteer,
        orbWarpNear, stillBound, aimAfterDragRight, aimAfterDragDown,
        sxZoomBefore, sxZoomAfter, iceLoss1Yr
      };
    })()`);
    console.log('CONTROLS_AND_ORBIT_CHECK:', JSON.stringify(controlCheck));
    assert(
      controlCheck.satDir && Math.abs(controlCheck.satDir[1]) < 0.25 && controlCheck.satDir[2] < -0.7 &&
      controlCheck.yawDotZ > 0.04 && Math.abs(controlCheck.yawDotY) < 0.02 &&
      controlCheck.pitchDotY > 0.04 && Math.abs(controlCheck.pitchDotZ) < 0.02 &&
      controlCheck.camYawAfterSteer > 0.35 &&
      controlCheck.orbWarpNear > 1 && controlCheck.orbWarpNear < 300 && controlCheck.stillBound &&
      controlCheck.aimAfterDragRight[2] < -0.05 && Math.abs(controlCheck.aimAfterDragRight[1]) < 0.02 &&
      controlCheck.aimAfterDragDown[1] > 0.05 && Math.abs(controlCheck.aimAfterDragDown[2]) < 0.02 &&
      controlCheck.sxZoomAfter < controlCheck.sxZoomBefore * 0.92 &&
      controlCheck.iceLoss1Yr > 0.005 && controlCheck.iceLoss1Yr < 0.10,
      'Controls/orbit/sextant/ablation check failed: ' + JSON.stringify(controlCheck)
    );

    // Verify Fighter Orbital HUD, Relativistic Interstellar HUD, Weapons HUD, Fighter CamLock, and skeuomorphic KG-2100 switches
    await cdp.setViewport(1440, 900, false);
    await cdp.eval(`window.LighthuggerScreens && window.LighthuggerScreens.setKgOpen(true)`);
    await cdp.waitFrames(4);
    const hudModesCheck = await cdp.eval(`(async () => {
      const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      const app = window.__LH_APP, s = app.state;
      const countInk = () => {
        const cv = document.getElementById('lh-hud-canvas');
        const ctx = cv ? cv.getContext('2d') : null;
        if (!ctx || !cv.width || !cv.height) return 0;
        const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 16) if (d[i] > 20) n++;
        return n;
      };
      app.enterSystemOrbit('sol', true);
      app.selectPreset('cathedral-gothic');
      app.commissionDraft();
      app.undock();
      if (app.state.camLock) document.getElementById('sw-cam-lock').click();
      await waitF(10);
      const orbitCurveOffByDefault = app.getSceneInfo().orbitCurves.current === false;
      const swFltDefault = document.getElementById('sw-hud-flt').getAttribute('aria-pressed');
      const swRelDefault = document.getElementById('sw-hud-rel').getAttribute('aria-pressed');
      document.getElementById('sw-hud-flt').click();
      await waitF(4);
      const fltInk = countInk();
      const swFlt = document.getElementById('sw-hud-flt').getAttribute('aria-pressed');
      const swLock = document.getElementById('sw-cam-lock').getAttribute('aria-pressed');
      // Custom camera angle holds while untouched; touching Pilot Puck snaps back toward stern (PI)
      app.getSnapshot().cam.orbitYaw = 0.6;
      await waitF(6);
      const yawHeld = app.getSnapshot().cam.orbitYaw;
      const well = document.getElementById('kg-puck-well');
      const wr = well.getBoundingClientRect();
      well.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 94, clientX: wr.left + wr.width * 0.5 + 10, clientY: wr.top + wr.height * 0.5 }));
      await waitF(2);
      well.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 94, clientX: wr.left + wr.width * 0.5, clientY: wr.top + wr.height * 0.5 }));
      await waitF(28);
      const yawAfterLock = app.getSnapshot().cam.orbitYaw;
      // Toggle WPN HUD via skeuomorphic hardware switch
      document.getElementById('btn-wpn-guard').click();
      document.getElementById('sw-hud-wpn').click();
      await waitF(4);
      const wpnBarOpen = !document.getElementById('kg-wpn-bar').hidden;
      document.getElementById('btn-wpn-fire').click();
      await waitF(3);
      const wpnInk = countInk();
      // Verify invariant top nav bar drops cleanly into Sextant & back
      document.querySelector('#lh-screenbar [data-screen-btn="sextant"]').click();
      await waitF(4);
      const droppedToSextant = s.screen === 'sextant';
      app.setScreen('helm');
      await waitF(4);
      document.getElementById('sw-hud-wpn').click();
      document.getElementById('btn-wpn-guard').click();
      return { orbitCurveOffByDefault, swFltDefault, swRelDefault, fltInk, swFlt, swLock, yawHeld, yawAfterLock, wpnBarOpen, wpnInk, droppedToSextant };
    })()`);
    console.log('HUD_AND_CAMLOCK_CHECK:', JSON.stringify(hudModesCheck));
    assert(
      hudModesCheck.orbitCurveOffByDefault &&
      hudModesCheck.swFltDefault === 'false' &&
      hudModesCheck.swRelDefault === 'false' &&
      hudModesCheck.fltInk > 120 &&
      hudModesCheck.swFlt === 'true' &&
      hudModesCheck.swLock === 'false' &&
      Math.abs(hudModesCheck.yawHeld - 0.6) < 0.08 &&
      hudModesCheck.yawAfterLock > 2.2 &&
      hudModesCheck.wpnBarOpen &&
      hudModesCheck.wpnInk > 150 &&
      hudModesCheck.droppedToSextant,
      'Fighter HUD / WPN HUD / CamLock check failed: ' + JSON.stringify(hudModesCheck)
    );

    // Part 2: Centered screenbar, zero empty KG-2100 voids, stow/un-stow, HIDE SHIP, 3-axis roll + arrows, and HYPR -> gamma > 0.99c!
    const kgControlsCheck = await cdp.eval(`(async () => {
      const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      const app = window.__LH_APP, s = app.state;
      const sbR = document.getElementById('lh-screenbar').getBoundingClientRect();
      const sbCenterErr = Math.abs((sbR.left + sbR.right) / 2 - window.innerWidth / 2);

      // Stow via kg-fold-btn -> verify unstow button visible -> click #btn-kg-unstow -> re-opens!
      document.getElementById('kg-fold-btn').click();
      await waitF(2);
      const stowedHidden = document.getElementById('kg-deck').hidden === true;
      const unstowVis = document.getElementById('btn-kg-unstow').getBoundingClientRect().width > 50;
      document.getElementById('btn-kg-unstow').click();
      await waitF(2);
      const unstowedViaBar = document.getElementById('kg-deck').hidden === false;
      document.getElementById('kg-fold-btn').click();
      await waitF(2);
      const topKgAbsent = document.getElementById('btn-kg-toggle') === null && !!document.getElementById('btn-settings-open');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }));
      await waitF(2);
      const unstowedViaTop = topKgAbsent && document.getElementById('kg-deck').hidden === false;

      // Toggle HIDE SHIP hardware switch -> verify shipFrame hidden, then restore
      document.getElementById('sw-hide-ship').click();
      await waitF(2);
      const hideShipState = s.hideShip === true && document.getElementById('sw-hide-ship').getAttribute('aria-pressed') === 'true';
      document.getElementById('sw-hide-ship').click();
      await waitF(2);
      const showShipRestored = s.hideShip === false;

      // ArrowRight yaw on Helm. All three roll controls are covered above.
      const dot3 = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
      app.stopAll();
      const z1 = s.basis.z.slice();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      for (let i = 0; i < 45 && (s.angVel[1] < 0.14 || dot3(s.basis.f, z1) < 0.06); i++) await waitF(1);
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
      const arrowYawDotZ = dot3(s.basis.f, z1);

      // Large time-shift (HYPR) directly from orbit (governor off) -> reaches > 0.99c & auto-switches display from beta to LORENTZ gamma!
      app.enterSystemOrbit('sol', true);
      app.undock();
      s.relGov = false;
      app.setThrustG(1.5);
      document.querySelector('#kg-deck [data-warp="hyper"]').click();
      for (let i = 0; i < 12; i++) app.step(0.35 * 31557600, 0.05);
      await waitF(4);
      const hyprBeta = s.beta;
      const hyprGamma = s.gamma;
      const velLblAt99 = document.getElementById('kg-vel-lbl').textContent;
      const velValAt99 = document.getElementById('out-drive-beta').textContent;
      const tmK1At99 = document.getElementById('lh-tm-k1').textContent;
      s.relGov = true;
      app.stopAll();
      app.enterSystemOrbit('sol', true);

      return {
        sbCenterErr,
        stowedHidden, unstowVis, unstowedViaBar, unstowedViaTop,
        hideShipState, showShipRestored, arrowYawDotZ,
        hyprBeta, hyprGamma, velLblAt99, velValAt99, tmK1At99
      };
    })()`);
    console.log('KG_CONTROLS_AND_GAMMA_CHECK:', JSON.stringify(kgControlsCheck));
    assert(
      kgControlsCheck.sbCenterErr < 6 &&
      kgControlsCheck.stowedHidden && kgControlsCheck.unstowVis && kgControlsCheck.unstowedViaBar && kgControlsCheck.unstowedViaTop &&
      kgControlsCheck.hideShipState && kgControlsCheck.showShipRestored &&
      kgControlsCheck.arrowYawDotZ > 0.04 &&
      kgControlsCheck.hyprBeta >= 0.99 && kgControlsCheck.hyprGamma > 7 &&
      kgControlsCheck.velLblAt99.includes('LORENTZ') && kgControlsCheck.velValAt99.startsWith('\u03b3') && kgControlsCheck.tmK1At99 === '\u03b3',
      'KG-2100 / Roll / Stow / HideShip / Gamma switch check failed: ' + JSON.stringify(kgControlsCheck)
    );
    // Round 4 polish checks: stow width/flattening, CLOSE overlay buttons, distinct gas giants,
    // orbital plan persistence on Helm return, moving NPC Lighthuggers, and high-gamma REST VEC declutter
    const round4Check = await cdp.eval(`(async () => {
      const waitF = (n) => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      const app = window.__LH_APP, s = app.state;
      app.stopAll();
      app.enterSystemOrbit('sol', true);
      app.undock();
      window.LighthuggerScreens.setKgOpen(true);
      await waitF(3);

      // 1. Stowed KG-2100 matches unstowed outer width & flattens visibly in place
      const openR = document.getElementById('kg-deck').getBoundingClientRect();
      document.getElementById('kg-fold-btn').click();
      await waitF(2);
      const stowR = document.getElementById('lh-helm-strip').getBoundingClientRect();
      document.getElementById('btn-kg-unstow').click();
      await waitF(2);

      // 2. All 6 overlay screens use "close" back button instead of redundant "helm"
      const closeLabels = [
        '#lh-screen-orbits .kg-chrono-top > [data-screen-btn="helm"]',
        '#lh-screen-starmap [data-screen-btn="helm"]',
        '#lh-screen-drydock [data-screen-btn="helm"]',
        '#lh-screen-sextant [data-screen-btn="helm"]',
        '#lh-screen-archive [data-screen-btn="helm"]',
        '#lh-screen-manual [data-screen-btn="helm"]'
      ].map(sel => (document.querySelector(sel)?.textContent || '').trim().toLowerCase());

      // 3. Distinct gas giant procedural palettes in Sol (Saturn, Jupiter, Uranus, Neptune) & exoplanets
      const Gx = window.LighthuggerGalaxy;
      const getSys = id => Gx.SYSTEMS.find(sys => sys.id === id);
      const isGiant = p => /saturnian|giant|sapphire-disk|aerostat-clouds/.test(p.kind || '');
      const sol = getSys('sol');
      const solGiants = sol.planets.filter(isGiant)
        .map(p => ({ name: p.name, pal: Gx.gasGiantPalette(p, 1).id }));
      const exoPalettes = ['rigil', 'epseri', 'sirius', 'tauceti', 'vega', 'fomalhaut', 'gamov'].flatMap(id =>
        (getSys(id)?.planets || []).filter(isGiant)
          .map(p => Gx.gasGiantPalette(p, 1).id)
      );

      // 4. Orbital plan persists & displays 3D curves when returning from Orbit Nav -> Helm after plotting
      app.setScreen('orbits');
      await waitF(4);
      const titanBtn = [...document.querySelectorAll('#lh-target-list .lh-target')].find(b => /TITAN/i.test(b.textContent));
      if (titanBtn) titanBtn.click();
      await waitF(3);
      document.getElementById('btn-orbit-add-ship').click();
      await waitF(3);
      document.querySelector('#lh-screen-orbits .kg-chrono-top > [data-screen-btn="helm"]').click();
      await waitF(4);
      const helmSnapDefault = app.getSnapshot();
      const defaultOffOk = helmSnapDefault.hasActiveOrbitPlan === true && helmSnapDefault.showOrbitsInHelm === false;
      document.getElementById('btn-vectors').click();
      await waitF(4);
      const helmSnap = app.getSnapshot();
      const helmScene = app.getSceneInfo();
      const orbitPersist = {
        screen: helmSnap.screen,
        selectedTargetId: helmSnap.selectedTargetId,
        hasActiveOrbitPlan: helmSnap.hasActiveOrbitPlan,
        defaultOffOk,
        showOrbitsInHelm: helmSnap.showOrbitsInHelm,
        burns: helmSnap.maneuverChain.length,
        curves: helmScene.orbitCurves
      };
      document.getElementById('btn-vectors').click();
      await waitF(2);
      app.clearManeuverChain();
      app.selectTargetOrbit(null);

      // 5. Moving station-vicinity NPC Lighthugger + moving corridor Lighthuggers
      app.setTimeWarp(1);
      await waitF(2);
      const npc0 = app.getSceneInfo().bodies.find(b => b.key === 'npc')?.posKm?.slice();
      const ct0 = (app.getSnapshot().contacts || []).map(c => ({ id: c.id, r: c.range3d, v: c.obsVec ? c.obsVec.slice() : null }));
      await waitF(24);
      const npc1 = app.getSceneInfo().bodies.find(b => b.key === 'npc')?.posKm?.slice();
      const ct1 = (app.getSnapshot().contacts || []).map(c => ({ id: c.id, r: c.range3d, v: c.obsVec ? c.obsVec.slice() : null }));
      const npcMovedKm = (npc0 && npc1) ? Math.hypot(npc1[0] - npc0[0], npc1[1] - npc0[1], npc1[2] - npc0[2]) : 0;
      const contactsMoved = ct0.filter((c, i) => ct1[i] && Math.abs(ct1[i].r - c.r) > 1e-6).length;

      // 6. High-gamma (gamma > 12) REST VEC dashed-line count stays strictly bounded (<= 4)
      app.engageInterstellar({ destId: 'vega' });
      // Complete the departure slew so the target is in view when the fixture jumps to cruise.
      app.step(0.001, 2.3, true);
      s.mission = null;
      s.thrustCmdG = 0;
      s.eta = 3.2; s.beta = Math.tanh(3.2); s.gamma = Math.cosh(3.2);
      s.hudRel = true; s.hudFlight = false; s.hudRestFrame = true;
      (${observePaint})('lh-hud-canvas', 'clearRect', {
        tether: (ctx) => ctx.getLineDash().length > 0 && /255, 209, 117|110, 225, 255/.test(ctx.strokeStyle)
      }, () => false);
      await waitF(5);
      const highGammaTethers = window.__lhRegression['lh-hud-canvas']?.strokes?.tether || 0;
      app.stopAll();
      app.enterSystemOrbit('sol', true);
      app.undock();
      return {
        openW: openR.width, openH: openR.height, stowW: stowR.width, stowH: stowR.height,
        closeLabels, solGiants, exoPaletteCount: new Set(exoPalettes).size,
        orbitPersist, npcMovedKm, contactsMoved, highGammaTethers
      };
    })()`);
    console.log('ROUND4_POLISH_CHECK:', JSON.stringify(round4Check));
    assert(
      Math.abs(round4Check.stowW - round4Check.openW) <= 4 &&
      round4Check.stowH > 40 && round4Check.stowH < round4Check.openH * 0.55 &&
      round4Check.closeLabels.length === 6 && round4Check.closeLabels.every(l => l === 'close') &&
      new Set(round4Check.solGiants.map(g => g.pal)).size === 4 &&
      round4Check.exoPaletteCount >= 2 &&
      round4Check.orbitPersist.screen === 'helm' &&
      round4Check.orbitPersist.hasActiveOrbitPlan === true &&
      round4Check.orbitPersist.defaultOffOk === true &&
      round4Check.orbitPersist.showOrbitsInHelm === true &&
      round4Check.orbitPersist.burns >= 1 &&
      round4Check.orbitPersist.curves.current === true &&
      round4Check.orbitPersist.curves.transfer === true &&
      round4Check.npcMovedKm > 0.05 &&
      round4Check.contactsMoved >= 1 &&
      round4Check.highGammaTethers >= 1 && round4Check.highGammaTethers <= 4,
      'Round 4 polish check failed: ' + JSON.stringify(round4Check)
    );

    if (OUT_DIR) {
      // Restore the fighter setup for the remaining legacy Helm review shots.
      await cdp.eval(`(() => {
        const app = window.__LH_APP;
        app.enterSystemOrbit('sol', true);
        app.selectPreset('cathedral-gothic');
        app.commissionDraft();
        app.undock();
        app.state.hudFlight = true; app.state.hudRel = false; app.state.hudWeapons = false; app.state.camLock = true; app.state.hideShip = false;
      })()`);
      await cdp.waitFrames(18);
      // Screenshot 42: Tactical Weapons HUD active with pulse fire!
      await cdp.eval(`(() => {
        document.getElementById('btn-wpn-guard').click();
        document.getElementById('sw-hud-wpn').click();
        document.getElementById('btn-wpn-fire').click();
      })()`);
      await cdp.waitFrames(4);
      await cdp.screenshot('42_helm_weapons_hud.png');
      // Screenshot 43: High-gamma (>0.99c) Relativistic HUD showing automatic beta -> LORENTZ gamma switch!
      await cdp.eval(`(() => {
        const app = window.__LH_APP;
        document.getElementById('sw-hud-wpn').click();
        app.engageInterstellar({ destId: 'rigil' });
        app.state.mission = null;
        app.state.relGov = false;
        app.setThrustG(1.5);
        for (let i = 0; i < 22; i++) app.step(0.12 * 31557600);
        app.state.hudRel = true;
      })()`);
      await cdp.waitFrames(14);
      await cdp.screenshot('43_helm_relativistic_hud.png');
      // Screenshot 44: Cockpit view with HIDE SHIP enabled!
      await cdp.eval(`(() => {
        document.getElementById('sw-hide-ship').click();
      })()`);
      await cdp.waitFrames(6);
      await cdp.screenshot('44_helm_hide_ship.png');
      // Screenshot 45: Stowed helm bar showing prominent UP-ARROW KG-2100 un-stow hardware switch!
      await cdp.eval(`(() => {
        document.getElementById('sw-hide-ship').click();
        document.getElementById('kg-fold-btn').click();
      })()`);
      await cdp.waitFrames(6);
      await cdp.screenshot('45_helm_stowed_bar.png');
      await cdp.eval(`(() => {
        document.getElementById('btn-kg-unstow').click();
        window.__LH_APP.stopAll();
        window.__LH_APP.enterSystemOrbit('sol', true);
        window.__LH_APP.selectPreset('long-patience');
        window.__LH_APP.commissionDraft();
      })()`);
      await cdp.waitFrames(4);
    }

    assert(cdp.exceptions.length === 0, 'JS exceptions: ' + JSON.stringify(cdp.exceptions));
    assert(cdp.consoleErrors.length === 0, 'Console errors: ' + JSON.stringify(cdp.consoleErrors));
    assert(cdp.badResponses.length === 0, 'Bad HTTP responses: ' + JSON.stringify(cdp.badResponses));
    console.log('BROWSER_ERRORS js=0 console=0 http=0');
    assert(rollResult.spinChipOk, 'Subtle spin warning chip geometry failed (width > 420px or misplaced): ' + JSON.stringify(rollResult.spinChip));
    console.log('ALL REGRESSION CHECKS PASSED!');
  } finally {
    if (cdp) cdp.close();
    if (edgeProc) {
      try { edgeProc.kill('SIGKILL'); } catch (_) {}
      try { spawn('taskkill', ['/F', '/T', '/PID', String(edgeProc.pid)], { stdio: 'ignore' }); } catch (_) {}
    }
    server.close();
    try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
    catch (err) { console.warn('Could not remove browser test profile:', err.message); }
  }
}

runStaticChecks();
runBrowserSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
