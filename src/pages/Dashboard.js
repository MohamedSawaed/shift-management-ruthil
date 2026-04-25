import React from 'react';
import { useApp } from '../context/AppContext';
import { useLang } from '../i18n/LangContext';
import { Link } from 'react-router-dom';
import { Building2, Users, CalendarClock, AlertTriangle, Wrench, Clock } from 'lucide-react';

const SHIFT_TYPES = ['Morning', 'Afternoon', 'Night', 'Friday'];

export default function Dashboard() {
  const { state, dispatch } = useApp();
  const { t } = useLang();
  const shiftTimes = state.shiftTimes || {};

  const updateTime = (shiftType, field, value) => {
    dispatch({ type: 'UPDATE_SHIFT_TIMES', payload: { [shiftType]: { ...(shiftTimes[shiftType] || {}), [field]: value } } });
  };
  const roles = [...state.roles].sort((a, b) => a.priority - b.priority);
  const depts = [...state.departments].sort((a, b) => a.priority - b.priority);
  const today = new Date().toISOString().slice(0, 10);
  const todayShifts = state.shifts.filter((s) => s.date === today);

  const totalGaps = state.shifts.reduce((sum, shift) => {
    const shiftGaps = shift.gaps || {};
    return sum + Object.values(shiftGaps).reduce((s, rg) => {
      if (typeof rg === 'object' && rg !== null) return s + Object.values(rg).reduce((s2, n) => s2 + (typeof n === 'number' ? n : 0), 0);
      return s + (typeof rg === 'number' ? rg : 0);
    }, 0);
  }, 0);

  const getWorkerName = (id) => state.workers.find((w) => w.id === id)?.name || '?';

  const shiftNameTranslation = (name) => {
    if (name === 'Morning') return t('morning');
    if (name === 'Afternoon') return t('afternoon');
    if (name === 'Night') return t('night');
    if (name === 'Friday') return t('friday');
    return name;
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('dashboardTitle')}</h1>
        <p className="subtitle">{t('dashboardSubtitle')}</p>
      </div>

      <div className="stats-grid">
        <Link to="/roles" className="stat-card">
          <Wrench size={24} />
          <div className="stat-value">{state.roles.length}</div>
          <div className="stat-label">{t('rolesCount')}</div>
        </Link>
        <Link to="/departments" className="stat-card">
          <Building2 size={24} />
          <div className="stat-value">{state.departments.length}</div>
          <div className="stat-label">{t('departmentsCount')}</div>
        </Link>
        <Link to="/workers" className="stat-card">
          <Users size={24} />
          <div className="stat-value">{state.workers.length}</div>
          <div className="stat-label">{t('workersCount')}</div>
        </Link>
        <Link to="/shifts" className="stat-card">
          <CalendarClock size={24} />
          <div className="stat-value">{state.shifts.length}</div>
          <div className="stat-label">{t('totalShifts')}</div>
        </Link>
        {totalGaps > 0 && (
          <Link to="/shifts" className="stat-card stat-card-warning">
            <AlertTriangle size={24} />
            <div className="stat-value">{totalGaps}</div>
            <div className="stat-label">{t('openGaps')}</div>
          </Link>
        )}
      </div>

      <div className="section">
        <h2><Clock size={18} /> {t('shiftTimes')}</h2>
        <div className="shift-times-grid">
          {SHIFT_TYPES.map((st) => {
            const tt = shiftTimes[st] || {};
            return (
              <div key={st} className="shift-time-row">
                <span className="shift-time-label">{shiftNameTranslation(st)}</span>
                <input type="time" className="input input-time" value={tt.start || ''} onChange={(e) => updateTime(st, 'start', e.target.value)} />
                <span className="shift-time-sep">{t('to')}</span>
                <input type="time" className="input input-time" value={tt.end || ''} onChange={(e) => updateTime(st, 'end', e.target.value)} />
              </div>
            );
          })}
        </div>
      </div>

      {roles.length > 0 && (
        <div className="section">
          <h2>{t('roleFillOrder')}</h2>
          <p className="subtitle">{t('roleFillOrderSub')}</p>
          <div className="priority-list">
            {roles.map((r, i) => (
              <div key={r.id} className="priority-item">
                <span className="priority-badge">{i + 1}</span>
                <span>{r.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {depts.length > 0 && (
        <div className="section">
          <h2>{t('deptSummary')}</h2>
          <div className="priority-list">
            {depts.map((d, i) => {
              const total = Object.values(d.requirements || {}).reduce((s, n) => s + n, 0);
              const canWork = state.workers.filter((w) => (w.assignments || []).some((a) => a.deptId === d.id)).length;
              return (
                <div key={d.id} className="priority-item">
                  <span className="priority-badge">{i + 1}</span>
                  <span>{d.name}</span>
                  <span className="priority-meta">{total} {t('needed')} · {canWork} {t('canWorkHere')}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {todayShifts.length > 0 && (
        <div className="section">
          <h2>{t('todaysShifts')}</h2>
          {todayShifts.map((shift) => (
            <div key={shift.id} className="today-shift">
              <h3>{shiftNameTranslation(shift.name)}</h3>
              <div className="dept-grid dept-grid-compact">
                {depts.map((dept) => {
                  const deptAssign = (shift.assignments && shift.assignments[dept.id]) || {};
                  const deptGaps = (shift.gaps && shift.gaps[dept.id]) || {};
                  const hasAny = roles.some((r) => ((deptAssign[r.id]) || []).length > 0 || (deptGaps[r.id] || 0) > 0);
                  if (!hasAny) return null;
                  const hasDeptGap = Object.keys(deptGaps).length > 0;
                  return (
                    <div key={dept.id} className={`dept-card dept-card-compact ${hasDeptGap ? 'dept-card-gap' : 'dept-card-ok'}`}>
                      <div className="dept-card-header"><span className="dept-card-name">{dept.name}</span></div>
                      {roles.map((role) => {
                        const assigned = deptAssign[role.id] || [];
                        const gap = deptGaps[role.id] || 0;
                        if ((!Array.isArray(assigned) || assigned.length === 0) && gap === 0) return null;
                        return (
                          <div key={role.id} className="shift-role-row">
                            <span className="shift-role-name">{role.name}</span>
                            <div className="chip-group chip-group-sm">
                              {(Array.isArray(assigned) ? assigned : []).map((wid) => (
                                <span key={wid} className="chip chip-static chip-sm">{getWorkerName(wid)}</span>
                              ))}
                              {gap > 0 && <span className="chip chip-static chip-sm chip-gap">+{gap} {t('needed')}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {state.roles.length === 0 && (
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          <h3>{t('getStarted')}</h3>
          <p>
            1. <Link to="/roles">{t('getStarted1')}</Link>
            <br />
            2. <Link to="/departments">{t('getStarted2')}</Link>
            <br />
            3. <Link to="/workers">{t('getStarted3')}</Link>
            <br />
            4. <Link to="/shifts">{t('getStarted4')}</Link>
          </p>
        </div>
      )}
    </div>
  );
}
