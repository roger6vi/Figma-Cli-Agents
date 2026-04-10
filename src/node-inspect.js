function parseDepth(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return parsed;
}

export function buildNodeInspectionCode(options = {}) {
  const {
    nodeId = null,
    depth = 2,
    sharedNamespace = null,
    fallbackToPage = false
  } = options;

  const maxDepth = parseDepth(depth, 2);
  const targetExpr = nodeId
    ? `await figma.getNodeByIdAsync(${JSON.stringify(nodeId)})`
    : (fallbackToPage ? '(figma.currentPage.selection[0] || figma.currentPage)' : 'figma.currentPage.selection[0]');

  return `(async () => {
    const maxDepth = ${maxDepth};
    const sharedNamespace = ${sharedNamespace ? JSON.stringify(sharedNamespace) : 'null'};
    const target = ${targetExpr};
    const snapshotId = new Date().toISOString();
    if (!target) return { error: 'No node found' };

    function round(value) {
      return typeof value === 'number' ? Math.round(value * 100) / 100 : value;
    }

    function rect(value) {
      if (!value) return null;
      return {
        x: round(value.x),
        y: round(value.y),
        width: round(value.width),
        height: round(value.height)
      };
    }

    function matrix(value) {
      if (!Array.isArray(value)) return null;
      return value.map(row => Array.isArray(row) ? row.map(round) : row);
    }

    function normalizeMaybeMixed(value) {
      if (value == null) return null;
      if (typeof value === 'symbol') return String(value);
      if (typeof value === 'number') return round(value);
      return value;
    }

    function normalizeFontName(value) {
      if (value == null) return null;
      if (typeof value === 'symbol') return String(value);
      if (typeof value === 'object' && value.family && value.style) {
        return { family: value.family, style: value.style };
      }
      return String(value);
    }

    function rgbToHex(color) {
      if (!color) return null;
      const toHex = (channel) => {
        const normalized = Math.max(0, Math.min(255, Math.round(channel * 255)));
        return normalized.toString(16).padStart(2, '0');
      };
      return '#' + toHex(color.r || 0) + toHex(color.g || 0) + toHex(color.b || 0);
    }

    function summarizePaints(paints) {
      if (!Array.isArray(paints)) return null;
      return {
        count: paints.length,
        items: paints.slice(0, 3).map(paint => {
          const item = { type: paint.type };
          if ('visible' in paint) item.visible = paint.visible !== false;
          if ('opacity' in paint && typeof paint.opacity === 'number') item.opacity = round(paint.opacity);
          if (paint.type === 'SOLID' && paint.color) item.color = rgbToHex(paint.color);
          if ('boundVariables' in paint && paint.boundVariables && paint.boundVariables.color?.id) {
            item.boundVariableId = paint.boundVariables.color.id;
          }
          return item;
        })
      };
    }

    function summarizeEffects(effects) {
      if (!Array.isArray(effects)) return null;
      return {
        count: effects.length,
        items: effects.slice(0, 3).map(effect => ({
          type: effect.type,
          visible: effect.visible !== false,
          radius: typeof effect.radius === 'number' ? round(effect.radius) : null
        }))
      };
    }

    function getNodeIndex(node) {
      if (!node.parent || !('children' in node.parent)) return 0;
      return node.parent.children.findIndex(child => child.id === node.id);
    }

    function getPageInfo(node) {
      let current = node;
      while (current && current.type !== 'PAGE') {
        current = current.parent || null;
      }
      if (current && current.type === 'PAGE') {
        return { id: current.id, name: current.name || '' };
      }
      return { id: figma.currentPage.id, name: figma.currentPage.name };
    }

    function getPath(node) {
      const segments = [];
      let current = node;
      while (current) {
        segments.unshift({
          id: current.id,
          type: current.type,
          name: current.name || ''
        });
        current = current.parent || null;
      }
      return segments;
    }

    function getAbsolutePosition(node) {
      if (!('absoluteTransform' in node) || !Array.isArray(node.absoluteTransform)) return null;
      const transform = node.absoluteTransform;
      if (!Array.isArray(transform[0]) || !Array.isArray(transform[1])) return null;
      return {
        x: round(transform[0][2] || 0),
        y: round(transform[1][2] || 0)
      };
    }

    function getBounds(node) {
      const hasSize = typeof node.width === 'number' && typeof node.height === 'number';
      const localBounds = hasSize || typeof node.x === 'number' || typeof node.y === 'number'
        ? {
            x: round(typeof node.x === 'number' ? node.x : 0),
            y: round(typeof node.y === 'number' ? node.y : 0),
            width: round(typeof node.width === 'number' ? node.width : 0),
            height: round(typeof node.height === 'number' ? node.height : 0)
          }
        : null;
      const absolutePosition = getAbsolutePosition(node);
      const absoluteBounds = absolutePosition && hasSize
        ? {
            x: absolutePosition.x,
            y: absolutePosition.y,
            width: round(node.width),
            height: round(node.height)
          }
        : null;

      return {
        localBounds,
        absolutePosition,
        absoluteBounds,
        absoluteTransform: 'absoluteTransform' in node ? matrix(node.absoluteTransform) : null,
        absoluteRenderBounds: 'absoluteRenderBounds' in node ? rect(node.absoluteRenderBounds) : null
      };
    }

    function getBoundVariables(node) {
      const bindings = {};
      if (!node.boundVariables) return bindings;

      for (const [prop, binding] of Object.entries(node.boundVariables)) {
        const items = Array.isArray(binding) ? binding : [binding];
        const normalized = items
          .filter(Boolean)
          .map(item => {
            const variable = item.id ? figma.variables.getVariableById(item.id) : null;
            return {
              id: item.id || null,
              name: variable ? variable.name : null,
              collectionId: variable ? variable.variableCollectionId : null
            };
          })
          .filter(item => item.id || item.name);

        if (normalized.length > 0) {
          bindings[prop] = Array.isArray(binding) ? normalized : normalized[0];
        }
      }

      return bindings;
    }

    function getPluginData(node) {
      if (!('getPluginDataKeys' in node)) return null;
      const keys = node.getPluginDataKeys();
      if (!keys.length) return null;

      const values = {};
      keys.forEach(key => {
        values[key] = node.getPluginData(key);
      });

      return { keys, values };
    }

    function getSharedPluginData(node) {
      if (!sharedNamespace || !('getSharedPluginDataKeys' in node)) return null;
      const keys = node.getSharedPluginDataKeys(sharedNamespace);
      if (!keys.length) return null;

      const values = {};
      keys.forEach(key => {
        values[key] = node.getSharedPluginData(sharedNamespace, key);
      });

      return { namespace: sharedNamespace, keys, values };
    }

    function getLayout(node) {
      const layout = {};

      if ('layoutMode' in node) layout.layoutMode = node.layoutMode;
      if ('layoutAlign' in node) layout.layoutAlign = node.layoutAlign;
      if ('layoutGrow' in node) layout.layoutGrow = normalizeMaybeMixed(node.layoutGrow);
      if ('primaryAxisSizingMode' in node) layout.primaryAxisSizingMode = node.primaryAxisSizingMode;
      if ('counterAxisSizingMode' in node) layout.counterAxisSizingMode = node.counterAxisSizingMode;
      if ('primaryAxisAlignItems' in node) layout.primaryAxisAlignItems = node.primaryAxisAlignItems;
      if ('counterAxisAlignItems' in node) layout.counterAxisAlignItems = node.counterAxisAlignItems;
      if ('itemSpacing' in node) layout.itemSpacing = normalizeMaybeMixed(node.itemSpacing);
      if ('paddingLeft' in node) layout.paddingLeft = normalizeMaybeMixed(node.paddingLeft);
      if ('paddingRight' in node) layout.paddingRight = normalizeMaybeMixed(node.paddingRight);
      if ('paddingTop' in node) layout.paddingTop = normalizeMaybeMixed(node.paddingTop);
      if ('paddingBottom' in node) layout.paddingBottom = normalizeMaybeMixed(node.paddingBottom);
      if ('constraints' in node) layout.constraints = node.constraints;

      return Object.keys(layout).length > 0 ? layout : null;
    }

    function getText(node) {
      if (node.type !== 'TEXT') return null;
      const characters = node.characters || '';
      return {
        charactersPreview: characters.length > 160 ? characters.slice(0, 160) + '...' : characters,
        charactersLength: characters.length,
        fontName: normalizeFontName(node.fontName),
        fontSize: normalizeMaybeMixed(node.fontSize),
        textAutoResize: node.textAutoResize,
        textAlignHorizontal: node.textAlignHorizontal,
        textAlignVertical: node.textAlignVertical
      };
    }

    function inspectNode(node, depth = 0) {
      const page = getPageInfo(node);
      const bounds = getBounds(node);
      const inspected = {
        id: node.id,
        type: node.type,
        name: node.name || '',
        depth,
        index: getNodeIndex(node),
        parentId: node.parent ? node.parent.id : null,
        pageId: page.id,
        pageName: page.name,
        path: getPath(node),
        visible: 'visible' in node ? node.visible : true,
        locked: 'locked' in node ? node.locked : false,
        opacity: 'opacity' in node ? round(node.opacity) : null,
        rotation: 'rotation' in node ? round(node.rotation) : null,
        childCount: 'children' in node ? node.children.length : 0,
        localBounds: bounds.localBounds,
        absolutePosition: bounds.absolutePosition,
        absoluteBounds: bounds.absoluteBounds,
        absoluteTransform: bounds.absoluteTransform,
        absoluteRenderBounds: bounds.absoluteRenderBounds,
        layout: getLayout(node),
        text: getText(node),
        fills: 'fills' in node ? summarizePaints(node.fills) : null,
        strokes: 'strokes' in node ? summarizePaints(node.strokes) : null,
        effects: 'effects' in node ? summarizeEffects(node.effects) : null,
        boundVariables: getBoundVariables(node),
        pluginData: getPluginData(node),
        sharedPluginData: getSharedPluginData(node)
      };

      if ('children' in node && node.children.length > 0) {
        if (depth < maxDepth) {
          inspected.children = node.children.map(child => inspectNode(child, depth + 1));
        } else {
          inspected.childrenTruncated = true;
        }
      }

      return inspected;
    }

    return {
      snapshotId: 'node:' + snapshotId,
      currentPage: {
        id: figma.currentPage.id,
        name: figma.currentPage.name
      },
      node: inspectNode(target, 0)
    };
  })()`;
}

