const fs = require('fs');
const path = require('path');
const { getCurrentProjectId, getProjectPath, copyDirSync } = require('./state');
const { globalTeamsDir, projectTeamsDir } = require('./path-helpers');

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

module.exports = { CREATE_TEAM, UPDATE_TEAM, DELETE_TEAM, COPY_TEAM };
