// server/routes-projects.js — GET/POST/DELETE /api/projects, POST /api/reset
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = function createProjectRoutes({ settings, aiChat, aiSwarm, aiTools, swarmito, engine, broadcast, log, appRoot, dataRoot }) {
    const router = express.Router();

    // ── Projects ──────────────────────────────────────────────────────────────
    router.get('/api/projects', (req, res) => {
        res.json({ ok: true, projects: settings.getProjects() });
    });

    router.post('/api/projects', (req, res) => {
        const { name } = req.body;
        if (!name) return res.status(400).json({ ok: false, error: 'name is required.' });
        try {
            const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
            const projectPath = path.join(dataRoot, 'projects', id);
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

    router.delete('/api/projects/:id', (req, res) => {
        settings.removeProject(req.params.id);
        res.json({ ok: true });
    });

    // ── Reset — wipe all projects, chats, non-swarmito agents/teams ───────────
    router.post('/api/reset', async (req, res) => {
        try {
            // 1. Delete all project directories
            const projectsDir = path.join(dataRoot, 'projects');
            if (fs.existsSync(projectsDir)) {
                for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
                    if (entry.isDirectory()) {
                        fs.rmSync(path.join(projectsDir, entry.name), { recursive: true, force: true });
                    }
                }
            }

            // 2. Clear projects.json
            const projectsJson = path.join(dataRoot, 'projects.json');
            fs.writeFileSync(projectsJson, '[]', 'utf8');

            // 3. Delete all global chats
            const chatsDir = path.join(dataRoot, 'chats');
            if (fs.existsSync(chatsDir)) {
                fs.rmSync(chatsDir, { recursive: true, force: true });
            }
            fs.mkdirSync(chatsDir, { recursive: true });

            // 4. Delete all global agents except swarmito
            const agentsDir = path.join(dataRoot, 'agents');
            if (fs.existsSync(agentsDir)) {
                for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
                    if (entry.isDirectory() && entry.name !== 'swarmito') {
                        fs.rmSync(path.join(agentsDir, entry.name), { recursive: true, force: true });
                    }
                }
            }

            // 5. Delete all global teams
            const teamsDir = path.join(dataRoot, 'teams');
            if (fs.existsSync(teamsDir)) {
                fs.rmSync(teamsDir, { recursive: true, force: true });
            }
            fs.mkdirSync(teamsDir, { recursive: true });

            // 6. Reinitialize aiChat with clean state
            aiChat.deactivate();
            aiChat.init({ appRoot, dataRoot, engine, settings, broadcast, log });

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

    return router;
};
