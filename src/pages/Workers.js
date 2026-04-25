import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useLang } from '../i18n/LangContext';
import { Plus, Trash2, Pencil, Check, X, Clock, Palmtree } from 'lucide-react';

const SHIFT_TYPES = ['Morning', 'Afternoon', 'Night', 'Friday'];

export default function Workers() {
  const { state, dispatch } = useApp();
  const { t } = useLang();
  const [name, setName] = useState('');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [availId, setAvailId] = useState(null);
  const [search, setSearch] = useState('');

  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    dispatch({ type: 'ADD_WORKER', payload: { name: name.trim(), assignments: [], availability: { default: [...SHIFT_TYPES] } } });
    setName('');
  };

  const startEdit = (w) => { setEditId(w.id); setEditName(w.name); };
  const saveEdit = (id) => { if (!editName.trim()) return; dispatch({ type: 'UPDATE_WORKER', payload: { id, name: editName.trim() } }); setEditId(null); };
  const remove = (id) => dispatch({ type: 'DELETE_WORKER', payload: id });
  const toggleVacation = (id, current) => dispatch({ type: 'UPDATE_WORKER', payload: { id, onVacation: !current } });

  const getDeptName = (id) => state.departments.find((d) => d.id === id)?.name || '?';
  const getRoleName = (id) => state.roles.find((r) => r.id === id)?.name || '?';

  const shiftLabel = (s) => {
    if (s === 'Morning') return t('morning');
    if (s === 'Afternoon') return t('afternoon');
    if (s === 'Night') return t('night');
    if (s === 'Friday') return t('friday');
    return s;
  };

  const toggleDefaultShift = (workerId, shift) => {
    const worker = state.workers.find((w) => w.id === workerId);
    if (!worker) return;
    const avail = worker.availability || {};
    const def = avail.default || [...SHIFT_TYPES];
    const newDef = def.includes(shift) ? def.filter((s) => s !== shift) : [...def, shift];
    dispatch({ type: 'UPDATE_WORKER', payload: { id: workerId, availability: { ...avail, default: newDef } } });
  };

  const filtered = state.workers.filter((w) => w.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('workersTitle')}</h1>
        <p className="subtitle">{t('workersSubtitle')}</p>
      </div>

      <form className="add-form" onSubmit={add}>
        <input type="text" placeholder={t('workerNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} className="input" />
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}><Plus size={18} /> {t('addWorker')}</button>
      </form>

      {state.workers.length > 5 && (
        <input type="text" placeholder={t('searchWorkers')} value={search} onChange={(e) => setSearch(e.target.value)} className="input search-input" />
      )}

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
              <div key={worker.id} className={`card card-vertical ${worker.onVacation ? 'card-vacation' : ''}`}>
                {isEditing ? (
                  <div className="card-row">
                    <div className="card-edit">
                      <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && saveEdit(worker.id)} />
                      <button className="btn-icon" onClick={() => saveEdit(worker.id)}><Check size={16} /></button>
                      <button className="btn-icon" onClick={() => setEditId(null)}><X size={16} /></button>
                    </div>
                  </div>
                ) : (
                  <div className="card-row">
                    <div className="card-content">
                      <span className="card-title">
                        {worker.name}
                        {worker.onVacation && <span className="vacation-badge"><Palmtree size={11} /> {t('onVacation')}</span>}
                      </span>
                      {assigns.length > 0 ? (
                        <div className="chip-group chip-group-sm">
                          {assigns.map((a) => (
                            <span key={a.deptId} className="chip chip-static chip-sm">
                              {getDeptName(a.deptId)}
                              {(a.roleIds || []).length > 0 && <span style={{ opacity: 0.6, marginLeft: 4 }}>({(a.roleIds || []).map((r) => getRoleName(r)).join(', ')})</span>}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="card-meta">{t('notAssigned')}</span>
                      )}
                    </div>
                    <div className="card-actions">
                      <button
                        className={`btn-icon ${worker.onVacation ? 'btn-icon-vacation' : ''}`}
                        onClick={() => toggleVacation(worker.id, worker.onVacation)}
                        title={worker.onVacation ? t('returnFromVacation') : t('sendToVacation')}
                      >
                        <Palmtree size={15} />
                      </button>
                      <button className="btn-icon" onClick={() => setAvailId(showAvail ? null : worker.id)}><Clock size={15} /></button>
                      <button className="btn-icon" onClick={() => startEdit(worker)}><Pencil size={15} /></button>
                      <button className="btn-icon btn-danger" onClick={() => remove(worker.id)}><Trash2 size={15} /></button>
                    </div>
                  </div>
                )}

                {showAvail && !isEditing && (
                  <div className="avail-panel">
                    <span className="avail-label">{t('availableForShifts')}</span>
                    <div className="chip-group">
                      {SHIFT_TYPES.map((s) => (
                        <button key={s} type="button" className={`chip chip-sm ${defaultAvail.includes(s) ? 'chip-active' : ''}`} onClick={() => toggleDefaultShift(worker.id, s)}>
                          {shiftLabel(s)}
                        </button>
                      ))}
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
