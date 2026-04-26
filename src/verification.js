function extractResultIds(result) {
  if (!result) return [];
  if (Array.isArray(result?.ids)) return result.ids.filter((id) => typeof id === 'string');
  if (typeof result?.id === 'string') return [result.id];
  return [];
}

function verifyStructural({ preSnapshot, postSnapshot, target, result }) {
  if (!preSnapshot || !postSnapshot) {
    return { ok: false, reason: 'Structural snapshots are required for structural verification' };
  }

  if (target?.page?.id && postSnapshot.pageId !== target.page.id) {
    return { ok: false, reason: `Target page mismatch: expected ${target.page.id}, got ${postSnapshot.pageId}` };
  }

  if (target?.page?.name && postSnapshot.pageName !== target.page.name) {
    return { ok: false, reason: `Target page mismatch: expected ${target.page.name}, got ${postSnapshot.pageName}` };
  }

  const resultIds = extractResultIds(result);
  if (resultIds.length > 0) {
    const postIds = new Set(postSnapshot.nodeIds || []);
    const missing = resultIds.filter((id) => !postIds.has(id));
    if (missing.length > 0) {
      return {
        ok: false,
        reason: `Verification failed: result ids missing from post snapshot (${missing.join(', ')})`
      };
    }
  }

  if ((postSnapshot.childCount ?? 0) < (preSnapshot.childCount ?? 0) && resultIds.length > 0) {
    return {
      ok: false,
      reason: 'Verification failed: child count decreased unexpectedly for write result'
    };
  }

  return { ok: true };
}

export async function runVerification({ verify = 'structural', result, target, takeSnapshot } = {}) {
  const mode = verify || 'structural';
  if (mode === 'none') {
    return { ok: true, mode: 'none', preSnapshot: null, postSnapshot: null, visual: null };
  }

  const preSnapshot = await takeSnapshot?.('pre');
  const postSnapshot = await takeSnapshot?.('post');

  const structural = verifyStructural({ preSnapshot, postSnapshot, target, result });
  if (!structural.ok) {
    return {
      ok: false,
      mode,
      reason: structural.reason,
      preSnapshot,
      postSnapshot,
      visual: mode === 'visual' ? { hook: 'not-configured' } : null
    };
  }

  return {
    ok: true,
    mode,
    preSnapshot,
    postSnapshot,
    visual: mode === 'visual' ? { hook: 'not-configured' } : null
  };
}

export const _internal = {
  extractResultIds,
  verifyStructural
};
