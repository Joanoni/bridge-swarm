// app/api.js — fetch wrappers
var App = window.App = window.App || {};

App.apiChat = async function(cmd, payload) {
    var r = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({command:cmd, payload:payload||{}}) });
    var d = await r.json(); if (!d.ok) throw new Error(d.error||'Unknown error'); return d.result;
};

App.apiPost = async function(url, body) {
    var r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    var d = await r.json(); if (!d.ok) throw new Error(d.error||'Unknown error'); return d;
};

App.apiDelete = async function(url) {
    var r = await fetch(url, { method:'DELETE' }); var d = await r.json();
    if (!d.ok) throw new Error(d.error||'Unknown error'); return d;
};

// ── Chat files ────────────────────────────────────────────────────────────────
App.loadChatFiles = async function(chatId) {
    try {
        var r = await fetch('/api/chat/' + encodeURIComponent(chatId) + '/files');
        var d = await r.json();
        return d.ok ? (d.files || []) : [];
    } catch(e) { return []; }
};

App.uploadFiles = async function(chatId, files) {
    var fd = new FormData();
    for (var i = 0; i < files.length; i++) fd.append('files', files[i]);
    var r = await fetch('/api/chat/' + encodeURIComponent(chatId) + '/files', { method: 'POST', body: fd });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Upload failed');
    return d.uploaded || [];
};

App.deleteChatFile = async function(chatId, filename) {
    await App.apiDelete('/api/chat/' + encodeURIComponent(chatId) + '/files/' + encodeURIComponent(filename));
};
