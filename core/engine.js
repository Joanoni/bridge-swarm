const https = require('https');

const id = 'anthropic';
const name = 'Anthropic';

const models = [
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
];

const PRICING = {
    'claude-sonnet-4-6':              { input: 3.00,  output: 15.00 },
    'claude-3-5-sonnet-20241022':     { input: 3.00,  output: 15.00 },
    'claude-3-opus-20240229':         { input: 15.00, output: 75.00 },
    'claude-3-haiku-20240307':        { input: 0.25,  output: 1.25  },
};

const MAX_ITERATIONS = 50;

function calcCost(modelId, inputTokens, outputTokens) {
    const price = PRICING[modelId];
    if (!price) return 0;
    return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

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

function callApi(apiKey, body) {
    return new Promise((resolve, reject) => {
        const bodyStr = JSON.stringify(body);
        const options = {
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(bodyStr),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        const err = new Error(parsed.error.message || 'Anthropic API error');
                        err.statusCode = res.statusCode;
                        err.errorType = parsed.error.type;
                        reject(err);
                    } else {
                        resolve(parsed);
                    }
                } catch (e) {
                    reject(new Error(`HTTP ${res.statusCode} — non-JSON response. Body: ${data.slice(0, 200)}`));
                }
            });
        });

        req.on('error', (e) => reject(new Error(`Network error: ${e.message}`)));
        req.write(bodyStr);
        req.end();
    });
}

