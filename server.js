const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const appRoot = path.resolve(__dirname);
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
console.log(`[Server] Port: ${port}`);

// ── Load dependencies ─────────────────────────────────────────────────────────

const express = require('express');
const { WebSocketServer } = require('ws');

const engine   = require('./core/engine');
const settings = require('./core/settings');
const aiTools  = require('./core/ai-tools');
const aiChat   = require('./core/ai-chat');
const aiSwarm  = require('./core/ai-swarm');
const swarmito = require('./core/swarmito');

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

settings.init(appRoot);

aiChat.init({
    appRoot,
    engine,
    settings,
    broadcast,
    log,
});

swarmito.init({
    appRoot,
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

// ── REST API ──────────────────────────────────────────────────────────────────

// Chat commands (main API)
app.post('/api/chat', async (req, res) => {
    const { command, payload } = req.body;
    try {
        const result = await aiChat.handleCommand(command, payload || {});
        res.json({ ok: true, result });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

// Projects
app.get('/api/projects', (req, res) => {
    res.json({ ok: true, projects: settings.getProjects() });
});

app.post('/api/projects', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: 'name is required.' });
    try {
        const crypto = require('crypto');
        const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
        const projectPath = path.join(appRoot, 'projects', id);
        fs.mkdirSync(path.join(projectPath, 'agents'), { recursive: true });
        fs.mkdirSync(path.join(projectPath, 'teams'), { recursive: true });
        fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true });
        fs.mkdirSync(path.join(projectPath, 'chats'), { recursive: true });
        fs.writeFileSync(
            path.join(projectPath, 'project.json'),
            JSON.stringify({ id, name }, null, 2),
            'utf8'
        );
        const project = settings.addProject({ id, name, path: projectPath });
        res.json({ ok: true, project });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.delete('/api/projects/:id', (req, res) => {
    settings.removeProject(req.params.id);
    res.json({ ok: true });
});

// Chats list (lightweight, for sidebar)
// ?projectId=<id>  → chats for that project
// ?projectId=      → global chats (no project)
// (no param)       → all chats
app.get('/api/chats', (req, res) => {
    let projectId;
    if ('projectId' in req.query) {
        projectId = req.query.projectId === '' ? null : req.query.projectId;
    } else {
        projectId = undefined;
    }
    res.json({ ok: true, chats: aiChat.listChats(projectId) });
});

// Reset — wipe all projects, chats, non-swarmito agents/teams; restore default state
app.post('/api/reset', async (req, res) => {
    try {
        // 1. Delete all project directories
        const projectsDir = path.join(appRoot, 'projects');
        if (fs.existsSync(projectsDir)) {
            for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
                if (entry.isDirectory()) {
                    fs.rmSync(path.join(projectsDir, entry.name), { recursive: true, force: true });
                }
            }
        }

        // 2. Clear projects.json
        const projectsJson = path.join(appRoot, 'projects.json');
        fs.writeFileSync(projectsJson, '[]', 'utf8');

        // 3. Delete all global chats
        const chatsDir = path.join(appRoot, 'chats');
        if (fs.existsSync(chatsDir)) {
            fs.rmSync(chatsDir, { recursive: true, force: true });
        }
        fs.mkdirSync(chatsDir, { recursive: true });

        // 4. Delete all global agents except swarmito
        const agentsDir = path.join(appRoot, 'agents');
        if (fs.existsSync(agentsDir)) {
            for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
                if (entry.isDirectory() && entry.name !== 'swarmito') {
                    fs.rmSync(path.join(agentsDir, entry.name), { recursive: true, force: true });
                }
            }
        }

        // 5. Delete all global teams
        const teamsDir = path.join(appRoot, 'teams');
        if (fs.existsSync(teamsDir)) {
            fs.rmSync(teamsDir, { recursive: true, force: true });
        }
        fs.mkdirSync(teamsDir, { recursive: true });

        // 6. Reinitialize aiChat with clean state
        aiChat.deactivate();
        aiChat.init({ appRoot, engine, settings, broadcast, log });

        // 7a. Re-register aiSwarm hooks (deactivate cleared them)
        aiSwarm.init({ aiChat, aiTools, swarmito, broadcast, log });

        // 7. Recreate default Swarmito chat
        const chatId = aiChat.createChat({ name: 'Swarmito', agents: ['swarmito'], projectId: null });
        log(`[Server] Reset complete. Created default Swarmito chat (${chatId})`);

        // 8. Broadcast new state to all clients
        broadcast('INIT_STATE', {
            chats: aiChat.listChats(null),
            projects: settings.getProjects(),
        });

        res.json({ ok: true });
    } catch (err) {
        log(`[Server] Reset failed: ${err.message}`);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── Chat file routes ──────────────────────────────────────────────────────────

function resolveChatFilesDir(chatId) {
    const chat = aiChat.getChat(chatId);
    if (!chat) return null;
    const chatsBase = chat.projectId
        ? (() => {
            const projects = settings.getProjects();
            const project = projects.find(p => p.id === chat.projectId);
            return project ? path.join(project.path, 'chats') : path.join(appRoot, 'chats');
        })()
        : path.join(appRoot, 'chats');
    return path.join(chatsBase, chatId, 'files');
}

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const filesDir = resolveChatFilesDir(req.params.chatId);
            if (!filesDir) return cb(new Error('Chat not found'));
            fs.mkdirSync(filesDir, { recursive: true });
            cb(null, filesDir);
        },
        filename: (req, file, cb) => {
            // Sanitize filename
            const safe = file.originalname.replace(/[^a-zA-Z0-9._\-]/g, '_');
            cb(null, safe);
        },
    }),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

app.get('/api/chat/:chatId/files', (req, res) => {
    const filesDir = resolveChatFilesDir(req.params.chatId);
    if (!filesDir) return res.status(404).json({ ok: false, error: 'Chat not found' });
    if (!fs.existsSync(filesDir)) return res.json({ ok: true, files: [] });
    try {
        const files = fs.readdirSync(filesDir).filter(f => {
            try { return fs.statSync(path.join(filesDir, f)).isFile(); } catch { return false; }
        });
        res.json({ ok: true, files });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/chat/:chatId/files', upload.array('files'), (req, res) => {
    const filesDir = resolveChatFilesDir(req.params.chatId);
    if (!filesDir) return res.status(404).json({ ok: false, error: 'Chat not found' });
    const uploaded = (req.files || []).map(f => f.filename);
    res.json({ ok: true, uploaded });
});

app.delete('/api/chat/:chatId/files/:filename', (req, res) => {
    const filesDir = resolveChatFilesDir(req.params.chatId);
    if (!filesDir) return res.status(404).json({ ok: false, error: 'Chat not found' });
    const safe = req.params.filename.replace(/[^a-zA-Z0-9._\-]/g, '_');
    const filePath = path.join(filesDir, safe);
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

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
