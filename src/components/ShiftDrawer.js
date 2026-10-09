import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useLang } from '../i18n/LangContext';
import { shiftMeta, shiftLabel, countGaps, countAssigned } from '../lib/shiftTypes';
import { deptLabel } from '../lib/shiftShare';
import Avatar from './Avatar';
import { X, Pencil, Image, Copy, Trash2, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

// Side panel (bottom sheet on phones) with everything about one saved shift,
// and the actions you'd take on it.
export default function ShiftDrawer({ shift, onClose, onShare, onCopy, onDelete }) {
  const { state } = useApp();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const meta = shiftMeta(shift.name);
  const Icon = meta.icon;
  const roles = [...state.roles].sort((a, b) => a.priority - b.priority);
  const depts = [...state.departments].sort((a, b) => a.priority - b.priority);
  const gaps = countGaps(shift.gaps);
  const hours = (state.shiftTimes || {})[shift.name] || {};
  const workerName = (id) => state.workers.find((w) => w.id === id)?.name || '?';
  const dateLabel = new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${shift.date}T00:00:00`));

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className={`drawer tone-${meta.tone}`} role="dialog" aria-modal="true" aria-label={`${shiftLabel(t, shift.name)} — ${dateLabel}`}>
        <header className="drawer-head">
          <span className="tone-icon"><Icon size={20} /></span>
          <div className="drawer-title">
            <span className="drawer-kicker">{dateLabel}</span>
            <h2>{shiftLabel(t, shift.name)}</h2>
            <span className="drawer-meta">
              {hours.start && hours.end && <><Clock size={13} /> {hours.start}–{hours.end} · </>}
              {t('workersAssigned', { n: countAssigned(shift.assignments) })}
            </span>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label={t('close')}><X size={18} /></button>
        </header>

        <div className="drawer-status">
          {gaps > 0
            ? <span className="status status-warning"><AlertTriangle size={13} /> {t('openCount', { n: gaps })}</span>
            : <span className="status status-success"><CheckCircle2 size={13} /> {t('allFilledShort')}</span>}
        </div>

        <div className="drawer-body">
          {depts.map((dept) => {
            const da = (shift.assignments && shift.assignments[dept.id]) || {};
            const dg = (shift.gaps && shift.gaps[dept.id]) || {};
            const hasAny = roles.some((r) => (da[r.id] || []).length > 0 || (dg[r.id] || 0) > 0);
            if (!hasAny) return null;
            return (
              <div key={dept.id} className={`drawer-dept ${Object.keys(dg).length ? 'drawer-dept-gap' : ''}`}>
                <h3>{(shift.deptNames && shift.deptNames[dept.id]) || deptLabel(dept, state.departments)}</h3>
                {roles.map((role) => {
                  const ids = da[role.id] || [];
                  const gap = dg[role.id] || 0;
                  if (ids.length === 0 && gap === 0) return null;
                  return (
                    <div key={role.id} className="drawer-role">
                      <span className="drawer-role-name">{role.name}</span>
                      <div className="drawer-people">
                        {ids.map((wid) => {
                          const wt = (shift.workerTimes || {})[`${dept.id}::${wid}`];
                          const custom = wt && (wt.start !== hours.start || wt.end !== hours.end);
                          return (
                            <span key={wid} className="drawer-person">
                              <Avatar name={workerName(wid)} size="xs" />
                              {workerName(wid)}
                              {custom && <span className="drawer-person-time">{wt.start}–{wt.end}</span>}
                            </span>
                          );
                        })}
                        {gap > 0 && <span className="chip chip-static chip-sm chip-gap">+{gap} {t('needed')}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <footer className="drawer-actions">
          {confirming ? (
            <div className="confirm-inline confirm-block">
              <span>{t('deleteShiftConfirm')}</span>
              <button type="button" className="btn btn-sm btn-danger-solid" onClick={() => onDelete(shift)}>{t('yes')}</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirming(false)}>{t('no')}</button>
            </div>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={() => navigate(`/build?date=${shift.date}&shift=${shift.name}&edit=1`)}>
                <Pencil size={16} /> {t('edit')}
              </button>
              <button type="button" className="btn btn-whatsapp" onClick={() => onShare(shift)}>
                <Image size={16} /> {t('shareAsImage')}
              </button>
              <button type="button" className="btn" onClick={() => onCopy(shift)}>
                <Copy size={16} /> {t('copyText')}
              </button>
              <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
                <Trash2 size={16} /> {t('delete')}
              </button>
            </>
          )}
        </footer>
      </aside>
    </>
  );
}
