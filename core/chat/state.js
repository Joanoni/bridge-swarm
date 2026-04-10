// Shared mutable state for the chat domain.
// All sub-modules import from here so they share the same Map instances.

// Map of chatId → ChatSession
const chats = new Map();

// Hook system: hookName → [fn, ...]
const hooks = new Map();

// Injected dependencies (set by ai-chat.js init())
let _appRoot;
let _dataRoot;
let _engine;
let _settings;
let _broadcast;
let _log;

function setState({ appRoot, dataRoot, engine, settings, broadcast, log }) {
    _appRoot = appRoot;
    _dataRoot = dataRoot;
    _engine = engine;
    _settings = settings;
    _broadcast = broadcast;
    _log = log;
}

function getAppRoot() { return _appRoot; }
function getDataRoot() { return _dataRoot; }
function getEngine() { return _engine; }
function getSettings() { return _settings; }
function getBroadcast() { return _broadcast; }
function getLog() { return _log; }

module.exports = {
    chats,
    hooks,
    setState,
    getAppRoot,
    getDataRoot,
    getEngine,
    getSettings,
    getBroadcast,
    getLog,
};
