#!/usr/bin/env node
/**
 * Negative test for npm install-script restrictions, run with the npm version CI actually uses.
 *
 * Builds three synthetic local packages whose postinstall script writes a marker file, then
 * installs each into a scratch project that uses this repository's .npmrc:
 *   1. unreviewed — not mentioned in allowScripts: its script must NOT run (and, with
 *      strict-allow-scripts, the install must fail);
 *   2. denied     — allowScripts entry `false`: the install succeeds and the script must NOT run;
 *   3. approved   — allowScripts entry `true`: the script MUST run (a positive control proving
 *      the markers work and that scripts are blocked by the policy, not disabled outright).
 * Finally it lists this repository's install scripts not covered by allowScripts (must be none).
 *
 * Synthetic packages only, installed from local tarballs with --offline: no registry access,
 * no repository dependencies, no credentials. Exits non-zero if enforcement isn't demonstrated.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = resolve(process.cwd());
const summary = process.env.GITHUB_STEP_SUMMARY;
const MIN = [11, 16, 0];

const npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
const ver = npmVersion.split('.').map(Number);
const supported = ver[0] > MIN[0] || (ver[0] === MIN[0] && (ver[1] > MIN[1] || (ver[1] === MIN[1] && ver[2] >= MIN[2])));

const root = mkdtempSync(join(tmpdir(), 'install-scripts-probe-'));
const markers = join(root, 'markers');
mkdirSync(markers);

/** A synthetic package whose postinstall writes markers/<name>.ran. Returns its tarball path. */
function makePackage(name) {
  const dir = join(root, 'src', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      license: 'UNLICENSED',
      scripts: { postinstall: `node -e "require('fs').writeFileSync(require('path').join(process.env.PROBE_MARKERS, '${name}.ran'), 'ran')"` },
    }),
  );
  writeFileSync(join(dir, 'index.js'), 'module.exports = 1;\n');
  const file = execFileSync('npm', ['pack', '--silent', '--pack-destination', root], { cwd: dir, encoding: 'utf8' }).trim().split('\n').pop();
  return join(root, file);
}

function install(caseName, pkgName, allowScripts) {
  const tarball = makePackage(pkgName);
  const dir = join(root, 'case', caseName);
  mkdirSync(dir, { recursive: true });
  const project = { name: `probe-${caseName}`, version: '1.0.0', private: true, dependencies: { [pkgName]: `file:${tarball}` } };
  if (allowScripts) project.allowScripts = allowScripts;
  writeFileSync(join(dir, 'package.json'), JSON.stringify(project, null, 2));
  if (existsSync(join(repo, '.npmrc'))) copyFileSync(join(repo, '.npmrc'), join(dir, '.npmrc'));
  const r = spawnSync('npm', ['install', '--offline', '--no-audit', '--no-fund'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, PROBE_MARKERS: markers, npm_config_cache: join(root, 'cache') },
  });
  const ran = existsSync(join(markers, `${pkgName}.ran`));
  const output = `${r.stdout}\n${r.stderr}`.trim();
  return { caseName, exit: r.status, ran, output };
}

const results = [];
const expect = [];
if (!supported) {
  expect.push(`npm ${npmVersion} predates allowScripts enforcement (needs ${MIN.join('.')}+)`);
} else {
  const unreviewed = install('unreviewed', 'pp-probe-unreviewed');
  const denied = install('denied', 'pp-probe-denied', { 'pp-probe-denied': false });
  const approved = install('approved', 'pp-probe-approved', { 'pp-probe-approved': true });
  results.push(unreviewed, denied, approved);
  if (unreviewed.ran) expect.push('unreviewed: the install script RAN');
  if (unreviewed.exit === 0) expect.push('unreviewed: install succeeded; strict-allow-scripts should fail it');
  if (denied.ran) expect.push('denied: the install script RAN');
  if (denied.exit !== 0) expect.push(`denied: install failed (exit ${denied.exit})`);
  if (!approved.ran) expect.push('approved: the install script did not run (positive control failed)');
  if (approved.exit !== 0) expect.push(`approved: install failed (exit ${approved.exit})`);
}

// This repository: no installed package may have install scripts outside allowScripts.
const ls = spawnSync('npm', ['install-scripts', 'ls'], { cwd: repo, encoding: 'utf8' });
const lsOut = `${ls.stdout}${ls.stderr}`.trim();
const npmrc = existsSync(join(repo, '.npmrc')) ? readFileSync(join(repo, '.npmrc'), 'utf8').trim() : '(none)';
const policy = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).allowScripts ?? {};

const lines = [
  '## Install-script restrictions (negative test)',
  '',
  `npm ${npmVersion} · .npmrc: \`${npmrc.replace(/\n/g, '; ')}\` · allowScripts: \`${JSON.stringify(policy)}\``,
  '',
  '| Synthetic package | allowScripts | npm exit | postinstall ran? | Expected |',
  '|---|---|---|---|---|',
  ...results.map((r) => {
    const entry = { unreviewed: '(absent)', denied: 'false', approved: 'true' }[r.caseName];
    const want = r.caseName === 'approved' ? 'runs' : r.caseName === 'denied' ? 'install ok, no run' : 'install fails, no run';
    return `| pp-probe-${r.caseName} | ${entry} | ${r.exit} | ${r.ran ? 'yes' : 'no'} | ${want} |`;
  }),
  '',
  `\`npm install-scripts ls\` (exit ${ls.status}): ${lsOut ? `\n\n\`\`\`\n${lsOut}\n\`\`\`` : 'no output'}`,
  '',
  expect.length ? `**Enforcement NOT demonstrated:**\n${expect.map((e) => `- ${e}`).join('\n')}` : '**Enforcement demonstrated:** unreviewed and denied install scripts did not run; the approved control did.',
];
for (const r of results) console.log(`--- ${r.caseName} (exit ${r.exit}, ran=${r.ran})\n${r.output}`);
console.log(lines.join('\n'));
if (summary) appendFileSync(summary, `${lines.join('\n')}\n`);
rmSync(root, { recursive: true, force: true });
process.exit(expect.length ? 1 : 0);
