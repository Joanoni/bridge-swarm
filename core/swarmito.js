const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let _appRoot;
let _dataRoot;
let _settings;
let _aiChat;
let _broadcast;
let _log;
let _currentChatId = null;

function setCurrentChatId(chatId) {
    _currentChatId = chatId;
}

function getCurrentProjectId() {
    if (!_currentChatId || !_aiChat) return null;
    const session = _aiChat.getChat(_currentChatId);
    return session ? session.projectId : null;
}

function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function globalAgentsDir() {
    return path.join(_dataRoot, 'agents');
}

function globalTeamsDir() {
    return path.join(_dataRoot, 'teams');
}

function projectAgentsDir(projectPath) {
    return path.join(projectPath, 'agents');
}

function projectTeamsDir(projectPath) {
    return path.join(projectPath, 'teams');
}

function resolveAgentDir(agentId, scope, projectPath) {
    if (scope === 'global') return path.join(globalAgentsDir(), agentId);
    return path.join(projectAgentsDir(projectPath), agentId);
}

function resolveTeamDir(teamId, scope, projectPath) {
    if (scope === 'global') return path.join(globalTeamsDir(), teamId);
    return path.join(projectTeamsDir(projectPath), teamId);
}

function getProjectPath(projectId) {
    if (!projectId) return null;
    const projects = _settings.getProjects();
    const project = projects.find(p => p.id === projectId);
    return project ? project.path : null;
}

// ── Agent CRUD ────────────────────────────────────────────────────────────────

const CREATE_AGENT = {
    definition: {
        name: 'create_agent',
        description: 'Creates one or more new agents. Each agent gets an agent.json and a system.md file.',
        parameters: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Brief note shown in chat about what you are creating.' },
                agents: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            agentId: { type: 'string', description: 'Unique slug for the agent (e.g. "developer").' },
                            name: { type: 'string', description: 'Display name.' },
                            description: { type: 'string', description: 'Short description.' },
                            systemPrompt: { type: 'string', description: 'The system prompt content for system.md.' },
                            tools: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Tool names available to this agent.',
                            },
                            allowedPaths: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Paths the agent is allowed to access.',
                            },
                            systemPromptFiles: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Ordered list of file paths (relative to the agent\'s directory) to load as the system prompt. Default: ["system.md"]. Add extra files like shared context or project data as needed.',
                            },
                            scope: { type: 'string', enum: ['global', 'project'], description: '"global" or "project".' },
                            projectId: { type: 'string', description: 'Required if scope is "project".' },
                        },
                        required: ['agentId', 'name', 'scope'],
                    },
                },
            },
            required: ['agents'],
        },
    },
    execute: async ({ agents, message }) => {
        const results = [];
        for (const agent of agents) {
            const { agentId, name, description = '', systemPrompt = '', tools = [], allowedPaths = [], systemPromptFiles, scope } = agent;
            const projectId = agent.projectId || (scope === 'project' ? getCurrentProjectId() : null);
            try {
                let agentDir;
                if (scope === 'global') {
                    agentDir = path.join(globalAgentsDir(), agentId);
                } else {
                    const projectPath = getProjectPath(projectId);
                    if (!projectPath) throw new Error(`Project not found: ${projectId}`);
                    agentDir = path.join(projectAgentsDir(projectPath), agentId);
                }
                fs.mkdirSync(agentDir, { recursive: true });
                const agentMeta = { name, description, tools, allowedPaths, systemPromptFiles: systemPromptFiles || ['system.md'] };
                fs.writeFileSync(path.join(agentDir, 'agent.json'), JSON.stringify(agentMeta, null, 4), 'utf8');
                fs.writeFileSync(path.join(agentDir, 'system.md'), systemPrompt || `# ${name}\n\n${description}\n`, 'utf8');
                _log(`[Swarmito] Created agent: ${scope}:${agentId}`);
                results.push({ agentId, scope, ok: true });
            } catch (err) {
                results.push({ agentId, scope, ok: false, error: err.message });
            }
        }
        return { ok: true, results };
    },
    toMessage: ({ agents, message }, _result, agentId) => {
        const note = message ? `${message}\n` : '';
        const names = (agents || []).map(a => a.agentId).join(', ');
        return `[${agentId}] 🤖 ${note}create_agent: ${names}`;
    },
};

