import { Badge, Card, EmptyState, Stat } from '../components/ui.jsx';
import { formatDateTime, relativeTime, riskLabel, riskTone, verdictText } from '../lib/format.js';

function ReadinessRing({ value, done, total }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className="viz-ring"
      role="img"
      aria-label={`Setup readiness ${pct} percent. ${done} of ${total} setup checks complete.`}
    >
      <svg viewBox="0 0 132 132" aria-hidden="true">
        <defs>
          <linearGradient id="readinessRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="55%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <circle className="viz-ring__track" cx="66" cy="66" r="52" />
        <circle
          className="viz-ring__value"
          cx="66"
          cy="66"
          r="52"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={100 - pct}
        />
      </svg>
      <div className="viz-ring__center">
        <strong>{pct}%</strong>
        <span>{done}/{total} ready</span>
      </div>
    </div>
  );
}

export default function GuardScreen({ profiles, calls, settings, onNavigate }) {
  const micAvailable = Boolean(navigator.mediaDevices?.getUserMedia);
  const recent = [...calls].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 6);
  const highRisk = calls.filter((c) => c.risk >= 65).length;
  const lastCheck = recent[0];

  const safeguards = [
    { label: 'Family voice enrolled', done: profiles.length > 0 },
    { label: 'Private safe word set', done: profiles.some((profile) => profile.safeWord) },
    { label: 'Microphone available', done: micAvailable },
  ];
  const safeguardsDone = safeguards.filter((item) => item.done).length;
  const readiness = Math.round((safeguardsDone / safeguards.length) * 100);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const week = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(startOfToday);
    day.setDate(startOfToday.getDate() - (6 - index));
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    return {
      key: day.toISOString().slice(0, 10),
      label: day.toLocaleDateString(undefined, { weekday: 'narrow' }),
      full: day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
      count: calls.filter((call) => {
        const at = new Date(call.at);
        return at >= day && at < next;
      }).length,
    };
  });
  const weekTotal = week.reduce((sum, day) => sum + day.count, 0);
  const weekMax = Math.max(1, ...week.map((day) => day.count));

  const lowRisk = calls.filter((call) => call.risk < 35).length;
  const carefulRisk = calls.filter((call) => call.risk >= 35 && call.risk < 65).length;
  const riskTotal = calls.length;

  return (
    <div className="stack">
      <section className="hero">
        <div className="hero__grid">
          <div className="hero__main">
            <span className="hero__eyebrow">Family voice guard</span>
            <h1 className="hero__title">
              Is this call <em>really</em> from your family?
            </h1>
            <p className="hero__body">
              Scammers call pretending to be your son, daughter or relative — sometimes using an AI copy of their voice.
              RakshaCall learns your family&apos;s real voices and warns you during the call, before you send any money.
            </p>
            <div className="hero__actions">
              <button type="button" className="btn btn--primary btn--lg" onClick={() => onNavigate('call')}>
                Start a live call check
              </button>
              <button type="button" className="btn btn--ghost btn--lg" onClick={() => onNavigate('lab')}>
                Check a recording
              </button>
            </div>
            <p className="hero__fine">
              Voice matching runs entirely on this device — recordings are never uploaded. Optional live transcription uses
              your browser&apos;s speech service; leave it off to stay fully offline.
            </p>
          </div>

          <aside className="hero__aside" aria-label="The ten second rule">
            <div className="hero__aside-head">
              <p className="hero__aside-kicker">If someone asks for money</p>
              <span className="hero__aside-live"><span className="dot" /> Quick rule</span>
            </div>
            <p className="hero__quote">“Hang up. Call them back on the number already saved in your phone.”</p>
            <ol className="hero__steps">
              <li><span>01</span> Hang up, even if they sound upset.</li>
              <li><span>02</span> Call back on the saved number.</li>
              <li><span>03</span> Ask the family safe word.</li>
            </ol>
            <span className="hero__stamp">Voice check · on device</span>
          </aside>
        </div>
      </section>

      <div className="grid grid--3">
        <Stat label="Family voices enrolled" value={profiles.length} hint={profiles.length ? 'Ready to compare' : 'Add at least one'} />
        <Stat label="Checks done" value={calls.length} hint={lastCheck ? `Last: ${relativeTime(lastCheck.at)}` : 'No checks yet'} />
        <Stat
          label="High-risk calls caught"
          value={highRisk}
          hint={highRisk ? 'Review them in the list below' : 'Nothing flagged'}
        />
      </div>

      <Card
        className="viz-card"
        title="Signal overview"
        subtitle="Real numbers from this device — nothing is uploaded."
        actions={<Badge tone="accent">Local data</Badge>}
      >
        <div className="viz-grid">
          <section className="viz-panel viz-panel--readiness" aria-labelledby="viz-readiness-title">
            <div className="viz-panel__head">
              <div>
                <p className="viz-panel__label" id="viz-readiness-title">Setup readiness</p>
                <p className="viz-panel__sub">{safeguardsDone} of {safeguards.length} setup checks</p>
              </div>
              <span className="viz-panel__tag">{readiness === 100 ? 'Complete' : 'Set up'}</span>
            </div>
            <ReadinessRing value={readiness} done={safeguardsDone} total={safeguards.length} />
            <ul className="viz-checks">
              {safeguards.map((item) => (
                <li key={item.label} className={item.done ? 'is-done' : ''}>
                  <span className="viz-checks__dot" aria-hidden="true" />
                  {item.label}
                </li>
              ))}
            </ul>
          </section>

          <section className="viz-panel viz-panel--activity" aria-labelledby="viz-activity-title">
            <div className="viz-panel__head">
              <div>
                <p className="viz-panel__label" id="viz-activity-title">Last 7 days</p>
                <p className="viz-panel__sub">
                  {weekTotal} check{weekTotal === 1 ? '' : 's'} recorded
                </p>
              </div>
              <span className="viz-panel__tag">{weekTotal ? 'Logged' : 'No checks'}</span>
            </div>
            <div
              className="viz-bars"
              role="img"
              aria-label={`${weekTotal} checks in the last seven days. ${week
                .map((day) => `${day.full}: ${day.count}`)
                .join('. ')}.`}
            >
              {week.map((day, index) => (
                <div className="viz-bars__col" key={day.key} title={`${day.full}: ${day.count} check${day.count === 1 ? '' : 's'}`}>
                  <span className="viz-bars__count">{day.count || ''}</span>
                  <div className="viz-bars__track">
                    <span
                      className={`viz-bars__bar ${day.count ? '' : 'is-empty'}`.trim()}
                      style={{
                        height: day.count ? `${Math.max(12, Math.round((day.count / weekMax) * 100))}%` : '4px',
                        animationDelay: `${index * 40}ms`,
                      }}
                    />
                  </div>
                  <span className="viz-bars__label">{day.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="viz-panel viz-panel--risk" aria-labelledby="viz-risk-title">
            <div className="viz-panel__head">
              <div>
                <p className="viz-panel__label" id="viz-risk-title">Risk mix</p>
                <p className="viz-panel__sub">
                  {riskTotal} saved check{riskTotal === 1 ? '' : 's'}
                </p>
              </div>
              <span className="viz-panel__tag">
                {riskTotal === 0 ? 'No data' : highRisk ? 'Review' : 'No high flags'}
              </span>
            </div>
            <div className="viz-risk">
              <div
                className="viz-risk__track"
                role="img"
                aria-label={`Risk mix across ${riskTotal} saved checks: ${lowRisk} low, ${carefulRisk} careful, ${highRisk} high.`}
              >
                {riskTotal === 0 ? (
                  <span className="viz-risk__empty" />
                ) : (
                  <>
                    {lowRisk > 0 && (
                      <span className="viz-risk__seg is-low" style={{ width: `${(lowRisk / riskTotal) * 100}%` }} />
                    )}
                    {carefulRisk > 0 && (
                      <span className="viz-risk__seg is-careful" style={{ width: `${(carefulRisk / riskTotal) * 100}%` }} />
                    )}
                    {highRisk > 0 && (
                      <span className="viz-risk__seg is-high" style={{ width: `${(highRisk / riskTotal) * 100}%` }} />
                    )}
                  </>
                )}
              </div>
              <ul className="viz-risk__legend">
                <li><span className="viz-risk__swatch is-low" aria-hidden="true" /> Low risk <strong>{lowRisk}</strong></li>
                <li><span className="viz-risk__swatch is-careful" aria-hidden="true" /> Be careful <strong>{carefulRisk}</strong></li>
                <li><span className="viz-risk__swatch is-high" aria-hidden="true" /> High risk <strong>{highRisk}</strong></li>
              </ul>
              <p className="viz-risk__foot">
                {lastCheck
                  ? `Last check: ${Math.round(lastCheck.risk)}/100 · ${riskLabel(lastCheck.risk)}`
                  : 'No checks saved yet. Run a live check to fill this view.'}
              </p>
            </div>
          </section>
        </div>
      </Card>

      <div className="grid grid--2">
        <Card title="Recent checks" subtitle="Every live check you finish is saved here on this device.">
          {recent.length === 0 ? (
            <EmptyState
              title="No checks yet"
              body="Run a live call check or test a recording to see results here."
              action={
                <button type="button" className="btn btn--primary" onClick={() => onNavigate('call')}>
                  Start now
                </button>
              }
            />
          ) : (
            <ul className="call-list">
              {recent.map((call) => (
                <li key={call.id} className="call-list__item">
                  <div className="call-list__main">
                    <span className="call-list__name">{call.claimedName || 'Unknown caller'}</span>
                    <span className="call-list__meta">
                      {formatDateTime(call.at)} · {verdictText(call.verdict, call.claimedName || 'this person')}
                    </span>
                  </div>
                  <Badge tone={riskTone(call.risk)}>{call.risk}/100</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Before you send money" subtitle="Four rules that stop most family-impersonation scams.">
          <ol className="rules">
            <li>
              <strong>Hang up and call back.</strong> Use the number already saved in your phone — never the number the
              caller gives you.
            </li>
            <li>
              <strong>Ask your family safe word.</strong> Set one private word per person in Family Circle.
            </li>
            <li>
              <strong>Never share OTP, PIN or card details.</strong> No real bank, police officer or relative needs them.
            </li>
            <li>
              <strong>Secrecy is a red flag.</strong> “Don&apos;t tell anyone” is a script used to keep you isolated.
            </li>
          </ol>
          <p className="note">
            If money was already sent, report immediately: <strong>cybercrime.gov.in</strong> or call{' '}
            <strong>1930</strong> (India).
          </p>
        </Card>
      </div>

      <Card title="How it works" subtitle="Three steps, all on your device.">
        <div className="steps">
          <div className="step">
            <span className="step__num">1</span>
            <h3>Enrol your family</h3>
            <p>Record 10 seconds of a relative speaking. The app stores a mathematical voiceprint — not the audio.</p>
            <button type="button" className="btn btn--link" onClick={() => onNavigate('family')}>
              Open Family Circle
            </button>
          </div>
          <div className="step">
            <span className="step__num">2</span>
            <h3>Check the call</h3>
            <p>
              Put the call on speaker. RakshaCall compares the caller&apos;s voice with the enrolled relative and reads
              the transcript for scam patterns.
            </p>
          </div>
          <div className="step">
            <span className="step__num">3</span>
            <h3>Verify out-of-band</h3>
            <p>
              One tap calls the relative on their saved number or alerts a guardian. Your safe word settles it in
              seconds.
            </p>
          </div>
        </div>
      </Card>

      <Card title="Setup status" tone="muted">
        <ul className="checklist">
          <li className={profiles.length ? 'is-done' : ''}>
            {profiles.length ? `${profiles.length} family voice${profiles.length === 1 ? '' : 's'} enrolled` : 'Enrol at least one family voice'}
          </li>
          <li className={micAvailable ? 'is-done' : 'is-warn'}>
            {micAvailable ? 'Microphone available in this browser' : 'This browser cannot access the microphone'}
          </li>
          <li className={profiles.some((p) => p.safeWord) ? 'is-done' : 'is-warn'}>
            {profiles.some((p) => p.safeWord) ? 'At least one safe word set' : 'Add a private safe word for each person'}
          </li>
          <li className="is-done">Sensitivity: {settings.sensitivity}</li>
        </ul>
      </Card>
    </div>
  );
}
