import { useCallback, useEffect, useState } from 'react';
import GuardScreen from './screens/GuardScreen.jsx';
import LiveCallScreen from './screens/LiveCallScreen.jsx';
import FamilyScreen from './screens/FamilyScreen.jsx';
import LabScreen from './screens/LabScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';
import InstallScreen from './screens/InstallScreen.jsx';
import { useInstalled } from './lib/install.js';
import {
  DEFAULT_SETTINGS,
  clearEverything,
  loadCalls,
  loadProfiles,
  loadSettings,
  newId,
  saveCalls,
  saveProfiles,
  saveSettings,
} from './lib/storage.js';

const ROUTES = ['guard', 'call', 'family', 'lab', 'settings', 'install'];

function readRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '').trim();
  return ROUTES.includes(hash) ? hash : 'guard';
}

function useRoute() {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next) => {
    if (!ROUTES.includes(next)) return;
    window.location.hash = `/${next}`;
    setRoute(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return [route, navigate];
}

/* ------------------------------------------------------------------ */
/* icons                                                               */
/* ------------------------------------------------------------------ */

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

const ShieldIcon = () => (
  <svg {...iconProps}>
    <path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
const PhoneIcon = () => (
  <svg {...iconProps}>
    <path d="M5 3h3l2 5-2.5 1.5a12 12 0 0 0 6 6L15 13l5 2v3a2 2 0 0 1-2.2 2A16.8 16.8 0 0 1 3 5.2A2 2 0 0 1 5 3z" />
  </svg>
);
const UsersIcon = () => (
  <svg {...iconProps}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 5.5a3.5 3.5 0 0 1 0 6.6" />
    <path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
  </svg>
);
const FlaskIcon = () => (
  <svg {...iconProps}>
    <path d="M9 3h6" />
    <path d="M10 3v6.2L5.2 18a2 2 0 0 0 1.8 3h10a2 2 0 0 0 1.8-3L14 9.2V3" />
    <path d="M7.5 14h9" />
  </svg>
);
const DownloadIcon = () => (
  <svg {...iconProps}>
    <path d="M12 3v11" />
    <path d="M7.5 10.5L12 15l4.5-4.5" />
    <path d="M4 18.5v1A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-1" />
  </svg>
);
const GearIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

const NAV = [
  { id: 'guard', label: 'Guard', Icon: ShieldIcon },
  { id: 'call', label: 'Live call', Icon: PhoneIcon },
  { id: 'family', label: 'Family', Icon: UsersIcon },
  { id: 'lab', label: 'Test lab', Icon: FlaskIcon },
  { id: 'install', label: 'Get APK', Icon: DownloadIcon },
  { id: 'settings', label: 'Settings', Icon: GearIcon },
];

/* ------------------------------------------------------------------ */
/* app                                                                 */
/* ------------------------------------------------------------------ */

export default function App() {
  const [route, navigate] = useRoute();
  const installed = useInstalled();
  const [profiles, setProfiles] = useState(loadProfiles);
  const [calls, setCalls] = useState(loadCalls);
  const [settings, setSettings] = useState(() => loadSettings() || DEFAULT_SETTINGS);
  const [toasts, setToasts] = useState([]);
  const navItems = installed ? NAV.filter((item) => item.id !== 'install') : NAV;

  useEffect(() => { saveProfiles(profiles); }, [profiles]);
  useEffect(() => { saveCalls(calls); }, [calls]);
  useEffect(() => { saveSettings(settings); }, [settings]);

  const notify = useCallback((text) => {
    const id = newId('toast');
    setToasts((current) => [...current, { id, text }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4000);
  }, []);

  const addProfile = useCallback((profile) => {
    setProfiles((current) => [...current, profile]);
  }, []);

  const updateProfile = useCallback((profile) => {
    setProfiles((current) => current.map((item) => (item.id === profile.id ? profile : item)));
  }, []);

  const deleteProfile = useCallback((id) => {
    setProfiles((current) => current.filter((item) => item.id !== id));
  }, []);

  const saveCall = useCallback((record) => {
    setCalls((current) => [{ ...record, id: newId('call') }, ...current].slice(0, 120));
  }, []);

  const changeSettings = useCallback((patch) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const clearAll = useCallback(() => {
    clearEverything();
    setProfiles([]);
    setCalls([]);
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  const importData = useCallback((data) => {
    if (Array.isArray(data.profiles)) setProfiles(data.profiles.filter((p) => p?.id && p?.summary));
    if (Array.isArray(data.calls)) setCalls(data.calls);
    if (data.settings) setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
  }, []);

  const secure = window.isSecureContext;
  const microphoneOk = Boolean(navigator.mediaDevices?.getUserMedia);

  return (
    <div className="app">
      <header className="topbar">
        <a
          className="brand"
          href="#/guard"
          onClick={(event) => {
            event.preventDefault();
            navigate('guard');
          }}
        >
          <span className="brand__mark" aria-hidden="true">
            RC
          </span>
          <span className="brand__text">
            <span className="brand__name">RakshaCall</span>
            <span className="brand__tag">Family voice guard</span>
          </span>
        </a>

        <nav className="nav" aria-label="Main navigation">
          {navItems.map(({ id, label, Icon }) => (
            <a
              key={id}
              href={`#/${id}`}
              className={`nav__link ${route === id ? 'nav__link--active' : ''} ${id === 'install' ? 'nav__link--apk' : ''}`.trim()}
              onClick={(event) => {
                event.preventDefault();
                navigate(id);
              }}
              aria-current={route === id ? 'page' : undefined}
            >
              <Icon />
              <span>{label}</span>
            </a>
          ))}
        </nav>

        <div className="topbar__actions">
          <span className="header__badge" title="All processing happens on this device">
            <span className="dot" /> On-device
          </span>
          {!installed && (
            <a
              className="topbar__apk"
              href="#/install"
              onClick={(event) => {
                event.preventDefault();
                navigate('install');
              }}
              aria-label="Open the Android install page"
              title="Get the Android APK"
            >
              <DownloadIcon />
              <span>APK</span>
            </a>
          )}
        </div>
      </header>

      <div className="workspace">
        {(!secure || !microphoneOk) && (
          <div className="banner" role="status">
            {!secure
              ? 'The microphone needs a secure page. Open the app at http://localhost:5173 (not your network IP) or serve it over HTTPS.'
              : 'This browser does not expose microphone access. Voice matching will be unavailable, but the Test Lab and script scanner still work.'}
          </div>
        )}

        <main className="main container">
          {route === 'guard' && (
            <GuardScreen profiles={profiles} calls={calls} settings={settings} onNavigate={navigate} />
          )}
          {route === 'call' && (
            <LiveCallScreen
              profiles={profiles}
              settings={settings}
              onSaveCall={saveCall}
              notify={notify}
              onNavigate={navigate}
            />
          )}
          {route === 'family' && (
            <FamilyScreen
              profiles={profiles}
              settings={settings}
              onAdd={addProfile}
              onUpdate={updateProfile}
              onDelete={deleteProfile}
              notify={notify}
            />
          )}
          {route === 'lab' && (
            <LabScreen profiles={profiles} settings={settings} notify={notify} onNavigate={navigate} />
          )}
          {route === 'settings' && (
            <SettingsScreen
              settings={settings}
              onChange={changeSettings}
              profiles={profiles}
              calls={calls}
              onClearAll={clearAll}
              onImport={importData}
              notify={notify}
            />
          )}
          {route === 'install' && <InstallScreen notify={notify} installed={installed} />}
        </main>

        <footer className="footer container">
          <span>RakshaCall · local-first prototype · voice analysis stays on this device</span>
          <span className="footer__sep">·</span>
          <span>Report fraud: cybercrime.gov.in / 1930 (India)</span>
        </footer>
      </div>

      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            {toast.text}
          </div>
        ))}
      </div>
    </div>
  );
}