const UPDATE_AGENT = {
    definition: {
        name: 'update_agent',
        description: 'Updates fields of one or more existing agents.',
        parameters: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Brief note shown in chat about what you are updating.' },
                agents: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            agentId: { type: 'string' },
                            scope: { type: 'string', enum: ['global', 'project'] },
                            projectId: { type: 'string' },
                            name: { type: 'string' },
                            description: { type: 'string' },
                            systemPrompt: { type: 'string' },
                            tools: { type: 'array', items: { type: 'string' } },
                            allowedPaths: { type: 'array', items: { type: 'string' } },
                        },
                        required: ['agentId', 'scope'],
                    },
                },
            },
            required: ['agents'],
        },
    },
    execute: async ({ agents }) => {
        const results = [];
        for (const agent of agents) {
            const { agentId, scope, systemPrompt, ...metaUpdates } = agent;
            const projectId = agent.projectId || (scope === 'project' ? getCurrentProjectId() : null);
            try {
                let agentDir;
                if (scope === 'global') {
                    agentDir = path.join(globalAgentsDir(), agentId);
                } else {
                    const projectPath = getProjectPath(projectId);
                    if (!projectPath) throw new Error(`Project not found: ${projectId}`);
                    agentDir = path.join(projectAgentsDir(projectPath), agentId);
                }
                const agentJsonPath = path.join(agentDir, 'agent.json');
                if (!fs.existsSync(agentJsonPath)) throw new Error(`Agent not found: ${agentId}`);
                const current = JSON.parse(fs.readFileSync(agentJsonPath, 'utf8'));
                const updated = Object.assign({}, current, metaUpdates);
                fs.writeFileSync(agentJsonPath, JSON.stringify(updated, null, 4), 'utf8');
                if (typeof systemPrompt === 'string') {
                    fs.writeFileSync(path.join(agentDir, 'system.md'), systemPrompt, 'utf8');
                }
                results.push({ agentId, scope, ok: true });
            } catch (err) {
                results.push({ agentId, scope, ok: false, error: err.message });
            }
        }
        return { ok: true, results };
    },
    toMessage: ({ agents, message }, _result, agentId) => {
        const note = message ? `${message}\n` : '';
        const names = (agents || []).map(a => a.agentId).join(', ');
        return `[${agentId}] 🤖 ${note}update_agent: ${names}`;
    },
};

const DELETE_AGENT = {
    definition: {
        name: 'delete_agent',
        description: 'Deletes one or more agents.',
        parameters: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Brief note shown in chat about what you are deleting.' },
                agents: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            agentId: { type: 'string' },
                            scope: { type: 'string', enum: ['global', 'project'] },
                            projectId: { type: 'string' },
                        },
                        required: ['agentId', 'scope'],
                    },
                },
            },
            required: ['agents'],
        },
    },
    execute: async ({ agents }) => {
        const results = [];
        for (const agentEntry of agents) {
            const { agentId, scope } = agentEntry;
            const projectId = agentEntry.projectId || (scope === 'project' ? getCurrentProjectId() : null);
            try {
                let agentDir;
                if (scope === 'global') {
                    agentDir = path.join(globalAgentsDir(), agentId);
                } else {
                    const projectPath = getProjectPath(projectId);
                    if (!projectPath) throw new Error(`Project not found: ${projectId}`);
                    agentDir = path.join(projectAgentsDir(projectPath), agentId);
                }
                fs.rmSync(agentDir, { recursive: true, force: true });
                results.push({ agentId, scope, ok: true });
            } catch (err) {
                results.push({ agentId, scope, ok: false, error: err.message });
            }
        }
        return { ok: true, results };
    },
    toMessage: ({ agents, message }, _result, agentId) => {
        const note = message ? `${message}\n` : '';
        const names = (agents || []).map(a => a.agentId).join(', ');
        return `[${agentId}] 🤖 ${note}delete_agent: ${names}`;
    },
};

