const VALID_ACTIONS = new Set(['eval', 'render', 'render-batch']);
const VALID_INTENTS = new Set(['read', 'write']);
const VALID_QUEUE_MODES = new Set(['inline', 'enqueue', 'bypass']);

function ensureNonEmptyString(value, label) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeAction(input) {
  const action = ensureNonEmptyString(input?.action, 'action');
  if (!VALID_ACTIONS.has(action)) {
    throw new Error(`Unknown action: ${action}`);
  }
  return action;
}

function normalizeIntent(input, action) {
  const rawIntent = input?.intent;
  if (rawIntent == null) {
    return action === 'eval' ? 'write' : 'write';
  }
  const intent = ensureNonEmptyString(rawIntent, 'intent');
  if (!VALID_INTENTS.has(intent)) {
    throw new Error(`intent must be one of: ${Array.from(VALID_INTENTS).join(', ')}`);
  }
  return intent;
}

function normalizeQueueMode(input, options = {}) {
  const allowBypass = options.allowBypass === true;
  const rawQueue = input?.queue;
  if (rawQueue == null) return 'inline';
  const queue = ensureNonEmptyString(rawQueue, 'queue');
  if (!VALID_QUEUE_MODES.has(queue)) {
    throw new Error(`queue must be one of: ${Array.from(VALID_QUEUE_MODES).join(', ')}`);
  }
  if (queue === 'bypass' && !allowBypass) {
    throw new Error('queue=bypass is daemon-internal only');
  }
  return queue;
}

function normalizeWait(input, queue) {
  const rawWait = input?.wait;
  if (rawWait == null) return queue !== 'enqueue';
  if (typeof rawWait !== 'boolean') {
    throw new Error('wait must be a boolean');
  }
  return rawWait;
}

function normalizeTarget(input) {
  if (input?.target == null) return { page: null };
  const target = input.target;
  if (typeof target !== 'object' || Array.isArray(target)) {
    throw new Error('target must be an object');
  }
  if (target.page == null) return { page: null };
  if (typeof target.page !== 'object' || Array.isArray(target.page)) {
    throw new Error('target.page must be an object');
  }

  const id = ensureNonEmptyString(target.page.id, 'target.page.id');
  const name = ensureNonEmptyString(target.page.name, 'target.page.name');

  if (!id && !name) {
    throw new Error('target.page must include at least one of id or name');
  }

  return { page: { id, name } };
}

function normalizeVerify(input) {
  const value = ensureNonEmptyString(input?.verify, 'verify');
  if (!value) return 'structural';
  if (!['structural', 'visual', 'none'].includes(value)) {
    throw new Error('verify must be one of: structural, visual, none');
  }
  return value;
}

export function classifyExecRequest(input = {}, options = {}) {
  const action = normalizeAction(input);
  const intent = normalizeIntent(input, action);
  const queue = normalizeQueueMode(input, options);
  const wait = normalizeWait(input, queue);
  const target = normalizeTarget(input);
  const operationId = ensureNonEmptyString(input.operationId, 'operationId');
  const idempotencyKey = ensureNonEmptyString(input.idempotencyKey, 'idempotencyKey');
  const verify = normalizeVerify(input);

  return {
    action,
    intent,
    queue,
    wait,
    target,
    operationId,
    idempotencyKey,
    verify,
    shouldQueue: intent === 'write',
    shouldBypassQueue: intent === 'read' || queue === 'bypass'
  };
}

export const _internal = {
  VALID_ACTIONS,
  VALID_INTENTS,
  VALID_QUEUE_MODES,
  ensureNonEmptyString,
  normalizeAction,
  normalizeIntent,
  normalizeQueueMode,
  normalizeWait,
  normalizeTarget,
  normalizeVerify
};
