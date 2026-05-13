import './App.css';
import React, { useEffect, useState, useRef } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import localforage from 'localforage';

function App() {
  const [scannerActive, setScannerActive] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info'); // 'success' | 'error' | 'info'
  const [errorLog, setErrorLog] = useState([]);
  const [videoConstraints, setVideoConstraints] = useState({ facingMode: 'environment' });
  const [product, setProduct] = useState(null);
  const [apiJson, setApiJson] = useState('');
  const [showApiJson, setShowApiJson] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [warningColor, setWarningColor] = useState('red');
  const [restrictionColor, setRestrictionColor] = useState('yellow');
  const [bannerColor, setBannerColor] = useState('#6c757d');
  const [forbiddenList, setForbiddenList] = useState([]);
  const [forbiddenMatches, setForbiddenMatches] = useState([]);
  const [hasScannedOnce, setHasScannedOnce] = useState(false);
  const wrapperRef = useRef(null);
  

  useEffect(() => {
    (async () => {
      const stored = await localforage.getItem('userAccepted');
      setAccepted(Boolean(stored));
    })();
    // Richtlinien (unerlaubt) laden und cachen
    (async () => {
      try {
        const res = await fetch('/data/richtlinien.xml');
        const xmlText = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, 'application/xml');
        const nodes = Array.from(doc.querySelectorAll('unerlaubt > * > eintrag'));
        const terms = nodes
          .map((n) => (n.textContent || '').trim())
          .filter(Boolean)
          .map(normalizeTerm);
        setForbiddenList(Array.from(new Set(terms)));
      } catch (e) {
        setErrorLog((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] Konnte richtlinien.xml nicht laden: ${e?.message || e}`
        ].slice(-10));
      }
    })();
  }, []);

  // Close settings when scanner becomes active
  useEffect(() => {
    if (scannerActive && settingsOpen) setSettingsOpen(false);
  }, [scannerActive, settingsOpen]);

  // Lock body scroll while scanner is active (prevents visual gaps on mobile)
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    if (scannerActive) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = prevOverflow || '';
    }
    return () => {
      document.body.style.overflow = prevOverflow || '';
    };
  }, [scannerActive]);

  const confirmAcceptance = async () => {
    await localforage.setItem('userAccepted', true);
    setAccepted(true);
  };

  // Preview helper: simulate a green (success) result — shown only in production builds
  const handlePreviewGreen = () => {
    const mock = {
      product_name: 'Vorschau Produkt (Grün)',
      brands: 'Demo-Marke',
      categories: 'Vorschau/Kategorie',
      nutriments: { energy_kcal: '—', sugars: '—', fat: '—', proteins: '—', salt: '—' }
    };
    setProduct(mock);
    setMessage('Kein Warnwort gefunden (Vorschau)');
    setMessageType('success');
    setBannerColor(defaultColorForType('success'));
  };

        const COLOR_MAP = {
          red: '#dc3545',
          yellow: '#ffc107',
          green: '#28a745',
          purple: '#6f42c1',
          blue: '#007bff',
          orange: '#fd7e14',
          brown: '#795548',
          gold: '#FFD700',
          silver: '#C0C0C0'
        };

        const defaultColorForType = (type) => {
          if (type === 'success') return COLOR_MAP.green;
          if (type === 'error') return COLOR_MAP.red;
          return '#6c757d';
        };

        const getColorHex = (name) => COLOR_MAP[name] || name || '#6c757d';

  const validateEAN13 = (code) => {
    if (!/^\d{13}$/.test(code)) return false;
    const digits = code.split('').map((d) => parseInt(d, 10));
    const check = digits[12];
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const weight = (i % 2 === 0) ? 1 : 3; // positions 0-based: even index => odd position
      sum += digits[i] * weight;
    }
    const calc = (10 - (sum % 10)) % 10;
    return calc === check;
  };

  const OFF_BASE = 'https://world.openfoodfacts.org';
  const fetchProduct = async (barcode) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const url = `${OFF_BASE}/api/v0/product/${barcode}.json`;
      const res = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'application/json' } });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      try { setApiJson(JSON.stringify(data, null, 2)); } catch (_) { setApiJson(String(data)); }
      if (data && (data.status === 1 || data.product)) {
        setProduct(data.product || data);
        setMessageType('success');
        setBannerColor(defaultColorForType('success'));
        // Keywords gegen unerlaubt prüfen
        const kws = Array.isArray(data?.product?._keywords) ? data.product._keywords : [];
        const matches = evaluateKeywords(kws, forbiddenList);
        setForbiddenMatches(matches);
        if (matches.length > 0) {
          setMessage(`Warnung: Unerlaubte Begriffe gefunden: ${matches.slice(0, 5).join(', ')}${matches.length > 5 ? ' …' : ''}`);
          setMessageType('error');
          setBannerColor(getColorHex(warningColor));
        } else {
          // Keine unerlaubten Keywords gefunden: positive Rückmeldung anzeigen
          setMessage('Kein Warnwort gefunden');
          setMessageType('success');
          setBannerColor(defaultColorForType('success'));
        }
      } else {
        setProduct(null);
        setMessage('Produkt nicht gefunden.');
        setMessageType('error');
        setBannerColor(defaultColorForType('error'));
      }
    } catch (e) {
      clearTimeout(timeout);
      setProduct(null);
      setApiJson('');
      const msg = e?.name === 'AbortError' ? 'Anfrage abgebrochen (Timeout).' : (e?.message || 'Produktabfrage fehlgeschlagen.');
      setMessage(msg);
      setMessageType('error');
      setBannerColor(defaultColorForType('error'));
      setErrorLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`].slice(-10));
    }
  };

  function normalizeTerm(s) {
    return (s || '')
      .toString()
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // remove diacritics
  }

  function evaluateKeywords(keywords, forbidden) {
    if (!Array.isArray(keywords) || keywords.length === 0 || forbidden.length === 0) return [];
    const normKws = keywords.map(normalizeTerm);
    const hits = new Set();
    for (const kw of normKws) {
      for (const term of forbidden) {
        if (!term) continue;
        if (kw === term || kw.includes(term) || term.includes(kw)) {
          hits.add(term);
        }
      }
    }
    return Array.from(hits);
  }

  return (
    <div className="App">
      {!accepted && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24
        }}>
          <div style={{ maxWidth: 800, textAlign: 'left' }}>
            <h2 style={{ marginBottom: 16 }}>Hinweis / Zustimmung erforderlich</h2>
            <p style={{ marginBottom: 12 }}>
              Platzhalter-Text: Bitte lesen und bestätigen. Ohne Bestätigung kann die App nicht benutzt werden.
            </p>
            <p style={{ marginBottom: 12 }}>
              Beispiel: Diese App dient nur zu Informationszwecken. Sie ersetzt keine medizinische Beratung.
            </p>
            <button onClick={confirmAcceptance} style={{ padding: '10px 16px', fontSize: 16 }}>
              Ich habe gelesen und stimme zu
            </button>
          </div>
        </div>
      )}
      <header className="App-header">
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
          {/* Settings button top-right (hidden while scanner is active) */}
          {!scannerActive && (
            <button
              onClick={() => setSettingsOpen(true)}
              style={{ position: 'fixed', top: 12, right: 12, zIndex: 1000, padding: '8px 12px', borderRadius: 8, border: '1px solid #999', background: '#fff', cursor: 'pointer' }}
            >
              Einstellungen
            </button>
          )}
          {/* Hidden settings moved to overlay */}

          {message && (
            <div style={{
              marginBottom: 12,
              padding: '8px 12px',
              borderRadius: 8,
              background: bannerColor || (messageType === 'success' ? '#28a745' : messageType === 'error' ? '#dc3545' : '#6c757d'),
              color: '#fff'
            }}>
              {message}
            </div>
          )}

          {/* Disclaimer bar shown when a result or warning is present (hidden while scanner active) */}
          {!scannerActive && (product || (forbiddenMatches && forbiddenMatches.length > 0)) && (
            <div style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              padding: '10px 16px',
              background: '#fff9e6',
              color: '#333',
              textAlign: 'center',
              borderTop: '1px solid rgba(0,0,0,0.08)',
              zIndex: 9000,
              fontSize: 14
            }}>
              <strong>Hinweis:</strong> Dies ist eine Empfehlung — bitte nehmen Sie immer Rücksprache mit Ihrem Gynäkologen.
            </div>
          )}

          {/* Barcode-/Scanner-Rohdaten entfernt */}
          {scannerActive && accepted && (
            <div className="scanner-overlay">
              <div className="scanner-wrapper" ref={wrapperRef}>
                <div className="scanner-video-area">
                  <Scanner
                    style={{ width: '100%', height: '100%' }}
                    constraints={videoConstraints}
                    onScan={(detected) => {
                      if (Array.isArray(detected) && detected.length > 0) {
                        const text = detected[0]?.rawValue ?? '';
                        if (text) {
                          const isValid = detected[0]?.format === 'ean_13' ? validateEAN13(text) : true;
                          setMessage(isValid ? 'Erfolgreich gescannt.' : 'Scan ungültig. Bitte erneut versuchen.');
                          setMessageType(isValid ? 'success' : 'error');
                          setBannerColor(defaultColorForType(isValid ? 'success' : 'error'));
                          if (isValid) {
                            // Erfolgreich: Scanner stoppen und Produkt laden
                            try {
                              if (document.fullscreenElement && document.exitFullscreen) {
                                document.exitFullscreen();
                              }
                            } catch (_) {}
                            setScannerActive(false);
                            setHasScannedOnce(true);
                            fetchProduct(text);
                          } else {
                            // Ungültig: weiter scannen
                          }
                        }
                      }
                    }}
                    onError={(err) => {
                      if (err) {
                        const msg = typeof err === 'string' ? err : (err?.message || 'Scan fehlgeschlagen. Bitte erneut versuchen.');
                        setMessage(msg);
                        setMessageType('error');
                        setErrorLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`].slice(-10));
                        console.error('Scanner error:', err);
                      }
                    }}
                  />
                </div>
                <div className="scanner-bottom-space">
                  <button
                    className="scanner-bottom-button"
                    onClick={() => {
                      if (document.fullscreenElement && document.exitFullscreen) {
                        try { document.exitFullscreen(); } catch (_) {}
                      }
                      setScannerActive(false);
                      setHasScannedOnce(true);
                    }}
                  >
                    Scanner abbrechen
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Toggle button under the camera view */}
          {!scannerActive && (
            <button
              onClick={async () => {
                // Try to enter fullscreen to remove any browser UI gaps
                try {
                  const el = document.documentElement;
                  if (el && el.requestFullscreen) {
                    await el.requestFullscreen({ navigationUI: 'hide' });
                  }
                } catch (_) {}

                setProduct(null);
                setApiJson('');
                setForbiddenMatches([]);

                try {
                  // Fallback 1: Umgebungskamera
                  const env = { video: { facingMode: 'environment' } };
                  let stream = await navigator.mediaDevices.getUserMedia(env);
                  stream.getTracks().forEach((t) => t.stop());
                  setVideoConstraints(env.video);
                  setScannerActive(true);
                } catch (e1) {
                  try {
                    // Fallback 2: Frontkamera
                    const user = { video: { facingMode: 'user' } };
                    let stream2 = await navigator.mediaDevices.getUserMedia(user);
                    stream2.getTracks().forEach((t) => t.stop());
                    setVideoConstraints(user.video);
                    setScannerActive(true);
                  } catch (e2) {
                    const msg = e2?.message || 'Kein Zugriff auf Kamera. Prüfe Berechtigungen.';
                    setMessage(msg);
                    setMessageType('error');
                    setBannerColor(defaultColorForType('error'));
                    setErrorLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`].slice(-10));
                  }
                }
              }}
              disabled={!accepted}
              style={{
                marginTop: 16,
                fontSize: 24,
                padding: '16px 32px',
                borderRadius: 12,
                border: 'none',
                background: '#61dafb',
                color: '#000',
                cursor: accepted ? 'pointer' : 'not-allowed',
              }}
            >
              {hasScannedOnce ? 'Erneut scannen' : 'Scannen'}
            </button>
          )}

          

          {/* Preview button under the Scan button to show a green result */}
          {!scannerActive && (
            <div style={{ marginTop: 12 }}>
              <button
                disabled={!accepted}
                onClick={handlePreviewGreen}
                style={{
                  fontSize: 16,
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: '1px solid #2e7d32',
                  background: '#e8f5e9',
                  color: '#2e7d32',
                  cursor: accepted ? 'pointer' : 'not-allowed',
                  opacity: accepted ? 1 : 0.6
                }}
              >
                Anzeige Ergebnis
              </button>
            </div>
          )}

          {showApiJson && apiJson && (
            <div style={{ marginTop: 12, width: 360, maxWidth: '90%' }}>
              <strong>API-Antwort (Open Food Facts):</strong>
              <pre style={{
                background: '#1e1e1e', color: '#dcdcdc', textAlign: 'left',
                padding: 12, borderRadius: 8, width: '100%', overflowX: 'auto', marginTop: 8
              }}>
{apiJson}
              </pre>
            </div>
          )}

          {forbiddenMatches.length > 0 && (
            <div style={{ marginTop: 12, width: 360, maxWidth: '90%', textAlign: 'left' }}>
              <strong>Warnung ausgelöst durch:</strong>
              <div style={{ marginTop: 6 }}>{forbiddenMatches.join(', ')}</div>
              <div style={{ marginTop: 8, fontStyle: 'italic', color: '#333' }}>
                <strong>Hinweis:</strong> Dies ist eine Empfehlung — bitte nehmen Sie immer Rücksprache mit Ihrem Gynäkologen.
              </div>
            </div>
          )}

          {product && forbiddenMatches.length === 0 && (
            <div style={{ marginTop: 12, width: 360, maxWidth: '90%', textAlign: 'left' }}>
              <strong>Ergebnis:</strong> {product.product_name || product.generic_name || 'Unbekannt'}
            </div>
          )}

          {errorLog.length > 0 && (
            <div style={{ marginTop: 12, width: 360, maxWidth: '90%' }}>
              <strong>Fehler-Log:</strong>
              <ul style={{ textAlign: 'left' }}>
                {errorLog.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Settings overlay */}
          {settingsOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
              <div style={{ background: '#fff', color: '#000', padding: 16, borderRadius: 12, width: 420, maxWidth: '95%', textAlign: 'left' }}>
                <h3 style={{ marginTop: 0 }}>Einstellungen</h3>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={showApiJson}
                      onChange={async (e) => {
                        const val = e.target.checked;
                        setShowApiJson(val);
                        try { await localforage.setItem('pref_showApiJson', val); } catch (_) {}
                      }}
                    />
                    <span>API JSON anzeigen</span>
                  </label>
                </div>
                <div style={{ marginBottom: 12, display: 'flex', gap: 12 }}>
                  <label style={{ flex: 1 }}>
                    <div>Farbe der Warnung</div>
                    <select
                      value={warningColor}
                      onChange={async (e) => {
                        const val = e.target.value;
                        setWarningColor(val);
                        try { await localforage.setItem('pref_warningColor', val); } catch (_) {}
                      }}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 8 }}
                    >
                      {Object.keys(COLOR_MAP).map((k) => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ flex: 1 }}>
                    <div>Farbe der Einschränkung</div>
                    <select
                      value={restrictionColor}
                      onChange={async (e) => {
                        const val = e.target.value;
                        setRestrictionColor(val);
                        try { await localforage.setItem('pref_restrictionColor', val); } catch (_) {}
                      }}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 8 }}
                    >
                      {Object.keys(COLOR_MAP).map((k) => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button onClick={() => setSettingsOpen(false)} style={{ padding: '8px 12px', borderRadius: 8 }}>Schließen</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>
    </div>
  );
}

export default App;