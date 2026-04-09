const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// ── Module-level state ────────────────────────────────────────────────────────

let _appRoot;
let _engine;
let _settings;
let _broadcast;
let _log;

// Map of chatId → ChatSession
const chats = new Map();

// Hook system
const hooks = new Map();

// ── Utilities ─────────────────────────────────────────────────────────────────

function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

// ── Hook system ───────────────────────────────────────────────────────────────

function use(hookName, fn) {
    if (!hooks.has(hookName)) hooks.set(hookName, []);
    hooks.get(hookName).push(fn);
}

function unuse(hookName, fn) {
    if (!hooks.has(hookName)) return;
    const list = hooks.get(hookName);
    const idx = list.indexOf(fn);
    if (idx !== -1) list.splice(idx, 1);
}

async function runHooks(hookName, data) {
    const result = { cancel: false, extraTools: [] };
    if (!hooks.has(hookName)) return result;
    const handlers = hooks.get(hookName);
    _log?.(`[AI Chat] [hook:${hookName}] Running (${handlers.length} handler(s))`);
    for (const fn of handlers) {
        try {
            const ret = await fn(data);
            if (ret && ret.cancel === true) result.cancel = true;
            if (ret && Array.isArray(ret.extraTools)) result.extraTools.push(...ret.extraTools);
        } catch (err) {
            _log?.(`[AI Chat] [hook:${hookName}] Error: ${err.message}`);
        }
    }
    if (result.extraTools.length > 0) {
        _log?.(`[AI Chat] [hook:${hookName}] Injected ${result.extraTools.length} extra tool(s): [${result.extraTools.map(t => t.definition?.name).join(', ')}]`);
    }
    return result;
}

// ── Agent discovery ───────────────────────────────────────────────────────────

function globalAgentsDir() {
    return path.join(_appRoot, 'agents');
}

function projectAgentsDir(projectPath) {
    return path.join(projectPath, 'agents');
}

function listAgentsInDir(dir, scope) {
    if (!fs.existsSync(dir)) return [];
    const agents = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const agentJsonPath = path.join(dir, entry.name, 'agent.json');
        if (!fs.existsSync(agentJsonPath)) continue;
        try {
            const meta = JSON.parse(fs.readFileSync(agentJsonPath, 'utf8'));
            agents.push({
                id: entry.name,
                name: meta.name || entry.name,
                description: meta.description || '',
                tools: meta.tools || [],
                allowedPaths: meta.allowedPaths || [],
                scope,
            });
        } catch {
            agents.push({ id: entry.name, name: entry.name, description: '', tools: [], allowedPaths: [], scope });
        }
    }
    return agents;
}

function listAllAgents(projectId) {
    const globalAgents = listAgentsInDir(globalAgentsDir(), 'global');
    let projectAgents = [];
    if (projectId) {
        const projects = _settings.getProjects();
        const project = projects.find(p => p.id === projectId);
        if (project) {
            projectAgents = listAgentsInDir(projectAgentsDir(project.path), 'project');
        }
    }
    return [...globalAgents, ...projectAgents];
}

function loadAgentMeta(agentId, projectId) {
    // Try global first, then project
    const globalDir = path.join(globalAgentsDir(), agentId);
    const globalJson = path.join(globalDir, 'agent.json');
    if (fs.existsSync(globalJson)) {
        try {
            const meta = JSON.parse(fs.readFileSync(globalJson, 'utf8'));
            return { ...meta, agentDir: globalDir, scope: 'global' };
        } catch { /* fall through */ }
    }
    if (projectId) {
        const projects = _settings.getProjects();
        const project = projects.find(p => p.id === projectId);
        if (project) {
            const projDir = path.join(projectAgentsDir(project.path), agentId);
            const projJson = path.join(projDir, 'agent.json');
            if (fs.existsSync(projJson)) {
                try {
                    const meta = JSON.parse(fs.readFileSync(projJson, 'utf8'));
                    return { ...meta, agentDir: projDir, scope: 'project' };
                } catch { /* fall through */ }
            }
        }
    }
    return null;
}

function loadSystemPrompt(agentDir) {
    if (!fs.existsSync(agentDir)) return '';

    // Check for systemPromptFiles in agent.json
    const agentJsonPath = path.join(agentDir, 'agent.json');
    let systemPromptFiles = null;
    if (fs.existsSync(agentJsonPath)) {
        try {
            const meta = JSON.parse(fs.readFileSync(agentJsonPath, 'utf8'));
            if (Array.isArray(meta.systemPromptFiles) && meta.systemPromptFiles.length > 0) {
                systemPromptFiles = meta.systemPromptFiles;
            }
        } catch { /* fall through */ }
    }

    if (systemPromptFiles) {
        // Load exactly the listed files in order, resolving relative to agentDir
        return systemPromptFiles
            .map(f => {
                const filePath = path.isAbsolute(f) ? f : path.resolve(agentDir, f);
                try { return fs.readFileSync(filePath, 'utf8'); }
                catch { return ''; }
            })
            .filter(Boolean)
            .join('\n\n');
    }

    // Fallback: load all files in agentDir except agent.json, sorted
    return fs.readdirSync(agentDir)
        .filter(f => f !== 'agent.json')
        .sort()
        .map(f => {
            try { return fs.readFileSync(path.join(agentDir, f), 'utf8'); }
            catch { return ''; }
        })
        .filter(Boolean)
        .join('\n\n');
}

