import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../i18n/LangContext';
import Avatar from './Avatar';
import { Sparkles, Eraser, Plus, X, Search, Star, AlertTriangle, Users, ArrowLeftRight, CheckCircle2, UserMinus } from 'lucide-react';

// Choosing who works a shift as a seating board: every department shows the
// seats each role needs. Tap an empty seat and only the people who can sit
// there are offered — fairest first — and after each pick the next empty seat
// opens by itself, so a whole shift is a few taps.
//
// seats: { [deptId]: { [roleId]: [workerId, …] } }
export default function SeatBoard({ depts, roles, candidates, canFill, seats, onChange, onFillRest, onClear, weekCounts, groupName, deptLabel }) {
  const { t } = useLang();
  const [open, setOpen] = useState(null); // { deptId, roleId, index }
  const [query, setQuery] = useState('');
  const [flash, setFlash] = useState(null); // seat key that was just filled

  const roleName = (id) => (roles.find((r) => r.id === id) || {}).name || '?';
  const nameOf = (id) => (candidates.find((w) => w.id === id) || {}).name || '?';
  const seatList = (s, d, r) => ((s[d] || {})[r] || []);

  // Every seat, in board order.
  const allSeats = useMemo(() => {
    const out = [];
    for (const d of depts) {
      for (const r of roles) {
        const need = (d.requirements || {})[r.id] || 0;
        for (let i = 0; i < need; i++) out.push({ deptId: d.id, roleId: r.id, index: i });
      }
    }
    return out;
  }, [depts, roles]);
  const isFilled = (s, seat) => !!seatList(s, seat.deptId, seat.roleId)[seat.index];
  const total = allSeats.length;
  const filled = allSeats.filter((seat) => isFilled(seats, seat)).length;
  const nextEmpty = allSeats.find((seat) => !isFilled(seats, seat));

  const whereIs = (wid) => {
    for (const dId of Object.keys(seats)) {
      for (const rId of Object.keys(seats[dId] || {})) {
        if ((seats[dId][rId] || []).includes(wid)) return { deptId: dId, roleId: rId };
      }
    }
    return null;
  };

  // Seat `wid` at the open seat (moving them if they sat elsewhere).
  const place = (wid) => {
    const next = JSON.parse(JSON.stringify(seats));
    for (const dId of Object.keys(next)) {
      for (const rId of Object.keys(next[dId] || {})) next[dId][rId] = next[dId][rId].filter((id) => id !== wid);
    }
    const { deptId, roleId } = open;
    const list = ((next[deptId] = next[deptId] || {})[roleId] = next[deptId][roleId] || []);
    // A move inside the same role shifted the list — sit at the first free spot.
    const at = Math.min(open.index, list.length);
    if (list[at]) list[at] = wid; else list.push(wid);
    onChange(next);
    setFlash(`${deptId}::${roleId}::${at}`);
    setQuery('');
    // Straight on to the next empty seat, starting after this one.
    const pos = allSeats.findIndex((s) => s.deptId === deptId && s.roleId === roleId && s.index === open.index);
    const order = [...allSeats.slice(pos + 1), ...allSeats.slice(0, pos + 1)];
    const following = order.find((s) => !isFilled(next, s));
    setOpen(following || null);
  };

  const vacate = (seat) => {
    const next = JSON.parse(JSON.stringify(seats));
    const list = seatList(next, seat.deptId, seat.roleId);
    list.splice(seat.index, 1);
    onChange(next);
  };

  useEffect(() => {
    if (!flash) return undefined;
    const id = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(id);
  }, [flash]);

  // Lock the page while the chooser is open; Escape closes it.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const listRef = useRef(null);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [open]);

  // ─── Who can take the open seat ───
  const choice = useMemo(() => {
    if (!open) return null;
    const { deptId, roleId } = open;
    const able = candidates.filter((w) => canFill(w, deptId, roleId));
    const q = query.trim().toLowerCase();
    const free = [];
    const elsewhere = [];
    const groups = new Map();
    for (const w of able) {
      const at = whereIs(w.id);
      if (at && at.deptId === deptId && at.roleId === roleId) continue; // already in this role
      if (at) { elsewhere.push({ w, at }); continue; }
      if (w.groupId) {
        const g = groups.get(w.groupId) || { id: w.groupId, name: groupName(w.groupId), first: w, count: 0 };
        g.count += 1;
        if (w.unit < g.first.unit) g.first = w;
        groups.set(w.groupId, g);
        continue;
      }
      free.push(w);
    }
    const byFair = (a, b) => (weekCounts[a.id] || 0) - (weekCounts[b.id] || 0) || a.name.localeCompare(b.name, undefined, { numeric: true });
    const rows = [
      ...free.map((w) => ({ kind: 'person', id: w.id, name: w.name, w, week: weekCounts[w.id] || 0 })),
      ...[...groups.values()].map((g) => ({ kind: 'group', id: g.first.id, name: g.name, count: g.count, week: 0 })),
    ].sort((a, b) => a.week - b.week || a.name.localeCompare(b.name, undefined, { numeric: true }));
    const emptyHere = (((depts.find((d) => d.id === deptId) || {}).requirements || {})[roleId] || 0) - seatList(seats, deptId, roleId).length;
    const people = free.length + [...groups.values()].reduce((n, g) => n + g.count, 0);
    const match = (n) => !q || n.toLowerCase().includes(q);
    return {
      rows: rows.filter((r) => match(r.name)),
      elsewhere: elsewhere.filter((e) => match(e.w.name)).sort((a, b) => byFair(a.w, b.w)),
      only: people > 0 && people <= emptyHere,
      any: able.length > 0,
      size: rows.length + elsewhere.length,
    };
  }, [open, candidates, canFill, seats, query, weekCounts, groupName, depts]); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = total > 0 ? filled / total : 1;
  const R = 26;
  const C = 2 * Math.PI * R;
  const done = total > 0 && filled === total;
  const weekText = (n) => (n > 1 ? t('sbThisWeek', { n }) : n === 1 ? t('sbOneThisWeek') : t('sbNoneThisWeek'));

  const openDept = open && depts.find((d) => d.id === open.deptId);
  const occupant = open && seatList(seats, open.deptId, open.roleId)[open.index];
  const seatNo = open ? open.index + 1 : 0;
  const seatOf = open ? (openDept.requirements || {})[open.roleId] || 0 : 0;

  return (
    <div className="sb">
      {/* Progress + one-tap fill */}
      <div className={`sb-hero ${done ? 'is-done' : ''}`}>
        <span className="sb-ring-wrap" aria-hidden="true">
          <svg className="sb-ring" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r={R} className="sb-ring-track" />
            <circle cx="32" cy="32" r={R} className="sb-ring-fill" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
          </svg>
          <span className="sb-ring-num">{done ? <CheckCircle2 size={24} /> : `${filled}/${total}`}</span>
        </span>
        <div className="sb-hero-text">
          <strong>{done ? t('sbAllFilled') : t('sbSeatsFilled', { filled, total })}</strong>
          <span>{done ? t('sbAllFilledSub') : t('sbHint')}</span>
        </div>
        <div className="sb-hero-actions">
          {!done && (
            <button type="button" className="btn btn-sm btn-smart" onClick={onFillRest}>
              <Sparkles size={14} /> {t('sbFillRest')}
            </button>
          )}
          {filled > 0 && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={onClear}>
              <Eraser size={14} /> {t('sbClearAll')}
            </button>
          )}
        </div>
      </div>

      {/* The board */}
      <div className="sb-depts">
        {depts.map((d) => {
          const need = roles.reduce((n, r) => n + ((d.requirements || {})[r.id] || 0), 0);
          const have = roles.reduce((n, r) => n + Math.min(seatList(seats, d.id, r.id).length, (d.requirements || {})[r.id] || 0), 0);
          return (
            <section key={d.id} className="sb-dept">
              <header className="sb-dept-head">
                <h3>{deptLabel(d)}</h3>
                <span className={`sb-count ${have >= need ? 'is-ok' : ''}`}>{have}/{need}</span>
              </header>
              {roles.filter((r) => ((d.requirements || {})[r.id] || 0) > 0).map((r) => {
                const n = d.requirements[r.id];
                const list = seatList(seats, d.id, r.id);
                return (
                  <div key={r.id} className="sb-role">
                    <span className="sb-role-name">{r.name}</span>
                    <div className="sb-seats">
                      {Array.from({ length: n }, (_, i) => {
                        const wid = list[i];
                        const key = `${d.id}::${r.id}::${i}`;
                        const isNext = !wid && nextEmpty && nextEmpty.deptId === d.id && nextEmpty.roleId === r.id && nextEmpty.index === i;
                        return wid ? (
                          <button key={key} type="button" className={`seat is-filled ${flash === key ? 'is-flash' : ''}`} onClick={() => setOpen({ deptId: d.id, roleId: r.id, index: i })}>
                            <Avatar name={nameOf(wid)} size="sm" />
                            <span className="seat-name" dir="auto">{nameOf(wid)}</span>
                          </button>
                        ) : (
                          <button key={key} type="button" className={`seat is-empty ${isNext ? 'is-next' : ''}`} onClick={() => setOpen({ deptId: d.id, roleId: r.id, index: list.length })} aria-label={`${t('sbChoose')} — ${r.name}, ${deptLabel(d)}`}>
                            <span className="seat-plus"><Plus size={16} /></span>
                            <span className="seat-name">{t('sbChoose')}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      {/* The chooser */}
      {open && choice && (
        <div className="sb-overlay" onClick={() => setOpen(null)}>
          <div className="sb-sheet" role="dialog" aria-modal="true" aria-label={roleName(open.roleId)} onClick={(e) => e.stopPropagation()}>
            <span className="sb-grab" aria-hidden="true" />
            <header className="sb-sheet-head">
              <div>
                <span className="sb-sheet-kicker">{deptLabel(openDept)} · {t('sbSeatOf', { n: Math.min(seatNo, seatOf), total: seatOf })}</span>
                <h3>{roleName(open.roleId)}</h3>
              </div>
              <button type="button" className="btn-icon" onClick={() => setOpen(null)} aria-label={t('close')}><X size={18} /></button>
            </header>

            {occupant && (
              <div className="sb-current">
                <Avatar name={nameOf(occupant)} size="sm" />
                <span className="sb-current-name" dir="auto">{nameOf(occupant)}</span>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => { vacate(open); setOpen(null); }}>
                  <UserMinus size={14} /> {t('sbRemove')}
                </button>
              </div>
            )}

            {choice.size > 7 && (
              <label className="sb-search">
                <Search size={17} />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('pickSearch')} aria-label={t('pickSearch')} />
              </label>
            )}

            <div className="sb-list" ref={listRef}>
              {!choice.any && <p className="sb-empty">{t('sbNoOne')}</p>}
              {choice.any && choice.rows.length === 0 && choice.elsewhere.length === 0 && <p className="sb-empty">{query ? t('noMatch') : t('sbAllSeated')}</p>}

              {choice.rows.map((row, i) => (
                <button key={row.id} type="button" className="sb-cand" onClick={() => place(row.id)}>
                  {row.kind === 'group'
                    ? <span className="pick-avatar-group"><Users size={18} /></span>
                    : <Avatar name={row.name} size="md" />}
                  <span className="sb-cand-text">
                    <span className="sb-cand-name" dir="auto">{row.name}</span>
                    <span className="sb-cand-sub">{row.kind === 'group' ? t('groupAvailable', { n: row.count }) : weekText(row.week)}</span>
                  </span>
                  {choice.only
                    ? <span className="pick-badge pick-badge-only"><AlertTriangle size={12} /> {t('pickOnlyOption')}</span>
                    : i === 0 && !query && <span className="pick-badge pick-badge-rec"><Star size={12} /> {t('sbBest')}</span>}
                </button>
              ))}

              {choice.elsewhere.length > 0 && (
                <>
                  <span className="sb-list-label">{t('sbAlreadyIn')}</span>
                  {choice.elsewhere.map(({ w, at }) => (
                    <button key={w.id} type="button" className="sb-cand is-elsewhere" onClick={() => place(w.id)}>
                      <Avatar name={w.name} size="md" />
                      <span className="sb-cand-text">
                        <span className="sb-cand-name" dir="auto">{w.name}</span>
                        <span className="sb-cand-sub">{roleName(at.roleId)} · {deptLabel(depts.find((x) => x.id === at.deptId) || { name: '?' })}</span>
                      </span>
                      <span className="sb-move"><ArrowLeftRight size={14} /> {t('sbMoveHere')}</span>
                    </button>
                  ))}
                </>
              )}
            </div>

            <footer className="sb-sheet-foot">
              <button type="button" className="btn btn-primary btn-lg" onClick={() => setOpen(null)}>{t('sbDone')}</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
