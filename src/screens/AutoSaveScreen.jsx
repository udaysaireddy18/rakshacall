import { Card, Toggle } from '../components/ui.jsx';

export default function AutoSaveScreen({ settings, onChange, onNavigate }) {
  const autoSave = settings.autoSaveAll ?? settings.autoSaveUnsaved ?? false;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">Auto Save</h1>
          <p className="page-sub">
            Decide if live call checks should be recorded automatically when you stop them.
          </p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={() => onNavigate('history')}>
          View History
        </button>
      </div>

      <Card
        title="Record calls"
        subtitle="Only record when this option is turned on. If it's off, nothing gets saved."
      >
        <Toggle
          checked={autoSave}
          onChange={(value) => onChange({ autoSaveAll: value, autoSaveUnsaved: value })}
          label="Auto-save all live calls"
          hint="When enabled, every live call check is saved to History after you tap Stop. When disabled, no calls are saved at all."
        />
      </Card>

      <Card title="How it works" tone="muted">
        <ul className="rules rules--plain">
          <li>Go to <strong>Live call</strong> tab and start a check.</li>
          <li>Put call on speaker and let it analyze.</li>
          <li>Tap <strong>Stop check</strong> when done.</li>
          <li>If this is ON, it'll save to <strong>History</strong>. If OFF, it'll say "Check not saved".</li>
        </ul>
      </Card>

      <Card title="Tip">
        <p className="prose">
          Keep this <strong>OFF</strong> by default to avoid saving every test. Turn it <strong>ON</strong> only when you actually want to record suspicious calls.
        </p>
      </Card>
    </div>
  );
}
