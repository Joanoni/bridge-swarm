// app/ui-settings.js — settings modal, projects, export/import, reset
var App = window.App = window.App || {};

// ── Settings helpers ──────────────────────────────────────────────────────────
App.populateModels = function(providerId, selectedModelId) {
    var provider = App.availableProviders.find(function(p){ return p.id===providerId; });
    App.modelSelect.innerHTML = '';
    if (!provider) return;
    provider.models.forEach(function(m) {
        var opt = document.createElement('option'); opt.value = m.id; opt.textContent = m.name;
        if (m.id === selectedModelId) opt.selected = true;
        App.modelSelect.appendChild(opt);
    });
};

App.loadSettings = async function() {
    try {
        var s = await App.apiChat('GET_SETTINGS_WITH_KEY');
        App.availableProviders = s.availableProviders || [];
        App.providerSelect.innerHTML = '';
        App.availableProviders.forEach(function(p) {
            var opt = document.createElement('option'); opt.value = p.id; opt.textContent = p.name;
            if (p.id === s.provider) opt.selected = true;
            App.providerSelect.appendChild(opt);
        });
        App.populateModels(s.provider, s.model);
        App.apiKeyInput.value = s.apiKey || '';
        App.tavilyKeyInput.value = s.tavilyApiKey || '';
        App.spendingLimitInput.value = s.spendingLimit || 0;
        App.cfAccountIdInput.value = s.cloudflareAccountId || '';
        App.cfApiTokenInput.value = s.cloudflareApiToken || '';
        App.allProjects = s.projects || [];
        App.renderProjectsList();
        App.renderProjectSelector();
        App.renderAgentList(s.agents || []);
        App.renderExportProjectSelect();
    } catch(err) { App.settingsFeedback.textContent = 'Failed to load: '+err.message; App.settingsFeedback.className = 'error'; }
};

App.renderProjectsList = function() {
    App.projectsList.innerHTML = '';
    if (!App.allProjects.length) { App.projectsList.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">No projects registered.</div>'; return; }
    App.allProjects.forEach(function(project) {
        var item = document.createElement('div'); item.className = 'project-item';
        item.innerHTML = '<div class="project-item-name">'+project.name+'</div><div class="project-item-path">'+project.path+'</div>';
        var del = document.createElement('button'); del.className = 'project-item-del'; del.textContent = '✕'; del.title = 'Remove';
        del.addEventListener('click', async function() {
            try {
                await App.apiDelete('/api/projects/'+project.id);
                App.allProjects = App.allProjects.filter(function(p){ return p.id!==project.id; });
                App.renderProjectsList();
                App.renderProjectSelector();
                if (App.activeProjectId === project.id) App.switchProject(null);
            }
            catch(err) { App.projectsFeedback.textContent = 'Error: '+err.message; App.projectsFeedback.className = 'error'; }
        });
        item.appendChild(del); App.projectsList.appendChild(item);
    });
};

App.renderAgentList = function(agents) {
    App.agentListEl.innerHTML = '';
    if (!agents || !agents.length) { App.agentListEl.innerHTML = '<li style="color:var(--text-muted);font-size:12px;">No agents found.</li>'; return; }
    agents.forEach(function(agent) {
        var li = document.createElement('li');
        var color = App.agentColor(agent.id);
        li.innerHTML = '<div style="font-weight:600;font-size:12px;color:'+color+'">'+agent.name+' <span style="font-weight:normal;color:var(--text-muted);font-family:var(--font-mono);font-size:10px;">('+agent.id+')</span></div>'+(agent.description?'<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">'+agent.description+'</div>':'');
        App.agentListEl.appendChild(li);
    });
};

// ── Export / Import helpers ───────────────────────────────────────────────────
App.renderExportProjectSelect = function() {
    App.exportProjectSelect.innerHTML = '<option value="">— Select project —</option>';
    App.allProjects.forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        App.exportProjectSelect.appendChild(opt);
    });
};

