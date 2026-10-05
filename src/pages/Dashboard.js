import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useLang } from '../i18n/LangContext';
import { SHIFT_TYPES, shiftMeta, shiftLabel, countGaps, countAssigned, localDateISO } from '../lib/shiftTypes';
import Avatar from '../components/Avatar';
import { Users, Building2, BadgeCheck, CalendarDays, AlertTriangle, CheckCircle2, Circle, ArrowRight, Palmtree, Plus, Clock } from 'lucide-react';

function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'greetingMorning';
  if (h < 18) return 'greetingAfternoon';
  return 'greetingEvening';
}

export default function Dashboard() {
  const { state } = useApp();
  const { t, lang } = useLang();
  const shiftTimes = state.shiftTimes || {};
  const roles = useMemo(() => [...state.roles].sort((a, b) => a.priority - b.priority), [state.roles]);
  const depts = useMemo(() => [...state.departments].sort((a, b) => a.priority - b.priority), [state.departments]);

  const todayDate = new Date();
  const today = localDateISO(todayDate);
  const weekAhead = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return localDateISO(d);
  }, []);

  const todayShifts = state.shifts.filter((s) => s.date === today);
  // Friday shifts only make sense on Fridays — don't show an empty Friday tile every day.
  const tileTypes = SHIFT_TYPES.filter((st) => st !== 'Friday' || todayDate.getDay() === 5 || todayShifts.some((s) => s.name === 'Friday'));

  const upcoming = useMemo(
    () => state.shifts
      .filter((s) => s.date > today && s.date <= weekAhead)
      .sort((a, b) => a.date.localeCompare(b.date) || SHIFT_TYPES.indexOf(a.name) - SHIFT_TYPES.indexOf(b.name)),
    [state.shifts, today, weekAhead],
  );
  const openAhead = state.shifts.filter((s) => s.date >= today).reduce((sum, s) => sum + countGaps(s.gaps), 0);
  const onVacation = state.workers.filter((w) => w.onVacation);

  const getWorkerName = (id) => state.workers.find((w) => w.id === id)?.name || '?';
  const shiftWorkerIds = (shift) => [...new Set(Object.values(shift.assignments || {}).flatMap((r) => Object.values(r || {}).flat()))];

  const fmtDay = (iso) => new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${iso}T00:00:00`));

  const setupSteps = [
    { done: state.roles.length > 0, to: '/roles', label: t('getStarted1') },
    { done: state.departments.length > 0, to: '/departments', label: t('getStarted2') },
    { done: state.workers.length > 0, to: '/workers', label: t('getStarted3') },
    { done: state.shifts.length > 0, to: '/shifts', label: t('getStarted4') },
  ];
  const setupDone = setupSteps.filter((s) => s.done).length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t(greetingKey())}</h1>
          <p className="subtitle">{t('todaySubtitle')}</p>
        </div>
      </div>

      {setupDone < setupSteps.length && (
        <section className="setup-card">
          <div className="setup-card-head">
            <div>
              <h2>{t('setupTitle')}</h2>
              <p className="subtitle">{t('setupProgress', { done: setupDone, total: setupSteps.length })}</p>
            </div>
            <div className="setup-meter" aria-hidden="true">
              <div className="setup-meter-fill" style={{ width: `${(setupDone / setupSteps.length) * 100}%` }} />
            </div>
          </div>
          <ol className="setup-steps">
            {setupSteps.map((step, i) => (
              <li key={i} className={step.done ? 'setup-step setup-step-done' : 'setup-step'}>
                <Link to={step.to}>
                  {step.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  <span>{step.label}</span>
                  {!step.done && <ArrowRight size={16} className="setup-step-go" />}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="today-tiles">
        {tileTypes.map((st) => {
          const meta = shiftMeta(st);
          const Icon = meta.icon;
          const shift = todayShifts.find((s) => s.name === st);
          const hours = shiftTimes[st] || {};
          const gaps = shift ? countGaps(shift.gaps) : 0;
          const ids = shift ? shiftWorkerIds(shift) : [];
          return (
            <div key={st} className={`shift-tile tone-${meta.tone} ${shift ? '' : 'shift-tile-empty'}`}>
              <div className="shift-tile-top">
                <span className="tone-icon"><Icon size={18} /></span>
                <div className="shift-tile-title">
                  <span className="shift-tile-name">{shiftLabel(t, st)}</span>
                  {hours.start && hours.end && <span className="shift-tile-hours">{hours.start} – {hours.end}</span>}
                </div>
              </div>
              {shift ? (
                <>
                  <div className="avatar-stack">
                    {ids.slice(0, 5).map((id) => <Avatar key={id} name={getWorkerName(id)} size="sm" />)}
                    {ids.length > 5 && <span className="avatar avatar-sm avatar-more">+{ids.length - 5}</span>}
                  </div>
                  <div className="shift-tile-foot">
                    <span className="shift-tile-count">{t('workersAssigned', { n: countAssigned(shift.assignments) })}</span>
                    {gaps > 0
                      ? <span className="status status-warning"><AlertTriangle size={13} /> {t('openCount', { n: gaps })}</span>
                      : <span className="status status-success"><CheckCircle2 size={13} /> {t('allFilledShort')}</span>}
                  </div>
                </>
              ) : (
                <div className="shift-tile-foot">
                  <span className="shift-tile-count">{t('notScheduled')}</span>
                  <Link to={`/shifts?date=${today}&shift=${st}`} className="btn btn-sm btn-soft">
                    <Plus size={14} /> {t('buildThisShift')}
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="stat-strip">
        <Link to="/workers" className="stat">
          <span className="stat-icon"><Users size={18} /></span>
          <span className="stat-value">{state.workers.length}</span>
          <span className="stat-label">{t('workersCount')}</span>
        </Link>
        <Link to="/departments" className="stat">
          <span className="stat-icon"><Building2 size={18} /></span>
          <span className="stat-value">{state.departments.length}</span>
          <span className="stat-label">{t('departmentsCount')}</span>
        </Link>
        <Link to="/roles" className="stat">
          <span className="stat-icon"><BadgeCheck size={18} /></span>
          <span className="stat-value">{state.roles.length}</span>
          <span className="stat-label">{t('rolesCount')}</span>
        </Link>
        <Link to="/planner" className={`stat ${openAhead > 0 ? 'stat-warning' : ''}`}>
          <span className="stat-icon">{openAhead > 0 ? <AlertTriangle size={18} /> : <CalendarDays size={18} />}</span>
          <span className="stat-value">{openAhead}</span>
          <span className="stat-label">{t('upcomingGaps')}</span>
        </Link>
      </section>

      <div className="split">
        <section className="panel">
          <div className="panel-head">
            <h2>{t('comingUp')}</h2>
            <Link to="/planner" className="panel-link">{t('viewWeek')} <ArrowRight size={14} className="flip-rtl" /></Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="panel-empty">{t('comingUpEmpty')}</p>
          ) : (
            <ul className="agenda">
              {upcoming.map((s) => {
                const meta = shiftMeta(s.name);
                const Icon = meta.icon;
                const gaps = countGaps(s.gaps);
                return (
                  <li key={s.id} className={`agenda-item tone-${meta.tone}`}>
                    <span className="agenda-date">{fmtDay(s.date)}</span>
                    <span className="tone-pill"><Icon size={13} /> {shiftLabel(t, s.name)}</span>
                    <span className="agenda-meta">{t('workersAssigned', { n: countAssigned(s.assignments) })}</span>
                    {gaps > 0
                      ? <span className="status status-warning">{t('openCount', { n: gaps })}</span>
                      : <span className="status status-success"><CheckCircle2 size={13} /></span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>{t('teamStatus')}</h2>
            <Link to="/workers" className="panel-link">{t('navWorkers')} <ArrowRight size={14} className="flip-rtl" /></Link>
          </div>
          {onVacation.length === 0 ? (
            <p className="panel-empty">{t('nobodyOnVacation')}</p>
          ) : (
            <ul className="people">
              {onVacation.map((w) => (
                <li key={w.id} className="person">
                  <Avatar name={w.name} size="sm" />
                  <span className="person-name">{w.name}</span>
                  <span className="badge badge-warning"><Palmtree size={12} /> {t('onVacation')}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/settings" className="panel-foot-link"><Clock size={14} /> {t('editShiftHours')}</Link>
        </section>
      </div>

      {todayShifts.length > 0 && (
        <section className="section">
          <h2 className="section-title">{t('todaysShifts')}</h2>
          {todayShifts.map((shift) => {
            const meta = shiftMeta(shift.name);
            const Icon = meta.icon;
            return (
              <div key={shift.id} className="today-shift">
                <h3 className={`tone-pill tone-${meta.tone}`}><Icon size={14} /> {shiftLabel(t, shift.name)}</h3>
                <div className="dept-grid dept-grid-compact">
                  {depts.map((dept) => {
                    const deptAssign = (shift.assignments && shift.assignments[dept.id]) || {};
                    const deptGaps = (shift.gaps && shift.gaps[dept.id]) || {};
                    const hasAny = roles.some((r) => (deptAssign[r.id] || []).length > 0 || (deptGaps[r.id] || 0) > 0);
                    if (!hasAny) return null;
                    const hasDeptGap = Object.keys(deptGaps).length > 0;
                    return (
                      <div key={dept.id} className={`dept-card dept-card-compact ${hasDeptGap ? 'dept-card-gap' : 'dept-card-ok'}`}>
                        <div className="dept-card-header"><span className="dept-card-name">{(shift.deptNames && shift.deptNames[dept.id]) || dept.name}</span></div>
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
            );
          })}
        </section>
      )}
    </div>
  );
}