function formatMetric(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\\.00$/, '');
}

function quoteName(name) {
  return JSON.stringify(name || '');
}

export function formatNodeTree(report, options = {}) {
  if (!report || report.error) {
    return report?.error || 'No node found';
  }

  const { showCoords = false } = options;
  const lines = [];

  function pushNode(node, depth = 0) {
    const indent = '  '.repeat(depth);
    const parts = [`${indent}${node.type}`, quoteName(node.name), `[${node.id}]`];
    const bounds = node.absoluteBounds || node.localBounds;
    if (bounds) {
      parts.push(`${formatMetric(bounds.width)}x${formatMetric(bounds.height)}`);
    }
    if (showCoords) {
      if (node.absoluteBounds) {
        parts.push(`abs(${formatMetric(node.absoluteBounds.x)},${formatMetric(node.absoluteBounds.y)})`);
      }
      if (node.localBounds) {
        parts.push(`local(${formatMetric(node.localBounds.x)},${formatMetric(node.localBounds.y)})`);
      }
    }
    const bindingCount = node.boundVariables ? Object.keys(node.boundVariables).length : 0;
    if (bindingCount > 0) {
      parts.push(`vars=${bindingCount}`);
    }
    lines.push(parts.join(' '));

    if (Array.isArray(node.children)) {
      node.children.forEach(child => pushNode(child, depth + 1));
    } else if (node.childrenTruncated) {
      lines.push(`${indent}  ...`);
    }
  }

  pushNode(report.node);
  return lines.join('\n');
}
