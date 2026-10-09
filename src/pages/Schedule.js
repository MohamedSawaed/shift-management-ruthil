import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useLang } from '../i18n/LangContext';
import { SHIFT_TYPES, shiftMeta, shiftLabel, countGaps, countAssigned, localDateISO } from '../lib/shiftTypes';
import { formatShiftText, deptLabel } from '../lib/shiftShare';
import Avatar from '../components/Avatar';
import { workerName as nameOf } from '../lib/workers';
import ShiftDrawer from '../components/ShiftDrawer';
import ShiftImage from '../components/ShiftImage';
import { ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, Circle, Plus, ArrowRight, CheckCheck, Share2 } from 'lucide-react';

// Monday of the week containing `d`, at local midnight.
function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  x.setDate(x.getDate() - (day === 0 ? 6 : day - 1));
  return x;
}

// Local YYYY-MM-DD dates of the week `offset` weeks from this one. (Local on
// purpose — toISOString() is UTC and lands on the wrong day near midnight.)
function weekDates(offset) {
  const start = mondayOf(new Date());
  start.setDate(start.getDate() + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(start);
    x.setDate(start.getDate() + i);
    return localDateISO(x);
  });
}

function weekOffsetFor(iso) {
  const target = mondayOf(new Date(`${iso}T00:00:00`));
  return Math.round((target - mondayOf(new Date())) / (7 * 24 * 3600 * 1000));
}

function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'greetingMorning';
  if (h < 18) return 'greetingAfternoon';
  return 'greetingEvening';
}

