const fs = require('fs');
const path = require('path');
const { resolveSafe } = require('../utils');

const SUPPORTED_TYPES = {
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.webp': 'image/webp',
};

const definition = {
    name: 'read_binary_file',
    description: 'Reads one or more binary files (images) and returns them as base64 so the model can visualize them. Supported formats: PNG, JPEG, GIF, WEBP.',
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
        const ext = path.extname(resolved).toLowerCase();
        const media_type = SUPPORTED_TYPES[ext];
        if (!media_type) {
            results.push({ file_path, ok: false, error: `Unsupported file type "${ext}". Supported: ${Object.keys(SUPPORTED_TYPES).join(', ')}` });
            continue;
        }
        try {
            const buffer = fs.readFileSync(resolved);
            const data = buffer.toString('base64');
            results.push({ file_path, ok: true, type: 'image', media_type, data });
        } catch (err) {
            results.push({ file_path, ok: false, error: err.message });
        }
    }
    return { ok: true, results };
}

function toMessage({ file_paths, message }, _result, agentId) {
    const list = Array.isArray(file_paths) ? file_paths : (file_paths ? [file_paths] : []);
    const note = message ? `${message}\n` : '';
    return `[${agentId}] 🖼️ ${note}read binary: ${list.join(', ')}`;
}

module.exports = { definition, execute, toMessage };
