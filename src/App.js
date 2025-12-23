import './App.css';
import React, { useEffect, useState } from 'react';
import { Scanner, useDevices } from '@yudiel/react-qr-scanner';
import localforage from 'localforage';

function App() {
  const [scannerActive, setScannerActive] = useState(false);
  const [scanResult, setScanResult] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info'); // 'success' | 'error' | 'info'
  const [detectedJson, setDetectedJson] = useState('');
  const [errorLog, setErrorLog] = useState([]);
  const [videoConstraints, setVideoConstraints] = useState({ facingMode: 'environment' });
  const [product, setProduct] = useState(null);
  const [apiJson, setApiJson] = useState('');
  const devices = useDevices();
  const videoDevices = Array.isArray(devices)
    ? devices.filter((d) => (d && d.kind ? d.kind === 'videoinput' : true))
    : [];
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  useEffect(() => {
    if (!selectedDeviceId && videoDevices.length > 0) {
      setSelectedDeviceId(videoDevices[0]?.deviceId || '');
    }
  }, [videoDevices, selectedDeviceId]);

  useEffect(() => {
    (async () => {
      const stored = await localforage.getItem('userAccepted');
      setAccepted(Boolean(stored));
    })();
  }, []);

  const confirmAcceptance = async () => {
    await localforage.setItem('userAccepted', true);
    setAccepted(true);
  };

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
      } else {
        setProduct(null);
        setMessage('Produkt nicht gefunden.');
        setMessageType('error');
      }
    } catch (e) {
      clearTimeout(timeout);
      setProduct(null);
      setApiJson('');
      const msg = e?.name === 'AbortError' ? 'Anfrage abgebrochen (Timeout).' : (e?.message || 'Produktabfrage fehlgeschlagen.');
      setMessage(msg);
      setMessageType('error');
      setErrorLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`].slice(-10));
    }
  };

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
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Geräteübersicht + Auswahl */}
          <div style={{ marginBottom: 8, opacity: 0.9, display: 'flex', gap: 12, alignItems: 'center' }}>
            <span>Kameras gefunden: {videoDevices.length}</span>
            {videoDevices.length > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Quelle:</span>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  style={{ padding: '6px 8px', borderRadius: 8 }}
                >
                  {videoDevices.map((d, i) => (
                    <option key={d.deviceId || `cam-${i}`}
                            value={d.deviceId || ''}>
                      {d.label || `Kamera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {message && (
            <div style={{
              marginBottom: 12,
              padding: '8px 12px',
              borderRadius: 8,
              background: messageType === 'success' ? '#28a745' : messageType === 'error' ? '#dc3545' : '#6c757d',
              color: '#fff'
            }}>
              {message}
            </div>
          )}

          {detectedJson && (
            <pre style={{
              background: '#1e1e1e', color: '#dcdcdc', textAlign: 'left',
              padding: 12, borderRadius: 8, width: 360, maxWidth: '90%', overflowX: 'auto', marginBottom: 12
            }}>
{detectedJson}
            </pre>
          )}

          <button
            onClick={async () => {
              setProduct(null);
              setDetectedJson('');
              setScanResult('');
              setApiJson('');
              setMessage('Scanner wird initialisiert…');
              setMessageType('info');
              const byDevice = selectedDeviceId
                ? { video: { deviceId: { exact: selectedDeviceId } } }
                : null;
              try {
                if (byDevice) {
                  const s = await navigator.mediaDevices.getUserMedia(byDevice);
                  s.getTracks().forEach((t) => t.stop());
                  setVideoConstraints(byDevice.video);
                  setScannerActive(true);
                  setMessage('Kamera bereit. Halte den Code vor die Kamera.');
                  setMessageType('success');
                  return;
                }
              } catch (e0) {
                // fällt in Fallbacks unten
              }

              try {
                // Fallback 1: Umgebungskamera
                const env = { video: { facingMode: 'environment' } };
                let stream = await navigator.mediaDevices.getUserMedia(env);
                stream.getTracks().forEach((t) => t.stop());
                setVideoConstraints(env.video);
                setScannerActive(true);
                setMessage('Kamera bereit. Halte den Code vor die Kamera.');
                setMessageType('success');
              } catch (e1) {
                try {
                  // Fallback 2: Frontkamera
                  const user = { video: { facingMode: 'user' } };
                  let stream2 = await navigator.mediaDevices.getUserMedia(user);
                  stream2.getTracks().forEach((t) => t.stop());
                  setVideoConstraints(user.video);
                  setScannerActive(true);
                  setMessage('Kamera (Front) bereit. Halte den Code vor die Kamera.');
                  setMessageType('success');
                } catch (e2) {
                  const msg = e2?.message || 'Kein Zugriff auf Kamera. Prüfe Berechtigungen.';
                  setMessage(msg);
                  setMessageType('error');
                  setErrorLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`].slice(-10));
                }
              }
            }}
            disabled={!accepted}
            style={{
              fontSize: 24,
              padding: '16px 32px',
              borderRadius: 12,
              border: 'none',
              background: '#61dafb',
              color: '#000',
              cursor: accepted ? 'pointer' : 'not-allowed',
            }}
          >
            Scannen
          </button>

          {scannerActive && accepted && (
            <div style={{ marginTop: 24, width: 360, height: 240, background: '#000', borderRadius: 8, overflow: 'hidden' }}>
              <Scanner
                constraints={videoConstraints}
                onScan={(detected) => {
                  if (Array.isArray(detected) && detected.length > 0) {
                    const text = detected[0]?.rawValue ?? '';
                    if (text) {
                      setScanResult(text);
                      const isValid = detected[0]?.format === 'ean_13' ? validateEAN13(text) : true;
                      setMessage(`Erfolgreich gescannt: ${text}${detected[0]?.format === 'ean_13' ? (isValid ? ' (EAN-13 gültig)' : ' (EAN-13 ungültig)') : ''}`);
                      setMessageType(isValid ? 'success' : 'error');
                      try {
                        setDetectedJson(JSON.stringify(detected, null, 2));
                      } catch (_) {
                        setDetectedJson(String(detected));
                      }
                      setScannerActive(false);
                      fetchProduct(text);
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
          )}

          {apiJson && (
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

          {product && (
            <div style={{ marginTop: 12, width: 360, maxWidth: '90%', textAlign: 'left' }}>
              <strong>Produkt:</strong> {product.product_name || product.generic_name || 'Unbekannt'}
              <div>Marke(n): {product.brands || '—'}</div>
              <div>Kategorien: {product.categories || '—'}</div>
              {product.nutriments && (
                <div style={{ marginTop: 8 }}>
                  <strong>Nährwerte (100g):</strong>
                  <div>Energie: {product.nutriments.energy_kcal || product.nutriments.energy || '—'}</div>
                  <div>Zucker: {product.nutriments.sugars || '—'} g</div>
                  <div>Fett: {product.nutriments.fat || '—'} g</div>
                  <div>Eiweiß: {product.nutriments.proteins || '—'} g</div>
                  <div>Salz: {product.nutriments.salt || '—'} g</div>
                </div>
              )}
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
        </div>
      </header>
    </div>
  );
}

export default App;