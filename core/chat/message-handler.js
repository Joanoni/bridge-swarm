const { chats, getSettings, getEngine, getBroadcast, getLog } = require('./state');
const { runHooks } = require('./hooks');
const { loadAgentMeta, loadSystemPrompt } = require('./agent-loader');
const { buildContextPrefix, buildFilesSection } = require('./context-builder');
const { saveChatToDisk } = require('./persistence');

async function continueSwarm(chatId, tools) {
    const _settings = getSettings();
    const _engine = getEngine();
    const _broadcast = getBroadcast();
    const _log = getLog();

    const session = chats.get(chatId);
    if (!session) throw new Error(`Chat not found: ${chatId}`);

    const settings = _settings.getSettings();
    if (!settings.apiKey) throw new Error('No API key configured.');

    const resolvedAgentId = session.activeAgentId;
    const workspaceRoot = session.getWorkspaceRoot();

    _log?.(`[AI Chat] continueSwarm: chatId=${chatId} agent="${resolvedAgentId}" tools=[${tools.map(t => t.definition?.name).join(', ')}]`);

    const agentMeta = loadAgentMeta(resolvedAgentId, session.projectId);
    const agentDir = agentMeta ? agentMeta.agentDir : null;
    const agentSystemPrompt = agentDir ? loadSystemPrompt(agentDir) : '';
    const filesSection = buildFilesSection(chatId, session.projectId);
    const systemPrompt = buildContextPrefix(workspaceRoot) + (agentSystemPrompt ? '\n\n' + agentSystemPrompt : '') + (filesSection ? '\n\n' + filesSection : '');

    const costAtTurnStart = session.totalCostUsd;

    const onProgress = async ({ costUsd: turnCostSoFar }) => {
        const newTotal = costAtTurnStart + turnCostSoFar;
        session.totalCostUsd = newTotal;
        _broadcast('COST_UPDATED', { chatId, totalCostUsd: newTotal });

        const limit = settings.spendingLimit || 0;
        if (limit > 0) {
            const checkpointsPassed = Math.floor(newTotal / limit);
            const lastCheckpoints = Math.floor(costAtTurnStart / limit);
            if (checkpointsPassed > lastCheckpoints) {
                _log?.(`[AI Chat] Spending limit reached at $${newTotal.toFixed(4)}.`);
                _broadcast('SPENDING_LIMIT_REACHED', { chatId, totalCostUsd: newTotal });
                await new Promise((resolve) => { session._resumeResolve = resolve; });
                _log?.('[AI Chat] User approved continuation.');
            }
        }
    };

    // Anthropic requires the conversation to end with a user message.
    const historyForEngine = (() => {
        const last = session.history[session.history.length - 1];
        if (last && last.role === 'assistant') {
            _log?.(`[AI Chat] continueSwarm: history ends with assistant — injecting silent user turn`);
            return [...session.history, { role: 'user', content: '.' }];
        }
        return session.history;
    })();

    const onToolCall = (toolName, input) => {
        _broadcast('TOOL_CALL', { chatId, agentId: resolvedAgentId, toolName, input });
    };
    const onToolResult = (toolName, result, ms) => {
        _broadcast('TOOL_RESULT', { chatId, agentId: resolvedAgentId, toolName, ok: result?.ok ?? true, ms });
    };

    const { addedMessages, displayText, usage } = await _engine.sendMessage(
        settings.apiKey,
        settings.model,
        historyForEngine,
        systemPrompt,
        tools,
        onProgress,
        resolvedAgentId,
        onToolCall,
        onToolResult,
        chatId,
    );

    for (const msg of addedMessages) session.history.push(msg);

    if (usage && typeof usage.costUsd === 'number') {
        session.totalCostUsd = costAtTurnStart + usage.costUsd;
        _broadcast('COST_UPDATED', { chatId, totalCostUsd: session.totalCostUsd });
        _log?.(`[AI Chat] [${chatId.slice(0,8)}] Turn cost: $${usage.costUsd.toFixed(6)} | Chat total: $${session.totalCostUsd.toFixed(6)}`);
    }

    const lastAssistant = [...addedMessages].reverse().find(m => m.role === 'assistant');
    let endTurnText = '';
    if (lastAssistant) {
        const textBlock = Array.isArray(lastAssistant.content)
            ? lastAssistant.content.find(b => b.type === 'text')
            : null;
        endTurnText = (textBlock ? textBlock.text : (typeof lastAssistant.content === 'string' ? lastAssistant.content : '')).trim();
    }
    let finalText = displayText;
    if (finalText === null) {
        finalText = endTurnText || '(no response)';
    } else if (endTurnText && endTurnText !== finalText) {
        finalText = `${finalText}\n\n${endTurnText}`;
    }

    const assistantMessage = { role: 'assistant', content: finalText, agentId: resolvedAgentId, _ts: new Date().toISOString() };
    session.history.push(assistantMessage);
    _broadcast('APPEND_MESSAGE', { chatId, role: 'assistant', content: finalText, agentId: resolvedAgentId });
    session.updatedAt = new Date().toISOString();
    saveChatToDisk(session);

    return assistantMessage;
}

