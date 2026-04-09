const fs = require('fs');
const { resolveSafe } = require('../utils');

const definition = {
    name: 'edit_file',
    description: 'Edits one or more files using search/replace operations. Each edit replaces occurrences of an exact search string with a replacement. count: 1=first only, N=first N, -1=all.',
    parameters: {
        type: 'object',
        properties: {
            message: { type: 'string', description: 'Brief note about what you are editing (shown in chat).' },
            files: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        file_path: { type: 'string' },
                        edits: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    search: { type: 'string' },
                                    replace: { type: 'string' },
                                    count: { type: 'number' },
                                },
                                required: ['search', 'replace', 'count'],
                            },
                        },
                    },
                    required: ['file_path', 'edits'],
                },
            },
        },
        required: ['files'],
    },
};

async function execute({ files, message }, { allowedPaths, workspaceRoot }) {
    if (typeof files === 'string') { try { files = JSON.parse(files); } catch { /* ignore */ } }
    const fileList = Array.isArray(files) ? files : (files ? [files] : []);
    const results = [];
    for (const { file_path, edits } of fileList) {
        const { resolved, ok, error } = resolveSafe(file_path, allowedPaths, workspaceRoot);
        if (!ok) { results.push({ file_path, ok: false, error }); continue; }
        try {
            let content = fs.readFileSync(resolved, 'utf8');
            let editError = null;
            for (const { search, replace, count } of edits) {
                const limit = count === -1 ? Infinity : count;
                let applied = 0;
                let result = '';
                let remaining = content;
                while (applied < limit) {
                    const idx = remaining.indexOf(search);
                    if (idx === -1) break;
                    result += remaining.slice(0, idx) + replace;
                    remaining = remaining.slice(idx + search.length);
                    applied++;
                }
                result += remaining;
                if (applied === 0) { editError = `Search string not found: "${search}"`; break; }
                content = result;
            }
            if (editError) {
                results.push({ file_path, ok: false, error: editError });
            } else {
                fs.writeFileSync(resolved, content, 'utf8');
                results.push({ file_path, ok: true });
            }
        } catch (err) {
            results.push({ file_path, ok: false, error: err.message });
        }
    }
    return { ok: true, results };
}

function toMessage({ files, message }, _result, agentId) {
    const list = Array.isArray(files) ? files : (files ? [files] : []);
    const note = message ? `${message}\n` : '';
    return `[${agentId}] ✏️ ${note}edit: ${list.map(f => f.file_path).join(', ')}`;
}

module.exports = { definition, execute, toMessage };
