import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useLang } from '../i18n/LangContext';
import { Users, Building2, BadgeCheck } from 'lucide-react';
import Workers from './Workers';
import Departments from './Departments';
import Roles from './Roles';

const TABS = [
  { id: 'workers', icon: Users, labelKey: 'navWorkers', hintKey: 'workersSubtitle', Component: Workers },
  { id: 'departments', icon: Building2, labelKey: 'navDepartments', hintKey: 'departmentsSubtitle', Component: Departments },
  { id: 'roles', icon: BadgeCheck, labelKey: 'navRoles', hintKey: 'rolesSubtitle', Component: Roles },
];

// Everything about the people and structure behind a shift, in one place.
export default function Team() {
  const { state } = useApp();
  const { t } = useLang();
  const [params, setParams] = useSearchParams();

  const counts = { workers: state.workers.length, departments: state.departments.length, roles: state.roles.length };
  // New workspaces start where setup starts: roles → departments → workers.
  const fallback = state.roles.length === 0 ? 'roles' : state.departments.length === 0 ? 'departments' : 'workers';
  const active = TABS.find((tab) => tab.id === params.get('tab')) || TABS.find((tab) => tab.id === fallback);
  const { Component } = active;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t('teamTitle')}</h1>
          <p className="subtitle">{t(active.hintKey)}</p>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label={t('teamTitle')}>
        {TABS.map(({ id, icon: Icon, labelKey }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active.id === id}
            className={`tab-btn ${active.id === id ? 'tab-btn-active' : ''}`}
            onClick={() => setParams({ tab: id }, { replace: true })}
          >
            <Icon size={16} />
            <span>{t(labelKey)}</span>
            <span className="tab-count">{counts[id]}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" className="tab-panel">
        <Component embedded />
      </div>
    </div>
  );
}
