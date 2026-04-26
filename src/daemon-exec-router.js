import { classifyExecRequest } from './exec-classifier.js';

export async function routeDaemonExec({ request, writeGateway, executeDirectAction, getMode }) {
  const normalized = classifyExecRequest(request, {
    allowBypass: request?.daemonInternalBypass === true
  });

  if (normalized.intent === 'read') {
    const directResult = await executeDirectAction(request);
    return {
      statusCode: 200,
      body: {
        result: directResult,
        mode: getMode()
      }
    };
  }

  const routed = await writeGateway.routeExecution(request);

  if (routed.kind === 'enqueue') {
    return {
      statusCode: 202,
      body: {
        accepted: routed.accepted,
        operationId: routed.operationId,
        status: routed.status,
        mode: getMode()
      }
    };
  }

  return {
    statusCode: 200,
    body: {
      result: routed.result,
      mode: getMode()
    }
  };
}
