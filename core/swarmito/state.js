const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let _appRoot;
let _dataRoot;
let _settings;
let _aiChat;
let _broadcast;
let _log;
let _currentChatId = null;

function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function setState({ appRoot, dataRoot, settings, aiChat, broadcast, log }) {
    _appRoot = appRoot;
    _dataRoot = dataRoot;
    _settings = settings;
    _aiChat = aiChat;
    _broadcast = broadcast;
    _log = log;
}

function setCurrentChatId(chatId) {
    _currentChatId = chatId;
}

function getCurrentChatId() {
    return _currentChatId;
}

function getCurrentProjectId() {
    if (!_currentChatId || !_aiChat) return null;
    const session = _aiChat.getChat(_currentChatId);
    return session ? session.projectId : null;
}

function getAppRoot() { return _appRoot; }
function getDataRoot() { return _dataRoot; }
function getSettings() { return _settings; }
function getAiChat() { return _aiChat; }
function getBroadcast() { return _broadcast; }
function getLog() { return _log; }

function getProjectPath(projectId) {
    if (!projectId) return null;
    const projects = _settings.getProjects();
    const project = projects.find(p => p.id === projectId);
    return project ? project.path : null;
}

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

module.exports = {
    uid,
    setState,
    setCurrentChatId,
    getCurrentChatId,
    getCurrentProjectId,
    getAppRoot,
    getDataRoot,
    getSettings,
    getAiChat,
    getBroadcast,
    getLog,
    getProjectPath,
    copyDirSync,
};
