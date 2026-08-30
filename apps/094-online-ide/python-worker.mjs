const PYODIDE_VERSION = '314.0.6';
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PYODIDE_MODULE = `${PYODIDE_BASE}pyodide.mjs`;
const MAX_TEXT = 2_000;

let runtimePromise;
let activeRunId = '';

function truncate(value, length = MAX_TEXT) {
  const characters = Array.from(String(value));
  return characters.length > length ? `${characters.slice(0, length).join('')}…` : characters.join('');
}

function errorText(error) {
  return truncate(error?.stack || error?.message || String(error));
}

async function createRuntime(runId) {
  self.postMessage({ type: 'stage', id: runId, stage: 'loading', detail: `正在加载 Python ${PYODIDE_VERSION}` });
  const { loadPyodide } = await import(PYODIDE_MODULE);
  const pyodide = await loadPyodide({ indexURL: PYODIDE_BASE });
  pyodide.setStdout({ batched: (text) => activeRunId && self.postMessage({ type: 'log', id: activeRunId, level: 'log', text: truncate(text) }) });
  pyodide.setStderr({ batched: (text) => activeRunId && self.postMessage({ type: 'log', id: activeRunId, level: 'error', text: truncate(text) }) });
  return pyodide;
}

function ensureRuntime(runId) {
  if (!runtimePromise) runtimePromise = createRuntime(runId).catch((error) => {
    runtimePromise = undefined;
    throw error;
  });
  return runtimePromise;
}

self.onmessage = async (event) => {
  const message = event.data;
  if (!message || message.type !== 'run' || typeof message.id !== 'string' || typeof message.code !== 'string') return;
  const { id, code } = message;
  const started = performance.now();
  activeRunId = id;
  self.postMessage({ type: 'stage', id, stage: 'check' });

  try {
    const pyodide = await ensureRuntime(id);
    if (activeRunId !== id) return;
    self.postMessage({ type: 'stage', id, stage: 'run', detail: `Python ${PYODIDE_VERSION}` });
    const result = await pyodide.runPythonAsync(code);
    let resultText = '';
    if (result !== undefined && result !== null) {
      resultText = truncate(String(result));
      if (resultText === 'None') resultText = '';
      if (typeof result.destroy === 'function') result.destroy();
    }
    self.postMessage({ type: 'done', id, status: 'success', result: resultText, duration: performance.now() - started });
  } catch (error) {
    self.postMessage({ type: 'done', id, status: 'error', error: errorText(error), duration: performance.now() - started });
  } finally {
    if (activeRunId === id) activeRunId = '';
  }
};

