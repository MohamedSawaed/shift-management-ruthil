import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useLang } from '../i18n/LangContext';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';

function getWeekDates(startDate) {
  const d = new Date(startDate);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d.setDate(diff));
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

const SHIFT_TYPES = ['Morning', 'Afternoon', 'Night', 'Friday'];

export default function Planner() {
  const { state } = useApp();
  const { t } = useLang();
  const DAY_NAMES = t('daysShort');
  const shiftLabel = (s) => s === 'Morning' ? t('morning') : s === 'Afternoon' ? t('afternoon') : s === 'Night' ? t('night') : s === 'Friday' ? t('friday') : s;
  const [weekOffset, setWeekOffset] = useState(0);

  const roles = useMemo(() => [...state.roles].sort((a, b) => a.priority - b.priority), [state.roles]);
  const depts = useMemo(() => [...state.departments].sort((a, b) => a.priority - b.priority), [state.departments]);

  const today = new Date();
  const refDate = new Date(today);
  refDate.setDate(refDate.getDate() + weekOffset * 7);
  const weekDates = useMemo(() => getWeekDates(refDate), [weekOffset]); // eslint-disable-line

  const getWorkerName = (id) => state.workers.find((w) => w.id === id)?.name || '?';

  // Group shifts by date
  const shiftsByDate = useMemo(() => {
    const map = {};
    for (const shift of state.shifts) {
      if (!map[shift.date]) map[shift.date] = [];
      map[shift.date].push(shift);
    }
    return map;
  }, [state.shifts]);

  const isToday = (date) => date === today.toISOString().slice(0, 10);

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('plannerTitle')}</h1>
        <p className="subtitle">{t('plannerSubtitle')}</p>
      </div>

      <div className="planner-nav">
        <button className="btn btn-sm" onClick={() => setWeekOffset((w) => w - 1)}>
          <ChevronLeft size={16} /> {t('prev')}
        </button>
        <span className="planner-range">
          {weekDates[0]} — {weekDates[6]}
        </span>
        <button className="btn btn-sm" onClick={() => setWeekOffset((w) => w + 1)}>
          {t('next')} <ChevronRight size={16} />
        </button>
        {weekOffset !== 0 && (
          <button className="btn btn-sm" onClick={() => setWeekOffset(0)}>{t('today')}</button>
        )}
      </div>

      <div className="planner-grid">
        {/* Header */}
        <div className="planner-header-cell planner-corner" />
        {weekDates.map((date, i) => (
          <div key={date} className={`planner-header-cell ${isToday(date) ? 'planner-today' : ''}`}>
            <span className="planner-day">{DAY_NAMES[i]}</span>
            <span className="planner-date">{date.slice(5)}</span>
          </div>
        ))}

        {/* Rows per shift type */}
        {SHIFT_TYPES.map((shiftType) => (
          <React.Fragment key={shiftType}>
            <div className="planner-row-label">{shiftLabel(shiftType)}</div>
            {weekDates.map((date) => {
              const dayShifts = (shiftsByDate[date] || []).filter((s) => s.name === shiftType);
              const hasShift = dayShifts.length > 0;

              return (
                <div key={date} className={`planner-cell ${isToday(date) ? 'planner-today-cell' : ''} ${hasShift ? '' : 'planner-cell-empty'}`}>
                  {dayShifts.map((shift) => {
                    const sg = shift.gaps || {};
                    const hasGaps = Object.keys(sg).length > 0;
                    return (
                      <div key={shift.id} className="planner-shift">
                        {hasGaps && <AlertTriangle size={12} className="planner-gap-icon" />}
                        {depts.map((dept) => {
                          const da = (shift.assignments && shift.assignments[dept.id]) || {};
                          const hasWorkers = roles.some((r) => (da[r.id] || []).length > 0);
                          if (!hasWorkers) return null;
                          return (
                            <div key={dept.id} className="planner-dept">
                              <span className="planner-dept-name">{dept.name}</span>
                              {roles.map((role) => {
                                const workers = da[role.id] || [];
                                if (workers.length === 0) return null;
                                return (
                                  <div key={role.id} className="planner-role-workers">
                                    <span className="planner-role-tag">{role.name}:</span>
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
                  })}
                  {!hasShift && <span className="planner-no-shift">—</span>}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
