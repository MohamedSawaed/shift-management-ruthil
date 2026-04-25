import React, { useRef, useCallback } from 'react';
import html2canvas from 'html2canvas';
import { useLang } from '../i18n/LangContext';

export default function ShiftImage({ shift, roles, departments, workers, getDeptLabel, shiftTimes, onClose }) {
  const { t, lang } = useLang();
  const DAY_NAMES_KEYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const shiftLabel = (s) => s === 'Morning' ? t('morning') : s === 'Afternoon' ? t('afternoon') : s === 'Night' ? t('night') : s === 'Friday' ? t('friday') : s;
  const cardRef = useRef(null);

  const getWorkerName = (id) => workers.find((w) => w.id === id)?.name || '?';

  const d = new Date(shift.date + 'T00:00:00');
  const dayKey = DAY_NAMES_KEYS[d.getDay()];
  const dayName = t('days')[dayKey] || dayKey;
  const dateStr = shift.date.split('-').reverse().join('/');

  const sg = shift.gaps || {};
  const deptIds = Object.keys(shift.assignments || {});
  const sortedRoles = [...roles].sort((a, b) => a.priority - b.priority);

  const totalGaps = Object.values(sg).reduce(
    (sum, rg) => sum + (typeof rg === 'object' ? Object.values(rg).reduce((s, n) => s + n, 0) : 0), 0
  );

  const shiftTime = (shiftTimes || {})[shift.name] || {};

  const exportImage = useCallback(async () => {
    if (!cardRef.current) return null;
    return await html2canvas(cardRef.current, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });
  }, []);

  const exportAndShare = useCallback(async () => {
    const canvas = await exportImage();
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `shift-${shift.date}-${shift.name}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setTimeout(() => {
      const msg = `${dayName}, ${dateStr} — ${shiftLabel(shift.name)}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    }, 500);
  }, [exportImage, shift, dayName, dateStr]);

  const downloadOnly = useCallback(async () => {
    const canvas = await exportImage();
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `shift-${shift.date}-${shift.name}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [exportImage, shift]);

  return (
    <div className="shift-image-overlay" onClick={onClose}>
      <div className="shift-image-modal" onClick={(e) => e.stopPropagation()}>
        <div ref={cardRef} className={`sic-min ${lang === 'he' ? 'sic-min-rtl' : ''}`} dir={lang === 'he' ? 'rtl' : 'ltr'}>

          {/* Header — kicker, day, date, time */}
          <div className="m-head">
            <div className="m-kicker">
              <span>{t('shiftSchedule')}</span>
              <span className="m-kicker-line" />
              <span>{shiftLabel(shift.name)}</span>
            </div>
            <h1 className="m-day">{dayName}</h1>
            <div className="m-meta">
              <span>{dateStr}</span>
              {shiftTime.start && shiftTime.end && (
                <>
                  <span className="m-meta-dot">·</span>
                  <span>{shiftTime.start}—{shiftTime.end}</span>
                </>
              )}
            </div>
          </div>

          <div className="m-rule" />

          {/* Departments */}
          <div className="m-body">
            {deptIds.map((deptId) => {
              const da = shift.assignments[deptId] || {};
              const deptGaps = sg[deptId] || {};
              const hasWorkers = Object.values(da).some((arr) => Array.isArray(arr) && arr.length > 0);
              const hasGaps = Object.keys(deptGaps).length > 0;
              if (!hasWorkers && !hasGaps) return null;

              const deptObj = departments.find((dd) => dd.id === deptId);
              const deptDisplayName = (shift.deptNames && shift.deptNames[deptId]) || (deptObj ? getDeptLabel(deptObj) : deptId);
              const features = (deptObj && deptObj.features) || [];

              return (
                <div key={deptId} className="m-dept">
                  <div className="m-dept-head">
                    <h2 className="m-dept-name">{deptDisplayName}</h2>
                    {features.length > 0 && (
                      <div className="m-dept-features">{features.join(' / ')}</div>
                    )}
                  </div>

                  <div className="m-roles">
                    {sortedRoles.map((role) => {
                      const assigned = da[role.id] || [];
                      const gap = deptGaps[role.id] || 0;
                      if (assigned.length === 0 && gap === 0) return null;
                      return (
                        <div key={role.id} className="m-role">
                          <div className="m-role-name">{role.name}</div>
                          <div className="m-role-list">
                            {assigned.map((wid) => {
                              const wt = (shift.workerTimes || {})[`${deptId}::${wid}`];
                              const start = wt ? wt.start : shiftTime.start;
                              const end = wt ? wt.end : shiftTime.end;
                              return (
                                <div key={wid} className="m-worker">
                                  <span className="m-worker-name">{getWorkerName(wid)}</span>
                                  {start && end && (
                                    <span className="m-worker-time">{start}—{end}</span>
                                  )}
                                </div>
                              );
                            })}
                            {gap > 0 && (
                              <div className="m-gap">— +{gap} {t('needed')}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="m-rule" />

          {/* Footer */}
          <div className="m-foot">
            <div className="m-foot-left">
              {totalGaps > 0
                ? <span className="m-foot-warn">{totalGaps} {totalGaps !== 1 ? t('positionsOpen') : t('positionOpen')}</span>
                : <span className="m-foot-ok">{t('allFilled')}</span>}
            </div>
            <div className="m-foot-right">{t('appName')}</div>
          </div>
        </div>

        <div className="shift-image-actions">
          <button className="btn btn-whatsapp btn-lg" onClick={exportAndShare}>
            {t('sendToWhatsApp')}
          </button>
          <button className="btn btn-lg" onClick={downloadOnly}>
            {t('downloadImage')}
          </button>
          <button className="btn btn-sm" onClick={onClose}>{t('close')}</button>
        </div>
      </div>
    </div>
  );
}
