import { pipeline, env } from '@huggingface/transformers';
import { TONE_CONFIG } from '../utils/config.js';

export class RootFactsService {
  constructor() {
    this.generator = null;
    this.isModelLoaded = false;
    this.isGenerating = false;
    this.config = { model: 'onnx-community/Qwen1.5-0.5B-Chat-ONNX' };
    this.currentBackend = null;
    this.currentTone = TONE_CONFIG?.defaultTone || 'normal';
    this.onProgress = null;
  }

  // TODO [Basic] Muat model dan inisialisasi pipeline text2text-generation
  // TODO [Advance] Implementasikan strategi Backend Adaptive
  async loadModel() {
    try {
      if (navigator.gpu) {
        env.backends.onnx.wasm.numThreads = 4;
        this.currentBackend = 'webgpu';
      } else {
        this.currentBackend = 'wasm';
      }
      console.log(`[RootFactsService] Menggunakan backend: ${this.currentBackend}`);

      this.generator = await pipeline('text-generation', this.config.model, {
        progress_callback: (progress) => {
          if (progress.total) {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            console.log(`[RootFactsService] Memuat model generator AI: ${percent}% (${progress.file || ''})`);
            if (this.onProgress) this.onProgress(percent);
          } else if (progress.status) {
            console.log(`[RootFactsService] Status: ${progress.status}`, progress);
          }
        }
      });

      this.isModelLoaded = true;
      console.log('[RootFactsService] Model generator berhasil dimuat.');
      return this.generator;
    } catch (error) {
      console.error('[RootFactsService] Gagal memuat model Generative AI:', error);
      this.isModelLoaded = false;
      throw error;
    }
  }

  // TODO [Advance] Konfigurasi tone fakta yang dihasilkan
  setTone(tone) {
    this.currentTone = tone;
    console.log(`[RootFactsService] Tone fakta diubah menjadi: ${this.currentTone}`);
  }

  // TODO [Basic] Lakukan prediksi pada elemen gambar yang diberikan dan kembalikan hasilnya
  // TODO [Skilled] Konfigurasikan parameter generasi berdasarkan kebutuhan
  // TODO [Advance] Implemenasikan parameter tone untuk mengatur nada fakta yang dihasilkan
  async generateFacts(vegetableName) {
    if (!this.isReady()) {
      console.error('[RootFactsService] generateFacts dipanggil tapi model belum siap.', {
        isModelLoaded: this.isModelLoaded,
        generatorExists: this.generator !== null,
      });
      throw new Error('Model generator belum siap. Panggil loadModel() terlebih dahulu.');
    }

    if (this.isGenerating) {
      console.warn('[RootFactsService] Proses pembuatan fakta sedang berjalan, request diabaikan.');
      return null;
    }

    this.isGenerating = true;

    try {
      // [Advance] Menyusun prompt dinamis dengan menyertakan parameter tone bahasa.
      const userInstruction = `Berikan satu fakta unik dan menarik tentang sayuran ${vegetableName} dengan nada bicara ${this.currentTone}. Jawab langsung intinya dalam maksimal 2 kalimat menggunakan Bahasa Indonesia.`;

      const messages = [
        {
          role: 'system',
          content: 'Kamu adalah asisten yang selalu menjawab singkat dalam Bahasa Indonesia, tidak mengulang kata, dan langsung ke inti jawaban.',
        },
        { role: 'user', content: userInstruction },
      ];

      console.log('[RootFactsService] Mengirim messages:', messages);

      // [Skilled] Parameter konfigurasi generasi teks agar respons terkendali dan kreatif
      const output = await this.generator(messages, {
        max_new_tokens: 80,
        min_new_tokens: 15,
        temperature: 0.7,
        do_sample: true,
        top_k: 50,
        top_p: 0.9,
        repetition_penalty: 1.3,
        no_repeat_ngram_size: 3,
      });

      this.isGenerating = false;

      console.log('[RootFactsService] Raw output dari model:', output);

      if (!Array.isArray(output) || !output[0]) {
        console.error('[RootFactsService] Struktur output tidak sesuai ekspektasi:', output);
        throw new Error('Format output dari model generator tidak dikenali.');
      }

      let generatedText = output[0].generated_text;

      if (Array.isArray(generatedText)) {
        const lastMessage = generatedText[generatedText.length - 1];
        generatedText = lastMessage?.content ?? '';
      }

      if (typeof generatedText !== 'string') {
        console.error('[RootFactsService] generated_text bukan string setelah parsing:', generatedText);
        throw new Error('Tidak bisa mengekstrak teks dari hasil generate.');
      }

      generatedText = generatedText.trim();

      if (!generatedText) {
        console.warn('[RootFactsService] Hasil generate tetap kosong setelah parsing.');
        throw new Error('Model tidak menghasilkan teks apa pun.');
      }

      return generatedText;
    } catch (error) {
      this.isGenerating = false;
      console.error('[RootFactsService] Gagal menghasilkan fakta unik:', error);
      throw error;
    }
  }

  // TODO [Basic] Periksa apakah model sudah dimuat dan siap digunakan
  isReady() {
    return this.isModelLoaded && this.generator !== null;
  }
}