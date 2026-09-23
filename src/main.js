/**
 * アプリケーションのメインコントローラー
 */
import songsData from './data/songs.json';
import { parseIrealChords } from './irealParser.js';
import { transposeChord, formatChordForDisplay, getFormattedChordTonesByOrder, noteToIndex } from './chordUtils.js';
import { audioEngine } from './audioEngine.js';
import { renderLeadSheet } from './components/LeadSheet.js';
import { renderFretboard } from './components/Fretboard.js';
import { pitchDetector } from './pitchDetector.js';

// アプリ全体の状態管理
const state = {
  currentSong: songsData[0],
  parsedSong: null,
  transposition: 0,
  bpm: 60,
  selectedDegreeOrder: ['R', '3', '5', '7'], // 表示・出順の度数配列
  countInBeats: 4,
  showFretboard: false,
  startFret: 0,   // 開始フレット
  fretCount: 5,   // 表示フレット数
  enableBacking: true,
  isPlaying: false,
  isPaused: false,
  selectedMeasureIndex: 0,
  playMode: 'auto', // 'auto' | 'mic' | 'fretgame'
  targetToneIndex: 0, // マイク判定モード用: 現在目標の構成音インデックス
  gameTargetIndex: 0, // 指板当てゲーム用: 現在目標の構成音インデックス
  fixedNotes: [],     // 指板当てゲーム用: 正解固定表示されたノートの配列 [{ string, fret, degree, note }]
  activePopNote: null, // タップ直後の試聴/判定用ノート { string, fret, note, isCorrect, degree }
  popTimerId: null,
  isMicActive: false,
  matchHoldCount: 0, // 連続一致フレームカウント
  hideNotes: false // 音名非表示 (ブラインド練習) フラグ
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
  fretStartSelect: document.getElementById('fret-start-select'),
  fretCountSelect: document.getElementById('fret-count-select'),
  toggleFretboard: document.getElementById('toggle-fretboard'),
  toggleBacking: document.getElementById('toggle-backing'),
  toggleHideNotes: document.getElementById('toggle-hide-notes'),
  countinSelect: document.getElementById('countin-select'),

  btnDegR: document.getElementById('btn-deg-R'),
  btnDeg3: document.getElementById('btn-deg-3'),
  btnDeg5: document.getElementById('btn-deg-5'),
  btnDeg7: document.getElementById('btn-deg-7'),
  degreeSortableList: document.getElementById('degree-sortable-list'),
  songInfoBadge: document.getElementById('song-info-badge'),
  bigChord: document.getElementById('big-chord'),
  nextChord: document.getElementById('next-chord'),
  countinBadge: document.getElementById('countin-badge'),
  chordTonesContainer: document.getElementById('chord-tones-container'),
  leadsheetContainer: document.getElementById('leadsheet-container'),
  fretboardContainer: document.getElementById('fretboard-container'),
  measureProgressText: document.getElementById('measure-progress-text'),

  modeAutoBtn: document.getElementById('mode-auto'),
  modeMicBtn: document.getElementById('mode-mic'),
  modeFretGameBtn: document.getElementById('mode-fretgame'),

  micStatusBar: document.getElementById('mic-status-bar'),
  targetNoteVal: document.getElementById('target-note-val'),
  detectedNoteVal: document.getElementById('detected-note-val'),
  btnToggleMic: document.getElementById('btn-toggle-mic'),
  micGainSlider: document.getElementById('mic-gain-slider'),
  micGainVal: document.getElementById('mic-gain-val'),
  micLevelBar: document.getElementById('mic-level-bar'),

  fretgameStatusBar: document.getElementById('fretgame-status-bar'),
  fretgameTargetText: document.getElementById('fretgame-target-text'),
  fretgameProgressText: document.getElementById('fretgame-progress-text'),
  fretgameSkipBtn: document.getElementById('fretgame-skip-btn')
};


// ドラッグ中アイテムのインデックス保持
let draggedIndex = null;

