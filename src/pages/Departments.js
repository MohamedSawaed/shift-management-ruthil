import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useLang } from '../i18n/LangContext';
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp, UserPlus, Tag, X } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Departments() {
  const { state, dispatch } = useApp();
  const { t } = useLang();
  const [name, setName] = useState('');
  const [showChildPrompt, setShowChildPrompt] = useState(false);
  const [childNames, setChildNames] = useState('');
  const [pendingParentName, setPendingParentName] = useState('');
  const [dragIdx, setDragIdx] = useState(null);
  const [expandedDept, setExpandedDept] = useState(null);
  const [featureInput, setFeatureInput] = useState('');

  const roles = [...state.roles].sort((a, b) => a.priority - b.priority);
  const parents = state.departments.filter((d) => !d.parentId);
  const getChildren = (parentId) =>
    state.departments.filter((d) => d.parentId === parentId).sort((a, b) => a.priority - b.priority);
  const sorted = [...parents].sort((a, b) => a.priority - b.priority);

  // ─── Add flow ───
  const startAdd = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setPendingParentName(name.trim());
    setShowChildPrompt(true);
    setChildNames('');
  };

  const addStandalone = () => {
    const requirements = {};
    roles.forEach((r) => { requirements[r.id] = 0; });
    dispatch({ type: 'ADD_DEPARTMENT', payload: { name: pendingParentName, requirements } });
    setName(''); setShowChildPrompt(false); setPendingParentName('');
  };

  const addWithChildren = () => {
    const names = childNames.split(',').map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    const requirements = {};
    roles.forEach((r) => { requirements[r.id] = 0; });
    dispatch({ type: 'ADD_DEPARTMENT_WITH_CHILDREN', payload: { parentName: pendingParentName, childNames: names, requirements } });
    setName(''); setShowChildPrompt(false); setPendingParentName(''); setChildNames('');
  };

  const addChildToDept = (parentId) => {
    const childName = prompt(t('subDeptPrompt'));
    if (!childName || !childName.trim()) return;
    const parent = state.departments.find((d) => d.id === parentId);
    if (!parent) return;
    dispatch({ type: 'ADD_DEPARTMENT', payload: { name: childName.trim(), requirements: { ...(parent.requirements || {}) }, parentId } });
    // Auto-copy worker assignments from parent
    setTimeout(() => copyWorkersToNewChild(parentId, childName.trim()), 50);
  };

  const copyWorkersToNewChild = (parentId, childName) => {
    const child = state.departments.find((d) => d.name === childName && d.parentId === parentId);
    if (!child) return;
    state.workers.forEach((w) => {
      const pa = (w.assignments || []).find((a) => a.deptId === parentId);
      if (pa) {
        const assigns = w.assignments || [];
        if (!assigns.find((a) => a.deptId === child.id)) {
          dispatch({ type: 'UPDATE_WORKER', payload: { id: w.id, assignments: [...assigns, { deptId: child.id, roleIds: [...(pa.roleIds || [])] }] } });
        }
      }
    });
  };

  // ─── Update requirement — auto-propagate to children ───
  const updateRequirement = (deptId, roleId, value) => {
    const num = parseInt(value);
    if (isNaN(num) || num < 0) return;
    const dept = state.departments.find((d) => d.id === deptId);
    if (!dept) return;
    const newReqs = { ...(dept.requirements || {}), [roleId]: num };
    dispatch({ type: 'UPDATE_DEPARTMENT', payload: { id: deptId, requirements: newReqs } });

    // If this is a parent, push to all children
    if (!dept.parentId) {
      getChildren(deptId).forEach((child) => {
        dispatch({ type: 'UPDATE_DEPARTMENT', payload: { id: child.id, requirements: { ...(child.requirements || {}), [roleId]: num } } });
      });
    }
  };

  // ─── Toggle worker in dept — auto-propagate to children ───
  const toggleWorkerInDept = (deptId, workerId) => {
    const worker = state.workers.find((w) => w.id === workerId);
    if (!worker) return;
    const dept = state.departments.find((d) => d.id === deptId);
    if (!dept) return;
    const assigns = worker.assignments || [];
    const exists = assigns.find((a) => a.deptId === deptId);
    let newAssignments;

    if (exists) {
      newAssignments = assigns.filter((a) => a.deptId !== deptId);
    } else {
      newAssignments = [...assigns, { deptId, roleIds: [] }];
    }

    // If parent, also add/remove from all children
    if (!dept.parentId) {
      const children = getChildren(deptId);
      for (const child of children) {
        if (exists) {
          newAssignments = newAssignments.filter((a) => a.deptId !== child.id);
        } else {
          if (!newAssignments.find((a) => a.deptId === child.id)) {
            newAssignments = [...newAssignments, { deptId: child.id, roleIds: [] }];
          }
        }
      }
    }

    dispatch({ type: 'UPDATE_WORKER', payload: { id: workerId, assignments: newAssignments } });
  };

  // ─── Toggle worker role — auto-propagate to children ───
  const toggleWorkerRole = (deptId, workerId, roleId) => {
    const worker = state.workers.find((w) => w.id === workerId);
    if (!worker) return;
    const dept = state.departments.find((d) => d.id === deptId);
    if (!dept) return;

    const parentAssign = (worker.assignments || []).find((a) => a.deptId === deptId);
    if (!parentAssign) return;
    const has = (parentAssign.roleIds || []).includes(roleId);
    const newRoleIds = has ? parentAssign.roleIds.filter((r) => r !== roleId) : [...(parentAssign.roleIds || []), roleId];

    let assigns = (worker.assignments || []).map((a) =>
      a.deptId === deptId ? { ...a, roleIds: newRoleIds } : a
    );

    // If parent, propagate to children
    if (!dept.parentId) {
      const children = getChildren(deptId);
      assigns = assigns.map((a) => {
        if (children.some((c) => c.id === a.deptId)) {
          const childRoles = a.roleIds || [];
          const updatedRoles = has
            ? childRoles.filter((r) => r !== roleId)
            : childRoles.includes(roleId) ? childRoles : [...childRoles, roleId];
          return { ...a, roleIds: updatedRoles };
        }
        return a;
      });
    }

    dispatch({ type: 'UPDATE_WORKER', payload: { id: workerId, assignments: assigns } });
  };

  const remove = (id) => {
    dispatch({ type: 'DELETE_DEPARTMENT', payload: id });
    if (expandedDept === id) setExpandedDept(null);
  };

  const getWorkersForDept = (deptId) =>
    state.workers.filter((w) => (w.assignments || []).some((a) => a.deptId === deptId));

  const getWorkerRolesInDept = (worker, deptId) => {
    const a = (worker.assignments || []).find((a) => a.deptId === deptId);
    return a ? (a.roleIds || []) : [];
  };

  const isWorkerInDept = (workerId, deptId) => {
    const w = state.workers.find((w) => w.id === workerId);
    return w ? (w.assignments || []).some((a) => a.deptId === deptId) : false;
  };

  const getTotalNeeded = (dept) =>
    Object.values(dept.requirements || {}).reduce((s, n) => s + n, 0);

  const onDragStart = (idx) => setDragIdx(idx);
  const onDragOver = (e, idx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const items = [...sorted];
    const [moved] = items.splice(dragIdx, 1);
    items.splice(idx, 0, moved);
    dispatch({ type: 'REORDER_DEPARTMENTS', payload: items.map((d, i) => ({ ...d, priority: i + 1 })) });
    setDragIdx(idx);
  };
  const onDragEnd = () => setDragIdx(null);

  // ─── Features ───
  const addFeature = (deptId) => {
    if (!featureInput.trim()) return;
    const dept = state.departments.find((d) => d.id === deptId);
    if (!dept) return;
    const features = [...(dept.features || []), featureInput.trim()];
    dispatch({ type: 'UPDATE_DEPARTMENT', payload: { id: deptId, features } });
    setFeatureInput('');
  };

  const removeFeature = (deptId, idx) => {
    const dept = state.departments.find((d) => d.id === deptId);
    if (!dept) return;
    const features = (dept.features || []).filter((_, i) => i !== idx);
    dispatch({ type: 'UPDATE_DEPARTMENT', payload: { id: deptId, features } });
  };

  // ─── Render config panel (reused for parent and child) ───
  const renderDeptConfig = (dept, isChild) => {
    const reqs = dept.requirements || {};
    const features = dept.features || [];
    return (
      <div className="dept-expanded">
        {isChild && (
          <div className="child-note">{t('inheritedFromParent')}</div>
        )}

        {/* Features */}
        <div className="dept-section">
          <h4 className="dept-section-title"><Tag size={16} /> {t('features')}</h4>
          <div className="features-list">
            {features.map((f, i) => (
              <span key={i} className="feature-tag">
                {f}
                <button type="button" className="feature-remove" onClick={() => removeFeature(dept.id, i)}><X size={12} /></button>
              </span>
            ))}
            <form className="feature-add" onSubmit={(e) => { e.preventDefault(); addFeature(dept.id); }}>
              <input
                type="text"
                placeholder={t('addFeaturePlaceholder')}
                value={expandedDept === dept.id ? featureInput : ''}
                onChange={(e) => setFeatureInput(e.target.value)}
                className="input input-sm"
                onFocus={() => setExpandedDept(dept.id)}
              />
              <button type="submit" className="btn btn-sm" disabled={!featureInput.trim()}>
                <Plus size={14} />
              </button>
            </form>
          </div>
        </div>

        {roles.length > 0 && (
          <div className="dept-section">
            <h4 className="dept-section-title">{t('workersNeededPerRole')}</h4>
            <div className="role-requirements">
              {roles.map((role) => (
                <div key={role.id} className="role-req-row">
                  <span className="role-req-label"><strong>{role.name}</strong></span>
                  <div className="stepper">
                    <button type="button" className="stepper-btn" onClick={() => {
                      // Child: only update self. Parent: update self + children.
                      if (isChild) {
                        const num = (reqs[role.id] || 0) - 1;
                        if (num < 0) return;
                        dispatch({ type: 'UPDATE_DEPARTMENT', payload: { id: dept.id, requirements: { ...reqs, [role.id]: num } } });
                      } else {
                        updateRequirement(dept.id, role.id, (reqs[role.id] || 0) - 1);
                      }
                    }} disabled={(reqs[role.id] || 0) <= 0}>−</button>
                    <input type="number" min="0" className="stepper-input" value={reqs[role.id] || 0} onChange={(e) => {
                      if (isChild) {
                        const num = parseInt(e.target.value); if (isNaN(num) || num < 0) return;
                        dispatch({ type: 'UPDATE_DEPARTMENT', payload: { id: dept.id, requirements: { ...reqs, [role.id]: num } } });
                      } else {
                        updateRequirement(dept.id, role.id, e.target.value);
                      }
                    }} />
                    <button type="button" className="stepper-btn" onClick={() => {
                      if (isChild) {
                        dispatch({ type: 'UPDATE_DEPARTMENT', payload: { id: dept.id, requirements: { ...reqs, [role.id]: (reqs[role.id] || 0) + 1 } } });
                      } else {
                        updateRequirement(dept.id, role.id, (reqs[role.id] || 0) + 1);
                      }
                    }}>+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {state.workers.length > 0 && (
          <div className="dept-section">
            <h4 className="dept-section-title"><UserPlus size={16} /> {t('workersSection')}</h4>
            <div className="dept-worker-list">
              {state.workers.map((worker) => {
                const inDept = isWorkerInDept(worker.id, dept.id);
                const workerRoles = getWorkerRolesInDept(worker, dept.id);
                return (
                  <div key={worker.id} className={`dept-worker-item ${inDept ? 'dept-worker-item-active' : ''}`}>
                    <button type="button" className={`chip ${inDept ? 'chip-active' : ''}`} onClick={() => {
                      if (isChild) {
                        // Child: only toggle self
                        const w = state.workers.find((w) => w.id === worker.id);
                        if (!w) return;
                        const as = w.assignments || [];
                        const ex = as.find((a) => a.deptId === dept.id);
                        dispatch({ type: 'UPDATE_WORKER', payload: { id: worker.id, assignments: ex ? as.filter((a) => a.deptId !== dept.id) : [...as, { deptId: dept.id, roleIds: [] }] } });
                      } else {
                        toggleWorkerInDept(dept.id, worker.id);
                      }
                    }}>{worker.name}</button>
                    {inDept && roles.length > 0 && (
                      <div className="role-chips">
                        <span className="role-chips-label">{t('rolesLabel')}</span>
                        {roles.map((role) => (
                          <button key={role.id} type="button" className={`chip chip-sm ${workerRoles.includes(role.id) ? 'chip-role-active' : ''}`} onClick={() => {
                            if (isChild) {
                              // Child: only toggle self
                              const w = state.workers.find((w) => w.id === worker.id);
                              if (!w) return;
                              const a = (w.assignments || []).find((a) => a.deptId === dept.id);
                              if (!a) return;
                              const rids = a.roleIds || [];
                              const h = rids.includes(role.id);
                              dispatch({ type: 'UPDATE_WORKER', payload: { id: worker.id, assignments: (w.assignments || []).map((x) => x.deptId === dept.id ? { ...x, roleIds: h ? rids.filter((r) => r !== role.id) : [...rids, role.id] } : x) } });
                            } else {
                              toggleWorkerRole(dept.id, worker.id, role.id);
                            }
                          }}>{role.name}</button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('departmentsTitle')}</h1>
        <p className="subtitle">{t('departmentsSubtitle')}</p>
      </div>

      <form className="add-form" onSubmit={startAdd}>
        <input type="text" placeholder={t('deptNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} className="input" />
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}><Plus size={18} /> {t('addDept')}</button>
      </form>

      {showChildPrompt && (
        <div className="child-prompt">
          <div className="child-prompt-header">
            <strong>"{pendingParentName}"</strong> — {t('hasSubDepts')}
          </div>
          <div className="child-prompt-body">
            <button className="btn" onClick={addStandalone}>{t('justOne')}</button>
            <div className="child-prompt-or">{t('or')}</div>
            <div className="child-input-group">
              <input type="text" placeholder={t('subDeptPlaceholder')} value={childNames} onChange={(e) => setChildNames(e.target.value)} className="input" />
              <button className="btn btn-primary" onClick={addWithChildren} disabled={!childNames.trim()}><Plus size={16} /> {t('create')}</button>
            </div>
          </div>
        </div>
      )}

      {roles.length === 0 && sorted.length > 0 && (
        <div className="alert alert-warning">
          <span><Link to="/roles" style={{ color: 'inherit', fontWeight: 600 }}>{t('addRolesFirst')}</Link> {t('toConfigureReqs')}</span>
        </div>
      )}

      {sorted.length === 0 && !showChildPrompt ? (
        <div className="empty-state"><p>{t('noDepts')}</p></div>
      ) : (
        <div className="card-list">
          {sorted.map((dept, idx) => {
            const children = getChildren(dept.id);
            const hasChildren = children.length > 0;
            const isExpanded = expandedDept === dept.id;
            const deptWorkers = getWorkersForDept(dept.id);

            return (
              <div key={dept.id} className="dept-group">
                <div
                  className={`card card-vertical draggable ${dragIdx === idx ? 'dragging' : ''} ${hasChildren ? 'card-parent' : ''}`}
                  draggable={!isExpanded}
                  onDragStart={() => onDragStart(idx)}
                  onDragOver={(e) => onDragOver(e, idx)}
                  onDragEnd={onDragEnd}
                >
                  <div className="card-row">
                    <div className="card-grip"><GripVertical size={16} /></div>
                    <span className="priority-badge">{dept.priority}</span>
                    <div className="card-content card-clickable" onClick={() => setExpandedDept(isExpanded ? null : dept.id)}>
                      <div>
                        <span className="card-title">{dept.name}</span>
                        {(dept.features || []).length > 0 && (
                          <span className="feature-inline">{(dept.features || []).join(' · ')}</span>
                        )}
                        {hasChildren && <span className="badge badge-parent">{children.length} {t('subDeptsCount')}</span>}
                        <span className="card-meta"> · {getTotalNeeded(dept)} {t('totalNeeded')} · {deptWorkers.length} {t('workersLabel')}</span>
                      </div>
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                    <div className="card-actions">
                      <button className="btn-icon btn-danger" onClick={() => remove(dept.id)}><Trash2 size={15} /></button>
                    </div>
                  </div>

                  {isExpanded && (
                    <>
                      {renderDeptConfig(dept, false)}
                      {hasChildren && (
                        <div className="sync-hint">{t('autoSyncHint')}</div>
                      )}
                    </>
                  )}
                </div>

                {hasChildren && (
                  <div className="child-dept-list">
                    {children.map((child) => {
                      const childExpanded = expandedDept === child.id;
                      const childWorkers = getWorkersForDept(child.id);
                      return (
                        <div key={child.id} className="card card-vertical card-child">
                          <div className="card-row">
                            <div className="child-indent" />
                            <div className="card-content card-clickable" onClick={() => setExpandedDept(childExpanded ? null : child.id)}>
                              <div>
                                <span className="card-title">{child.name}</span>
                                {(child.features || []).length > 0 && (
                                  <span className="feature-inline">{(child.features || []).join(' · ')}</span>
                                )}
                                <span className="card-meta"> · {getTotalNeeded(child)} {t('totalNeeded')} · {childWorkers.length} {t('workersLabel')}</span>
                              </div>
                              {childExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </div>
                            <div className="card-actions">
                              <button className="btn-icon btn-danger" onClick={() => dispatch({ type: 'DELETE_DEPARTMENT', payload: child.id })}><Trash2 size={14} /></button>
                            </div>
                          </div>
                          {childExpanded && renderDeptConfig(child, true)}
                        </div>
                      );
                    })}
                    <button className="btn btn-sm add-child-btn" onClick={() => addChildToDept(dept.id)}>
                      <Plus size={14} /> {t('addSubDept')}
                    </button>
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
