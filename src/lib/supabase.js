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
