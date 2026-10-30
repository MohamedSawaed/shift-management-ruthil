import React, { useMemo, useState } from 'react';
import { useLang } from '../i18n/LangContext';
import Avatar from './Avatar';
import { Search, Check, X, Star, AlertTriangle, CheckCircle2, Users, Minus, Plus } from 'lucide-react';

// Choosing who works a shift: everyone available in ONE list, each person
// once, alphabetical with letter headers, a search box pinned on top, and
// filters (all / chosen / not chosen / by role). Rows never move when tapped,
// so you don't lose your place.
export default function WorkerPicker({ analysis, selected, onToggle, onGroupCount, roles, depts, allWorkers }) {
  const { t } = useLang();
  const [query, setQuery] = useState('');
  const [show, setShow] = useState('all'); // all | chosen | open
  const [roleFilter, setRoleFilter] = useState(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const q = query.trim().toLowerCase();

  // Worker groups (e.g. הודים) collapse into one row with − / +.
  const groupMembers = useMemo(() => {
    const m = new Map();
    for (const w of analysis.workers) {
      if (!w.groupId) continue;
      if (!m.has(w.groupId)) m.set(w.groupId, []);
      m.get(w.groupId).push(w);
    }
    for (const list of m.values()) list.sort((a, b) => a.unit - b.unit);
    return m;
  }, [analysis.workers]);
  const groupName = (id) => (allWorkers.find((g) => g.id === id) || {}).name || '?';

  // Roles this shift needs, with coverage — shown as filter chips.
  const missingByRole = useMemo(() => Object.fromEntries(analysis.gaps.map((g) => [g.role, g.count])), [analysis.gaps]);
  const roleStats = useMemo(() => roles.map((role) => {
    const needed = depts.reduce((n, d) => n + ((d.requirements || {})[role.id] || 0), 0);
    if (needed === 0) return null;
    const missing = selected.length > 0 ? (missingByRole[role.name] || 0) : needed;
    return { role, needed, covered: needed - missing };
  }).filter(Boolean), [roles, depts, missingByRole, selected.length]);

  // One row per person / per group.
  const rows = useMemo(() => {
    const out = [];
    const seen = new Set();
    for (const w of analysis.workers) {
      if (w.groupId) {
        if (seen.has(w.groupId)) continue;
        seen.add(w.groupId);
        const members = groupMembers.get(w.groupId) || [];
        out.push({
          kind: 'group', id: w.groupId, name: groupName(w.groupId), members,
          roleIds: new Set(w.fillableSlots.map((s) => s.roleId)), roleNames: w.roleNames,
          chosen: members.filter((m) => selectedSet.has(m.id)).length,
        });
      } else {
        out.push({
          kind: 'person', id: w.id, name: w.name, w,
          roleIds: new Set(w.fillableSlots.map((s) => s.roleId)), roleNames: w.roleNames,
          chosen: selectedSet.has(w.id) ? 1 : 0,
        });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [analysis.workers, groupMembers, selectedSet]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = rows.filter((r) => {
    if (q && !r.name.toLowerCase().includes(q)) return false;
    if (show === 'chosen' && r.chosen === 0) return false;
    if (show === 'open' && r.chosen > 0) return false;
    if (roleFilter && !r.roleIds.has(roleFilter)) return false;
    return true;
  });

  // Letter headers (first letter of the name).
  const letters = [];
  let current = null;
  for (const r of visible) {
    const letter = (r.name.trim()[0] || '#').toUpperCase();
    if (letter !== current) {
      current = letter;
      letters.push({ letter, rows: [] });
    }
    letters[letters.length - 1].rows.push(r);
  }

  const chosenCount = rows.reduce((n, r) => n + r.chosen, 0);
  const chosenRows = rows.filter((r) => r.chosen > 0);
  const resetFilters = () => { setQuery(''); setShow('all'); setRoleFilter(null); };

  const renderRow = (r) => {
    if (r.kind === 'group') {
      return (
        <li key={r.id} className={`pick-row ${r.chosen > 0 ? 'is-on' : ''}`}>
          <span className="pick-avatar-group"><Users size={18} /></span>
          <span className="pick-text">
            <span className="pick-name" dir="auto">{r.name}</span>
            <span className="pick-sub">{t('groupAvailable', { n: r.members.length })}{r.roleNames.length ? ` · ${r.roleNames.join(' · ')}` : ''}</span>
          </span>
          <span className="pick-stepper" role="group" aria-label={r.name}>
            <button type="button" onClick={() => onGroupCount(r.id, r.members, r.chosen - 1)} disabled={r.chosen === 0} aria-label={`${r.name} −1`}><Minus size={16} /></button>
            <span className="pick-stepper-count" aria-live="polite">{r.chosen}</span>
            <button type="button" onClick={() => onGroupCount(r.id, r.members, r.chosen + 1)} disabled={r.chosen >= r.members.length} aria-label={`${r.name} +1`}><Plus size={16} /></button>
          </span>
        </li>
      );
    }
    const { w } = r;
    const on = r.chosen > 0;
    return (
      <li key={w.id}>
        <button type="button" className={`pick-row pick-row-btn ${on ? 'is-on' : ''}`} onClick={() => onToggle(w.id)} aria-pressed={on}>
          <Avatar name={w.name} size="sm" />
          <span className="pick-text">
            <span className="pick-name" dir="auto">{w.name}</span>
            <span className="pick-sub">{w.roleNames.length ? w.roleNames.join(' · ') : t('pickNoRoleHere')}</span>
          </span>
          {!on && analysis.bestNextId === w.id && <span className="pick-badge pick-badge-rec"><Star size={12} /> {t('pickRecommended')}</span>}
          {!on && w.isCritical && <span className="pick-badge pick-badge-only" title={w.criticalFor.join(', ')}><AlertTriangle size={12} /> {t('pickOnlyOption')}</span>}
          <span className="pick-check" aria-hidden="true">{on && <Check size={16} strokeWidth={3} />}</span>
        </button>
      </li>
    );
  };

  return (
    <div className="picker">
      {/* Who's chosen so far */}
      <div className="picker-team">
        <div className="picker-team-head">
          <span className="picker-team-title">{t('pickYourTeam')}</span>
          <span className="picker-team-count">{chosenCount}</span>
        </div>
        {chosenRows.length === 0 ? (
          <p className="picker-team-empty">{t('pickTeamEmpty')}</p>
        ) : (
          <div className="picker-team-list">
            {chosenRows.map((r) => (
              <span key={r.id} className="team-chip">
                <span dir="auto">{r.kind === 'group' ? `${r.name} ×${r.chosen}` : r.name}</span>
                <button type="button" onClick={() => (r.kind === 'group' ? onGroupCount(r.id, r.members, 0) : onToggle(r.id))} aria-label={`${t('remove')} ${r.name}`}>
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Pinned search + filters */}
      <div className="picker-bar">
        <label className="picker-search">
          <Search size={18} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('pickSearch')} aria-label={t('pickSearch')} />
          {query && <button type="button" onClick={() => setQuery('')} aria-label={t('clear')}><X size={16} /></button>}
        </label>
        <div className="picker-filters">
          {[
            ['all', t('pickAll', { n: rows.length })],
            ['chosen', t('pickChosen', { n: chosenRows.length })],
            ['open', t('pickNotChosen', { n: rows.length - chosenRows.length })],
          ].map(([key, label]) => (
            <button key={key} type="button" className={`filter-chip ${show === key ? 'is-on' : ''}`} onClick={() => setShow(key)} aria-pressed={show === key}>{label}</button>
          ))}
          <span className="filter-sep" aria-hidden="true" />
          {roleStats.map(({ role, needed, covered }) => {
            const ok = covered >= needed;
            const on = roleFilter === role.id;
            return (
              <button key={role.id} type="button" className={`filter-chip filter-role ${ok ? 'ok' : 'warn'} ${on ? 'is-on' : ''}`} onClick={() => setRoleFilter(on ? null : role.id)} aria-pressed={on}>
                {ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                {role.name} <span className="filter-count">{covered}/{needed}</span>
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="picker-none">
          {t('noMatch')} <button type="button" className="btn-link" onClick={resetFilters}>{t('pickShowEveryone')}</button>
        </div>
      ) : (
        visible.length > 40 ? (
          // Big lists: letter headers to jump by eye.
          <div className="pick-letters">
            {letters.map(({ letter, rows: group }) => (
              <section key={letter} className="pick-letter">
                <h4 className="pick-letter-head">{letter}</h4>
                <ul className="pick-list">{group.map(renderRow)}</ul>
              </section>
            ))}
          </div>
        ) : (
          <ul className="pick-list pick-list-flat">{visible.map(renderRow)}</ul>
        )
      )}
    </div>
  );
}
