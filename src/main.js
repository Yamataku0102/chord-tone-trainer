/**
 * アプリケーションのメインコントローラー
 */
import songsData from './data/songs.json';
import { parseIrealChords } from './irealParser.js';
import { transposeChord, formatChordForDisplay, getFormattedChordTones } from './chordUtils.js';
import { audioEngine } from './audioEngine.js';
import { renderLeadSheet } from './components/LeadSheet.js';
import { renderFretboard } from './components/Fretboard.js';

// アプリ全体の状態管理
const state = {
  currentSong: songsData[0],
  parsedSong: null,
  transposition: 0,
  bpm: 60,
  countMode: 'R+3+5+7',
  startDegree: 'R',
  countInBeats: 4,
  showFretboard: false,
  enableBacking: true,
  isPlaying: false,
  isPaused: false
};

// DOM要素参照
const elements = {
  songSearch: document.getElementById('song-search'),
  songSelect: document.getElementById('song-select'),
  btnStart: document.getElementById('btn-start'),
  btnReset: document.getElementById('btn-reset'),
  bpmSlider: document.getElementById('bpm-slider'),
  bpmVal: document.getElementById('bpm-val'),
  bpmMinus10: document.getElementById('bpm-minus-10'),
  bpmMinus1: document.getElementById('bpm-minus-1'),
  bpmPlus1: document.getElementById('bpm-plus-1'),
  bpmPlus10: document.getElementById('bpm-plus-10'),
  transposeSelect: document.getElementById('transpose-select'),
  toggleFretboard: document.getElementById('toggle-fretboard'),
  toggleBacking: document.getElementById('toggle-backing'),
  countModeSelect: document.getElementById('count-mode-select'),
  startDegreeSelect: document.getElementById('start-degree-select'),
  countinSelect: document.getElementById('countin-select'),
  songInfoBadge: document.getElementById('song-info-badge'),
  bigChord: document.getElementById('big-chord'),
  nextChord: document.getElementById('next-chord'),
  countinBadge: document.getElementById('countin-badge'),
  chordTonesContainer: document.getElementById('chord-tones-container'),
  leadsheetContainer: document.getElementById('leadsheet-container'),
  fretboardContainer: document.getElementById('fretboard-container'),
  measureProgressText: document.getElementById('measure-progress-text')
};

// 初期化
function init() {
  populateSongList(songsData);
  loadSong(songsData[0]);
  setupEventListeners();
}

// 曲ドロップダウンの構築
function populateSongList(songs) {
  elements.songSelect.innerHTML = '';
  songs.forEach(song => {
    const opt = document.createElement('option');
    opt.value = song.id;
    opt.textContent = `${song.title} (${song.key})`;
    elements.songSelect.appendChild(opt);
  });
}

// 移調オプションの動的生成 (-6半音 〜 +6半音, 中央に0原曲キー)
function updateTransposeOptions(originalKeyStr) {
  if (!elements.transposeSelect) return;
  const currentShift = state.transposition;
  elements.transposeSelect.innerHTML = '';

  for (let shift = -6; shift <= 6; shift++) {
    const opt = document.createElement('option');
    opt.value = shift;

    let keyLabel = '';
    if (originalKeyStr) {
      const shiftedChord = transposeChord(originalKeyStr, shift);
      const formattedKey = formatChordForDisplay(shiftedChord);
      keyLabel = ` (${formattedKey})`;
    }

    if (shift === 0) {
      opt.textContent = `原曲キー (±0)${keyLabel}`;
    } else if (shift > 0) {
      opt.textContent = `+${shift} 半音${keyLabel}`;
    } else {
      opt.textContent = `${shift} 半音${keyLabel}`;
    }

    if (shift === currentShift) {
      opt.selected = true;
    }

    elements.transposeSelect.appendChild(opt);
  }
}

// 曲の読み込み
function loadSong(song) {
  audioEngine.stop();
  updatePlayButtonsState(false, false);

  state.currentSong = song;
  state.parsedSong = parseIrealChords(song.rawChords);

  updateTransposeOptions(song.key);

  audioEngine.setSong(state.parsedSong, state.transposition);

  elements.songInfoBadge.textContent = `${song.title} | 原曲Key: ${song.key} | ${song.style}`;

  // 初期表示のリードシート、表示エリアの更新
  renderCurrentState();
}

