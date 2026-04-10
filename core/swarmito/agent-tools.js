const fs = require('fs');
const path = require('path');
const { getCurrentProjectId, getProjectPath, getLog, copyDirSync } = require('./state');
const { globalAgentsDir, projectAgentsDir } = require('./path-helpers');

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
        const _log = getLog();
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

module.exports = { CREATE_AGENT, UPDATE_AGENT, DELETE_AGENT, COPY_AGENT };