async function sendMessage(apiKey, modelId, messages, systemPrompt, tools, onProgress, agentId, onToolCall, onToolResult, chatId) {
    const anthropicTools = (tools && tools.length > 0)
        ? tools.map(t => toAnthropicTool(t.definition))
        : undefined;

    // Build tool_result content: if execResult contains image results, return an array of
    // Anthropic image blocks; otherwise return a plain JSON string.
    const buildToolResultContent = (execResult) => {
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
    };

    // Strip any extra fields — Anthropic only accepts { role, content } with clean content blocks
    const sanitizeContentBlock = (block) => {
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
    };
    const sanitizeMsg = (m) => ({
        role: m.role,
        content: Array.isArray(m.content)
            ? m.content.map(sanitizeContentBlock)
            : m.content,
    });

    // Replace base64 image blocks in historical tool_result messages with lightweight placeholders.
    // Images are only needed in the turn they are first read; keeping them in every subsequent
    // request causes the payload to grow unboundedly and triggers 413 errors from the API.
    // keepLast: number of trailing messages whose images are preserved (default 1 = keep most recent).
    const stripImagesFromHistory = (msgs, keepLast = 1) => {
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
    };

    const workingMessages = messages.map(sanitizeMsg);
    const addedMessages = [];
    let displayText = null;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const shortChatId = chatId ? chatId.slice(0, 8) : null;
    const agentTag = agentId
        ? (shortChatId ? `[${agentId}@${shortChatId}] ` : `[${agentId}] `)
        : '';
    const toolNames = tools ? tools.map(t => t.definition.name) : [];
    console.log(`[Engine] ${agentTag}Starting turn | model=${modelId} | tools=[${toolNames.join(', ')}] | history=${workingMessages.length} msgs`);

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        // Strip images from all but the most recent tool_result before each API call.
        // workingMessages retains full data for persistence; messagesForApi is a stripped copy.
        const messagesForApi = stripImagesFromHistory(workingMessages);
        const requestBody = {
            model: modelId,
            max_tokens: 64000,
            messages: messagesForApi,
        };
        if (systemPrompt && systemPrompt.trim().length > 0) {
            requestBody.system = systemPrompt.trim();
        }
        if (anthropicTools) {
            requestBody.tools = anthropicTools;
        }

        const iterStart = Date.now();
        let response;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                response = await callApi(apiKey, requestBody);
                break;
            } catch (err) {
                const retryable = err.statusCode === 529 || err.statusCode === 429 ||
                    (err.errorType && (err.errorType === 'overloaded_error' || err.errorType === 'rate_limit_error'));
                console.error(`[Engine] ${agentTag}API error (attempt ${attempt + 1}/3): status=${err.statusCode} type=${err.errorType} msg="${err.message}"`);
                if (retryable && attempt < 2) {
                    const delay = (attempt + 1) * 10000;
                    console.log(`[Engine] ${agentTag}Retryable error, retrying in ${delay / 1000}s...`);
                    await new Promise(r => setTimeout(r, delay));
                } else {
                    throw err;
                }
            }
        }

        const iterMs = Date.now() - iterStart;

        if (response.usage) {
            totalInputTokens += response.usage.input_tokens || 0;
            totalOutputTokens += response.usage.output_tokens || 0;
        }

        const partialCost = calcCost(modelId, totalInputTokens, totalOutputTokens);

        if (typeof onProgress === 'function') {
            await Promise.resolve(onProgress({
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
                costUsd: partialCost,
            }));
        }

        // Annotate tool_use blocks with _meta for richer raw.json (addedMessages only)
        const annotatedContent = Array.isArray(response.content)
            ? response.content.map(block => {
                if (block.type === 'tool_use') {
                    return { ...block, _meta: { iteration, timestamp: new Date().toISOString() } };
                }
                return block;
            })
            : response.content;

        const assistantMessage = { role: 'assistant', content: annotatedContent };
        // workingMessages gets sanitized content (no _meta); addedMessages keeps full annotated content
        workingMessages.push(sanitizeMsg(assistantMessage));
        addedMessages.push(assistantMessage);

        console.log(`[Engine] ${agentTag}iter=${iteration} stop=${response.stop_reason} in=${response.usage?.input_tokens} out=${response.usage?.output_tokens} total_in=${totalInputTokens} total_out=${totalOutputTokens} cost=$${partialCost.toFixed(6)} ms=${iterMs}`);

        if (response.stop_reason === 'max_tokens') {
            const pendingToolUseBlocks = Array.isArray(response.content)
                ? response.content.filter(b => b.type === 'tool_use')
                : [];

            if (pendingToolUseBlocks.length > 0) {
                console.log(`[Engine] ${agentTag}max_tokens with pending tools=[${pendingToolUseBlocks.map(b => b.name).join(', ')}] — executing and continuing`);
                const toolResults = [];
                for (const block of pendingToolUseBlocks) {
                    const tool = tools && tools.find(t => t.definition.name === block.name);
                    let resultContent;
                    const toolStart = Date.now();
                    try {
                        if (!tool) throw new Error(`No executor found for tool: ${block.name}`);
                        console.log(`[Engine] ${agentTag}  tool_call: ${block.name}(${truncate(JSON.stringify(block.input))})`);
                        if (typeof onToolCall === 'function') await Promise.resolve(onToolCall(block.name, block.input));
                        const execResult = await Promise.resolve(tool.execute(block.input));
                        if (execResult && execResult.displayText) displayText = execResult.displayText;
                        resultContent = buildToolResultContent(execResult);
                        const ms = Date.now() - toolStart;
                        console.log(`[Engine] ${agentTag}  tool_result: ${block.name} → ok=${execResult?.ok ?? true} ms=${ms} | ${truncate(typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent))}`);
                        if (typeof onToolResult === 'function') await Promise.resolve(onToolResult(block.name, execResult, ms));
                    } catch (err) {
                        resultContent = JSON.stringify({ error: err.message });
                        console.error(`[Engine] ${agentTag}  tool_error: ${block.name} → ${err.message} ms=${Date.now() - toolStart}`);
                        if (typeof onToolResult === 'function') await Promise.resolve(onToolResult(block.name, { ok: false, error: err.message }, Date.now() - toolStart));
                    }
                    toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultContent, _meta: { tool: block.name, timestamp: new Date().toISOString() } });
                }
                const cappedToolResults = toolResults;
                const toolResultMessage = { role: 'user', content: cappedToolResults };
                workingMessages.push(sanitizeMsg(toolResultMessage));
                addedMessages.push(toolResultMessage);
            } else {
                console.log(`[Engine] ${agentTag}max_tokens with no pending tools — injecting continuation prompt`);
                const continuationMessage = {
                    role: 'user',
                    content: 'Continue exactly where you left off. Do not repeat anything already written.',
                };
                workingMessages.push(continuationMessage);
                addedMessages.push(continuationMessage);
            }
            continue;
        }

        if (response.stop_reason !== 'tool_use') break;

        const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
        if (toolUseBlocks.length === 0) break;

        console.log(`[Engine] ${agentTag}iter=${iteration} tools=[${toolUseBlocks.map(b => b.name).join(', ')}]`);

        const toolResults = [];
        for (const block of toolUseBlocks) {
            const tool = tools && tools.find(t => t.definition.name === block.name);
            let resultContent;
            const toolStart = Date.now();
            try {
                if (!tool) throw new Error(`No executor found for tool: ${block.name}`);
                console.log(`[Engine] ${agentTag}  tool_call: ${block.name}(${truncate(JSON.stringify(block.input))})`);
                if (typeof onToolCall === 'function') await Promise.resolve(onToolCall(block.name, block.input));
                const execResult = await Promise.resolve(tool.execute(block.input));
                if (execResult && execResult.displayText) displayText = execResult.displayText;
                resultContent = buildToolResultContent(execResult);
                const ms = Date.now() - toolStart;
                console.log(`[Engine] ${agentTag}  tool_result: ${block.name} → ok=${execResult?.ok ?? true} ms=${ms} | ${truncate(typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent))}`);
                if (typeof onToolResult === 'function') await Promise.resolve(onToolResult(block.name, execResult, ms));
            } catch (err) {
                resultContent = JSON.stringify({ error: err.message });
                console.error(`[Engine] ${agentTag}  tool_error: ${block.name} → ${err.message} ms=${Date.now() - toolStart}`);
                if (typeof onToolResult === 'function') await Promise.resolve(onToolResult(block.name, { ok: false, error: err.message }, Date.now() - toolStart));
            }
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultContent, _meta: { tool: block.name, timestamp: new Date().toISOString() } });
        }

        const cappedToolResults = toolResults;
        const toolResultMessage = { role: 'user', content: cappedToolResults };
        workingMessages.push(sanitizeMsg(toolResultMessage));
        addedMessages.push(toolResultMessage);
    }

    const costUsd = calcCost(modelId, totalInputTokens, totalOutputTokens);
    console.log(`[Engine] ${agentTag}Turn complete | total_in=${totalInputTokens} total_out=${totalOutputTokens} cost=$${costUsd.toFixed(6)}`);
    return {
        addedMessages,
        displayText,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, costUsd },
    };
}

function getProviders() {
    return [{ id, name, models }];
}

module.exports = { sendMessage, getProviders };
