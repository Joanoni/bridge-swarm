const fs = require('fs');
const path = require('path');
const { uid, getCurrentChatId, getCurrentProjectId, getDataRoot, getSettings, getAiChat, getBroadcast, getLog, getProjectPath } = require('./state');

const CREATE_PROJECT = {
    definition: {
        name: 'create_project',
        description: 'Creates a new project. The project folder is automatically created inside the app\'s projects/ directory. No path input needed.',
        parameters: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Brief note shown in chat about the project being created.' },
                projects: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: 'Display name for the project.' },
                        },
                        required: ['name'],
                    },
                },
            },
            required: ['projects'],
        },
    },
    execute: async ({ projects, message }) => {
        const _dataRoot = getDataRoot();
        const _settings = getSettings();
        const _broadcast = getBroadcast();
        const _log = getLog();
        const results = [];
        for (const { name } of projects) {
            try {
                const id = uid();
                const projectPath = path.join(_dataRoot, 'projects', id);
                fs.mkdirSync(path.join(projectPath, 'agents'), { recursive: true });
                fs.mkdirSync(path.join(projectPath, 'teams'), { recursive: true });
                fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true });
                fs.mkdirSync(path.join(projectPath, 'chats'), { recursive: true });
                fs.writeFileSync(
                    path.join(projectPath, 'project.json'),
                    JSON.stringify({ id, name }, null, 2),
                    'utf8'
                );
                const project = { id, name, path: projectPath };
                _settings.addProject(project);
                _broadcast('PROJECTS_UPDATED', { projects: _settings.getProjects() });
                _log(`[Swarmito] Created project: ${name} at ${projectPath}`);
                results.push({ id, name, path: projectPath, ok: true });
            } catch (err) {
                results.push({ name, ok: false, error: err.message });
            }
        }
        return { ok: true, results };
    },
    toMessage: ({ projects, message }, _result, agentId) => {
        const note = message ? `${message}\n` : '';
        const names = (projects || []).map(p => p.name).join(', ');
        return `[${agentId}] 📦 ${note}create_project: ${names}`;
    },
};

const START_CHAT = {
    definition: {
        name: 'start_chat',
        description: 'Creates a new chat session with a specified set of agents. Swarmito always participates. Use initialMessage to inject a briefing directly as an assistant message (no LLM call) to the first agent.',
        parameters: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Brief note shown in chat about the chat being created.' },
                name: { type: 'string', description: 'Display name for the chat.' },
                agents: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Agent IDs to include (e.g. ["developer", "reviewer"]). Swarmito is always included.',
                },
                projectId: { type: 'string', description: 'Optional project context for this chat.' },
                initialMessage: {
                    type: 'string',
                    description: 'Briefing message injected directly as an assistant message in the new chat. Should end with @firstAgentId to route to the first agent.',
                },
                firstAgentId: {
                    type: 'string',
                    description: 'The agent ID that will receive the initial message (used as the sender badge). Must be one of the agents in the chat.',
                },
                attachFiles: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optional list of file names from the current chat\'s attached files (the "files" folder of the originating chat) to copy into the new chat. Use this to pass reference files, images, or documents to the new project chat.',
                },
            },
            required: ['name', 'agents'],
        },
    },
    execute: async ({ name, agents, projectId, initialMessage, firstAgentId, attachFiles }) => {
        const _dataRoot = getDataRoot();
        const _aiChat = getAiChat();
        const _broadcast = getBroadcast();
        const _log = getLog();
        const _currentChatId = getCurrentChatId();

        try {
            const chatId = _aiChat.createChat({ name, agents, projectId });
            _log(`[Swarmito] Started chat: ${name} (${chatId})`);

            // If the new chat belongs to a project and the originating chat is global, move it
            if (projectId && _currentChatId) {
                const originSession = _aiChat.getChat(_currentChatId);
                if (originSession && originSession.projectId === null) {
                    try {
                        _aiChat.moveChatToProject(_currentChatId, projectId);
                        _log(`[Swarmito] Moved originating chat ${_currentChatId} to project ${projectId}`);
                    } catch (moveErr) {
                        _log(`[Swarmito] Could not move originating chat: ${moveErr.message}`);
                    }
                }
            }

            // Navigate the frontend to the new chat immediately
            _broadcast('OPEN_CHAT', { chatId });

            const firstAgent = firstAgentId || (agents && agents.length > 0 ? agents[0] : null);

            // Copy attached files from the originating chat's files folder to the new chat's files folder
            const attachedFiles = [];
            if (Array.isArray(attachFiles) && attachFiles.length > 0 && _currentChatId) {
                const srcChatSession = _aiChat.getChat(_currentChatId);
                const srcChatsBase = (srcChatSession && srcChatSession.projectId)
                    ? (() => {
                        const p = getProjectPath(srcChatSession.projectId);
                        return p ? path.join(p, 'chats') : path.join(_dataRoot, 'chats');
                    })()
                    : path.join(_dataRoot, 'chats');
                const srcFilesDir = path.join(srcChatsBase, _currentChatId, 'files');

                const resolvedProjectId = projectId || null;
                const destChatsBase = resolvedProjectId
                    ? (() => {
                        const p = getProjectPath(resolvedProjectId);
                        return p ? path.join(p, 'chats') : path.join(_dataRoot, 'chats');
                    })()
                    : path.join(_dataRoot, 'chats');
                const destFilesDir = path.join(destChatsBase, chatId, 'files');

                if (fs.existsSync(srcFilesDir)) {
                    fs.mkdirSync(destFilesDir, { recursive: true });
                    for (const filename of attachFiles) {
                        const safe = filename.replace(/[^a-zA-Z0-9._\-]/g, '_');
                        const srcPath = path.join(srcFilesDir, safe);
                        const destPath = path.join(destFilesDir, safe);
                        try {
                            if (fs.existsSync(srcPath)) {
                                fs.copyFileSync(srcPath, destPath);
                                attachedFiles.push(safe);
                                _log(`[Swarmito] Copied file "${safe}" to new chat ${chatId}`);
                            } else {
                                _log(`[Swarmito] File "${safe}" not found in source chat files — skipped`);
                            }
                        } catch (copyErr) {
                            _log(`[Swarmito] Failed to copy "${safe}": ${copyErr.message}`);
                        }
                    }
                } else {
                    _log(`[Swarmito] Source files dir not found: ${srcFilesDir}`);
                }
            }

            if (initialMessage) {
                const senderAgentId = firstAgent || 'swarmito';
                await _aiChat.injectAssistantMessageSilent(chatId, initialMessage, senderAgentId);
                if (firstAgent) {
                    _aiChat.setActiveAgent(chatId, firstAgent);
                }
            }

            return { ok: true, chatId, name, firstAgentId: firstAgent || null, attachedFiles };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    },
    toMessage: ({ name, agents, message }, _result, agentId) => {
        const note = message ? `${message}\n` : '';
        const agentList = (agents || []).join(', ');
        return `[${agentId}] 💬 ${note}start_chat: "${name}" [${agentList}]`;
    },
};

module.exports = { CREATE_PROJECT, START_CHAT };