const COPY_AGENT = {
    definition: {
        name: 'copy_agent',
        description: 'Copies one or more agents between scopes (global ↔ project) or between projects.',
        parameters: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Brief note shown in chat about what you are copying.' },
                copies: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            agentId: { type: 'string' },
                            fromScope: { type: 'string', enum: ['global', 'project'] },
                            fromProjectId: { type: 'string' },
                            toScope: { type: 'string', enum: ['global', 'project'] },
                            toProjectId: { type: 'string' },
                            newAgentId: { type: 'string', description: 'Optional new ID for the copy.' },
                        },
                        required: ['agentId', 'fromScope', 'toScope'],
                    },
                },
            },
            required: ['copies'],
        },
    },
    execute: async ({ copies }) => {
        const results = [];
        for (const copy of copies) {
            const { agentId, fromScope, toScope, newAgentId } = copy;
            const fromProjectId = copy.fromProjectId || (fromScope === 'project' ? getCurrentProjectId() : null);
            const toProjectId = copy.toProjectId || (toScope === 'project' ? getCurrentProjectId() : null);
            try {
                let fromDir, toDir;
                if (fromScope === 'global') {
                    fromDir = path.join(globalAgentsDir(), agentId);
                } else {
                    const p = getProjectPath(fromProjectId);
                    if (!p) throw new Error(`Source project not found: ${fromProjectId}`);
                    fromDir = path.join(projectAgentsDir(p), agentId);
                }
                const destId = newAgentId || agentId;
                if (toScope === 'global') {
                    toDir = path.join(globalAgentsDir(), destId);
                } else {
                    const p = getProjectPath(toProjectId);
                    if (!p) throw new Error(`Destination project not found: ${toProjectId}`);
                    toDir = path.join(projectAgentsDir(p), destId);
                }
                copyDirSync(fromDir, toDir);
                results.push({ agentId, destId, fromScope, toScope, ok: true });
            } catch (err) {
                results.push({ agentId, fromScope, toScope, ok: false, error: err.message });
            }
        }
        return { ok: true, results };
    },
    toMessage: ({ copies, message }, _result, agentId) => {
        const note = message ? `${message}\n` : '';
        const names = (copies || []).map(c => c.agentId).join(', ');
        return `[${agentId}] 🤖 ${note}copy_agent: ${names}`;
    },
};

// ── Team CRUD ─────────────────────────────────────────────────────────────────

const CREATE_TEAM = {
    definition: {
        name: 'create_team',
        description: 'Creates one or more teams. A team is a named group of agents.',
        parameters: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Brief note shown in chat about what you are creating.' },
                teams: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            teamId: { type: 'string' },
                            name: { type: 'string' },
                            description: { type: 'string' },
                            agents: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Agent IDs in format "global:<agentId>" or "project:<agentId>".',
                            },
                            scope: { type: 'string', enum: ['global', 'project'] },
                            projectId: { type: 'string' },
                        },
                        required: ['teamId', 'name', 'scope'],
                    },
                },
            },
            required: ['teams'],
        },
    },
    execute: async ({ teams }) => {
        const results = [];
        for (const teamEntry of teams) {
            const { teamId, name, description = '', agents = [], scope } = teamEntry;
            const projectId = teamEntry.projectId || (scope === 'project' ? getCurrentProjectId() : null);
            try {
                let teamDir;
                if (scope === 'global') {
                    teamDir = path.join(globalTeamsDir(), teamId);
                } else {
                    const projectPath = getProjectPath(projectId);
                    if (!projectPath) throw new Error(`Project not found: ${projectId}`);
                    teamDir = path.join(projectTeamsDir(projectPath), teamId);
                }
                fs.mkdirSync(teamDir, { recursive: true });
                fs.writeFileSync(path.join(teamDir, 'team.json'), JSON.stringify({ name, description, agents }, null, 4), 'utf8');
                results.push({ teamId, scope, ok: true });
            } catch (err) {
                results.push({ teamId, scope, ok: false, error: err.message });
            }
        }
        return { ok: true, results };
    },
    toMessage: ({ teams, message }, _result, agentId) => {
        const note = message ? `${message}\n` : '';
        const names = (teams || []).map(t => t.teamId).join(', ');
        return `[${agentId}] 👥 ${note}create_team: ${names}`;
    },
};

