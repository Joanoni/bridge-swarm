const { getDataRoot, getSettings } = require('./state');

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
        const _settings = getSettings();
        const _dataRoot = getDataRoot();
        if (!this.projectId) return _dataRoot;
        const projects = _settings.getProjects();
        const project = projects.find(p => p.id === this.projectId);
        return project ? project.path : _dataRoot;
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

module.exports = { ChatSession };
