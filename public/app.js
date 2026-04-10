// app.js — startup + remaining event listeners
// All modules are loaded before this file via <script> tags in index.html.

// ── Sidebar ───────────────────────────────────────────────────────────────────
App.sidebarToggle.addEventListener('click', App.openSidebar);
App.sidebarBackdrop.addEventListener('click', App.closeSidebar);

// ── Send message ──────────────────────────────────────────────────────────────
async function sendMessage() {
    var content = App.inputEl.value.trim();
    if (!content || App.isLoading || !App.activeChatId) return;
    App.inputEl.value = ''; App.inputEl.style.height = 'auto'; App.hideAutocomplete();
    App.appendMessage('user', content);
    App.setLoading(true); App.showThinking(App.activeSwarmAgents[App.activeChatId] || App.agentSelect.value);
    try { await App.apiChat('SEND_MESSAGE', { chatId: App.activeChatId, content: content }); }
    catch(err) { App.hideThinking(); App.appendError('Error: '+err.message); }
    finally { App.setLoading(false); App.inputEl.focus(); }
}

App.sendBtn.addEventListener('click', sendMessage);

App.inputEl.addEventListener('keydown', function(e) {
    var acVis = App.autocompleteEl.style.display === 'block';
    if (!acVis && e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); return; }
    if (acVis) {
        var items = App.autocompleteEl.querySelectorAll('.autocomplete-item');
        if (e.key==='ArrowDown') { e.preventDefault(); if(App.acActiveIndex>=0) items[App.acActiveIndex].classList.remove('active'); App.acActiveIndex=(App.acActiveIndex+1)%items.length; items[App.acActiveIndex].classList.add('active'); items[App.acActiveIndex].scrollIntoView({block:'nearest'}); return; }
        if (e.key==='ArrowUp') { e.preventDefault(); if(App.acActiveIndex>=0) items[App.acActiveIndex].classList.remove('active'); App.acActiveIndex=(App.acActiveIndex-1+items.length)%items.length; items[App.acActiveIndex].classList.add('active'); items[App.acActiveIndex].scrollIntoView({block:'nearest'}); return; }
        if (e.key==='Enter' && App.acActiveIndex>=0) { e.preventDefault(); var q=App.getAtQuery(); var cands=[{id:'user',name:'User',description:''}].concat(App.allAgents); var qry=(q?q.query:'').toLowerCase(); var filt=cands.filter(function(a){ return a.id.toLowerCase().includes(qry)||(a.name&&a.name.toLowerCase().includes(qry)); }); if(filt[App.acActiveIndex]) App.applyAutocomplete(filt[App.acActiveIndex].id, q.start); return; }
        if (e.key==='Escape') { App.hideAutocomplete(); return; }
    }
});

App.inputEl.addEventListener('input', function() {
    App.inputEl.style.height = 'auto';
    App.inputEl.style.height = Math.min(App.inputEl.scrollHeight, 140) + 'px';
    App.updateAutocomplete();
});

App.agentSelect.addEventListener('change', async function() {
    if (!App.activeChatId) return;
    try { await App.apiChat('SET_AGENT', { chatId: App.activeChatId, agentId: App.agentSelect.value }); }
    catch(err) { App.appendError('Failed to switch agent: '+err.message); }
});

App.clearBtn.addEventListener('click', async function() {
    if (!App.activeChatId) return;
    try { await App.apiChat('CLEAR_HISTORY', { chatId: App.activeChatId }); App.messagesEl.innerHTML = ''; App.chatCost.textContent = '$0.0000'; }
    catch(err) { App.appendError('Failed to clear: '+err.message); }
});

App.deleteChatBtn.addEventListener('click', async function() {
    if (!App.activeChatId || !confirm('Delete this chat?')) return;
    try {
        await App.apiChat('DELETE_CHAT', { chatId: App.activeChatId });
        App.allChats = App.allChats.filter(function(c){ return c.id !== App.activeChatId; });
        App.activeChatId = null; App.renderChatList();
        App.emptyState.style.display = ''; App.activeChatEl.style.display = 'none';
        App.infoContent.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">No chat selected.</div>';
    } catch(err) { App.appendError('Failed to delete: '+err.message); }
});

