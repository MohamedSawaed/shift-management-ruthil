import React, { useState, useEffect, useMemo } from 'react';
import { useLang } from '../i18n/LangContext';
import { SHIFT_TYPES, shiftMeta, shiftLabel as labelForShift } from '../lib/shiftTypes';
import { renderShareImage } from '../lib/shiftImageCanvas';
import { X, Share2, Copy, Download, Loader2, MoreHorizontal } from 'lucide-react';
import './ShiftImage.css';

// Phones/tablets: the system share sheet can hand the image file itself to
// WhatsApp. Desktop browsers can't attach a file to WhatsApp, so there the
// reliable route is: copy the image, open WhatsApp Web, paste.
const IS_MOBILE = typeof navigator !== 'undefined' && (
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))
);

// Shares one shift (`shift`), or every shift of a day in one picture
// (`dayShifts` — all on the same date).
export default function ShiftImage({ shift, dayShifts, departments, workers, getDeptLabel, onClose }) {
  const { t, lang } = useLang();
  const rtl = lang === 'he';
  const [image, setImage] = useState(null); // { blob, url, file }
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState(null);

  const isDay = !shift && Array.isArray(dayShifts) && dayShifts.length > 0;
  const shifts = isDay
    ? [...dayShifts].sort((a, b) => SHIFT_TYPES.indexOf(a.name) - SHIFT_TYPES.indexOf(b.name))
    : [shift];
  const date = shifts[0].date;
  const dateObj = new Date(`${date}T00:00:00`);
  const dayName = new Intl.DateTimeFormat(rtl ? 'he-IL' : 'en-GB', { weekday: 'long' }).format(dateObj);
  const dateShort = date.split('-').reverse().join('/');
  const label = isDay ? dayName : labelForShift(t, shift.name);
  const fileName = isDay ? `shifts-${date}.png` : `shift-${date}-${shift.name}.png`;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Build the image as soon as the window opens. Sharing has to happen right
  // inside the tap (browsers, iPhones especially, refuse a share started
  // after slow work), so the file must already be ready by then.
  useEffect(() => {
    let cancelled = false;
    let url = null;
    renderShareImage({
      departments, workers, getDeptLabel, rtl,
      sections: shifts.map((sh) => ({ shift: sh, label: labelForShift(t, sh.name), tone: shiftMeta(sh.name).tone })),
      title: label,
      kicker: isDay ? t('dayScheduleShort') : t('shiftScheduleShort'),
      dateLine: isDay ? dateShort : `${dayName} · ${dateShort}`,
      heroTone: isDay ? 'day' : shiftMeta(shift.name).tone,
    }).then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setImage({ blob, url, file: new File([blob], fileName, { type: 'image/png' }) });
    }).catch((e) => {
      console.error('Image render failed:', e);
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [shift, dayShifts, departments, workers, rtl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(id);
  }, [notice]);

  const canShareFile = useMemo(
    () => !!(image && navigator.canShare && navigator.canShare({ files: [image.file] })),
    [image],
  );
  const canCopy = typeof window !== 'undefined' && !!window.ClipboardItem && !!(navigator.clipboard && navigator.clipboard.write);

  const download = () => {
    if (!image) return;
    const a = document.createElement('a');
    a.href = image.url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Image only — some phones' WhatsApp drops the picture when a caption is
  // shared alongside it.
  const shareFile = () => {
    navigator.share({ files: [image.file] }).catch((e) => {
      if (e && e.name !== 'AbortError') {
        console.error('Share failed:', e);
        setNotice(t('shareFailed'));
      }
    });
  };

  const copy = (then) => navigator.clipboard.write([new window.ClipboardItem({ 'image/png': image.blob })])
    .then(() => { setNotice(t('imageCopied')); if (then) then(); })
    .catch((e) => {
      console.error('Copy failed:', e);
      setNotice(t('copyImageUnsupported'));
    });

  const sendToWhatsApp = () => {
    if (!image) return;
    if (IS_MOBILE && canShareFile) {
      shareFile();
    } else if (canCopy) {
      // Open the tab inside the tap so pop-up blockers allow it, then copy.
      window.open('https://web.whatsapp.com/', '_blank');
      copy(() => setNotice(t('pasteInWhatsApp')));
    } else if (canShareFile) {
      shareFile();
    } else {
      download();
      setNotice(t('shareFallbackHint'));
    }
  };

  const ready = !!image;

  return (
    <div className="shift-image-overlay" onClick={onClose}>
      <div className="si-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('shareShift')}>
        <header className="si-modal-head">
          <div>
            <h2>{isDay ? t('shareDay') : t('shareShift')}</h2>
            <p>{IS_MOBILE ? t('shareHintMobile') : t('shareHintDesktop')}</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label={t('close')}><X size={18} /></button>
        </header>

        <div className="si-preview">
          {ready ? (
            <img className="si-img" src={image.url} alt={`${label} · ${dayName} ${dateShort}`} />
          ) : failed ? (
            <div className="si-loading">{t('shareFailed')}</div>
          ) : (
            <div className="si-loading"><Loader2 size={22} className="si-spin" /> {t('preparingImage')}</div>
          )}
        </div>

        {notice && <div className="si-notice" role="status">{notice}</div>}

        <footer className="si-actions">
          <button type="button" className="btn btn-whatsapp btn-lg si-share" onClick={sendToWhatsApp} disabled={!ready}>
            <Share2 size={18} /> {t('sendToWhatsApp')}
          </button>
          {canCopy && (
            <button type="button" className="btn btn-lg" onClick={() => copy()} disabled={!ready}>
              <Copy size={18} /> {t('copyImage')}
            </button>
          )}
          <button type="button" className="btn btn-lg" onClick={download} disabled={!ready}>
            <Download size={18} /> {t('downloadImage')}
          </button>
          {!IS_MOBILE && canShareFile && (
            <button type="button" className="btn btn-lg" onClick={shareFile} disabled={!ready} title={t('moreShareOptions')}>
              <MoreHorizontal size={18} /> {t('moreShareOptions')}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
