import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useLang } from '../i18n/LangContext';
import { SHIFT_TYPES, shiftMeta, shiftLabel, countGaps, localDateISO } from '../lib/shiftTypes';
import { ChevronLeft, ChevronRight, AlertTriangle, Plus } from 'lucide-react';

// Monday-first week containing `ref`, as local YYYY-MM-DD strings. (Built from
// local dates on purpose — toISOString() shifts to UTC and can land on the
// wrong day near midnight in Israel.)
function getWeekDates(ref) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return localDateISO(x);
  });
}

export default function Planner() {
  const { state } = useApp();
  const { t, lang } = useLang();
  const DAY_NAMES = t('daysShort');
  const [weekOffset, setWeekOffset] = useState(0);

  const roles = useMemo(() => [...state.roles].sort((a, b) => a.priority - b.priority), [state.roles]);
  const depts = useMemo(() => [...state.departments].sort((a, b) => a.priority - b.priority), [state.departments]);

  const todayISO = localDateISO();
  const weekDates = useMemo(() => {
    const ref = new Date();
    ref.setDate(ref.getDate() + weekOffset * 7);
    return getWeekDates(ref);
  }, [weekOffset]);

  const locale = lang === 'he' ? 'he-IL' : 'en-GB';
  const fmt = (iso, opts) => new Intl.DateTimeFormat(locale, opts).format(new Date(`${iso}T00:00:00`));
  const rangeLabel = `${fmt(weekDates[0], { day: 'numeric', month: 'short' })} – ${fmt(weekDates[6], { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const getWorkerName = (id) => state.workers.find((w) => w.id === id)?.name || '?';

  const shiftsByDate = useMemo(() => {
    const map = {};
    for (const shift of state.shifts) {
      if (!map[shift.date]) map[shift.date] = [];
      map[shift.date].push(shift);
    }
    return map;
  }, [state.shifts]);

  const weekShiftCount = weekDates.reduce((n, d) => n + (shiftsByDate[d] || []).length, 0);
  const weekGaps = weekDates.reduce((n, d) => n + (shiftsByDate[d] || []).reduce((s, sh) => s + countGaps(sh.gaps), 0), 0);

  const renderShift = (shift) => {
    const gaps = countGaps(shift.gaps);
    return (
      <div key={shift.id} className={`planner-shift ${gaps > 0 ? 'planner-shift-gap' : ''}`}>
        {gaps > 0 && <span className="planner-gap-flag"><AlertTriangle size={11} /> {gaps}</span>}
        {depts.map((dept) => {
          const da = (shift.assignments && shift.assignments[dept.id]) || {};
          const hasWorkers = roles.some((r) => (da[r.id] || []).length > 0);
          if (!hasWorkers) return null;
          return (
            <div key={dept.id} className="planner-dept">
              <span className="planner-dept-name">{(shift.deptNames && shift.deptNames[dept.id]) || dept.name}</span>
              {roles.map((role) => {
                const workers = da[role.id] || [];
                if (workers.length === 0) return null;
                return (
                  <div key={role.id} className="planner-role-workers">
                    <span className="planner-role-tag">{role.name}</span>
                    {workers.map((wid) => (
                      <span key={wid} className="planner-worker">{getWorkerName(wid)}</span>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const emptySlot = (date, shiftType) => (
    <Link to={`/shifts?date=${date}&shift=${shiftType}`} className="planner-add" title={t('buildThisShift')} aria-label={`${t('buildThisShift')} — ${shiftLabel(t, shiftType)} ${date}`}>
      <Plus size={14} />
    </Link>
  );

  return (
    <div className="page page-wide">
      <div className="page-header">
        <div>
          <h1>{t('plannerTitle')}</h1>
          <p className="subtitle">
            {t('weekSummary', { shifts: weekShiftCount })}
            {weekGaps > 0 && <span className="status status-warning planner-week-gaps"><AlertTriangle size={13} /> {t('openCount', { n: weekGaps })}</span>}
          </p>
        </div>
      </div>

      <div className="planner-nav">
        <div className="planner-nav-arrows">
          <button className="btn btn-icon-only" onClick={() => setWeekOffset((w) => w - 1)} aria-label={t('prev')}>
            <ChevronLeft size={18} className="flip-rtl" />
          </button>
          <button className="btn btn-icon-only" onClick={() => setWeekOffset((w) => w + 1)} aria-label={t('next')}>
            <ChevronRight size={18} className="flip-rtl" />
          </button>
        </div>
        <span className="planner-range">{rangeLabel}</span>
        <button className="btn btn-sm btn-ghost" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>{t('today')}</button>
      </div>

      {/* Desktop: week grid */}
      <div className="planner-scroll">
        <div className="planner-grid">
          <div className="planner-header-cell planner-corner" />
          {weekDates.map((date, i) => (
            <div key={date} className={`planner-header-cell ${date === todayISO ? 'planner-today' : ''}`}>
              <span className="planner-day">{DAY_NAMES[i]}</span>
              <span className="planner-date">{fmt(date, { day: 'numeric' })}</span>
            </div>
          ))}

          {SHIFT_TYPES.map((shiftType) => {
            const meta = shiftMeta(shiftType);
            const Icon = meta.icon;
            return (
              <React.Fragment key={shiftType}>
                <div className={`planner-row-label tone-${meta.tone}`}>
                  <span className="tone-icon"><Icon size={15} /></span>
                  <span>{shiftLabel(t, shiftType)}</span>
                </div>
                {weekDates.map((date) => {
                  const dayShifts = (shiftsByDate[date] || []).filter((s) => s.name === shiftType);
                  return (
                    <div key={date} className={`planner-cell tone-${meta.tone} ${date === todayISO ? 'planner-today-cell' : ''} ${dayShifts.length ? 'planner-cell-filled' : 'planner-cell-empty'}`}>
                      {dayShifts.length ? dayShifts.map(renderShift) : emptySlot(date, shiftType)}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Phone: one card per day */}
      <div className="planner-days">
        {weekDates.map((date) => {
          const dayShifts = shiftsByDate[date] || [];
          return (
            <section key={date} className={`planner-day-card ${date === todayISO ? 'planner-day-card-today' : ''}`}>
              <header className="planner-day-head">
                <span className="planner-day-name">{fmt(date, { weekday: 'long' })}</span>
                <span className="planner-day-date">{fmt(date, { day: 'numeric', month: 'short' })}</span>
                {date === todayISO && <span className="badge badge-primary">{t('today')}</span>}
              </header>
              {SHIFT_TYPES.map((shiftType) => {
                const meta = shiftMeta(shiftType);
                const Icon = meta.icon;
                const these = dayShifts.filter((s) => s.name === shiftType);
                if (these.length === 0 && shiftType === 'Friday' && new Date(`${date}T00:00:00`).getDay() !== 5) return null;
                return (
                  <div key={shiftType} className={`planner-day-row tone-${meta.tone}`}>
                    <span className="tone-pill"><Icon size={13} /> {shiftLabel(t, shiftType)}</span>
                    <div className="planner-day-content">
                      {these.length ? these.map(renderShift) : emptySlot(date, shiftType)}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
