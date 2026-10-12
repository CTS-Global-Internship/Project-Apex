import { createClient } from '@supabase/supabase-js';

// Both values are public by design: Row Level Security on the database decides
// what a signed-in user can read or change. The defaults point at the CTS project.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://damyfqokzlsqvklnzfoq.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Emi475Z4u-YBeRP_Xf8ThA_5IjTzHa3';

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Call a database function and throw a readable error if it fails. */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(friendlyError(error.message));
  return data as T;
}

const MESSAGES: Record<string, string> = {
  INVALID_INVITE_CODE: 'That invite code isn’t valid or has been used up. Ask your program lead for a new one.',
  NOT_SIGNED_IN: 'Your session ended. Sign in again.',
  NOT_ALLOWED: 'Your account doesn’t have access to that.',
  NO_ATTEMPTS_LEFT: 'You’ve used all your attempts for this quiz.',
  MODULE_NOT_AVAILABLE: 'This module isn’t published yet.',
  ANSWER_TOO_SHORT: 'Write at least a couple of sentences before submitting.',
  ALREADY_REVIEWED: 'A mentor has already reviewed this drill, so it can’t be changed.',
  SCORE_OUT_OF_RANGE: 'Scores must be between 0 and 100.',
  LAST_ADMIN: 'You can’t remove the last admin. Make someone else an admin first.',
  TITLE_REQUIRED: 'Give the module a title.',
  NOT_FOUND: 'That item no longer exists. Refresh the page.',
};

export function friendlyError(raw: string): string {
  if (/Database error saving new user/i.test(raw)) return MESSAGES.INVALID_INVITE_CODE;
  if (/Invalid login credentials/i.test(raw)) return 'Email or password is incorrect.';
  if (/Email not confirmed/i.test(raw)) return 'Confirm your email first. Check your inbox for the link.';
  if (/User already registered/i.test(raw)) return 'An account with this email already exists. Sign in instead.';
  const q = raw.match(/QUESTION_(\d+)_(NEEDS_\w+)/);
  if (q) {
    const what = { NEEDS_TEXT: 'needs question text', NEEDS_TWO_OPTIONS: 'needs at least two options', NEEDS_CORRECT_ANSWER: 'needs a correct answer marked' }[q[2]];
    return `Question ${q[1]} ${what ?? 'is incomplete'}.`;
  }
  for (const code of Object.keys(MESSAGES)) if (raw.includes(code)) return MESSAGES[code];
  return raw;
}
