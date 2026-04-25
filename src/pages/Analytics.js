import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useLang } from '../i18n/LangContext';

export default function Analytics() {
  const { state } = useApp();
  const { t } = useLang();
  const roles = useMemo(() => [...state.roles].sort((a, b) => a.priority - b.priority), [state.roles]);
  const depts = useMemo(() => [...state.departments].sort((a, b) => a.priority - b.priority), [state.departments]);

  // Build stats per worker
  const workerStats = useMemo(() => {
    const stats = {};
    for (const w of state.workers) {
      stats[w.id] = { name: w.name, totalShifts: 0, byRole: {}, byDept: {}, byShiftType: {}, dates: [] };
    }

    for (const shift of state.shifts) {
      const assign = shift.assignments || {};
      for (const deptId of Object.keys(assign)) {
        for (const roleId of Object.keys(assign[deptId])) {
          for (const wid of (assign[deptId][roleId] || [])) {
            if (!stats[wid]) continue;
            stats[wid].totalShifts++;
            stats[wid].byRole[roleId] = (stats[wid].byRole[roleId] || 0) + 1;
            stats[wid].byDept[deptId] = (stats[wid].byDept[deptId] || 0) + 1;
            stats[wid].byShiftType[shift.name] = (stats[wid].byShiftType[shift.name] || 0) + 1;
            if (!stats[wid].dates.includes(shift.date)) stats[wid].dates.push(shift.date);
          }
        }
      }
    }

    return Object.entries(stats)
      .map(([id, s]) => ({ id, ...s }))
      .sort((a, b) => b.totalShifts - a.totalShifts);
  }, [state]);

  // Department fill rates
  const deptStats = useMemo(() => {
    return depts.map((dept) => {
      let totalNeeded = 0;
      let totalFilled = 0;
      const roleBreakdown = [];

      for (const role of roles) {
        const needed = (dept.requirements || {})[role.id] || 0;
        if (needed === 0) continue;
        let filled = 0;
        for (const shift of state.shifts) {
          const da = (shift.assignments && shift.assignments[dept.id]) || {};
          filled += (da[role.id] || []).length;
          totalNeeded += needed;
          totalFilled += (da[role.id] || []).length;
        }
        roleBreakdown.push({ role: role.name, needed: needed * state.shifts.length, filled });
      }

      return {
        name: dept.name,
        totalNeeded,
        totalFilled,
        fillRate: totalNeeded > 0 ? Math.round((totalFilled / totalNeeded) * 100) : 100,
        roleBreakdown,
      };
    });
  }, [state, depts, roles]);

  const maxShifts = Math.max(1, ...workerStats.map((s) => s.totalShifts));
  const avgShifts = workerStats.length > 0 ? (workerStats.reduce((s, w) => s + w.totalShifts, 0) / workerStats.length) : 0;

  const getRoleName = (id) => state.roles.find((r) => r.id === id)?.name || '?';
  const getDeptName = (id) => state.departments.find((d) => d.id === id)?.name || '?';

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('analyticsTitle')}</h1>
        <p className="subtitle">{t('analyticsSubtitle')}</p>
      </div>

      {state.shifts.length === 0 ? (
        <div className="empty-state"><p>{t('noShiftsSaved')}</p></div>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{state.shifts.length}</div>
              <div className="stat-label">{t('totalShifts')}</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{avgShifts.toFixed(1)}</div>
              <div className="stat-label">{t('avgShiftsWorker')}</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{new Set(state.shifts.map((s) => s.date)).size}</div>
              <div className="stat-label">{t('daysCovered')}</div>
            </div>
          </div>

          <div className="section">
            <h2>{t('workloadBalance')}</h2>
            <p className="subtitle">{t('workloadSubtitle')}</p>
            <div className="bar-chart">
              {workerStats.map((ws) => (
                <div key={ws.id} className="bar-row">
                  <span className="bar-label">{ws.name}</span>
                  <div className="bar-track">
                    <div
                      className={`bar-fill ${ws.totalShifts > avgShifts * 1.3 ? 'bar-high' : ws.totalShifts < avgShifts * 0.7 ? 'bar-low' : ''}`}
                      style={{ width: `${(ws.totalShifts / maxShifts) * 100}%` }}
                    />
                  </div>
                  <span className="bar-value">{ws.totalShifts}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="section">
            <h2>{t('workerBreakdown')}</h2>
            <div className="analytics-table">
              <div className="analytics-header">
                <span>{t('tblWorker')}</span>
                <span>{t('tblShifts')}</span>
                <span>{t('tblTopRole')}</span>
                <span>{t('tblTopDept')}</span>
                <span>{t('tblMAN')}</span>
              </div>
              {workerStats.map((ws) => {
                const topRole = Object.entries(ws.byRole).sort((a, b) => b[1] - a[1])[0];
                const topDept = Object.entries(ws.byDept).sort((a, b) => b[1] - a[1])[0];
                return (
                  <div key={ws.id} className="analytics-row">
                    <span className="analytics-name">{ws.name}</span>
                    <span className="analytics-num">{ws.totalShifts}</span>
                    <span className="analytics-text">{topRole ? getRoleName(topRole[0]) : '—'}</span>
                    <span className="analytics-text">{topDept ? getDeptName(topDept[0]) : '—'}</span>
                    <span className="analytics-text">
                      {ws.byShiftType['Morning'] || 0} / {ws.byShiftType['Afternoon'] || 0} / {ws.byShiftType['Night'] || 0}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="section">
            <h2>{t('deptFillRates')}</h2>
            <div className="bar-chart">
              {deptStats.map((ds) => (
                <div key={ds.name} className="bar-row">
                  <span className="bar-label">{ds.name}</span>
                  <div className="bar-track">
                    <div
                      className={`bar-fill ${ds.fillRate >= 90 ? '' : ds.fillRate >= 70 ? 'bar-mid' : 'bar-low'}`}
                      style={{ width: `${ds.fillRate}%` }}
                    />
                  </div>
                  <span className="bar-value">{ds.fillRate}%</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
