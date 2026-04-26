function assertPageList(pages) {
  if (!Array.isArray(pages)) {
    throw new Error('pages must be an array');
  }
}

function normalizeTargetPage(targetPage = {}) {
  if (!targetPage) return { id: null, name: null };
  const id = typeof targetPage.id === 'string' && targetPage.id.trim() ? targetPage.id.trim() : null;
  const name = typeof targetPage.name === 'string' && targetPage.name.trim() ? targetPage.name.trim() : null;
  return { id, name };
}

export function buildResolverSnapshot(page) {
  const children = Array.isArray(page?.children) ? page.children : [];
  return {
    pageId: page?.id ?? null,
    pageName: page?.name ?? null,
    childCount: children.length,
    nodeIds: children.map((child) => child.id)
  };
}

export function resolveTargetPage(pages, targetPage) {
  assertPageList(pages);
  const normalizedTarget = normalizeTargetPage(targetPage);

  if (normalizedTarget.id) {
    const byId = pages.find((page) => page?.id === normalizedTarget.id);
    if (!byId) throw new Error(`Target page id not found: ${normalizedTarget.id}`);
    return byId;
  }

  if (normalizedTarget.name) {
    const byName = pages.filter((page) => page?.name === normalizedTarget.name);
    if (byName.length === 0) {
      throw new Error(`Target page name not found: ${normalizedTarget.name}`);
    }
    if (byName.length > 1) {
      throw new Error(`Target page name is ambiguous: ${normalizedTarget.name}`);
    }
    return byName[0];
  }

  return null;
}

export function buildTargetPrelude(targetPage = {}) {
  const normalizedTarget = normalizeTargetPage(targetPage);
  const literal = JSON.stringify(normalizedTarget);

  return `
    (function () {
      const target = ${literal};
      const pages = Array.from(figma.root.children || []);

      let resolved = null;
      if (target.id) {
        resolved = pages.find((page) => page.id === target.id) || null;
        if (!resolved) throw new Error('Target page id not found: ' + target.id);
      } else if (target.name) {
        const matches = pages.filter((page) => page.name === target.name);
        if (matches.length === 0) throw new Error('Target page name not found: ' + target.name);
        if (matches.length > 1) throw new Error('Target page name is ambiguous: ' + target.name);
        resolved = matches[0];
      }

      if (resolved) figma.currentPage = resolved;
      const activePage = figma.currentPage;

      return {
        pageId: activePage.id,
        pageName: activePage.name,
        childCount: activePage.children.length,
        nodeIds: activePage.children.map((node) => node.id)
      };
    })();
  `;
}

export const _internal = {
  normalizeTargetPage,
  assertPageList
};
