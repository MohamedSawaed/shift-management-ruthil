import React, { createContext, useContext, useReducer, useEffect, useState, useRef, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { isCloudEnabled, pullWorkspace, pushWorkspace, createWorkspace, generateSyncCode } from '../lib/supabase';

const SYNC_CODE_KEY = 'myshift_sync_code';

const AppContext = createContext();

const STORAGE_KEY = 'myshift_data_v3';

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

function loadState() {
  try {
    localStorage.removeItem('myshift_data');
    localStorage.removeItem('myshift_data_v2');

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
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
  } catch {
    localStorage.removeItem(STORAGE_KEY);
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
      return { ...state, workers: [...state.workers, { id: uuid(), name: action.payload.name, assignments: action.payload.assignments || [], availability: action.payload.availability || {} }] };
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
  const [syncCode, setSyncCodeState] = useState(() => {
    try { return localStorage.getItem(SYNC_CODE_KEY) || null; } catch { return null; }
  });
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | error | offline
  const [lastSynced, setLastSynced] = useState(null);
  const skipNextSyncRef = useRef(false);
  const pushTimerRef = useRef(null);

  // Always persist to localStorage (offline-first)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // On first load: if cloud enabled and we have a sync code, pull latest
  useEffect(() => {
    if (!isCloudEnabled() || !syncCode) return;
    let cancelled = false;
    (async () => {
      try {
        setSyncStatus('syncing');
        const remote = await pullWorkspace(syncCode);
        if (cancelled) return;
        if (remote && remote.data) {
          skipNextSyncRef.current = true;
          dispatch({ type: 'REPLACE_STATE', payload: remote.data });
          setLastSynced(new Date());
        }
        setSyncStatus('idle');
      } catch (err) {
        console.error('Pull failed:', err);
        if (!cancelled) setSyncStatus('error');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncCode]);

  // On state change: debounced push to cloud
  useEffect(() => {
    if (!isCloudEnabled() || !syncCode) return;
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(async () => {
      try {
        setSyncStatus('syncing');
        await pushWorkspace(syncCode, state);
        setLastSynced(new Date());
        setSyncStatus('idle');
      } catch (err) {
        console.error('Push failed:', err);
        setSyncStatus('error');
      }
    }, 800);
    return () => { if (pushTimerRef.current) clearTimeout(pushTimerRef.current); };
  }, [state, syncCode]);

  // ─── Sync controls ───
  const setSyncCode = useCallback((code) => {
    if (code) {
      localStorage.setItem(SYNC_CODE_KEY, code);
    } else {
      localStorage.removeItem(SYNC_CODE_KEY);
    }
    setSyncCodeState(code);
  }, []);

  const createNewSyncCode = useCallback(async () => {
    if (!isCloudEnabled()) return null;
    const code = generateSyncCode();
    try {
      setSyncStatus('syncing');
      await createWorkspace(code, state);
      setSyncCode(code);
      setLastSynced(new Date());
      setSyncStatus('idle');
      return code;
    } catch (err) {
      console.error('Create failed:', err);
      setSyncStatus('error');
      return null;
    }
  }, [state, setSyncCode]);

  const connectToSyncCode = useCallback(async (code) => {
    if (!isCloudEnabled() || !code) return { ok: false, error: 'no_cloud' };
    try {
      setSyncStatus('syncing');
      const remote = await pullWorkspace(code);
      if (!remote) {
        setSyncStatus('idle');
        return { ok: false, error: 'not_found' };
      }
      skipNextSyncRef.current = true;
      dispatch({ type: 'REPLACE_STATE', payload: remote.data });
      setSyncCode(code);
      setLastSynced(new Date());
      setSyncStatus('idle');
      return { ok: true };
    } catch (err) {
      console.error('Connect failed:', err);
      setSyncStatus('error');
      return { ok: false, error: 'network' };
    }
  }, [setSyncCode]);

  const disconnectSync = useCallback(() => {
    setSyncCode(null);
  }, [setSyncCode]);

  return (
    <AppContext.Provider value={{
      state, dispatch,
      syncCode, syncStatus, lastSynced,
      createNewSyncCode, connectToSyncCode, disconnectSync,
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