// 初期化
function init() {
  populateSongList(songsData);
  loadSong(songsData[0]);
  renderDegreeSortableList();
  
  // 保存されたマイク感度（ゲイン）設定の復元
  const savedGain = localStorage.getItem('mic_gain_percent');
  if (savedGain && elements.micGainSlider) {
    const gainVal = parseInt(savedGain, 10);
    elements.micGainSlider.value = gainVal;
    if (elements.micGainVal) elements.micGainVal.textContent = `${gainVal}%`;
    pitchDetector.setGain(gainVal / 100);
  } else {
    pitchDetector.setGain(2.0); // デフォルト200% (2倍ブースト)
  }

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
  state.selectedMeasureIndex = 0;
  state.targetToneIndex = 0;
  state.gameTargetIndex = 0;
  state.fixedNotes = [];
  state.activePopNote = null;
  state.matchHoldCount = 0;
  updatePlayButtonsState(false, false);

  state.currentSong = song;
  state.parsedSong = parseIrealChords(song.rawChords);

  updateTransposeOptions(song.key);

  audioEngine.setSong(state.parsedSong, state.transposition);

  elements.songInfoBadge.textContent = `${song.title} | 原曲Key: ${song.key} | ${song.style}`;

  // 初期表示のリードシート、表示エリアの更新
  renderCurrentState(0, 0);
}

// 現在のコードと異なる、未来で最初に登場する次のコードを探索 (先回り予告)
function getNextDifferentChord(measures, currentMeasureIdx, currentBeatIdx, transposition) {
  if (!measures || measures.length === 0) return '-';

  const currentChordRaw = measures[currentMeasureIdx]?.chords[currentBeatIdx];
  const currentChordFormatted = formatChordForDisplay(transposeChord(currentChordRaw, transposition));

  // 現在位置から曲末尾に向かって未来のコードを探索
  for (let mIdx = currentMeasureIdx; mIdx < measures.length; mIdx++) {
    const m = measures[mIdx];
    const startBeat = (mIdx === currentMeasureIdx) ? currentBeatIdx + 1 : 0;
    for (let bIdx = startBeat; bIdx < m.chords.length; bIdx++) {
      const futureRaw = m.chords[bIdx];
      const futureFormatted = formatChordForDisplay(transposeChord(futureRaw, transposition));

      if (futureFormatted && futureFormatted !== '/' && futureFormatted !== 'x' && futureFormatted !== currentChordFormatted) {
        return futureFormatted;
      }
    }
  }

  // もし曲の末尾まで同じコードが続く場合は曲頭のコードをプレビュー
  const firstChordRaw = measures[0]?.chords[0];
  const firstChordFormatted = formatChordForDisplay(transposeChord(firstChordRaw, transposition));
  if (firstChordFormatted !== currentChordFormatted) {
    return firstChordFormatted;
  }

  return currentChordFormatted || '-';
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
  const nextChordDisplay = getNextDifferentChord(measures, currentMeasureIdx, currentBeatIdx, state.transposition);

  // 大文字コード・ネクストコード表示
  elements.bigChord.textContent = activeChordDisplay || 'C';
  elements.nextChord.textContent = nextChordDisplay;
  elements.measureProgressText.textContent = `小節: ${currentMeasureIdx + 1} / ${measures.length}`;

  // 度数 & 音名カード表示 (並び替えられた度数順)
  const formattedTones = getFormattedChordTonesByOrder(activeChordTransposed, state.selectedDegreeOrder);
  renderChordTonesCards(formattedTones);

  // 指板当てゲームのプロンプト・プログレス更新
  if (state.playMode === 'fretgame') {
    updateFretGamePrompt(activeChordDisplay, formattedTones);
  }

  // リードシートの描画
  renderLeadSheet(
    elements.leadsheetContainer,
    state.parsedSong,
    state.transposition,
    currentMeasureIdx,
    (clickedMeasureIdx) => {
      state.selectedMeasureIndex = clickedMeasureIdx;
      state.targetToneIndex = 0;
      state.gameTargetIndex = 0;
      state.fixedNotes = [];
      state.activePopNote = null;
      state.matchHoldCount = 0;
      audioEngine.jumpToMeasure(clickedMeasureIdx);
      renderCurrentState(clickedMeasureIdx, 0);
    }
  );

  // ギター指板の描画
  const isFretGame = state.playMode === 'fretgame';
  const isFretboardVisible = state.showFretboard || isFretGame;

  renderFretboard(elements.fretboardContainer, {
    targetChordTones: formattedTones,
    startFret: state.startFret,
    fretCount: state.fretCount,
    fixedNotes: state.fixedNotes,
    activePopNote: state.activePopNote,
    onFretClick: (stringNum, fret, noteName) => {
      handleFretClick(stringNum, fret, noteName);
    },
    interactive: true,
    mode: isFretGame ? 'game' : 'guide',
    hideNotes: state.hideNotes,
    visible: isFretboardVisible
  });
}

