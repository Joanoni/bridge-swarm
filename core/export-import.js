const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const unzipper = require('unzipper');
const crypto = require('crypto');

const EXPORT_VERSION = '1.0';

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function addDirToArchive(archive, srcDir, destPrefix) {
    if (!fs.existsSync(srcDir)) return;
    archive.directory(srcDir, destPrefix);
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Stream a global export ZIP to `res`.
 * Includes: agents/ (excl. swarmito), teams/, chats/ (global), projects/ (all), projects.json
 */
function exportGlobal(appRoot, dataRoot, settings, res) {
    const archive = archiver('zip', { zlib: { level: 6 } });

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="bridge-global-${date}.zip"`);

    archive.on('error', (err) => { throw err; });
    archive.pipe(res);

    // export-meta.json
    archive.append(JSON.stringify({ version: EXPORT_VERSION, exportedAt: new Date().toISOString(), scope: 'global' }, null, 2), { name: 'export-meta.json' });

    // agents/ (skip swarmito)
    const agentsDir = path.join(dataRoot, 'agents');
    if (fs.existsSync(agentsDir)) {
        for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name === 'swarmito') continue;
            addDirToArchive(archive, path.join(agentsDir, entry.name), `agents/${entry.name}`);
        }
    }

    // teams/
    addDirToArchive(archive, path.join(dataRoot, 'teams'), 'teams');

    // chats/ (global)
    addDirToArchive(archive, path.join(dataRoot, 'chats'), 'chats');

    // projects/ + projects.json
    const projectsJson = path.join(dataRoot, 'projects.json');
    if (fs.existsSync(projectsJson)) {
        archive.file(projectsJson, { name: 'projects.json' });
    }

    const projects = settings.getProjects();
    for (const project of projects) {
        if (project.path && fs.existsSync(project.path)) {
            addDirToArchive(archive, project.path, `projects/${project.id}`);
        }
    }

    archive.finalize();
}

/**
 * Stream a single-project export ZIP to `res`.
 */
function exportProject(appRoot, dataRoot, settings, projectId, res) {
    const projects = settings.getProjects();
    const project = projects.find(p => p.id === projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const archive = archiver('zip', { zlib: { level: 6 } });

    const date = new Date().toISOString().slice(0, 10);
    const safeName = (project.name || projectId).replace(/[^a-zA-Z0-9_\-]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="bridge-project-${safeName}-${date}.zip"`);

    archive.on('error', (err) => { throw err; });
    archive.pipe(res);

    // export-meta.json
    archive.append(JSON.stringify({
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        scope: 'project',
        projectId: project.id,
        projectName: project.name,
    }, null, 2), { name: 'export-meta.json' });

    // project contents
    if (project.path && fs.existsSync(project.path)) {
        addDirToArchive(archive, project.path, 'project');
    }

    archive.finalize();
}

// ── Import ────────────────────────────────────────────────────────────────────

/**
 * Import a ZIP bundle (Buffer).
 * After writing files, reinitializes aiChat + aiSwarm and broadcasts INIT_STATE.
 */
async function importBundle(appRoot, dataRoot, settings, aiChat, aiSwarm, aiTools, swarmito, engine, broadcast, log, zipBuffer) {
    // Extract all entries into memory
    const directory = await unzipper.Open.buffer(zipBuffer);

    // Read export-meta.json first
    const metaEntry = directory.files.find(f => f.path === 'export-meta.json');
    if (!metaEntry) throw new Error('Invalid bundle: missing export-meta.json');
    const metaBuffer = await metaEntry.buffer();
    const meta = JSON.parse(metaBuffer.toString('utf8'));

    log(`[Export-Import] Importing bundle: scope=${meta.scope} version=${meta.version} exportedAt=${meta.exportedAt}`);

    if (meta.scope === 'global') {
        await _importGlobal(dataRoot, settings, directory, log);
    } else if (meta.scope === 'project') {
        await _importProject(dataRoot, settings, meta, directory, log);
    } else {
        throw new Error(`Unknown bundle scope: ${meta.scope}`);
    }

    // Reinitialize in-memory state
    aiChat.deactivate();
    aiSwarm.deactivate();

    aiChat.init({ appRoot, dataRoot, engine, settings, broadcast, log });
    aiSwarm.init({ aiChat, aiTools, swarmito, broadcast, log });

    // Ensure default Swarmito chat exists
    const existingChats = aiChat.listChats();
    if (existingChats.length === 0) {
        aiChat.createChat({ name: 'Swarmito', agents: ['swarmito'], projectId: null });
    }

    broadcast('INIT_STATE', {
        chats: aiChat.listChats(null),
        projects: settings.getProjects(),
    });

    log(`[Export-Import] Import complete.`);
}

