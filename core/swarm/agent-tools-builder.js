const path = require('path');
const settings = require('../settings');
const { buildHandoffTool } = require('./handoff-tool');

// _aiChat, _aiTools, _swarmito, _log are injected by swarm-loop.js
let _aiChat;
let _aiTools;
let _swarmito;
let _log;

function setDeps(aiChat, aiTools, swarmito, log) {
    _aiChat = aiChat;
    _aiTools = aiTools;
    _swarmito = swarmito;
    _log = log;
}

function buildAgentTools(agentId, chatId) {
    const session = _aiChat.getChat(chatId);
    if (!session) {
        _log(`[AI Swarm] buildAgentTools: chat ${chatId} not found — returning only handoff tool`);
        return [buildHandoffTool(chatId)];
    }

    const workspaceRoot = session.getWorkspaceRoot();
    const allAgents = _aiChat.listAllAgents(session.projectId);
    const agentMeta = allAgents.find(a => a.id === agentId);

    if (!agentMeta) {
        _log(`[AI Swarm] buildAgentTools: agent "${agentId}" not found in available agents [${allAgents.map(a => a.id).join(', ')}]`);
    }

    let fileTools = [];
    if (agentMeta && agentMeta.tools && agentMeta.tools.length > 0) {
        const allowedPaths = (agentMeta.allowedPaths || []).map(p =>
            path.isAbsolute(p) ? p : path.resolve(workspaceRoot, p)
        );
        const currentSettings = settings.getSettings();
        fileTools = _aiTools.getToolsForAgent(agentMeta.tools, {
            allowedPaths,
            workspaceRoot,
            tavilyApiKey: currentSettings.tavilyApiKey || '',
            cloudflareAccountId: currentSettings.cloudflareAccountId || '',
            cloudflareApiToken: currentSettings.cloudflareApiToken || '',
        });
    }

    // Swarmito gets its own special tools
    if (agentId === 'swarmito') {
        _swarmito.setCurrentChatId(chatId);
        const swaarmitoTools = _swarmito.getSwaarmitoTools();
        const allTools = [...fileTools, ...swaarmitoTools, buildHandoffTool(chatId)];
        _log(`[AI Swarm] [${chatId.slice(0,8)}] buildAgentTools: agent="${agentId}" tools=[${allTools.map(t => t.definition.name).join(', ')}]`);
        return allTools;
    }

    const allTools = [...fileTools, buildHandoffTool(chatId)];
    _log(`[AI Swarm] [${chatId.slice(0,8)}] buildAgentTools: agent="${agentId}" tools=[${allTools.map(t => t.definition.name).join(', ')}]`);
    return allTools;
}

module.exports = { buildAgentTools, setDeps };
