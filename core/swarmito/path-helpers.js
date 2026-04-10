const path = require('path');
const { getDataRoot, getProjectPath } = require('./state');

function globalAgentsDir() {
    return path.join(getDataRoot(), 'agents');
}

function globalTeamsDir() {
    return path.join(getDataRoot(), 'teams');
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

module.exports = {
    globalAgentsDir,
    globalTeamsDir,
    projectAgentsDir,
    projectTeamsDir,
    resolveAgentDir,
    resolveTeamDir,
};
