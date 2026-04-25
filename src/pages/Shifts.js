import { useState, useMemo, useCallback } from 'react';
import { useApp, autoAssign, isWorkerAvailable } from '../context/AppContext';
import { useLang } from '../i18n/LangContext';
import { Zap, Save, Trash2, AlertTriangle, UserCheck, ChevronDown, ChevronUp, Undo2, Pencil, Image, Sparkles } from 'lucide-react';
import ShiftImage from '../components/ShiftImage';

const SHIFT_TYPES = ['Morning', 'Afternoon', 'Night', 'Friday'];

export default function Shifts() {
  const { state, dispatch } = useApp();
  const { t } = useLang();
  const shiftLabel = (s) => s === 'Morning' ? t('morning') : s === 'Afternoon' ? t('afternoon') : s === 'Night' ? t('night') : s === 'Friday' ? t('friday') : s;
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shiftName, setShiftName] = useState('Morning');
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [deptNameOverrides, setDeptNameOverrides] = useState({});  // { deptId: "custom name" }
  const [editingDeptName, setEditingDeptName] = useState(null);
  const [expandedShift, setExpandedShift] = useState(null);
  const [dragWorker, setDragWorker] = useState(null);
  const [shareShift, setShareShift] = useState(null);
  const [selectedSwapWorker, setSelectedSwapWorker] = useState(null);
  const [workerTimeOverrides, setWorkerTimeOverrides] = useState({}); // { "deptId::workerId": { start, end } }

  const roles = useMemo(() => [...state.roles].sort((a, b) => a.priority - b.priority), [state.roles]);
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
    const workerCount = state.workers.filter((w) => (w.assignments || []).some((a) => a.deptId === dept.id)).length;
    return `${total} needed · ${workerCount} workers`;
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

  // Workers already used in other saved shifts on the same date
  const busyWorkerIds = useMemo(() => {
    const busy = new Set();
    const sameDateShifts = state.shifts.filter((s) => s.date === date);
    for (const shift of sameDateShifts) {
      const assign = shift.assignments || {};
      for (const dId of Object.keys(assign)) {
        for (const rId of Object.keys(assign[dId])) {
          for (const wid of (assign[dId][rId] || [])) {
            busy.add(wid);
          }
        }
      }
    }
    return busy;
  }, [state.shifts, date]);

  // Workers available for this date+shift and relevant to selected depts
  // Excludes workers already assigned to another shift on the same date
  const relevantWorkers = useMemo(() => {
    const parentIds = new Set();
    for (const dId of selectedDepts) {
      const dept = state.departments.find((d) => d.id === dId);
      if (dept && dept.parentId) parentIds.add(dept.parentId);
    }
    const relevantDeptIds = new Set([...selectedDepts, ...parentIds]);

    return state.workers.filter((w) => {
      if (w.onVacation) return false;
      if (busyWorkerIds.has(w.id)) return false;
      if (!isWorkerAvailable(w, date, shiftName)) return false;
      if (selectedDepts.length === 0) return true;
      return (w.assignments || []).some((a) => relevantDeptIds.has(a.deptId));
    });
  }, [state.workers, state.departments, selectedDepts, date, shiftName, busyWorkerIds]);

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
    const res = autoAssign(roles, allDepts.filter((d) => selectedDepts.includes(d.id)), state.workers, selectedWorkers, state.departments);
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
    const worker = state.workers.find((w) => w.id === workerId);
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
  }, [state.workers, state.departments]);

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
    setResult(null);
    setSelectedWorkers([]);
    setHistory([]);
    setDeptNameOverrides({});
    setWorkerTimeOverrides({});
  };

  const deleteShift = (id) => dispatch({ type: 'DELETE_SHIFT', payload: id });
  const getWorkerName = (id) => state.workers.find((w) => w.id === id)?.name || '?';
  const getDeptName = (id) => state.departments.find((d) => d.id === id)?.name || '?';

  const formatShiftForWhatsApp = (shift) => {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const d = new Date(shift.date + 'T00:00:00');
    const dayName = dayNames[d.getDay()];
    const dateStr = `${shift.date.split('-').reverse().join('/')}`;

    let msg = '';
    msg += `\u2728 *SHIFT SCHEDULE* \u2728\n`;
    msg += `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`;
    msg += `\uD83D\uDCC5 *${dayName}, ${dateStr}*\n`;
    msg += `\u23F0 *${shift.name} Shift*\n`;
    msg += `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n`;

    const sg = shift.gaps || {};
    const deptIds = Object.keys(shift.assignments || {});

    for (const deptId of deptIds) {
      const da = shift.assignments[deptId] || {};
      const deptGaps = sg[deptId] || {};
      const hasWorkers = Object.values(da).some((arr) => Array.isArray(arr) && arr.length > 0);
      const hasGaps = Object.keys(deptGaps).length > 0;
      if (!hasWorkers && !hasGaps) continue;

      const deptDisplayName = (shift.deptNames && shift.deptNames[deptId]) || getDeptLabel(state.departments.find((dd) => dd.id === deptId) || { name: getDeptName(deptId) });
      const deptObj = state.departments.find((dd) => dd.id === deptId);
      const features = (deptObj && deptObj.features) || [];

      msg += `\uD83C\uDFED *${deptDisplayName}*`;
      if (features.length > 0) msg += ` _${features.join(' \u00B7 ')}_`;
      msg += `\n`;

      for (const role of roles) {
        const assigned = da[role.id] || [];
        const gap = deptGaps[role.id] || 0;
        if (assigned.length === 0 && gap === 0) continue;

        const names = assigned.map((wid) => getWorkerName(wid));
        msg += `   \u25B8 *${role.name}:* ${names.join(', ')}`;
        if (gap > 0) msg += ` \u26A0\uFE0F _+${gap} needed_`;
        msg += `\n`;
      }
      msg += `\n`;
    }

    const totalGapsCount = Object.values(sg).reduce(
      (sum, rg) => sum + (typeof rg === 'object' ? Object.values(rg).reduce((s, n) => s + n, 0) : 0), 0
    );

    if (totalGapsCount > 0) {
      msg += `\u26A0\uFE0F *${totalGapsCount} position${totalGapsCount !== 1 ? 's' : ''} still open*\n`;
    } else {
      msg += `\u2705 *All positions filled!*\n`;
    }

    msg += `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`;
    msg += `_Sent from MyShift_`;

    return msg;
  };


  const copyShiftText = (shift) => {
    const msg = formatShiftForWhatsApp(shift);
    navigator.clipboard.writeText(msg).then(() => {
      alert(t('copiedToClipboard'));
    });
  };

  const existingShifts = [...state.shifts].sort((a, b) => new Date(b.date) - new Date(a.date) || b.createdAt - a.createdAt);
  const totalGaps = result ? Object.values(result.gaps).reduce((sum, rg) => sum + (typeof rg === 'object' ? Object.values(rg).reduce((s, n) => s + n, 0) : 0), 0) : 0;
  const ready = allDepts.length > 0 && state.workers.length > 0;

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('shiftsTitle')}</h1>
        <p className="subtitle">{t('shiftsSubtitle')}</p>
      </div>

      {!ready ? (
        <div className="empty-state"><p>{t('addDeptsWorkers')}</p></div>
      ) : (
        <>
          <div className="shift-controls">
            <div className="control-row">
              <label className="label">{t('date')}</label>
              <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setResult(null); }} className="input" />
            </div>
            <div className="control-row">
              <label className="label">{t('shift')}</label>
              <select value={shiftName} onChange={(e) => { setShiftName(e.target.value); setResult(null); }} className="input">
                {SHIFT_TYPES.map((s) => <option key={s} value={s}>{shiftLabel(s)}</option>)}
              </select>
            </div>
          </div>

          <div className="section">
            <div className="section-header">
              <h3>{t('step1Depts')}</h3>
              <button className="btn btn-sm" onClick={selectAllDepts}>{t('all')}</button>
            </div>
            <div className="dept-picker">
              {groupedDepts.map((g) => {
                if (g.type === 'single') {
                  const d = g.dept;
                  const active = selectedDepts.includes(d.id);
                  const feats = getDeptFeatures(d);
                  return (
                    <button key={d.id} className={`dept-pick ${active ? 'dept-pick-active' : ''}`} onClick={() => toggleDept(d.id)}>
                      <span className="dept-pick-name">
                        {d.name}
                        {feats.length > 0 && <span className="dept-pick-features">{feats.join(' · ')}</span>}
                      </span>
                      <span className="dept-pick-info">{getDeptInfo(d)}</span>
                    </button>
                  );
                }
                // group
                const allSelected = g.children.every((c) => selectedDepts.includes(c.id));

                return (
                  <div key={g.parent.id} className="dept-pick-group">
                    <div className="dept-pick-group-header">
                      <span className="dept-pick-group-name">{g.parent.name}</span>
                      <button className="btn btn-sm" onClick={() => {
                        const childIds = g.children.map((c) => c.id);
                        if (allSelected) {
                          setSelectedDepts((p) => p.filter((id) => !childIds.includes(id)));
                        } else {
                          setSelectedDepts((p) => [...new Set([...p, ...childIds])]);
                        }
                        setResult(null);
                      }}>{allSelected ? 'Deselect all' : 'Select all'}</button>
                    </div>
                    <div className="dept-pick-children">
                      {g.children.map((c) => {
                        const active = selectedDepts.includes(c.id);
                        const cFeats = getDeptFeatures(c);
                        return (
                          <button key={c.id} className={`dept-pick ${active ? 'dept-pick-active' : ''}`} onClick={() => toggleDept(c.id)}>
                            <span className="dept-pick-name">
                              {c.name}
                              {cFeats.length > 0 && <span className="dept-pick-features">{cFeats.join(' · ')}</span>}
                            </span>
                            <span className="dept-pick-info">{getDeptInfo(c)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="section">
            <div className="section-header">
              <h3>{t('step2Workers')}</h3>
              <div className="section-actions">
                <button className="btn btn-sm btn-smart" onClick={smartSelect} disabled={selectedDepts.length === 0}>
                  <Sparkles size={14} /> {t('smart')}
                </button>
                <button className="btn btn-sm" onClick={selectAllWorkers}>{t('all')}</button>
                <button className="btn btn-sm" onClick={clearWorkers}>{t('clear')}</button>
              </div>
            </div>
            {selectedDepts.length === 0 ? (
              <p className="hint">{t('selectDeptsFirst')}</p>
            ) : relevantWorkers.length === 0 ? (
              <p className="hint">{t('noWorkersAvailable')} {shiftLabel(shiftName)} {t('on')} {date}</p>
            ) : (
              <>
                {/* Coverage bar — always visible once depts selected */}
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
                        {workerAnalysis.filledCount}/{workerAnalysis.totalSlots} positions
                        {workerAnalysis.coverage === 100 && ' — Ready!'}
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

                {/* Worker chips — always all clickable */}
                <div className="worker-pick-grid">
                  {workerAnalysis.workers.map((w) => {
                    const isSelected = selectedWorkers.includes(w.id);
                    const isBestNext = !isSelected && workerAnalysis.bestNextId === w.id;
                    return (
                      <button
                        key={w.id}
                        className={`worker-chip ${isSelected ? 'worker-chip-on' : ''} ${isBestNext ? 'worker-chip-suggested' : ''} ${w.isCritical && !isSelected ? 'worker-chip-critical' : ''}`}
                        onClick={() => toggleWorker(w.id)}
                      >
                        <span className="wc-name">{w.name}</span>
                        {selectedWorkers.length > 0 && w.impact > 0 && !isSelected && (
                          <span className="wc-impact wc-impact-add">+{w.impact}</span>
                        )}
                        {isSelected && w.impact > 0 && (
                          <span className="wc-impact wc-impact-remove">-{w.impact}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {existingShiftForSlot && !result && (
            <div className="alert alert-warning" style={{ marginBottom: '0.5rem' }}>
              <AlertTriangle size={16} />
              <span>{t('shiftAlreadyExists', { shift: shiftLabel(shiftName), date })}</span>
            </div>
          )}

          <button className="btn btn-primary btn-lg" onClick={generate} disabled={selectedDepts.length === 0 || selectedWorkers.length === 0}>
            <Zap size={18} /> {result ? t('regenerate') : existingShiftForSlot ? t('reassignShift') : t('autoAssignShift')}
          </button>

          {result && (
            <div className="shift-result">
              <div className="result-toolbar">
                {history.length > 0 && (
                  <button className="btn btn-sm" onClick={undo}><Undo2 size={14} /> {t('undo')}</button>
                )}
                {selectedSwapWorker ? (
                  <span className="hint hint-swap">{t('clickGreenToSwap')} · <button className="btn-link" onClick={() => setSelectedSwapWorker(null)}>{t('cancelSwap')}</button></span>
                ) : (
                  <span className="hint">{t('clickWorkerForSwap')}</span>
                )}
              </div>

              {totalGaps > 0 && (
                <div className="alert alert-warning">
                  <AlertTriangle size={18} />
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
                              {assigned.map((wid) => {
                                const isSelected = selectedSwapWorker === wid;
                                const isSafeSwap = selectedSwapWorker && selectedSwapWorker !== wid && safeSwapWorkerIds.has(wid);
                                return (
                                  <div
                                    key={wid}
                                    className={`dept-worker draggable-worker ${isSelected ? 'worker-selected' : ''} ${isSafeSwap ? 'worker-safe-swap' : ''} ${selectedSwapWorker && !isSelected && !isSafeSwap ? 'worker-dimmed' : ''}`}
                                    draggable
                                    onDragStart={() => handleDragStart(wid)}
                                    onClick={() => {
                                      if (isSafeSwap) {
                                        performSwap(wid);
                                      } else if (isSelected) {
                                        setSelectedSwapWorker(null);
                                      } else {
                                        setSelectedSwapWorker(wid);
                                      }
                                    }}
                                  >
                                    <UserCheck size={14} />
                                    <span>{getWorkerName(wid)}</span>
                                    {(() => {
                                      const key = `${dept.id}::${wid}`;
                                      const globalTimes = (state.shiftTimes || {})[shiftName] || {};
                                      const ovr = workerTimeOverrides[key];
                                      const start = ovr ? ovr.start : (globalTimes.start || '');
                                      const end = ovr ? ovr.end : (globalTimes.end || '');
                                      return (start || end) ? (
                                        <span className="worker-time">
                                          <input type="time" className="time-mini" value={start} onChange={(e) => setWorkerTimeOverrides((p) => ({ ...p, [key]: { start: e.target.value, end } }))} />
                                          <span>-</span>
                                          <input type="time" className="time-mini" value={end} onChange={(e) => setWorkerTimeOverrides((p) => ({ ...p, [key]: { start, end: e.target.value } }))} />
                                        </span>
                                      ) : null;
                                    })()}
                                    {isSelected && <span className="swap-badge">{t('clickGreen')}</span>}
                                    {isSafeSwap && <span className="swap-badge swap-badge-safe">{t('safeSwap')}</span>}
                                    <span className="drag-hint">⠿</span>
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
                <div className="section">
                  <h4>{t('unassignedWorkers')}</h4>
                  <div className="chip-group">
                    {result.unassigned.map((wid) => (
                      <span
                        key={wid}
                        className="chip chip-static chip-muted chip-draggable"
                        draggable
                        onDragStart={() => handleDragStart(wid)}
                      >
                        {getWorkerName(wid)}
                        <span className="drag-hint">⠿</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="save-actions">
                <button className="btn btn-primary" onClick={save}>
                  <Save size={18} /> {existingShiftForSlot ? t('updateShift') : t('saveShift')}
                </button>
                <button className="btn btn-whatsapp" onClick={() => {
                  setShareShift({ date, name: shiftName, assignments: result.assignments, gaps: result.gaps, deptNames: deptNameOverrides });
                }}><Image size={18} /> {t('shareAsImage')}</button>
              </div>
            </div>
          )}
        </>
      )}

      {existingShifts.length > 0 && (
        <div className="section" style={{ marginTop: '2rem' }}>
          <h2>{t('savedShifts')}</h2>
          <div className="card-list">
            {existingShifts.map((shift) => {
              const isExp = expandedShift === shift.id;
              const sg = shift.gaps || {};
              const hsg = Object.keys(sg).length > 0;
              return (
                <div key={shift.id} className="card card-shift">
                  <div className="card-content card-clickable" onClick={() => setExpandedShift(isExp ? null : shift.id)}>
                    <div className="shift-summary">
                      <span className="card-title">{shift.date} — {shiftLabel(shift.name)}</span>
                      {hsg && <span className="badge badge-warning"><AlertTriangle size={12} /> {t('gaps')}</span>}
                    </div>
                    {isExp ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                  {isExp && (
                    <div className="shift-detail">
                      {allDepts.map((dept) => {
                        const da = (shift.assignments && shift.assignments[dept.id]) || {};
                        const dgObj = sg[dept.id] || {};
                        const hasAny = roles.some((r) => ((da[r.id]) || []).length > 0 || (dgObj[r.id] || 0) > 0);
                        if (!hasAny) return null;
                        return (
                          <div key={dept.id} className="shift-dept-block">
                            <span className="shift-dept-name">{(shift.deptNames && shift.deptNames[dept.id]) || getDeptLabel(dept)}</span>
                            {roles.map((role) => {
                              const asg = da[role.id] || [];
                              const gp = dgObj[role.id] || 0;
                              if ((!Array.isArray(asg) || asg.length === 0) && gp === 0) return null;
                              return (
                                <div key={role.id} className="shift-role-row">
                                  <span className="shift-role-name">{role.name}</span>
                                  <div className="chip-group chip-group-sm">
                                    {(Array.isArray(asg) ? asg : []).map((wid) => (
                                      <span key={wid} className="chip chip-static chip-sm">{getWorkerName(wid)}</span>
                                    ))}
                                    {gp > 0 && <span className="chip chip-static chip-sm chip-gap">+{gp} needed</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                      <div className="shift-actions">
                        <button className="btn btn-sm btn-whatsapp" onClick={() => setShareShift(shift)}>
                          <Image size={14} /> {t('shareAsImage')}
                        </button>
                        <button className="btn btn-sm" onClick={() => copyShiftText(shift)}>
                          {t('copyText')}
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteShift(shift.id)}>
                          <Trash2 size={14} /> {t('delete')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
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
