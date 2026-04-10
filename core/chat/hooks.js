const { hooks, getLog } = require('./state');

function use(hookName, fn) {
    if (!hooks.has(hookName)) hooks.set(hookName, []);
    hooks.get(hookName).push(fn);
}

function unuse(hookName, fn) {
    if (!hooks.has(hookName)) return;
    const list = hooks.get(hookName);
    const idx = list.indexOf(fn);
    if (idx !== -1) list.splice(idx, 1);
}

async function runHooks(hookName, data) {
    const _log = getLog();
    const result = { cancel: false, extraTools: [] };
    if (!hooks.has(hookName)) return result;
    const handlers = hooks.get(hookName);
    _log?.(`[AI Chat] [hook:${hookName}] Running (${handlers.length} handler(s))`);
    for (const fn of handlers) {
        try {
            const ret = await fn(data);
            if (ret && ret.cancel === true) result.cancel = true;
            if (ret && Array.isArray(ret.extraTools)) result.extraTools.push(...ret.extraTools);
        } catch (err) {
            _log?.(`[AI Chat] [hook:${hookName}] Error: ${err.message}`);
        }
    }
    if (result.extraTools.length > 0) {
        _log?.(`[AI Chat] [hook:${hookName}] Injected ${result.extraTools.length} extra tool(s): [${result.extraTools.map(t => t.definition?.name).join(', ')}]`);
    }
    return result;
}

module.exports = { use, unuse, runHooks };
