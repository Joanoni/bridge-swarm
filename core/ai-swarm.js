const fs = require('fs');
const path = require('path');
const settings = require('./settings');

// ── Module-level state ────────────────────────────────────────────────────────

let _aiChat;
let _aiTools;
let _swarmito;
let _broadcast;
let _log;

// Per-chat swarm state: chatId → { activeAgent, consecutiveSelfTurns, isProcessing }
const chatSwarmState = new Map();

const MAX_CONSECUTIVE_SELF_TURNS = 3;

// ── Swarm state per chat ──────────────────────────────────────────────────────

function getSwarmState(chatId) {
    if (!chatSwarmState.has(chatId)) {
        chatSwarmState.set(chatId, {
            activeAgent: null,
            consecutiveSelfTurns: 0,
            isProcessing: false,
        });
    }
    return chatSwarmState.get(chatId);
}

// ── Handoff tool ──────────────────────────────────────────────────────────────

function buildHandoffTool(chatId) {
    return {
        definition: {
            name: 'handoff_to_agent',
            description:
                'Routes the conversation to the next agent in the swarm, or back to the user. ' +
                'The message field is your chat response to the user AND the briefing for the next agent. ' +
                'Call this tool when your task is complete or you need input from another agent or the user. ' +
                'You may route to yourself up to 2 times (3 consecutive turns max) before you must route elsewhere.',
            parameters: {
                type: 'object',
                properties: {
                    next_agent: {
                        type: 'string',
                        description: 'The ID of the next agent (e.g. "developer"), or "user" to return control to the human.',
                    },
                    message: {
                        type: 'string',
                        description: 'Your message to the user and briefing for the next agent. Keep it SHORT (2-3 sentences max).',
                    },
                },
                required: ['next_agent', 'message'],
            },
        },
        execute: async ({ next_agent, message }) => {
            _log(`[AI Swarm] handoff_to_agent → next_agent="${next_agent}"`);

            // Return to user — swarm goes idle
            if (!next_agent || next_agent === 'user') {
                return { ok: true, message, displayText: message, _handoff: { next_agent: 'user' } };
            }

            const session = _aiChat.getChat(chatId);
            if (!session) {
                return { ok: false, error: `Chat not found: ${chatId}` };
            }

            const availableAgents = _aiChat.listAllAgents(session.projectId).map(a => a.id);
            if (!availableAgents.includes(next_agent)) {
                return { ok: false, error: `Agent "${next_agent}" not found. Available: ${availableAgents.join(', ')}` };
            }

            return { ok: true, message, displayText: message, _handoff: { next_agent } };
        },
        toMessage: ({ message, next_agent }, result, agentId) => {
            return `[${agentId}] ${message}`;
        },
    };
}

// ── History rewriter ──────────────────────────────────────────────────────────

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

// ── Extract handoff result from raw history ───────────────────────────────────