// 指板当てゲーム用プロンプト表示の更新
function updateFretGamePrompt(chordSymbol, formattedTones) {
  if (!formattedTones || formattedTones.length === 0) return;

  if (state.gameTargetIndex >= formattedTones.length) {
    state.gameTargetIndex = 0;
  }

  const currentTarget = formattedTones[state.gameTargetIndex];
  if (elements.fretgameTargetText && currentTarget) {
    const noteText = state.hideNotes ? '?' : `(${currentTarget.note})`;
    elements.fretgameTargetText.textContent = `コード [ ${chordSymbol} ] の 【 ${currentTarget.degree} ${noteText} 】 を押してください！`;
  }

  if (elements.fretgameProgressText) {
    elements.fretgameProgressText.textContent = `正解: ${state.fixedNotes.length} / ${formattedTones.length}`;
  }
}

// 指板タップ時のゲーム判定・サウンド再生ロジック
function handleFretClick(stringNum, fret, noteName) {
  // まず押した場所の音を鳴らす
  audioEngine.playFretNote(stringNum, fret);

  // ガイドモードやマイクモードのときはクリック試聴ポップのみ
  if (state.playMode !== 'fretgame') {
    if (state.popTimerId) clearTimeout(state.popTimerId);
    state.activePopNote = { string: stringNum, fret, note: noteName, isCorrect: true };
    state.popTimerId = setTimeout(() => {
      state.activePopNote = null;
      renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
    }, 600);
    renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
    return;
  }

  const measures = state.parsedSong.measures;
  const currentMeasure = measures[audioEngine.currentMeasure] || measures[0];
  const rawChord = currentMeasure.chords[audioEngine.currentBeat] || currentMeasure.chords[0];
  const activeChordTransposed = transposeChord(rawChord, state.transposition);
  const formattedTones = getFormattedChordTonesByOrder(activeChordTransposed, state.selectedDegreeOrder);

  if (!formattedTones || formattedTones.length === 0) return;

  const currentTarget = formattedTones[state.gameTargetIndex];
  if (!currentTarget) return;

  const targetPitchIdx = noteToIndex(currentTarget.note);
  const clickedPitchIdx = noteToIndex(noteName);

  if (state.popTimerId) clearTimeout(state.popTimerId);

  if (targetPitchIdx === clickedPitchIdx) {
    // 【正解！】
    const newFixed = { string: stringNum, fret, degree: currentTarget.degree, note: noteName };
    // 重複登録の防止
    const exists = state.fixedNotes.some(n => n.string === stringNum && n.fret === fret);
    if (!exists) {
      state.fixedNotes.push(newFixed);
    }

    state.activePopNote = { string: stringNum, fret, note: noteName, isCorrect: true, degree: currentTarget.degree };
    state.gameTargetIndex++;

    if (state.gameTargetIndex >= formattedTones.length) {
      // 現在のコードの構成音をすべて達成！
      state.popTimerId = setTimeout(() => {
        state.activePopNote = null;
        state.fixedNotes = [];
        state.gameTargetIndex = 0;
        audioEngine.advanceToNextChord();
        renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
      }, 750);
    } else {
      state.popTimerId = setTimeout(() => {
        state.activePopNote = null;
        renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
      }, 450);
    }
  } else {
    // 【不正解】
    state.activePopNote = { string: stringNum, fret, note: noteName, isCorrect: false };
    state.popTimerId = setTimeout(() => {
      state.activePopNote = null;
      renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
    }, 650);
  }

  renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
}