App.triggerDownload = function(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function() { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
};

App.setExportImportFeedback = function(msg, isError) {
    App.exportImportFeedback.textContent = msg;
    App.exportImportFeedback.className = isError ? 'error' : 'success';
    if (!isError) setTimeout(function() { if (App.exportImportFeedback.textContent === msg) { App.exportImportFeedback.textContent = ''; App.exportImportFeedback.className = ''; } }, 4000);
};

// ── Settings event listeners ──────────────────────────────────────────────────
App.providerSelect.addEventListener('change', function(){ App.populateModels(App.providerSelect.value, null); });

App.toggleTavilyKeyBtn.addEventListener('click', function() {
    var isPass = App.tavilyKeyInput.type === 'password';
    App.tavilyKeyInput.type = isPass ? 'text' : 'password';
    App.toggleTavilyKeyBtn.textContent = isPass ? 'Hide' : 'Show';
});

App.toggleKeyBtn.addEventListener('click', function() {
    var isPass = App.apiKeyInput.type === 'password';
    App.apiKeyInput.type = isPass ? 'text' : 'password';
    App.toggleKeyBtn.textContent = isPass ? 'Hide' : 'Show';
});

App.toggleCfAccountIdBtn.addEventListener('click', function() {
    var isPass = App.cfAccountIdInput.type === 'password';
    App.cfAccountIdInput.type = isPass ? 'text' : 'password';
    App.toggleCfAccountIdBtn.textContent = isPass ? 'Hide' : 'Show';
});

App.toggleCfApiTokenBtn.addEventListener('click', function() {
    var isPass = App.cfApiTokenInput.type === 'password';
    App.cfApiTokenInput.type = isPass ? 'text' : 'password';
    App.toggleCfApiTokenBtn.textContent = isPass ? 'Hide' : 'Show';
});

App.saveSettingsBtn.addEventListener('click', async function() {
    App.saveSettingsBtn.disabled = true; App.settingsFeedback.textContent = ''; App.settingsFeedback.className = '';
    try {
        await App.apiChat('SAVE_SETTINGS', { provider: App.providerSelect.value, model: App.modelSelect.value, apiKey: App.apiKeyInput.value, spendingLimit: parseFloat(App.spendingLimitInput.value)||0 });
        App.settingsFeedback.textContent = 'Settings saved.'; App.settingsFeedback.className = 'success';
        setTimeout(function(){ if(App.settingsFeedback.textContent==='Settings saved.'){ App.settingsFeedback.textContent=''; App.settingsFeedback.className=''; } }, 3000);
    } catch(err) { App.settingsFeedback.textContent = 'Error: '+err.message; App.settingsFeedback.className = 'error'; }
    finally { App.saveSettingsBtn.disabled = false; }
});

App.saveTavilyBtn.addEventListener('click', async function() {
    App.saveTavilyBtn.disabled = true; App.tavilyFeedback.textContent = ''; App.tavilyFeedback.className = '';
    try {
        await App.apiChat('SAVE_SETTINGS', { tavilyApiKey: App.tavilyKeyInput.value });
        App.tavilyFeedback.textContent = 'Tavily key saved.'; App.tavilyFeedback.className = 'success';
        setTimeout(function(){ if(App.tavilyFeedback.textContent==='Tavily key saved.'){ App.tavilyFeedback.textContent=''; App.tavilyFeedback.className=''; } }, 3000);
    } catch(err) { App.tavilyFeedback.textContent = 'Error: '+err.message; App.tavilyFeedback.className = 'error'; }
    finally { App.saveTavilyBtn.disabled = false; }
});

App.saveCloudflareBtn.addEventListener('click', async function() {
    App.saveCloudflareBtn.disabled = true; App.cloudflareFeedback.textContent = ''; App.cloudflareFeedback.className = '';
    try {
        await App.apiChat('SAVE_SETTINGS', { cloudflareAccountId: App.cfAccountIdInput.value, cloudflareApiToken: App.cfApiTokenInput.value });
        App.cloudflareFeedback.textContent = 'Cloudflare keys saved.'; App.cloudflareFeedback.className = 'success';
        setTimeout(function(){ if(App.cloudflareFeedback.textContent==='Cloudflare keys saved.'){ App.cloudflareFeedback.textContent=''; App.cloudflareFeedback.className=''; } }, 3000);
    } catch(err) { App.cloudflareFeedback.textContent = 'Error: '+err.message; App.cloudflareFeedback.className = 'error'; }
    finally { App.saveCloudflareBtn.disabled = false; }
});

App.addProjectBtn.addEventListener('click', async function() {
    var name = App.newProjectName.value.trim();
    if (!name) { App.projectsFeedback.textContent = 'Name is required.'; App.projectsFeedback.className = 'error'; return; }
    try {
        var data = await App.apiPost('/api/projects', { name: name });
        App.allProjects.push(data.project); App.newProjectName.value = '';
        App.projectsFeedback.textContent = 'Project added.'; App.projectsFeedback.className = 'success';
        App.renderProjectsList();
        App.renderProjectSelector();
    } catch(err) { App.projectsFeedback.textContent = 'Error: '+err.message; App.projectsFeedback.className = 'error'; }
});

App.resetBtn.addEventListener('click', async function() {
    if (!confirm('This will delete ALL projects, chats, and agents (except Swarmito). This cannot be undone. Continue?')) return;
    App.resetBtn.disabled = true;
    App.resetFeedback.textContent = ''; App.resetFeedback.className = '';
    try {
        var r = await fetch('/api/reset', { method: 'POST' });
        var d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Reset failed');
        App.allChats = []; App.allProjects = []; App.activeChatId = null; App.activeProjectId = null;
        App.renderChatList();
        App.renderProjectSelector();
        App.emptyState.style.display = '';
        App.activeChatEl.style.display = 'none';
        App.infoContent.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">No chat selected.</div>';
        App.settingsOverlay.classList.remove('visible');
    } catch(err) {
        App.resetFeedback.textContent = 'Error: ' + err.message;
        App.resetFeedback.className = 'error';
    } finally {
        App.resetBtn.disabled = false;
    }
});

// ── Export / Import event listeners ──────────────────────────────────────────
App.exportGlobalBtn.addEventListener('click', async function() {
    App.exportGlobalBtn.disabled = true;
    App.setExportImportFeedback('Exporting\u2026', false);
    try {
        var r = await fetch('/api/export');
        if (!r.ok) { var d = await r.json(); throw new Error(d.error || 'Export failed'); }
        var blob = await r.blob();
        var cd = r.headers.get('Content-Disposition') || '';
        var match = cd.match(/filename="([^"]+)"/);
        var filename = match ? match[1] : 'bridge-global-export.zip';
        App.triggerDownload(blob, filename);
        App.setExportImportFeedback('Global export downloaded.', false);
    } catch(e) { App.setExportImportFeedback('Error: ' + e.message, true); }
    finally { App.exportGlobalBtn.disabled = false; }
});

