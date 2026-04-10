const fs = require('fs');
const path = require('path');
const { chats, getSettings, getEngine, getBroadcast, getLog } = require('./state');
const { runHooks } = require('./hooks');
const { listAllAgents } = require('./agent-loader');
const { getChatFilesDir, listChatFiles } = require('./context-builder');
const { saveChatToDisk } = require('./persistence');
const { processSendMessage } = require('./message-handler');
const { createChat, deleteChat, getChat, listChats, setActiveAgent, setHistory, getHistory } = require('./chat-manager');

async function handleCommand(command, payload) {
    const _settings = getSettings();
    const _engine = getEngine();
    const _broadcast = getBroadcast();
    const _log = getLog();

    switch (command) {

        case 'GET_CHATS': {
            const filterProjectId = payload && 'projectId' in payload ? payload.projectId : undefined;
            return { chats: listChats(filterProjectId) };
        }

        case 'CREATE_CHAT': {
            const { name, agents, projectId } = payload;
            if (!name) throw new Error('name is required.');
            const chatId = createChat({ name, agents: agents || [], projectId });
            return { ok: true, chatId };
        }

        case 'DELETE_CHAT': {
            const { chatId } = payload;
            if (!chatId) throw new Error('chatId is required.');
            deleteChat(chatId);
            return { ok: true };
        }

        case 'GET_HISTORY': {
            const { chatId } = payload;
            if (!chatId) throw new Error('chatId is required.');
            return getHistory(chatId);
        }

        case 'GET_AGENTS': {
            const { projectId } = payload || {};
            const agents = listAllAgents(projectId);
            return { agents };
        }

        case 'SET_AGENT': {
            const { chatId, agentId } = payload;
            if (!chatId || !agentId) throw new Error('chatId and agentId are required.');
            setActiveAgent(chatId, agentId);
            return { ok: true };
        }

        case 'SEND_MESSAGE': {
            const { chatId, content } = payload;
            if (!chatId || !content) throw new Error('chatId and content are required.');
            // pushUserToUI=false: client already rendered the user message locally
            await processSendMessage(chatId, content, [], false, true);
            return { ok: true };
        }

        case 'CLEAR_HISTORY': {
            const { chatId } = payload;
            if (!chatId) throw new Error('chatId is required.');
            await runHooks('before:history-cleared', { chatId });
            setHistory(chatId, []);
            const session = chats.get(chatId);
            if (session) {
                session.totalCostUsd = 0;
                _broadcast('COST_UPDATED', { chatId, totalCostUsd: 0 });
            }
            return { ok: true };
        }

        case 'EDIT_MESSAGE': {
            const { chatId, messageIndex, newContent } = payload;
            if (!chatId || typeof messageIndex !== 'number' || !newContent) {
                throw new Error('chatId, messageIndex, and newContent are required.');
            }
            const session = chats.get(chatId);
            if (!session) throw new Error(`Chat not found: ${chatId}`);

            // Find the nth user message in the full history (string-content only)
            let userCount = -1;
            let targetIdx = -1;
            for (let i = 0; i < session.history.length; i++) {
                const m = session.history[i];
                if (m.role === 'user' && typeof m.content === 'string') {
                    userCount++;
                    if (userCount === messageIndex) { targetIdx = i; break; }
                }
            }
            if (targetIdx === -1) throw new Error(`Message at index ${messageIndex} not found.`);

            // Truncate history at that point
            session.history = session.history.slice(0, targetIdx);

            const displayMessages = session.history
                .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
                .map(m => ({ role: m.role, content: m.content }));
            _broadcast('REPLACE_HISTORY', { chatId, messages: displayMessages });
            saveChatToDisk(session);

            // Re-send from the edited message (pushUserToUI=false: client already rendered it)
            await processSendMessage(chatId, newContent, [], false, true);
            return { ok: true };
        }

        case 'RESUME_TURN': {
            const { chatId } = payload;
            const session = chats.get(chatId);
            if (session && session._resumeResolve) {
                const resolve = session._resumeResolve;
                session._resumeResolve = null;
                resolve();
            }
            return { ok: true };
        }

        case 'GET_SETTINGS': {
            const settings = _settings.getSettings();
            const providers = _engine.getProviders();
            const agents = listAllAgents();
            return {
                provider: settings.provider,
                model: settings.model,
                hasApiKey: settings.apiKey.length > 0,
                spendingLimit: settings.spendingLimit || 0,
                availableProviders: providers,
                agents,
                projects: _settings.getProjects(),
            };
        }

        case 'GET_SETTINGS_WITH_KEY': {
            const settings = _settings.getSettings();
            const providers = _engine.getProviders();
            const agents = listAllAgents();
            return {
                provider: settings.provider,
                model: settings.model,
                apiKey: settings.apiKey,
                tavilyApiKey: settings.tavilyApiKey || '',
                spendingLimit: settings.spendingLimit || 0,
                cloudflareAccountId: settings.cloudflareAccountId || '',
                cloudflareApiToken: settings.cloudflareApiToken || '',
                availableProviders: providers,
                agents,
                projects: _settings.getProjects(),
            };
        }

        case 'SAVE_SETTINGS': {
            const { provider, model, apiKey, tavilyApiKey, spendingLimit, cloudflareAccountId, cloudflareApiToken } = payload;
            const current = _settings.getSettings();
            _settings.saveSettings({
                provider: provider || current.provider,
                model: model || current.model,
                apiKey: typeof apiKey === 'string' ? apiKey : current.apiKey,
                tavilyApiKey: typeof tavilyApiKey === 'string' ? tavilyApiKey : current.tavilyApiKey,
                spendingLimit: typeof spendingLimit === 'number' ? spendingLimit : current.spendingLimit,
                cloudflareAccountId: typeof cloudflareAccountId === 'string' ? cloudflareAccountId : current.cloudflareAccountId,
                cloudflareApiToken: typeof cloudflareApiToken === 'string' ? cloudflareApiToken : current.cloudflareApiToken,
            });
            _log?.('[AI Chat] Settings saved.');
            return { ok: true };
        }

        case 'GET_CHAT_FILES': {
            const { chatId } = payload;
            if (!chatId) throw new Error('chatId is required.');
            const session = chats.get(chatId);
            if (!session) throw new Error(`Chat not found: ${chatId}`);
            return { files: listChatFiles(chatId, session.projectId) };
        }

        case 'DELETE_CHAT_FILE': {
            const { chatId, filename } = payload;
            if (!chatId || !filename) throw new Error('chatId and filename are required.');
            const session = chats.get(chatId);
            if (!session) throw new Error(`Chat not found: ${chatId}`);
            const dir = getChatFilesDir(chatId, session.projectId);
            const safe = filename.replace(/[^a-zA-Z0-9._\-]/g, '_');
            const filePath = path.join(dir, safe);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return { ok: true };
        }

        default:
            throw new Error(`Unknown command: ${command}`);
    }
}

module.exports = { handleCommand };
