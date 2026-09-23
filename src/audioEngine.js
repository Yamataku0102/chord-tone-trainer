/**
 * Web Audio API ベースの音響エンジン（メトロノーム、カウントイン、バッキング和音）
 */
import { getChordTones, noteToIndex } from './chordUtils.js';

class AudioEngine {
  constructor() {
    this.audioCtx = null;
    this.bpm = 60;
    this.isPlaying = false;
    this.isPaused = false;
    this.backingEnabled = true; // バッキング和音再生スイッチ
    this.timerId = null;

    this.currentMeasure = 0;
    this.currentBeat = 0; // 0-based beat in measure
    this.countInBeatsLeft = 0;

    // コールバック関数
    this.onTick = null;
    this.onEnd = null;

    this.songData = null; // { beatsPerMeasure, measures }
    this.transposition = 0;
    this.playMode = 'auto'; // 'auto' | 'mic'
  }

  setPlayMode(mode) {
    this.playMode = mode;
  }


  // AudioContextの有効化（ユーザー操作イベント内で実行）
  initAudio() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  // 設定のロード
  setSong(songData, transposition = 0) {
    this.songData = songData;
    this.transposition = transposition;
  }

  setBpm(bpm) {
    this.bpm = Math.max(40, Math.min(240, bpm));
  }

  setBackingEnabled(enabled) {
    this.backingEnabled = enabled;
  }

  // 演奏スタート (countInBeats: 0, 4, 8, startMeasure: 開始小節インデックス)
  start(countInBeats = 4, startMeasure = 0) {
    this.initAudio();

    if (this.timerId) clearTimeout(this.timerId);
    this.stopActiveBackingTones();

    this.isPlaying = true;
    this.isPaused = false;
    
    const maxIdx = (this.songData?.measures?.length || 1) - 1;
    this.currentMeasure = Math.max(0, Math.min(startMeasure, maxIdx));
    this.currentBeat = 0;
    this.countInBeatsLeft = countInBeats;

    this.scheduleNextTick();
  }

  pause() {
    this.isPlaying = false;
    this.isPaused = true;
    if (this.timerId) clearTimeout(this.timerId);
    this.stopActiveBackingTones();
  }

