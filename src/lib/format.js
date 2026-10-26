/** Small formatting helpers shared by the screens. */

export function relativeTime(isoString) {
  if (!isoString) return '';
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(then).toLocaleDateString();
}

export function formatDateTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';
}

export const percent = (value, digits = 0) => `${(Number(value || 0) * 100).toFixed(digits)}%`;

export const telHref = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;

export const smsHref = (phone, body) =>
  `sms:${String(phone || '').replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(body || '')}`;

export function riskTone(score) {
  if (score >= 65) return 'danger';
  if (score >= 35) return 'warn';
  return 'ok';
}

export function riskLabel(score) {
  if (score >= 65) return 'High risk';
  if (score >= 35) return 'Be careful';
  return 'Low risk';
}

export function verdictText(verdict, name = 'this person') {
  if (verdict === 'match') return `Sounds like ${name}`;
  if (verdict === 'uncertain') return `Not sure it is ${name}`;
  if (verdict === 'mismatch') return `Does not sound like ${name}`;
  return 'No voice sample to compare';
}
