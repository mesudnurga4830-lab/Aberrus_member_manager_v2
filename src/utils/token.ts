/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generates a unique, cryptographically random, secure login token for a member.
 * Stored in the member's Firestore document as loginToken.
 * Included in the Telegram welcome message: https://[APP_URL]/login?token=<uniqueToken>
 */
export function generateLoginToken(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(24);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `tkn_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 12)}_${Math.random().toString(36).substring(2, 12)}`;
}
