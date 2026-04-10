const fs = require('fs');
const path = require('path');
const { resolveSafe } = require('../utils');

let sharp;
try { sharp = require('sharp'); } catch { sharp = null; }

const IMAGE_EXTS  = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const SVG_EXTS    = new Set(['.svg']);
const PDF_EXTS    = new Set(['.pdf']);
const TEXT_EXTS   = new Set([
    '.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.json', '.yaml', '.yml',
    '.toml', '.xml', '.html', '.htm', '.css', '.scss', '.sass', '.less',
    '.csv', '.env', '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
    '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp',
    '.cs', '.php', '.swift', '.kt', '.sql', '.graphql', '.proto',
    '.ini', '.cfg', '.conf', '.log',
]);
const ARCHIVE_EXTS = new Set(['.zip', '.tar', '.gz', '.rar', '.7z']);
const MEDIA_EXTS   = new Set(['.mp4', '.mov', '.avi', '.mkv', '.mp3', '.wav', '.ogg', '.flac']);
const EXEC_EXTS    = new Set(['.exe', '.dll', '.so', '.bin']);

const MAX_BYTES = 4.3 * 1024 * 1024; // 4.3 MB — safety margin

function mbStr(bytes) {
    return (bytes / (1024 * 1024)).toFixed(2);
}

function mediaTypeForImage(ext) {
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.png')  return 'image/png';
    if (ext === '.gif')  return 'image/gif';
    if (ext === '.webp') return 'image/webp';
    return 'image/jpeg';
}

async function compressImage(buffer) {
    if (!sharp) return { buffer, compressed: false };
    const originalSize = buffer.length;
    if (originalSize <= MAX_BYTES) return { buffer, compressed: false };

    const scales = [1.0, 0.75, 0.5, 0.25];
    const qualities = [85, 70, 50, 30];

    for (const scale of scales) {
        for (const quality of qualities) {
            try {
                let pipeline = sharp(buffer);
                if (scale < 1.0) {
                    const meta = await sharp(buffer).metadata();
                    const w = Math.max(100, Math.round((meta.width || 1000) * scale));
                    pipeline = sharp(buffer).resize(w);
                }
                const compressed = await pipeline.jpeg({ quality }).toBuffer();
                if (compressed.length <= MAX_BYTES) {
                    return { buffer: compressed, compressed: true, originalSize };
                }
            } catch { /* try next */ }
        }
    }

    // Absolute fallback: resize to 100px wide
    try {
        const compressed = await sharp(buffer).resize(100).jpeg({ quality: 30 }).toBuffer();
        return { buffer: compressed, compressed: true, originalSize };
    } catch {
        return { buffer, compressed: false };
    }
}

async function processFile(file_path, resolved, ext, offset, limit) {
    if (ARCHIVE_EXTS.has(ext)) {
        return { ok: false, error: 'Compressed file. Use run_terminal_command to extract.' };
    }
    if (MEDIA_EXTS.has(ext)) {
        return { ok: false, error: 'Media file not supported for direct reading.' };
    }
    if (EXEC_EXTS.has(ext)) {
        return { ok: false, error: 'Executable binary file not supported.' };
    }

    if (IMAGE_EXTS.has(ext)) {
        const buffer = fs.readFileSync(resolved);
        const { buffer: finalBuf, compressed, originalSize } = await compressImage(buffer);
        const result = {
            type: 'image',
            media_type: 'image/jpeg', // always jpeg after compression; original if not compressed
            data: finalBuf.toString('base64'),
            size_bytes: finalBuf.length,
            compressed: !!compressed,
        };
        if (!compressed) {
            result.media_type = mediaTypeForImage(ext);
        }
        if (compressed && originalSize) {
            result.original_size_bytes = originalSize;
        }
        return { ok: true, ...result };
    }

    if (SVG_EXTS.has(ext)) {
        const content = fs.readFileSync(resolved, 'utf8');
        return { ok: true, type: 'text', media_type: 'image/svg+xml', content };
    }

    if (PDF_EXTS.has(ext)) {
        const buffer = fs.readFileSync(resolved);
        if (buffer.length > MAX_BYTES) {
            return { ok: false, error: `PDF too large (${mbStr(buffer.length)} MB). Maximum: 4 MB.` };
        }
        return {
            ok: true,
            type: 'pdf',
            media_type: 'application/pdf',
            data: buffer.toString('base64'),
            size_bytes: buffer.length,
        };
    }

    // Text (known or unknown extension — try utf8)
    try {
        const raw = fs.readFileSync(resolved, 'utf8');
        const lines = raw.split('\n');
        const total_lines = lines.length;

        if (offset != null || limit != null) {
            const off = (offset != null ? offset - 1 : 0);
            const lim = (limit != null ? limit : lines.length);
            const sliced = lines.slice(off, off + lim).join('\n');
            return { ok: true, type: 'text', content: sliced, total_lines, offset: off + 1, limit: lim };
        }

        const byteSize = Buffer.byteLength(raw, 'utf8');
        if (byteSize > MAX_BYTES) {
            return {
                ok: false,
                error: `File too large (${mbStr(byteSize)} MB). Use offset and limit to read in parts.`,
            };
        }

        return { ok: true, type: 'text', content: raw, total_lines };
    } catch (err) {
        // Could not read as utf8 — unknown binary
        let size = 0;
        try { size = fs.statSync(resolved).size; } catch { /* ignore */ }
        return { ok: false, error: `Unsupported file type (${size} bytes).` };
    }
}

