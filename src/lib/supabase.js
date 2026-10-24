import { createClient } from '@supabase/supabase-js';

// Read the cloud settings tolerantly. The two Vercel settings are easy to
// mix up (e.g. the key pasted into REACT_APP_SUPABASE_URL), so:
//  • whichever value is an http(s) address is the URL;
//  • the other is the key (preferring a legacy "eyJ…" anon key);
//  • with no address at all, derive it from the anon key, which records its
//    project ("ref") → https://<ref>.supabase.co.
const RAW = [process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY]
  .map((v) => (v || '').trim().replace(/^["']|["']$/g, ''))
  .filter(Boolean);

function isHttpUrl(v) {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function projectRefFromKey(key) {
  try {
    const part = key.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
    const claims = JSON.parse(atob(b64));
    return claims.role === 'anon' && /^[a-z0-9]+$/.test(claims.ref || '') ? claims.ref : null;
  } catch {
    return null;
  }
}

const keys = RAW.filter((v) => !isHttpUrl(v));
const anonKey = keys.find((k) => k.startsWith('eyJ')) || keys[0] || null;
const url = (RAW.find(isHttpUrl) || '').replace(/\/+$/, '')
  || (() => {
    const ref = keys.map(projectRefFromKey).find(Boolean);
    return ref ? `https://${ref}.supabase.co` : null;
  })();

// Anything still unusable must not take the app down (it used to render a
// blank page): treat it as "cloud unavailable" and keep working locally.
function makeClient() {
  if (!url || !anonKey) {
    if (RAW.length) console.error('Cloud sync disabled — check REACT_APP_SUPABASE_URL (https://<project>.supabase.co) and REACT_APP_SUPABASE_ANON_KEY.');
    return null;
  }
  try {
    return createClient(url, anonKey);
  } catch (err) {
    console.error('Cloud sync disabled:', err.message);
    return null;
  }
}

export const supabase = makeClient();

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

// Returns the version stamp (updated_at) it saved, so the device can tell
// later whether the cloud copy has changed since.
export async function pushWorkspace(syncCode, dataBlob) {
  if (!supabase || !syncCode) return null;
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from('workspaces')
    .upsert({ id: syncCode, data: dataBlob, updated_at: updatedAt });
  if (error) throw error;
  return updatedAt;
}

export async function createWorkspace(syncCode, dataBlob) {
  if (!supabase || !syncCode) return null;
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from('workspaces')
    .insert({ id: syncCode, data: dataBlob, updated_at: updatedAt });
  if (error) throw error;
  return updatedAt;
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
  if (!supabase || !syncCode) return null;
  const updatedAt = new Date().toISOString();
  try {
    fetch(`${url}/rest/v1/workspaces?on_conflict=id`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        // Legacy anon keys are JWTs and go in Authorization too; the newer
        // "sb_publishable_…" keys aren't JWTs and must only be sent as apikey.
        ...(anonKey.startsWith('eyJ') ? { Authorization: `Bearer ${anonKey}` } : {}),
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ id: syncCode, data: dataBlob, updated_at: updatedAt }),
    }).catch(() => { /* best-effort; next sync will catch up */ });
  } catch {
    // ignore — this is a best-effort safety net, not the primary sync path
  }
  return updatedAt;
}
