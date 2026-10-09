import React, { useRef, useCallback, useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { useLang } from '../i18n/LangContext';
import { shiftMeta, shiftLabel as labelForShift, countGaps } from '../lib/shiftTypes';
import { workerName, sortByName } from '../lib/workers';
import { X, Share2, Copy, Download, Check, Clock, Users, Building2, AlertTriangle, CheckCircle2, CalendarClock, Loader2 } from 'lucide-react';
import './ShiftImage.css';

// The shared image is rendered from this DOM with html2canvas, so it sticks to
// what html2canvas draws reliably: fixed hex colors (no CSS variables tied to
// the app theme, no color-mix), plain gradients, and icons given an explicit
// color instead of `currentColor`.
const TONES = {
  morning: { accent: '#e8590c', soft: '#fff4e6', line: '#ffd8a8', icon: '#ffffff' },
  afternoon: { accent: '#e03131', soft: '#fff0eb', line: '#ffc9b9', icon: '#ffffff' },
  night: { accent: '#3b5bdb', soft: '#edf2ff', line: '#bac8ff', icon: '#ffffff' },
  friday: { accent: '#c2255c', soft: '#fff0f6', line: '#fcc2d7', icon: '#ffffff' },
};

const TARGET_WIDTH = 1080; // px of the exported PNG — crisp in WhatsApp
const CARD_WIDTH = 440; // design width of the card, matches .si in ShiftImage.css

function hueFor(name) {
  // Members of one group ("הודים 1", "הודים 2") share the group's color.
  const base = name.replace(/\s+\d+$/, '');
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) % 360;
  return h;
}

