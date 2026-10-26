import { useEffect, useRef, useState } from 'react';
import { Badge, Card, EmptyState, LevelMeter, Modal, ScoreBar, Stat } from '../components/ui.jsx';
import { startMicRecording } from '../lib/audio.js';
import { enrollFromSamples, verifySamples } from '../lib/voiceprint.js';
import { initials } from '../lib/format.js';

const EMPTY_FORM = {
  name: '',
  relation: '',
  phone: '',
  safeWord: '',
  challengeQ: '',
  challengeA: '',
};

const RELATIONS = ['Son', 'Daughter', 'Mother', 'Father', 'Brother', 'Sister', 'Spouse', 'Uncle', 'Aunt', 'Grandson', 'Granddaughter', 'Other'];

const QUALITY_META = {
  good: { tone: 'ok', label: 'Good sample' },
  fair: { tone: 'warn', label: 'Fair sample' },
  poor: { tone: 'danger', label: 'Weak sample — please re-record' },
};

export default function FamilyScreen({ profiles, onAdd, onUpdate, onDelete, settings, notify }) {
  const [modalMode, setModalMode] = useState(null); // 'enroll' | 'test' | null
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [phase, setPhase] = useState('idle'); // idle | recording | processing | result | error
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [level, setLevel] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [testingProfile, setTestingProfile] = useState(null);

  const recorderRef = useRef(null);
  const countdownRef = useRef(null);
  const stopTimerRef = useRef(null);

  const clearTimers = () => {
    clearInterval(countdownRef.current);
    clearTimeout(stopTimerRef.current);
    countdownRef.current = null;
    stopTimerRef.current = null;
  };

  const stopMic = () => {
    clearTimers();
    recorderRef.current?.cancel?.();
    recorderRef.current = null;
    setLevel(0);
  };

  useEffect(() => () => stopMic(), []);

  const closeModal = () => {
    stopMic();
    setModalMode(null);
    setEditing(null);
    setTestingProfile(null);
    setPhase('idle');
    setResult(null);
    setError('');
    setForm(EMPTY_FORM);
  };

  const openEnroll = (profile = null) => {
    setEditing(profile);
    setTestingProfile(null);
    setForm(
      profile
        ? {
            name: profile.name,
            relation: profile.relation,
            phone: profile.phone,
            safeWord: profile.safeWord,
            challengeQ: profile.challengeQ,
            challengeA: profile.challengeA,
          }
        : EMPTY_FORM
    );
    setPhase('idle');
    setResult(null);
    setError('');
    setModalMode('enroll');
  };

  const openTest = (profile) => {
    setTestingProfile(profile);
    setEditing(null);
    setPhase('idle');
    setResult(null);
    setError('');
    setModalMode('test');
  };

  const startRecording = async (durationSec) => {
    setError('');
    try {
      const recorder = await startMicRecording({ onLevel: setLevel });
      recorderRef.current = recorder;
      setPhase('recording');
      setSecondsLeft(durationSec);

      countdownRef.current = setInterval(() => {
        setSecondsLeft((value) => {
          if (value <= 1) {
            clearInterval(countdownRef.current);
            return 0;
          }
          return value - 1;
        });
      }, 1000);

      stopTimerRef.current = setTimeout(() => finishRecording(durationSec), durationSec * 1000);
    } catch (err) {
      setPhase('error');
      setError(
        err?.name === 'NotAllowedError'
          ? 'Microphone permission was blocked. Allow microphone access in your browser, then try again.'
          : `Could not start recording: ${err?.message || err}`
      );
    }
  };

  const finishRecording = async (durationSec) => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    clearTimers();
    setPhase('processing');
    try {
      const { samples } = await recorder.stop();
      recorderRef.current = null;
      setLevel(0);

      if (!samples || samples.length < 16000 * 1.5) {
        throw new Error('The recording was too short. Please try again and speak for the full duration.');
      }

      if (modalMode === 'test' && testingProfile) {
        const verification = verifySamples(samples, testingProfile, { sensitivity: settings.sensitivity });
        if (!verification.ok) throw new Error('No speech detected. Please try again in a quieter room.');
        setResult(verification);
        setPhase('result');
        return;
      }

      const profile = enrollFromSamples(samples, form);
      setResult(profile);
      setPhase('result');
    } catch (err) {
      setPhase('error');
      setError(err?.message || 'Something went wrong while processing the audio.');
    }
    void durationSec;
  };

  const cancelRecording = () => {
    stopMic();
    setPhase('idle');
    setSecondsLeft(0);
  };

  const saveProfile = () => {
    if (!result) return;
    if (editing) {
      const merged = {
        ...result,
        id: editing.id,
        createdAt: editing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      onUpdate(merged);
      notify?.(`Voice profile updated for ${merged.name}.`);
    } else {
      onAdd(result);
      notify?.(`${result.name} is now in your Family Circle.`);
    }
    closeModal();
  };

  const handleDelete = (profile) => {
    const confirmed = window.confirm(
      `Delete ${profile.name}'s voice profile? You will need to record their voice again to restore it.`
    );
    if (confirmed) {
      onDelete(profile.id);
      notify?.(`${profile.name} removed from Family Circle.`);
    }
  };

  const updateField = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const formValid = form.name.trim().length >= 2;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">Family Circle</h1>
          <p className="page-sub">
            Enrol the people scammers pretend to be. Each 10-second sample becomes a voiceprint stored only on this
            device.
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => openEnroll(null)}>
          + Add family voice
        </button>
      </div>

      {profiles.length === 0 ? (
        <Card>
          <EmptyState
            title="No family voices yet"
            body="Start with the person a scammer is most likely to imitate — usually a son, daughter or parent. Record them saying a normal sentence for 10 seconds."
            action={
              <button type="button" className="btn btn--primary" onClick={() => openEnroll(null)}>
                Record first voice
              </button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid--2">
          {profiles.map((profile) => {
            const quality = QUALITY_META[profile.quality] || QUALITY_META.fair;
            return (
              <Card key={profile.id} className="profile">
                <div className="profile__head">
                  <span className="avatar" aria-hidden="true">{initials(profile.name)}</span>
                  <div className="profile__identity">
                    <h2 className="profile__name">{profile.name}</h2>
                    <p className="profile__relation">
                      {profile.relation || 'Family'}
                      {profile.phone ? ` · ${profile.phone}` : ''}
                    </p>
                  </div>
                  <Badge tone={quality.tone}>{quality.label}</Badge>
                </div>

                <div className="profile__stats">
                  <Stat label="Pitch" value={profile.stats?.pitchHz ? `${profile.stats.pitchHz} Hz` : '—'} />
                  <Stat label="Sample" value={`${profile.stats?.durationSec ?? 0}s`} />
                  <Stat label="Self-match" value={`${Math.round((profile.selfSimilarity || 0) * 100)}%`} />
                </div>

                <ul className="profile__facts">
                  <li className={profile.safeWord ? 'is-done' : 'is-warn'}>
                    {profile.safeWord ? `Safe word set (${'•'.repeat(Math.min(8, profile.safeWord.length))})` : 'No safe word yet'}
                  </li>
                  <li className={profile.challengeQ ? 'is-done' : 'is-warn'}>
                    {profile.challengeQ ? 'Private question set' : 'No private question yet'}
                  </li>
                  <li className="is-done">
                    Match threshold {Math.round((profile.thresholds?.match ?? 0) * 100)}% · unsure below{' '}
                    {Math.round((profile.thresholds?.uncertain ?? 0) * 100)}%
                  </li>
                </ul>

                <div className="profile__actions">
                  <button type="button" className="btn btn--sm btn--primary" onClick={() => openTest(profile)}>
                    Test this voice
                  </button>
                  <button type="button" className="btn btn--sm" onClick={() => openEnroll(profile)}>
                    Re-record / edit
                  </button>
                  <button type="button" className="btn btn--sm btn--danger-ghost" onClick={() => handleDelete(profile)}>
                    Delete
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card title="Why the sample quality matters" tone="muted">
        <p className="prose">
          A voiceprint is a statistical summary of how someone sounds: the shape of their vocal tract (MFCC
          coefficients), their usual pitch and their timbre. A clean 10-second sample in a quiet room gives the app a
          reliable reference. Noisy or very short samples make every comparison less trustworthy, so the app will tell
          you when a sample is weak and ask you to record again.
        </p>
        <p className="prose">
          Nothing is uploaded. The recording is processed in memory, converted into numbers and then discarded — only
          the numbers are saved in this browser.
        </p>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* enrolment / test modal                                            */}
      {/* ---------------------------------------------------------------- */}
      <Modal
        open={modalMode !== null}
        title={modalMode === 'test' ? `Test ${testingProfile?.name || ''}'s voice` : editing ? `Update ${editing.name}` : 'Add a family voice'}
        subtitle={
          modalMode === 'test'
            ? 'Record 5 seconds of the person on the call and see how it compares.'
            : 'Record 10 seconds of your relative speaking normally. Quiet room, phone close to the mouth.'
        }
        onClose={closeModal}
        wide
        footer={
          phase === 'result' && modalMode === 'enroll' ? (
            <>
              <button type="button" className="btn btn--ghost" onClick={() => { setPhase('idle'); setResult(null); }}>
                Record again
              </button>
              <button type="button" className="btn btn--primary" onClick={saveProfile}>
                {editing ? 'Save changes' : 'Save to Family Circle'}
              </button>
            </>
          ) : null
        }
      >
        {modalMode === 'enroll' ? (
          <div className="form-grid">
            <label className="field">
              <span className="field__label">Name *</span>
              <input value={form.name} onChange={updateField('name')} placeholder="e.g. Ramesh" autoFocus />
            </label>
            <label className="field">
              <span className="field__label">Relationship</span>
              <select value={form.relation} onChange={updateField('relation')}>
                <option value="">Select…</option>
                {RELATIONS.map((relation) => (
                  <option key={relation} value={relation}>
                    {relation}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Saved phone number</span>
              <input value={form.phone} onChange={updateField('phone')} placeholder="+91 98765 43210" inputMode="tel" />
              <span className="field__hint">Used for the “call them back” button. Never shared.</span>
            </label>
            <label className="field">
              <span className="field__label">Family safe word</span>
              <input value={form.safeWord} onChange={updateField('safeWord')} placeholder="e.g. mango" />
              <span className="field__hint">A private word only your family knows.</span>
            </label>
            <label className="field field--wide">
              <span className="field__label">Private question</span>
              <input
                value={form.challengeQ}
                onChange={updateField('challengeQ')}
                placeholder="e.g. What did we name our first dog?"
              />
            </label>
            <label className="field field--wide">
              <span className="field__label">Answer to private question</span>
              <input value={form.challengeA} onChange={updateField('challengeA')} placeholder="e.g. Moti" />
              <span className="field__hint">Kept on this device so you can check the answer yourself.</span>
            </label>
          </div>
        ) : (
          <div className="compare-head">
            <div>
              <p className="compare-head__label">Comparing against</p>
              <p className="compare-head__name">{testingProfile?.name}</p>
            </div>
            <Badge tone="neutral">{testingProfile?.relation || 'Family'}</Badge>
          </div>
        )}

        {/* recording block */}
        <div className="record">
          {phase === 'recording' ? (
            <>
              <div className="record__ring">
                <span className="record__count">{secondsLeft}s</span>
                <span className="record__hint">recording</span>
              </div>
              <LevelMeter level={level} tone={level > 0.04 ? 'ok' : 'warn'} />
              <p className="record__tip">
                Speak normally: “{form.name || 'My name'} here. I am fine, I am at home. The weather is nice today.” Keep
                speaking until the timer ends.
              </p>
              <button type="button" className="btn btn--ghost" onClick={cancelRecording}>
                Cancel
              </button>
            </>
          ) : phase === 'processing' ? (
            <div className="record__processing">
              <span className="spinner" aria-hidden="true" />
              <p>Analysing voice… extracting pitch, timbre and cepstral features.</p>
            </div>
          ) : phase === 'idle' || phase === 'error' ? (
            <>
              <button
                type="button"
                className="btn btn--primary btn--lg"
                onClick={() => startRecording(modalMode === 'test' ? 5 : 10)}
                disabled={modalMode === 'enroll' && !formValid}
              >
                {modalMode === 'test' ? 'Record 5 seconds' : 'Record 10 seconds'}
              </button>
              <p className="record__tip">
                {modalMode === 'enroll'
                  ? 'Make sure it is quiet, and that the person speaks in a normal voice — not whispering.'
                  : 'Play the call on speaker, or record the person directly, then compare.'}
              </p>
              {modalMode === 'enroll' && !formValid && <p className="note note--warn">Enter a name first.</p>}
            </>
          ) : null}

          {error && <p className="notice notice--danger">{error}</p>}
        </div>

        {/* results */}
        {phase === 'result' && result && modalMode === 'enroll' && (
          <div className="result">
            <div className="result__head">
              <Badge tone={QUALITY_META[result.quality]?.tone || 'warn'} big>
                {QUALITY_META[result.quality]?.label || 'Sample saved'}
              </Badge>
              <span className="result__meta">
                {result.stats.durationSec}s of audio · {Math.round(result.stats.speechRatio * 100)}% speech · pitch ~
                {result.stats.pitchHz} Hz
              </span>
            </div>

            <div className="result__grid">
              <Stat label="Consistency" value={`${Math.round(result.selfSimilarity * 100)}%`} hint="First half vs second half" />
              <Stat label="Match threshold" value={`${Math.round(result.thresholds.match * 100)}%`} hint="Above this = same voice" />
              <Stat label="Unsure below" value={`${Math.round(result.thresholds.uncertain * 100)}%`} hint="Below this = not the same person" />
            </div>

            {result.quality !== 'good' && (
              <p className="notice notice--warn">
                This sample is not very consistent. For better protection, re-record in a quiet room and speak for the
                full 10 seconds without long pauses.
              </p>
            )}
            <p className="note">
              Only these numbers are saved: 12 cepstral means, 12 spreads, pitch and timbre statistics. The audio itself
              is discarded.
            </p>
          </div>
        )}

        {phase === 'result' && result && modalMode === 'test' && (
          <div className="result">
            <div className={`verdict verdict--${result.verdict}`}>
              <span className="verdict__eyebrow">Test result</span>
              <h3 className="verdict__title">
                {result.verdict === 'match'
                  ? `This sounds like ${testingProfile.name}`
                  : result.verdict === 'uncertain'
                    ? `Not sure this is ${testingProfile.name}`
                    : `This does NOT sound like ${testingProfile.name}`}
              </h3>
              <p className="verdict__body">
                Voice similarity {Math.round(result.similarity.overall * 100)}% · match needs{' '}
                {Math.round(result.thresholds.match * 100)}%.
              </p>
            </div>

            <div className="bars">
              <ScoreBar label="Overall voice similarity" value={result.similarity.overall * 100} tone="sky" />
              <ScoreBar label="Cepstral (vocal tract) match" value={result.similarity.mfcc * 100} tone="violet" />
              <ScoreBar label="Spectral stability match" value={result.similarity.spectral * 100} tone="teal" />
              <ScoreBar label="Pitch similarity" value={result.similarity.pitch * 100} tone="amber" />
              <ScoreBar label="Timbre similarity" value={result.similarity.timbre * 100} tone="green" />
            </div>

            <p className="note">
              For reference, this profile matched itself at {Math.round((testingProfile.selfSimilarity || 0) * 100)}%
              during enrolment. Scores are affected by background noise, phone quality and how long the person speaks.
            </p>
            <div className="result__actions">
              <button type="button" className="btn btn--ghost" onClick={() => { setPhase('idle'); setResult(null); }}>
                Test again
              </button>
              <button type="button" className="btn" onClick={closeModal}>
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
