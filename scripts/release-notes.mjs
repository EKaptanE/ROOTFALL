// Prints the GitHub release text for one version: how to install, then that version's
// section of CHANGELOG.md, then the installer's SHA-256.
// Usage: node scripts/release-notes.mjs <version> <installer path>
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const [version, installer] = process.argv.slice(2);
if (!version || !installer) {
  console.error('usage: node scripts/release-notes.mjs <version> <installer path>');
  process.exit(1);
}
const tag = `v${version.replace(/\.0$/, '')}`;
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const start = changelog.split('\n').findIndex((l) => l.startsWith(`## ${tag} `) || l.trim() === `## ${tag}`);
if (start < 0) {
  console.error(`CHANGELOG.md has no "## ${tag}" section. Add one before releasing.`);
  process.exit(1);
}
const rest = changelog.split('\n').slice(start + 1);
const end = rest.findIndex((l) => l.startsWith('## '));
const section = rest.slice(0, end < 0 ? undefined : end).join('\n').trim();
const sha = createHash('sha256').update(readFileSync(installer)).digest('hex');

console.log(`**Play:** download \`${basename(installer)}\` below and run it. The installer is not code-signed, so Windows may show "Windows protected your PC": choose **More info → Run anyway**.

${section}

SHA-256 of the installer: \`${sha}\``);
