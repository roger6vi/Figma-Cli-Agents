import { classifyExecRequest } from './exec-classifier.js';
import { runVerification } from './verification.js';

function pickPayload(normalized, request) {
  if (normalized.action === 'eval') return { code: request.code };
  if (normalized.action === 'render') return { jsx: request.jsx };
  if (normalized.action === 'render-batch') return {
    jsxArray: request.jsxArray,
    gap: request.gap,
    vertical: request.vertical
  };
  return {};
}

export function createWriteGateway({
  queueStore,
  executeReadAction,
  executeWriteAction,
  takeSnapshot,
  env = process.env,
  ownerId = 'gateway-worker'
} = {}) {
  if (!queueStore) throw new Error('createWriteGateway requires queueStore');
  if (!executeReadAction) throw new Error('createWriteGateway requires executeReadAction');
  if (!executeWriteAction) throw new Error('createWriteGateway requires executeWriteAction');

  function canBypass(request) {
    return request?.daemonInternalBypass === true && env.FIGMA_WRITE_QUEUE_ALLOW_BYPASS === '1';
  }

  async function executeLeasedOperation(operation, normalized, request) {
    const verifyMode = normalized.verify ?? 'structural';

    await queueStore.appendEvent(operation.id, 'target_resolved', {
      target: normalized.target?.page ?? null,
      resolution: normalized.target?.page ? 'requested_target' : 'current_page_default'
    });

    let result;
    try {
      result = await executeWriteAction({
        ...request,
        action: normalized.action,
        target: normalized.target,
        operationId: operation.id,
        ownerId
      });
    } catch (error) {
      await queueStore.markFailed(operation.id, error?.message || 'Write execution failed');
      throw error;
    }

    await queueStore.appendEvent(operation.id, 'executed', {
      action: normalized.action,
      hasResult: result != null
    });

    const verification = await runVerification({
      verify: verifyMode,
      result,
      target: normalized.target,
      takeSnapshot
    });

    if (!verification.ok) {
      await queueStore.markFailed(operation.id, verification.reason || 'Verification failed');
      throw new Error(verification.reason || 'Verification failed');
    }

    await queueStore.appendEvent(operation.id, 'verified', {
      mode: verifyMode,
      ok: true
    });

    const updated = await queueStore.markSuccess(operation.id, {
      result,
      preSnapshot: verification.preSnapshot,
      postSnapshot: verification.postSnapshot
    });

    return { result, operation: updated, verification };
  }

  async function executeInline(normalized, request) {
    const operation = await queueStore.enqueue({
      operationId: normalized.operationId,
      idempotencyKey: normalized.idempotencyKey,
      action: normalized.action,
      intent: normalized.intent,
      queueMode: normalized.queue,
      targetPageId: normalized.target?.page?.id ?? null,
      targetPageName: normalized.target?.page?.name ?? null,
      payload: pickPayload(normalized, request)
    });

    const lease = await queueStore.acquireNextLease();
    if (!lease) {
      throw new Error('Cannot execute inline: another operation holds a running write lease');
    }

    if (lease.id !== operation.id) {
      throw new Error('Cannot execute inline: lease acquired by another queued operation');
    }

    const executed = await executeLeasedOperation(operation, normalized, request);
    return {
      kind: 'inline',
      result: executed.result,
      operation: executed.operation,
      verification: executed.verification
    };
  }

  async function enqueueOnly(normalized, request) {
    const operation = await queueStore.enqueue({
      operationId: normalized.operationId,
      idempotencyKey: normalized.idempotencyKey,
      action: normalized.action,
      intent: normalized.intent,
      queueMode: normalized.queue,
      targetPageId: normalized.target?.page?.id ?? null,
      targetPageName: normalized.target?.page?.name ?? null,
      payload: pickPayload(normalized, request)
    });

    return {
      kind: 'enqueue',
      accepted: true,
      operationId: operation.id,
      status: operation.status
    };
  }

  async function bypassWrite(normalized, request) {
    await queueStore.appendEvent(normalized.operationId ?? 'bypass', 'queue_bypassed', {
      action: normalized.action,
      reason: 'daemon-internal-bypass'
    });

    const result = await executeWriteAction({
      ...request,
      action: normalized.action,
      target: normalized.target,
      operationId: normalized.operationId ?? null,
      ownerId
    });

    return {
      kind: 'inline',
      result,
      operation: {
        id: normalized.operationId ?? null,
        status: 'success',
        queueMode: 'bypass'
      }
    };
  }

  return {
    async routeExecution(request = {}) {
      const allowBypass = canBypass(request);
      const normalized = classifyExecRequest(request, { allowBypass });

      if (normalized.intent === 'read') {
        const result = await executeReadAction({ ...request, action: normalized.action });
        return { kind: 'read', result };
      }

      if (normalized.queue === 'bypass') {
        if (!allowBypass) {
          throw new Error('queue=bypass is daemon-internal only and requires FIGMA_WRITE_QUEUE_ALLOW_BYPASS=1');
        }
        return bypassWrite(normalized, request);
      }

      if (normalized.queue === 'enqueue' && normalized.wait === false) {
        return enqueueOnly(normalized, request);
      }

      return executeInline(normalized, request);
    }
  };
}
