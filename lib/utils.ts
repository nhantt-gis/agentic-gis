/**
 * Shared utility functions.
 */

/** Generate a unique message ID */
export function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
