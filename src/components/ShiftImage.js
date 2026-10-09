import React, { useRef, useCallback, useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { useLang } from '../i18n/LangContext';
import { shiftMeta, shiftLabel as labelForShift } from '../lib/shiftTypes';
import { workerName, sortByName } from '../lib/workers';
import { X, Share2, Copy, Download, Loader2 } from 'lucide-react';
import './ShiftImage.css';

// The shared image is rendered from this DOM with html2canvas, so it sticks to
// what html2canvas draws reliably: fixed hex colors (no CSS variables tied to
// the app theme, no color-mix), plain gradients, and icons given an explicit
// color instead of `currentColor`.
const TONES = {
  morning: { accent: '#d9480f', soft: '#fff1e0', base: '#f76707' },
  afternoon: { accent: '#c92a2a', soft: '#ffece8', base: '#f03e3e' },
  night: { accent: '#3b5bdb', soft: '#eaefff', base: '#3b5bdb' },
  friday: { accent: '#a61e4d', soft: '#ffeaf3', base: '#c2255c' },
};

const TARGET_WIDTH = 1080; // px of the exported PNG — crisp in WhatsApp
const CARD_WIDTH = 440; // design width of the card, matches .si in ShiftImage.css


export default function ShiftImage({ shift, departments, workers, getDeptLabel, onClose }) {
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
  const dateObj = new Date(`${shift.date}T00:00:00`);
  const dayName = new Intl.DateTimeFormat(rtl ? 'he-IL' : 'en-GB', { weekday: 'long' }).format(dateObj);
  const dateShort = shift.date.split('-').reverse().join('/');

  // Only departments that actually have people, in their configured order,
  // each with everyone working there (across roles), names in natural order.
  const deptList = Object.keys(shift.assignments || {})
    .map((deptId) => {
      const ids = [...new Set(Object.values(shift.assignments[deptId] || {}).flat())];
      const deptObj = departments.find((d) => d.id === deptId);
      return {
        deptId,
        priority: deptObj ? deptObj.priority : 999,
        name: (shift.deptNames && shift.deptNames[deptId]) || (deptObj ? getDeptLabel(deptObj) : deptId),
        ids: sortByName(workers, ids),
      };
    })
    .filter((d) => d.ids.length > 0)
    .sort((a, b) => a.priority - b.priority);

  const fileName = `shift-${shift.date}-${shift.name}.png`;
  const caption = `${label} · ${dayName} ${dateShort}`;

  const render = useCallback(async () => {
    const el = cardRef.current;
    if (!el) return null;
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = await html2canvas(el, {
      // Always export the full-width design (the preview may be narrower on a
      // phone), scaled to exactly TARGET_WIDTH pixels.
      scale: TARGET_WIDTH / CARD_WIDTH,
      backgroundColor: tone.base,
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
        if (card) Object.assign(card.style, { width: `${CARD_WIDTH}px`, maxWidth: 'none', borderRadius: '0' });
      },
    });
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  }, [tone.base]);

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
          {/* ───────── The image: shift, departments, workers ───────── */}
          <div ref={cardRef} className={`si si-${meta.tone} ${rtl ? 'si-rtl' : ''}`} dir={rtl ? 'rtl' : 'ltr'}>
            <span className="si-orb si-orb-1" />
            <span className="si-orb si-orb-2" />
            <div className="si-head">
              <span className="si-icon"><ShiftIcon size={34} color="#ffffff" strokeWidth={2.4} /></span>
              <div className="si-title">{label}</div>
              <div className="si-date">{dayName} · <span dir="ltr">{dateShort}</span></div>
            </div>
            <div className="si-body">
              {deptList.map((d) => (
                <div key={d.deptId} className="si-dept">
                  <div className="si-dept-name" style={{ color: tone.accent }} dir="auto">{d.name}</div>
                  <div className="si-people">
                    {d.ids.map((wid) => (
                      <span key={wid} className="si-person" style={{ background: tone.soft }} dir="auto">
                        {workerName(workers, wid)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
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
