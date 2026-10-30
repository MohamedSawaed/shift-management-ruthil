// Draws the shareable shift image straight onto a <canvas> (no DOM
// screenshot), so it's crisp and identical on every device. It uses the app's
// own light design — same page color, white cards, shift colors, avatars —
// and shows the shift, its date and hours, and each department with its
// roles and the people in them, with their hours.

import { workerName, sortByName } from './workers';

const W = 1080; // output width in px — WhatsApp-friendly

// The app's light palette (App.css tokens).
const APP = {
  bg: '#f3f4f8',
  surface: '#ffffff',
  surface2: '#f8f9fc',
  surface3: '#eef0f5',
  border: '#e3e6ee',
  text: '#12141f',
  text2: '#4f566b',
  text3: '#8a90a5',
  primary: '#5b4ff5',
};

// Shift tones exactly as in the app (--morning, --morning-soft, …).
const TONES = {
  morning: { tone: '#d99400', soft: '#fff4d6', strong: '#8a5d00' },
  afternoon: { tone: '#ea6a2b', soft: '#ffece2', strong: '#a5431a' },
  night: { tone: '#3e63dd', soft: '#e8eeff', strong: '#2a45a8' },
  friday: { tone: '#c2389d', soft: '#fbe7f5', strong: '#8d2571' },
  day: { tone: '#5b4ff5', soft: '#eeedff', strong: '#3b30c4' },
};

// Icons as vector paths (lucide, 24×24) — drawn, so they look the same everywhere.
const ICONS = {
  morning: ['M12 2v8', 'm4.93 10.93 1.41 1.41', 'M2 18h2', 'M20 18h2', 'm19.07 10.93-1.41 1.41', 'M22 22H2', 'm8 6 4-4 4 4', 'M16 18a4 4 0 0 0-8 0'],
  afternoon: ['M12 10V2', 'm4.93 10.93 1.41 1.41', 'M2 18h2', 'M20 18h2', 'm19.07 10.93-1.41 1.41', 'M22 22H2', 'm16 6-4 4-4-4', 'M16 18a4 4 0 0 0-8 0'],
  night: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
  friday: ['M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'],
  day: ['M8 2v4', 'M16 2v4', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M3 10h18'],
  brand: ['M8 2v4', 'M16 2v4', 'M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5', 'M3 10h5', 'M17.5 17.5 16 16.3V14', 'M22 16a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z'],
  clock: ['M12 6v6l4 2', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75', 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'],
};

function drawIcon(ctx, name, x, y, size, color, width = 2.2) {
  const paths = ICONS[name] || ICONS.morning;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const d of paths) ctx.stroke(new Path2D(d));
  ctx.restore();
}

function hueFor(name) {
  // Members of one group ("הודים 1", "הודים 2") share the group's color.
  const base = name.replace(/\s+\d+$/, '');
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) % 360;
  return h;
}

function initialsFor(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) return parts[parts.length - 1];
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
}

async function loadFonts(families) {
  if (!document.fonts || !document.fonts.load) return;
  const specs = [];
  for (const f of families) specs.push(`800 88px "${f}"`, `700 40px "${f}"`, `600 32px "${f}"`);
  await Promise.all(specs.map((s) => document.fonts.load(s).catch(() => null)));
}

