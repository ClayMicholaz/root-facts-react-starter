import * as tf from '@tensorflow/tfjs';

export class DetectionService {
  constructor() {
    this.model = null;
    this.labels = [];
    this.config = {
      modelUrl: '/model/model.json',
      metadataUrl: '/model/metadata.json',
    };
    // Opsional: App.jsx bisa set callback ini untuk menerima persentase loading
    this.onProgress = null;
  }

  // TODO [Basic] Muat model dan metadata secara bersamaan, lalu simpan ke instance
  // TODO [Advance] Implementasikan strategi Backend Adaptive
  async loadModel() {
    try {
      // [Advance] Backend Adaptif: cek WebGPU dulu, fallback ke WebGL, lalu CPU
      if (typeof navigator !== 'undefined' && navigator.gpu && tf.findBackend('webgpu')) {
        await tf.setBackend('webgpu');
      } else if (tf.findBackend('webgl')) {
        await tf.setBackend('webgl');
      } else {
        await tf.setBackend('cpu');
      }
      await tf.ready();
      console.log(`TensorFlow.js menggunakan backend: ${tf.getBackend()}`);

      if (this.onProgress) this.onProgress(10);

      const [loadedModel, response] = await Promise.all([
        tf.loadLayersModel(this.config.modelUrl, {
          onProgress: (fraction) => {
            if (this.onProgress) {
              this.onProgress(Math.round(10 + fraction * 80));
            }
          },
        }),
        fetch(this.config.metadataUrl),
      ]);

      this.model = loadedModel;

      const metadata = await response.json();
      this.labels = metadata.labels || metadata.label || [];

      if (this.onProgress) this.onProgress(100);

      return this.model;
    } catch (error) {
      console.error('Gagal memuat model TensorFlow.js:', error);
      throw error;
    }
  }

  // TODO [Basic] Lakukan prediksi pada elemen gambar yang diberikan dan kembalikan hasilnya
  async predict(imageElement) {
    if (!this.isLoaded()) {
      throw new Error(
        'Model belum dimuat. Panggil loadModel() terlebih dahulu.',
      );
    }

    return tf.tidy(() => {
      const tensor = tf.browser
        .fromPixels(imageElement)
        .resizeBilinear([224, 224])
        .toFloat()
        .div(255)
        .expandDims();

      const predictions = this.model.predict(tensor);
      const probabilities = predictions.dataSync();

      let maxScore = -1;
      let maxIndex = -1;
      for (let i = 0; i < probabilities.length; i++) {
        if (probabilities[i] > maxScore) {
          maxScore = probabilities[i];
          maxIndex = i;
        }
      }

      return {
        className: this.labels[maxIndex] || 'Tidak Dikenali',
        score: maxScore,
      };
    });
  }

  // TODO [Basic] Periksa apakah model sudah dimuat dan siap digunakan
  isLoaded() {
    return this.model !== null && this.labels.length > 0;
  }
}