const fs = require('fs');
const { resolveSafe } = require('../utils');

const definition = {
    name: 'list_directory',
    description: 'Lists the entries (files and subdirectories) of a directory.',
    parameters: {
        type: 'object',
        properties: {
            message: { type: 'string', description: 'Brief note about why you are listing this directory (shown in chat).' },
            dir_path: { type: 'string', description: 'The path to the directory to list.' },
        },
        required: ['dir_path'],
    },
};

async function execute({ dir_path, message }, { allowedPaths, workspaceRoot }) {
    const { resolved, ok, error } = resolveSafe(dir_path, allowedPaths, workspaceRoot);
    if (!ok) return { ok: false, error };
    try {
        const entries = fs.readdirSync(resolved, { withFileTypes: true }).map(entry => ({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
        }));
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
