#!/usr/bin/env node
/**
 * Non-blocking production dependency audit report (`npm audit --omit=dev`).
 *
 * Writes a summary of advisories by severity, the affected packages and npm's suggested
 * remediation. It never installs or upgrades anything. Exit codes are for visibility only
 * (the workflow step is continue-on-error): 0 = audit ran and found nothing,
 * 1 = advisories found, 2 = the audit could not be completed. An unavailable audit is
 * reported as UNAVAILABLE, never as clean.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const summary = process.env.GITHUB_STEP_SUMMARY;
const r = spawnSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const out = (msg) => {
  console.log(msg);
  if (summary) appendFileSync(summary, `${msg}\n`);
};

let report;
try {
  report = JSON.parse(r.stdout);
} catch {
  report = undefined;
}
const meta = report?.metadata?.vulnerabilities;
if (!report || report.error || !meta) {
  out('## Production dependency audit: UNAVAILABLE');
  out('');
  out(`\`npm audit --omit=dev\` did not complete (exit ${r.status}). This is **not** a clean result.`);
  const detail = report?.error ? `${report.error.code ?? ''} ${report.error.summary ?? ''}`.trim() : (r.stderr || '').trim().split('\n').slice(-5).join('\n');
  if (detail) out(`\n\`\`\`\n${detail}\n\`\`\``);
  process.exit(2);
}

const order = ['critical', 'high', 'moderate', 'low', 'info'];
const total = order.reduce((n, k) => n + (meta[k] ?? 0), 0);
const deps = report.metadata.dependencies?.prod ?? report.metadata.dependencies?.total ?? '?';
out(`## Production dependency audit: ${total ? `${total} advisor${total === 1 ? 'y' : 'ies'}` : 'no known advisories'}`);
out('');
out(`npm audit --omit=dev · ${deps} production dependencies scanned · ${order.map((k) => `${k} ${meta[k] ?? 0}`).join(' · ')}`);
if (total) {
  out('');
  out('| Package | Severity | Direct? | Advisories | Affected range | Fix available |');
  out('|---|---|---|---|---|---|');
  for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
    const advisories = (v.via ?? []).map((x) => (typeof x === 'string' ? `via ${x}` : `${x.title ?? ''}${x.url ? ` (${x.url})` : ''}`)).join('; ');
    const fix = v.fixAvailable === true ? 'yes (`npm audit fix`)' : v.fixAvailable ? `yes: ${v.fixAvailable.name}@${v.fixAvailable.version}${v.fixAvailable.isSemVerMajor ? ' (semver-major)' : ''}` : 'no';
    out(`| ${name} | ${v.severity} | ${v.isDirect ? 'yes' : 'no'} | ${advisories} | ${v.range ?? ''} | ${fix} |`);
  }
  out('');
  out('Nothing was upgraded. Remediation is a separate, reviewed dependency change.');
}
process.exit(total ? 1 : 0);