  resume() {
    if (!this.isPaused) return;
    this.initAudio();
    this.isPlaying = true;
    this.isPaused = false;
    this.scheduleNextTick();
  }

  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    if (this.timerId) clearTimeout(this.timerId);
    this.stopActiveBackingTones();
    this.currentMeasure = 0;
    this.currentBeat = 0;
    this.countInBeatsLeft = 0;
  }

  // 特定の小節に位置ジャンプ（タップして途中から再生/選択）
  jumpToMeasure(measureIndex) {
    if (!this.songData || !this.songData.measures) return;
    const maxIdx = this.songData.measures.length - 1;
    this.currentMeasure = Math.max(0, Math.min(measureIndex, maxIdx));
    this.currentBeat = 0;

    if (this.isPlaying) {
      if (this.timerId) clearTimeout(this.timerId);
      this.stopActiveBackingTones();
      this.countInBeatsLeft = 0; // タップ途中再生時は即座にカウントインなしで進める
      this.scheduleNextTick();
    } else {
      // 停止中であれば選択された小節の頭コードのバッキング音を鳴らして確認できるようにする
      const m = this.songData.measures[this.currentMeasure];
      const chord = m?.chords[0];
      if (this.backingEnabled && chord) {
        this.initAudio();
        this.playBackingChord(chord);
      }
    }
  }

  // 現在のコードが小節内で占める拍の範囲 [startBeat, endBeat] を取得
  getCurrentChordBeatRange() {
    if (!this.songData || !this.songData.measures) return { start: 0, end: 3 };
    const m = this.songData.measures[this.currentMeasure];
    if (!m || !m.chords || m.chords.length === 0) return { start: 0, end: 3 };

    const currentChord = m.chords[this.currentBeat] || m.chords[0];
    let start = this.currentBeat;
    while (start > 0 && m.chords[start - 1] === currentChord) {
      start--;
    }
    let end = this.currentBeat;
    while (end < m.chords.length - 1 && m.chords[end + 1] === currentChord) {
      end++;
    }
    return { start, end };
  }

  // 小節内で「次の異なるコード」が始まる拍のインデックスを取得 (無ければ -1)
  getNextChordBeatIndex() {
    if (!this.songData || !this.songData.measures) return -1;
    const m = this.songData.measures[this.currentMeasure];
    if (!m || !m.chords) return -1;

    const currentChord = m.chords[this.currentBeat] || m.chords[0];
    for (let i = this.currentBeat + 1; i < m.chords.length; i++) {
      if (m.chords[i] !== currentChord) {
        return i;
      }
    }
    return -1;
  }

  // マイク判定モード用: 現在のコードクリア時に「同一小節内の次のコード」または「次の小節の頭コード」へ進行
  advanceToNextChord() {
    if (!this.songData || !this.songData.measures) return;

    const nextBeatIdx = this.getNextChordBeatIndex();
    if (nextBeatIdx !== -1) {
      // 同じ小節内の次のコードへ進行
      this.currentBeat = nextBeatIdx;
    } else {
      // 次の小節の頭コードへ進行
      this.currentMeasure = (this.currentMeasure + 1) % this.songData.measures.length;
      this.currentBeat = 0;
    }

    if (this.isPlaying) {
      this.stopActiveBackingTones();
      const m = this.songData.measures[this.currentMeasure];
      const chord = m?.chords[this.currentBeat];
      if (this.backingEnabled && chord) {
        this.playBackingChord(chord);
      }
    }
  }

  // タイマー進行ループ
  scheduleNextTick() {
    if (!this.isPlaying) return;

    const intervalMs = (60 / this.bpm) * 1000;

    // カウントイン中
    if (this.countInBeatsLeft > 0) {
      this.playMetronomeClick(true);
      if (this.onTick) {
        this.onTick({
          isCountIn: true,
          countInLeft: this.countInBeatsLeft,
          measureIndex: 0,
          beatIndex: 0,
          chord: null
        });
      }
      this.countInBeatsLeft--;
    } else {
      // 通常の曲再生中
      const beatsPerMeasure = this.songData?.beatsPerMeasure || 4;
      const measures = this.songData?.measures || [];

      if (this.currentMeasure >= measures.length) {
        // 曲終了
        this.stop();
        if (this.onEnd) this.onEnd();
        return;
      }

      const m = measures[this.currentMeasure];
      const chord = m?.chords[this.currentBeat] || 'C';

      // メトロノーム音 (1拍目はアクセント高音)
      const isAccent = (this.currentBeat === 0);
      this.playMetronomeClick(isAccent);

      // 1拍目またはコード変化時にバッキング和音再生
      const prevBeatChord = this.currentBeat > 0 ? m?.chords[this.currentBeat - 1] : null;
      if (this.backingEnabled && (isAccent || chord !== prevBeatChord)) {
        this.playBackingChord(chord);
      }

      if (this.onTick) {
        this.onTick({
          isCountIn: false,
          countInLeft: 0,
          measureIndex: this.currentMeasure,
          beatIndex: this.currentBeat,
          chord,
          measureObj: m
        });
      }

      // マイク音判定モード時は、クリアするまで同一コードの拍範囲内でのみメトロノーム拍を巡回
      if (this.playMode === 'mic') {
        const range = this.getCurrentChordBeatRange();
        this.currentBeat++;
        if (this.currentBeat > range.end) {
          this.currentBeat = range.start;
        }
      } else {
        // 自動進行モード時: 次の拍に進める
        this.currentBeat++;
        if (this.currentBeat >= beatsPerMeasure) {
          this.currentBeat = 0;
          this.currentMeasure++;
        }
      }
    }


    this.timerId = setTimeout(() => this.scheduleNextTick(), intervalMs);
  }

  // メトロノーム発声
  playMetronomeClick(isAccent) {
    if (!this.audioCtx) return;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isAccent ? 1200 : 800, this.audioCtx.currentTime);

    gain.gain.setValueAtTime(0.6, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.08);
  }

  // バッキング和音＆ベース音発声
  playBackingChord(symbol) {
    if (!this.audioCtx || !symbol) return;

    // 前の和音が鳴っている場合は音被りを防ぐために素早く消音（フェードアウト）
    this.stopActiveBackingTones();

    const tones = getChordTones(symbol);
    if (!tones || tones.length === 0) return;

    const now = this.audioCtx.currentTime;
    
    // 1拍あたりの秒数
    const beatSec = 60 / this.bpm;
    // 2拍目の終わりくらい（約1.8拍分）まで発音してフェードアウト
    const duration = beatSec * 1.8;

    // ベース音 (ルート octave 3: MIDI 48..59)
    const rootIdx = noteToIndex(tones[0].note);
    const bassFreq = 440 * Math.pow(2, (rootIdx + 48 - 69) / 12);
    this.playTone(bassFreq, 0.32, duration, 'triangle');

    // 和音音色 (ルート音を octave 4 (MIDI 60) 付近にし、インターバルに従って正確にボイシング展開)
    tones.forEach((t) => {
      const midiNote = 60 + rootIdx + (t.semitones || 0);
      const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
      this.playTone(freq, 0.11, duration, 'sine');
    });
  }

  playTone(freq, volume, duration, waveType = 'sine') {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    const now = this.audioCtx.currentTime;

    osc.type = waveType;
    osc.frequency.setValueAtTime(freq, now);

    // アタックとエンベロープ: 2拍目終わりに向かってスムーズにフェードアウト
    gain.gain.setValueAtTime(volume, now);
    // 最初の 40% の期間はサステインし、後半 60% で 0.001 へ向かって自然に滑らか減衰
    const sustainTime = duration * 0.35;
    gain.gain.setValueAtTime(volume, now + sustainTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.05);

    // アクティブノードとして管理（次回消音用）
    if (!this.activeBackingNodes) this.activeBackingNodes = [];
    this.activeBackingNodes.push({ osc, gain });

    // 自動クリーンアップ
    osc.onended = () => {
      if (this.activeBackingNodes) {
        this.activeBackingNodes = this.activeBackingNodes.filter(item => item.osc !== osc);
      }
    };
  }

  // 直前に鳴っていたバッキング音を即座にフェードアウト・消音
  stopActiveBackingTones() {
    if (!this.audioCtx || !this.activeBackingNodes) return;
    const now = this.audioCtx.currentTime;
    
    this.activeBackingNodes.forEach(({ osc, gain }) => {
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0.0001, now + 0.03); // 30msでクイックフェードアウト
        osc.stop(now + 0.04);
      } catch (e) {
        // すでに停止している場合を無視
      }
    });
    this.activeBackingNodes = [];
  }

  // 弦とフレットから音をポーンと鳴らす（ギター音源風エミュレーション）
  playFretNote(stringNum, fret) {
    this.initAudio();
    const stringBaseMidi = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
    const baseMidi = stringBaseMidi[stringNum] || 60;
    const midiNote = baseMidi + fret;
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    // ギター風の倍音成分のあるトライアングル波
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2); // 1.2秒かけて減衰

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(now);
    osc.stop(now + 1.25);
  }
}

export const audioEngine = new AudioEngine();