App.continueBtn.addEventListener('click', async function() {
    App.spendingBanner.classList.remove('visible');
    try { await App.apiChat('RESUME_TURN', { chatId: App.activeChatId }); }
    catch(err) { App.appendError('Failed to resume: '+err.message); }
});

// ── New Chat modal ────────────────────────────────────────────────────────────
App.newChatBtn.addEventListener('click', App.openNewChatModal);
App.closeNewChat.addEventListener('click', function(){ App.newChatOverlay.classList.remove('visible'); });
App.newChatOverlay.addEventListener('click', function(e){ if(e.target===App.newChatOverlay) App.newChatOverlay.classList.remove('visible'); });

App.createChatBtn.addEventListener('click', async function() {
    var name = App.newChatName.value.trim();
    if (!name) { App.newChatFeedback.textContent = 'Chat name is required.'; App.newChatFeedback.className = 'error'; return; }
    var selectedAgents = Array.from(App.newChatAgentsList.querySelectorAll('input[type="checkbox"]:checked')).map(function(cb){ return cb.value; });
    var projectId = App.newChatProject.value || null;
    App.createChatBtn.disabled = true;
    try {
        var result = await App.apiChat('CREATE_CHAT', { name: name, agents: selectedAgents, projectId: projectId });
        App.newChatOverlay.classList.remove('visible');
        await App.refreshChatList();
        App.openChat(result.chatId);
    } catch(err) { App.newChatFeedback.textContent = 'Error: '+err.message; App.newChatFeedback.className = 'error'; }
    finally { App.createChatBtn.disabled = false; }
});

// ── Settings modal ────────────────────────────────────────────────────────────
App.settingsBtn.addEventListener('click', function(){ App.loadSettings(); App.settingsOverlay.classList.add('visible'); });
App.closeSettings.addEventListener('click', function(){ App.settingsOverlay.classList.remove('visible'); });
App.settingsOverlay.addEventListener('click', function(e){ if(e.target===App.settingsOverlay) App.settingsOverlay.classList.remove('visible'); });

// ── File attach (input area) ──────────────────────────────────────────────────
App.attachBtn.addEventListener('click', function() { App.fileInput.click(); });
App.fileInput.addEventListener('change', async function() {
    if (!App.activeChatId || !App.fileInput.files.length) return;
    try {
        await App.uploadFiles(App.activeChatId, App.fileInput.files);
        App.fileInput.value = '';
        await App.renderFilesPanel(App.activeChatId);
    } catch(e) { alert('Upload failed: ' + e.message); }
});

// ── File attach (files panel) ─────────────────────────────────────────────────
App.filesPanelInput.addEventListener('change', async function() {
    if (!App.activeChatId || !App.filesPanelInput.files.length) return;
    try {
        await App.uploadFiles(App.activeChatId, App.filesPanelInput.files);
        App.filesPanelInput.value = '';
        await App.renderFilesPanel(App.activeChatId);
    } catch(e) { alert('Upload failed: ' + e.message); }
});

// ── Autocomplete document click ───────────────────────────────────────────────
document.addEventListener('click', function(e) { if (!App.autocompleteEl.contains(e.target) && e.target !== App.inputEl) App.hideAutocomplete(); });

// ── Startup ───────────────────────────────────────────────────────────────────
async function startup() {
    App.connectWS();
    try {
        var agentsData = await App.apiChat('GET_AGENTS', {});
        App.allAgents = agentsData.agents || [];
        var settingsData = await App.apiChat('GET_SETTINGS', {});
        App.allProjects = (settingsData && settingsData.projects) || [];
    } catch(e) { /* will retry via WS */ }
}

startup();
