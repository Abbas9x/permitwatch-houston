#!/usr/bin/env node
/**
 * Pre-push secret scan. Checks source, untracked files, ignored environment files,
 * and generated output for credential patterns. Dependency and Git internals are excluded.
 * Prints file:line only, never the secret itself. Exit code 1 on any finding.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const PATTERNS = [
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['Private key block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  [
    'Hard-coded credential assignment',
    /\b(?:api[_-]?key|secret|access[_-]?token|password)\b\s*[:=]\s*["'][A-Za-z0-9_\-/+=]{16,}["']/i,
  ],
];

const tracked = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\0').filter(Boolean);
function walk(directory = '.') {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walk(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}
const files = [...new Set([...tracked, ...walk()])].sort();
const credentialValues = [];
for (const file of files.filter(f => /^\.env(?:$|\.)/.test(basename(f)) && basename(f) !== '.env.example')) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)\s*=\s*(.*?)\s*$/i.exec(line);
    if (!match) continue;
    const value = match[2].replace(/^['"]|['"]$/g, '');
    if (value.length >= 20 && !/^(?:your_|replace|placeholder|example|test_)/i.test(value)) credentialValues.push(value);
  }
}

const findings = [];
for (const file of files) {
  if (tracked.includes(file) && /^\.env($|\.)/.test(basename(file)) && basename(file) !== '.env.example') {
    findings.push(`${file}: environment file would be committed`);
    continue;
  }
  if (!existsSync(file)) continue;
  const text = readFileSync(file, 'utf8');
  if (text.includes('\u0000')) continue; // binary
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const [name, pattern] of PATTERNS) {
      if (pattern.test(line)) findings.push(`${file}:${i + 1}: possible ${name}`);
    }
    if (credentialValues.some(value => line.includes(value))) findings.push(`${file}:${i + 1}: contains a local environment credential`);
  });
}

if (findings.length > 0) {
  console.error(`Secret scan FAILED (${findings.length} finding(s)):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.warn(`Secret scan passed: ${files.length} files checked, no secrets found.`);
