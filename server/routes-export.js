// server/routes-export.js — GET /api/export, POST /api/import
const express = require('express');
const multer = require('multer');

module.exports = function createExportRoutes({ exportImport, settings, aiChat, aiSwarm, aiTools, swarmito, engine, broadcast, log, appRoot, dataRoot }) {
    const router = express.Router();

    // GET /api/export          → global export ZIP
    // GET /api/export?projectId=<id> → single project ZIP
    router.get('/api/export', (req, res) => {
        try {
            const { projectId } = req.query;
            if (projectId) {
                exportImport.exportProject(appRoot, dataRoot, settings, projectId, res);
            } else {
                exportImport.exportGlobal(appRoot, dataRoot, settings, res);
            }
        } catch (err) {
            if (!res.headersSent) {
                res.status(500).json({ ok: false, error: err.message });
            }
        }
    });

    // POST /api/import  multipart field: "bundle" (.zip file)
    const importUpload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
    });

    router.post('/api/import', importUpload.single('bundle'), async (req, res) => {
        if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded.' });
        try {
            await exportImport.importBundle(
                appRoot, dataRoot, settings, aiChat, aiSwarm, aiTools, swarmito, engine, broadcast, log,
                req.file.buffer
            );
            res.json({ ok: true });
        } catch (err) {
            log(`[Server] Import failed: ${err.message}`);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    return router;
};
