/**
 * Web Audio API & 自己相関法 (Autocorrelation) によるリアルタイム・ピッチ検出モジュール
 */

const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

class PitchDetector {
  constructor() {
    this.audioCtx = null;
    this.analyser = null;
    this.mediaStream = null;
    this.isListening = false;
    this.animationId = null;
    this.onPitchDetected = null; // callback: ({ note, freq, clarity, normNote }) => {}
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.minVolumeRMS = 0.025; // ギター生音用バランス音量閾値 (雑音排除しつつ生音ピック弾きを感度よくキャッチ)
  }



  // マイクアクセスの開始
  async start(onPitchDetectedCallback) {
    if (this.isListening) return true;
    this.onPitchDetected = onPitchDetectedCallback;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false
        }
      });

      const source = this.audioCtx.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = this.bufferSize;

      source.connect(this.analyser);
      this.isListening = true;

      this.processLoop();
      return true;
    } catch (err) {
      console.error('マイクアクセスの取得に失敗しました:', err);
      this.isListening = false;
      return false;
    }
  }

  // 停止
  stop() {
    this.isListening = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }

  // ループ解析
  processLoop() {
    if (!this.isListening) return;

    this.analyser.getFloatTimeDomainData(this.buffer);
    const result = this.autoCorrelate(this.buffer, this.audioCtx.sampleRate);

    if (result && this.onPitchDetected) {
      this.onPitchDetected(result);
    } else if (this.onPitchDetected) {
      this.onPitchDetected({ note: null, freq: 0 });
    }

    this.animationId = requestAnimationFrame(() => this.processLoop());
  }

  // 自己相関法 (Autocorrelation) によるピッチ算出
  autoCorrelate(buf, sampleRate) {
    const SIZE = buf.length;

    // 1. RMS (Root Mean Square) による音量レベル確認
    let sumOfSquares = 0;
    for (let i = 0; i < SIZE; i++) {
      const val = buf[i];
      sumOfSquares += val * val;
    }
    const rms = Math.sqrt(sumOfSquares / SIZE);

    // 音量が静かすぎる場合はノイズとみなす
    if (rms < this.minVolumeRMS) {
      return null;
    }

    // 2. 信号のトリミング（ゼロ交差の探索）
    let r1 = 0;
    let r2 = SIZE - 1;
    const thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buf[i]) < thres) {
        r1 = i;
        break;
      }
    }
    for (let i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buf[SIZE - i]) < thres) {
        r2 = SIZE - i;
        break;
      }
    }

    const trimmedBuf = buf.slice(r1, r2);
    const cSize = trimmedBuf.length;

    // 3. 自己相関配列の計算
    const c = new Float32Array(cSize);
    for (let i = 0; i < cSize; i++) {
      for (let j = 0; j < cSize - i; j++) {
        c[i] = c[i] + trimmedBuf[j] * trimmedBuf[j + i];
      }
    }

    // 最初の大規模な谷を探す
    let d = 0;
    while (c[d] > c[d + 1]) {
      d++;
    }

    // 最大のピークを探索
    let maxval = -1;
    let maxpos = -1;
    for (let i = d; i < cSize; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }

    let T0 = maxpos;
    if (T0 <= 0) return null;

    // 4. 2次補間 (Parabolic Interpolation) で精度の向上
    const x1 = c[T0 - 1];
    const x2 = c[T0];
    const x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;

    if (a) {
      T0 = T0 - b / (2 * a);
    }

    const freq = sampleRate / T0;

    // 人間の音域・ギター音域の妥当な周波数フィルター (40Hz〜2000Hz)
    if (freq < 40 || freq > 2000) {
      return null;
    }

    // 5. 周波数から音名 (Note) へ変換
    const noteNum = 12 * (Math.log(freq / 440) / Math.log(2)) + 69;
    const roundedNote = Math.round(noteNum);
    const noteIdx = ((roundedNote % 12) + 12) % 12;

    const noteFlat = NOTES_FLAT[noteIdx];
    const noteSharp = NOTES_SHARP[noteIdx];

    return {
      freq: Math.round(freq),
      note: noteFlat,
      noteSharp,
      noteIndex: noteIdx,
      rms
    };
  }
}

export const pitchDetector = new PitchDetector();
