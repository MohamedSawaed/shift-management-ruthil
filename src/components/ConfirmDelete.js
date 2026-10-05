import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useLang } from '../i18n/LangContext';

// Trash icon that asks "Delete? Yes / No" in place before deleting, instead of
// deleting on the first click.
export default function ConfirmDelete({ onConfirm, size = 15, label }) {
  const { t } = useLang();
  const [asking, setAsking] = useState(false);
  if (asking) {
    return (
      <span className="confirm-inline">
        <span>{label || t('deleteConfirm')}</span>
        <button type="button" className="btn btn-sm btn-danger-solid" onClick={() => { setAsking(false); onConfirm(); }}>{t('yes')}</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAsking(false)}>{t('no')}</button>
      </span>
    );
  }
  return (
    <button type="button" className="btn-icon btn-danger" onClick={() => setAsking(true)} aria-label={t('delete')} title={t('delete')}>
      <Trash2 size={size} />
    </button>
  );
}
