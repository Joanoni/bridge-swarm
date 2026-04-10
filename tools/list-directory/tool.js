const fs = require('fs');
const path = require('path');
const { resolveSafe } = require('../utils');

const definition = {
    name: 'list_directory',
    description: 'Lists the entries (files and subdirectories) of a directory, optionally recursively.',
    parameters: {
        type: 'object',
        properties: {
            message: {
                type: 'string',
                description: 'Brief note about why you are listing this directory (shown in chat).',
            },
            dir_path: {
                type: 'string',
                description: 'The path to the directory to list.',
            },
            recursive: {
                type: 'boolean',
                description: 'If true, lists all entries recursively. Default: false.',
            },
        },
        required: ['dir_path'],
    },
};

function listEntries(dirResolved, rootResolved, recursive) {
    const entries = [];
    const items = fs.readdirSync(dirResolved, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dirResolved, item.name);
        const relPath = path.relative(rootResolved, fullPath).replace(/\\/g, '/');
        const isDir = item.isDirectory();
        const entry = {
            name: item.name,
            path: relPath,
            type: isDir ? 'directory' : 'file',
        };
        if (!isDir) {
            try {
                const stat = fs.statSync(fullPath);
                entry.size_bytes = stat.size;
                entry.mtime = stat.mtime.toISOString();
            } catch { /* ignore */ }
        } else {
            try {
                const stat = fs.statSync(fullPath);
                entry.mtime = stat.mtime.toISOString();
            } catch { /* ignore */ }
        }
        entries.push(entry);
        if (recursive && isDir) {
            const children = listEntries(fullPath, rootResolved, true);
            entries.push(...children);
        }
    }
    return entries;
}

async function execute({ dir_path, message, recursive = false }, { allowedPaths, workspaceRoot }) {
    const { resolved, ok, error } = resolveSafe(dir_path, allowedPaths, workspaceRoot);
    if (!ok) return { ok: false, error };
    try {
        const entries = listEntries(resolved, resolved, recursive);
        return { ok: true, entries };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

function toMessage({ dir_path, message }, _result, agentId) {
    const note = message ? `${message}\n` : '';
    return `[${agentId}] 📁 ${note}ls: ${dir_path}`;
}

module.exports = { definition, execute, toMessage };
