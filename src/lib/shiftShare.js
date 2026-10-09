import { countGaps } from './shiftTypes';
import { workerName as nameOf, sortByName } from './workers';

// "Parent › Child" for sub-departments, plain name otherwise.
export function deptLabel(dept, departments) {
  if (!dept) return '?';
  if (dept.parentId) {
    const parent = departments.find((d) => d.id === dept.parentId);
    return parent ? `${parent.name} › ${dept.name}` : dept.name;
  }
  return dept.name;
}

// WhatsApp-formatted text version of a shift (used by "Copy text").
export function formatShiftText(shift, { departments, workers, roles }) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const d = new Date(`${shift.date}T00:00:00`);
  const dayName = dayNames[d.getDay()];
  const dateStr = shift.date.split('-').reverse().join('/');
  const line = '─'.repeat(20);
  const workerName = (id) => nameOf(workers, id);
  const sortedRoles = [...roles].sort((a, b) => a.priority - b.priority);

  let msg = '';
  msg += `✨ *SHIFT SCHEDULE* ✨\n${line}\n`;
  msg += `📅 *${dayName}, ${dateStr}*\n`;
  msg += `⏰ *${shift.name} Shift*\n${line}\n\n`;

  const sg = shift.gaps || {};
  for (const deptId of Object.keys(shift.assignments || {})) {
    const da = shift.assignments[deptId] || {};
    const deptGaps = sg[deptId] || {};
    const hasWorkers = Object.values(da).some((arr) => Array.isArray(arr) && arr.length > 0);
    if (!hasWorkers && Object.keys(deptGaps).length === 0) continue;

    const deptObj = departments.find((dd) => dd.id === deptId);
    const name = (shift.deptNames && shift.deptNames[deptId]) || deptLabel(deptObj, departments);
    const features = (deptObj && deptObj.features) || [];
    msg += `🏭 *${name}*`;
    if (features.length > 0) msg += ` _${features.join(' · ')}_`;
    msg += '\n';

    for (const role of sortedRoles) {
      const assigned = da[role.id] || [];
      const gap = deptGaps[role.id] || 0;
      if (assigned.length === 0 && gap === 0) continue;
      msg += `   ▸ *${role.name}:* ${sortByName(workers, assigned).map(workerName).join(', ')}`;
      if (gap > 0) msg += ` ⚠️ _+${gap} needed_`;
      msg += '\n';
    }
    msg += '\n';
  }

  const open = countGaps(sg);
  msg += open > 0
    ? `⚠️ *${open} position${open !== 1 ? 's' : ''} still open*\n`
    : '✅ *All positions filled!*\n';
  msg += `${line}\n_Sent from MyShift_`;
  return msg;
}
