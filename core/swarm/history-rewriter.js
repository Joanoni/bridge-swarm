function rewriteHistoryWithToolSummaries(history, tools, agentId) {
    const toolMap = new Map();
    for (const tool of tools) {
        if (typeof tool.toMessage === 'function') {
            toolMap.set(tool.definition.name, tool.toMessage);
        }
    }

    const resultMap = new Map();
    for (const msg of history) {
        if (msg.role === 'user' && Array.isArray(msg.content)) {
            for (const block of msg.content) {
                if (block.type === 'tool_result') {
                    try {
                        resultMap.set(block.tool_use_id, JSON.parse(block.content));
                    } catch {
                        resultMap.set(block.tool_use_id, { raw: block.content });
                    }
                }
            }
        }
    }

    const newHistory = [];
    for (const msg of history) {
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
            const textBlocks = msg.content.filter(b => b.type === 'text');
            const toolUseBlocks = msg.content.filter(b => b.type === 'tool_use');

            if (toolUseBlocks.length === 0) {
                newHistory.push(msg);
                continue;
            }

            const textContent = textBlocks.map(b => b.text).join('\n').trim();
            if (textContent) newHistory.push({ role: 'assistant', content: textContent });

            for (const block of toolUseBlocks) {
                const toMessage = toolMap.get(block.name);
                if (!toMessage) continue;
                const result = resultMap.get(block.id);
                const text = toMessage(block.input, result, agentId);
                if (text != null) newHistory.push({ role: 'assistant', content: text });
            }
            continue;
        }

        if (msg.role === 'user' && Array.isArray(msg.content)) {
            const hasNonToolResult = msg.content.some(b => b.type !== 'tool_result');
            if (!hasNonToolResult) continue;
        }

        newHistory.push(msg);
    }

    return newHistory;
}

function extractHandoffFromHistory(history) {
    // Walk backwards through raw history to find the last routing signal.
    // Priority: cross-chat handoffs take precedence over handoff → user.
    let userHandoff = null;

    for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i];
        if (msg.role === 'user' && Array.isArray(msg.content)) {
            for (const block of msg.content) {
                if (block.type === 'tool_result') {
                    try {
                        const parsed = typeof block.content === 'string'
                            ? JSON.parse(block.content)
                            : block.content;
                        if (parsed && parsed._handoff) {
                            // Non-user handoff → return immediately (highest priority)
                            if (parsed._handoff.next_agent && parsed._handoff.next_agent !== 'user') {
                                return parsed._handoff;
                            }
                            // handoff → user: record but keep looking for cross-chat signals
                            if (!userHandoff) userHandoff = parsed._handoff;
                        }
                        // start_chat with firstAgentId → cross-chat handoff (high priority)
                        if (parsed && parsed.ok && parsed.chatId && parsed.firstAgentId) {
                            return { next_agent: parsed.firstAgentId, chatId: parsed.chatId };
                        }
                    } catch { /* skip */ }
                }
            }
        }
    }
    return userHandoff;
}

module.exports = { rewriteHistoryWithToolSummaries, extractHandoffFromHistory };
