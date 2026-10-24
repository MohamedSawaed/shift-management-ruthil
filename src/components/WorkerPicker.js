import React, { useMemo, useState } from 'react';
import { useLang } from '../i18n/LangContext';
import Avatar from './Avatar';
import { Search, Check, X, Star, AlertTriangle, CheckCircle2, Users, Minus, Plus, ChevronDown } from 'lucide-react';

// Choosing who works a shift, organised around what the shift needs: one
// section per role that has open positions, each listing only the people who
// can fill it (as a calm, readable list — not a wall of pills), with whether
// that role is already covered. A worker who can do several roles appears in
// each of those sections; choosing them anywhere selects them everywhere.
export default function WorkerPicker({ analysis, selected, onToggle, onGroupCount, roles, depts, allWorkers }) {
  const { t } = useLang();
  const [query, setQuery] = useState('');
  // Covered roles start collapsed to just the chosen people; tap to see all.
  const [expanded, setExpanded] = useState(() => new Set());
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const q = query.trim().toLowerCase();
  const matches = (name) => !q || name.toLowerCase().includes(q);
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });

  // Members of worker groups, keyed by group.
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

  // Role sections with need / coverage.
  const missingByRole = useMemo(() => Object.fromEntries(analysis.gaps.map((g) => [g.role, g.count])), [analysis.gaps]);
  const sections = useMemo(() => roles.map((role) => {
    const needed = depts.reduce((n, d) => n + ((d.requirements || {})[role.id] || 0), 0);
    if (needed === 0) return null;
    const candidates = analysis.workers.filter((w) => w.fillableSlots.some((s) => s.roleId === role.id));
    const missing = selected.length > 0 ? (missingByRole[role.name] || 0) : needed;
    return { role, needed, missing, candidates };
  }).filter(Boolean), [roles, depts, analysis.workers, missingByRole, selected.length]);
  const others = analysis.workers.filter((w) => w.fillableSlots.length === 0);

  // Rows: people, with each worker group collapsed into one row.
  const rowsFor = (list) => {
    const rows = [];
    const seenGroups = new Set();
    for (const w of list) {
      if (w.groupId) {
        if (seenGroups.has(w.groupId)) continue;
        seenGroups.add(w.groupId);
        const name = groupName(w.groupId);
        if (matches(name)) rows.push({ kind: 'group', id: w.groupId, name, members: groupMembers.get(w.groupId) || [] });
      } else if (matches(w.name)) {
        rows.push({ kind: 'person', id: w.id, name: w.name, w });
      }
    }
    // Only-option people first (they matter most), then alphabetical.
    return rows.sort((a, b) => {
      const ca = a.kind === 'person' && a.w.isCritical ? 0 : 1;
      const cb = b.kind === 'person' && b.w.isCritical ? 0 : 1;
      return ca - cb || byName(a, b);
    });
  };

  const renderRow = (row, roleId) => {
    if (row.kind === 'group') {
      const chosen = row.members.filter((m) => selectedSet.has(m.id)).length;
      return (
        <li key={`${roleId}-${row.id}`} className={`pick-row ${chosen > 0 ? 'is-on' : ''}`}>
          <span className="pick-avatar pick-avatar-group"><Users size={18} /></span>
          <span className="pick-text">
            <span className="pick-name" dir="auto">{row.name}</span>
            <span className="pick-sub">{t('groupAvailable', { n: row.members.length })}</span>
          </span>
          <span className="pick-stepper" role="group" aria-label={row.name}>
            <button type="button" onClick={() => onGroupCount(row.id, row.members, chosen - 1)} disabled={chosen === 0} aria-label={`${row.name} −1`}><Minus size={16} /></button>
            <span className="pick-stepper-count" aria-live="polite">{chosen}</span>
            <button type="button" onClick={() => onGroupCount(row.id, row.members, chosen + 1)} disabled={chosen >= row.members.length} aria-label={`${row.name} +1`}><Plus size={16} /></button>
          </span>
        </li>
      );
    }
    const { w } = row;
    const on = selectedSet.has(w.id);
    const recommended = !on && analysis.bestNextId === w.id;
    const critical = !on && w.isCritical;
    return (
      <li key={`${roleId}-${w.id}`}>
        <button type="button" className={`pick-row pick-row-btn ${on ? 'is-on' : ''}`} onClick={() => onToggle(w.id)} aria-pressed={on}>
          <Avatar name={w.name} size="sm" />
          <span className="pick-text">
            <span className="pick-name" dir="auto">{w.name}</span>
            {w.roleNames.length > 0 && <span className="pick-sub">{w.roleNames.join(' · ')}</span>}
          </span>
          {recommended && <span className="pick-badge pick-badge-rec"><Star size={12} /> {t('pickRecommended')}</span>}
          {critical && <span className="pick-badge pick-badge-only" title={w.criticalFor.join(', ')}><AlertTriangle size={12} /> {t('pickOnlyOption')}</span>}
          <span className="pick-check" aria-hidden="true">{on && <Check size={16} strokeWidth={3} />}</span>
        </button>
      </li>
    );
  };

  // "Your team": who's chosen so far (groups as a count).
  const team = useMemo(() => {
    const items = [];
    const groupsDone = new Set();
    for (const w of analysis.workers) {
      if (!selectedSet.has(w.id)) continue;
      if (w.groupId) {
        if (groupsDone.has(w.groupId)) continue;
        groupsDone.add(w.groupId);
        const members = groupMembers.get(w.groupId) || [];
        items.push({ kind: 'group', id: w.groupId, name: groupName(w.groupId), count: members.filter((m) => selectedSet.has(m.id)).length, members });
      } else {
        items.push({ kind: 'person', id: w.id, name: w.name });
      }
    }
    return items.sort(byName);
  }, [analysis.workers, selectedSet, groupMembers]); // eslint-disable-line react-hooks/exhaustive-deps

  const headcount = team.reduce((n, i) => n + (i.kind === 'group' ? i.count : 1), 0);
  const anyResults = sections.some((s) => rowsFor(s.candidates).length > 0) || rowsFor(others).length > 0;

  return (
    <div className="picker">
      <div className="picker-team">
        <div className="picker-team-head">
          <span className="picker-team-title">{t('pickYourTeam')}</span>
          <span className="picker-team-count">{headcount}</span>
        </div>
        {team.length === 0 ? (
          <p className="picker-team-empty">{t('pickTeamEmpty')}</p>
        ) : (
          <div className="picker-team-list">
            {team.map((i) => (
              <span key={i.id} className="team-chip">
                <span dir="auto">{i.kind === 'group' ? `${i.name} ×${i.count}` : i.name}</span>
                <button
                  type="button"
                  onClick={() => (i.kind === 'group' ? onGroupCount(i.id, i.members, 0) : onToggle(i.id))}
                  aria-label={`${t('remove')} ${i.name}`}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <label className="picker-search">
        <Search size={18} />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('pickSearch')} aria-label={t('pickSearch')} />
        {query && <button type="button" onClick={() => setQuery('')} aria-label={t('clear')}><X size={16} /></button>}
      </label>

      {!anyResults && <p className="picker-none">{t('noMatch')}</p>}

      {sections.map((sec) => {
        const rows = rowsFor(sec.candidates);
        if (rows.length === 0 && q) return null;
        const covered = sec.missing === 0;
        // A covered role folds into one line — only roles still missing
        // people stay open. Searching opens everything.
        const collapsed = covered && !q && !expanded.has(sec.role.id);
        const toggleOpen = () => setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(sec.role.id)) next.delete(sec.role.id); else next.add(sec.role.id);
          return next;
        });
        return (
          <section key={sec.role.id} className={`pick-section ${covered ? 'is-covered' : ''}`}>
            <header className="pick-section-head">
              <span className="pick-role">{sec.role.name}</span>
              <span className="pick-need">{t('pickNeeded', { n: sec.needed })}</span>
              <span className={`pick-status ${covered ? 'ok' : 'warn'}`}>
                {covered ? <><CheckCircle2 size={14} /> {t('pickCovered')}</> : <><AlertTriangle size={14} /> {t('pickMissing', { n: sec.missing })}</>}
              </span>
            </header>
            {!collapsed && (rows.length === 0
              ? <p className="picker-none">{t('pickNobodyForRole')}</p>
              : <ul className="pick-list">{rows.map((r) => renderRow(r, sec.role.id))}</ul>)}
            {covered && !q && rows.length > 0 && (
              <button type="button" className={`pick-more ${collapsed ? '' : 'is-open'}`} onClick={toggleOpen} aria-expanded={!collapsed}>
                {collapsed ? t('pickShowAll', { n: rows.length }) : t('pickShowLess')}
                <ChevronDown size={16} />
              </button>
            )}
          </section>
        );
      })}

      {rowsFor(others).length > 0 && (
        <section className="pick-section pick-section-others">
          <header className="pick-section-head">
            <span className="pick-role">{t('pickOthers')}</span>
          </header>
          <ul className="pick-list">{rowsFor(others).map((r) => renderRow(r, 'others'))}</ul>
        </section>
      )}
    </div>
  );
}
