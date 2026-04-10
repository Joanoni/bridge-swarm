const fs = require('fs');
const path = require('path');
const { setState, setCurrentChatId, getDataRoot, getSettings } = require('./swarmito/state');
const { globalAgentsDir, globalTeamsDir } = require('./swarmito/path-helpers');
const { CREATE_AGENT, UPDATE_AGENT, DELETE_AGENT, COPY_AGENT } = require('./swarmito/agent-tools');
const { CREATE_TEAM, UPDATE_TEAM, DELETE_TEAM, COPY_TEAM } = require('./swarmito/team-tools');
const { CREATE_PROJECT, START_CHAT } = require('./swarmito/project-chat-tools');

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

function getSwarmitoPaths() {
    const _dataRoot = getDataRoot();
    const _settings = getSettings();
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

function init({ appRoot, dataRoot, settings, aiChat, broadcast, log }) {
    setState({
        appRoot,
        dataRoot: dataRoot || appRoot,
        settings,
        aiChat,
        broadcast: broadcast || (() => {}),
        log: log || console.log,
    });

    // Ensure global dirs exist in dataRoot
    fs.mkdirSync(globalAgentsDir(), { recursive: true });
    fs.mkdirSync(globalTeamsDir(), { recursive: true });

    (log || console.log)('[Swarmito] Initialized.');
}

module.exports = { init, getSwaarmitoTools, getSwarmitoPaths, setCurrentChatId };
