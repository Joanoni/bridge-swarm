const http = require('http');
const path = require('path');

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const appRoot = path.resolve(__dirname);
// DATA_DIR separates mutable data (chats, agents, projects, settings) from
// the application code. Defaults to ./data inside the repo for local dev.
// On Railway: mount a persistent volume at /data and set DATA_DIR=/data.
const dataRoot = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
let port = process.env.PORT || 3000;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
        port = parseInt(args[i + 1], 10);
        i++;
    }
}

const { version, name } = require('./package.json');
console.log(`[Server] ${name} v${version}`);
console.log(`[Server] App root: ${appRoot}`);
console.log(`[Server] Data root: ${dataRoot}`);
console.log(`[Server] Port: ${port}`);

// ── Load dependencies ─────────────────────────────────────────────────────────

const express = require('express');
const { WebSocketServer } = require('ws');

const engine       = require('./core/engine');
const settings     = require('./core/settings');
const aiTools      = require('./core/ai-tools');
const aiChat       = require('./core/ai-chat');
const aiSwarm      = require('./core/ai-swarm');
const swarmito     = require('./core/swarmito');
const exportImport = require('./core/export-import');

// ── WebSocket broadcast ───────────────────────────────────────────────────────

const clients = new Set();

function broadcast(event, payload) {
    const msg = JSON.stringify({ event, payload });
    for (const ws of clients) {
        if (ws.readyState === 1 /* OPEN */) {
            ws.send(msg);
        }
    }
}

function log(msg) {
    console.log(msg);
    broadcast('LOG', { message: msg });
}

// ── Initialize core modules ───────────────────────────────────────────────────

settings.init(appRoot, dataRoot);

aiChat.init({
    appRoot,
    dataRoot,
    engine,
    settings,
    broadcast,
    log,
});

swarmito.init({
    appRoot,
    dataRoot,
    settings,
    aiChat,
    broadcast,
    log,
});

aiSwarm.init({
    aiChat,
    aiTools,
    swarmito,
    broadcast,
    log,
});

// Scaffold default Swarmito chat if no chats exist
(function scaffoldDefaultChat() {
    const existingChats = aiChat.listChats();
    if (existingChats.length === 0) {
        const chatId = aiChat.createChat({
            name: 'Swarmito',
            agents: ['swarmito'],
            projectId: null,
        });
        log(`[Server] Created default Swarmito chat (${chatId})`);
    }
})();

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(require('./server/routes-chat')({ aiChat, settings, dataRoot }));
app.use(require('./server/routes-projects')({ settings, aiChat, aiSwarm, aiTools, swarmito, engine, broadcast, log, appRoot, dataRoot }));
app.use(require('./server/routes-export')({ exportImport, settings, aiChat, aiSwarm, aiTools, swarmito, engine, broadcast, log, appRoot, dataRoot }));

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── HTTP + WebSocket server ───────────────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    clients.add(ws);
    log(`[Server] WebSocket client connected (total: ${clients.size})`);

    // Send current state to newly connected client (global chats only on init)
    ws.send(JSON.stringify({ event: 'INIT_STATE', payload: {
        chats: aiChat.listChats(null),
        projects: settings.getProjects(),
    }}));

    ws.on('close', () => {
        clients.delete(ws);
        log(`[Server] WebSocket client disconnected (total: ${clients.size})`);
    });

    ws.on('error', (err) => {
        console.error(`[Server] WebSocket error: ${err.message}`);
        clients.delete(ws);
    });
});

server.listen(port, () => {
    console.log(`[Server] Running at http://localhost:${port}`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

process.on('SIGINT', () => {
    console.log('\n[Server] Shutting down...');
    aiSwarm.deactivate();
    aiChat.deactivate();

    // Close all WebSocket connections so server.close() can finish
    for (const ws of clients) {
        try { ws.terminate(); } catch (_) {}
    }
    clients.clear();

    server.close(() => process.exit(0));

    // Force exit after 3 s if connections still linger
    setTimeout(() => process.exit(0), 3000).unref();
});
