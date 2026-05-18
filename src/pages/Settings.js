import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useLang } from '../i18n/LangContext';
import { normalizeSyncCode } from '../lib/supabase';
import { Cloud, CloudOff, Copy, Check, AlertTriangle, Smartphone, Plus, LogOut } from 'lucide-react';

export default function Settings() {
  const { t } = useLang();
  const { syncCode, syncStatus, lastSynced, createNewSyncCode, connectToSyncCode, disconnectSync, cloudEnabled } = useApp();
  const [inputCode, setInputCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const handleCopy = () => {
    if (!syncCode) return;
    navigator.clipboard.writeText(syncCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreate = async () => {
    setCreating(true);
    await createNewSyncCode();
    setCreating(false);
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    setConnectError('');
    setConnecting(true);
    const normalized = normalizeSyncCode(inputCode);
    const result = await connectToSyncCode(normalized);
    setConnecting(false);
    if (result.ok) {
      setInputCode('');
    } else {
      setConnectError(result.error === 'not_found' ? t('syncNotFound') : t('syncNetworkError'));
    }
  };

  const formatTime = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('settingsTitle')}</h1>
        <p className="subtitle">{t('settingsSubtitle')}</p>
      </div>

      <div className="section">
        <h2>
          {cloudEnabled
            ? (syncCode ? <><Cloud size={20} /> {t('cloudSyncActive')}</> : <><CloudOff size={20} /> {t('cloudSyncOff')}</>)
            : <><CloudOff size={20} /> {t('cloudSyncUnavailable')}</>}
        </h2>

        {!cloudEnabled && (
          <div className="alert alert-warning">
            <AlertTriangle size={16} />
            <span>{t('cloudNotConfigured')}</span>
          </div>
        )}

        {cloudEnabled && !syncCode && (
          <div className="sync-empty">
            <p className="subtitle">{t('syncIntro')}</p>
            <div className="sync-actions">
              <button className="btn btn-primary btn-lg" onClick={handleCreate} disabled={creating}>
                <Plus size={18} /> {creating ? t('creating') : t('createSyncCode')}
              </button>
            </div>

            <div className="sync-divider"><span>{t('or')}</span></div>

            <form className="sync-connect" onSubmit={handleConnect}>
              <label className="label">{t('haveCodeAlready')}</label>
              <div className="sync-input-row">
                <input
                  type="text"
                  className="input sync-code-input"
                  placeholder="ABCD-EFGH"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  maxLength={9}
                />
                <button type="submit" className="btn btn-primary" disabled={!inputCode.trim() || connecting}>
                  <Smartphone size={16} /> {connecting ? t('connecting') : t('connect')}
                </button>
              </div>
              {connectError && <div className="hint" style={{ color: 'var(--danger)' }}>{connectError}</div>}
            </form>
          </div>
        )}

        {cloudEnabled && syncCode && (
          <>
            <div className="sync-code-display">
              <div className="sync-code-label">{t('yourSyncCode')}</div>
              <div className="sync-code-value">{syncCode}</div>
              <button className="btn btn-sm" onClick={handleCopy}>
                {copied ? <><Check size={14} /> {t('copied')}</> : <><Copy size={14} /> {t('copy')}</>}
              </button>
            </div>

            <div className="sync-status-row">
              <span className={`sync-dot sync-dot-${syncStatus}`} />
              <span className="sync-status-text">
                {syncStatus === 'syncing' && t('syncing')}
                {syncStatus === 'idle' && lastSynced && `${t('lastSynced')} ${formatTime(lastSynced)}`}
                {syncStatus === 'idle' && !lastSynced && t('ready')}
                {syncStatus === 'error' && t('syncErrorMsg')}
              </span>
            </div>

            <div className="sync-instructions">
              <h4>{t('howToSync')}</h4>
              <ol>
                <li>{t('syncStep1')}</li>
                <li>{t('syncStep2')}</li>
                <li>{t('syncStep3')}</li>
              </ol>
            </div>

            {!confirmDisconnect ? (
              <button className="btn btn-sm btn-danger" onClick={() => setConfirmDisconnect(true)} style={{ marginTop: '1rem' }}>
                <LogOut size={14} /> {t('disconnect')}
              </button>
            ) : (
              <div className="alert alert-warning" style={{ marginTop: '1rem' }}>
                <span>{t('disconnectWarn')}</span>
                <button className="btn btn-sm btn-danger" onClick={() => { disconnectSync(); setConfirmDisconnect(false); }}>
                  {t('yes')}
                </button>
                <button className="btn btn-sm" onClick={() => setConfirmDisconnect(false)}>
                  {t('no')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
