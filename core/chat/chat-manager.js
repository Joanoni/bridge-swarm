const crypto = require('crypto');
const { chats, getBroadcast, getLog } = require('./state');
const { ChatSession } = require('./session');
const { saveChatToDisk, deleteChatFromDisk } = require('./persistence');

function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function createChat({ name, agents, projectId }) {
    const _broadcast = getBroadcast();
    const _log = getLog();
    const id = uid();
    // Always include swarmito
    const agentList = ['swarmito', ...agents.filter(a => a !== 'swarmito')];
    const session = new ChatSession({ id, name, agents: agentList, projectId: projectId || null });
    chats.set(id, session);
    saveChatToDisk(session);
    _broadcast('CHAT_CREATED', session.toJSON());
    _log?.(`[AI Chat] Created chat: ${name} (${id})`);
    return id;
}

function deleteChat(chatId) {
    const _broadcast = getBroadcast();
    const session = chats.get(chatId);
    const projectId = session ? session.projectId : null;
    chats.delete(chatId);
    deleteChatFromDisk(chatId, projectId);
    _broadcast('CHAT_DELETED', { chatId });
}

function getChat(chatId) {
    return chats.get(chatId) || null;
}

function listChats(projectId) {
    // projectId === undefined → return all; null → global only; string → that project only
    return Array.from(chats.values())
        .filter(s => {
            if (projectId === undefined) return true;
            if (projectId === null) return s.projectId === null;
            return s.projectId === projectId;
        })
        .map(s => ({
            id: s.id,
            name: s.name,
            agents: s.agents,
            projectId: s.projectId,
            activeAgentId: s.activeAgentId,
            totalCostUsd: s.totalCostUsd,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            lastMessage: (() => {
                const msgs = s.history.filter(m => typeof m.content === 'string');
                return msgs.length > 0 ? msgs[msgs.length - 1].content.slice(0, 80) : '';
            })(),
        })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function setActiveAgent(chatId, agentId) {
    const _broadcast = getBroadcast();
    const session = chats.get(chatId);
    if (!session) throw new Error(`Chat not found: ${chatId}`);
    session.activeAgentId = agentId;
    _broadcast('AGENT_CHANGED', { chatId, agentId });
}

function setHistory(chatId, messages) {
    const _broadcast = getBroadcast();
    const session = chats.get(chatId);
    if (!session) throw new Error(`Chat not found: ${chatId}`);
    session.history = messages;
    const displayMessages = messages
        .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map(m => ({ role: m.role, content: m.content }));
    _broadcast('REPLACE_HISTORY', { chatId, messages: displayMessages });
    saveChatToDisk(session);
}

function getHistory(chatId) {
    const session = chats.get(chatId);
    return session ? session.history : [];
}

module.exports = { createChat, deleteChat, getChat, listChats, setActiveAgent, setHistory, getHistory };
