import React, { createContext, useContext, useReducer, useEffect, useState, useRef, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { isCloudEnabled, pullWorkspace, pushWorkspace, flushPushWorkspace } from '../lib/supabase';

// Every device works on ONE shared copy in the cloud — open the app on any
// phone or computer and it's the same data, live, with no codes to enter.
const SHARED_ID = 'shared-main';
// Set once a device has merged its own data into the shared copy.
const JOINED_KEY = 'myshift_joined';
const LAST_MODIFIED_KEY = 'myshift_last_modified';
// Version stamp (cloud updated_at) of the cloud copy this device's data
// matches, and whether this device has edits the cloud doesn't have yet.
// Comparing versions — not clock times — keeps phone↔PC sync right even
// when the two devices' clocks disagree.
const SEEN_KEY = 'myshift_cloud_seen';
const DIRTY_KEY = 'myshift_dirty';
const PULL_EVERY_MS = 20000;

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

// Combine two copies of the data without losing anything: everything from
// both, by id; where both have the same item (or a shift for the same date
// and type), this device's version wins.
function mergeData(local, remote) {
  const byId = (mine = [], theirs = []) => {
    const m = new Map();
    for (const x of theirs) if (x && x.id) m.set(x.id, x);
    for (const x of mine) if (x && x.id) m.set(x.id, x);
    return [...m.values()];
  };
  const shifts = new Map();
  for (const sh of [...(remote.shifts || []), ...(local.shifts || [])]) {
    if (sh && sh.date && sh.name) shifts.set(`${sh.date}|${sh.name}`, sh);
  }
  return {
    ...remote,
    ...local,
    roles: byId(local.roles, remote.roles),
    departments: byId(local.departments, remote.departments),
    workers: byId(local.workers, remote.workers),
    shifts: [...shifts.values()],
    shiftTimes: { ...(remote.shiftTimes || {}), ...(local.shiftTimes || {}) },
  };
}
const lsSet = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* ignore */ } };

const AppContext = createContext();

const STORAGE_KEY = 'myshift_data_v3';
const BACKUP_KEY = 'myshift_data_v3_backup';

const defaultState = {
  roles: [],
  departments: [],
  workers: [],
  shifts: [],
  shiftTimes: {
    Morning: { start: '06:50', end: '16:30' },
    Afternoon: { start: '15:30', end: '00:30' },
    Night: { start: '18:50', end: '06:50' },
    Friday: { start: '06:50', end: '13:00' },
  },
};

function normalizeParsed(parsed) {
  return {
    roles: Array.isArray(parsed.roles) ? parsed.roles : [],
    departments: (Array.isArray(parsed.departments) ? parsed.departments : []).map((d) => ({
      ...d,
      requirements: d.requirements && typeof d.requirements === 'object' ? d.requirements : {},
    })),
    workers: (Array.isArray(parsed.workers) ? parsed.workers : []).map((w) => ({
      ...w,
      assignments: Array.isArray(w.assignments) ? w.assignments : [],
      availability: w.availability || {},
    })),
    shifts: Array.isArray(parsed.shifts) ? parsed.shifts : [],
    shiftTimes: { ...defaultState.shiftTimes, ...(parsed.shiftTimes || {}) },
  };
}

function loadState() {
  try {
    localStorage.removeItem('myshift_data');
    localStorage.removeItem('myshift_data_v2');

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return normalizeParsed(JSON.parse(raw));
    }
  } catch {
    // Primary storage is corrupted — try the backup copy before giving up on the data.
    try {
      const backup = localStorage.getItem(BACKUP_KEY);
      if (backup) return normalizeParsed(JSON.parse(backup));
    } catch {
      // fall through
    }
  }
  return null;
}

