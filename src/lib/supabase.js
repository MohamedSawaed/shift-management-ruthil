import { createClient } from '@supabase/supabase-js';

const url = process.env.REACT_APP_SUPABASE_URL;
const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export const isCloudEnabled = () => !!supabase;

// ─── Sync code generator (8 chars, no ambiguous) ───
const CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O/1/I/L

export function generateSyncCode() {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
    if (i === 3) code += '-';
  }
  return code;
}

export function normalizeSyncCode(code) {
  if (!code) return '';
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length === 8) return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  return code.toUpperCase();
}

// ─── Cloud operations ───
export async function pullWorkspace(syncCode) {
  if (!supabase || !syncCode) return null;
  const { data, error } = await supabase
    .from('workspaces')
    .select('data, updated_at')
    .eq('id', syncCode)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw error;
  }
  return data;
}

export async function pushWorkspace(syncCode, dataBlob) {
  if (!supabase || !syncCode) return;
  const { error } = await supabase
    .from('workspaces')
    .upsert({ id: syncCode, data: dataBlob, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function createWorkspace(syncCode, dataBlob) {
  if (!supabase || !syncCode) return;
  const { error } = await supabase
    .from('workspaces')
    .insert({ id: syncCode, data: dataBlob });
  if (error) throw error;
}

// A plain `fetch` kicked off from a pagehide/visibilitychange handler is not
// guaranteed to finish before the browser tears the page down — it's a very
// common way for "the last edit before closing the app" to silently never
// reach the server. `keepalive: true` tells the browser to let the request
// complete in the background even after the page is gone (subject to a
// small body-size limit, fine for our JSON payloads). supabase-js doesn't
// expose a way to set that flag, so this talks to the REST endpoint
// directly for just this one case.
export function flushPushWorkspace(syncCode, dataBlob) {
  if (!url || !anonKey || !syncCode) return;
  try {
    fetch(`${url}/rest/v1/workspaces?on_conflict=id`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ id: syncCode, data: dataBlob, updated_at: new Date().toISOString() }),
    }).catch(() => { /* best-effort; next sync will catch up */ });
  } catch {
    // ignore — this is a best-effort safety net, not the primary sync path
  }
}
