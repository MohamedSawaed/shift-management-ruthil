import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useLang } from '../i18n/LangContext';
import { SHIFT_TYPES, shiftMeta, shiftLabel as labelForShift } from '../lib/shiftTypes';
import { Plus, Pencil, Check, X, Clock, Palmtree, Search, Users } from 'lucide-react';
import { groupSize, headcount } from '../lib/workers';
import Avatar from '../components/Avatar';
import ConfirmDelete from '../components/ConfirmDelete';

export default function Workers({ embedded = false }) {
  const { state, dispatch } = useApp();
  const { t } = useLang();
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [availId, setAvailId] = useState(null);
  const [search, setSearch] = useState('');

  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    // More than one → a worker group (e.g. "הודים" × 20) sharing the same
    // availability, departments and roles.
    dispatch({ type: 'ADD_WORKER', payload: { name: name.trim(), assignments: [], availability: { default: [...SHIFT_TYPES] }, isGroup: qty > 1, quantity: qty } });
    setName('');
    setQty(1);
  };

  const setGroupQty = (worker, n) => {
    const quantity = Math.max(1, Math.min(999, Math.floor(Number(n) || 1)));
    dispatch({ type: 'UPDATE_WORKER', payload: { id: worker.id, quantity } });
  };

  const startEdit = (w) => { setEditId(w.id); setEditName(w.name); };
  const saveEdit = (id) => { if (!editName.trim()) return; dispatch({ type: 'UPDATE_WORKER', payload: { id, name: editName.trim() } }); setEditId(null); };
  const remove = (id) => dispatch({ type: 'DELETE_WORKER', payload: id });
  const toggleVacation = (id, current) => dispatch({ type: 'UPDATE_WORKER', payload: { id, onVacation: !current } });

  const getDeptName = (id) => state.departments.find((d) => d.id === id)?.name || '?';
  const getRoleName = (id) => state.roles.find((r) => r.id === id)?.name || '?';
  const shiftLabel = (s) => labelForShift(t, s);

  const toggleDefaultShift = (workerId, shift) => {
    const worker = state.workers.find((w) => w.id === workerId);
    if (!worker) return;
    const avail = worker.availability || {};
    const def = avail.default || [...SHIFT_TYPES];
    const newDef = def.includes(shift) ? def.filter((s) => s !== shift) : [...def, shift];
    dispatch({ type: 'UPDATE_WORKER', payload: { id: workerId, availability: { ...avail, default: newDef } } });
  };

  const filtered = state.workers.filter((w) => w.name.toLowerCase().includes(search.toLowerCase()));
  const vacationCount = state.workers.filter((w) => w.onVacation).length;

  return (
    <div className={embedded ? undefined : 'page'}>
      {!embedded && (
        <div className="page-header">
          <div>
            <h1>{t('workersTitle')}</h1>
            <p className="subtitle">{t('workersSubtitle')}</p>
          </div>
          {state.workers.length > 0 && (
            <div className="header-stats">
              <span className="header-stat"><strong>{headcount(state.workers)}</strong> {t('workersCount')}</span>
              {vacationCount > 0 && <span className="header-stat header-stat-warning"><Palmtree size={13} /> <strong>{vacationCount}</strong> {t('onVacation')}</span>}
            </div>
          )}
        </div>
      )}

      <div className="toolbar">
        <form className="add-form" onSubmit={add}>
          <input type="text" placeholder={t('workerNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} className="input" aria-label={t('workerNamePlaceholder')} />
          <label className="qty-field" title={t('quantityHint')}>
            <span className="qty-label">{t('quantity')}</span>
            <span className="stepper">
              <button type="button" className="stepper-btn" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="−1">−</button>
              <input type="number" min="1" max="999" className="stepper-input" value={qty} onChange={(e) => setQty(Math.max(1, Math.min(999, Math.floor(Number(e.target.value) || 1))))} aria-label={t('quantity')} />
              <button type="button" className="stepper-btn" onClick={() => setQty((q) => Math.min(999, q + 1))} aria-label="+1">+</button>
            </span>
          </label>
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
            {qty > 1 ? <><Users size={18} /> {t('addGroup', { n: qty })}</> : <><Plus size={18} /> {t('addWorker')}</>}
          </button>
        </form>
        {state.workers.length > 5 && (
          <label className="search-field">
            <Search size={16} />
            <input type="search" placeholder={t('searchWorkers')} value={search} onChange={(e) => setSearch(e.target.value)} className="input" />
          </label>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><p>{state.workers.length === 0 ? t('noWorkers') : t('noMatch')}</p></div>
      ) : (
        <div className="card-list">
          {filtered.map((worker) => {
            const assigns = worker.assignments || [];
            const isEditing = editId === worker.id;
            const showAvail = availId === worker.id;
            const defaultAvail = (worker.availability || {}).default || SHIFT_TYPES;

            return (
              <div key={worker.id} className={`card card-vertical worker-card ${worker.isGroup ? 'worker-card-group' : ''} ${worker.onVacation ? 'card-vacation' : ''}`}>
                {isEditing ? (
                  <div className="card-row">
                    <Avatar name={editName || worker.name} />
                    <div className="card-edit">
                      <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(worker.id); if (e.key === 'Escape') setEditId(null); }} />
                      <button className="btn-icon" onClick={() => saveEdit(worker.id)} aria-label={t('save')}><Check size={16} /></button>
                      <button className="btn-icon" onClick={() => setEditId(null)} aria-label={t('cancelSwap')}><X size={16} /></button>
                    </div>
                  </div>
                ) : (
                  <div className="card-row">
                    {worker.isGroup
                      ? <span className="avatar avatar-group" aria-hidden="true"><Users size={18} /></span>
                      : <Avatar name={worker.name} />}
                    <div className="card-content card-content-stack">
                      <span className="card-title">
                        {worker.name}
                        {worker.isGroup && (
                          <span className="group-badge">
                            <Users size={11} /> {t('groupOf', { n: groupSize(worker) })}
                          </span>
                        )}
                        {worker.onVacation && <span className="vacation-badge"><Palmtree size={11} /> {t('onVacation')}</span>}
                      </span>
                      {assigns.length > 0 ? (
                        <div className="chip-group chip-group-sm">
                          {assigns.map((a) => (
                            <span key={a.deptId} className="chip chip-static chip-sm">
                              {getDeptName(a.deptId)}
                              {(a.roleIds || []).length > 0 && <span className="chip-sub">{(a.roleIds || []).map((r) => getRoleName(r)).join(', ')}</span>}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="card-meta">{t('notAssigned')}</span>
                      )}
                    </div>
                    {worker.isGroup && (
                      <span className="stepper stepper-sm" title={t('quantity')}>
                        <button type="button" className="stepper-btn" onClick={() => setGroupQty(worker, groupSize(worker) - 1)} disabled={groupSize(worker) <= 1} aria-label={`${worker.name} −1`}>−</button>
                        <input type="number" min="1" max="999" className="stepper-input" value={groupSize(worker)} onChange={(e) => setGroupQty(worker, e.target.value)} aria-label={`${worker.name} — ${t('quantity')}`} />
                        <button type="button" className="stepper-btn" onClick={() => setGroupQty(worker, groupSize(worker) + 1)} aria-label={`${worker.name} +1`}>+</button>
                      </span>
                    )}
                    <div className="avail-dots" aria-label={t('availableForShifts')}>
                      {SHIFT_TYPES.map((s) => {
                        const meta = shiftMeta(s);
                        const Icon = meta.icon;
                        const on = defaultAvail.includes(s);
                        return (
                          <span key={s} className={`avail-dot tone-${meta.tone} ${on ? 'avail-dot-on' : ''}`} title={`${shiftLabel(s)}${on ? '' : ' ✕'}`}>
                            <Icon size={12} />
                          </span>
                        );
                      })}
                    </div>
                    <div className="card-actions">
                      <button
                        className={`btn-icon ${worker.onVacation ? 'btn-icon-vacation' : ''}`}
                        onClick={() => toggleVacation(worker.id, worker.onVacation)}
                        title={worker.onVacation ? t('returnFromVacation') : t('sendToVacation')}
                        aria-label={worker.onVacation ? t('returnFromVacation') : t('sendToVacation')}
                        aria-pressed={!!worker.onVacation}
                      >
                        <Palmtree size={15} />
                      </button>
                      <button className={`btn-icon ${showAvail ? 'btn-icon-active' : ''}`} onClick={() => setAvailId(showAvail ? null : worker.id)} title={t('availableForShifts')} aria-label={t('availableForShifts')} aria-expanded={showAvail}><Clock size={15} /></button>
                      <button className="btn-icon" onClick={() => startEdit(worker)} title={t('edit')} aria-label={t('edit')}><Pencil size={15} /></button>
                      <ConfirmDelete onConfirm={() => remove(worker.id)} />
                    </div>
                  </div>
                )}

                {showAvail && !isEditing && (
                  <div className="avail-panel">
                    <span className="avail-label">{t('availableForShifts')}</span>
                    <div className="chip-group">
                      {SHIFT_TYPES.map((s) => {
                        const meta = shiftMeta(s);
                        const Icon = meta.icon;
                        return (
                          <button key={s} type="button" aria-pressed={defaultAvail.includes(s)} className={`chip chip-sm chip-tone tone-${meta.tone} ${defaultAvail.includes(s) ? 'chip-active' : ''}`} onClick={() => toggleDefaultShift(worker.id, s)}>
                            <Icon size={13} /> {shiftLabel(s)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