// ── Chat files helpers ────────────────────────────────────────────────────────

function getChatFilesDir(chatId, projectId) {
    const chatsBase = projectId
        ? (() => {
            const projects = _settings.getProjects();
            const project = projects.find(p => p.id === projectId);
            return project ? path.join(project.path, 'chats') : path.join(_appRoot, 'chats');
        })()
        : path.join(_appRoot, 'chats');
    return path.join(chatsBase, chatId, 'files');
}

function listChatFiles(chatId, projectId) {
    const dir = getChatFilesDir(chatId, projectId);
    if (!fs.existsSync(dir)) return [];
    try {
        return fs.readdirSync(dir).filter(f => {
            try { return fs.statSync(path.join(dir, f)).isFile(); } catch { return false; }
        });
    } catch { return []; }
}

function buildFilesSection(chatId, projectId) {
    const files = listChatFiles(chatId, projectId);
    if (files.length === 0) return '';
    const dir = getChatFilesDir(chatId, projectId);
    const lines = files.map(f => `- ${f}`).join('\n');
    return `## Attached Files\n\nThe following files have been attached to this chat and are available at: \`${dir}\`\n\n${lines}\n\nYou can read these files using the \`read_file\` tool with the full path above.`;
}

// ── Context prefix ────────────────────────────────────────────────────────────

function buildContextPrefix(workspaceRoot) {
    const platform = os.platform();
    const release = os.release();
    const isWindows = platform === 'win32';
    const shell = isWindows ? 'PowerShell' : (process.env.SHELL || 'bash');
    const now = new Date().toLocaleString('en-US', { timeZoneName: 'short' });

    return `# Environment Context

- **Operating System:** ${platform} ${release}${isWindows ? ' (Windows)' : ''}
- **Default Shell:** ${shell}
- **Current Time:** ${now}
- **Workspace Root:** ${workspaceRoot || '(unknown)'}

${isWindows ? '> **Note:** Commands run in PowerShell. Use PowerShell syntax: `Get-ChildItem` or `ls`, `New-Item -ItemType Directory` or `mkdir`, `Get-Content` or `cat`, `Remove-Item` or `rm`, `Copy-Item` or `cp`. You can also use most Unix-style aliases.' : ''}

## Tool Usage Rule

Every tool call **must** include a "message" parameter — a single short sentence explaining what you are doing. This is shown as a summary badge in the chat UI. Keep it brief and informative.
`;
}

// ── Chat session ──────────────────────────────────────────────────────────────

class ChatSession {
    constructor({ id, name, agents, projectId }) {
        this.id = id;
        this.name = name;
        this.agents = agents; // array of agentId strings
        this.projectId = projectId || null;
        this.history = [];
        this.activeAgentId = 'swarmito';
        this.totalCostUsd = 0;
        this.createdAt = new Date().toISOString();
        this.updatedAt = new Date().toISOString();
        this._resumeResolve = null;
    }

    getWorkspaceRoot() {
        if (!this.projectId) return _appRoot;
        const projects = _settings.getProjects();
        const project = projects.find(p => p.id === this.projectId);
        return project ? project.path : _appRoot;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            agents: this.agents,
            projectId: this.projectId,
            history: this.history.filter(m =>
                (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
            ),
            activeAgentId: this.activeAgentId,
            totalCostUsd: this.totalCostUsd,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}

// ── Chat persistence ──────────────────────────────────────────────────────────

function globalChatsDir() {
    return path.join(_appRoot, 'chats');
}

function projectChatsDir(projectPath) {
    return path.join(projectPath, 'chats');
}

function resolveChatsDir(projectId) {
    if (!projectId) return globalChatsDir();
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

// ── send_chat_message tool ────────────────────────────────────────────────────

function buildSendChatMessageTool() {
    return {
        definition: {
            name: 'send_chat_message',
            description: 'Sends a message to the user in the chat interface. Always use this tool to communicate with the user.',
            parameters: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'The message text to display to the user.' },
                },
                required: ['text'],
            },
        },
        execute: async ({ text }) => ({ ok: true, displayText: text }),
        toMessage: () => null,
    };
}

// ── Swarm continuation (no user message push, no hooks) ──────────────────────