// アプリ全体の表示を現在の設定と曲状態に合わせて再描画
function renderCurrentState(currentMeasureIdx = 0, currentBeatIdx = 0) {
  if (!state.parsedSong || state.parsedSong.measures.length === 0) return;

  const measures = state.parsedSong.measures;
  const currentMeasure = measures[currentMeasureIdx] || measures[0];
  const rawChord = currentMeasure.chords[currentBeatIdx] || currentMeasure.chords[0];

  // トランスポーズ適用済みのコード
  const activeChordTransposed = transposeChord(rawChord, state.transposition);
  const activeChordDisplay = formatChordForDisplay(activeChordTransposed);

  // ネクストコードの決定
  let nextChordDisplay = '-';
  if (currentBeatIdx + 1 < currentMeasure.chords.length) {
    const nc = currentMeasure.chords[currentBeatIdx + 1];
    nextChordDisplay = formatChordForDisplay(transposeChord(nc, state.transposition));
  } else if (currentMeasureIdx + 1 < measures.length) {
    const nextM = measures[currentMeasureIdx + 1];
    const nc = nextM.chords[0];
    nextChordDisplay = formatChordForDisplay(transposeChord(nc, state.transposition));
  }

  // 大文字コード・ネクストコード表示
  elements.bigChord.textContent = activeChordDisplay || 'C';
  elements.nextChord.textContent = nextChordDisplay;
  elements.measureProgressText.textContent = `小節: ${currentMeasureIdx + 1} / ${measures.length}`;

  // 度数 & 音名カード表示
  const formattedTones = getFormattedChordTones(activeChordTransposed, state.countMode, state.startDegree);
  renderChordTonesCards(formattedTones);

  // リードシートの描画 (全体移調 & 現在小節ハイライト & 小節タップで途中再生/選択)
  renderLeadSheet(
    elements.leadsheetContainer,
    state.parsedSong,
    state.transposition,
    currentMeasureIdx,
    (clickedMeasureIdx) => {
      audioEngine.jumpToMeasure(clickedMeasureIdx);
      renderCurrentState(clickedMeasureIdx, 0);
    }
  );

  // ギター指板の描画 (音名表記 & 表示/非表示トグル)
  const targetNoteNames = formattedTones.map(t => t.note);
  renderFretboard(elements.fretboardContainer, targetNoteNames, state.showFretboard);
}

// 度数・音名カードのレンダリング
function renderChordTonesCards(tones) {
  elements.chordTonesContainer.innerHTML = '';
  tones.forEach(t => {
    const card = document.createElement('div');
    card.className = 'tone-card';
    card.innerHTML = `
      <div class="tone-degree">${t.degree}</div>
      <div class="tone-note">${t.note}</div>
    `;
    elements.chordTonesContainer.appendChild(card);
  });
}

// 演奏ボタンの状態制御
function updatePlayButtonsState(isPlaying, isPaused) {
  state.isPlaying = isPlaying;
  state.isPaused = isPaused;

  if (isPlaying) {
    elements.btnStart.textContent = '⏸ 一時停止';
    elements.btnStart.className = 'btn btn-warning';
  } else if (isPaused) {
    elements.btnStart.textContent = '▶️ 再スタート';
    elements.btnStart.className = 'btn btn-primary';
  } else {
    elements.btnStart.textContent = '▶️ スタート';
    elements.btnStart.className = 'btn btn-primary';
  }
}

