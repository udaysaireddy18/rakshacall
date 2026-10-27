import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Card, LevelMeter, ScoreBar, Modal, Stat, Waveform } from '../components/ui.jsx';
import { analyseSamples } from '../lib/dsp.js';
import {
  applySensitivity,
  identityVerdict,
  scoreSimilarity,
  syntheticHeuristic,
} from '../lib/voiceprint.js';
import { scoreTranscript, EXAMPLE_SCRIPTS } from '../lib/scamPhrases.js';
import { fuseRisk } from '../lib/risk.js';
import { startLiveCapture, createSpeechRecognizer, speechSupported, playAlarm, vibrate } from '../lib/audio.js';
import { riskLabel, riskTone, telHref, smsHref, verdictText } from '../lib/format.js';

const EMPTY_STATE = {
  live: null,
  status: 'idle', // idle | starting | listening | no-speech | error
};

export default function LiveCallScreen({ profiles, settings, onSaveCall, notify, onNavigate }) {
  const [claimedId, setClaimedId] = useState(profiles[0]?.id || '');
  const [live, setLive] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState('');
  const [newNumber, setNewNumber] = useState(false);
  const [useSpeech, setUseSpeech] = useState(false);
  const [speechActive, setSpeechActive] = useState(false);
  const [analyser, setAnalyser] = useState(null);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [verifyOpen, setVerifyOpen] = useState(false);

  const captureRef = useRef(null);
  const intervalRef = useRef(null);
  const recognizerRef = useRef(null);
  const claimedIdRef = useRef(claimedId);
  const transcriptRef = useRef('');
  const newNumberRef = useRef(false);
  const liveRef = useRef(null);
  const lastBandRef = useRef('low');
  const startedAtRef = useRef(0);
  const tickRef = useRef(null);

  const claimedProfile = profiles.find((p) => p.id === claimedId) || null;

  useEffect(() => { claimedIdRef.current = claimedId; }, [claimedId]);
  useEffect(() => { newNumberRef.current = newNumber; }, [newNumber]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  useEffect(() => {
    if (profiles.length && !profiles.some((p) => p.id === claimedId)) {
      setClaimedId(profiles[0].id);
    }
  }, [profiles, claimedId]);

  const teardown = useCallback(() => {
    clearInterval(intervalRef.current);
    clearInterval(tickRef.current);
    intervalRef.current = null;
    tickRef.current = null;
    try { recognizerRef.current?.stop(); } catch { /* ignore */ }
    recognizerRef.current = null;
    setSpeechActive(false);
    try { captureRef.current?.stop(); } catch { /* ignore */ }
    captureRef.current = null;
    setAnalyser(null);
    setLevel(0);
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const analyseNow = useCallback(() => {
    const capture = captureRef.current;
    if (!capture) return;
    const windowSec = settings.liveWindowSec || 3;
    const samples = capture.getWindow(windowSec);
    if (samples.length < 16000 * 1.2) return;

    let parsed;
    try {
      parsed = analyseSamples(samples, 16000);
    } catch (error) {
      console.error('[rakshacall] live analysis failed', error);
      return;
    }
    const { summary, frameData } = parsed;
    if (!summary || summary.speechRatio < 0.08) {
      setStatus('no-speech');
      return;
    }
    setStatus('listening');

    const profile = profiles.find((p) => p.id === claimedIdRef.current) || null;
    const identity = { claimed: Boolean(profile), name: profile?.name || 'this person' };

    if (profile) {
      const similarity = scoreSimilarity(profile.summary, summary);
      const thresholds = applySensitivity(profile.thresholds, settings.sensitivity);
      identity.similarity = similarity.overall;
      identity.breakdown = similarity;
      identity.thresholds = thresholds;
      identity.verdict = identityVerdict(similarity.overall, thresholds);
    }

    const artifacts = syntheticHeuristic(summary, frameData);
    const script = scoreTranscript(transcriptRef.current);
    const hasMoney = script.categories?.some((c) => c.category === 'money' || c.category === 'paymentRail');
    const hasUrgency = script.categories?.some((c) => c.category === 'urgency' || c.category === 'emotional');

    const result = fuseRisk({
      identity,
      script,
      artifacts,
      context: { newNumber: newNumberRef.current, moneyRequest: Boolean(hasMoney), urgency: Boolean(hasUrgency) },
    });

    const payload = { ...result, identity, script, artifacts, summary, at: new Date().toISOString() };
    liveRef.current = payload;
    setLive(payload);

    if (result.band.id === 'high' && lastBandRef.current !== 'high') {
      if (settings.soundAlerts) playAlarm();
      vibrate([200, 100, 200]);
    }
    lastBandRef.current = result.band.id;
  }, [profiles, settings]);

  const start = async () => {
    setError('');
    setLive(null);
    liveRef.current = null;
    lastBandRef.current = 'low';
    setStatus('starting');
    setTranscript('');
    transcriptRef.current = '';
    setElapsed(0);

    try {
      const capture = await startLiveCapture({ onLevel: setLevel });
      captureRef.current = capture;
      setAnalyser(capture.analyser);
      startedAtRef.current = Date.now();
      setStatus('listening');

      intervalRef.current = setInterval(analyseNow, settings.liveIntervalMs || 2600);
      tickRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 500);

      if (useSpeech && speechSupported()) {
        const recognizer = createSpeechRecognizer({
          lang: settings.asrLang,
          onText: (text) => {
            setTranscript(text);
            transcriptRef.current = text;
          },
          onError: (message) => setError(message),
          onStateChange: setSpeechActive,
        });
        recognizerRef.current = recognizer;
        recognizer?.start();
      }
    } catch (err) {
      setStatus('error');
      setError(
        err?.name === 'NotAllowedError'
          ? 'Microphone permission was blocked. Allow microphone access for this site, then press Start again.'
          : `Could not start the microphone: ${err?.message || err}`
      );
    }
  };

  const stop = () => {
    const snapshot = liveRef.current;
    teardown();
    setStatus('idle');
    setElapsed(0);

    if (snapshot) {
      const autoSaveAll = settings.autoSaveAll ?? settings.autoSaveUnsaved ?? false;
      if (autoSaveAll) {
        onSaveCall({
          at: snapshot.at,
          claimedId: claimedIdRef.current,
          claimedName: claimedProfile?.name || 'Unknown caller',
          verdict: snapshot.identity?.verdict || 'unknown',
          similarity: snapshot.identity?.similarity ?? null,
          risk: snapshot.score,
          spoof: snapshot.artifactScore,
          script: snapshot.scriptScore,
          headline: snapshot.headline,
          reasons: snapshot.reasons,
          advice: snapshot.advice,
          durationSec: Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
          fromUnsavedNumber: newNumberRef.current,
        });
        notify?.('Check saved to your device.');
      } else {
        notify?.('Check not saved (auto-save disabled).');
      }
    }
    liveRef.current = null;
  };

  const loadExample = () => {
    const text = EXAMPLE_SCRIPTS[0].text;
    setTranscript(text);
    transcriptRef.current = text;
    notify?.('Example scam line loaded into the transcript.');
  };

  const running = status === 'starting' || status === 'listening' || status === 'no-speech';

  const bandTone = live ? (live.band.id === 'high' ? 'danger' : live.band.id === 'caution' ? 'warn' : 'ok') : 'neutral';

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">Live call check</h1>
          <p className="page-sub">
            Put the suspicious call on speaker and press Start. The app listens, compares the voice with the enrolled
            relative and reads the conversation for scam patterns.
          </p>
        </div>
        {profiles.length === 0 && (
          <button type="button" className="btn btn--primary" onClick={() => onNavigate('family')}>
            Enrol a family voice first
          </button>
        )}
      </div>

      <Card title="Who is claiming to call?" subtitle="Pick the person the caller says they are. Without this, only scam-script checks are possible.">
        <div className="row">
          <select
            className="select"
            value={claimedId}
            onChange={(event) => setClaimedId(event.target.value)}
            disabled={running}
          >
            <option value="">Unknown / I am not sure</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
                {profile.relation ? ` (${profile.relation})` : ''}
              </option>
            ))}
          </select>
          <label className="checkline">
            <input type="checkbox" checked={newNumber} onChange={(event) => setNewNumber(event.target.checked)} />
            Call is from a number I have not saved
          </label>
        </div>

        {!claimedProfile && profiles.length > 0 && (
          <p className="note note--warn">
            No voice selected, so the app cannot check whether the caller really is your relative. It will still flag
            scam scripts.
          </p>
        )}
        {profiles.length === 0 && (
          <p className="note note--warn">
            You have no enrolled family voices yet. Scam-script detection still works, but voice matching needs at least
            one enrolment.
          </p>
        )}
      </Card>

      <Card
        title="Microphone"
        subtitle="Audio is analysed in memory and never stored. Live transcription, if enabled, is handled by your browser."
        actions={
          <button type="button" className={`btn ${running ? 'btn--danger' : 'btn--primary'} btn--lg`} onClick={running ? stop : start}>
            {running ? 'Stop check' : 'Start listening'}
          </button>
        }
      >
        <div className="live-top">
          <div className="live-top__status">
            <Badge tone={status === 'listening' ? 'ok' : status === 'no-speech' ? 'warn' : status === 'error' ? 'danger' : 'neutral'} big>
              {status === 'starting' && 'Starting microphone…'}
              {status === 'listening' && 'Listening'}
              {status === 'no-speech' && 'Listening — no clear speech yet'}
              {status === 'idle' && 'Not listening'}
              {status === 'error' && 'Microphone error'}
            </Badge>
            <div className="live-top__meta">
              <Stat label="Duration" value={`${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`} />
              <Stat label="Speech-to-text" value={useSpeech && speechSupported() ? (speechActive ? 'On' : 'Off') : 'Off'} />
              {live?.identity?.similarity != null && (
                <Stat label="Voice match" value={`${Math.round(live.identity.similarity * 100)}%`} />
              )}
            </div>
          </div>
          <LevelMeter level={level} tone={level > 0.03 ? 'ok' : 'warn'} />
        </div>

        <Waveform analyser={analyser} height={120} color={running ? '#a78bfa' : '#6f769b'} label={running ? 'Live microphone' : 'Idle'} />

        {error && <p className="notice notice--danger">{error}</p>}

        {!speechSupported() && (
          <p className="note note--warn">
            This browser cannot transcribe speech live. Type what the caller says in the transcript box below and the
            script check will still work. (Chrome or Edge support live transcription.)
          </p>
        )}
      </Card>

      {/* main verdict */}
      {live ? (
        <>
          <section className={`verdict verdict--${bandTone} verdict--big`} aria-live="polite">
            <span className="verdict__eyebrow">Live result</span>
            <h2 className="verdict__title">{live.headline}</h2>
            <p className="verdict__body">{live.advice?.[0]}</p>
            <div className="verdict__footer">
              <span className="verdict__score">{live.score}<small>/100</small></span>
              <Badge tone={bandTone} big>{riskLabel(live.score)}</Badge>
              {live.identity.verdict && (
                <Badge tone={bandTone} big>{verdictText(live.identity.verdict, live.identity.name)}</Badge>
              )}
            </div>
          </section>

          <div className="grid grid--2">
            <Card title="What the app heard and measured">
              <div className="bars">
                <ScoreBar
                  label="Voice match with claimed person"
                  value={live.identity.similarity != null ? live.identity.similarity * 100 : 0}
                  tone={live.identity.verdict === 'match' ? 'green' : live.identity.verdict === 'uncertain' ? 'amber' : 'red'}
                  hint={
                    live.identity.similarity != null
                      ? live.identity.verdict === 'match'
                        ? `Above the ${Math.round(live.identity.thresholds.match * 100)}% match line`
                        : live.identity.verdict === 'uncertain'
                          ? `Between unsure (${Math.round(live.identity.thresholds.uncertain * 100)}%) and match (${Math.round(live.identity.thresholds.match * 100)}%)`
                          : `Below the ${Math.round(live.identity.thresholds.match * 100)}% match line`
                      : 'No enrolled voice selected'
                  }
                />
                <ScoreBar
                  label="Scam script risk"
                  value={live.scriptScore}
                  tone={live.scriptScore >= 60 ? 'red' : live.scriptScore >= 30 ? 'amber' : 'green'}
                  hint={live.script.empty ? 'No transcript yet' : `${live.script.matchedCount || 0} suspicious phrase(s) found`}
                />
                <ScoreBar
                  label="AI-voice artifact cues (experimental)"
                  value={live.artifactScore}
                  tone={live.artifactScore >= 60 ? 'red' : live.artifactScore >= 35 ? 'amber' : 'green'}
                  hint={live.artifacts.note}
                />
              </div>

              {live.reasons.length > 0 && (
                <ul className="reasons">
                  {live.reasons.map((reason, index) => (
                    <li key={`${reason.text}-${index}`} className={`reasons__item reasons__item--${reason.severity}`}>
                      {reason.text}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="What you should do now" tone={bandTone === 'danger' ? 'danger' : 'default'}>
              <ol className="advice">
                {live.advice.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>

              {claimedProfile && (
                <div className="verify-box">
                  <p className="verify-box__title">Verify with {claimedProfile.name}</p>
                  {claimedProfile.safeWord ? (
                    <p className="verify-box__line">
                      Ask for the family safe word. It should be <strong>{claimedProfile.safeWord}</strong>.
                    </p>
                  ) : (
                    <p className="verify-box__line">No safe word set for this person yet.</p>
                  )}
                  {claimedProfile.challengeQ && (
                    <p className="verify-box__line">
                      Private question: <strong>{claimedProfile.challengeQ}</strong>
                      {claimedProfile.challengeA ? ` — answer: “${claimedProfile.challengeA}”` : ''}
                    </p>
                  )}
                  <div className="verify-box__actions">
                    <button type="button" className="btn btn--sm btn--primary" onClick={() => setVerifyOpen(true)}>
                      Open verification steps
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </>
      ) : (
        <Card tone="muted">
          <p className="prose">
            <strong>No result yet.</strong> Press <em>Start listening</em> while the call is on speaker. After about 3
            seconds the app shows a live verdict. If the caller has not enrolled a voice, select{' '}
            <em>Unknown / I am not sure</em> to rely on scam-script detection.
          </p>
        </Card>
      )}

      <Card
        title="Live transcript"
        subtitle="Used only for scam-pattern detection on this device. Edit or type manually if your browser cannot transcribe."
        actions={
          <button type="button" className="btn btn--sm btn--ghost" onClick={loadExample}>
            Load example scam line
          </button>
        }
      >
        <textarea
          className="textarea"
          rows={4}
          value={transcript}
          onChange={(event) => {
            setTranscript(event.target.value);
            transcriptRef.current = event.target.value;
          }}
          placeholder="What is the caller saying? e.g. “Beta, I had an accident, send money urgently, don't tell your mother…”"
        />

        <div className="row row--between">
          <label className="checkline">
            <input
              type="checkbox"
              checked={useSpeech}
              onChange={(event) => setUseSpeech(event.target.checked)}
              disabled={!speechSupported()}
            />
            Transcribe automatically while listening
          </label>
          <span className="muted-sm">Language: {settings.asrLang}</span>
        </div>

        <p className="note">
          Voice matching is always on-device. Live transcription is an optional browser feature: Chrome and Edge send
          that audio to their speech service. Leave it off and type what the caller says for a fully offline check.
        </p>

        {transcript.trim() && (
          <TranscriptFindings transcript={transcript} />
        )}
      </Card>

      <Modal
        open={verifyOpen}
        title="Verify before you do anything"
        subtitle="A voice match is helpful, but a callback on a saved number is the only reliable check."
        onClose={() => setVerifyOpen(false)}
        footer={
          <button type="button" className="btn" onClick={() => setVerifyOpen(false)}>
            Close
          </button>
        }
      >
        <ol className="advice advice--tight">
          <li>Hang up. Do not explain why.</li>
          <li>
            Call {claimedProfile?.name || 'your relative'} on the number saved in your contacts
            {claimedProfile?.phone ? ` (${claimedProfile.phone})` : ''}.
          </li>
          <li>Ask for the family safe word{claimedProfile?.safeWord ? ` (“${claimedProfile.safeWord}”)` : ''}.</li>
          <li>Ask a private question only they would know.</li>
          <li>Never send money, gift cards, crypto or OTPs because of a phone call.</li>
        </ol>

        <div className="verify-actions">
          {claimedProfile?.phone && (
            <>
              <a className="btn btn--primary" href={telHref(claimedProfile.phone)}>
                Call {claimedProfile.name} now
              </a>
              <a
                className="btn"
                href={smsHref(
                  claimedProfile.phone,
                  'I received a suspicious call from someone claiming to be you. Was that really you? Please reply.'
                )}
              >
                Send a check message
              </a>
            </>
          )}
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              const text = `Possible impersonation call. Verdict: ${live?.headline || 'suspicious'}. Risk ${live?.score ?? '?'} /100. Please call me back on your saved number.`;
              navigator.clipboard?.writeText(text)?.catch(() => {});
              notify?.('Alert text copied. Paste it to a family member.');
            }}
          >
            Copy alert for a guardian
          </button>
        </div>

        {!claimedProfile?.phone && (
          <p className="note">
            Add a saved phone number in Family Circle to enable the one-tap callback button.
          </p>
        )}
      </Modal>

      <p className="fineprint">
        RakshaCall is an assistive tool, not a guarantee. Voice cloning can defeat any detector. Always verify money
        requests out-of-band. If money was sent: cybercrime.gov.in or 1930 (India).
      </p>
    </div>
  );
}

function TranscriptFindings({ transcript }) {
  const result = scoreTranscript(transcript);
  if (!result.categories.length) {
    return <p className="note note--ok">No known scam phrases found in this transcript.</p>;
  }
  return (
    <div className="findings">
      <div className="findings__head">
        <strong>Script risk {result.score}/100</strong>
        <span className="muted-sm">{result.categories.length} pattern(s)</span>
      </div>
      <ul className="findings__list">
        {result.categories.map((category) => (
          <li key={category.category}>
            <Badge tone={category.weight >= 2.5 ? 'danger' : 'warn'}>{category.label}</Badge>
            <span className="findings__phrase">“{category.quote || category.phrase}”</span>
          </li>
        ))}
      </ul>
      {result.combos.length > 0 && (
        <ul className="findings__combos">
          {result.combos.map((combo) => (
            <li key={combo}>{combo}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
