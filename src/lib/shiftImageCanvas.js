// Draws the shareable shift image straight onto a <canvas> (no DOM
// screenshot), so it's crisp and identical on every device. Content: the
// shift (name + day/date), and each department with the people working
// there — nothing else.

import { workerName, sortByName } from './workers';

const W = 1080; // output width in px — WhatsApp-friendly

const TONES = {
  morning: { accent: '#ffb020', hero: ['#ffc53d', '#ff8a00', '#f25c05'] },
  afternoon: { accent: '#ff8a65', hero: ['#ff9a5a', '#f5503b', '#d6336c'] },
  night: { accent: '#91a7ff', hero: ['#6f8bff', '#4c5ef0', '#3a1fa8'] },
  friday: { accent: '#ff8cc6', hero: ['#ff8cc6', '#e64980', '#9c36b5'] },
};

// Shift icons as vector paths (lucide, 24×24 grid) — drawn, not emoji, so they
// look the same on every phone and computer.
const ICONS = {
  morning: ['M12 2v8', 'm4.93 10.93 1.41 1.41', 'M2 18h2', 'M20 18h2', 'm19.07 10.93-1.41 1.41', 'M22 22H2', 'm8 6 4-4 4 4', 'M16 18a4 4 0 0 0-8 0'],
  afternoon: ['M12 10V2', 'm4.93 10.93 1.41 1.41', 'M2 18h2', 'M20 18h2', 'm19.07 10.93-1.41 1.41', 'M22 22H2', 'm16 6-4 4-4-4', 'M16 18a4 4 0 0 0-8 0'],
  night: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
  friday: ['M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'],
};

function drawIcon(ctx, tone, x, y, size, color) {
  const paths = ICONS[tone] || ICONS.morning;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
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
  for (const f of families) specs.push(`800 120px "${f}"`, `700 40px "${f}"`, `600 36px "${f}"`);
  await Promise.all(specs.map((s) => document.fonts.load(s).catch(() => null)));
}

/**
 * @returns {Promise<Blob>} PNG of the shift.
 */
