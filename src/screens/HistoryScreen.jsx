import { Badge, Card, EmptyState } from '../components/ui.jsx';
import { formatDateTime, relativeTime, riskLabel, riskTone, verdictText } from '../lib/format.js';

export default function HistoryScreen({ calls, profiles, onNavigate }) {
  const sorted = [...calls].sort((a, b) => new Date(b.at) - new Date(a.at));
  const highRisk = calls.filter((c) => c.risk >= 65).length;
  const lastCheck = sorted[0];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">Call History</h1>
          <p className="page-sub">
            All saved live call checks from this device. Manage what gets recorded in Settings.
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => onNavigate('call')}>
          Start new check
        </button>
      </div>

      <div className="grid grid--3">
        <div className="stat">
          <span className="stat__label">Total checks</span>
          <span className="stat__value">{calls.length}</span>
          <span className="stat__hint">{lastCheck ? `Last: ${relativeTime(lastCheck.at)}` : 'No checks yet'}</span>
        </div>
        <div className="stat">
          <span className="stat__label">High risk</span>
          <span className="stat__value">{highRisk}</span>
          <span className="stat__hint">{highRisk ? 'Review flagged calls' : 'Nothing flagged'}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Family enrolled</span>
          <span className="stat__value">{profiles.length}</span>
          <span className="stat__hint">Used for voice matching</span>
        </div>
      </div>

      <Card
        title="Saved checks"
        subtitle="Every saved call check with verdict, risk score and context."
      >
        {sorted.length === 0 ? (
          <EmptyState
            title="No history yet"
            body="Run a live call check and stop it to save results here. You can control auto-save for unsaved numbers in Settings."
            action={
              <button type="button" className="btn btn--primary" onClick={() => onNavigate('call')}>
                Start live call check
              </button>
            }
          />
        ) : (
          <ul className="call-list">
            {sorted.map((call) => (
              <li key={call.id} className="call-list__item">
                <div className="call-list__main">
                  <span className="call-list__name">
                    {call.claimedName || 'Unknown caller'}
                    {call.fromUnsavedNumber ? (
                      <span className="muted-sm"> · From unsaved number</span>
                    ) : null}
                  </span>
                  <span className="call-list__meta">
                    {formatDateTime(call.at)} · {verdictText(call.verdict, call.claimedName || 'this person')}
                    {call.durationSec ? ` · ${call.durationSec}s` : ''}
                  </span>
                </div>
                <div className="row">
                  <Badge tone={riskTone(call.risk)}>{call.risk}/100 · {riskLabel(call.risk)}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Quick tips" tone="muted">
        <ul className="rules rules--plain">
          <li>Always verify money requests on a saved number with a safe word.</li>
          <li>If a call comes from an unsaved number asking for money/OTP, treat as high risk.</li>
          <li>Use Settings to enable auto-save for unsaved numbers if you want them recorded.</li>
        </ul>
      </Card>
    </div>
  );
}
