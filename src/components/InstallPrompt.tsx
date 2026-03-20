import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as any).standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('install_dismissed') === '1');
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (isStandalone() || dismissed) return null;

  const dismiss = () => {
    sessionStorage.setItem('install_dismissed', '1');
    setDismissed(true);
  };

  const install = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setDeferredPrompt(null);
    } else {
      setShowInstructions(true);
    }
  };

  return (
    <>
      <div className="install-banner">
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Install App
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={install}>Install</button>
          <button className="btn btn-sm" onClick={dismiss} style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>Later</button>
        </div>
      </div>

      {showInstructions && (
        <div className="modal-overlay" onClick={() => setShowInstructions(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ padding: 28 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, textAlign: 'center' }}>Install Finance App</h2>

            {isIOS() ? (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>1</div>
                    <div>
                      <p style={{ fontWeight: 600 }}>Tap the Share button</p>
                      <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>The square icon with an arrow at the bottom of Safari</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>2</div>
                    <div>
                      <p style={{ fontWeight: 600 }}>Scroll down & tap "Add to Home Screen"</p>
                      <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>You may need to scroll down in the share menu</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>3</div>
                    <div>
                      <p style={{ fontWeight: 600 }}>Tap "Add"</p>
                      <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>The app will appear on your home screen</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>1</div>
                    <div>
                      <p style={{ fontWeight: 600 }}>Tap the menu button</p>
                      <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>Three dots (⋮) at the top-right of Chrome</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>2</div>
                    <div>
                      <p style={{ fontWeight: 600 }}>Tap "Add to Home screen"</p>
                      <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>Or "Install app" if available</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>3</div>
                    <div>
                      <p style={{ fontWeight: 600 }}>Tap "Add"</p>
                      <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>The app will appear on your home screen</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button className="btn btn-primary" onClick={() => setShowInstructions(false)} style={{ width: '100%', marginTop: 24 }}>Got it</button>
          </div>
        </div>
      )}
    </>
  );
}