export async function renderShiftImage({ shift, departments, workers, getDeptLabel, label, kicker, dateLine, tone, rtl }) {
  const pal = TONES[tone] || TONES.morning;
  const head = rtl ? '"Heebo", "Plus Jakarta Sans", sans-serif' : '"Plus Jakarta Sans", "Heebo", sans-serif';
  const body = rtl ? '"Heebo", "Inter", sans-serif' : '"Inter", "Heebo", sans-serif';
  await loadFonts(['Heebo', 'Plus Jakarta Sans', 'Inter']);

  // ── Data: departments with people, in configured order ──
  const depts = Object.keys(shift.assignments || {})
    .map((deptId) => {
      const ids = [...new Set(Object.values(shift.assignments[deptId] || {}).flat())];
      const d = departments.find((x) => x.id === deptId);
      return {
        priority: d ? d.priority : 999,
        name: (shift.deptNames && shift.deptNames[deptId]) || (d ? getDeptLabel(d) : '?'),
        names: sortByName(workers, ids).map((id) => workerName(workers, id)),
      };
    })
    .filter((d) => d.names.length > 0)
    .sort((a, b) => a.priority - b.priority);

  // ── Layout ──
  const CARD_X = 48;
  const CARD_W = W - CARD_X * 2;
  const CARD_PAD = 44;
  const COLS = 2;
  const COL_GAP = 20;
  const ROW_H = 88;
  const ROW_GAP = 16;
  const CELL_W = (CARD_W - CARD_PAD * 2 - COL_GAP * (COLS - 1)) / COLS;
  const DEPT_HEAD = 64;

  // Hero card in the shift's color
  const HERO_X = 32;
  const HERO_Y = 32;
  const HERO_W = W - HERO_X * 2;
  const HERO_PAD = 56;
  const HERO_H = HERO_PAD + 76 + 44 + 140 + 26 + 10 + 40 + 46 + HERO_PAD;
  const headerH = HERO_Y + HERO_H + 40;
  const cardHeights = depts.map((d) => {
    const rows = Math.ceil(d.names.length / COLS);
    return CARD_PAD + DEPT_HEAD + 28 + rows * ROW_H + (rows - 1) * ROW_GAP + CARD_PAD;
  });
  const CARD_GAP = 24;
  const H = headerH + cardHeights.reduce((s2, h) => s2 + h, 0) + CARD_GAP * Math.max(0, depts.length - 1) + 48;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.direction = rtl ? 'rtl' : 'ltr';
  // Mirror horizontal positions in Hebrew.
  const X = (x, w = 0) => (rtl ? W - x - w : x);
  const align = (side) => (rtl ? (side === 'left' ? 'right' : 'left') : side);

  // ── Background ──
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#11142b');
  bg.addColorStop(1, '#0a0c1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Hero ──
  ctx.save();
  roundRect(ctx, HERO_X, HERO_Y, HERO_W, HERO_H, 56);
  const hg = ctx.createLinearGradient(HERO_X, HERO_Y, HERO_X + HERO_W, HERO_Y + HERO_H);
  hg.addColorStop(0, pal.hero[0]);
  hg.addColorStop(0.55, pal.hero[1]);
  hg.addColorStop(1, pal.hero[2]);
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.clip();
  // Decorative rings
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.arc(X(HERO_X + HERO_W - 60), HERO_Y + 40, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.arc(X(HERO_X + HERO_W - 190), HERO_Y + HERO_H + 30, 170, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(X(HERO_X + HERO_W - 60), HERO_Y + 40, 330, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const hx = HERO_X + HERO_PAD;
  let y = HERO_Y + HERO_PAD;

  // Kicker pill: icon + "Shift schedule"
  ctx.font = `700 30px ${head}`;
  const kickerW = ctx.measureText(kicker).width;
  const pillW = 24 + 40 + 16 + kickerW + 32;
  roundRect(ctx, X(hx, pillW), y, pillW, 76, 38);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = 2;
  ctx.stroke();
  drawIcon(ctx, tone, X(hx + 24, 40), y + 18, 40, '#ffffff');
  ctx.font = `700 30px ${head}`;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = align('left');
  ctx.fillText(kicker, X(hx + 24 + 40 + 16), y + 40);

  y += 76 + 44;
  // Shift name
  ctx.textBaseline = 'alphabetic';
  let titleSize = 140;
  ctx.font = `800 ${titleSize}px ${head}`;
  while (ctx.measureText(label).width > HERO_W - HERO_PAD * 2 && titleSize > 72) {
    titleSize -= 6;
    ctx.font = `800 ${titleSize}px ${head}`;
  }
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = align('left');
  ctx.fillText(label, X(hx - 4), y + 116);

  y += 140 + 26;
  roundRect(ctx, X(hx, 110), y, 110, 10, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fill();

  y += 10 + 40;
  ctx.font = `700 42px ${head}`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.textBaseline = 'middle';
  ctx.fillText(dateLine, X(hx), y + 20);

  y = headerH;

  // ── Departments ──
  depts.forEach((d, i) => {
    const h = cardHeights[i];
    // Card
    roundRect(ctx, CARD_X, y, CARD_W, h, 44);
    const cg = ctx.createLinearGradient(0, y, 0, y + h);
    cg.addColorStop(0, 'rgba(255,255,255,0.085)');
    cg.addColorStop(1, 'rgba(255,255,255,0.045)');
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Accent bar + department name + headcount
    const innerX = CARD_X + CARD_PAD;
    roundRect(ctx, X(innerX, 10), y + CARD_PAD + 6, 10, DEPT_HEAD - 12, 5);
    ctx.fillStyle = pal.accent;
    ctx.fill();

    const countText = String(d.names.length);
    ctx.font = `800 30px ${head}`;
    const badgeW = Math.max(64, ctx.measureText(countText).width + 36);
    const badgeX = CARD_X + CARD_W - CARD_PAD - badgeW;
    roundRect(ctx, X(badgeX, badgeW), y + CARD_PAD + 8, badgeW, 48, 24);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(countText, X(badgeX + badgeW / 2), y + CARD_PAD + 33);

    ctx.textAlign = align('left');
    ctx.textBaseline = 'middle';
    ctx.font = `800 52px ${head}`;
    ctx.fillStyle = '#ffffff';
    const nameMax = CARD_W - CARD_PAD * 2 - 34 - badgeW - 20;
    ctx.fillText(ellipsize(ctx, d.name, nameMax), X(innerX + 34), y + CARD_PAD + DEPT_HEAD / 2 + 2);

    // People: two-column list of avatar + name
    const top = y + CARD_PAD + DEPT_HEAD + 28;
    d.names.forEach((n, k) => {
      const col = k % COLS;
      const row = Math.floor(k / COLS);
      const cx = innerX + col * (CELL_W + COL_GAP);
      const cy = top + row * (ROW_H + ROW_GAP);
      roundRect(ctx, X(cx, CELL_W), cy, CELL_W, ROW_H, 26);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fill();

      const hue = hueFor(n);
      const ax = cx + 18 + 26;
      ctx.beginPath();
      ctx.arc(X(ax), cy + ROW_H / 2, 26, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hue}, 80%, 74%)`;
      ctx.fill();
      ctx.fillStyle = `hsl(${hue}, 60%, 18%)`;
      ctx.font = `800 21px ${body}`;
      ctx.textAlign = 'center';
      ctx.fillText(initialsFor(n), X(ax), cy + ROW_H / 2 + 1);

      ctx.textAlign = align('left');
      ctx.font = `600 34px ${body}`;
      ctx.fillStyle = '#ffffff';
      const textX = cx + 18 + 52 + 18;
      ctx.fillText(ellipsize(ctx, n, CELL_W - (textX - cx) - 18), X(textX), cy + ROW_H / 2 + 2);
    });

    y += h + CARD_GAP;
  });

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
