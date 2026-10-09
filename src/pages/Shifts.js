import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useApp, autoAssign, isWorkerAvailable } from '../context/AppContext';
import { useLang } from '../i18n/LangContext';
import { SHIFT_TYPES, shiftMeta, shiftLabel as labelForShift, countGaps, localDateISO, shiftInterval, addDays } from '../lib/shiftTypes';
import Avatar from '../components/Avatar';
import { expandWorkers, workerName as nameOf, sortByName } from '../lib/workers';
import { Zap, Save, AlertTriangle, Undo2, Pencil, Image, Sparkles, CheckCircle2, ArrowLeft, ArrowRight, Check, RotateCcw, X, Users, Building2 } from 'lucide-react';
import ShiftImage from '../components/ShiftImage';

export default function Shifts() {
  const { state, dispatch } = useApp();
  const { t, lang } = useLang();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const shiftLabel = (s) => labelForShift(t, s);
  // Today's "Build" buttons open the builder pre-filled with ?date=…&shift=…
  const [date, setDate] = useState(() => {
    const q = searchParams.get('date');
    return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : localDateISO();
  });
  const [shiftName, setShiftName] = useState(() => {
    const q = searchParams.get('shift');
    return SHIFT_TYPES.includes(q) ? q : 'Morning';
  });
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [deptNameOverrides, setDeptNameOverrides] = useState({});  // { deptId: "custom name" }
  const [editingDeptName, setEditingDeptName] = useState(null);
  // Wizard: 1 When → 2 Departments → 3 Workers → 4 Review
  const [step, setStep] = useState(1);
  const [autoPicked, setAutoPicked] = useState(false);
  const [dragWorker, setDragWorker] = useState(null);
  const [shareShift, setShareShift] = useState(null);
  const [selectedSwapWorker, setSelectedSwapWorker] = useState(null);
  const [workerTimeOverrides, setWorkerTimeOverrides] = useState({}); // { "deptId::workerId": { start, end } }

  const roles = useMemo(() => [...state.roles].sort((a, b) => a.priority - b.priority), [state.roles]);
  // Individual people, with worker groups expanded into their numbered members.
  const units = useMemo(() => expandWorkers(state.workers), [state.workers]);
  const allDeptsRaw = useMemo(() => [...state.departments].sort((a, b) => a.priority - b.priority), [state.departments]);
  // Only show leaf departments in shifts (no parents that have children)
  const allDepts = useMemo(() => {
    const parentIds = new Set(allDeptsRaw.filter((d) => d.parentId).map((d) => d.parentId));
    return allDeptsRaw.filter((d) => !parentIds.has(d.id));
  }, [allDeptsRaw]);

  // Display name: "Parent > Child" for children, just name for standalone
  const getDeptLabel = (dept) => {
    if (dept.parentId) {
      const parent = state.departments.find((d) => d.id === dept.parentId);
      return parent ? `${parent.name} › ${dept.name}` : dept.name;
    }
    return dept.name;
  };

  const getDeptFeatures = (dept) => (dept.features || []);

  const getDeptInfo = (dept) => {
    const total = Object.values(dept.requirements || {}).reduce((s, n) => s + n, 0);
    const workerCount = units.filter((w) => (w.assignments || []).some((a) => a.deptId === dept.id)).length;
    return t('deptPickInfo', { needed: total, workers: workerCount });
  };

  // Group leaf depts by parent for display
  const groupedDepts = useMemo(() => {
    const groups = [];
    const standalone = allDepts.filter((d) => !d.parentId);
    const childDepts = allDepts.filter((d) => d.parentId);
    const parentIds = [...new Set(childDepts.map((d) => d.parentId))];

    for (const dept of standalone) {
      // Check it's not a parent with children (already filtered, but just in case)
      groups.push({ type: 'single', dept });
    }
    for (const pid of parentIds) {
      const parent = state.departments.find((d) => d.id === pid);
      const children = childDepts.filter((d) => d.parentId === pid);
      if (parent && children.length > 0) {
        groups.push({ type: 'group', parent, children });
      }
    }
    return groups;
  }, [allDepts, state.departments]);

  // Who is already working at the same time as this shift, and on which
  // shift. Based on real time overlap (shift hours from Settings, or a
  // person's own hours on that shift), not just the same date — so the same
  // people can do Morning and Night on one day, while Afternoon (which
  // overlaps both) still blocks them. Also catches last night's Night shift
  // running into this morning. Without hours set, any shift on the same date
  // counts. The shift being (re)built itself never counts.
  const busyInfo = useMemo(() => {
    const busy = new Map(); // worker/member id → names of the clashing shifts
    const times = state.shiftTimes || {};
    const own = times[shiftName] || {};
    const target = shiftInterval(date, own.start, own.end);
    const near = new Set([addDays(date, -1), date, addDays(date, 1)]);
    for (const shift of state.shifts) {
      if (!near.has(shift.date)) continue;
      if (shift.date === date && shift.name === shiftName) continue;
      const def = times[shift.name] || {};
      const assign = shift.assignments || {};
      for (const dId of Object.keys(assign)) {
        for (const rId of Object.keys(assign[dId] || {})) {
          for (const wid of (assign[dId][rId] || [])) {
            const wt = (shift.workerTimes || {})[`${dId}::${wid}`] || {};
            const iv = shiftInterval(shift.date, wt.start || def.start, wt.end || def.end);
            const clash = target && iv ? iv[0] < target[1] && target[0] < iv[1] : shift.date === date;
            if (clash) busy.set(wid, [...new Set([...(busy.get(wid) || []), shift.name])]);
          }
        }
      }
    }
    return busy;
  }, [state.shifts, state.shiftTimes, date, shiftName]);
  const busyWorkerIds = useMemo(() => new Set(busyInfo.keys()), [busyInfo]);

  // Workers available for this date+shift and relevant to selected depts
  // Excludes workers already assigned to another shift on the same date
  const relevantWorkers = useMemo(() => {
    const parentIds = new Set();
    for (const dId of selectedDepts) {
      const dept = state.departments.find((d) => d.id === dId);
      if (dept && dept.parentId) parentIds.add(dept.parentId);
    }
    const relevantDeptIds = new Set([...selectedDepts, ...parentIds]);

    return units.filter((w) => {
      if (w.onVacation) return false;
      if (busyWorkerIds.has(w.id)) return false;
      if (!isWorkerAvailable(w, date, shiftName)) return false;
      if (selectedDepts.length === 0) return true;
      return (w.assignments || []).some((a) => relevantDeptIds.has(a.deptId));
    });
  }, [units, state.departments, selectedDepts, date, shiftName, busyWorkerIds]);

  // People who would be listed but are on an overlapping shift — said out
  // loud in the Workers step instead of silently disappearing.
  const hiddenBusy = useMemo(() => {
    const parentIds = new Set();
    for (const dId of selectedDepts) {
      const dept = state.departments.find((d) => d.id === dId);
      if (dept && dept.parentId) parentIds.add(dept.parentId);
    }
    const relevantDeptIds = new Set([...selectedDepts, ...parentIds]);
    const hidden = units.filter((w) => busyInfo.has(w.id) && !w.onVacation && isWorkerAvailable(w, date, shiftName)
      && (w.assignments || []).some((a) => relevantDeptIds.has(a.deptId)));
    const names = new Set(hidden.flatMap((w) => busyInfo.get(w.id)));
    return { count: hidden.length, shifts: SHIFT_TYPES.filter((st) => names.has(st)) };
  }, [units, state.departments, selectedDepts, date, shiftName, busyInfo]);

  const toggleDept = (id) => { setSelectedDepts((p) => p.includes(id) ? p.filter((d) => d !== id) : [...p, id]); setResult(null); };
  const selectAllDepts = () => { setSelectedDepts(allDepts.map((d) => d.id)); setResult(null); };
  const toggleWorker = (id) => { setSelectedWorkers((p) => p.includes(id) ? p.filter((w) => w !== id) : [...p, id]); setResult(null); };
  const selectAllWorkers = () => { setSelectedWorkers(relevantWorkers.map((w) => w.id)); setResult(null); };
  const clearWorkers = () => { setSelectedWorkers([]); setResult(null); };

  // ─── Smart worker analysis ───
  const workerAnalysis = useMemo(() => {
    if (selectedDepts.length === 0) return { workers: [], totalSlots: 0, coverage: 0, gaps: [] };

    const activeDepts = allDepts.filter((d) => selectedDepts.includes(d.id));
    const allDeptsFull = state.departments;

    // Build all slots needed
    const slots = [];
    for (const dept of activeDepts) {
      const reqs = dept.requirements || {};
      for (const role of roles) {
        const needed = reqs[role.id] || 0;
        for (let i = 0; i < needed; i++) {
          slots.push({ deptId: dept.id, roleId: role.id });
        }
      }
    }

    // For each worker, compute which slots they can fill
    const analyzed = relevantWorkers.map((w) => {
      const assigns = w.assignments || [];
      const fillableSlots = slots.filter((slot) => {
        const direct = assigns.find((a) => a.deptId === slot.deptId);
        if (direct && (direct.roleIds || []).includes(slot.roleId)) return true;
        const dept = allDeptsFull.find((d) => d.id === slot.deptId);
        if (dept && dept.parentId) {
          const pa = assigns.find((a) => a.deptId === dept.parentId);
          if (pa && (pa.roleIds || []).includes(slot.roleId)) return true;
        }
        return false;
      });

      // Which unique role+dept combos can this worker fill
      const roleSet = new Set(fillableSlots.map((s) => s.roleId));
      const deptSet = new Set(fillableSlots.map((s) => s.deptId));
      const roleNames = [...roleSet].map((rid) => roles.find((r) => r.id === rid)?.name || '?');

      return {
        ...w,
        fillableCount: fillableSlots.length,
        fillableSlots,
        roleNames,
        deptCount: deptSet.size,
        roleCount: roleSet.size,
      };
    });

    // Find "critical" workers — sole worker who can fill a specific slot type
    // Group slots by deptId+roleId
    const slotGroups = {};
    for (const slot of slots) {
      const key = `${slot.deptId}::${slot.roleId}`;
      if (!slotGroups[key]) slotGroups[key] = { ...slot, count: 0 };
      slotGroups[key].count++;
    }

    for (const wa of analyzed) {
      wa.isCritical = false;
      wa.criticalFor = [];
    }

    for (const key of Object.keys(slotGroups)) {
      const sg = slotGroups[key];
      const whoCanFill = analyzed.filter((wa) =>
        wa.fillableSlots.some((s) => s.deptId === sg.deptId && s.roleId === sg.roleId)
      );
      if (whoCanFill.length <= sg.count) {
        // These workers are critical — without them this slot can't be filled
        for (const wa of whoCanFill) {
          wa.isCritical = true;
          const rn = roles.find((r) => r.id === sg.roleId)?.name || '?';
          const dn = activeDepts.find((d) => d.id === sg.deptId)?.name || '?';
          if (!wa.criticalFor.find((c) => c === `${rn} in ${dn}`)) {
            wa.criticalFor.push(`${rn} in ${dn}`);
          }
        }
      }
    }

    // ─── Simulate coverage with current selection ───
    const selectedSet = new Set(selectedWorkers);

    function simulateCoverage(workerIds) {
      const pool = new Set(workerIds);
      let filled = 0;
      for (const slot of slots) {
        const filler = analyzed.find((wa) =>
          pool.has(wa.id) && wa.fillableSlots.some((s) => s.deptId === slot.deptId && s.roleId === slot.roleId)
        );
        if (filler) { pool.delete(filler.id); filled++; }
      }
      return filled;
    }

    const filledCount = simulateCoverage(selectedWorkers);

    // ─── Per-worker impact: what happens if you add/remove this worker ───
    for (const wa of analyzed) {
      const isSelected = selectedSet.has(wa.id);
      if (isSelected) {
        // Impact of REMOVING: current coverage - coverage without them
        const without = selectedWorkers.filter((id) => id !== wa.id);
        const filledWithout = simulateCoverage(without);
        wa.impact = filledCount - filledWithout; // positive = they're valuable
        wa.impactLabel = wa.impact > 0 ? `-${wa.impact}` : '0';
      } else {
        // Impact of ADDING: coverage with them - current coverage
        const withThem = [...selectedWorkers, wa.id];
        const filledWith = simulateCoverage(withThem);
        wa.impact = filledWith - filledCount;
        wa.impactLabel = wa.impact > 0 ? `+${wa.impact}` : '0';
      }
    }

    // ─── Gap analysis ───
    const gapRoles = {};
    for (const key of Object.keys(slotGroups)) {
      const sg = slotGroups[key];
      const canFillCount = analyzed.filter((wa) =>
        selectedSet.has(wa.id) && wa.fillableSlots.some((s) => s.deptId === sg.deptId && s.roleId === sg.roleId)
      ).length;
      const missing = sg.count - Math.min(sg.count, canFillCount);
      if (missing > 0) {
        const rn = roles.find((r) => r.id === sg.roleId)?.name || '?';
        gapRoles[rn] = (gapRoles[rn] || 0) + missing;
      }
    }

    // ─── Sort: selected on top, then by impact desc, critical first for ties ───
    analyzed.sort((a, b) => {
      const aSelected = selectedSet.has(a.id) ? 1 : 0;
      const bSelected = selectedSet.has(b.id) ? 1 : 0;
      if (aSelected !== bSelected) return bSelected - aSelected; // selected first
      // Among unselected: highest impact first
      if (!aSelected) {
        if (b.impact !== a.impact) return b.impact - a.impact;
        if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1;
        return b.fillableCount - a.fillableCount;
      }
      // Among selected: most impactful (hardest to remove) first
      if (b.impact !== a.impact) return b.impact - a.impact;
      return b.fillableCount - a.fillableCount;
    });

    // Best next pick (highest impact unselected worker)
    const bestNext = analyzed.find((wa) => !selectedSet.has(wa.id) && wa.impact > 0);

    return {
      workers: analyzed,
      totalSlots: slots.length,
      filledCount,
      coverage: slots.length > 0 ? Math.round((filledCount / slots.length) * 100) : 100,
      gaps: Object.entries(gapRoles).map(([role, count]) => ({ role, count })),
      bestNextId: bestNext ? bestNext.id : null,
    };
  }, [relevantWorkers, selectedDepts, selectedWorkers, allDepts, roles, state.departments]);

  // Smart select: pick the minimum workers to fill all slots
  const smartSelect = useCallback(() => {
    if (workerAnalysis.totalSlots === 0) return;
    // Start with critical workers, then greedily add most-covering workers
    const picked = new Set();
    const remaining = [...workerAnalysis.workers];

    // Always pick critical first
    for (const w of remaining) {
      if (w.isCritical) picked.add(w.id);
    }

    // Greedy: keep adding worker who covers most remaining uncovered slots
    const slots = [];
    const activeDepts = allDepts.filter((d) => selectedDepts.includes(d.id));
    for (const dept of activeDepts) {
      const reqs = dept.requirements || {};
      for (const role of roles) {
        const needed = reqs[role.id] || 0;
        for (let i = 0; i < needed; i++) slots.push({ deptId: dept.id, roleId: role.id, filled: false });
      }
    }

    // Mark slots filled by critical workers
    const availablePool = new Set(picked);
    for (const slot of slots) {
      const filler = remaining.find((wa) =>
        availablePool.has(wa.id) && wa.fillableSlots.some((s) => s.deptId === slot.deptId && s.roleId === slot.roleId)
      );
      if (filler) {
        availablePool.delete(filler.id);
        slot.filled = true;
      }
    }

    // Greedily add more
    let changed = true;
    while (changed) {
      changed = false;
      const unfilled = slots.filter((s) => !s.filled);
      if (unfilled.length === 0) break;

      let bestWorker = null;
      let bestCover = 0;
      for (const wa of remaining) {
        if (picked.has(wa.id)) continue;
        const covers = unfilled.filter((s) =>
          wa.fillableSlots.some((fs) => fs.deptId === s.deptId && fs.roleId === s.roleId)
        ).length;
        if (covers > bestCover) {
          bestCover = covers;
          bestWorker = wa;
        }
      }
      if (bestWorker && bestCover > 0) {
        picked.add(bestWorker.id);
        // Mark slots
        for (const slot of unfilled) {
          if (!slot.filled && bestWorker.fillableSlots.some((fs) => fs.deptId === slot.deptId && fs.roleId === slot.roleId)) {
            slot.filled = true;
            break; // one worker fills one slot
          }
        }
        changed = true;
      }
    }

    setSelectedWorkers([...picked]);
    setResult(null);
  }, [workerAnalysis, allDepts, selectedDepts, roles]);

  const generate = () => {
    if (selectedDepts.length === 0 || selectedWorkers.length === 0) return;
    const res = autoAssign(roles, allDepts.filter((d) => selectedDepts.includes(d.id)), units, selectedWorkers, state.departments);
    setResult(res);
    setHistory([]);
    setSelectedSwapWorker(null);
    setWorkerTimeOverrides({});
    // Initialize name overrides with current labels
    const overrides = {};
    allDepts.filter((d) => selectedDepts.includes(d.id)).forEach((d) => {
      overrides[d.id] = getDeptLabel(d);
    });
    setDeptNameOverrides(overrides);
    setEditingDeptName(null);
  };

  // ─── Drag & drop swap ───
  const handleDragStart = useCallback((workerId) => setDragWorker(workerId), []);

  const handleDrop = useCallback((toDeptId, toRoleId) => {
    if (!dragWorker || !result) return;
    setHistory((h) => [...h, JSON.parse(JSON.stringify(result))]);

    const newAssign = JSON.parse(JSON.stringify(result.assignments));

    // Remove worker from current position
    for (const dId of Object.keys(newAssign)) {
      for (const rId of Object.keys(newAssign[dId])) {
        newAssign[dId][rId] = newAssign[dId][rId].filter((id) => id !== dragWorker);
      }
    }

    // Add to new position
    if (!newAssign[toDeptId]) newAssign[toDeptId] = {};
    if (!newAssign[toDeptId][toRoleId]) newAssign[toDeptId][toRoleId] = [];
    newAssign[toDeptId][toRoleId].push(dragWorker);

    // Recalculate gaps
    const recalcGaps = {};
    for (const dept of allDepts) {
      if (!selectedDepts.includes(dept.id)) continue;
      const reqs = dept.requirements || {};
      for (const role of roles) {
        const needed = reqs[role.id] || 0;
        if (needed === 0) continue;
        const assigned = (newAssign[dept.id] && newAssign[dept.id][role.id]) ? newAssign[dept.id][role.id].length : 0;
        const missing = needed - assigned;
        if (missing > 0) {
          if (!recalcGaps[dept.id]) recalcGaps[dept.id] = {};
          recalcGaps[dept.id][role.id] = missing;
        }
      }
    }

    // Recalculate unassigned
    const allAssigned = new Set();
    for (const dId of Object.keys(newAssign)) {
      for (const rId of Object.keys(newAssign[dId])) {
        for (const wid of newAssign[dId][rId]) allAssigned.add(wid);
      }
    }
    const unassigned = selectedWorkers.filter((id) => !allAssigned.has(id));

    setResult({ assignments: newAssign, gaps: recalcGaps, unassigned });
    setDragWorker(null);
  }, [dragWorker, result, allDepts, roles, selectedDepts, selectedWorkers]);

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setResult(prev);
    setSelectedSwapWorker(null);
  };

  // ─── Safe swap detection ───
  // Find where a worker is currently assigned in the result
  const findWorkerPosition = useCallback((workerId, assignments) => {
    for (const dId of Object.keys(assignments)) {
      for (const rId of Object.keys(assignments[dId])) {
        if ((assignments[dId][rId] || []).includes(workerId)) {
          return { deptId: dId, roleId: rId };
        }
      }
    }
    return null;
  }, []);

  // Check if a worker CAN work a specific dept+role (has the assignment & role capability)
  const canWorkerDoSlot = useCallback((workerId, deptId, roleId) => {
    const worker = units.find((w) => w.id === workerId);
    if (!worker) return false;
    const assigns = worker.assignments || [];
    // Direct assignment
    const direct = assigns.find((a) => a.deptId === deptId);
    if (direct && (direct.roleIds || []).includes(roleId)) return true;
    // Parent assignment
    const dept = state.departments.find((d) => d.id === deptId);
    if (dept && dept.parentId) {
      const parentAssign = assigns.find((a) => a.deptId === dept.parentId);
      if (parentAssign && (parentAssign.roleIds || []).includes(roleId)) return true;
    }
    return false;
  }, [units, state.departments]);

  // Compute which workers are safe to swap with the selected worker
  // A swap is safe if: after swapping positions, both workers can do their new role
  // (no new gaps are created)
  const safeSwapWorkerIds = useMemo(() => {
    if (!selectedSwapWorker || !result) return new Set();
    const posA = findWorkerPosition(selectedSwapWorker, result.assignments);
    if (!posA) return new Set(); // selected worker is unassigned

    const safe = new Set();
    const allAssignedWorkers = new Set();
    for (const dId of Object.keys(result.assignments)) {
      for (const rId of Object.keys(result.assignments[dId])) {
        for (const wid of (result.assignments[dId][rId] || [])) {
          if (wid !== selectedSwapWorker) allAssignedWorkers.add(wid);
        }
      }
    }

    for (const otherWid of allAssignedWorkers) {
      const posB = findWorkerPosition(otherWid, result.assignments);
      if (!posB) continue;
      // Can A do B's job? Can B do A's job?
      const aCanDoB = canWorkerDoSlot(selectedSwapWorker, posB.deptId, posB.roleId);
      const bCanDoA = canWorkerDoSlot(otherWid, posA.deptId, posA.roleId);
      if (aCanDoB && bCanDoA) {
        safe.add(otherWid);
      }
    }

    return safe;
  }, [selectedSwapWorker, result, findWorkerPosition, canWorkerDoSlot]);

  // Perform the swap
  const performSwap = useCallback((otherWid) => {
    if (!selectedSwapWorker || !result) return;
    const posA = findWorkerPosition(selectedSwapWorker, result.assignments);
    const posB = findWorkerPosition(otherWid, result.assignments);
    if (!posA || !posB) return;

    setHistory((h) => [...h, JSON.parse(JSON.stringify(result))]);

    const newAssign = JSON.parse(JSON.stringify(result.assignments));

    // Remove both from their positions
    newAssign[posA.deptId][posA.roleId] = newAssign[posA.deptId][posA.roleId].filter((id) => id !== selectedSwapWorker);
    newAssign[posB.deptId][posB.roleId] = newAssign[posB.deptId][posB.roleId].filter((id) => id !== otherWid);

    // Place them in swapped positions
    newAssign[posA.deptId][posA.roleId].push(otherWid);
    newAssign[posB.deptId][posB.roleId].push(selectedSwapWorker);

    setResult({ ...result, assignments: newAssign });
    setSelectedSwapWorker(null);
  }, [selectedSwapWorker, result, findWorkerPosition]);

  // Check if a shift already exists for this date+type
  const existingShiftForSlot = useMemo(() => {
    return state.shifts.find((s) => s.date === date && s.name === shiftName);
  }, [state.shifts, date, shiftName]);

  const save = () => {
    if (!result) return;
    // If a shift already exists for this date+type, update it instead of creating new
    if (existingShiftForSlot) {
      dispatch({ type: 'UPDATE_SHIFT', payload: { id: existingShiftForSlot.id, assignments: result.assignments, gaps: result.gaps, deptNames: deptNameOverrides, workerTimes: workerTimeOverrides } });
    } else {
      dispatch({ type: 'ADD_SHIFT', payload: { date, name: shiftName, assignments: result.assignments, gaps: result.gaps, deptNames: deptNameOverrides, workerTimes: workerTimeOverrides } });
    }
    // Back to the schedule, which confirms the save and jumps to that week.
    navigate('/', { state: { toast: existingShiftForSlot ? 'updated' : 'saved', date } });
  };

  const getWorkerName = (id) => nameOf(state.workers, id);
  const totalGaps = result ? countGaps(result.gaps) : 0;
  const ready = allDepts.length > 0 && state.workers.length > 0;

  const fmtDate = (iso) => new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${iso}T00:00:00`));
  const hours = (state.shiftTimes || {})[shiftName] || {};
  const meta = shiftMeta(shiftName);
  const ShiftIcon = meta.icon;

  // Edit mode (?edit=1 from the schedule): open the existing shift straight at
  // Review, with its departments, workers, custom names and times loaded.
  const preloaded = useRef(false);
  useEffect(() => {
    if (preloaded.current) return;
    preloaded.current = true;
    if (searchParams.get('edit') !== '1' || !existingShiftForSlot) return;
    const sh = existingShiftForSlot;
    const leafIds = new Set(allDepts.map((d) => d.id));
    const deptIds = [...new Set([...Object.keys(sh.assignments || {}), ...Object.keys(sh.gaps || {})])].filter((id) => leafIds.has(id));
    const workerIds = new Set();
    for (const dId of Object.keys(sh.assignments || {})) {
      for (const rId of Object.keys(sh.assignments[dId] || {})) {
        for (const wid of sh.assignments[dId][rId] || []) {
          if (units.some((w) => w.id === wid)) workerIds.add(wid);
        }
      }
    }
    setSelectedDepts(deptIds);
    setSelectedWorkers([...workerIds]);
    setResult({ assignments: JSON.parse(JSON.stringify(sh.assignments || {})), gaps: JSON.parse(JSON.stringify(sh.gaps || {})), unassigned: [] });
    setDeptNameOverrides(sh.deptNames || {});
    setWorkerTimeOverrides(sh.workerTimes || {});
    setStep(4);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Arriving at the Workers step with nobody chosen yet: pre-pick the smallest
  // team that covers every position, so the common case is just "Next".
  useEffect(() => {
    if (step === 3 && selectedWorkers.length === 0 && workerAnalysis.totalSlots > 0) {
      smartSelect();
      setAutoPicked(true);
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const STEPS = [
    { n: 1, label: t('stepWhen') },
    { n: 2, label: t('step1Depts') },
    { n: 3, label: t('step2Workers') },
    { n: 4, label: t('stepReview') },
  ];
  const reachable = (n) => n <= 2 || (n === 3 && selectedDepts.length > 0) || (n === 4 && !!result);
  const canNext = step === 1 ? true
    : step === 2 ? selectedDepts.length > 0
      : step === 3 ? selectedWorkers.length > 0
        : !!result;

  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const goTo = (n) => { setStep(n); scrollTop(); };
  const goNext = () => {
    if (!canNext) return;
    if (step === 3) {
      if (!result) generate();
      goTo(4);
    } else if (step === 4) {
      save();
    } else {
      goTo(step + 1);
    }
  };
  const goBack = () => (step === 1 ? navigate('/') : goTo(step - 1));

  const barInfo = () => {
    if (step === 1) return hours.start && hours.end ? `${shiftLabel(shiftName)} · ${hours.start}–${hours.end}` : shiftLabel(shiftName);
    if (step === 2) return t('deptsSelected', { n: selectedDepts.length });
    if (step === 3) {
      const cov = workerAnalysis.totalSlots > 0 && selectedWorkers.length > 0 ? ` · ${workerAnalysis.coverage}%` : '';
      return `${t('summaryCounts', { depts: selectedDepts.length, workers: selectedWorkers.length })}${cov}`;
    }
    return totalGaps > 0 ? t('openCount', { n: totalGaps }) : t('allFilledShort');
  };

  // Worker groups are picked by count, not one by one: keep the members that
  // are already chosen, then fill up with the next free ones.
  const setGroupCount = (groupId, members, count) => {
    const memberIds = new Set(members.map((m) => m.id));
    const chosen = members.filter((m) => selectedWorkers.includes(m.id));
    const order = [...chosen, ...members.filter((m) => !selectedWorkers.includes(m.id))];
    const n = Math.max(0, Math.min(members.length, count));
    setSelectedWorkers([...selectedWorkers.filter((id) => !memberIds.has(id)), ...order.slice(0, n).map((m) => m.id)]);
    setResult(null);
    setAutoPicked(false);
  };

  const renderDeptButton = (d) => {
    const active = selectedDepts.includes(d.id);
    const feats = getDeptFeatures(d);
    return (
      <button key={d.id} type="button" aria-pressed={active} className={`dept-pick ${active ? 'dept-pick-active' : ''}`} onClick={() => toggleDept(d.id)}>
        <span className="dept-pick-name">
          {d.name}
          {feats.length > 0 && <span className="dept-pick-features">{feats.join(' · ')}</span>}
        </span>
        <span className="dept-pick-info">{getDeptInfo(d)}</span>
      </button>
    );
  };

  return (
    <div className="page wizard">
      <div className="wizard-top">
        <div className={`wizard-context tone-${meta.tone}`}>
          <span className="tone-icon"><ShiftIcon size={18} /></span>
          <div className="wizard-context-text">
            <span className="wizard-kicker">{existingShiftForSlot ? t('editingShift') : t('newShift')}</span>
            <strong>{shiftLabel(shiftName)} · {fmtDate(date)}</strong>
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>
          <X size={16} /> {t('cancel')}
        </button>
      </div>

      <ol className="stepper-nav" aria-label={t('navBuild')}>
        {STEPS.map((s) => (
          <li key={s.n} className={`stepper-nav-item ${step === s.n ? 'is-current' : ''} ${step > s.n ? 'is-done' : ''}`}>
            <button type="button" disabled={!reachable(s.n) || !ready} onClick={() => goTo(s.n)} aria-current={step === s.n ? 'step' : undefined}>
              <span className="stepper-nav-dot">{step > s.n ? <Check size={13} strokeWidth={3} /> : s.n}</span>
              <span className="stepper-nav-label">{s.label}</span>
            </button>
          </li>
        ))}
      </ol>

      {!ready ? (
        <div className="empty-state">
          <p>{t('addDeptsWorkers')}</p>
          <Link to="/team" className="btn btn-primary"><Users size={16} /> {t('goToTeam')}</Link>
        </div>
      ) : (
        <>
          {step === 1 && (
            <section className="wizard-panel" key="s1">
              <h2 className="wizard-title">{t('wizWhenTitle')}</h2>
              <p className="wizard-sub">{t('wizWhenSub')}</p>
              <div className="wizard-field">
                <label className="label" htmlFor="shift-date">{t('date')}</label>
                <input id="shift-date" type="date" value={date} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setResult(null); } }} className="input wizard-date" />
              </div>
              <div className="wizard-field">
                <span className="label">{t('shift')}</span>
                <div className="shift-type-picker shift-type-picker-lg" role="radiogroup" aria-label={t('shift')}>
                  {SHIFT_TYPES.map((s) => {
                    const m = shiftMeta(s);
                    const Icon = m.icon;
                    const st = (state.shiftTimes || {})[s] || {};
                    const exists = state.shifts.some((sh) => sh.date === date && sh.name === s);
                    return (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={shiftName === s}
                        className={`shift-type-option tone-${m.tone} ${shiftName === s ? 'shift-type-option-active' : ''}`}
                        onClick={() => { setShiftName(s); setResult(null); }}
                      >
                        <span className="tone-icon"><Icon size={18} /></span>
                        <span className="shift-type-text">
                          <span className="shift-type-name">{shiftLabel(s)}</span>
                          {st.start && st.end && <span className="shift-type-hours">{st.start}–{st.end}</span>}
                        </span>
                        {exists && <span className="shift-type-saved" title={t('alreadyScheduled')}><CheckCircle2 size={15} /></span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              {existingShiftForSlot && (
                <div className="alert alert-info">
                  <CheckCircle2 size={16} />
                  <span>{t('shiftAlreadyExists', { shift: shiftLabel(shiftName), date: fmtDate(date) })}</span>
                </div>
              )}
            </section>
          )}

          {step === 2 && (
            <section className="wizard-panel" key="s2">
              <div className="wizard-title-row">
                <div>
                  <h2 className="wizard-title">{t('wizDeptsTitle')}</h2>
                  <p className="wizard-sub">{t('wizDeptsSub')}</p>
                </div>
                <button className="btn btn-sm btn-soft" onClick={selectAllDepts}>{t('selectAll')}</button>
              </div>
              <div className="dept-picker">
                {groupedDepts.map((g) => {
                  if (g.type === 'single') return renderDeptButton(g.dept);
                  const allSelected = g.children.every((c) => selectedDepts.includes(c.id));
                  return (
                    <div key={g.parent.id} className="dept-pick-group">
                      <div className="dept-pick-group-header">
                        <span className="dept-pick-group-name"><Building2 size={14} /> {g.parent.name}</span>
                        <button className="btn btn-sm btn-ghost" onClick={() => {
                          const childIds = g.children.map((c) => c.id);
                          if (allSelected) {
                            setSelectedDepts((p) => p.filter((id) => !childIds.includes(id)));
                          } else {
                            setSelectedDepts((p) => [...new Set([...p, ...childIds])]);
                          }
                          setResult(null);
                        }}>{allSelected ? t('deselectAll') : t('selectAll')}</button>
                      </div>
                      <div className="dept-pick-children">
                        {g.children.map(renderDeptButton)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="wizard-panel" key="s3">
              <div className="wizard-title-row">
                <div>
                  <h2 className="wizard-title">{t('wizWorkersTitle')}</h2>
                  <p className="wizard-sub">{t('wizWorkersSub')}</p>
                </div>
                <div className="section-actions">
                  <button className="btn btn-sm btn-smart" onClick={() => { smartSelect(); setAutoPicked(true); }}>
                    <Sparkles size={14} /> {t('smart')}
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => { selectAllWorkers(); setAutoPicked(false); }}>{t('all')}</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => { clearWorkers(); setAutoPicked(false); }}>{t('clear')}</button>
                </div>
              </div>

              {hiddenBusy.count > 0 && (
                <div className="alert alert-info">
                  <Users size={16} />
                  <span>{t('hiddenOverlap', { n: hiddenBusy.count, shifts: hiddenBusy.shifts.map(shiftLabel).join(', ') })}</span>
                </div>
              )}

              {relevantWorkers.length === 0 ? (
                <div className="empty-state"><p>{t('noWorkersAvailable')} {shiftLabel(shiftName)} {t('on')} {fmtDate(date)}</p></div>
              ) : (
                <>
                  {autoPicked && selectedWorkers.length > 0 && (
                    workerAnalysis.coverage === 100 ? (
                      <div className="alert alert-info">
                        <Sparkles size={16} />
                        <span>{t('autoPickedHint')}</span>
                      </div>
                    ) : (
                      <div className="alert alert-warning">
                        <Sparkles size={16} />
                        <span>{t('autoPickedPartial', { n: workerAnalysis.totalSlots - workerAnalysis.filledCount })}</span>
                      </div>
                    )
                  )}

                  {workerAnalysis.totalSlots > 0 && (
                    <div className="coverage-section">
                      <div className="coverage-bar-wrap">
                        <div className="coverage-bar">
                          <div
                            className={`coverage-fill ${workerAnalysis.coverage === 100 ? 'coverage-full' : workerAnalysis.coverage >= 70 ? '' : 'coverage-low'}`}
                            style={{ width: `${Math.max(workerAnalysis.coverage, 2)}%` }}
                          />
                        </div>
                        <span className={`coverage-pct ${workerAnalysis.coverage === 100 ? 'coverage-pct-full' : ''}`}>
                          {selectedWorkers.length > 0 ? `${workerAnalysis.coverage}%` : '—'}
                        </span>
                      </div>
                      <div className="coverage-details">
                        <span className="coverage-label">
                          {t('positionsCovered', { filled: workerAnalysis.filledCount, total: workerAnalysis.totalSlots })}
                          {workerAnalysis.coverage === 100 && <strong className="coverage-ready"> · {t('readyToAssign')}</strong>}
                        </span>
                        {workerAnalysis.gaps.length > 0 && (
                          <div className="coverage-gaps">
                            {workerAnalysis.gaps.map((g, i) => (
                              <span key={i} className="coverage-gap-tag">{g.count} {g.role}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="worker-pick-grid">
                    {workerAnalysis.workers.map((w) => {
                      if (w.groupId) {
                        // One chip per group, shown where its first member would be.
                        if (workerAnalysis.workers.find((x) => x.groupId === w.groupId) !== w) return null;
                        const members = workerAnalysis.workers.filter((x) => x.groupId === w.groupId).sort((a, b) => a.unit - b.unit);
                        const chosen = members.filter((m) => selectedWorkers.includes(m.id)).length;
                        const group = state.workers.find((g) => g.id === w.groupId);
                        const groupName = group ? group.name : w.name;
                        return (
                          <div key={w.groupId} className={`group-chip ${chosen > 0 ? 'group-chip-on' : ''}`}>
                            <Avatar name={groupName} size="xs" />
                            <span className="wc-name" dir="auto">{groupName}</span>
                            <span className="group-stepper">
                              <button type="button" onClick={() => setGroupCount(w.groupId, members, chosen - 1)} disabled={chosen === 0} aria-label={`${groupName} −1`}>−</button>
                              <span className="group-count" aria-live="polite"><strong>{chosen}</strong>/{members.length}</span>
                              <button type="button" onClick={() => setGroupCount(w.groupId, members, chosen + 1)} disabled={chosen >= members.length} aria-label={`${groupName} +1`}>+</button>
                            </span>
                          </div>
                        );
                      }
                      const isSelected = selectedWorkers.includes(w.id);
                      const isBestNext = !isSelected && workerAnalysis.bestNextId === w.id;
                      return (
                        <button
                          key={w.id}
                          className={`worker-chip ${isSelected ? 'worker-chip-on' : ''} ${isBestNext ? 'worker-chip-suggested' : ''} ${w.isCritical && !isSelected ? 'worker-chip-critical' : ''}`}
                          onClick={() => { toggleWorker(w.id); setAutoPicked(false); }}
                          aria-pressed={isSelected}
                          title={w.isCritical && w.criticalFor.length > 0 ? `${t('onlyOptionFor')}: ${w.criticalFor.join(', ')}` : undefined}
                        >
                          <Avatar name={w.name} size="xs" />
                          <span className="wc-name" dir="auto">{w.name}</span>
                          {isSelected && <Check size={14} strokeWidth={3} className="wc-check" />}
                          {selectedWorkers.length > 0 && w.impact > 0 && !isSelected && (
                            <span className="wc-impact wc-impact-add">+{w.impact}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="hint wizard-legend">
                    <span className="legend-dot legend-suggested" /> {t('legendSuggested')}
                    <span className="legend-dot legend-critical" /> {t('legendCritical')}
                  </p>
                </>
              )}
            </section>
          )}

          {step === 4 && result && (
            <section className="wizard-panel wizard-panel-wide" key="s4">
              <div className="wizard-title-row">
                <div>
                  <h2 className="wizard-title">{t('wizReviewTitle')}</h2>
                  <p className="wizard-sub">{t('wizReviewSub')}</p>
                </div>
                <div className="section-actions">
                  {history.length > 0 && (
                    <button className="btn btn-sm btn-ghost" onClick={undo}><Undo2 size={14} /> {t('undo')}</button>
                  )}
                  <button className="btn btn-sm btn-ghost" onClick={generate}><RotateCcw size={14} /> {t('regenerate')}</button>
                  <button className="btn btn-sm btn-whatsapp" onClick={() => {
                    setShareShift({ date, name: shiftName, assignments: result.assignments, gaps: result.gaps, deptNames: deptNameOverrides, workerTimes: workerTimeOverrides });
                  }}><Image size={14} /> {t('shareAsImage')}</button>
                </div>
              </div>

              {selectedSwapWorker && (
                <div className="alert alert-info">
                  <span>{t('clickGreenToSwap')}</span>
                  <button className="btn-link" onClick={() => setSelectedSwapWorker(null)}>{t('cancelSwap')}</button>
                </div>
              )}

              {totalGaps > 0 && (
                <div className="alert alert-warning">
                  <AlertTriangle size={16} />
                  <span>{totalGaps} {totalGaps !== 1 ? t('positionsOpenAlertPlural') : t('positionsOpenAlert')}</span>
                </div>
              )}

              <div className="dept-grid">
                {allDepts.filter((d) => selectedDepts.includes(d.id)).map((dept) => {
                  const da = result.assignments[dept.id] || {};
                  const dg = result.gaps[dept.id] || {};
                  const hasDeptGap = Object.keys(dg).length > 0;
                  return (
                    <div key={dept.id} className={`dept-card ${hasDeptGap ? 'dept-card-gap' : 'dept-card-ok'}`}>
                      <div className="dept-card-header">
                        {editingDeptName === dept.id ? (
                          <form className="dept-name-edit" onSubmit={(e) => { e.preventDefault(); setEditingDeptName(null); }}>
                            <input
                              className="input dept-name-input"
                              value={deptNameOverrides[dept.id] || ''}
                              onChange={(e) => setDeptNameOverrides((prev) => ({ ...prev, [dept.id]: e.target.value }))}
                              autoFocus
                              onBlur={() => setEditingDeptName(null)}
                              onKeyDown={(e) => e.key === 'Escape' && setEditingDeptName(null)}
                            />
                          </form>
                        ) : (
                          <span className="dept-card-name dept-card-name-editable" onClick={() => setEditingDeptName(dept.id)}>
                            {deptNameOverrides[dept.id] || getDeptLabel(dept)}
                            {getDeptFeatures(dept).length > 0 && (
                              <span className="dept-card-features">{getDeptFeatures(dept).join(' · ')}</span>
                            )}
                            <Pencil size={12} className="dept-name-edit-icon" />
                          </span>
                        )}
                        {hasDeptGap
                          ? <span className="status status-warning"><AlertTriangle size={12} /></span>
                          : <span className="status status-success"><CheckCircle2 size={12} /></span>}
                      </div>
                      {roles.map((role) => {
                        const needed = (dept.requirements || {})[role.id] || 0;
                        if (needed === 0) return null;
                        const assigned = da[role.id] || [];
                        const gap = dg[role.id] || 0;
                        return (
                          <div
                            key={role.id}
                            className="role-assign-section drop-zone"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => handleDrop(dept.id, role.id)}
                          >
                            <div className="role-assign-header">
                              <span className="role-assign-name">{role.name}</span>
                              <span className={`role-assign-count ${gap > 0 ? 'count-gap' : 'count-ok'}`}>{assigned.length}/{needed}</span>
                            </div>
                            <div className="dept-workers">
                              {sortByName(state.workers, assigned).map((wid) => {
                                const isSelected = selectedSwapWorker === wid;
                                const isSafeSwap = selectedSwapWorker && selectedSwapWorker !== wid && safeSwapWorkerIds.has(wid);
                                const key = `${dept.id}::${wid}`;
                                const globalTimes = (state.shiftTimes || {})[shiftName] || {};
                                const ovr = workerTimeOverrides[key];
                                const start = ovr ? ovr.start : (globalTimes.start || '');
                                const end = ovr ? ovr.end : (globalTimes.end || '');
                                return (
                                  <div
                                    key={wid}
                                    className={`dept-worker draggable-worker ${isSelected ? 'worker-selected' : ''} ${isSafeSwap ? 'worker-safe-swap' : ''} ${selectedSwapWorker && !isSelected && !isSafeSwap ? 'worker-dimmed' : ''}`}
                                    draggable
                                    onDragStart={() => handleDragStart(wid)}
                                    onClick={() => {
                                      if (isSafeSwap) performSwap(wid);
                                      else if (isSelected) setSelectedSwapWorker(null);
                                      else setSelectedSwapWorker(wid);
                                    }}
                                  >
                                    <Avatar name={getWorkerName(wid)} size="xs" />
                                    <span className="dept-worker-name" dir="auto">{getWorkerName(wid)}</span>
                                    {isSelected && <span className="swap-badge">{t('clickGreen')}</span>}
                                    {isSafeSwap && <span className="swap-badge swap-badge-safe">{t('safeSwap')}</span>}
                                    {(start || end) && (
                                      <span className="worker-time" onClick={(e) => e.stopPropagation()}>
                                        <input type="time" className="time-mini" aria-label={t('startTime')} value={start} onChange={(e) => setWorkerTimeOverrides((p) => ({ ...p, [key]: { start: e.target.value, end } }))} />
                                        <span>–</span>
                                        <input type="time" className="time-mini" aria-label={t('endTime')} value={end} onChange={(e) => setWorkerTimeOverrides((p) => ({ ...p, [key]: { start, end: e.target.value } }))} />
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                              {gap > 0 && <div className="dept-gap-msg"><AlertTriangle size={14} /> {t('needMore')} {gap} {t('more')}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {result.unassigned.length > 0 && (
                <div className="unassigned-tray">
                  <h4>{t('unassignedWorkers')}</h4>
                  <div className="chip-group">
                    {result.unassigned.map((wid) => (
                      <span key={wid} className="chip chip-static chip-muted chip-draggable" draggable onDragStart={() => handleDragStart(wid)}>
                        <Avatar name={getWorkerName(wid)} size="xs" />
                        <span dir="auto">{getWorkerName(wid)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          <div className="action-bar wizard-bar">
            <button type="button" className="btn btn-lg btn-ghost wizard-back" onClick={goBack}>
              {step === 1 ? <><X size={18} /> <span>{t('cancel')}</span></> : <><ArrowLeft size={18} className="flip-rtl" /> <span>{t('back')}</span></>}
            </button>
            <div className="wizard-bar-info">
              <span className="wizard-bar-step">{t('stepOf', { n: step, total: STEPS.length })}</span>
              <span className="wizard-bar-detail">{barInfo()}</span>
            </div>
            <button type="button" className="btn btn-primary btn-lg" onClick={goNext} disabled={!canNext}>
              {step === 3
                ? <><Zap size={18} /> {t('autoAssignShift')}</>
                : step === 4
                  ? <><Save size={18} /> {existingShiftForSlot ? t('updateShift') : t('saveShift')}</>
                  : <>{t('next')} <ArrowRight size={18} className="flip-rtl" /></>}
            </button>
          </div>
        </>
      )}

      {shareShift && (
        <ShiftImage
          shift={shareShift}
          roles={roles}
          departments={state.departments}
          workers={state.workers}
          getDeptLabel={getDeptLabel}
          shiftTimes={state.shiftTimes}
          onClose={() => setShareShift(null)}
        />
      )}
    </div>
  );
}
