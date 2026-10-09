import React from 'react';

// Initials avatar with a stable per-name hue, so the same worker always gets
// the same color everywhere in the app.
function hueFor(name) {
  // Members of one group ("הודים 1", "הודים 2") share the group's color.
  const base = name.replace(/\s+\d+$/, '');
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) % 360;
  return h;
}

function initialsFor(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  // Group members ("הודים 3") are told apart by their number.
  if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) return parts[parts.length - 1];
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({ name = '?', size = 'md' }) {
  return (
    <span className={`avatar avatar-${size}`} style={{ '--avatar-hue': hueFor(name) }} aria-hidden="true">
      {initialsFor(name)}
    </span>
  );
}
