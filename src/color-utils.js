/**
 * color-utils.js
 * Shared color helpers for figma-ds-cli.
 *
 * Note: hexToRgb inside generated Figma eval strings must remain inline
 * because they run in Figma's JS runtime, not Node. This module is for
 * the module-level helper in src/index.js.
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