function initialsFor(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  // Group members ("הודים 3") are told apart by their number.
  if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) return parts[parts.length - 1];
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ShiftImage({ shift, roles, departments, workers, getDeptLabel, shiftTimes, onClose }) {
  const { t, lang } = useLang();
  const cardRef = useRef(null);
  const [busy, setBusy] = useState(null); // 'share' | 'copy' | 'download' | null
  const [notice, setNotice] = useState(null);
  const rtl = lang === 'he';

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  const meta = shiftMeta(shift.name);
  const tone = TONES[meta.tone] || TONES.morning;
  const ShiftIcon = meta.icon;
  const label = labelForShift(t, shift.name);
  const hours = (shiftTimes || {})[shift.name] || {};
  const sortedRoles = [...roles].sort((a, b) => a.priority - b.priority);

  const dateObj = new Date(`${shift.date}T00:00:00`);
  const locale = rtl ? 'he-IL' : 'en-GB';
  const dayName = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(dateObj);
  const dateLong = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(dateObj);
  const dateShort = shift.date.split('-').reverse().join('/');

  const gaps = countGaps(shift.gaps);
  const sg = shift.gaps || {};
  const deptIds = Object.keys(shift.assignments || {}).filter((deptId) => {
    const da = shift.assignments[deptId] || {};
    const hasWorkers = Object.values(da).some((arr) => Array.isArray(arr) && arr.length > 0);
    return hasWorkers || Object.keys(sg[deptId] || {}).length > 0;
  });
  // Departments in their configured priority order.
  const orderedDeptIds = [...deptIds].sort((a, b) => {
    const pa = departments.find((d) => d.id === a)?.priority ?? 999;
    const pb = departments.find((d) => d.id === b)?.priority ?? 999;
    return pa - pb;
  });
  const people = new Set(Object.values(shift.assignments || {}).flatMap((r) => Object.values(r || {}).flat()));

  const fileName = `shift-${shift.date}-${shift.name}.png`;
  const caption = `${label} · ${dayName} ${dateShort}${hours.start && hours.end ? ` · ${hours.start}–${hours.end}` : ''}`;

  const render = useCallback(async () => {
    const el = cardRef.current;
    if (!el) return null;
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = await html2canvas(el, {
      // Always export the full-width design (the preview may be narrower on a
      // phone), scaled to exactly TARGET_WIDTH pixels.
      scale: TARGET_WIDTH / CARD_WIDTH,
      backgroundColor: '#f4f5fa',
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowHeight: Math.max(window.innerHeight, el.scrollHeight + 400),
      // The preview sits in a scrolling, height-limited window; in the copy
      // html2canvas renders from, let it grow so long shifts aren't cut off.
      onclone: (doc) => {
        const unclip = (sel, extra = {}) => {
          const n = doc.querySelector(sel);
          if (n) Object.assign(n.style, { overflow: 'visible', maxHeight: 'none', height: 'auto', ...extra });
        };
        unclip('.shift-image-overlay', { position: 'absolute', alignItems: 'flex-start' });
        unclip('.si-modal');
        unclip('.si-preview');
        const card = doc.querySelector('.si');
        if (card) Object.assign(card.style, { width: `${CARD_WIDTH}px`, maxWidth: 'none' });
      },
    });
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  }, []);

  const download = (blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // Phones: the system share sheet sends the image itself straight into
  // WhatsApp. Elsewhere: save the image and open WhatsApp to attach it.
  const share = async () => {
    setBusy('share');
    try {
      const blob = await render();
      if (!blob) return;
      const file = new File([blob], fileName, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: caption });
        } catch (e) {
          if (e && e.name !== 'AbortError') throw e;
        }
      } else {
        download(blob);
        window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, '_blank', 'noopener');
        setNotice(t('shareFallbackHint'));
      }
    } catch (e) {
      console.error('Share failed:', e);
      setNotice(t('shareFailed'));
    } finally {
      setBusy(null);
    }
  };

  // Desktop: copy the picture, then paste it into WhatsApp Web / Desktop.
  const copy = async () => {
    setBusy('copy');
    try {
      const blob = await render();
      if (!blob) return;
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
      setNotice(t('imageCopied'));
    } catch (e) {
      console.error('Copy failed:', e);
      setNotice(t('copyImageUnsupported'));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('download');
    try {
      const blob = await render();
      if (blob) download(blob);
    } finally {
      setBusy(null);
    }
  };

  const canCopy = typeof window !== 'undefined' && !!window.ClipboardItem && !!(navigator.clipboard && navigator.clipboard.write);
  const spinner = <Loader2 size={18} className="si-spin" />;

  return (
    <div className="shift-image-overlay" onClick={onClose}>
      <div className="si-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('shareShift')}>
        <header className="si-modal-head">
          <div>
            <h2>{t('shareShift')}</h2>
            <p>{t('sharePreviewHint')}</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label={t('close')}><X size={18} /></button>
        </header>

        <div className="si-preview">
          {/* ───────── The image ───────── */}
          <div ref={cardRef} className={`si si-${meta.tone} ${rtl ? 'si-rtl' : ''}`} dir={rtl ? 'rtl' : 'ltr'}>
            <div className="si-hero">
              <span className="si-orb si-orb-1" />
              <span className="si-orb si-orb-2" />
              <div className="si-brand">
                <span className="si-brand-mark"><CalendarClock size={14} color="#ffffff" strokeWidth={2.4} /></span>
                <span>{t('appName')}</span>
              </div>
              <div className="si-hero-main">
                <span className="si-icon"><ShiftIcon size={30} color={tone.icon} strokeWidth={2.2} /></span>
                <div className="si-hero-text">
                  <span className="si-kicker">{t('shiftScheduleShort')}</span>
                  <span className="si-title">{label}</span>
                </div>
              </div>
              <div className="si-when">
                <div className="si-day">{dayName}</div>
                <div className="si-date">{dateLong}</div>
                {hours.start && hours.end && (
                  <div className="si-hours">
                    <Clock size={14} color="#ffffff" strokeWidth={2.4} />
                    <span dir="ltr">{hours.start} – {hours.end}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="si-stats">
              <div className="si-stat">
                <span className="si-stat-icon" style={{ background: tone.soft }}><Users size={16} color={tone.accent} strokeWidth={2.4} /></span>
                <span className="si-stat-num">{people.size}</span>
                <span className="si-stat-label">{t('siWorkers')}</span>
              </div>
              <div className="si-stat">
                <span className="si-stat-icon" style={{ background: tone.soft }}><Building2 size={16} color={tone.accent} strokeWidth={2.4} /></span>
                <span className="si-stat-num">{orderedDeptIds.length}</span>
                <span className="si-stat-label">{t('siDepts')}</span>
              </div>
              <div className={`si-stat ${gaps > 0 ? 'si-stat-warn' : 'si-stat-ok'}`}>
                <span className="si-stat-icon">
                  {gaps > 0 ? <AlertTriangle size={16} color="#b35c00" strokeWidth={2.4} /> : <CheckCircle2 size={16} color="#0b7a52" strokeWidth={2.4} />}
                </span>
                <span className="si-stat-num">{gaps > 0 ? gaps : '✓'}</span>
                <span className="si-stat-label">{gaps > 0 ? t('siOpen') : t('allFilledShort')}</span>
              </div>
            </div>

            <div className="si-body">
              {orderedDeptIds.map((deptId) => {
                const da = shift.assignments[deptId] || {};
                const dg = sg[deptId] || {};
                const deptObj = departments.find((dd) => dd.id === deptId);
                const name = (shift.deptNames && shift.deptNames[deptId]) || (deptObj ? getDeptLabel(deptObj) : deptId);
                const features = (deptObj && deptObj.features) || [];
                const deptGap = Object.values(dg).reduce((s, n) => s + (n || 0), 0);
                return (
                  <div key={deptId} className="si-dept" style={{ borderColor: deptGap > 0 ? '#ffd8a8' : '#e6e8f0' }}>
                    <div className="si-dept-head">
                      <span className="si-dept-bar" style={{ background: deptGap > 0 ? '#f59f00' : tone.accent }} />
                      <span className="si-dept-name">{name}</span>
                      {deptGap > 0
                        ? <span className="si-pill si-pill-warn">+{deptGap} {t('needed')}</span>
                        : <span className="si-pill si-pill-ok"><Check size={11} color="#0b7a52" strokeWidth={3} /></span>}
                    </div>
                    {features.length > 0 && (
                      <div className="si-tags">
                        {features.map((f, i) => <span key={i} className="si-tag" style={{ background: tone.soft, color: tone.accent }}>{f}</span>)}
                      </div>
                    )}
                    {sortedRoles.map((role) => {
                      const ids = da[role.id] || [];
                      const gap = dg[role.id] || 0;
                      if (ids.length === 0 && gap === 0) return null;
                      return (
                        <div key={role.id} className="si-role">
                          <div className="si-role-name" style={{ color: tone.accent }}>{role.name}</div>
                          <div className="si-people">
                            {sortByName(workers, ids).map((wid) => {
                              const n = workerName(workers, wid);
                              const hue = hueFor(n);
                              const wt = (shift.workerTimes || {})[`${deptId}::${wid}`];
                              const custom = wt && (wt.start !== hours.start || wt.end !== hours.end) && wt.start && wt.end;
                              return (
                                <span key={wid} className="si-person">
                                  <span className="si-init" style={{ background: `hsl(${hue}, 75%, 92%)`, color: `hsl(${hue}, 55%, 32%)` }}>{initialsFor(n)}</span>
                                  <span className="si-person-name" dir="auto">{n}</span>
                                  {custom && <span className="si-person-time" dir="ltr">{wt.start}–{wt.end}</span>}
                                </span>
                              );
                            })}
                            {gap > 0 && <span className="si-person si-person-gap">+{gap} {t('needed')}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div className="si-foot">
              <span className={gaps > 0 ? 'si-foot-warn' : 'si-foot-ok'}>
                {gaps > 0 ? `${gaps} ${gaps !== 1 ? t('positionsOpen') : t('positionOpen')}` : t('allFilled')}
              </span>
              <span className="si-foot-brand">{t('appName')} · {dateShort}</span>
            </div>
          </div>
        </div>

        {notice && <div className="si-notice" role="status">{notice}</div>}

        <footer className="si-actions">
          <button type="button" className="btn btn-whatsapp btn-lg si-share" onClick={share} disabled={!!busy}>
            {busy === 'share' ? spinner : <Share2 size={18} />} {busy === 'share' ? t('preparingImage') : t('sendToWhatsApp')}
          </button>
          {canCopy && (
            <button type="button" className="btn btn-lg" onClick={copy} disabled={!!busy}>
              {busy === 'copy' ? spinner : <Copy size={18} />} {t('copyImage')}
            </button>
          )}
          <button type="button" className="btn btn-lg" onClick={save} disabled={!!busy}>
            {busy === 'download' ? spinner : <Download size={18} />} {t('downloadImage')}
          </button>
        </footer>
      </div>
    </div>
  );
}
