const fs = require('fs');
const path = require('path');
const { chats, getDataRoot, getSettings, getBroadcast, getLog } = require('./state');
const { ChatSession } = require('./session');

function globalChatsDir() {
    return path.join(getDataRoot(), 'chats');
}

function projectChatsDir(projectPath) {
    return path.join(projectPath, 'chats');
}

function resolveChatsDir(projectId) {
    if (!projectId) return globalChatsDir();
    const _settings = getSettings();
    const projects = _settings.getProjects();
    const project = projects.find(p => p.id === projectId);
    return project ? projectChatsDir(project.path) : globalChatsDir();
}

function chatDir(chatId, projectId) {
    return path.join(resolveChatsDir(projectId), chatId);
}

function parseToolResultContent(content) {
    if (typeof content !== 'string') return content;
    try { return JSON.parse(content); } catch { return content; }
}

function enrichRawHistory(history) {
    return history.map(msg => {
        if (msg.role === 'user' && Array.isArray(msg.content)) {
            return {
                ...msg,
                content: msg.content.map(block => {
                    if (block.type === 'tool_result') {
                        return { ...block, content: parseToolResultContent(block.content) };
                    }
                    return block;
                }),
            };
        }
        return msg;
    });
}

function saveChatToDisk(session) {
    const _log = getLog();
    try {
        const dir = chatDir(session.id, session.projectId);
        fs.mkdirSync(dir, { recursive: true });
        // history.json — display-safe (string messages only)
        fs.writeFileSync(path.join(dir, 'history.json'), JSON.stringify(session.toJSON(), null, 2), 'utf8');
        // raw.json — full history with tool_use/_meta, parsed tool_result content
        const enriched = enrichRawHistory(session.history);
        fs.writeFileSync(path.join(dir, 'raw.json'), JSON.stringify(enriched, null, 2), 'utf8');
    } catch (err) {
        _log?.(`[AI Chat] Failed to save chat ${session.id}: ${err.message}`);
    }
}

function loadChatsFromDir(dir) {
    const _log = getLog();
    if (!fs.existsSync(dir)) return;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        // ── New format: chats/<chatId>/history.json ──────────────────────────
        if (entry.isDirectory()) {
            const historyPath = path.join(dir, entry.name, 'history.json');
            if (!fs.existsSync(historyPath)) continue;
            try {
                const data = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
                const session = new ChatSession(data);
                session.history = data.history || [];
                session.totalCostUsd = data.totalCostUsd || 0;
                session.createdAt = data.createdAt || new Date().toISOString();
                session.updatedAt = data.updatedAt || new Date().toISOString();
                chats.set(session.id, session);
            } catch { /* skip corrupt */ }
            continue;
        }

        // ── Legacy format: chats/<chatId>.json — migrate automatically ───────
        if (entry.isFile() && entry.name.endsWith('.json')) {
            const legacyPath = path.join(dir, entry.name);
            try {
                const data = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
                const session = new ChatSession(data);
                session.history = data.history || [];
                session.totalCostUsd = data.totalCostUsd || 0;
                session.createdAt = data.createdAt || new Date().toISOString();
                session.updatedAt = data.updatedAt || new Date().toISOString();
                chats.set(session.id, session);
                // Migrate to new folder structure and remove legacy file
                saveChatToDisk(session);
                fs.unlinkSync(legacyPath);
                _log?.(`[AI Chat] Migrated legacy chat: ${session.id}`);
            } catch { /* skip corrupt */ }
        }
    }
}

function loadChatsFromDisk() {
    const _settings = getSettings();
    // Load global chats
    loadChatsFromDir(globalChatsDir());
    // Load chats from each registered project
    const projects = _settings.getProjects();
    for (const project of projects) {
        if (project.path) loadChatsFromDir(projectChatsDir(project.path));
    }
}

function deleteChatFromDisk(chatId, projectId) {
    try {
        const dir = chatDir(chatId, projectId);
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch { /* ignore */ }
}

function moveChatToProject(chatId, projectId) {
    const _settings = getSettings();
    const _broadcast = getBroadcast();
    const _log = getLog();

    const session = chats.get(chatId);
    if (!session) throw new Error(`Chat not found: ${chatId}`);
    if (session.projectId !== null) throw new Error(`Chat ${chatId} is already in a project.`);

    const projects = _settings.getProjects();
    const project = projects.find(p => p.id === projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const oldDir = chatDir(chatId, null);
    const newDir = path.join(project.path, 'chats', chatId);

    // Copy to new location then remove old
    if (fs.existsSync(oldDir)) {
        fs.mkdirSync(path.dirname(newDir), { recursive: true });
        fs.cpSync(oldDir, newDir, { recursive: true });
        fs.rmSync(oldDir, { recursive: true, force: true });
    }

    // Update in-memory session
    session.projectId = projectId;
    session.updatedAt = new Date().toISOString();

    // Persist at new location
    saveChatToDisk(session);

    // Notify frontend: remove from global list, add to project list
    _broadcast('CHAT_DELETED', { chatId });
    _broadcast('CHAT_CREATED', session.toJSON());

    _log?.(`[AI Chat] Moved chat ${chatId} to project ${projectId}`);
}

module.exports = {
    saveChatToDisk,
    loadChatsFromDir,
    loadChatsFromDisk,
    deleteChatFromDisk,
    moveChatToProject,
    enrichRawHistory,
    parseToolResultContent,
};
