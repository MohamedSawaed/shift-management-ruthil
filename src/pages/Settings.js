import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useLang } from '../i18n/LangContext';
import { useTheme } from '../lib/theme';
import { SHIFT_TYPES, shiftMeta, shiftLabel } from '../lib/shiftTypes';
import { normalizeSyncCode } from '../lib/supabase';
import { Cloud, CloudOff, Copy, Check, AlertTriangle, Smartphone, Plus, LogOut, Clock, Palette, Monitor, Sun, Moon } from 'lucide-react';

// "9h 40m" between two HH:MM times, wrapping past midnight for night shifts.
function duration(start, end) {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function Settings() {
  const { t, lang, setLang } = useLang();
  const { preference, setPreference } = useTheme();
  const { state, dispatch, syncCode, syncStatus, lastSynced, createNewSyncCode, connectToSyncCode, disconnectSync, cloudEnabled } = useApp();
  const [inputCode, setInputCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const shiftTimes = state.shiftTimes || {};

  const updateTime = (shiftType, field, value) => {
    dispatch({ type: 'UPDATE_SHIFT_TIMES', payload: { [shiftType]: { ...(shiftTimes[shiftType] || {}), [field]: value } } });
  };

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

  const themeOptions = [
    { value: 'system', icon: Monitor, label: t('themeSystem') },
    { value: 'light', icon: Sun, label: t('lightMode') },
    { value: 'dark', icon: Moon, label: t('darkMode') },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t('settingsTitle')}</h1>
          <p className="subtitle">{t('settingsSubtitle')}</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2><Clock size={18} /> {t('shiftTimes')}</h2>
        </div>
        <p className="panel-intro">{t('shiftTimesIntro')}</p>
        <div className="hours-list">
          {SHIFT_TYPES.map((st) => {
            const meta = shiftMeta(st);
            const Icon = meta.icon;
            const tt = shiftTimes[st] || {};
            return (
              <div key={st} className={`hours-row tone-${meta.tone}`}>
                <span className="tone-icon"><Icon size={16} /></span>
                <span className="hours-name">{shiftLabel(t, st)}</span>
                <div className="hours-inputs">
                  <input type="time" className="input input-time" aria-label={`${shiftLabel(t, st)} start`} value={tt.start || ''} onChange={(e) => updateTime(st, 'start', e.target.value)} />
                  <span className="hours-sep">–</span>
                  <input type="time" className="input input-time" aria-label={`${shiftLabel(t, st)} end`} value={tt.end || ''} onChange={(e) => updateTime(st, 'end', e.target.value)} />
                </div>
                <span className="hours-duration">{duration(tt.start, tt.end)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2><Palette size={18} /> {t('appearance')}</h2>
        </div>
        <div className="setting-row">
          <span className="setting-label">{t('theme')}</span>
          <div className="segmented" role="radiogroup" aria-label={t('theme')}>
            {themeOptions.map(({ value, icon: Icon, label }) => (
              <button key={value} type="button" role="radio" aria-checked={preference === value} className={`segment ${preference === value ? 'segment-active' : ''}`} onClick={() => setPreference(value)}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <span className="setting-label">{t('language')}</span>
          <div className="segmented" role="radiogroup" aria-label={t('language')}>
            <button type="button" role="radio" aria-checked={lang === 'en'} className={`segment ${lang === 'en' ? 'segment-active' : ''}`} onClick={() => setLang('en')}>English</button>
            <button type="button" role="radio" aria-checked={lang === 'he'} className={`segment ${lang === 'he' ? 'segment-active' : ''}`} onClick={() => setLang('he')}>עברית</button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>
            {cloudEnabled
              ? (syncCode ? <><Cloud size={18} /> {t('cloudSyncActive')}</> : <><CloudOff size={18} /> {t('cloudSyncOff')}</>)
              : <><CloudOff size={18} /> {t('cloudSyncUnavailable')}</>}
          </h2>
        </div>

        {!cloudEnabled && (
          <div className="alert alert-warning">
            <AlertTriangle size={16} />
            <span>{t('cloudNotConfigured')}</span>
          </div>
        )}

        {cloudEnabled && !syncCode && (
          <div className="sync-empty">
            <p className="panel-intro">{t('syncIntro')}</p>
            <div className="sync-actions">
              <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
                <Plus size={18} /> {creating ? t('creating') : t('createSyncCode')}
              </button>
            </div>

            <div className="sync-divider"><span>{t('or')}</span></div>

            <form className="sync-connect" onSubmit={handleConnect}>
              <label className="label" htmlFor="sync-code-input">{t('haveCodeAlready')}</label>
              <div className="sync-input-row">
                <input
                  id="sync-code-input"
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
              {connectError && <div className="hint hint-danger">{connectError}</div>}
            </form>
          </div>
        )}

        {cloudEnabled && syncCode && (
          <>
            <div className="sync-code-display">
              <div>
                <div className="sync-code-label">{t('yourSyncCode')}</div>
                <div className="sync-code-value">{syncCode}</div>
              </div>
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
              <button className="btn btn-sm btn-danger" onClick={() => setConfirmDisconnect(true)}>
                <LogOut size={14} /> {t('disconnect')}
              </button>
            ) : (
              <div className="alert alert-warning">
                <span>{t('disconnectWarn')}</span>
                <div className="alert-actions">
                  <button className="btn btn-sm btn-danger" onClick={() => { disconnectSync(); setConfirmDisconnect(false); }}>
                    {t('yes')}
                  </button>
                  <button className="btn btn-sm" onClick={() => setConfirmDisconnect(false)}>
                    {t('no')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