async function _importGlobal(dataRoot, settings, directory, log) {
    // Write all files, skipping swarmito and export-meta.json
    for (const entry of directory.files) {
        if (entry.type === 'Directory') continue;
        const p = entry.path;

        // Skip swarmito agent files
        if (p.startsWith('agents/swarmito/') || p === 'agents/swarmito') continue;
        // Skip meta
        if (p === 'export-meta.json') continue;

        // Handle projects.json specially — merge instead of overwrite
        if (p === 'projects.json') {
            const buf = await entry.buffer();
            const importedProjects = JSON.parse(buf.toString('utf8'));
            await _mergeProjects(dataRoot, settings, importedProjects, directory, log);
            continue;
        }

        // Skip project directory files — handled by _mergeProjects
        if (p.startsWith('projects/')) continue;

        // Write file
        const dest = path.join(dataRoot, p);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const buf = await entry.buffer();
        fs.writeFileSync(dest, buf);
        log(`[Export-Import] Wrote: ${p}`);
    }
}

async function _mergeProjects(dataRoot, settings, importedProjects, directory, log) {
    const existingProjects = settings.getProjects();

    for (const importedProject of importedProjects) {
        // Check for name conflict
        const conflict = existingProjects.find(p => p.name === importedProject.name);
        let targetId = importedProject.id;
        let targetName = importedProject.name;

        if (conflict) {
            // Assign new UUID to avoid collision
            targetId = uid();
            targetName = importedProject.name + ' (imported)';
            log(`[Export-Import] Project name conflict for "${importedProject.name}" — assigning new id ${targetId}`);
        }

        const projectPath = path.join(dataRoot, 'projects', targetId);
        fs.mkdirSync(projectPath, { recursive: true });

        // Write project files from zip
        const prefix = `projects/${importedProject.id}/`;
        for (const entry of directory.files) {
            if (entry.type === 'Directory') continue;
            if (!entry.path.startsWith(prefix)) continue;

            const relativePath = entry.path.slice(prefix.length);
            if (!relativePath) continue;

            const dest = path.join(projectPath, relativePath);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            const buf = await entry.buffer();
            fs.writeFileSync(dest, buf);
        }

        // Update project.json with new id/name if changed
        const projectJsonPath = path.join(projectPath, 'project.json');
        fs.writeFileSync(projectJsonPath, JSON.stringify({ id: targetId, name: targetName }, null, 2), 'utf8');

        // Register project
        settings.addProject({ id: targetId, name: targetName, path: projectPath });
        log(`[Export-Import] Registered project: ${targetName} (${targetId})`);
    }
}

async function _importProject(dataRoot, settings, meta, directory, log) {
    const existingProjects = settings.getProjects();
    const conflict = existingProjects.find(p => p.name === meta.projectName);

    let targetId = meta.projectId;
    let targetName = meta.projectName;

    if (conflict) {
        targetId = uid();
        targetName = meta.projectName + ' (imported)';
        log(`[Export-Import] Project name conflict for "${meta.projectName}" — assigning new id ${targetId}`);
    }

    const projectPath = path.join(dataRoot, 'projects', targetId);
    fs.mkdirSync(projectPath, { recursive: true });

    const prefix = 'project/';
    for (const entry of directory.files) {
        if (entry.type === 'Directory') continue;
        if (!entry.path.startsWith(prefix)) continue;

        const relativePath = entry.path.slice(prefix.length);
        if (!relativePath) continue;

        const dest = path.join(projectPath, relativePath);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const buf = await entry.buffer();
        fs.writeFileSync(dest, buf);
    }

    // Update project.json
    const projectJsonPath = path.join(projectPath, 'project.json');
    fs.writeFileSync(projectJsonPath, JSON.stringify({ id: targetId, name: targetName }, null, 2), 'utf8');

    settings.addProject({ id: targetId, name: targetName, path: projectPath });
    log(`[Export-Import] Registered project: ${targetName} (${targetId})`);
}

module.exports = { exportGlobal, exportProject, importBundle };
