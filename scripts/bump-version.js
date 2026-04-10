#!/usr/bin/env node
/**
 * bump-version.js
 * Increments the patch version in package.json and writes public/version.json
 * with the new version and the current timestamp.
 * Run automatically by the git pre-commit hook.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const root       = path.resolve(__dirname, '..');
const pkgPath    = path.join(root, 'package.json');
const versionOut = path.join(root, 'public', 'version.json');

// ── Bump patch in package.json ────────────────────────────────────────────────
const pkg     = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const parts   = (pkg.version || '1.0.0').split('.').map(Number);
parts[2]      = (parts[2] || 0) + 1;
pkg.version   = parts.join('.');
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + '\n', 'utf8');

// ── Write public/version.json ─────────────────────────────────────────────────
const now = new Date();
const versionInfo = {
    version:   pkg.version,
    timestamp: now.toISOString(),
};
fs.writeFileSync(versionOut, JSON.stringify(versionInfo, null, 2) + '\n', 'utf8');

console.log(`[bump-version] ${pkg.version} @ ${now.toISOString()}`);
