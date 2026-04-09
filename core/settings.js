const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    apiKey: '',
    tavilyApiKey: '',
    spendingLimit: 0,
    cloudflareAccountId: '',
    cloudflareApiToken: '',
};

let appRoot;
let settingsFilePath;
let projectsFilePath;

function init(root) {
    appRoot = root;
    settingsFilePath = path.join(appRoot, 'app-settings.json');
    projectsFilePath = path.join(appRoot, 'projects.json');
    _migrateProjectsFromSettings();
}

// ── Migration: move projects from app-settings.json → projects.json ───────────

function _migrateProjectsFromSettings() {
    if (!settingsFilePath || !fs.existsSync(settingsFilePath)) return;
    try {
        const data = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'));
        if (!Array.isArray(data.projects) || data.projects.length === 0) return;

        // Load existing projects.json (if any) and merge, deduplicating by name
        const existing = _readProjectsFile();
        const merged = [...existing];
        for (const p of data.projects) {
            if (!merged.find(e => e.name === p.name)) {
                merged.push(p);
            }
        }
        _writeProjectsFile(merged);

        // Remove projects key from app-settings.json
        delete data.projects;
        fs.writeFileSync(settingsFilePath, JSON.stringify(data, null, 4), 'utf8');
    } catch { /* ignore */ }
}

// ── projects.json helpers ─────────────────────────────────────────────────────

function _readProjectsFile() {
    if (!projectsFilePath) return [];
    try {
        if (fs.existsSync(projectsFilePath)) {
            return JSON.parse(fs.readFileSync(projectsFilePath, 'utf8')) || [];
        }
    } catch { /* ignore */ }
    return [];
}

function _writeProjectsFile(projects) {
    fs.mkdirSync(path.dirname(projectsFilePath), { recursive: true });
    fs.writeFileSync(projectsFilePath, JSON.stringify(projects, null, 4), 'utf8');
}

// ── Settings ──────────────────────────────────────────────────────────────────

function getSettings() {
    if (!settingsFilePath) return { ...DEFAULT_SETTINGS };
    try {
        if (fs.existsSync(settingsFilePath)) {
            const data = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'));
            // Strip projects if still present (legacy)
            const { projects: _p, ...rest } = data;
            return Object.assign({}, DEFAULT_SETTINGS, rest);
        }
    } catch { /* ignore */ }
    return { ...DEFAULT_SETTINGS };
}

function saveSettings(updates) {
    const current = getSettings();
    // Never persist projects inside app-settings.json
    const { projects: _p, ...safeUpdates } = updates;
    const updated = Object.assign({}, current, safeUpdates);
    fs.mkdirSync(path.dirname(settingsFilePath), { recursive: true });
    fs.writeFileSync(settingsFilePath, JSON.stringify(updated, null, 4), 'utf8');
    return updated;
}

function getAppRoot() {
    return appRoot;
}

// ── Project management ────────────────────────────────────────────────────────

function getProjects() {
    return _readProjectsFile();
}

function addProject(project) {
    // project: { id, name, path }
    const projects = _readProjectsFile();
    const existing = projects.find(p => p.name === project.name);
    if (existing) return existing;
    projects.push(project);
    _writeProjectsFile(projects);
    return project;
}

function removeProject(projectId) {
    const projects = _readProjectsFile().filter(p => p.id !== projectId);
    _writeProjectsFile(projects);
}

module.exports = { init, getSettings, saveSettings, getAppRoot, getProjects, addProject, removeProject };
