// Headless check of ROOTFALL game logic: loads the inline <script> with a fake DOM,
// validates the puzzle catalog and plays full runs for every difficulty.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const htmlPath = process.argv[2] || path.join(__dirname, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const out = [];
const el = () => ({
  textContent: '', innerHTML: '', className: '', placeholder: '', value: '', scrollTop: 0, scrollHeight: 0,
  classList: { add() {}, remove() {} }, style: {},
  appendChild(c) { out.push(c.innerHTML || c.textContent || ''); }, focus() {}, addEventListener() {},
  set onclick(f) {}, querySelector() { return el(); }
});
const els = {};
const store = {};
const ctx = {
  document: {
    getElementById: id => (els[id] = els[id] || el()), createElement: el,
    addEventListener() {}, body: el()
  },
  window: { addEventListener() {}, AudioContext: undefined, webkitAudioContext: undefined },
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
  setTimeout: (f) => f(), clearTimeout() {}, setInterval: () => 1, clearInterval() {},
  confirm: () => true, console, Math, Date, JSON
};

const api = new Function(...Object.keys(ctx), js + `
  return { CATEGORIES, DIFFICULTY_CONFIG, KEY_WORDS, handleCommand, typewriterCancel: () => typewriterCancel,
           get state() { return currentState; }, get stages() { return activeStages; },
           get keys() { return collectedFragments; }, get total() { return totalTime; },
           get remaining() { return timeRemaining; }, initBootSequence, getLeaderboard };`)(...Object.values(ctx));

// 1. Catalog shape: 6 categories x 3 difficulties x 7 questions, unique ids
assert.strictEqual(api.CATEGORIES.length, 6);
const ids = new Set();
for (const cat of api.CATEGORIES) {
  for (const d of ['KOLAY', 'ORTA', 'ZOR']) {
    assert.strictEqual(cat.Q[d].length, 7, `${cat.id} ${d}`);
    for (const q of cat.Q[d]) {
      assert(!ids.has(q.id), 'duplicate id ' + q.id); ids.add(q.id);
      assert(q.a.length && q.text && q.hint, q.id);
      // The question must not accept its own input echoed back (e.g. "0x1A" for "0x1A = ?")
      const qtoks = q.text.toUpperCase().match(/[0-9A-FX]{2,}/g) || [];
      for (const ans of q.a) assert(!qtoks.includes(ans) || /\d/.test(ans) === false, `echo answer ${ans} in ${q.id}`);
      // No answer leaks: words (3+ letters) must not appear in question/hint/guide
      for (const ans of q.a) {
        if (/^[A-Z]{3,}$/.test(ans)) {
          const blob = (q.text + ' ' + q.hint + ' ' + (q.guide || []).join(' ')).toUpperCase();
          assert(!new RegExp(`\\b${ans}\\b`).test(blob), `answer ${ans} leaks in ${q.id}`);
        }
      }
    }
  }
}
assert.strictEqual(ids.size, 126);
assert.strictEqual(api.CATEGORIES[0].Q.KOLAY[0].text.endsWith('X L W V'), true, 'atbash CODE');
assert(api.CATEGORIES[0].Q.ZOR[0].text.endsWith('K H O O R'), 'caesar HELLO+3');
assert.deepStrictEqual(Object.values(api.DIFFICULTY_CONFIG).map(c => c.time), [60, 75, 90]);

// 2. Full runs per difficulty, wrong answer then right answer, master key penalty, victory
const finish = () => { if (api.typewriterCancel()) api.typewriterCancel()(); };
let prevIds = null;
for (const [choice, diff, time] of [['1', 'KOLAY', 60], ['2', 'ORTA', 75], ['zor', 'ZOR', 90], ['3', 'ZOR', 90]]) {
  api.initBootSequence(); finish();
  assert.strictEqual(api.state, 'AWAIT_NAME');
  api.handleCommand('Tester');
  assert.strictEqual(api.state, 'AWAIT_DIFFICULTY');
  api.handleCommand('9');
  assert.strictEqual(api.state, 'AWAIT_DIFFICULTY');
  api.handleCommand(choice);
  assert.strictEqual(api.total, time);
  const stages = api.stages;
  assert.strictEqual(new Set(stages.map(s => s.cat.id)).size, 3, 'distinct categories');
  stages.forEach(s => assert(s.cat.Q[diff].includes(s.q), 'question matches difficulty'));
  const runIds = stages.map(s => s.q.id);
  if (prevIds) runIds.forEach(id => assert(!prevIds.includes(id), 'repeat question ' + id));
  prevIds = runIds;
  const cost = api.DIFFICULTY_CONFIG[diff].skipCost;
  // Stage 1: skip is locked until hint, then costs time and still grants the key
  api.handleCommand('skip');
  assert.strictEqual(api.keys.length, 0, 'skip locked before hint');
  api.handleCommand('hint');
  api.handleCommand('skip');
  assert.strictEqual(api.keys.length, 1, 'skip grants key');
  assert.strictEqual(api.remaining, time - cost, 'skip cost');
  // Stage 2: hint was for stage 1, so skip must be locked again
  api.handleCommand('skip');
  assert.strictEqual(api.keys.length, 1, 'skip re-locked on new stage');
  for (const s of stages.slice(1)) {
    api.handleCommand('definitely-wrong');
    assert.strictEqual(api.state, 'STAGE');
    api.handleCommand(s.q.a[0].toLowerCase());
  }
  assert.strictEqual(api.state, 'MASTER_KEY');
  api.handleCommand(api.keys.join(''));
  assert.strictEqual(api.remaining, time - cost - 5, '-5s penalty');
  api.handleCommand(api.keys.join('-').toLowerCase());
  assert.strictEqual(api.state, 'VICTORY');
}
assert.strictEqual(api.getLeaderboard('ZOR').length, 2);
assert.strictEqual(api.getLeaderboard('KOLAY').length, 1);
assert(!out.join('\n').includes('->'), 'no difficulty order shown');

console.log('sim ok');
