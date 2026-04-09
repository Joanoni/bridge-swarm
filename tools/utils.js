const path = require('path');

/**
 * Resolves a file path against workspaceRoot, then checks if it falls within
 * any of the agent's allowedPaths. Returns { resolved, ok, error }.
 * If allowedPaths is empty, all paths are allowed.
 */
function resolveSafe(filePath, allowedPaths, workspaceRoot) {
    const resolved = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(workspaceRoot, filePath);

    if (!allowedPaths || allowedPaths.length === 0) {
        return { resolved, ok: true };
    }

    for (const allowed of allowedPaths) {
        const allowedAbs = path.isAbsolute(allowed)
            ? allowed
            : path.resolve(workspaceRoot, allowed);
        if (resolved.startsWith(allowedAbs + path.sep) || resolved === allowedAbs) {
            return { resolved, ok: true };
        }
    }

    return {
        resolved,
        ok: false,
        error: `Access denied: "${filePath}" is outside allowed paths [${allowedPaths.join(', ')}]`,
    };
}

module.exports = { resolveSafe };