async function continueSwarm(chatId, tools) {
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
    // If the last history entry is an assistant message (e.g. after injectAssistantMessage),
    // prepend a silent user turn so the API accepts the request.
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

    // Always capture end_turn text, even when displayText was already set by send_chat_message
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

// ── Core send logic ───────────────────────────────────────────────────────────

async function processSendMessage(chatId, content, extraTools = [], pushUserToUI = true, includeSendChatMessage = true) {
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

    // Load agent meta for system prompt and tools
    const agentMeta = loadAgentMeta(resolvedAgentId, session.projectId);
    const agentDir = agentMeta ? agentMeta.agentDir : null;
    const agentSystemPrompt = agentDir ? loadSystemPrompt(agentDir) : '';
    const filesSection = buildFilesSection(chatId, session.projectId);
    const systemPrompt = buildContextPrefix(workspaceRoot) + (agentSystemPrompt ? '\n\n' + agentSystemPrompt : '') + (filesSection ? '\n\n' + filesSection : '');

    // Build tools
    const builtTools = includeSendChatMessage ? [buildSendChatMessageTool()] : [];
    const tools = [...builtTools, ...extraTools, ...hookResult.extraTools];

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

        // Always capture end_turn text, even when displayText was already set by send_chat_message
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

        // Always push the final string-form assistant message so it persists in toJSON()
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

// ── Chat management ───────────────────────────────────────────────────────────

function createChat({ name, agents, projectId }) {
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
    const session = chats.get(chatId);
    if (!session) throw new Error(`Chat not found: ${chatId}`);
    session.activeAgentId = agentId;
    _broadcast('AGENT_CHANGED', { chatId, agentId });
}

function setHistory(chatId, messages) {
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

// ── Inject assistant message (no LLM call) ───────────────────────────────────

async function injectAssistantMessage(chatId, content, agentId) {
    const session = chats.get(chatId);
    if (!session) throw new Error(`Chat not found: ${chatId}`);
    const msg = { role: 'assistant', content };
    session.history.push(msg);
    session.updatedAt = new Date().toISOString();
    _broadcast('APPEND_MESSAGE', { chatId, role: 'assistant', content, agentId: agentId || null });
    saveChatToDisk(session);
    await runHooks('after:message-received', { chatId, content, agentId: agentId || null });
}

// ── Inject assistant message silently (no LLM call, no hooks) ────────────────

async function injectAssistantMessageSilent(chatId, content, agentId) {
    const session = chats.get(chatId);
    if (!session) throw new Error(`Chat not found: ${chatId}`);
    const msg = { role: 'assistant', content };
    session.history.push(msg);
    session.updatedAt = new Date().toISOString();
    _broadcast('APPEND_MESSAGE', { chatId, role: 'assistant', content, agentId: agentId || null });
    saveChatToDisk(session);
}

// ── Command handler ───────────────────────────────────────────────────────────

async function handleCommand(command, payload) {
    switch (command) {

        case 'GET_CHATS': {
            // payload.projectId: undefined = all, null = global, string = project
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
            // Finds the nth user message (by messageIndex in the display-filtered list),
            // replaces its content, truncates everything after it, then re-sends.
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

            // Truncate history at that point (processSendMessage will push the user message)
            session.history = session.history.slice(0, targetIdx);

            // Broadcast the truncated history to UI
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

// ── Lifecycle ─────────────────────────────────────────────────────────────────

function init({ appRoot, engine, settings, broadcast, log }) {
    _appRoot = appRoot;
    _engine = engine;
    _settings = settings;
    _broadcast = broadcast;
    _log = log || console.log;

    // Load persisted chats
    loadChatsFromDisk();

    // Ensure global agents dir exists
    fs.mkdirSync(path.join(appRoot, 'agents'), { recursive: true });

    _log?.('[AI Chat] Initialized.');
}

function deactivate() {
    const hookCount = Array.from(hooks.values()).reduce((sum, arr) => sum + arr.length, 0);
    _log?.(`[AI Chat] Deactivating — clearing ${chats.size} chat(s) and ${hookCount} hook handler(s)`);
    chats.clear();
    hooks.clear();
}

module.exports = {
    init,
    deactivate,
    handleCommand,
    use,
    unuse,
    createChat,
    deleteChat,
    getChat,
    listChats,
    setActiveAgent,
    setHistory,
    getHistory,
    listAllAgents,
    sendMessage: (chatId, content, extraTools, pushUserToUI = true, includeSendChatMessage = true) =>
        processSendMessage(chatId, content, extraTools, pushUserToUI, includeSendChatMessage),
    sendMessageToChat: (chatId, content) => processSendMessage(chatId, content, [], true, true),
    continueSwarm,
    injectAssistantMessage,
    injectAssistantMessageSilent,
};
