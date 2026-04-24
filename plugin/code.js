/**
 * Figma CLI Bridge Plugin
 *
 * Safe Mode: Connects to CLI daemon via WebSocket
 * No debug port needed, no patching required.
 */

// Show minimal UI (needed for WebSocket connection)
figma.showUI(__html__, {
  width: 160,
  height: 72,
  position: { x: -9999, y: 9999 }  // Bottom-left (push to far left)
});

const MAX_ERROR_LENGTH = 400;

function boundedErrorMessage(error) {
  const fallback = 'Unknown plugin error';
  const message = error && error.message ? String(error.message) : fallback;
  return message.slice(0, 400);
}

function postEvalResult(id, payload) {
  figma.ui.postMessage({ type: 'result', id, ...payload });
}

function postInvalidEvalPayload(id, details = '') {
  const suffix = details ? `: ${details}` : '';
  postEvalResult(id, { error: `invalid eval payload${suffix}`.slice(0, 400) });
}

function hasValidEvalMessage(msg) {
  return !!msg && typeof msg.id !== 'undefined' && typeof msg.code === 'string';
}

function hasValidBatchMessage(msg) {
  return !!msg && typeof msg.id !== 'undefined' && Array.isArray(msg.codes);
}

// Execute code with auto-return and timeout protection
async function executeCode(code, timeoutMs = 25000) {
  if (typeof code !== 'string' || code.trim() === '') {
    throw new Error('invalid eval payload: code must be a non-empty string');
  }

  let trimmed = code.trim();

  // Don't add return if code already starts with return
  if (!trimmed.startsWith('return ')) {
    const isSimpleExpr = !trimmed.includes(';');
    const isIIFE = trimmed.startsWith('(function') || trimmed.startsWith('(async function');
    const isArrowIIFE = trimmed.startsWith('(() =>') || trimmed.startsWith('(async () =>');

    if (isSimpleExpr || isIIFE || isArrowIIFE) {
      trimmed = `return ${trimmed}`;
    } else {
      const lastSemicolon = trimmed.lastIndexOf(';');
      if (lastSemicolon !== -1) {
        const beforeLast = trimmed.substring(0, lastSemicolon + 1);
        const lastStmt = trimmed.substring(lastSemicolon + 1).trim();
        if (lastStmt && !lastStmt.startsWith('return ')) {
          trimmed = beforeLast + ' return ' + lastStmt;
        }
      }
    }
  }

  // Execute with timeout protection
  const wrapped = `(async () => { ${trimmed} })()`;
  const execPromise = Promise.resolve().then(() => eval(wrapped));
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Execution timeout (${timeoutMs/1000}s)`)), timeoutMs)
  );

  return Promise.race([execPromise, timeoutPromise]);
}

// Handle messages from UI (WebSocket bridge)
figma.ui.onmessage = async (msg) => {
  // Single eval
  if (msg.type === 'eval') {
    if (!hasValidEvalMessage(msg)) {
      postInvalidEvalPayload(msg?.id, 'code must be a string');
      return;
    }
    try {
      const result = await executeCode(msg.code);
      postEvalResult(msg.id, { result });
    } catch (error) {
      postEvalResult(msg.id, { error: boundedErrorMessage(error) });
    }
  }

  // Batch eval (execute multiple codes in sequence, return all results)
  if (msg.type === 'eval-batch') {
    if (!hasValidBatchMessage(msg)) {
      figma.ui.postMessage({
        type: 'batch-result',
        id: msg?.id,
        results: [{ success: false, error: 'invalid eval payload: codes must be an array'.slice(0, 400) }]
      });
      return;
    }

    const results = [];
    for (const code of msg.codes) {
      try {
        if (typeof code !== 'string') {
          throw new Error('invalid eval payload: each batch entry must be a string');
        }
        const result = await executeCode(code);
        results.push({ success: true, result });
      } catch (error) {
        results.push({ success: false, error: boundedErrorMessage(error) });
      }
    }
    figma.ui.postMessage({ type: 'batch-result', id: msg.id, results: results });
  }

  if (msg.type === 'connected') {
    figma.notify('✓ Figma DS CLI connected', { timeout: 2000 });
  }

  if (msg.type === 'disconnected') {
    figma.notify('Figma DS CLI disconnected', { timeout: 2000 });
  }

  if (msg.type === 'error') {
    figma.notify('Figma DS CLI: ' + msg.message, { error: true });
  }
};

// Keep plugin alive
figma.on('close', () => {
  // Plugin closed
});

console.log('Figma DS CLI plugin started');
