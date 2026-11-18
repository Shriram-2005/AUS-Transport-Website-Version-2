import { createClient } from '@/lib/supabase/client';

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'austransportpm@gmail.com';
export const EDIT_SESSION_DURATION_MS = 5 * 60 * 1000; // 5 minutes strict

// Global session store across requests (works within server runtime)
const sessionStore = new Map<string, number>();

/**
 * Verifies password against Supabase Auth using the admin login email
 */
export async function verifyAdminPassword(password: string, customEmail?: string): Promise<boolean> {
  if (!password || typeof password !== 'string') return false;
  try {
    const supabase = createClient();
    const emailToUse = customEmail || ADMIN_EMAIL;
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password: password.trim(),
    });

    if (error || !data.user) {
      return false;
    }
    return true;
  } catch (err) {
    console.error('Password verification error:', err);
    return false;
  }
}

/**
 * Grants a 5-minute edit session for a specific session/chat ID
 */
export function grantEditSession(sessionId: string): number {
  const expiresAt = Date.now() + EDIT_SESSION_DURATION_MS;
  sessionStore.set(sessionId, expiresAt);
  return expiresAt;
}

/**
 * Checks whether an edit session is currently active and within the 5-minute window
 */
export function isEditSessionValid(sessionId: string): boolean {
  const expiresAt = sessionStore.get(sessionId);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    sessionStore.delete(sessionId);
    return false;
  }
  return true;
}

/**
 * Returns remaining seconds on the 5-minute session
 */
export function getSessionRemainingSeconds(sessionId: string): number {
  const expiresAt = sessionStore.get(sessionId);
  if (!expiresAt) return 0;
  const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  if (remaining === 0) {
    sessionStore.delete(sessionId);
  }
  return remaining;
}

/**
 * Revoke or logout edit session
 */
export function revokeEditSession(sessionId: string): void {
  sessionStore.delete(sessionId);
}
