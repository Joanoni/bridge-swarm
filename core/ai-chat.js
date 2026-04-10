const fs = require('fs');
const path = require('path');
const { chats, hooks, setState } = require('./chat/state');
const { use, unuse } = require('./chat/hooks');
const { listAllAgents } = require('./chat/agent-loader');
const { loadChatsFromDisk } = require('./chat/persistence');
const { moveChatToProject } = require('./chat/persistence');
const { processSendMessage, continueSwarm, injectAssistantMessage, injectAssistantMessageSilent } = require('./chat/message-handler');
const { createChat, deleteChat, getChat, listChats, setActiveAgent, setHistory, getHistory } = require('./chat/chat-manager');
const { handleCommand } = require('./chat/commands');

function init({ appRoot, dataRoot, engine, settings, broadcast, log }) {
    setState({
        appRoot,
        dataRoot: dataRoot || appRoot,
        engine,
        settings,
        broadcast,
        log: log || console.log,
    });

    // Load persisted chats
    loadChatsFromDisk();

    // Ensure global dirs exist in dataRoot
    const _dataRoot = dataRoot || appRoot;
    fs.mkdirSync(path.join(_dataRoot, 'agents'), { recursive: true });
    fs.mkdirSync(path.join(_dataRoot, 'chats'), { recursive: true });

    (log || console.log)?.('[AI Chat] Initialized.');
}

function deactivate() {
    const hookCount = Array.from(hooks.values()).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`[AI Chat] Deactivating — clearing ${chats.size} chat(s) and ${hookCount} hook handler(s)`);
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
    sendMessage: (chatId, content, extraTools, pushUserToUI = true) =>
        processSendMessage(chatId, content, extraTools, pushUserToUI),
    sendMessageToChat: (chatId, content) => processSendMessage(chatId, content, [], true),
    continueSwarm,
    injectAssistantMessage,
    injectAssistantMessageSilent,
    moveChatToProject,
};
