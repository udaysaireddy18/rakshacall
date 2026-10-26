import { useRef, useState } from 'react';
import { Badge, Card, SensitivityNote, Stat, Toggle } from '../components/ui.jsx';
import { estimateStorageBytes, exportAll, downloadJson } from '../lib/storage.js';

const LANGUAGES = [
  ['en-IN', 'English (India)'],
  ['en-US', 'English (US)'],
  ['hi-IN', 'हिन्दी (Hindi)'],
  ['bn-IN', 'বাংলা (Bengali)'],
  ['mr-IN', 'मराठी (Marathi)'],
  ['ta-IN', 'தமிழ் (Tamil)'],
  ['te-IN', 'తెలుగు (Telugu)'],
  ['gu-IN', 'ગુજરાતી (Gujarati)'],
  ['kn-IN', 'ಕನ್ನಡ (Kannada)'],
  ['ml-IN', 'മലയാളം (Malayalam)'],
  ['pa-IN', 'ਪੰਜਾਬੀ (Punjabi)'],
];

export default function SettingsScreen({
  settings,
  onChange,
  profiles,
  calls,
  onClearAll,
  onImport,
  notify,
}) {
  const fileRef = useRef(null);
  const [importError, setImportError] = useState('');
  const storageBytes = estimateStorageBytes();

  const exportData = () => {
    downloadJson(exportAll(profiles, calls, settings), `rakshacall-backup-${new Date().toISOString().slice(0, 10)}.json`);
    notify?.('Backup downloaded.');
  };

  const handleImport = async (file) => {
    setImportError('');
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.profiles)) throw new Error('This does not look like a RakshaCall backup.');
      onImport(parsed);
      notify?.(`Restored ${parsed.profiles.length} voice profile(s).`);
    } catch (error) {
      setImportError(error?.message || 'Could not read this file.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const clearAll = () => {
    const confirmed = window.confirm(
      'Delete every voice profile and check history from this device? This cannot be undone.'
    );
    if (confirmed) {
      onClearAll();
      notify?.('All local data deleted.');
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Detection sensitivity, language, privacy and your local data.</p>
        </div>
      </div>

      <Card title="Detection sensitivity" subtitle="How cautious the voice comparison should be.">
        <div className="radio-group">
          {[
            ['strict', 'Strict', 'Best for elderly family members or high-value targets.'],
            ['balanced', 'Balanced', 'Recommended default.'],
            ['relaxed', 'Relaxed', 'Only the clearest mismatches are flagged.'],
          ].map(([value, label, hint]) => (
            <label key={value} className={`radio ${settings.sensitivity === value ? 'radio--active' : ''}`.trim()}>
              <input
                type="radio"
                name="sensitivity"
                value={value}
                checked={settings.sensitivity === value}
                onChange={() => onChange({ sensitivity: value })}
              />
              <span className="radio__text">
                <span className="radio__label">{label}</span>
                <span className="radio__hint">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        <SensitivityNote sensitivity={settings.sensitivity} />
      </Card>

      <Card title="Speech-to-text language" subtitle="Used for live scam-script detection. Voice matching works in every language.">
        <select className="select" value={settings.asrLang} onChange={(event) => onChange({ asrLang: event.target.value })}>
          {LANGUAGES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <p className="note">
          Live transcription requires Chrome or Edge. It is off by default because those browsers send the audio to
          their own speech service. For a fully offline check, leave it off and type what the caller says in the Live
          Call screen. Without it, voice matching still works normally.
        </p>
      </Card>

      <Card title="Alerts">
        <Toggle
          checked={settings.soundAlerts}
          onChange={(value) => onChange({ soundAlerts: value })}
          label="Sound and vibration on high risk"
          hint="Plays a short double beep and vibrates when a call turns high risk."
        />
      </Card>

      <Card title="Your data" subtitle="Everything is stored in this browser only. There is no account and no server.">
        <div className="grid grid--3">
          <Stat label="Voice profiles" value={profiles.length} />
          <Stat label="Saved checks" value={calls.length} />
          <Stat label="Local storage used" value={`${(storageBytes / 1024).toFixed(1)} KB`} />
        </div>

        <div className="row row--wrap">
          <button type="button" className="btn" onClick={exportData}>
            Download backup (JSON)
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Restore from backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(event) => handleImport(event.target.files?.[0])}
          />
          <button type="button" className="btn btn--danger-ghost" onClick={clearAll}>
            Delete all local data
          </button>
        </div>
        {importError && <p className="notice notice--danger">{importError}</p>}

        <p className="fineprint">
          Backups contain voiceprint numbers (not audio) and are enough to impersonate a voiceprint. Treat them like a
          password: keep them private and delete them when no longer needed.
        </p>
      </Card>

      <Card title="How the detection works" subtitle="Plain-language explanation, useful for a project report or viva.">
        <ol className="advice advice--tight">
          <li>
            <strong>Capture.</strong> Microphone audio is converted to 16 kHz mono. Uploaded files are decoded the same
            way.
          </li>
          <li>
            <strong>Frames.</strong> The signal is cut into 32 ms frames every 10 ms. Silence is removed with an adaptive
            energy detector.
          </li>
          <li>
            <strong>Features.</strong> Each frame gives 12 MFCCs (vocal-tract shape), pitch via normalised
            autocorrelation, spectral centroid, spectral flatness, zero-crossing rate and harmonicity.
          </li>
          <li>
            <strong>Voiceprint.</strong> The mean and spread of the speech frames are stored — about 30 numbers per
            person.
          </li>
          <li>
            <strong>Comparison.</strong> Cosine similarity on cepstral means (62%), cepstral spread (16%), pitch (12%) and
            timbre (10%) gives a 0–1 score. Each profile has its own match line, calibrated from how consistent the
            enrolment recording was.
          </li>
          <li>
            <strong>Fusion.</strong> Voice score, scam-script score and weak audio-artifact cues are combined. The
            explanations list exactly which signals fired.
          </li>
        </ol>
      </Card>

      <Card title="Honest limitations" tone="danger">
        <ul className="rules rules--plain">
          <li>
            This uses <strong>classical speaker verification</strong>, not a trained deepfake detector. It answers “does
            this voice match the enrolled person?” — it cannot prove a voice is synthetic.
          </li>
          <li>Short calls, background noise and telephone compression reduce accuracy. Two seconds is not enough.</li>
          <li>
            A skilled attacker with a good clone, or a real relative under pressure, can pass a voice check. That is why
            the app always pushes an out-of-band callback and a safe word.
          </li>
          <li>
            Voiceprints are biometric data. Keep them on your own device, and delete them if you sell or share the
            phone.
          </li>
          <li>
            Never treat a green result as permission to pay. No legitimate emergency requires secrecy or an instant
            transfer.
          </li>
        </ul>
      </Card>

      <Card title="About" tone="muted">
        <p className="prose">
          <strong>RakshaCall — Family Voice Guard.</strong> A local-first proof of concept for detecting
          family-impersonation and voice-cloning fraud on the victim&apos;s side of the call. No backend, no tracking, no
          audio upload.
        </p>
        <p className="prose">
          India-specific help: report cyber fraud at <strong>cybercrime.gov.in</strong> or call{' '}
          <strong>1930</strong>. Report the number to your telecom operator as well.
        </p>
        <div className="row row--wrap">
          <Badge tone="ok">Runs offline after first load</Badge>
          <Badge tone="ok">No account needed</Badge>
          <Badge tone="ok">16 kHz on-device DSP</Badge>
        </div>
      </Card>
    </div>
  );
}