const UPDATE_TEAM = {
    definition: {
        name: 'update_team',
        description: 'Updates one or more teams.',
        parameters: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Brief note shown in chat about what you are updating.' },
                teams: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            teamId: { type: 'string' },
                            scope: { type: 'string', enum: ['global', 'project'] },
                            projectId: { type: 'string' },
                            name: { type: 'string' },
                            description: { type: 'string' },
                            agents: { type: 'array', items: { type: 'string' } },
                        },
                        required: ['teamId', 'scope'],
                    },
                },
            },
            required: ['teams'],
        },
    },
    execute: async ({ teams }) => {
        const results = [];
        for (const teamEntry of teams) {
            const { teamId, scope, ...updates } = teamEntry;
            const projectId = teamEntry.projectId || (scope === 'project' ? getCurrentProjectId() : null);
            try {
                let teamDir;
                if (scope === 'global') {
                    teamDir = path.join(globalTeamsDir(), teamId);
                } else {
                    const projectPath = getProjectPath(projectId);
                    if (!projectPath) throw new Error(`Project not found: ${projectId}`);
                    teamDir = path.join(projectTeamsDir(projectPath), teamId);
                }
                const teamJsonPath = path.join(teamDir, 'team.json');
                if (!fs.existsSync(teamJsonPath)) throw new Error(`Team not found: ${teamId}`);
                const current = JSON.parse(fs.readFileSync(teamJsonPath, 'utf8'));
                fs.writeFileSync(teamJsonPath, JSON.stringify(Object.assign({}, current, updates), null, 4), 'utf8');
                results.push({ teamId, scope, ok: true });
            } catch (err) {
                results.push({ teamId, scope, ok: false, error: err.message });
            }
        }
        return { ok: true, results };
    },
    toMessage: ({ teams, message }, _result, agentId) => {
        const note = message ? `${message}\n` : '';
        const names = (teams || []).map(t => t.teamId).join(', ');
        return `[${agentId}] 👥 ${note}update_team: ${names}`;
    },
};

const DELETE_TEAM = {
    definition: {
        name: 'delete_team',
        description: 'Deletes one or more teams.',
        parameters: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Brief note shown in chat about what you are deleting.' },
                teams: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            teamId: { type: 'string' },
                            scope: { type: 'string', enum: ['global', 'project'] },
                            projectId: { type: 'string' },
                        },
                        required: ['teamId', 'scope'],
                    },
                },
            },
            required: ['teams'],
        },
    },
    execute: async ({ teams }) => {
        const results = [];
        for (const teamEntry of teams) {
            const { teamId, scope } = teamEntry;
            const projectId = teamEntry.projectId || (scope === 'project' ? getCurrentProjectId() : null);
            try {
                let teamDir;
                if (scope === 'global') {
                    teamDir = path.join(globalTeamsDir(), teamId);
                } else {
                    const projectPath = getProjectPath(projectId);
                    if (!projectPath) throw new Error(`Project not found: ${projectId}`);
                    teamDir = path.join(projectTeamsDir(projectPath), teamId);
                }
                fs.rmSync(teamDir, { recursive: true, force: true });
                results.push({ teamId, scope, ok: true });
            } catch (err) {
                results.push({ teamId, scope, ok: false, error: err.message });
            }
        }
        return { ok: true, results };
    },
    toMessage: ({ teams, message }, _result, agentId) => {
        const note = message ? `${message}\n` : '';
        const names = (teams || []).map(t => t.teamId).join(', ');
        return `[${agentId}] 👥 ${note}delete_team: ${names}`;
    },
};

