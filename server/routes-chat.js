// server/routes-chat.js — POST /api/chat, GET /api/chats, chat file routes
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

module.exports = function createChatRoutes({ aiChat, settings, dataRoot }) {
    const router = express.Router();

    // ── Chat commands (main API) ───────────────────────────────────────────────
    router.post('/api/chat', async (req, res) => {
        const { command, payload } = req.body;
        try {
            const result = await aiChat.handleCommand(command, payload || {});
            res.json({ ok: true, result });
        } catch (err) {
            res.status(400).json({ ok: false, error: err.message });
        }
    });

    // ── Chats list (lightweight, for sidebar) ─────────────────────────────────
    // ?projectId=<id>  → chats for that project
    // ?projectId=      → global chats (no project)
    // (no param)       → all chats
    router.get('/api/chats', (req, res) => {
        let projectId;
        if ('projectId' in req.query) {
            projectId = req.query.projectId === '' ? null : req.query.projectId;
        } else {
            projectId = undefined;
        }
        res.json({ ok: true, chats: aiChat.listChats(projectId) });
    });

    // ── Chat file helpers ─────────────────────────────────────────────────────
    function resolveChatFilesDir(chatId) {
        const chat = aiChat.getChat(chatId);
        if (!chat) return null;
        const chatsBase = chat.projectId
            ? (() => {
                const projects = settings.getProjects();
                const project = projects.find(p => p.id === chat.projectId);
                return project ? path.join(project.path, 'chats') : path.join(dataRoot, 'chats');
            })()
            : path.join(dataRoot, 'chats');
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
                const safe = file.originalname.replace(/[^a-zA-Z0-9._\-]/g, '_');
                cb(null, safe);
            },
        }),
        limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
    });

    // ── Chat file routes ──────────────────────────────────────────────────────
    router.get('/api/chat/:chatId/files', (req, res) => {
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

    router.post('/api/chat/:chatId/files', upload.array('files'), (req, res) => {
        const filesDir = resolveChatFilesDir(req.params.chatId);
        if (!filesDir) return res.status(404).json({ ok: false, error: 'Chat not found' });
        const uploaded = (req.files || []).map(f => f.filename);
        res.json({ ok: true, uploaded });
    });

    router.delete('/api/chat/:chatId/files/:filename', (req, res) => {
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

    return router;
};
