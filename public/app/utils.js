// app/utils.js — pure helper functions
var App = window.App = window.App || {};

// ── Colors ────────────────────────────────────────────────────────────────────
App.COLORS = ['#7c6af7','#48bb78','#63b3ed','#ecc94b','#fc8181','#f6ad55','#76e4f7','#b794f4','#68d391','#fbb6ce'];

App.agentColor = function(id) {
    if (!id || id === 'user') return '#8892b0';
    var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return App.COLORS[Math.abs(h) % App.COLORS.length];
};

App.shortName = function(id) { return id ? id.split('/').pop() : 'assistant'; };

// ── Markdown ──────────────────────────────────────────────────────────────────
App.md = function(text) {
    if (!text) return '';
    var h = text
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/```[\w]*\n?([\s\S]*?)```/g, function(_,c){ return '<pre><code>'+c.trim()+'</code></pre>'; })
        .replace(/`([^`\n]+)`/g,'<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
        .replace(/\*([^*\n]+)\*/g,'<em>$1</em>')
        .replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h1>$1</h1>')
        .replace(/^\s*[-*] (.+)$/gm,'<li>$1</li>').replace(/^\s*\d+\. (.+)$/gm,'<li>$1</li>');
    h = h.replace(/(<li>[\s\S]*?<\/li>(\s*<li>[\s\S]*?<\/li>)*)/g,'<ul>$1</ul>');
    var lines = h.split('\n'), res = [], inPre = false;
    lines.forEach(function(l) {
        if (l.startsWith('<pre>')) inPre = true;
        if (l.startsWith('</pre>')) inPre = false;
        if (!inPre && l.trim() && !/^<(h[123]|ul|li|pre)/.test(l)) res.push('<p>'+l+'</p>');
        else res.push(l);
    });
    return res.join('\n');
};

App.isToolSummary = function(c) { return /^\[[\w\-\/]+\] [📄✏️📁💻🔍]/.test(c); };
