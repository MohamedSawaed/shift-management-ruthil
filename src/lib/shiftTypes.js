import { Sunrise, Sunset, Moon, Star } from 'lucide-react';

// Shift types are the main visual language of the app: each one has its own
// icon and color tone (see the --morning / --afternoon / ... tokens in
// App.css), used consistently on Today, the shift builder, the week planner
// and saved shifts.
export const SHIFT_TYPES = ['Morning', 'Afternoon', 'Night', 'Friday'];

const META = {
  Morning: { icon: Sunrise, tone: 'morning', labelKey: 'morning' },
  Afternoon: { icon: Sunset, tone: 'afternoon', labelKey: 'afternoon' },
  Night: { icon: Moon, tone: 'night', labelKey: 'night' },
  Friday: { icon: Star, tone: 'friday', labelKey: 'friday' },
};

export function shiftMeta(name) {
  return META[name] || { icon: Sunrise, tone: 'morning', labelKey: null };
}

export function shiftLabel(t, name) {
  const { labelKey } = shiftMeta(name);
  return labelKey ? t(labelKey) : name;
}

// Total open positions across a shift's gaps object ({ deptId: { roleId: n } }).
export function countGaps(gaps) {
  return Object.values(gaps || {}).reduce((sum, rg) => {
    if (rg && typeof rg === 'object') {
      return sum + Object.values(rg).reduce((s, n) => s + (typeof n === 'number' ? n : 0), 0);
    }
    return sum + (typeof rg === 'number' ? rg : 0);
  }, 0);
}

// Total workers placed in a shift's assignments ({ deptId: { roleId: [ids] } }).
export function countAssigned(assignments) {
  return Object.values(assignments || {}).reduce(
    (sum, roles) => sum + Object.values(roles || {}).reduce((s, ids) => s + (Array.isArray(ids) ? ids.length : 0), 0),
    0,
  );
}

export function localDateISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Absolute [start, end) in minutes for a shift on `iso` running start→end
// ("HH:MM"); an end at or before the start means it runs past midnight.
// null when the times aren't set.
export function shiftInterval(iso, start, end) {
  if (!iso || !start || !end) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const toMin = (hhmm) => {
    const [h, mm] = String(hhmm).split(':').map(Number);
    return h * 60 + mm;
  };
  const base = Math.round(Date.UTC(y, m - 1, d) / 86400000) * 1440;
  const s = base + toMin(start);
  let e = base + toMin(end);
  if (e <= s) e += 1440;
  return [s, e];
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return localDateISO(new Date(y, m - 1, d + n));
}
