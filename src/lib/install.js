import { useEffect, useState } from 'react';

/**
 * Native shell detection is intentionally dependency-free so the same check is
 * available before the rest of the app renders.
 */
export function isNativeShell() {
  return Boolean(
    window.Capacitor?.isNativePlatform?.() ||
      window.androidBridge ||
      window.webkit?.messageHandlers?.bridge ||
      /Capacitor/i.test(navigator.userAgent)
  );
}

export function isStandalone() {
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true
  );
}

export function detectInstalled() {
  return isNativeShell() || isStandalone();
}

/**
 * Tracks whether RakshaCall is running as an installed app. The nav and the
 * Get APK shortcut can then disappear instead of inviting an installed user to
 * install the app again.
 */
export function useInstalled() {
  const [installed, setInstalled] = useState(detectInstalled);

  useEffect(() => {
    const refresh = () => setInstalled(detectInstalled());
    const onInstalled = () => setInstalled(true);
    const media = window.matchMedia?.('(display-mode: standalone)');

    if (media?.addEventListener) media.addEventListener('change', refresh);
    else media?.addListener?.(refresh);

    window.addEventListener('appinstalled', onInstalled);
    refresh();

    return () => {
      if (media?.removeEventListener) media.removeEventListener('change', refresh);
      else media?.removeListener?.(refresh);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return installed;
}
