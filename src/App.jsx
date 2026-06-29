import { useRef, useState, useEffect } from 'react';
import Header from './components/Header';
import CameraSection from './components/CameraSection';
import InfoPanel from './components/InfoPanel';
import { useAppState } from './hooks/useAppState';
import { APP_CONFIG } from './utils/config';

import { CameraService } from './services/CameraService';
import { DetectionService } from './services/DetectionService';
import { RootFactsService } from './services/RootFactsService';

function App() {
  const { state, actions } = useAppState();
  const detectionCleanupRef = useRef(null);
  const isRunningRef = useRef(false);
  const [currentTone, setCurrentTone] = useState('normal');
  const lastDetectedLabelRef = useRef('');
  const servicesRef = useRef(null);

  // TODO [Basic] Inisialisasi layanan deteksi, kamera, dan generator fakta saat aplikasi dimuat
  useEffect(() => {
    let isMounted = true;
    async function initServices() {
      actions.setModelStatus('loading');
      try {
        const cameraInst = new CameraService();
        const detectorInst = new DetectionService();
        const generatorInst = new RootFactsService();

        actions.setServices({
          camera: cameraInst,
          detector: detectorInst,
          generator: generatorInst,
        });
        servicesRef.current = {
          camera: cameraInst,
          detector: detectorInst,
          generator: generatorInst,
        };

        detectorInst.onProgress = (percent) => {
          if (isMounted) {
            actions.setModelStatus(`Memuat Model Deteksi... ${percent}%`);
          }
        };

        await detectorInst.loadModel();

        try {
          actions.setModelStatus('Memuat Model Generator AI...');
          await generatorInst.loadModel();
        } catch (e) {
          console.warn('Generator gagal dimuat', e);
        }

        if (isMounted) {
          actions.setModelStatus('Model AI Siap');
          actions.setAppState('idle');
        }
      } catch (err) {
        console.error(err);
        if (isMounted) {
          actions.setModelStatus('error');
          actions.setError('Gagal memuat model AI. Pastikan koneksi internet stabil.');
        }
      }
    }
    initServices();

    // TODO [Basic] Bersihkan sumber daya saat komponen ditinggalkan
    return () => {
      isMounted = false;
      isRunningRef.current = false;
      if (detectionCleanupRef.current) {
        clearTimeout(detectionCleanupRef.current);
      }
      if (servicesRef.current?.camera) {
        servicesRef.current.camera.stopCamera();
      }
    };
  }, []);

  // TODO [Basic] Fungsi untuk memulai loop deteksi
  const startDetectionLoop = () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    lastDetectedLabelRef.current = '';
    let consecutiveCount = 0;
    let lastCandidateLabel = '';
    const STABILITY_REQUIRED = 4;

    const loop = async () => {
      if (!isRunningRef.current) return;

      if (state.services?.camera?.isReady()) {
        try {
          const result = await state.services.detector.predict(state.services.camera.video);
          actions.setDetectionResult(result);

          const EFFECTIVE_THRESHOLD = 50;
          const scorePercent = result ? result.score * 100 : 0;
          const passesThreshold = result && scorePercent >= EFFECTIVE_THRESHOLD && result.className !== 'Tidak Dikenali';

          if (passesThreshold) {
            if (result.className === lastCandidateLabel) {
              consecutiveCount += 1;
            } else {
              lastCandidateLabel = result.className;
              consecutiveCount = 1;
            }
          } else {
            lastCandidateLabel = '';
            consecutiveCount = 0;
            actions.setAppState('idle');
          }

          if (consecutiveCount >= STABILITY_REQUIRED) {
            lastDetectedLabelRef.current = result.className;
            actions.setAppState('analyzing');
            actions.setFunFactData(null);
            await new Promise((resolve) => setTimeout(resolve, APP_CONFIG.analyzingDelay));

            try {
              const fact = await Promise.race([
                state.services.generator.generateFacts(result.className),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('Timeout generate fact')), 30000)
                ),
              ]);
              actions.setFunFactData(fact || 'error');
            } catch (genErr) {
              console.error('Gagal generate fun fact:', genErr);
              actions.setFunFactData('error');
            }
            actions.setAppState('result');

            isRunningRef.current = false;
            if (state.services?.camera) {
              state.services.camera.stopCamera();
            }
            actions.setRunning(false);
            return;
          }
        } catch (err) {
          console.error('Error pada loop deteksi:', err);
          actions.setAppState('idle');
        }
      }
      detectionCleanupRef.current = setTimeout(loop, APP_CONFIG.detectionRetryInterval);
    };
    loop();
  };

  // TODO [Basic] Fungsi untuk memulai dan menghentikan kamera
  const toggleCamera = async (selectedCameraId = null) => {
    if (state.isRunning) {
      isRunningRef.current = false;
      if (detectionCleanupRef.current) {
        clearTimeout(detectionCleanupRef.current);
        detectionCleanupRef.current = null;
      }
      if (state.services?.camera) {
        state.services.camera.stopCamera();
      }
      actions.setRunning(false);
      actions.setAppState('idle');
      actions.setDetectionResult(null);
      actions.setFunFactData(null);
    } else {
      try {
        if (state.services?.camera) {
          actions.setDetectionResult(null);
          actions.setFunFactData(null);
          actions.setAppState('idle');

          await state.services.camera.startCamera(
            typeof selectedCameraId === 'string' ? selectedCameraId : undefined
          );
          actions.setRunning(true);
          startDetectionLoop();
        }
      } catch (err) {
        console.error(err);
        actions.setError('Gagal mengakses kamera perangkat.');
      }
    }
  };

  // TODO [Advance] Fungsi untuk mengubah nada fakta yang dihasilkan
  const handleToneChange = (toneValue) => {
    setCurrentTone(toneValue);
    if (state.services?.generator) {
      state.services.generator.setTone(toneValue);
    }

    const currentLabel = state.detectionResult?.className;
    if (currentLabel && state.appState === 'result' && state.services?.generator) {
      actions.setAppState('analyzing');
      actions.setFunFactData(null);
      state.services.generator.generateFacts(currentLabel)
        .then((newFact) => {
          actions.setFunFactData(newFact || 'error');
          actions.setAppState('result');
        })
        .catch((err) => {
          console.error(err);
          actions.setFunFactData('error');
          actions.setAppState('result');
        });
    }
  };

  // TODO [Skilled] Fungsi untuk menyalin fakta ke clipboard
  const copyToClipboard = async () => {
    if (!state.funFactData || state.funFactData === 'error') return false;
    try {
      await navigator.clipboard.writeText(state.funFactData);
      alert('Fakta unik berhasil disalin ke clipboard!');
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  return (
    <div className="app-container">
      <Header modelStatus={state.modelStatus} />

      <main className="main-content">
        <CameraSection
          isRunning={state.isRunning}
          services={state.services}
          modelStatus={state.modelStatus}
          error={state.error}
          currentTone={currentTone}
          onToggleCamera={toggleCamera}
          onToneChange={handleToneChange}
        />

        <InfoPanel
          appState={state.appState}
          detectionResult={state.detectionResult}
          funFactData={state.funFactData}
          error={state.error}
          onCopyFact={copyToClipboard}
        />
      </main>

      <footer className="footer">
        <p>Powered by TensorFlow.js & Transformers.js</p>
      </footer>

      {state.error && (
        <div style={{
          position: 'fixed',
          bottom: '1rem',
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: '380px',
          padding: '0.875rem 1rem',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 'var(--radius-md)',
          color: '#991b1b',
          fontSize: '0.8125rem',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          zIndex: 1000
        }}>
          <strong>Error:</strong> {state.error}
          <button
            onClick={() => actions.setError(null)}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: '#991b1b',
              padding: 0,
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
