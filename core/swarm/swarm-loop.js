const { getSwarmState, MAX_CONSECUTIVE_SELF_TURNS, chatSwarmState } = require('./state');
const { buildHandoffTool, setDeps: setHandoffDeps } = require('./handoff-tool');
const { rewriteHistoryWithToolSummaries, extractHandoffFromHistory } = require('./history-rewriter');
const { buildAgentTools, setDeps: setBuilderDeps } = require('./agent-tools-builder');

let _aiChat;
let _broadcast;
let _log;

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
                        let tCurrentAgent = nextAgent;
                        while (true) {
                            _aiChat.setActiveAgent(targetChatId, tCurrentAgent);
                            _broadcast('AGENT_STARTED', { chatId: targetChatId, agentId: tCurrentAgent });
                            const tTools = buildAgentTools(tCurrentAgent, targetChatId);
                            let tFinishedAgent = null;
                            try {
                                await _aiChat.continueSwarm(targetChatId, tTools);
                                tFinishedAgent = tCurrentAgent;
                            } catch (err) {
                                _log(`[AI Swarm] Error during cross-chat agent turn (${tCurrentAgent}): ${err.message}`);
                                _broadcast('SWARM_IDLE', { chatId: targetChatId });
                                break;
                            }

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
            try {
                await _aiChat.continueSwarm(chatId, tools);
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

function init({ aiChat, aiTools, swarmito, broadcast, log }) {
    _aiChat = aiChat;
    _broadcast = broadcast;
    _log = log || console.log;

    // Inject deps into sub-modules
    setHandoffDeps(aiChat, _log);
    setBuilderDeps(aiChat, aiTools, swarmito, _log);

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

module.exports = { onBeforeMessageSent, onAfterMessageReceived, onBeforeHistoryCleared, init, deactivate };
