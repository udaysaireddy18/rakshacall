import { useRef, useState } from 'react';
import { Badge, Card, ScoreBar, Stat, Waveform } from '../components/ui.jsx';
import { decodeFileToMono } from '../lib/audio.js';
import { analyseSamples } from '../lib/dsp.js';
import { verifySamples } from '../lib/voiceprint.js';
import { scoreTranscript, EXAMPLE_SCRIPTS } from '../lib/scamPhrases.js';
import { verdictText } from '../lib/format.js';

const FEATURE_ROWS = [
  ['Pitch (median F0)', (s) => `${Math.round(s.f0Mean)} Hz`],
  ['Pitch variation', (s) => `${Math.round(s.f0Std)} Hz`],
  ['Spectral centroid', (s) => `${Math.round(s.centroidMean)} Hz`],
  ['Spectral flatness', (s) => s.flatnessMean.toFixed(3)],
  ['Harmonic-to-noise', (s) => `${s.hnrMean.toFixed(1)} dB`],
  ['Zero-crossing rate', (s) => s.zcrMean.toFixed(3)],
  ['Speech ratio', (s) => `${Math.round(s.speechRatio * 100)}%`],
  ['Analysed length', (s) => `${s.durationSec.toFixed(1)} s`],
];

export default function LabScreen({ profiles, settings, notify, onNavigate }) {
  const [profileId, setProfileId] = useState('');
  const [fileName, setFileName] = useState('');
  const [samples, setSamples] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const [scriptText, setScriptText] = useState('');
  const [scriptResult, setScriptResult] = useState(null);
  const inputRef = useRef(null);

  const profile = profiles.find((p) => p.id === profileId) || null;

  const handleFile = async (file) => {
    if (!file) return;
    setError('');
    setResult(null);
    setSamples(null);
    setLoading(true);
    setFileName(file.name);
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error('File is larger than 30 MB. Please use a shorter clip.');
      const decoded = await decodeFileToMono(file);
      if (!decoded.length) throw new Error('Could not read audio from this file.');
      setSamples(decoded);
      const { summary } = analyseSamples(decoded, 16000);
      if (!summary) throw new Error('No speech detected in this file. Try a clearer recording.');
      setResult({ stage: 'loaded', summary });
    } catch (err) {
      setError(err?.message || 'Could not decode this file. Try WAV, MP3, M4A or OGG.');
      setFileName('');
    } finally {
      setLoading(false);
    }
  };

  const analyse = () => {
    if (!samples) return;
    try {
      if (profile) {
        const verification = verifySamples(samples, profile, { sensitivity: settings.sensitivity });
        if (!verification.ok) throw new Error('No speech detected in this file.');
        setResult({ stage: 'verified', ...verification });
      } else {
        const { summary } = analyseSamples(samples, 16000);
        setResult({ stage: 'loaded', summary });
        notify?.('Select a family voice to compare against.');
      }
    } catch (err) {
      setError(err?.message || 'Analysis failed.');
    }
  };

  const analyseScript = () => {
    setScriptResult(scoreTranscript(scriptText));
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    handleFile(file);
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">Test Lab</h1>
          <p className="page-sub">
            Check a saved recording against an enrolled voice, or paste what a caller said and see which scam patterns
            it matches.
          </p>
        </div>
      </div>

      <Card title="1 · Check a recording" subtitle="Upload a call recording or any voice clip. Decoded and analysed on this device.">
        <div className="row">
          <select className="select" value={profileId} onChange={(event) => setProfileId(event.target.value)}>
            <option value="">No comparison — features only</option>
            {profiles.map((item) => (
              <option key={item.id} value={item.id}>
                Compare with {item.name}
              </option>
            ))}
          </select>
          {profiles.length === 0 && (
            <button type="button" className="btn btn--sm" onClick={() => onNavigate('family')}>
              Enrol a voice
            </button>
          )}
        </div>

        <div
          className={`dropzone ${dragging ? 'dropzone--active' : ''}`.trim()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm"
            hidden
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
          <p className="dropzone__title">{fileName || 'Drop an audio file here, or click to choose'}</p>
          <p className="dropzone__hint">WAV, MP3, M4A, OGG or WebM · up to 30 MB</p>
        </div>

        {loading && (
          <div className="row row--center">
            <span className="spinner" aria-hidden="true" />
            <span>Decoding audio…</span>
          </div>
        )}

        {error && <p className="notice notice--danger">{error}</p>}

        {samples && (
          <>
            <Waveform samples={samples} height={96} color="#22d3ee" label={`${(samples.length / 16000).toFixed(1)} s · 16 kHz mono`} />
            <button type="button" className="btn btn--primary" onClick={analyse}>
              {profile ? `Compare with ${profile.name}` : 'Extract voice features'}
            </button>
          </>
        )}

        {result?.stage === 'verified' && (
          <div className="result">
            <div className={`verdict verdict--${result.verdict === 'match' ? 'ok' : result.verdict === 'uncertain' ? 'warn' : 'danger'}`}>
              <span className="verdict__eyebrow">Comparison result</span>
              <h3 className="verdict__title">{verdictText(result.verdict, profile.name)}</h3>
              <p className="verdict__body">
                Similarity {Math.round(result.similarity.overall * 100)}% · match line{' '}
                {Math.round(result.thresholds.match * 100)}% · unsure below {Math.round(result.thresholds.uncertain * 100)}%
              </p>
            </div>

            <div className="bars">
              <ScoreBar label="Overall" value={result.similarity.overall * 100} tone="sky" />
              <ScoreBar label="Cepstral / vocal tract" value={result.similarity.mfcc * 100} tone="violet" />
              <ScoreBar label="Spectral stability" value={result.similarity.spectral * 100} tone="teal" />
              <ScoreBar label="Pitch" value={result.similarity.pitch * 100} tone="amber" />
              <ScoreBar label="Timbre" value={result.similarity.timbre * 100} tone="green" />
            </div>

            <div className="result__grid">
              <Stat label="AI-voice artifact cues" value={`${Math.round(result.artifacts.score * 100)}/100`} hint="Experimental" />
              <Stat label="Enrolled self-match" value={`${Math.round((profile.selfSimilarity || 0) * 100)}%`} hint="Reference ceiling" />
              <Stat label="Profile quality" value={profile.quality} />
            </div>

            {result.artifacts.signals.length > 0 && (
              <ul className="findings__list">
                {result.artifacts.signals.map((signal) => (
                  <li key={signal.label}>
                    <Badge tone="warn">Cue</Badge>
                    <span className="findings__phrase">{signal.label}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="note">{result.artifacts.note}</p>
          </div>
        )}

        {result?.summary && (
          <div className="result">
            <h3 className="result__title">Measured features</h3>
            <dl className="feature-table">
              {FEATURE_ROWS.map(([label, format]) => (
                <div key={label} className="feature-table__row">
                  <dt>{label}</dt>
                  <dd>{format(result.summary)}</dd>
                </div>
              ))}
            </dl>
            <p className="note">
              These values describe the recording only. Comparing them against an enrolled voice produces the match
              decision.
            </p>
          </div>
        )}
      </Card>

      <Card
        title="2 · Scan what the caller said"
        subtitle="Catches the common scam scripts — including scams where no AI voice is used at all."
      >
        <textarea
          className="textarea"
          rows={5}
          value={scriptText}
          onChange={(event) => setScriptText(event.target.value)}
          placeholder="Paste or type the caller's words here…"
        />

        <div className="row row--wrap">
          {EXAMPLE_SCRIPTS.map((example) => (
            <button
              key={example.id}
              type="button"
              className="chip"
              onClick={() => {
                setScriptText(example.text);
                setScriptResult(scoreTranscript(example.text));
              }}
            >
              {example.title}
            </button>
          ))}
        </div>

        <button type="button" className="btn btn--primary" onClick={analyseScript} disabled={!scriptText.trim()}>
          Analyse text
        </button>

        {scriptResult && (
          <div className="result">
            <div className="row row--between">
              <strong>Script risk {scriptResult.score}/100</strong>
              <Badge tone={scriptResult.score >= 60 ? 'danger' : scriptResult.score >= 30 ? 'warn' : 'ok'}>
                {scriptResult.score >= 60 ? 'Strong scam pattern' : scriptResult.score >= 30 ? 'Some warning signs' : 'No strong pattern'}
              </Badge>
            </div>

            {scriptResult.categories.length === 0 ? (
              <p className="note note--ok">No known scam phrases found. Stay careful anyway.</p>
            ) : (
              <>
                <ScoreBar label="Scam script risk" value={scriptResult.score} tone={scriptResult.score >= 60 ? 'red' : 'amber'} />
                <ul className="findings__list">
                  {scriptResult.categories.map((category) => (
                    <li key={category.category}>
                      <Badge tone={category.weight >= 2.5 ? 'danger' : 'warn'}>{category.label}</Badge>
                      <span className="findings__phrase">“{category.quote || category.phrase}”</span>
                    </li>
                  ))}
                </ul>
                {scriptResult.combos.length > 0 && (
                  <ul className="findings__combos">
                    {scriptResult.combos.map((combo) => (
                      <li key={combo}>{combo}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