function extractHandoffFromHistory(history) {
    // Walk backwards through raw history to find the last routing signal:
    // 1. handoff_to_agent tool result with _handoff field
    // 2. start_chat tool result with firstAgentId (implicit handoff to first agent)
    //
    // Priority: cross-chat handoffs (start_chat with firstAgentId, or handoff to non-user)
    // take precedence over handoff → user, even if the latter appears later in history.
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

// ── Build tools for an agent ──────────────────────────────────────────────────

function buildAgentTools(agentId, chatId) {
    const session = _aiChat.getChat(chatId);
    if (!session) {
        _log(`[AI Swarm] buildAgentTools: chat ${chatId} not found — returning only handoff tool`);
        return [buildHandoffTool(chatId)];
    }

    const workspaceRoot = session.getWorkspaceRoot();
    const allAgents = _aiChat.listAllAgents(session.projectId);
    const agentMeta = allAgents.find(a => a.id === agentId);

    if (!agentMeta) {
        _log(`[AI Swarm] buildAgentTools: agent "${agentId}" not found in available agents [${allAgents.map(a => a.id).join(', ')}]`);
    }

    let fileTools = [];
    if (agentMeta && agentMeta.tools && agentMeta.tools.length > 0) {
        const allowedPaths = (agentMeta.allowedPaths || []).map(p =>
            path.isAbsolute(p) ? p : path.resolve(workspaceRoot, p)
        );
        const currentSettings = settings.getSettings();
        fileTools = _aiTools.getToolsForAgent(agentMeta.tools, {
            allowedPaths,
            workspaceRoot,
            tavilyApiKey: currentSettings.tavilyApiKey || '',
            cloudflareAccountId: currentSettings.cloudflareAccountId || '',
            cloudflareApiToken: currentSettings.cloudflareApiToken || '',
        });
    }

    // Swarmito gets its own special tools
    if (agentId === 'swarmito') {
        _swarmito.setCurrentChatId(chatId);
        const swaarmitoTools = _swarmito.getSwaarmitoTools();
        const allTools = [...fileTools, ...swaarmitoTools, buildHandoffTool(chatId)];
        _log(`[AI Swarm] [${chatId.slice(0,8)}] buildAgentTools: agent="${agentId}" tools=[${allTools.map(t => t.definition.name).join(', ')}]`);
        return allTools;
    }

    const allTools = [...fileTools, buildHandoffTool(chatId)];
    _log(`[AI Swarm] [${chatId.slice(0,8)}] buildAgentTools: agent="${agentId}" tools=[${allTools.map(t => t.definition.name).join(', ')}]`);
    return allTools;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

async function onBeforeMessageSent({ chatId, content, agentId }) {
    const state = getSwarmState(chatId);
    if (state.isProcessing) {
        _log(`[AI Swarm] before:message-sent skipped — swarm is already processing (chatId=${chatId})`);
        return;
    }

    const session = _aiChat.getChat(chatId);
    if (!session) {
        _log(`[AI Swarm] before:message-sent: chat ${chatId} not found`);
        return;
    }

    const currentAgent = session.activeAgentId;
    _log(`[AI Swarm] before:message-sent: chatId=${chatId} activeAgent="${currentAgent}" content="${content?.slice(0, 60)}${content?.length > 60 ? '…' : ''}"`);

    // Always inject tools for the current active agent — no tag-based routing
    const tools = buildAgentTools(currentAgent, chatId);
    return { extraTools: tools };
}

async function onAfterMessageReceived({ chatId, content, agentId: finishedAgent }) {
    const state = getSwarmState(chatId);
    if (state.isProcessing) return;

    state.isProcessing = true;
    try {
        let currentFinishedAgent = finishedAgent;

        // Self-contained handoff loop driven by handoff_to_agent tool results
        while (true) {
            // Extract handoff BEFORE rewriting history (tool_result blocks are still present)
            const rawHistory = _aiChat.getHistory(chatId);
            const handoff = extractHandoffFromHistory(rawHistory);

            // Rewrite history with tool summaries for the agent that just finished
            if (currentFinishedAgent) {
                const allTools = buildAgentTools(currentFinishedAgent, chatId);
                const rewritten = rewriteHistoryWithToolSummaries(rawHistory, allTools, currentFinishedAgent);
                _aiChat.setHistory(chatId, rewritten);
                _broadcast('AGENT_FINISHED', { chatId, agentId: currentFinishedAgent });
            }

            if (!handoff || handoff.next_agent === 'user') {
                _log(`[AI Swarm] [${chatId.slice(0,8)}] after:message-received: no handoff (or handoff to user) — swarm idle`);
                state.activeAgent = null;
                state.consecutiveSelfTurns = 0;
                _broadcast('SWARM_IDLE', { chatId });
                break;
            }

            const nextAgent = handoff.next_agent;

            // Cross-chat handoff (e.g. start_chat with firstAgentId) — switch context to new chat
            const targetChatId = handoff.chatId && handoff.chatId !== chatId ? handoff.chatId : chatId;
            if (targetChatId !== chatId) {
                _log(`[AI Swarm] Cross-chat handoff → chatId=${targetChatId} agent="${nextAgent}"`);
                // Go idle in the originating chat
                state.activeAgent = null;
                state.consecutiveSelfTurns = 0;
                _broadcast('SWARM_IDLE', { chatId });
                // Run the agent loop in the new chat inline (avoid re-entrancy)
                const targetState = getSwarmState(targetChatId);
                if (!targetState.isProcessing) {
                    targetState.isProcessing = true;
                    targetState.activeAgent = nextAgent;
                    try {
                        let tFinishedAgent = null;
                        let tCurrentAgent = nextAgent;
                        while (true) {
                            _aiChat.setActiveAgent(targetChatId, tCurrentAgent);
                            _broadcast('AGENT_STARTED', { chatId: targetChatId, agentId: tCurrentAgent });
                            const tTools = buildAgentTools(tCurrentAgent, targetChatId);
                            let tResult;
                            try {
                                tResult = await _aiChat.continueSwarm(targetChatId, tTools);
                            } catch (err) {
                                _log(`[AI Swarm] Error during cross-chat agent turn (${tCurrentAgent}): ${err.message}`);
                                _broadcast('SWARM_IDLE', { chatId: targetChatId });
                                break;
                            }
                            tFinishedAgent = tCurrentAgent;

                            const tRawHistory = _aiChat.getHistory(targetChatId);
                            const tHandoff = extractHandoffFromHistory(tRawHistory);
                            const tAllTools = buildAgentTools(tFinishedAgent, targetChatId);
                            const tRewritten = rewriteHistoryWithToolSummaries(tRawHistory, tAllTools, tFinishedAgent);
                            _aiChat.setHistory(targetChatId, tRewritten);
                            _broadcast('AGENT_FINISHED', { chatId: targetChatId, agentId: tFinishedAgent });

                            if (!tHandoff || tHandoff.next_agent === 'user') {
                                targetState.activeAgent = null;
                                targetState.consecutiveSelfTurns = 0;
                                _broadcast('SWARM_IDLE', { chatId: targetChatId });
                                break;
                            }
                            const tNext = tHandoff.next_agent;
                            const tSession = _aiChat.getChat(targetChatId);
                            if (!tSession) { _broadcast('SWARM_IDLE', { chatId: targetChatId }); break; }
                            const tAvailable = _aiChat.listAllAgents(tSession.projectId).map(a => a.id);
                            if (!tAvailable.includes(tNext)) {
                                _log(`[AI Swarm] Cross-chat handoff target "${tNext}" not found. Idle.`);
                                targetState.activeAgent = null;
                                _broadcast('SWARM_IDLE', { chatId: targetChatId });
                                break;
                            }
                            if (tNext === targetState.activeAgent) {
                                targetState.consecutiveSelfTurns++;
                                if (targetState.consecutiveSelfTurns >= MAX_CONSECUTIVE_SELF_TURNS) {
                                    targetState.activeAgent = null;
                                    targetState.consecutiveSelfTurns = 0;
                                    _broadcast('SWARM_IDLE', { chatId: targetChatId });
                                    break;
                                }
                            } else {
                                targetState.consecutiveSelfTurns = 0;
                                targetState.activeAgent = tNext;
                            }
                            tCurrentAgent = tNext;
                        }
                    } finally {
                        targetState.isProcessing = false;
                    }
                }
                break;
            }

            const session = _aiChat.getChat(chatId);
            if (!session) break;

            const availableAgents = _aiChat.listAllAgents(session.projectId).map(a => a.id);
            if (!availableAgents.includes(nextAgent)) {
                _log(`[AI Swarm] [${chatId.slice(0,8)}] Handoff target "${nextAgent}" not in available agents. Returning to user.`);
                state.activeAgent = null;
                state.consecutiveSelfTurns = 0;
                _broadcast('SWARM_IDLE', { chatId });
                break;
            }

            // Consecutive self-turn guard
            if (nextAgent === state.activeAgent) {
                state.consecutiveSelfTurns++;
                _log(`[AI Swarm] [${chatId.slice(0,8)}] Agent "${state.activeAgent}" self-handoff #${state.consecutiveSelfTurns} (max=${MAX_CONSECUTIVE_SELF_TURNS})`);
                if (state.consecutiveSelfTurns >= MAX_CONSECUTIVE_SELF_TURNS) {
                    _log(`[AI Swarm] [${chatId.slice(0,8)}] Agent "${state.activeAgent}" exceeded max consecutive self-turns — returning to user`);
                    state.activeAgent = null;
                    state.consecutiveSelfTurns = 0;
                    _broadcast('SWARM_IDLE', { chatId });
                    break;
                }
            } else {
                state.consecutiveSelfTurns = 0;
                state.activeAgent = nextAgent;
            }

            _log(`[AI Swarm] [${chatId.slice(0,8)}] Routing to agent: ${nextAgent}`);
            _aiChat.setActiveAgent(chatId, nextAgent);
            _broadcast('AGENT_STARTED', { chatId, agentId: nextAgent });

            const tools = buildAgentTools(nextAgent, chatId);
            let result;
            try {
                result = await _aiChat.continueSwarm(chatId, tools);
            } catch (err) {
                _log(`[AI Swarm] [${chatId.slice(0,8)}] Error during agent turn (${nextAgent}): ${err.message}`);
                state.activeAgent = null;
                _broadcast('SWARM_IDLE', { chatId });
                break;
            }

            currentFinishedAgent = nextAgent;
        }
    } finally {
        state.isProcessing = false;
    }
}

async function onBeforeHistoryCleared({ chatId }) {
    chatSwarmState.delete(chatId);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

function init({ aiChat, aiTools, swarmito, broadcast, log }) {
    _aiChat = aiChat;
    _aiTools = aiTools;
    _swarmito = swarmito;
    _broadcast = broadcast;
    _log = log || console.log;

    _aiChat.use('before:message-sent', onBeforeMessageSent);
    _aiChat.use('after:message-received', onAfterMessageReceived);
    _aiChat.use('before:history-cleared', onBeforeHistoryCleared);

    _log('[AI Swarm] Initialized. Hooks registered: before:message-sent, after:message-received, before:history-cleared');
}

function deactivate() {
    if (_aiChat) {
        _aiChat.unuse('before:message-sent', onBeforeMessageSent);
        _aiChat.unuse('after:message-received', onAfterMessageReceived);
        _aiChat.unuse('before:history-cleared', onBeforeHistoryCleared);
        _log('[AI Swarm] Deactivated. Hooks unregistered.');
    }
    chatSwarmState.clear();
}

module.exports = { init, deactivate };