function reducer(state, action) {
  switch (action.type) {
    case 'REPLACE_STATE':
      return {
        ...defaultState,
        ...action.payload,
        // Re-apply normalizations
        workers: (action.payload.workers || []).map((w) => ({
          ...w,
          assignments: Array.isArray(w.assignments) ? w.assignments : [],
          availability: w.availability || {},
        })),
        departments: (action.payload.departments || []).map((d) => ({
          ...d,
          requirements: d.requirements && typeof d.requirements === 'object' ? d.requirements : {},
        })),
      };

    case 'ADD_ROLE':
      return { ...state, roles: [...state.roles, { id: uuid(), name: action.payload.name, priority: state.roles.length + 1 }] };
    case 'UPDATE_ROLE':
      return { ...state, roles: state.roles.map((r) => r.id === action.payload.id ? { ...r, ...action.payload } : r) };
    case 'DELETE_ROLE': {
      const roleId = action.payload;
      return {
        ...state,
        roles: state.roles.filter((r) => r.id !== roleId),
        departments: state.departments.map((d) => { const reqs = { ...(d.requirements || {}) }; delete reqs[roleId]; return { ...d, requirements: reqs }; }),
        workers: state.workers.map((w) => ({ ...w, assignments: (w.assignments || []).map((a) => ({ ...a, roleIds: (a.roleIds || []).filter((rid) => rid !== roleId) })) })),
      };
    }
    case 'REORDER_ROLES':
      return { ...state, roles: action.payload };

    case 'ADD_DEPARTMENT':
      return { ...state, departments: [...state.departments, {
        id: uuid(),
        name: action.payload.name,
        priority: state.departments.length + 1,
        requirements: action.payload.requirements || {},
        parentId: action.payload.parentId || null,
        isParent: action.payload.isParent || false,
      }] };
    case 'ADD_DEPARTMENT_WITH_CHILDREN': {
      const { parentName, childNames, requirements } = action.payload;
      const parentId = uuid();
      const newDepts = [
        { id: parentId, name: parentName, priority: state.departments.length + 1, requirements: { ...requirements }, parentId: null, isParent: true },
        ...childNames.map((cn, i) => ({
          id: uuid(),
          name: cn,
          priority: state.departments.length + 2 + i,
          requirements: { ...requirements },
          parentId,
          isParent: false,
        })),
      ];
      return { ...state, departments: [...state.departments, ...newDepts] };
    }
    case 'UPDATE_DEPARTMENT':
      return { ...state, departments: state.departments.map((d) => d.id === action.payload.id ? { ...d, ...action.payload } : d) };
    case 'DELETE_DEPARTMENT': {
      const deptId = action.payload;
      // Also delete children if this is a parent
      const childIds = state.departments.filter((d) => d.parentId === deptId).map((d) => d.id);
      const allRemoved = new Set([deptId, ...childIds]);
      return {
        ...state,
        departments: state.departments.filter((d) => !allRemoved.has(d.id)),
        workers: state.workers.map((w) => ({ ...w, assignments: (w.assignments || []).filter((a) => !allRemoved.has(a.deptId)) })),
      };
    }
    case 'REORDER_DEPARTMENTS':
      return { ...state, departments: action.payload };

    case 'ADD_WORKER':
      return { ...state, workers: [...state.workers, {
        id: uuid(),
        name: action.payload.name,
        assignments: action.payload.assignments || [],
        availability: action.payload.availability || {},
        ...(action.payload.isGroup ? { isGroup: true, quantity: Math.max(1, action.payload.quantity || 1) } : {}),
      }] };
    case 'UPDATE_WORKER':
      return { ...state, workers: state.workers.map((w) => w.id === action.payload.id ? { ...w, ...action.payload } : w) };
    case 'DELETE_WORKER':
      return { ...state, workers: state.workers.filter((w) => w.id !== action.payload) };

    case 'UPDATE_SHIFT_TIMES':
      return { ...state, shiftTimes: { ...(state.shiftTimes || {}), ...action.payload } };

    case 'ADD_SHIFT':
      return { ...state, shifts: [...state.shifts, { id: uuid(), date: action.payload.date, name: action.payload.name, assignments: action.payload.assignments, gaps: action.payload.gaps, deptNames: action.payload.deptNames || {}, workerTimes: action.payload.workerTimes || {}, createdAt: Date.now() }] };
    case 'UPDATE_SHIFT':
      return { ...state, shifts: state.shifts.map((s) => s.id === action.payload.id ? { ...s, ...action.payload } : s) };
    case 'DELETE_SHIFT':
      return { ...state, shifts: state.shifts.filter((s) => s.id !== action.payload) };

    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, loadState() || defaultState);
  const syncCode = isCloudEnabled() ? SHARED_ID : null;
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | error | offline
  const [lastSynced, setLastSynced] = useState(null);
  const skipNextSyncRef = useRef(false);
  const pushTimerRef = useRef(null);
  const isFirstPersistRef = useRef(true);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Always persist to localStorage (offline-first). Keep a backup copy of the
  // previous snapshot so a corrupted write can be recovered from.
  useEffect(() => {
    try {
      const prev = localStorage.getItem(STORAGE_KEY);
      if (prev) localStorage.setItem(BACKUP_KEY, prev);
    } catch {
      // ignore — backup is best-effort
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Failed to save locally:', err);
    }

    // Track when the user actually changed data on this device (not on initial
    // load, and not right after we replaced local state with a cloud pull).
    if (isFirstPersistRef.current) {
      isFirstPersistRef.current = false;
    } else if (!skipNextSyncRef.current) {
      lsSet(LAST_MODIFIED_KEY, String(Date.now()));
      lsSet(DIRTY_KEY, '1');
    }
  }, [state]);

  // Upload this device's data and remember which cloud version it now is.
  const pushNow = useCallback(async (code) => {
    const sent = stateRef.current;
    const updatedAt = await pushWorkspace(code, sent);
    if (updatedAt) lsSet(SEEN_KEY, updatedAt);
    // Only clear "dirty" if nothing changed while the upload was in flight.
    if (stateRef.current === sent) lsSet(DIRTY_KEY, null);
    setLastSynced(new Date());
  }, []);

  // Bring this device in line with the cloud:
  //  • cloud unchanged since we last saw it → just upload any local edits;
  //  • cloud changed (another device saved) and no local edits → take it;
  //  • both changed → keep the more recent side (rare: edits on two devices
  //    between syncs).
  const pullingRef = useRef(false);
  const syncWithCloud = useCallback(async ({ quiet = false } = {}) => {
    if (!isCloudEnabled() || !syncCode || pullingRef.current) return;
    if (pushTimerRef.current) return; // an upload is about to happen anyway
    pullingRef.current = true;
    try {
      if (!quiet) setSyncStatus('syncing');
      const remote = await pullWorkspace(syncCode);
      const seen = lsGet(SEEN_KEY);
      const localModified = Number(lsGet(LAST_MODIFIED_KEY) || 0);
      const remoteAt = remote && remote.updated_at ? remote.updated_at : null;
      const remoteMs = remoteAt ? new Date(remoteAt).getTime() : 0;
      // Devices updated before version tracking existed: fall back to times.
      const dirty = lsGet(DIRTY_KEY) === '1' || (!seen && localModified > remoteMs);

      if (lsGet(JOINED_KEY) !== SHARED_ID) {
        // First time this device joins the shared copy: combine what it has
        // with what's already in the cloud, so nobody's entries get lost.
        const merged = remote && remote.data ? mergeData(stateRef.current, remote.data) : stateRef.current;
        const updatedAt = await pushWorkspace(syncCode, merged);
        if (remote && remote.data) {
          skipNextSyncRef.current = true;
          dispatch({ type: 'REPLACE_STATE', payload: merged });
        }
        lsSet(SEEN_KEY, updatedAt);
        lsSet(DIRTY_KEY, null);
        lsSet(JOINED_KEY, SHARED_ID);
        setLastSynced(new Date());
      } else if (!remote || !remote.data) {
        await pushNow(syncCode);
      } else if (remoteAt && seen && remoteAt === seen) {
        if (dirty) await pushNow(syncCode);
      } else if (!dirty || remoteMs >= localModified) {
        skipNextSyncRef.current = true;
        dispatch({ type: 'REPLACE_STATE', payload: remote.data });
        lsSet(SEEN_KEY, remoteAt);
        lsSet(DIRTY_KEY, null);
        setLastSynced(new Date());
      } else {
        await pushNow(syncCode);
      }
      setSyncStatus('idle');
    } catch (err) {
      console.error('Sync failed:', err);
      setSyncStatus('error');
    } finally {
      pullingRef.current = false;
    }
  }, [syncCode, pushNow]);

  // On load, when coming back to the app, and every few seconds while it's
  // open: pick up changes saved from other devices (e.g. the phone).
  useEffect(() => {
    if (!isCloudEnabled() || !syncCode) return undefined;
    syncWithCloud();
    const onVisible = () => { if (document.visibilityState === 'visible') syncWithCloud({ quiet: true }); };
    const onFocus = () => syncWithCloud({ quiet: true });
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') syncWithCloud({ quiet: true });
    }, PULL_EVERY_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      clearInterval(id);
    };
  }, [syncCode, syncWithCloud]);

  // On state change: debounced push to cloud
  useEffect(() => {
    if (!isCloudEnabled() || !syncCode) return undefined;
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return undefined;
    }
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(async () => {
      pushTimerRef.current = null;
      try {
        setSyncStatus('syncing');
        await pushNow(syncCode);
        setSyncStatus('idle');
      } catch (err) {
        console.error('Push failed:', err);
        setSyncStatus('error');
      }
    }, 800);
    return () => {
      // Clear the marker too: a stale id here looked like "an upload is about
      // to happen" forever, and the device stopped picking up other devices'
      // changes (syncWithCloud skips while an upload is pending).
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
      pushTimerRef.current = null;
    };
  }, [state, syncCode, pushNow]);

  // Flush any pending push immediately when the tab is being hidden/closed, so a
  // quick refresh or tab-close right after an edit doesn't lose the debounced push.
  // A normal fetch (what pushWorkspace uses) isn't guaranteed to finish once the
  // page starts unloading, so this always also fires a keepalive request that the
  // browser will let complete in the background even after the page is gone.
  useEffect(() => {
    if (!isCloudEnabled() || !syncCode) return;
    const flush = () => {
      const pending = !!pushTimerRef.current;
      if (pending) {
        clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
      // Only when there's something the cloud doesn't have yet.
      if (!pending && lsGet(DIRTY_KEY) !== '1') return;
      const updatedAt = flushPushWorkspace(syncCode, stateRef.current);
      if (updatedAt) lsSet(SEEN_KEY, updatedAt);
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [syncCode]);

  return (
    <AppContext.Provider value={{
      state, dispatch,
      syncStatus, lastSynced,
      cloudEnabled: isCloudEnabled(),
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}

// ─── Availability helpers ───
// availability: { "2026-04-14": ["Morning","Afternoon"], "default": ["Morning","Afternoon","Night"] }
export function isWorkerAvailable(worker, date, shiftName) {
  const avail = worker.availability || {};
  const dayAvail = avail[date] || avail['default'];
  if (!dayAvail) return true; // no availability set = available always
  return dayAvail.includes(shiftName);
}

// ─── Maximum Bipartite Matching Auto-Assignment ───
// Shuffled for variety — each call produces a different valid optimal assignment
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function autoAssign(roles, departments, workers, selectedWorkerIds, allDepartments) {
  const sortedDepts = [...departments].sort((a, b) => a.priority - b.priority);
  const sortedRoles = [...roles].sort((a, b) => a.priority - b.priority);
  const availableWorkers = shuffle(workers.filter((w) => selectedWorkerIds.includes(w.id)));

  const allDepts = allDepartments || departments;

  const slots = [];
  for (const dept of sortedDepts) {
    const reqs = dept.requirements || {};
    for (const role of sortedRoles) {
      const needed = reqs[role.id] || 0;
      for (let i = 0; i < needed; i++) {
        slots.push({ id: slots.length, deptId: dept.id, roleId: role.id });
      }
    }
  }

  function canWorkerFillSlot(worker, slot) {
    const assigns = worker.assignments || [];
    const direct = assigns.find((a) => a.deptId === slot.deptId);
    if (direct && (direct.roleIds || []).includes(slot.roleId)) return true;
    const dept = allDepts.find((d) => d.id === slot.deptId);
    if (dept && dept.parentId) {
      const parentAssign = assigns.find((a) => a.deptId === dept.parentId);
      if (parentAssign && (parentAssign.roleIds || []).includes(slot.roleId)) return true;
    }
    return false;
  }

  const slotToWorkers = new Map();
  const workerToSlots = new Map();
  for (let wi = 0; wi < availableWorkers.length; wi++) workerToSlots.set(wi, []);
  for (const slot of slots) {
    const eligible = [];
    for (let wi = 0; wi < availableWorkers.length; wi++) {
      if (canWorkerFillSlot(availableWorkers[wi], slot)) {
        eligible.push(wi);
        workerToSlots.get(wi).push(slot.id);
      }
    }
    // Shuffle eligible workers so matching explores different paths each time
    slotToWorkers.set(slot.id, shuffle(eligible));
  }

  const slotMatch = new Array(slots.length).fill(-1);
  const workerMatch = new Array(availableWorkers.length).fill(-1);

  function augment(slotId, visited) {
    for (const wi of (slotToWorkers.get(slotId) || [])) {
      if (visited.has(wi)) continue;
      visited.add(wi);
      if (workerMatch[wi] === -1 || augment(workerMatch[wi], visited)) {
        slotMatch[slotId] = wi;
        workerMatch[wi] = slotId;
        return true;
      }
    }
    return false;
  }

  for (const slot of slots) augment(slot.id, new Set());

  const assignments = {};
  const gaps = {};
  for (const dept of sortedDepts) {
    assignments[dept.id] = {};
    for (const role of sortedRoles) {
      if (((dept.requirements || {})[role.id] || 0) > 0) assignments[dept.id][role.id] = [];
    }
  }

  const assignedIds = new Set();
  for (const slot of slots) {
    const wi = slotMatch[slot.id];
    if (wi !== -1) {
      assignments[slot.deptId][slot.roleId].push(availableWorkers[wi].id);
      assignedIds.add(availableWorkers[wi].id);
    } else {
      if (!gaps[slot.deptId]) gaps[slot.deptId] = {};
      gaps[slot.deptId][slot.roleId] = (gaps[slot.deptId][slot.roleId] || 0) + 1;
    }
  }

  return { assignments, gaps, unassigned: availableWorkers.filter((w) => !assignedIds.has(w.id)).map((w) => w.id) };
}
