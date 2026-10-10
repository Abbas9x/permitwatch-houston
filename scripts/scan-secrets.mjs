#!/usr/bin/env node
/**
 * Pre-push secret scan. Checks every file git would commit (tracked + untracked, not ignored)
 * for credential patterns and for the literal value of GEMINI_API_KEY from a local .env.
 * Prints file:line only, never the secret itself. Exit code 1 on any finding.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const PATTERNS = [
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Private key block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  [
    'Hard-coded credential assignment',
    /\b(?:api[_-]?key|secret|access[_-]?token|password)\b\s*[:=]\s*["'][A-Za-z0-9_\-/+=]{16,}["']/i,
  ],
];

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .map((f) => f.trim())
  .filter(Boolean);

let localKey;
if (existsSync('.env')) {
  const match = /^GEMINI_API_KEY=(.+)$/m.exec(readFileSync('.env', 'utf8'));
  if (match && match[1].trim().length >= 20) localKey = match[1].trim();
}

const findings = [];
for (const file of files) {
  if (/^\.env($|\.)/.test(file) && file !== '.env.example') {
    findings.push(`${file}: environment file would be committed`);
    continue;
  }
  if (!existsSync(file) || statSync(file).size > 2_000_000) continue;
  const text = readFileSync(file, 'utf8');
  if (text.includes('\u0000')) continue; // binary
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const [name, pattern] of PATTERNS) {
      if (pattern.test(line)) findings.push(`${file}:${i + 1}: possible ${name}`);
    }
    if (localKey && line.includes(localKey)) findings.push(`${file}:${i + 1}: contains the GEMINI_API_KEY value from .env`);
  });
}

if (findings.length > 0) {
  console.error(`Secret scan FAILED (${findings.length} finding(s)):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.warn(`Secret scan passed: ${files.length} files checked, no secrets found.`);
