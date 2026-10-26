import { useCallback, useEffect, useState } from 'react';
import { Badge, Card, Stat } from '../components/ui.jsx';

const APK_FILE = 'downloads/RakshaCall.apk';
const APK_PATH = `${import.meta.env.BASE_URL}${APK_FILE}`;

const BUILD_COMMANDS = `npm install @capacitor/core @capacitor/cli @capacitor/android
npm run build
npx cap init RakshaCall com.rakshacall.app --web-dir=dist
npx cap add android
npx cap sync android
npx cap open android`;

function formatBytes(bytes) {
  if (!bytes || Number.isNaN(bytes)) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function InstallScreen({ notify }) {
  const [installEvent, setInstallEvent] = useState(null);
  const [installed, setInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  );
  const [apk, setApk] = useState({ state: 'checking' });
  const [hint, setHint] = useState('');

  useEffect(() => {
    const onPrompt = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
      setHint('');
      notify?.('RakshaCall is installed on this device.');
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [notify]);

  useEffect(() => {
    let cancelled = false;
    fetch(APK_PATH, { method: 'HEAD' })
      .then((response) => {
        if (cancelled) return;
        const type = (response.headers.get('content-type') || '').toLowerCase();
        if (response.ok && !type.includes('text/html')) {
          setApk({ state: 'ready', size: Number(response.headers.get('content-length')) || 0 });
        } else {
          setApk({ state: 'missing' });
        }
      })
      .catch(() => {
        if (!cancelled) setApk({ state: 'missing' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const install = useCallback(async () => {
    if (installEvent) {
      installEvent.prompt();
      const choice = await installEvent.userChoice;
      setInstallEvent(null);
      if (choice?.outcome === 'accepted') notify?.('Installing RakshaCall…');
      return;
    }
    setHint(
      'Open your browser menu and choose “Install app” or “Add to Home screen”. On iPhone use Share → Add to Home Screen.'
    );
  }, [installEvent, notify]);

  const copyCommands = () => {
    navigator.clipboard
      ?.writeText(`${BUILD_COMMANDS}\n# Then copy the signed APK to public/${APK_FILE}`)
      ?.then(() => notify?.('Android build commands copied.'))
      .catch(() => notify?.('Could not copy. Select the commands and copy them manually.'));
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="page-kicker">Mobile</p>
          <h1 className="page-title">Take the guard with you</h1>
          <p className="page-sub">
            Install RakshaCall on the phone your family actually uses. Once installed it opens full-screen, keeps
            working offline, and stays on the home screen like any other app.
          </p>
        </div>
        <Badge tone="accent" big>No Play Store needed</Badge>
      </div>

      <div className="install-grid">
        <Card
          className="apk-card"
          title="Android APK"
          subtitle="A signed installation file for Android phones. Sideloading is normal for a family safety tool."
          actions={<Badge tone="accent" big>Android</Badge>}
        >
          <div className="install-panel install-panel--apk">
            <div className="install-panel__top">
              <span className="install-panel__mark" aria-hidden="true">APK</span>
              <div>
                <p className="install-panel__title">RakshaCall for Android</p>
                <p className="install-panel__meta">
                  Version 1.0.0 · local-first · no tracking
                  {apk.state === 'ready' && apk.size ? ` · ${formatBytes(apk.size)}` : ''}
                </p>
              </div>
            </div>

            {apk.state === 'checking' && <p className="note">Checking for a published APK build…</p>}

            {apk.state === 'ready' && (
              <>
                <a className="btn btn--primary btn--lg" href={APK_PATH} download="RakshaCall.apk">
                  Download RakshaCall.apk
                </a>
                <p className="fineprint">
                  Android may ask you to allow installs from this browser. That prompt is normal for apps installed
                  outside the Play Store.
                </p>
              </>
            )}

            {apk.state === 'missing' && (
              <>
                <p className="notice notice--warn">
                  This copy does not contain the signed APK file yet. You can still install the same app on this phone
                  right now — use the browser install panel on this page.
                </p>
                <div className="install-actions">
                  <button type="button" className="btn btn--primary btn--lg" onClick={install} disabled={installed}>
                    {installed ? 'Installed on this device' : 'Install on this phone'}
                  </button>
                </div>
                <p className="fineprint">
                  The APK slot is already wired into this page. Put a signed build at{' '}
                  <code>public/downloads/RakshaCall.apk</code> and this panel automatically becomes a direct download.
                </p>
              </>
            )}
          </div>

          <ul className="install-list">
            <li>Works fully offline once the first screen has loaded.</li>
            <li>Microphone checks stay on the phone — no audio is uploaded.</li>
            <li>Family profiles and check history remain in local storage.</li>
          </ul>
        </Card>

        <Card
          title="Install from this browser"
          subtitle="The quickest route today. Add RakshaCall to the home screen without downloading a file."
        >
          <ol className="install-steps">
            <li>
              <strong>Android:</strong> tap the install button below, or use the browser menu → <em>Install app</em>.
            </li>
            <li>
              <strong>iPhone / iPad:</strong> open in Safari, tap Share, then <em>Add to Home Screen</em>.
            </li>
            <li>
              <strong>Desktop:</strong> use the install icon in the address bar to open it in its own window.
            </li>
          </ol>

          <div className="install-actions">
            <button type="button" className="btn btn--primary btn--lg" onClick={install} disabled={installed}>
              {installed ? 'Already installed' : 'Install on this device'}
            </button>
            {installed && <Badge tone="ok" big>Running as an app</Badge>}
          </div>

          {hint && <p className="note note--warn">{hint}</p>}

          <p className="fineprint">
            Installing from the browser keeps the app updated automatically. The APK is for phones where a shareable
            installation file is needed.
          </p>
        </Card>
      </div>

      <Card title="What changes after installing" tone="muted">
        <div className="install-features">
          <div className="install-feature">
            <p className="install-feature__title">Full screen</p>
            <p className="install-feature__body">
              No address bar or tabs between a worried parent and the warning they need to read.
            </p>
          </div>
          <div className="install-feature">
            <p className="install-feature__title">One tap away</p>
            <p className="install-feature__body">
              The app sits on the home screen beside the phone dialler, not buried in a browser history.
            </p>
          </div>
          <div className="install-feature">
            <p className="install-feature__title">Still private</p>
            <p className="install-feature__body">
              Voiceprints, safe words and check history stay on the device. There is no account and no server.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid--3">
        <Stat label="Install size" value="Small" hint="Shell loads once, then offline" />
        <Stat label="Sign-in" value="None" hint="No phone number or email" />
        <Stat label="Audio uploads" value="0" hint="All analysis stays local" />
      </div>

      <Card
        title="For the project demo"
        subtitle="How the APK is produced when you are ready to attach it to the build."
      >
        <p className="prose">
          The interface in this repository is the web app itself. To turn it into an Android package, wrap the production
          build in Capacitor, open the generated Android project, and choose <strong>Build → Build APK(s)</strong>.
        </p>
        <pre className="install-code">{BUILD_COMMANDS}</pre>
        <div className="install-actions">
          <button type="button" className="btn btn--sm" onClick={copyCommands}>
            Copy commands
          </button>
          <span className="muted-sm">
            Then copy the signed APK to public/{APK_FILE}
          </span>
        </div>
        <p className="fineprint">
          Building the Android project needs Android Studio or the Android command-line SDK with Java. Those tools are
          not required to run or demo the web app.
        </p>
      </Card>
    </div>
  );
}
