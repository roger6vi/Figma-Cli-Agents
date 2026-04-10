/**
 * color-utils.js
 * Shared color helpers for figma-ds-cli.
 *
 * Exports:
 *  - hexToRgb()               — Node-side helper (throws on invalid)
 *  - FIGMA_HEX_TO_RGB_SOURCE  — Source-code string for inlining into Figma eval templates
 *  - FIGMA_RGB_TO_HEX_SOURCE  — Source-code string for inlining into Figma eval templates
 *
 * The FIGMA_* constants exist because Figma's plugin runtime sandbox cannot
 * import from Node modules. Inline them via ${FIGMA_HEX_TO_RGB_SOURCE} inside
 * template literal eval strings so there is ONE canonical definition, not 15.
 */

/**
 * Convert a CSS hex color string to an {r, g, b} object with values in [0, 1].
 * Supports 3-char (#fff) and 6-char (#ffffff) forms, case-insensitive.
 *
 * @param {string} hex  e.g. '#fff', '#ffffff', '#FFF', '#FF5733'
 * @returns {{ r: number, g: number, b: number }}
 * @throws {Error} if the input is not a valid hex color
 */
export function hexToRgb(hex) {
  // Remove # if present
  hex = hex.replace(/^#/, '');

  // Expand 3-char hex to 6-char
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }

  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    throw new Error(`Invalid hex color: #${hex}`);
  }
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  };
}

/**
 * Canonical hexToRgb source code for inlining into Figma runtime eval templates.
 *
 * Figma plugin sandbox cannot import from Node modules, so this function must be
 * serialized into the eval string. Keep this in lockstep with the exported
 * hexToRgb() above so Node and Figma runtime behavior match.
 *
 * Differences from the Node-side version:
 *  - Returns null on invalid input instead of throwing (callers inside Figma
 *    runtime already guard with `if (rgb)` before applying fills/styles).
 *  - Handles #rgb shorthand via regex flag `^#?` plus 3-char expand.
 */
export const FIGMA_HEX_TO_RGB_SOURCE = `function hexToRgb(hex) {
  var clean = String(hex).replace(/^#/, '');
  if (clean.length === 3) clean = clean[0]+clean[0]+clean[1]+clean[1]+clean[2]+clean[2];
  var result = /^([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(clean);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : null;
}`;

/**
 * Canonical rgbToHex source code for inlining into Figma runtime eval templates.
 *
 * Accepts r, g, b in [0, 1] range (Figma's native representation).
 * Returns lowercase #rrggbb string.
 */
export const FIGMA_RGB_TO_HEX_SOURCE = `function rgbToHex(r, g, b) {
  var hex = function(n) { return Math.round(n * 255).toString(16).padStart(2, '0'); };
  return '#' + hex(r) + hex(g) + hex(b);
}`;
