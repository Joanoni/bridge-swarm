const fs = require('fs');
const path = require('path');
const { getDataRoot, getSettings } = require('./state');

function globalAgentsDir() {
    return path.join(getDataRoot(), 'agents');
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
    const _settings = getSettings();
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
    const _settings = getSettings();
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

module.exports = { listAgentsInDir, listAllAgents, loadAgentMeta, loadSystemPrompt };
