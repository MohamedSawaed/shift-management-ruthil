import React from 'react';
import { useApp } from '../context/AppContext';
import { useLang } from '../i18n/LangContext';
import { useTheme } from '../lib/theme';
import { SHIFT_TYPES, shiftMeta, shiftLabel } from '../lib/shiftTypes';
import { Cloud, CloudOff, AlertTriangle, Clock, Palette, Monitor, Sun, Moon } from 'lucide-react';

// "9h 40m" between two HH:MM times, wrapping past midnight for night shifts.
function duration(start, end, he) {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (he) return m ? `${h} ש׳ ${m} ד׳` : `${h} שעות`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function Settings() {
  const { t, lang, setLang } = useLang();
  const { preference, setPreference } = useTheme();
  const { state, dispatch, syncStatus, lastSynced, cloudEnabled } = useApp();
  const shiftTimes = state.shiftTimes || {};

  const updateTime = (shiftType, field, value) => {
    dispatch({ type: 'UPDATE_SHIFT_TIMES', payload: { [shiftType]: { ...(shiftTimes[shiftType] || {}), [field]: value } } });
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
                <span className="hours-duration">{duration(tt.start, tt.end, lang === 'he')}</span>
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
              ? <><Cloud size={18} /> {t('liveSyncOn')}</>
              : <><CloudOff size={18} /> {t('cloudSyncUnavailable')}</>}
          </h2>
        </div>

        {cloudEnabled ? (
          <>
            <p className="panel-intro">{t('liveSyncIntro')}</p>
            <div className="sync-status-row">
              <span className={`sync-dot sync-dot-${syncStatus}`} />
              <span className="sync-status-text">
                {syncStatus === 'syncing' && t('syncing')}
                {syncStatus === 'idle' && lastSynced && `${t('lastSynced')} ${formatTime(lastSynced)}`}
                {syncStatus === 'idle' && !lastSynced && t('ready')}
                {syncStatus === 'error' && t('syncErrorMsg')}
              </span>
            </div>
          </>
        ) : (
          <div className="alert alert-warning">
            <AlertTriangle size={16} />
            <span>{t('cloudNotConfigured')}</span>
          </div>
        )}
      </section>
    </div>
  );
}