// 度数・音名カードのレンダリング
function renderChordTonesCards(tones) {
  elements.chordTonesContainer.innerHTML = '';

  const activeIdx = (state.playMode === 'fretgame') ? state.gameTargetIndex : state.targetToneIndex;

  if (state.playMode === 'mic') {
    if (state.targetToneIndex >= tones.length) state.targetToneIndex = 0;
    const currentTargetTone = tones[state.targetToneIndex];
    if (elements.targetNoteVal) {
      elements.targetNoteVal.textContent = state.hideNotes ? '?' : (currentTargetTone ? currentTargetTone.note : '-');
    }
  }

  tones.forEach((t, idx) => {
    const card = document.createElement('div');
    card.className = 'tone-card';

    if (state.playMode === 'mic' || state.playMode === 'fretgame') {
      if (idx === activeIdx) {
        card.classList.add('target-active');
      } else if (idx < activeIdx) {
        card.classList.add('tone-cleared');
      }
    }

    const displayNote = state.hideNotes ? '?' : t.note;

    card.innerHTML = `
      <div class="tone-degree">${t.degree}</div>
      <div class="tone-note">${displayNote}</div>
    `;
    elements.chordTonesContainer.appendChild(card);
  });
}


// モード切替（自動進行 / マイク音判定 / 指板当てゲーム）
function switchPlayMode(newMode) {
  state.playMode = newMode;
  state.targetToneIndex = 0;
  state.gameTargetIndex = 0;
  state.fixedNotes = [];
  state.activePopNote = null;
  audioEngine.setPlayMode(newMode);

  elements.modeAutoBtn?.classList.toggle('active', newMode === 'auto');
  elements.modeMicBtn?.classList.toggle('active', newMode === 'mic');
  elements.modeFretGameBtn?.classList.toggle('active', newMode === 'fretgame');

  if (elements.micStatusBar) {
    elements.micStatusBar.style.display = (newMode === 'mic') ? 'flex' : 'none';
  }
  if (elements.fretgameStatusBar) {
    elements.fretgameStatusBar.style.display = (newMode === 'fretgame') ? 'flex' : 'none';
  }

  if (newMode === 'mic') {
    if (!state.isMicActive) startMicListening();
  }

  renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
}

// マイクアクセスの開始/停止トグル
async function startMicListening() {
  const success = await pitchDetector.start((pitchData) => {
    handlePitchDetected(pitchData);
  });

  if (success) {
    state.isMicActive = true;
    if (elements.btnToggleMic) {
      elements.btnToggleMic.textContent = '🟢 マイク機能中';
      elements.btnToggleMic.classList.add('active');
    }
  } else {
    state.isMicActive = false;
    alert('マイクの使用許可が得られませんでした。ブラウザの設定でマイクへのアクセスを許可してください。');
  }
}

function stopMicListening() {
  pitchDetector.stop();
  state.isMicActive = false;
  if (elements.btnToggleMic) {
    elements.btnToggleMic.textContent = '🎙️ マイク起動';
    elements.btnToggleMic.classList.remove('active');
  }
  if (elements.detectedNoteVal) {
    elements.detectedNoteVal.textContent = '--';
  }
  if (elements.micLevelBar) {
    elements.micLevelBar.style.width = '0%';
  }
}