export default function Schedule() {
  const { state, dispatch } = useApp();
  const { t, lang } = useLang();
  const location = useLocation();
  const navigate = useNavigate();

  const [weekOffset, setWeekOffset] = useState(() => (location.state && location.state.date ? weekOffsetFor(location.state.date) : 0));
  const [openShiftId, setOpenShiftId] = useState(null);
  const [shareShift, setShareShift] = useState(null);
  const [shareDate, setShareDate] = useState(null); // share all of a day's shifts in one image
  const [toast, setToast] = useState(() => (location.state && location.state.toast) || null);

  // Show the "saved" toast once, then drop it from history so a refresh doesn't repeat it.
  useEffect(() => {
    if (location.state && location.state.toast) navigate('.', { replace: true, state: null });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(id);
  }, [toast]);

  const roles = useMemo(() => [...state.roles].sort((a, b) => a.priority - b.priority), [state.roles]);
  const today = localDateISO();
  const dates = useMemo(() => weekDates(weekOffset), [weekOffset]);
  const locale = lang === 'he' ? 'he-IL' : 'en-GB';
  const fmt = (iso, opts) => new Intl.DateTimeFormat(locale, opts).format(new Date(`${iso}T00:00:00`));
  const rangeLabel = `${fmt(dates[0], { day: 'numeric', month: 'short' })} – ${fmt(dates[6], { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const isFriday = (iso) => new Date(`${iso}T00:00:00`).getDay() === 5;

  const byDate = useMemo(() => {
    const map = {};
    for (const s of state.shifts) (map[s.date] = map[s.date] || []).push(s);
    return map;
  }, [state.shifts]);

  const shiftFor = (date, name) => (byDate[date] || []).find((s) => s.name === name);
  const workerName = (id) => nameOf(state.workers, id);
  const workerIds = (shift) => [...new Set(Object.values(shift.assignments || {}).flatMap((r) => Object.values(r || {}).flat()))];

  const weekShifts = dates.flatMap((d) => byDate[d] || []);
  const weekGaps = weekShifts.reduce((n, s) => n + countGaps(s.gaps), 0);
  const openShift = state.shifts.find((s) => s.id === openShiftId) || null;

  const todayTypes = SHIFT_TYPES.filter((st) => st !== 'Friday' || isFriday(today) || shiftFor(today, 'Friday'));

  const setupSteps = [
    { done: state.roles.length > 0, to: '/team?tab=roles', label: t('getStarted1') },
    { done: state.departments.length > 0, to: '/team?tab=departments', label: t('getStarted2') },
    { done: state.workers.length > 0, to: '/team?tab=workers', label: t('getStarted3') },
    { done: state.shifts.length > 0, to: '/build', label: t('getStarted4') },
  ];
  const setupDone = setupSteps.filter((s) => s.done).length;

  const copyText = useCallback((shift) => {
    const text = formatShiftText(shift, { departments: state.departments, workers: state.workers, roles: state.roles });
    navigator.clipboard.writeText(text).then(() => setToast('copied'), () => setToast(null));
  }, [state.departments, state.workers, state.roles]);

  const deleteShift = (shift) => {
    dispatch({ type: 'DELETE_SHIFT', payload: shift.id });
    setOpenShiftId(null);
    setToast('deleted');
  };

  const renderCard = (shift) => {
    const ids = workerIds(shift);
    const gaps = countGaps(shift.gaps);
    return (
      <button type="button" key={shift.id} className={`sched-card ${gaps > 0 ? 'sched-card-gap' : ''}`} onClick={() => setOpenShiftId(shift.id)}>
        <span className="avatar-stack">
          {ids.slice(0, 3).map((id) => <Avatar key={id} name={workerName(id)} size="xs" />)}
          {ids.length > 3 && <span className="avatar avatar-xs avatar-more">+{ids.length - 3}</span>}
        </span>
        <span className="sched-card-foot">
          <span className="sched-card-count">{t('workersAssigned', { n: countAssigned(shift.assignments) })}</span>
          {gaps > 0
            ? <span className="status status-warning"><AlertTriangle size={11} /> {gaps}</span>
            : <span className="status status-success"><CheckCircle2 size={11} /></span>}
        </span>
      </button>
    );
  };

  const renderSlot = (date, name) => {
    const shift = shiftFor(date, name);
    if (shift) return renderCard(shift);
    if (name === 'Friday' && !isFriday(date)) return <span className="sched-na" aria-hidden="true" />;
    const past = date < today;
    return (
      <Link
        to={`/build?date=${date}&shift=${name}`}
        className={`sched-add ${past ? 'sched-add-past' : ''}`}
        aria-label={`${t('buildThisShift')} — ${shiftLabel(t, name)}, ${fmt(date, { weekday: 'long', day: 'numeric', month: 'long' })}`}
      >
        <Plus size={15} />
      </Link>
    );
  };

  const toastText = { saved: t('toastSaved'), updated: t('toastUpdated'), deleted: t('toastDeleted'), copied: t('copiedToClipboard') }[toast];

  return (
    <div className="page page-wide">
      <div className="page-header schedule-header">
        <div>
          <span className="page-kicker">{fmt(today, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <h1>{t(greetingKey())}</h1>
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

      {/* Today at a glance */}
      <section className="today-strip" aria-label={t('today')}>
        <span className="today-strip-label">{t('today')}</span>
        <div className="today-strip-items">
          {todayTypes.map((st) => {
            const meta = shiftMeta(st);
            const Icon = meta.icon;
            const shift = shiftFor(today, st);
            const gaps = shift ? countGaps(shift.gaps) : 0;
            const content = (
              <>
                <span className="tone-icon"><Icon size={16} /></span>
                <span className="today-pill-text">
                  <span className="today-pill-name">{shiftLabel(t, st)}</span>
                  <span className="today-pill-state">
                    {!shift ? t('notScheduled') : gaps > 0 ? t('openCount', { n: gaps }) : t('allFilledShort')}
                  </span>
                </span>
                {shift && (gaps > 0 ? <AlertTriangle size={16} className="today-pill-flag is-warn" /> : <CheckCircle2 size={16} className="today-pill-flag is-ok" />)}
                {!shift && <Plus size={16} className="today-pill-flag" />}
              </>
            );
            return shift ? (
              <button key={st} type="button" className={`today-pill tone-${meta.tone}`} onClick={() => setOpenShiftId(shift.id)}>{content}</button>
            ) : (
              <Link key={st} to={`/build?date=${today}&shift=${st}`} className={`today-pill today-pill-empty tone-${meta.tone}`}>{content}</Link>
            );
          })}
        </div>
      </section>

      {/* Week board */}
      <section className="board">
        <div className="board-toolbar">
          <div className="board-nav">
            <button className="btn btn-icon-only" onClick={() => setWeekOffset((w) => w - 1)} aria-label={t('prev')}><ChevronLeft size={18} className="flip-rtl" /></button>
            <button className="btn btn-icon-only" onClick={() => setWeekOffset((w) => w + 1)} aria-label={t('next')}><ChevronRight size={18} className="flip-rtl" /></button>
          </div>
          <h2 className="board-range">{rangeLabel}</h2>
          {weekOffset !== 0 && <button className="btn btn-sm btn-soft" onClick={() => setWeekOffset(0)}>{t('thisWeek')}</button>}
          <span className="board-summary">
            {t('weekSummary', { shifts: weekShifts.length })}
            {weekGaps > 0
              ? <span className="status status-warning"><AlertTriangle size={12} /> {t('openCount', { n: weekGaps })}</span>
              : weekShifts.length > 0 && <span className="status status-success"><CheckCheck size={12} /> {t('allFilledShort')}</span>}
          </span>
        </div>

        {/* Desktop grid */}
        <div className="board-scroll">
          <div className="board-grid">
            <div className="board-corner" />
            {dates.map((d) => (
              <div key={d} className={`board-day ${d === today ? 'is-today' : ''} ${d < today ? 'is-past' : ''}`}>
                <span className="board-day-name">{fmt(d, { weekday: 'short' })}</span>
                <span className="board-day-num">{fmt(d, { day: 'numeric' })}</span>
                {(byDate[d] || []).length > 0 && (
                  <button type="button" className="day-share" onClick={() => setShareDate(d)} title={t('shareDay')} aria-label={`${t('shareDay')} — ${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}`}>
                    <Share2 size={13} /> {t('shareDayShort')}
                  </button>
                )}
              </div>
            ))}
            {SHIFT_TYPES.map((st) => {
              const meta = shiftMeta(st);
              const Icon = meta.icon;
              return (
                <React.Fragment key={st}>
                  <div className={`board-row-label tone-${meta.tone}`}>
                    <span className="tone-icon"><Icon size={15} /></span>
                    <span className="board-row-text">
                      <span>{shiftLabel(t, st)}</span>
                      {(state.shiftTimes || {})[st] && <small>{state.shiftTimes[st].start}–{state.shiftTimes[st].end}</small>}
                    </span>
                  </div>
                  {dates.map((d) => (
                    <div key={d} className={`board-cell tone-${meta.tone} ${d === today ? 'is-today' : ''}`}>
                      {renderSlot(d, st)}
                    </div>
                  ))}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Phone: a card per day */}
        <div className="board-days">
          {dates.map((d) => (
            <section key={d} className={`day-card ${d === today ? 'is-today' : ''}`}>
              <header className="day-card-head">
                <span className="day-card-name">{fmt(d, { weekday: 'long' })}</span>
                <span className="day-card-date">{fmt(d, { day: 'numeric', month: 'short' })}</span>
                {d === today && <span className="badge badge-primary">{t('today')}</span>}
                {(byDate[d] || []).length > 0 && (
                  <button type="button" className="day-share" onClick={() => setShareDate(d)} aria-label={`${t('shareDay')} — ${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}`}>
                    <Share2 size={13} /> {t('shareDayShort')}
                  </button>
                )}
              </header>
              {SHIFT_TYPES.filter((st) => st !== 'Friday' || isFriday(d) || shiftFor(d, st)).map((st) => {
                const meta = shiftMeta(st);
                const Icon = meta.icon;
                return (
                  <div key={st} className={`day-card-row tone-${meta.tone}`}>
                    <span className="tone-pill"><Icon size={13} /> {shiftLabel(t, st)}</span>
                    <div className="day-card-slot">{renderSlot(d, st)}</div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </section>

      {openShift && (
        <ShiftDrawer
          shift={openShift}
          onClose={() => setOpenShiftId(null)}
          onShare={(s) => setShareShift(s)}
          onCopy={copyText}
          onDelete={deleteShift}
        />
      )}

      {shareShift && (
        <ShiftImage
          shift={shareShift}
          roles={roles}
          departments={state.departments}
          workers={state.workers}
          getDeptLabel={(d) => deptLabel(d, state.departments)}
          shiftTimes={state.shiftTimes}
          onClose={() => setShareShift(null)}
        />
      )}

      {shareDate && (byDate[shareDate] || []).length > 0 && (
        <ShiftImage
          dayShifts={byDate[shareDate]}
          departments={state.departments}
          workers={state.workers}
          getDeptLabel={(d) => deptLabel(d, state.departments)}
          onClose={() => setShareDate(null)}
        />
      )}

      {toastText && (
        <div className="toast" role="status" key={toast}>
          <CheckCircle2 size={18} /> {toastText}
        </div>
      )}
    </div>
  );
}