const COPY_TEAM = {
    definition: {
        name: 'copy_team',
        description: 'Copies one or more teams between scopes.',
        parameters: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Brief note shown in chat about what you are copying.' },
                copies: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            teamId: { type: 'string' },
                            fromScope: { type: 'string', enum: ['global', 'project'] },
                            fromProjectId: { type: 'string' },
                            toScope: { type: 'string', enum: ['global', 'project'] },
                            toProjectId: { type: 'string' },
                            newTeamId: { type: 'string' },
                        },
                        required: ['teamId', 'fromScope', 'toScope'],
                    },
                },
            },
            required: ['copies'],
        },
    },
    execute: async ({ copies }) => {
        const results = [];
        for (const copy of copies) {
            const { teamId, fromScope, toScope, newTeamId } = copy;
            const fromProjectId = copy.fromProjectId || (fromScope === 'project' ? getCurrentProjectId() : null);
            const toProjectId = copy.toProjectId || (toScope === 'project' ? getCurrentProjectId() : null);
            try {
                let fromDir, toDir;
                if (fromScope === 'global') {
                    fromDir = path.join(globalTeamsDir(), teamId);
                } else {
                    const p = getProjectPath(fromProjectId);
                    if (!p) throw new Error(`Source project not found: ${fromProjectId}`);
                    fromDir = path.join(projectTeamsDir(p), teamId);
                }
                const destId = newTeamId || teamId;
                if (toScope === 'global') {
                    toDir = path.join(globalTeamsDir(), destId);
                } else {
                    const p = getProjectPath(toProjectId);
                    if (!p) throw new Error(`Destination project not found: ${toProjectId}`);
                    toDir = path.join(projectTeamsDir(p), destId);
                }
                copyDirSync(fromDir, toDir);
                results.push({ teamId, destId, fromScope, toScope, ok: true });
            } catch (err) {
                results.push({ teamId, fromScope, toScope, ok: false, error: err.message });
            }
        }
        return { ok: true, results };
    },
    toMessage: ({ copies, message }, _result, agentId) => {
        const note = message ? `${message}\n` : '';
        const names = (copies || []).map(c => c.teamId).join(', ');
        return `[${agentId}] 👥 ${note}copy_team: ${names}`;
    },
};

// ── Project management ────────────────────────────────────────────────────────

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

// ── Chat management ───────────────────────────────────────────────────────────

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
                // Resolve source dir — originating chat (global: chats/<id>/files/)
                const srcChatSession = _aiChat.getChat(_currentChatId);
                const srcChatsBase = (srcChatSession && srcChatSession.projectId)
                    ? (() => {
                        const p = getProjectPath(srcChatSession.projectId);
                        return p ? path.join(p, 'chats') : path.join(_dataRoot, 'chats');
                    })()
                    : path.join(_dataRoot, 'chats');
                const srcFilesDir = path.join(srcChatsBase, _currentChatId, 'files');

                // Resolve destination dir — new chat
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
                // Inject the briefing silently — no hooks fired, no tag-based routing triggered
                const senderAgentId = firstAgent || 'swarmito';
                await _aiChat.injectAssistantMessageSilent(chatId, initialMessage, senderAgentId);
                // Set the active agent to the first real agent so it's ready to act
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

// ── Utility ───────────────────────────────────────────────────────────────────

function copyDirSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// ── Swarmito allowed paths ────────────────────────────────────────────────────

function getSwarmitoPaths() {
    const paths = [
        path.join(_dataRoot, 'agents'),
        path.join(_dataRoot, 'teams'),
        path.join(_dataRoot, 'chats'),
    ];
    const projects = _settings.getProjects();
    for (const project of projects) {
        paths.push(path.join(project.path, 'agents'));
        paths.push(path.join(project.path, 'teams'));
    }
    return paths;
}

// ── Public API ────────────────────────────────────────────────────────────────

function getSwaarmitoTools() {
    return [
        CREATE_AGENT,
        UPDATE_AGENT,
        DELETE_AGENT,
        COPY_AGENT,
        CREATE_TEAM,
        UPDATE_TEAM,
        DELETE_TEAM,
        COPY_TEAM,
        CREATE_PROJECT,
        START_CHAT,
    ].map(tool => ({
        definition: tool.definition,
        execute: tool.execute,
        toMessage: tool.toMessage || null,
    }));
}

function init({ appRoot, dataRoot, settings, aiChat, broadcast, log }) {
    _appRoot = appRoot;
    _dataRoot = dataRoot || appRoot;
    _settings = settings;
    _aiChat = aiChat;
    _broadcast = broadcast || (() => {});
    _log = log || console.log;

    // Ensure global dirs exist in dataRoot
    fs.mkdirSync(globalAgentsDir(), { recursive: true });
    fs.mkdirSync(globalTeamsDir(), { recursive: true });

    _log('[Swarmito] Initialized.');
}

module.exports = { init, getSwaarmitoTools, getSwarmitoPaths, setCurrentChatId };