// マイク入力ピッチのリアルタイム判定ロジック
function handlePitchDetected(pitchData) {
  if (!elements.detectedNoteVal) return;

  if (elements.micLevelBar && pitchData && typeof pitchData.rms === 'number') {
    const levelPercent = Math.min(100, Math.max(0, Math.round((pitchData.rms / 0.06) * 100)));
    elements.micLevelBar.style.width = `${levelPercent}%`;
  }

  if (!pitchData || !pitchData.note) {
    elements.detectedNoteVal.textContent = '--';
    elements.detectedNoteVal.classList.remove('match-success');
    state.matchHoldCount = 0;
    return;
  }

  const detectedNote = pitchData.note;
  elements.detectedNoteVal.textContent = detectedNote;

  if (state.playMode === 'mic' && state.parsedSong) {
    const measures = state.parsedSong.measures;
    const currentMeasure = measures[audioEngine.currentMeasure] || measures[0];
    const rawChord = currentMeasure.chords[audioEngine.currentBeat] || currentMeasure.chords[0];
    const activeChordTransposed = transposeChord(rawChord, state.transposition);
    const formattedTones = getFormattedChordTonesByOrder(activeChordTransposed, state.selectedDegreeOrder);

    if (!formattedTones || formattedTones.length === 0) return;

    if (state.targetToneIndex >= formattedTones.length) {
      state.targetToneIndex = 0;
    }

    const targetTone = formattedTones[state.targetToneIndex];
    if (!targetTone) return;

    const targetIdx = noteToIndex(targetTone.note);
    const detectedIdx = noteToIndex(detectedNote);

    if (targetIdx === detectedIdx) {
      state.matchHoldCount++;
      if (state.matchHoldCount >= 2) {
        elements.detectedNoteVal.classList.add('match-success');
        state.matchHoldCount = 0;
        advanceTargetNote(formattedTones);
      }
    } else {
      state.matchHoldCount = 0;
      elements.detectedNoteVal.classList.remove('match-success');
    }
  }
}

// 正しい音が演奏された時の進行ロジック
function advanceTargetNote(formattedTones) {
  state.targetToneIndex++;
  if (state.targetToneIndex >= formattedTones.length) {
    state.targetToneIndex = 0;
    audioEngine.advanceToNextChord();
  }
  renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
}

// 並び替え可能リスト (Sortable List) の描画
function renderDegreeSortableList() {
  if (!elements.degreeSortableList) return;
  elements.degreeSortableList.innerHTML = '';

  state.selectedDegreeOrder.forEach((deg, idx) => {
    const chip = document.createElement('div');
    chip.className = 'degree-chip';
    chip.setAttribute('draggable', 'true');
    chip.dataset.index = idx;
    chip.dataset.degree = deg;

    chip.innerHTML = `
      <span class="drag-handle">⋮⋮</span>
      <span>${deg}</span>
      <button class="chip-move-btn left-btn" title="左へ移動" data-action="left">‹</button>
      <button class="chip-move-btn right-btn" title="右へ移動" data-action="right">›</button>
    `;

    chip.querySelector('.left-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (idx > 0) swapDegreeOrder(idx, idx - 1);
    });

    chip.querySelector('.right-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (idx < state.selectedDegreeOrder.length - 1) swapDegreeOrder(idx, idx + 1);
    });

    chip.addEventListener('dragstart', (e) => {
      draggedIndex = idx;
      chip.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', idx);
    });

    chip.addEventListener('dragend', () => {
      chip.classList.remove('dragging');
      draggedIndex = null;
      document.querySelectorAll('.degree-chip').forEach(c => c.classList.remove('drag-over'));
    });

    chip.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      chip.classList.add('drag-over');
    });

    chip.addEventListener('dragleave', () => {
      chip.classList.remove('drag-over');
    });

    chip.addEventListener('drop', (e) => {
      e.preventDefault();
      chip.classList.remove('drag-over');
      if (draggedIndex !== null && draggedIndex !== idx) {
        const itemToMove = state.selectedDegreeOrder.splice(draggedIndex, 1)[0];
        state.selectedDegreeOrder.splice(idx, 0, itemToMove);
        renderDegreeSortableList();
        renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
      }
    });

    elements.degreeSortableList.appendChild(chip);
  });
}