// Departments of a shift, in configured order, each with its roles (priority
// order) and the people in each role with their hours.
function deptsOf(shift, { departments, workers, roles, getDeptLabel, hours }) {
  const sortedRoles = [...roles].sort((a, b) => a.priority - b.priority);
  return Object.keys(shift.assignments || {})
    .map((deptId) => {
      const da = shift.assignments[deptId] || {};
      const d = departments.find((x) => x.id === deptId);
      const roleRows = sortedRoles
        .map((role) => ({
          name: role.name,
          people: sortByName(workers, da[role.id] || []).map((wid) => {
            const wt = (shift.workerTimes || {})[`${deptId}::${wid}`];
            const start = (wt && wt.start) || hours.start;
            const end = (wt && wt.end) || hours.end;
            return { name: workerName(workers, wid), time: start && end ? `${start}–${end}` : '' };
          }),
        }))
        .filter((r) => r.people.length > 0);
      return {
        priority: d ? d.priority : 999,
        name: (shift.deptNames && shift.deptNames[deptId]) || (d ? getDeptLabel(d) : '?'),
        roles: roleRows,
        count: roleRows.reduce((n, r) => n + r.people.length, 0),
      };
    })
    .filter((d) => d.count > 0)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * @param sections [{ shift, label, tone, hours: { start, end } }]
 * @returns {Promise<Blob>} PNG
 */
export async function renderShareImage({ sections, departments, workers, roles, getDeptLabel, title, kicker, dateLine, heroTone, hoursLine, appName, rtl }) {
  const head = rtl ? '"Heebo", "Plus Jakarta Sans", sans-serif' : '"Plus Jakarta Sans", "Heebo", sans-serif';
  const body = rtl ? '"Heebo", "Inter", sans-serif' : '"Inter", "Heebo", sans-serif';
  await loadFonts(['Heebo', 'Plus Jakarta Sans', 'Inter']);

  const hero = TONES[heroTone] || TONES.morning;
  const withHeads = sections.length > 1;
  const secs = sections
    .map((sec) => ({ ...sec, pal: TONES[sec.tone] || TONES.morning, depts: deptsOf(sec.shift, { departments, workers, roles, getDeptLabel, hours: sec.hours || {} }) }))
    .filter((sec) => sec.depts.length > 0);

  // ── Layout constants ──
  const X0 = 40;
  const CW = W - X0 * 2; // card width
  const PAD = 40; // inside cards
  const COLS = 2;
  const GAP = 14;
  const CELL_W = (CW - PAD * 2 - GAP) / COLS;
  const CELL_H = 100;
  const ROLE_HEAD = 58;
  const DEPT_HEAD = 76;
  const CARD_GAP = 22;
  const SEC_HEAD = 104;
  const SEC_GAP = 34;

  const HERO_H = 10 + PAD + 64 + 36 + 112 + (hoursLine ? 24 + 64 : 0) + PAD;
  const roleBlockH = (r) => ROLE_HEAD + Math.ceil(r.people.length / COLS) * (CELL_H + GAP) - GAP;
  const deptH = (d) => PAD + DEPT_HEAD + 8 + d.roles.reduce((n, r) => n + roleBlockH(r) + 18, 0) - 18 + PAD;
  const secH = (s) => (withHeads ? SEC_HEAD : 0) + s.depts.reduce((n, d) => n + deptH(d), 0) + CARD_GAP * Math.max(0, s.depts.length - 1);
  const FOOT = 110;
  const H = X0 + HERO_H + 32 + secs.reduce((n, s) => n + secH(s), 0) + SEC_GAP * Math.max(0, secs.length - 1) + FOOT;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.direction = rtl ? 'rtl' : 'ltr';
  const X = (x, w = 0) => (rtl ? W - x - w : x); // mirror for Hebrew
  const align = (side) => (rtl ? (side === 'left' ? 'right' : 'left') : side);

  const card = (x, y, w, h, r = 36) => {
    ctx.save();
    ctx.shadowColor = 'rgba(16, 18, 35, 0.07)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = APP.surface;
    ctx.fill();
    ctx.restore();
    roundRect(ctx, x, y, w, h, r);
    ctx.strokeStyle = APP.border;
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  // Page
  ctx.fillStyle = APP.bg;
  ctx.fillRect(0, 0, W, H);

  // ── Header card ──
  let y = X0;
  card(X0, y, CW, HERO_H, 40);
  // Top accent in the shift's color, like the app's shift tiles.
  ctx.save();
  roundRect(ctx, X0, y, CW, HERO_H, 40);
  ctx.clip();
  ctx.fillStyle = hero.tone;
  ctx.fillRect(X0, y, CW, 10);
  ctx.restore();

  let hy = y + 10 + PAD;
  const hx = X0 + PAD;
  // Brand row
  roundRect(ctx, X(hx, 64), hy, 64, 64, 20);
  const bg = ctx.createLinearGradient(hx, hy, hx + 64, hy + 64);
  bg.addColorStop(0, '#7b6cff');
  bg.addColorStop(0.45, '#5b4ff5');
  bg.addColorStop(1, '#3e63dd');
  ctx.fillStyle = bg;
  ctx.fill();
  drawIcon(ctx, 'brand', X(hx + 16, 32), hy + 16, 32, '#ffffff', 2.4);
  ctx.textBaseline = 'middle';
  ctx.textAlign = align('left');
  ctx.font = `800 32px ${head}`;
  ctx.fillStyle = APP.text;
  ctx.fillText(appName, X(hx + 64 + 18), hy + 33);
  // Kicker on the opposite side
  ctx.font = `700 26px ${body}`;
  ctx.fillStyle = APP.text3;
  ctx.textAlign = align('right');
  ctx.fillText(kicker, X(X0 + CW - PAD), hy + 33);

  hy += 64 + 36;
  // Shift icon tile + title + date
  roundRect(ctx, X(hx, 112), hy, 112, 112, 32);
  ctx.fillStyle = hero.soft;
  ctx.fill();
  drawIcon(ctx, heroTone, X(hx + 28, 56), hy + 28, 56, hero.tone, 2.2);
  const tx = hx + 112 + 32;
  const titleMax = CW - PAD * 2 - 112 - 32;
  let titleSize = 76;
  ctx.font = `800 ${titleSize}px ${head}`;
  while (ctx.measureText(title).width > titleMax && titleSize > 48) {
    titleSize -= 4;
    ctx.font = `800 ${titleSize}px ${head}`;
  }
  ctx.textAlign = align('left');
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = APP.text;
  ctx.fillText(title, X(tx), hy + 62);
  ctx.font = `600 34px ${body}`;
  ctx.fillStyle = APP.text2;
  ctx.fillText(ellipsize(ctx, dateLine, titleMax), X(tx), hy + 106);

  if (hoursLine) {
    hy += 112 + 24;
    ctx.font = `700 32px ${body}`;
    const hw = 24 + 30 + 14 + ctx.measureText(hoursLine).width + 28;
    roundRect(ctx, X(hx, hw), hy, hw, 64, 32);
    ctx.fillStyle = hero.soft;
    ctx.fill();
    drawIcon(ctx, 'clock', X(hx + 24, 30), hy + 17, 30, hero.strong, 2.4);
    ctx.fillStyle = hero.strong;
    ctx.textBaseline = 'middle';
    ctx.textAlign = align('left');
    ctx.fillText(hoursLine, X(hx + 24 + 30 + 14), hy + 33);
  }

  y = X0 + HERO_H + 32;

  // ── Departments ──
  const drawDept = (d, pal) => {
    const h = deptH(d);
    card(X0, y, CW, h, 36);
    const ix = X0 + PAD;
    let cy = y + PAD;

    // Accent bar + name + headcount
    roundRect(ctx, X(ix, 8), cy + 14, 8, DEPT_HEAD - 32, 4);
    ctx.fillStyle = pal.tone;
    ctx.fill();
    ctx.font = `800 30px ${body}`;
    const countText = String(d.count);
    const pillW = 30 + 10 + ctx.measureText(countText).width + 40;
    const pillX = X0 + CW - PAD - pillW;
    roundRect(ctx, X(pillX, pillW), cy + 12, pillW, 52, 26);
    ctx.fillStyle = APP.surface3;
    ctx.fill();
    drawIcon(ctx, 'users', X(pillX + 18, 28), cy + 24, 28, APP.text2, 2.2);
    ctx.fillStyle = APP.text;
    ctx.textBaseline = 'middle';
    ctx.textAlign = align('left');
    ctx.fillText(countText, X(pillX + 18 + 28 + 10), cy + 39);

    ctx.font = `800 46px ${head}`;
    ctx.fillStyle = APP.text;
    ctx.fillText(ellipsize(ctx, d.name, CW - PAD * 2 - 30 - pillW - 20), X(ix + 26), cy + DEPT_HEAD / 2);
    cy += DEPT_HEAD;
    ctx.fillStyle = APP.border;
    ctx.fillRect(X(ix, CW - PAD * 2), cy, CW - PAD * 2, 2);
    cy += 8;

    d.roles.forEach((r, ri) => {
      if (ri > 0) cy += 18;
      // Role label, like the app's role headings
      ctx.font = `800 26px ${body}`;
      ctx.fillStyle = pal.strong;
      ctx.textAlign = align('left');
      ctx.textBaseline = 'middle';
      ctx.fillText(rtl ? r.name : r.name.toUpperCase(), X(ix), cy + ROLE_HEAD / 2 + 2);
      ctx.font = `700 24px ${body}`;
      ctx.fillStyle = APP.text3;
      const rw = ctx.measureText(rtl ? r.name : r.name.toUpperCase()).width;
      ctx.font = `800 26px ${body}`;
      const labelW = ctx.measureText(rtl ? r.name : r.name.toUpperCase()).width;
      ctx.font = `700 24px ${body}`;
      ctx.fillText(`· ${r.people.length}`, X(ix + Math.max(rw, labelW) + 12), cy + ROLE_HEAD / 2 + 2);
      cy += ROLE_HEAD;

      r.people.forEach((p, k) => {
        const col = k % COLS;
        const row = Math.floor(k / COLS);
        const cx = ix + col * (CELL_W + GAP);
        const top = cy + row * (CELL_H + GAP);
        roundRect(ctx, X(cx, CELL_W), top, CELL_W, CELL_H, 24);
        ctx.fillStyle = APP.surface2;
        ctx.fill();
        ctx.strokeStyle = APP.border;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const hue = hueFor(p.name);
        const ax = cx + 22 + 30;
        ctx.beginPath();
        ctx.arc(X(ax), top + CELL_H / 2, 30, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${hue}, 75%, 93%)`;
        ctx.fill();
        ctx.fillStyle = `hsl(${hue}, 55%, 33%)`;
        ctx.font = `800 22px ${body}`;
        ctx.textAlign = 'center';
        ctx.fillText(initialsFor(p.name), X(ax), top + CELL_H / 2 + 1);

        const nx = cx + 22 + 60 + 18;
        const maxW = CELL_W - (nx - cx) - 18;
        ctx.textAlign = align('left');
        ctx.font = `700 32px ${body}`;
        ctx.fillStyle = APP.text;
        ctx.fillText(ellipsize(ctx, p.name, maxW), X(nx), top + (p.time ? 36 : CELL_H / 2 + 1));
        if (p.time) {
          drawIcon(ctx, 'clock', X(nx, 22), top + 57, 22, APP.text3, 2.4);
          ctx.font = `600 24px ${body}`;
          ctx.fillStyle = APP.text2;
          ctx.save();
          ctx.direction = 'ltr';
          ctx.textAlign = rtl ? 'right' : 'left';
          ctx.fillText(p.time, X(nx + 30), top + 69);
          ctx.restore();
        }
      });
      cy += Math.ceil(r.people.length / COLS) * (CELL_H + GAP) - GAP;
    });
    y += h;
  };

  secs.forEach((sec, si) => {
    if (si > 0) y += SEC_GAP;
    if (withHeads) {
      // Shift heading: a pill in the shift's colors (like the app's tone pills) + hours
      ctx.font = `800 38px ${head}`;
      const tw = ctx.measureText(sec.label).width;
      const pw = 26 + 40 + 16 + tw + 34;
      roundRect(ctx, X(X0, pw), y + 12, pw, 76, 38);
      ctx.fillStyle = sec.pal.soft;
      ctx.fill();
      drawIcon(ctx, sec.tone, X(X0 + 26, 40), y + 30, 40, sec.pal.tone, 2.3);
      ctx.fillStyle = sec.pal.strong;
      ctx.textAlign = align('left');
      ctx.textBaseline = 'middle';
      ctx.fillText(sec.label, X(X0 + 26 + 40 + 16), y + 51);
      if (sec.hours && sec.hours.start && sec.hours.end) {
        ctx.font = `600 30px ${body}`;
        ctx.fillStyle = APP.text2;
        ctx.save();
        ctx.direction = 'ltr';
        ctx.textAlign = rtl ? 'right' : 'left';
        ctx.fillText(`${sec.hours.start}–${sec.hours.end}`, X(X0 + pw + 22), y + 51);
        ctx.restore();
      }
      y += SEC_HEAD;
    }
    sec.depts.forEach((d, di) => {
      if (di > 0) y += CARD_GAP;
      drawDept(d, sec.pal);
    });
  });

  // ── Footer: small brand mark ──
  const fy = H - FOOT / 2;
  ctx.font = `700 24px ${head}`;
  const ftw = ctx.measureText(appName).width;
  const fw = 30 + 12 + ftw;
  const fx = (W - fw) / 2;
  roundRect(ctx, rtl ? fx + ftw + 12 : fx, fy - 15, 30, 30, 9);
  ctx.fillStyle = APP.primary;
  ctx.fill();
  drawIcon(ctx, 'brand', (rtl ? fx + ftw + 12 : fx) + 6, fy - 9, 18, '#ffffff', 2.6);
  ctx.fillStyle = APP.text3;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(appName, rtl ? fx : fx + 42, fy + 1);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