// イベントリスナーの登録
function setupEventListeners() {
  // 曲検索
  elements.songSearch.addEventListener('input', (e) => {
    const rawQuery = e.target.value.toLowerCase().trim();
    // タイポ吸収 ('autumun' や 'autum' など)
    const normQuery = rawQuery.replace(/autumun|autum/g, 'autumn');

    const filtered = songsData.filter(s => {
      const t = s.title.toLowerCase();
      const c = s.composer.toLowerCase();
      return t.includes(rawQuery) || c.includes(rawQuery) ||
             (normQuery && (t.includes(normQuery) || c.includes(normQuery)));
    });

    populateSongList(filtered);

    if (filtered.length > 0) {
      // もし現在選択中の曲が検索結果に含まれていればその選択を維持
      const currentInFiltered = filtered.find(s => s.id === state.currentSong?.id);
      if (currentInFiltered) {
        elements.songSelect.value = currentInFiltered.id;
      } else {
        // 含まれていない場合のみ先頭曲をロード
        elements.songSelect.value = filtered[0].id;
        loadSong(filtered[0]);
      }
    }
  });

  // 曲選択ドロップダウン
  elements.songSelect.addEventListener('change', (e) => {
    const selectedId = parseInt(e.target.value, 10);
    const song = songsData.find(s => s.id === selectedId);
    if (song) loadSong(song);
  });

  // スタート / 一時停止 トグルボタン
  elements.btnStart.addEventListener('click', () => {
    if (!state.isPlaying && !state.isPaused) {
      // 最初からのスタート
      audioEngine.setBpm(state.bpm);
      audioEngine.setBackingEnabled(state.enableBacking);
      audioEngine.start(state.countInBeats);
      updatePlayButtonsState(true, false);
    } else if (state.isPlaying) {
      // 再生中 -> 一時停止へ
      audioEngine.pause();
      updatePlayButtonsState(false, true);
    } else if (state.isPaused) {
      // 一時停止中 -> 再スタートへ
      audioEngine.resume();
      updatePlayButtonsState(true, false);
    }
  });

  // リセット
  elements.btnReset.addEventListener('click', () => {
    audioEngine.stop();
    updatePlayButtonsState(false, false);
    elements.countinBadge.style.display = 'none';
    renderCurrentState(0, 0);
  });

  // BPMの共通更新処理
  const setBpmValue = (newBpm) => {
    const clamped = Math.max(40, Math.min(240, newBpm));
    state.bpm = clamped;
    elements.bpmSlider.value = clamped;
    elements.bpmVal.textContent = clamped;
    audioEngine.setBpm(clamped);
  };

  // テンポ (BPM) スライダー
  elements.bpmSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    setBpmValue(val);
  });

  // BPM -1 ボタン
  elements.bpmMinus1?.addEventListener('click', () => {
    setBpmValue(state.bpm - 1);
  });

  // BPM +1 ボタン
  elements.bpmPlus1?.addEventListener('click', () => {
    setBpmValue(state.bpm + 1);
  });

  // BPM -10 ボタン (10刻みのキリがいい数値に丸め)
  elements.bpmMinus10?.addEventListener('click', () => {
    const target = state.bpm % 10 === 0 ? state.bpm - 10 : Math.floor(state.bpm / 10) * 10;
    setBpmValue(target);
  });

  // BPM +10 ボタン (10刻みのキリがいい数値に丸め)
  elements.bpmPlus10?.addEventListener('click', () => {
    const target = Math.floor(state.bpm / 10) * 10 + 10;
    setBpmValue(target);
  });

  // 移調 (Transposition) 変更 -> 全体が連動して一括変化
  elements.transposeSelect.addEventListener('change', (e) => {
    state.transposition = parseInt(e.target.value, 10);
    audioEngine.setSong(state.parsedSong, state.transposition);
    renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
  });

  // ギター指板表示/非表示トグル
  elements.toggleFretboard.addEventListener('change', (e) => {
    state.showFretboard = e.target.checked;
    renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
  });

  // バッキング和音再生ON/OFF
  elements.toggleBacking.addEventListener('change', (e) => {
    state.enableBacking = e.target.checked;
    audioEngine.setBackingEnabled(state.enableBacking);
  });

  // 表示音数設定
  elements.countModeSelect.addEventListener('change', (e) => {
    state.countMode = e.target.value;
    renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
  });

  // 開始度数設定
  elements.startDegreeSelect.addEventListener('change', (e) => {
    state.startDegree = e.target.value;
    renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
  });

  // カウントイン設定
  elements.countinSelect.addEventListener('change', (e) => {
    state.countInBeats = parseInt(e.target.value, 10);
  });

  // オーディオエンジンの Tick イベント同調
  audioEngine.onTick = (info) => {
    if (info.isCountIn) {
      elements.countinBadge.style.display = 'block';
      elements.countinBadge.textContent = `COUNT IN: ${info.countInLeft}`;
    } else {
      elements.countinBadge.style.display = 'none';
      renderCurrentState(info.measureIndex, info.beatIndex);
    }
  };

  // 曲終了時
  audioEngine.onEnd = () => {
    updatePlayButtonsState(false, false);
    elements.countinBadge.style.display = 'none';
    renderCurrentState(0, 0);
  };
  // スマホのダブルタップ拡大防止
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      // フォーム入力等の動作を阻害しないようターゲットチェックも考慮しつつpreventDefault
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
      }
    }
    lastTouchEnd = now;
  }, { passive: false });
}

// アプリ起動
init();