async function processSendMessage(chatId, content, extraTools = [], pushUserToUI = true) {
    const _settings = getSettings();
    const _engine = getEngine();
    const _broadcast = getBroadcast();
    const _log = getLog();

    const session = chats.get(chatId);
    if (!session) throw new Error(`Chat not found: ${chatId}`);

    const settings = _settings.getSettings();
    if (!settings.apiKey) throw new Error('No API key configured. Please set your API key in Settings.');

    const agentId = session.activeAgentId;
    _log?.(`[AI Chat] processSendMessage: chatId=${chatId} activeAgent="${agentId}" content="${content?.slice(0, 60)}${content?.length > 60 ? '…' : ''}"`);

    const hookResult = await runHooks('before:message-sent', { chatId, content, agentId });
    if (hookResult.cancel) {
        _log?.(`[AI Chat] processSendMessage: cancelled by hook`);
        return { role: 'assistant', content: '' };
    }

    const resolvedAgentId = session.activeAgentId;
    const workspaceRoot = session.getWorkspaceRoot();

    const agentMeta = loadAgentMeta(resolvedAgentId, session.projectId);
    const agentDir = agentMeta ? agentMeta.agentDir : null;
    const agentSystemPrompt = agentDir ? loadSystemPrompt(agentDir) : '';
    const filesSection = buildFilesSection(chatId, session.projectId);
    const systemPrompt = buildContextPrefix(workspaceRoot) + (agentSystemPrompt ? '\n\n' + agentSystemPrompt : '') + (filesSection ? '\n\n' + filesSection : '');

    const tools = [...extraTools, ...hookResult.extraTools];

    const userMessage = { role: 'user', content, _ts: new Date().toISOString() };
    session.history.push(userMessage);

    if (pushUserToUI) {
        _broadcast('APPEND_MESSAGE', { chatId, role: 'user', content });
    }

    const costAtTurnStart = session.totalCostUsd;
    let lastCheckpointCost = costAtTurnStart;

    const onProgress = async ({ costUsd: turnCostSoFar }) => {
        const newTotal = costAtTurnStart + turnCostSoFar;
        session.totalCostUsd = newTotal;
        _broadcast('COST_UPDATED', { chatId, totalCostUsd: newTotal });

        const limit = settings.spendingLimit || 0;
        if (limit > 0) {
            const checkpointsPassed = Math.floor(newTotal / limit);
            const lastCheckpoints = Math.floor(lastCheckpointCost / limit);
            if (checkpointsPassed > lastCheckpoints) {
                lastCheckpointCost = newTotal;
                _log?.(`[AI Chat] Spending limit reached at $${newTotal.toFixed(4)}.`);
                _broadcast('SPENDING_LIMIT_REACHED', { chatId, totalCostUsd: newTotal });
                await new Promise((resolve) => { session._resumeResolve = resolve; });
                _log?.('[AI Chat] User approved continuation.');
            }
        }
    };

    try {
        _log?.(`[AI Chat] processSendMessage: calling engine for agent="${resolvedAgentId}" with ${tools.length} tool(s): [${tools.map(t => t.definition?.name).join(', ')}]`);

        const onToolCall = (toolName, input) => {
            _broadcast('TOOL_CALL', { chatId, agentId: resolvedAgentId, toolName, input });
        };
        const onToolResult = (toolName, result, ms) => {
            _broadcast('TOOL_RESULT', { chatId, agentId: resolvedAgentId, toolName, ok: result?.ok ?? true, ms });
        };

        const { addedMessages, displayText, usage } = await _engine.sendMessage(
            settings.apiKey,
            settings.model,
            session.history,
            systemPrompt,
            tools,
            onProgress,
            resolvedAgentId,
            onToolCall,
            onToolResult,
            chatId,
        );

        for (const msg of addedMessages) session.history.push(msg);

        if (usage && typeof usage.costUsd === 'number') {
            session.totalCostUsd = costAtTurnStart + usage.costUsd;
            _broadcast('COST_UPDATED', { chatId, totalCostUsd: session.totalCostUsd });
            _log?.(`[AI Chat] [${chatId.slice(0,8)}] Turn cost: $${usage.costUsd.toFixed(6)} | Chat total: $${session.totalCostUsd.toFixed(6)}`);
        }

        const lastAssistant = [...addedMessages].reverse().find(m => m.role === 'assistant');
        let endTurnText = '';
        if (lastAssistant) {
            const textBlock = Array.isArray(lastAssistant.content)
                ? lastAssistant.content.find(b => b.type === 'text')
                : null;
            endTurnText = (textBlock ? textBlock.text : (typeof lastAssistant.content === 'string' ? lastAssistant.content : '')).trim();
        }
        let finalText = displayText;
        if (finalText === null) {
            finalText = endTurnText || '(no response)';
        } else if (endTurnText && endTurnText !== finalText) {
            finalText = `${finalText}\n\n${endTurnText}`;
        }

        const assistantMessage = { role: 'assistant', content: finalText, agentId: resolvedAgentId, _ts: new Date().toISOString() };
        session.history.push(assistantMessage);

        _broadcast('APPEND_MESSAGE', { chatId, role: 'assistant', content: finalText, agentId: resolvedAgentId });

        session.updatedAt = new Date().toISOString();
        saveChatToDisk(session);

        await runHooks('after:message-received', { chatId, ...assistantMessage, agentId: resolvedAgentId });

        return assistantMessage;
    } catch (err) {
        session.history.pop();
        _log?.(`[AI Chat] sendMessage failed: ${err.message}`);
        throw err;
    }
}

async function injectAssistantMessage(chatId, content, agentId) {
    const _broadcast = getBroadcast();
    const session = chats.get(chatId);
    if (!session) throw new Error(`Chat not found: ${chatId}`);
    const msg = { role: 'assistant', content };
    session.history.push(msg);
    session.updatedAt = new Date().toISOString();
    _broadcast('APPEND_MESSAGE', { chatId, role: 'assistant', content, agentId: agentId || null });
    saveChatToDisk(session);
    await runHooks('after:message-received', { chatId, content, agentId: agentId || null });
}

async function injectAssistantMessageSilent(chatId, content, agentId) {
    const _broadcast = getBroadcast();
    const session = chats.get(chatId);
    if (!session) throw new Error(`Chat not found: ${chatId}`);
    const msg = { role: 'assistant', content };
    session.history.push(msg);
    session.updatedAt = new Date().toISOString();
    _broadcast('APPEND_MESSAGE', { chatId, role: 'assistant', content, agentId: agentId || null });
    saveChatToDisk(session);
}

module.exports = {
    processSendMessage,
    continueSwarm,
    injectAssistantMessage,
    injectAssistantMessageSilent,
};
