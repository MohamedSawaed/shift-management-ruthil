import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useLang } from '../i18n/LangContext';
import { Plus, Trash2, GripVertical } from 'lucide-react';

export default function Roles() {
  const { state, dispatch } = useApp();
  const { t } = useLang();
  const [name, setName] = useState('');
  const [dragIdx, setDragIdx] = useState(null);

  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    dispatch({ type: 'ADD_ROLE', payload: { name: name.trim() } });
    setName('');
  };

  const remove = (id) => dispatch({ type: 'DELETE_ROLE', payload: id });

  const onDragStart = (idx) => setDragIdx(idx);
  const onDragOver = (e, idx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const items = [...state.roles].sort((a, b) => a.priority - b.priority);
    const [moved] = items.splice(dragIdx, 1);
    items.splice(idx, 0, moved);
    const reordered = items.map((r, i) => ({ ...r, priority: i + 1 }));
    dispatch({ type: 'REORDER_ROLES', payload: reordered });
    setDragIdx(idx);
  };
  const onDragEnd = () => setDragIdx(null);

  const sorted = [...state.roles].sort((a, b) => a.priority - b.priority);

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('rolesTitle')}</h1>
        <p className="subtitle">{t('rolesSubtitle')}</p>
      </div>

      <form className="add-form" onSubmit={add}>
        <input type="text" placeholder={t('roleNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} className="input" />
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}><Plus size={18} /> {t('addRole')}</button>
      </form>

      {sorted.length === 0 ? (
        <div className="empty-state"><p>{t('noRoles')}</p></div>
      ) : (
        <div className="card-list">
          {sorted.map((role, idx) => (
            <div
              key={role.id}
              className={`card draggable ${dragIdx === idx ? 'dragging' : ''}`}
              draggable
              onDragStart={() => onDragStart(idx)}
              onDragOver={(e) => onDragOver(e, idx)}
              onDragEnd={onDragEnd}
            >
              <div className="card-grip"><GripVertical size={16} /></div>
              <span className="priority-badge">{role.priority}</span>
              <div className="card-content">
                <span className="card-title">{role.name}</span>
                <span className="card-meta">
                  {t('priority')} {role.priority} — {role.priority === 1 ? t('filledFirst') : `${t('filledAfter')} ${role.priority - 1} ${role.priority - 1 > 1 ? t('rolesPlural') : t('roleSingular')}`}
                </span>
              </div>
              <div className="card-actions">
                <button className="btn-icon btn-danger" onClick={() => remove(role.id)}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