const definition = {
    name: 'read_file',
    description:
        'Reads one or more files. Handles text, images (with auto-compression), PDFs, and SVGs. ' +
        'Returns an array of results, one per file.',
    parameters: {
        type: 'object',
        properties: {
            message: {
                type: 'string',
                description: 'Brief note about why you are reading these files (shown in chat).',
            },
            file_paths: {
                type: 'array',
                items: { type: 'string' },
                description: 'An array of file paths to read.',
            },
            offset: {
                type: 'integer',
                description: 'For text files: 1-based line number to start reading from.',
            },
            limit: {
                type: 'integer',
                description: 'For text files: maximum number of lines to return.',
            },
        },
        required: ['file_paths'],
    },
};

async function execute({ file_paths, message, offset, limit }, { allowedPaths, workspaceRoot }) {
    if (typeof file_paths === 'string') {
        try { file_paths = JSON.parse(file_paths); } catch { /* ignore */ }
    }
    const pathList = Array.isArray(file_paths) ? file_paths : (file_paths ? [file_paths] : []);
    const results = [];
    const isSingle = pathList.length === 1;
    let totalBytes = 0;
    let cutoff = false;

    for (let i = 0; i < pathList.length; i++) {
        const file_path = pathList[i];

        if (cutoff) {
            results.push({ file_path, ok: false, skipped: true, error: 'Did not fit in the request. Read this file separately.' });
            continue;
        }

        const { resolved, ok, error } = resolveSafe(file_path, allowedPaths, workspaceRoot);
        if (!ok) { results.push({ file_path, ok: false, error }); continue; }

        try {
            const ext = path.extname(file_path).toLowerCase();
            const result = await processFile(file_path, resolved, ext, offset, limit);

            // Calculate size of this result
            let resultBytes = 0;
            if (result.ok) {
                if (result.type === 'image' || result.type === 'pdf') {
                    resultBytes = result.size_bytes || 0;
                } else if (result.type === 'text' && result.content) {
                    resultBytes = Buffer.byteLength(result.content, 'utf8');
                }
            }

            // Multi-file: check if adding this result would exceed 4MB total
            if (!isSingle && result.ok && totalBytes + resultBytes > MAX_BYTES) {
                cutoff = true;
                results.push({ file_path, ok: false, skipped: true, error: 'Did not fit in the request. Read this file separately.' });
                continue;
            }

            totalBytes += resultBytes;
            results.push({ file_path, ...result });
        } catch (err) {
            results.push({ file_path, ok: false, error: err.message });
        }
    }

    return { ok: true, results };
}

function toMessage({ file_paths, message }, _result, agentId) {
    const list = Array.isArray(file_paths) ? file_paths : (file_paths ? [file_paths] : []);
    const note = message ? `${message}\n` : '';
    // Detect if any file is an image to pick icon
    const hasImage = list.some(p => IMAGE_EXTS.has(path.extname(p).toLowerCase()));
    const icon = hasImage ? '🖼️' : '📄';
    return `[${agentId}] ${icon} ${note}read: ${list.join(', ')}`;
}

module.exports = { definition, execute, toMessage };