App.exportProjectBtn.addEventListener('click', async function() {
    var projectId = App.exportProjectSelect.value;
    if (!projectId) { App.setExportImportFeedback('Select a project first.', true); return; }
    App.exportProjectBtn.disabled = true;
    App.setExportImportFeedback('Exporting\u2026', false);
    try {
        var r = await fetch('/api/export?projectId=' + encodeURIComponent(projectId));
        if (!r.ok) { var d = await r.json(); throw new Error(d.error || 'Export failed'); }
        var blob = await r.blob();
        var cd = r.headers.get('Content-Disposition') || '';
        var match = cd.match(/filename="([^"]+)"/);
        var filename = match ? match[1] : 'bridge-project-export.zip';
        App.triggerDownload(blob, filename);
        App.setExportImportFeedback('Project export downloaded.', false);
    } catch(e) { App.setExportImportFeedback('Error: ' + e.message, true); }
    finally { App.exportProjectBtn.disabled = false; }
});

App.importBtn.addEventListener('click', function() { App.importFileInput.click(); });

App.importFileInput.addEventListener('change', async function() {
    if (!App.importFileInput.files || !App.importFileInput.files.length) return;
    var file = App.importFileInput.files[0];
    App.importFileInput.value = '';
    App.importBtn.disabled = true;
    App.setExportImportFeedback('Importing\u2026', false);
    try {
        var fd = new FormData();
        fd.append('bundle', file);
        var r = await fetch('/api/import', { method: 'POST', body: fd });
        var d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Import failed');
        App.setExportImportFeedback('Import successful! State reloaded.', false);
    } catch(e) { App.setExportImportFeedback('Error: ' + e.message, true); }
    finally { App.importBtn.disabled = false; }
});
