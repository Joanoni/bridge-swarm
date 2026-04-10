function toAnthropicTool(definition) {
    return {
        name: definition.name,
        description: definition.description,
        input_schema: definition.parameters,
    };
}

function truncate(str, maxLen = 120) {
    if (typeof str !== 'string') str = JSON.stringify(str) || '';
    return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

// Build tool_result content: if execResult contains image results, return an array of
// Anthropic image blocks; otherwise return a plain JSON string.
function buildToolResultContent(execResult) {
    if (execResult && Array.isArray(execResult.results)) {
        const imageBlocks = [];
        const textParts = [];
        for (const r of execResult.results) {
            if (r.ok && r.type === 'image') {
                imageBlocks.push({
                    type: 'image',
                    source: { type: 'base64', media_type: r.media_type, data: r.data },
                });
            } else {
                textParts.push(JSON.stringify(r));
            }
        }
        if (imageBlocks.length > 0) {
            const blocks = [];
            if (textParts.length > 0) {
                blocks.push({ type: 'text', text: textParts.join('\n') });
            }
            blocks.push(...imageBlocks);
            return blocks;
        }
    }
    return JSON.stringify(execResult ?? null);
}

// Strip any extra fields — Anthropic only accepts { role, content } with clean content blocks
function sanitizeContentBlock(block) {
    if (block.type === 'tool_use') {
        // Remove _meta, caller and any other non-Anthropic fields
        const { _meta, caller, ...rest } = block;
        return rest;
    }
    if (block.type === 'tool_result') {
        const { _meta, ...rest } = block;
        // content may be a string or an array of image/text blocks — pass arrays through as-is
        if (typeof rest.content !== 'string' && !Array.isArray(rest.content)) {
            rest.content = JSON.stringify(rest.content);
        }
        return rest;
    }
    return block;
}

function sanitizeMsg(m) {
    return {
        role: m.role,
        content: Array.isArray(m.content)
            ? m.content.map(sanitizeContentBlock)
            : m.content,
    };
}

// Replace base64 image blocks in historical tool_result messages with lightweight placeholders.
// Images are only needed in the turn they are first read; keeping them in every subsequent
// request causes the payload to grow unboundedly and triggers 413 errors from the API.
// keepLast: number of trailing messages whose images are preserved (default 1 = keep most recent).
function stripImagesFromHistory(msgs, keepLast = 1) {
    const stripIndex = msgs.length - keepLast;
    return msgs.map((m, idx) => {
        if (idx >= stripIndex) return m; // preserve images in the last keepLast messages
        if (m.role !== 'user') return m;
        const content = Array.isArray(m.content) ? m.content : null;
        if (!content) return m;
        const stripped = content.map((block) => {
            if (block.type !== 'tool_result') return block;
            const blockContent = block.content;
            if (!Array.isArray(blockContent)) return block;
            const hasImage = blockContent.some(b => b.type === 'image');
            if (!hasImage) return block;
            const newContent = blockContent.map((b) => {
                if (b.type !== 'image') return b;
                const label = b.source?.file_path || b.source?.media_type || 'image';
                return { type: 'text', text: `[${label} — already processed, not re-sent]` };
            });
            return { ...block, content: newContent };
        });
        return { ...m, content: stripped };
    });
}

module.exports = {
    toAnthropicTool,
    truncate,
    buildToolResultContent,
    sanitizeContentBlock,
    sanitizeMsg,
    stripImagesFromHistory,
};
