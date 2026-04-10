const { calcCost } = require('./providers');
const { callApi } = require('./api-client');
const { toAnthropicTool, truncate, buildToolResultContent, sanitizeMsg, stripImagesFromHistory } = require('./message-sanitizer');

const MAX_ITERATIONS = 50;

async function sendMessage(apiKey, modelId, messages, systemPrompt, tools, onProgress, agentId, onToolCall, onToolResult, chatId) {
    const anthropicTools = (tools && tools.length > 0)
        ? tools.map(t => toAnthropicTool(t.definition))
        : undefined;

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
                const toolResultMessage = { role: 'user', content: toolResults };
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

        const toolResultMessage = { role: 'user', content: toolResults };
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

module.exports = { sendMessage };
