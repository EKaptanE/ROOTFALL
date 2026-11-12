// Exports the game content (difficulties, key words, 126 questions) from reference/index.html
// to content/rootfall-content.json, so a new app can load it without parsing HTML.
// Usage: node reference/export_content.js --force
// NOTE: since v8 the JSON is the source of truth and has edits the reference lacks (penalties, CB-H3).
// Running this overwrites them, so it refuses to run without --force.
if (!process.argv.includes('--force')) {
  console.error('content/rootfall-content.json is now edited by hand. Re-run with --force to overwrite it from the v7 reference.');
  process.exit(1);
}
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const el = () => ({ classList: { add() {}, remove() {} }, style: {}, appendChild() {}, addEventListener() {}, focus() {}, querySelector: el });
const ctx = {
  document: { getElementById: el, createElement: el, addEventListener() {}, body: el() },
  window: { addEventListener() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  setTimeout() {}, setInterval() {}, clearInterval() {}, confirm: () => true
};
const { CATEGORIES, DIFFICULTY_CONFIG, KEY_WORDS } = new Function(...Object.keys(ctx),
  js + '\nreturn { CATEGORIES, DIFFICULTY_CONFIG, KEY_WORDS };')(...Object.values(ctx));

const content = {
  schemaVersion: 1,
  source: "ROOTFALL v7.0 reference/index.html",
  notes: {
    answers: "Accepted answers. Compare after normalizing: uppercase, strip whitespace and quotes (' \" `).",
    difficulties: "time = total seconds per run; skipCost = seconds lost when skipping a question (unlocked after hint).",
    timerAlerts: "Alerts at 60% / 40% / 20% of total time remaining; heartbeat tick during the last 20%.",
    masterKeyPenalty: 5
  },
  difficulties: Object.fromEntries(Object.entries(DIFFICULTY_CONFIG).map(([k, v]) => [k, { time: v.time, skipCost: v.skipCost }])),
  keyWords: KEY_WORDS,
  categories: CATEGORIES.map(c => ({
    id: c.id, icon: c.icon, title: c.title, inputPlaceholder: c.placeholder,
    questions: Object.fromEntries(Object.entries(c.Q).map(([diff, list]) => [diff, list.map(q => ({
      id: q.id, text: q.text, answers: q.a, hint: q.hint,
      ...(q.guide ? { guide: q.guide } : {}),
      ...(q.code ? { lang: q.lang, code: q.code } : {})
    }))]))
  }))
};

const out = path.join(__dirname, '..', 'content', 'rootfall-content.json');
fs.writeFileSync(out, JSON.stringify(content, null, 2) + '\n');
const n = content.categories.reduce((s, c) => s + Object.values(c.questions).flat().length, 0);
console.log(`wrote ${out} (${n} questions)`);