function swapDegreeOrder(fromIdx, toIdx) {
  const temp = state.selectedDegreeOrder[fromIdx];
  state.selectedDegreeOrder[fromIdx] = state.selectedDegreeOrder[toIdx];
  state.selectedDegreeOrder[toIdx] = temp;
  renderDegreeSortableList();
  renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
}

function updateDegreeToggleButtonUI(degreeStr, isActive) {
  const btnMap = { 'R': elements.btnDegR, '3': elements.btnDeg3, '5': elements.btnDeg5, '7': elements.btnDeg7 };
  const btn = btnMap[degreeStr];
  if (!btn) return;
  if (isActive) btn.classList.add('active');
  else btn.classList.remove('active');
}

function toggleDegree(degreeStr) {
  const isPresent = state.selectedDegreeOrder.includes(degreeStr);

  if (isPresent) {
    if (state.selectedDegreeOrder.length <= 1) return;
    state.selectedDegreeOrder = state.selectedDegreeOrder.filter(d => d !== degreeStr);
    updateDegreeToggleButtonUI(degreeStr, false);
  } else {
    const defaultOrder = ['R', '3', '5', '7'];
    state.selectedDegreeOrder.push(degreeStr);
    state.selectedDegreeOrder.sort((a, b) => defaultOrder.indexOf(a) - defaultOrder.indexOf(b));
    updateDegreeToggleButtonUI(degreeStr, true);
  }

  renderDegreeSortableList();
  renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
}

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
  elements.modeAutoBtn?.addEventListener('click', () => switchPlayMode('auto'));
  elements.modeMicBtn?.addEventListener('click', () => switchPlayMode('mic'));
  elements.modeFretGameBtn?.addEventListener('click', () => switchPlayMode('fretgame'));

  // 指板当てゲームの「スキップ」ボタン
  elements.fretgameSkipBtn?.addEventListener('click', () => {
    state.fixedNotes = [];
    state.gameTargetIndex = 0;
    audioEngine.advanceToNextChord();
    renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
  });

  // 開始フレット & 表示フレット数の変更
  elements.fretStartSelect?.addEventListener('change', (e) => {
    state.startFret = parseInt(e.target.value, 10);
    renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
  });

  elements.fretCountSelect?.addEventListener('change', (e) => {
    state.fretCount = parseInt(e.target.value, 10);
    renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
  });

  elements.btnToggleMic?.addEventListener('click', () => {
    if (state.isMicActive) stopMicListening();
    else startMicListening();
  });

  elements.micGainSlider?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    if (elements.micGainVal) elements.micGainVal.textContent = `${val}%`;
    pitchDetector.setGain(val / 100);
    localStorage.setItem('mic_gain_percent', val);
  });

  elements.btnDegR?.addEventListener('click', () => toggleDegree('R'));
  elements.btnDeg3?.addEventListener('click', () => toggleDegree('3'));
  elements.btnDeg5?.addEventListener('click', () => toggleDegree('5'));
  elements.btnDeg7?.addEventListener('click', () => toggleDegree('7'));

  elements.toggleHideNotes?.addEventListener('change', (e) => {
    state.hideNotes = e.target.checked;
    renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
  });

  elements.songSearch.addEventListener('input', (e) => {
    const rawQuery = e.target.value.toLowerCase().trim();
    const normQuery = rawQuery.replace(/autumun|autum/g, 'autumn');

    const filtered = songsData.filter(s => {
      const t = s.title.toLowerCase();
      const c = s.composer.toLowerCase();
      return t.includes(rawQuery) || c.includes(rawQuery) ||
             (normQuery && (t.includes(normQuery) || c.includes(normQuery)));
    });

    populateSongList(filtered);

    if (filtered.length > 0) {
      const currentInFiltered = filtered.find(s => s.id === state.currentSong?.id);
      if (currentInFiltered) {
        elements.songSelect.value = currentInFiltered.id;
      } else {
        elements.songSelect.value = filtered[0].id;
        loadSong(filtered[0]);
      }
    }
  });

  elements.songSelect.addEventListener('change', (e) => {
    const selectedId = parseInt(e.target.value, 10);
    const song = songsData.find(s => s.id === selectedId);
    if (song) loadSong(song);
  });

  elements.btnStart.addEventListener('click', () => {
    if (!state.isPlaying && !state.isPaused) {
      audioEngine.setBpm(state.bpm);
      audioEngine.setBackingEnabled(state.enableBacking);
      audioEngine.start(state.countInBeats, state.selectedMeasureIndex);
      updatePlayButtonsState(true, false);
    } else if (state.isPlaying) {
      audioEngine.pause();
      updatePlayButtonsState(false, true);
    } else if (state.isPaused) {
      audioEngine.resume();
      updatePlayButtonsState(true, false);
    }
  });

  elements.btnReset.addEventListener('click', () => {
    audioEngine.stop();
    state.selectedMeasureIndex = 0;
    state.targetToneIndex = 0;
    state.gameTargetIndex = 0;
    state.fixedNotes = [];
    state.activePopNote = null;
    state.matchHoldCount = 0;
    updatePlayButtonsState(false, false);
    elements.countinBadge.style.display = 'none';
    renderCurrentState(0, 0);
  });

  const setBpmValue = (newBpm) => {
    const clamped = Math.max(40, Math.min(240, newBpm));
    state.bpm = clamped;
    elements.bpmSlider.value = clamped;
    elements.bpmVal.textContent = clamped;
    audioEngine.setBpm(clamped);
  };

  elements.bpmSlider.addEventListener('input', (e) => setBpmValue(parseInt(e.target.value, 10)));
  elements.bpmMinus1?.addEventListener('click', () => setBpmValue(state.bpm - 1));
  elements.bpmPlus1?.addEventListener('click', () => setBpmValue(state.bpm + 1));
  elements.bpmMinus10?.addEventListener('click', () => {
    const target = state.bpm % 10 === 0 ? state.bpm - 10 : Math.floor(state.bpm / 10) * 10;
    setBpmValue(target);
  });
  elements.bpmPlus10?.addEventListener('click', () => {
    const target = Math.floor(state.bpm / 10) * 10 + 10;
    setBpmValue(target);
  });

  elements.transposeSelect.addEventListener('change', (e) => {
    state.transposition = parseInt(e.target.value, 10);
    audioEngine.setSong(state.parsedSong, state.transposition);
    renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
  });

  elements.toggleFretboard.addEventListener('change', (e) => {
    state.showFretboard = e.target.checked;
    renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
  });

  elements.toggleBacking.addEventListener('change', (e) => {
    state.enableBacking = e.target.checked;
    audioEngine.setBackingEnabled(state.enableBacking);
  });

  elements.countinSelect.addEventListener('change', (e) => {
    state.countInBeats = parseInt(e.target.value, 10);
  });

  audioEngine.onTick = (info) => {
    if (info.isCountIn) {
      elements.countinBadge.style.display = 'block';
      elements.countinBadge.textContent = `COUNT IN: ${info.countInLeft}`;
    } else {
      elements.countinBadge.style.display = 'none';
      renderCurrentState(info.measureIndex, info.beatIndex);
    }
  };

  audioEngine.onEnd = () => {
    updatePlayButtonsState(false, false);
    elements.countinBadge.style.display = 'none';
    renderCurrentState(0, 0);
  };

  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
      }
    }
    lastTouchEnd = now;
  }, { passive: false });
}

// アプリ起動
init();
