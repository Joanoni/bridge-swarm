const fs = require('fs');
const path = require('path');
const { resolveSafe } = require('../utils');

const definition = {
    name: 'write_file',
    description: 'Writes (or overwrites) text content to one or more files. Automatically creates the full directory path. Accepts absolute paths or paths relative to the workspace root.',
    parameters: {
        type: 'object',
        properties: {
            message: { type: 'string', description: 'Brief note about what you are writing (shown in chat).' },
            files: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        file_path: { type: 'string', description: 'The path to the file to write.' },
                        content: { type: 'string', description: 'The text content to write.' },
                    },
                    required: ['file_path', 'content'],
                },
                description: 'An array of files to write.',
            },
        },
        required: ['files'],
    },
};

async function execute({ files, message }, { allowedPaths, workspaceRoot }) {
    if (typeof files === 'string') { try { files = JSON.parse(files); } catch { /* ignore */ } }
    const fileList = Array.isArray(files) ? files : (files ? [files] : []);
    const results = [];
    for (const { file_path, content } of fileList) {
        const { resolved, ok, error } = resolveSafe(file_path, allowedPaths, workspaceRoot);
        if (!ok) { results.push({ file_path, ok: false, error }); continue; }
        try {
            fs.mkdirSync(path.dirname(resolved), { recursive: true });
            fs.writeFileSync(resolved, content, 'utf8');
            results.push({ file_path, ok: true });
        } catch (err) {
            results.push({ file_path, ok: false, error: err.message });
        }
    }
    return { ok: true, results };
}

function toMessage({ files, message }, _result, agentId) {
    const list = Array.isArray(files) ? files : (files ? [files] : []);
    const note = message ? `${message}\n` : '';
    return `[${agentId}] ✍️ ${note}write: ${list.map(f => f.file_path).join(', ')}`;
}

module.exports = { definition, execute, toMessage };
