#!/usr/bin/env node
// Extraction guard. Without arguments it is a PreToolUse hook: Claude may write only inside
// extraction/ and may run no shell command except this script. With an argument it is a CLI:
//   snapshot  record size + mtime of every file outside extraction/ (once; kept on resume)
//   verify    compare against the snapshot, list changes, exit 1 if any
//   clean-out delete extraction/out (used by /extract-spec redraft)
const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const OUT = path.join(ROOT, 'extraction');
const BASELINE = path.join(OUT, '.baseline.json');
const SKIP_NAMES = new Set(['.git', 'node_modules']);
const SKIP_PATHS = new Set([OUT, path.join(ROOT, '.claude', 'settings.local.json')]);
const SELF = 'node .claude/hooks/extraction-guard.js';

const norm = p => {
  const r = path.resolve(ROOT, p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
};
const insideOut = p => {
  const r = norm(p), o = norm(OUT);
  return r === o || r.startsWith(o + path.sep);
};

function fingerprint() {
  const files = {};
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (SKIP_NAMES.has(e.name) || SKIP_PATHS.has(full)) continue;
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) {
        const s = fs.statSync(full);
        files[path.relative(ROOT, full)] = `${s.size}:${Math.round(s.mtimeMs)}`;
      }
    }
  };
  walk(ROOT);
  return files;
}

function block(msg) {
  process.stderr.write(`extraction guard: ${msg}\n`);
  process.exit(2);
}

const cmd = process.argv[2];

if (cmd === 'snapshot') {
  fs.mkdirSync(OUT, { recursive: true });
  if (fs.existsSync(BASELINE)) {
    console.log('snapshot: baseline already exists, kept');
  } else {
    const files = fingerprint();
    fs.writeFileSync(BASELINE, JSON.stringify(files));
    console.log(`snapshot: ${Object.keys(files).length} files recorded`);
  }
} else if (cmd === 'verify') {
  if (!fs.existsSync(BASELINE)) { console.log('verify: no baseline, run snapshot first'); process.exit(1); }
  const before = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const after = fingerprint();
  const changed = [];
  for (const f of Object.keys(before)) {
    if (!(f in after)) changed.push(`removed  ${f}`);
    else if (before[f] !== after[f]) changed.push(`modified ${f}`);
  }
  for (const f of Object.keys(after)) if (!(f in before)) changed.push(`added    ${f}`);
  if (changed.length) { console.log(`verify: ${changed.length} change(s) outside extraction/`); console.log(changed.join('\n')); process.exit(1); }
  console.log(`verify: OK, ${Object.keys(after).length} files unchanged outside extraction/`);
} else if (cmd === 'clean-out') {
  fs.rmSync(path.join(OUT, 'out'), { recursive: true, force: true });
  console.log('clean-out: extraction/out removed');
} else {
  let raw = '';
  process.stdin.on('data', d => { raw += d; }).on('end', () => {
    const { tool_name, tool_input = {} } = JSON.parse(raw || '{}');
    if (tool_name === 'Bash') {
      const command = (tool_input.command || '').trim();
      if (['snapshot', 'verify', 'clean-out'].some(a => command === `${SELF} ${a}`)) process.exit(0);
      block(`shell commands are blocked during extraction (got: ${command})`);
    }
    const target = tool_input.file_path || tool_input.notebook_path;
    if (target && insideOut(target)) process.exit(0);
    block(`writes are allowed only inside extraction/ (got: ${target})`);
  });
}
