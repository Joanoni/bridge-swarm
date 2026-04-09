const fs = require('fs');
const { resolveSafe } = require('../utils');

const definition = {
    name: 'read_file',
    description: 'Reads the text content of one or more files. Accepts absolute paths or paths relative to the workspace root. Returns an array of results, one per file.',
    parameters: {
        type: 'object',
        properties: {
            message: { type: 'string', description: 'Brief note about why you are reading these files (shown in chat).' },
            file_paths: {
                type: 'array',
                items: { type: 'string' },
                description: 'An array of file paths to read.',
            },
        },
        required: ['file_paths'],
    },
};

async function execute({ file_paths, message }, { allowedPaths, workspaceRoot }) {
    if (typeof file_paths === 'string') { try { file_paths = JSON.parse(file_paths); } catch { /* ignore */ } }
    const pathList = Array.isArray(file_paths) ? file_paths : (file_paths ? [file_paths] : []);
    const results = [];
    for (const file_path of pathList) {
        const { resolved, ok, error } = resolveSafe(file_path, allowedPaths, workspaceRoot);
        if (!ok) { results.push({ file_path, ok: false, error }); continue; }
        try {
            const content = fs.readFileSync(resolved, 'utf8');
            results.push({ file_path, ok: true, content });
        } catch (err) {
            results.push({ file_path, ok: false, error: err.message });
        }
    }
    return { ok: true, results };
}

function toMessage({ file_paths, message }, _result, agentId) {
    const list = Array.isArray(file_paths) ? file_paths : (file_paths ? [file_paths] : []);
    const note = message ? `${message}\n` : '';
    return `[${agentId}] 📄 ${note}read: ${list.join(', ')}`;
}

module.exports = { definition, execute, toMessage };
