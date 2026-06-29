export class CameraService {
  constructor() {
    this.stream = null;
    this.video = null;
    this.canvas = null;
    this.config = null;
    this.cameras = [];
    this.fps = 30;
  }

  setVideoElement(videoElement) {
    this.video = videoElement;
  }

  setCanvasElement(canvasElement) {
    this.canvas = canvasElement;
  }

  // TODO [Basic] Tambahkan konfigurasi kamera untuk mendapatkan daftar perangkat input video
  // TODO [Basic] Dapatkan constraints kamera berdasarkan konfigurasi dan kamera yang dipilih
  async loadCameras() {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });

      const devices = await navigator.mediaDevices.enumerateDevices();

      // Filter hanya untuk perangkat input video (kamera)
      this.cameras = devices.filter((device) => device.kind === 'videoinput');
      return this.cameras;
    } catch (error) {
      console.error('Gagal memuat daftar kamera:', error);
      return [];
    }
  }

  // TODO [Basic] Memulai kamera dengan perangkat yang dipilih dan menampilkan pada elemen video
  async startCamera(selectedCameraId) {
    this.stopCamera();

    if (!this.video) {
      throw new Error('Elemen video belum siap.');
    }
    if (!window.isSecureContext) {
      throw new Error('Kamera hanya bisa diakses melalui HTTPS atau localhost.');
    }

    if (this.cameras.length === 0) {
      await this.loadCameras();
    }

    const isValidDeviceId = selectedCameraId &&
      this.cameras.some((cam) => cam.deviceId === selectedCameraId);

    const buildConstraints = (useFacingMode) => ({
      video: {
        ...(isValidDeviceId && !useFacingMode
          ? { deviceId: { exact: selectedCameraId } }
          : selectedCameraId === 'front'
            ? { facingMode: 'user' }
            : selectedCameraId === 'default'
              ? { facingMode: 'environment' }
              : {}),
        frameRate: { ideal: this.fps },
      },
    });

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(buildConstraints(false));
    } catch (error) {
      if (error.name === 'OverconstrainedError') {
        console.warn('Constraint terlalu spesifik, mencoba fallback tanpa deviceId/facingMode...');
        try {
          // Fallback 1: pakai facingMode saja
          this.stream = await navigator.mediaDevices.getUserMedia(buildConstraints(true));
        } catch (fallbackError) {
          console.warn('Fallback facingMode gagal, mencoba constraint paling longgar...');
          this.stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
      } else {
        console.error('Gagal menjalankan kamera:', error);
        throw error;
      }
    }

    this.video.srcObject = this.stream;
    await this.video.play();
    return this.stream;
  }

  // TODO [Basic] Menghentikan siaran kamera dan membersihkan sumber daya
  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.video) {
      this.video.srcObject = null;
    }
  }

  // TODO [Skilled] Implementasikan metode untuk mengatur FPS kamera
  setFPS(fps) {
    this.fps = parseInt(fps, 10) || 30;

    if (this.isActive() && this.stream) {
      const videoTrack = this.stream.getVideoTracks()[0];
      if (videoTrack && typeof videoTrack.applyConstraints === 'function') {
        videoTrack
          .applyConstraints({ frameRate: { ideal: this.fps } })
          .catch((err) =>
            console.error('Gagal menerapkan FPS baru secara langsung:', err),
          );
      }
    }
  }

  // TODO [Basic] Periksa apakah kamera sedang aktif
  isActive() {
    return this.stream !== null && this.stream.active;
  }

  // TODO [Basic] Periksa apakah elemen video siap untuk digunakan
  isReady() {
    return (
      this.video !== null && !this.video.paused && this.video.readyState >= 2
    );
  }
}
