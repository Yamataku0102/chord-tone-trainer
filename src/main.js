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
  enableBacking: true,
  isPlaying: false,
  isPaused: false,
  selectedMeasureIndex: 0,
  playMode: 'auto', // 'auto' | 'mic'
  targetToneIndex: 0, // マイク判定モード用: 現在目標の構成音インデックス
  isMicActive: false,
  matchHoldCount: 0 // 連続一致フレームカウント
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
  micStatusBar: document.getElementById('mic-status-bar'),
  targetNoteVal: document.getElementById('target-note-val'),
  detectedNoteVal: document.getElementById('detected-note-val'),
  btnToggleMic: document.getElementById('btn-toggle-mic')
};


// ドラッグ中アイテムのインデックス保持
let draggedIndex = null;

// 初期化
function init() {
  populateSongList(songsData);
  loadSong(songsData[0]);
  renderDegreeSortableList();
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

  // ネクストコードの決定 (次に変化する新しいコードを1拍目から先回り予告)
  const nextChordDisplay = getNextDifferentChord(measures, currentMeasureIdx, currentBeatIdx, state.transposition);

  // 大文字コード・ネクストコード表示
  elements.bigChord.textContent = activeChordDisplay || 'C';
  elements.nextChord.textContent = nextChordDisplay;
  elements.measureProgressText.textContent = `小節: ${currentMeasureIdx + 1} / ${measures.length}`;

  // 度数 & 音名カード表示 (並び替えられた度数順)
  const formattedTones = getFormattedChordTonesByOrder(activeChordTransposed, state.selectedDegreeOrder);
  renderChordTonesCards(formattedTones);

  // リードシートの描画 (全体移調 & 現在小節ハイライト & 小節タップで途中再生/選択)
  renderLeadSheet(
    elements.leadsheetContainer,
    state.parsedSong,
    state.transposition,
    currentMeasureIdx,
    (clickedMeasureIdx) => {
      state.selectedMeasureIndex = clickedMeasureIdx;
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

  if (state.playMode === 'mic') {
    if (state.targetToneIndex >= tones.length) {
      state.targetToneIndex = 0;
    }
    const currentTargetTone = tones[state.targetToneIndex];
    if (elements.targetNoteVal) {
      elements.targetNoteVal.textContent = currentTargetTone ? currentTargetTone.note : '-';
    }
  }

  tones.forEach((t, idx) => {
    const card = document.createElement('div');
    card.className = 'tone-card';

    if (state.playMode === 'mic') {
      if (idx === state.targetToneIndex) {
        card.classList.add('target-active');
      } else if (idx < state.targetToneIndex) {
        card.classList.add('tone-cleared');
      }
    }

    card.innerHTML = `
      <div class="tone-degree">${t.degree}</div>
      <div class="tone-note">${t.note}</div>
    `;
    elements.chordTonesContainer.appendChild(card);
  });
}

// モード切替（自動進行 / マイク音判定）
function switchPlayMode(newMode) {
  state.playMode = newMode;
  state.targetToneIndex = 0;
  audioEngine.setPlayMode(newMode);

  if (newMode === 'mic') {
    elements.modeAutoBtn?.classList.remove('active');
    elements.modeMicBtn?.classList.add('active');
    if (elements.micStatusBar) elements.micStatusBar.style.display = 'flex';

    if (!state.isMicActive) {
      startMicListening();
    }
  } else {
    elements.modeAutoBtn?.classList.add('active');
    elements.modeMicBtn?.classList.remove('active');
    if (elements.micStatusBar) elements.micStatusBar.style.display = 'none';
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
}

// マイク入力ピッチのリアルタイム判定ロジック
function handlePitchDetected(pitchData) {
  if (!elements.detectedNoteVal) return;

  if (!pitchData || !pitchData.note) {
    elements.detectedNoteVal.textContent = '--';
    elements.detectedNoteVal.classList.remove('match-success');
    state.matchHoldCount = 0;
    return;
  }

  const detectedNote = pitchData.note; // 例: "F", "C#", "Eb" など
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

    // オクターブ不問マッチング: noteToIndex でピッチクラス(0..11)の一致を比較
    const targetIdx = noteToIndex(targetTone.note);
    const detectedIdx = noteToIndex(detectedNote);

    if (targetIdx === detectedIdx) {
      state.matchHoldCount++;

      // 安定検知のため 2フレーム連続一致で合格とみなす
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

// 正しい音が演奏された時の進行ロジック (次の音・次の小節へ)
function advanceTargetNote(formattedTones) {
  state.targetToneIndex++;

  // 構成音をすべて合格した場合 -> 次の小節へ移動！
  if (state.targetToneIndex >= formattedTones.length) {
    state.targetToneIndex = 0;
    const nextMeasureIdx = (audioEngine.currentMeasure + 1) % state.parsedSong.measures.length;
    audioEngine.jumpToMeasure(nextMeasureIdx);
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

    // 矢印ボタンのクリックイベント
    chip.querySelector('.left-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (idx > 0) {
        swapDegreeOrder(idx, idx - 1);
      }
    });

    chip.querySelector('.right-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (idx < state.selectedDegreeOrder.length - 1) {
        swapDegreeOrder(idx, idx + 1);
      }
    });

    // ドラッグ＆ドロップイベント
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

// 度数順序の入れ替え処理
function swapDegreeOrder(fromIdx, toIdx) {
  const temp = state.selectedDegreeOrder[fromIdx];
  state.selectedDegreeOrder[fromIdx] = state.selectedDegreeOrder[toIdx];
  state.selectedDegreeOrder[toIdx] = temp;
  renderDegreeSortableList();
  renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
}

// 度数トグルボタンの状態更新
function updateDegreeToggleButtonUI(degreeStr, isActive) {
  const btnMap = {
    'R': elements.btnDegR,
    '3': elements.btnDeg3,
    '5': elements.btnDeg5,
    '7': elements.btnDeg7
  };
  const btn = btnMap[degreeStr];
  if (!btn) return;
  if (isActive) {
    btn.classList.add('active');
  } else {
    btn.classList.remove('active');
  }
}

// 度数トグルのクリックハンドラー
function toggleDegree(degreeStr) {
  const isPresent = state.selectedDegreeOrder.includes(degreeStr);

  if (isPresent) {
    // 最後の1つの場合は非アクティブ化を防止（全OFFを防ぐ）
    if (state.selectedDegreeOrder.length <= 1) {
      return;
    }
    state.selectedDegreeOrder = state.selectedDegreeOrder.filter(d => d !== degreeStr);
    updateDegreeToggleButtonUI(degreeStr, false);
  } else {
    // 追加時は標準順序 (R -> 3 -> 5 -> 7) の適切な位置、または末尾に挿入
    const defaultOrder = ['R', '3', '5', '7'];
    state.selectedDegreeOrder.push(degreeStr);
    // デフォルトの相対順序で綺麗に並べる
    state.selectedDegreeOrder.sort((a, b) => defaultOrder.indexOf(a) - defaultOrder.indexOf(b));
    updateDegreeToggleButtonUI(degreeStr, true);
  }

  renderDegreeSortableList();
  renderCurrentState(audioEngine.currentMeasure, audioEngine.currentBeat);
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
  // 練習モード切替ボタン (自動進行 / マイク音判定)
  elements.modeAutoBtn?.addEventListener('click', () => switchPlayMode('auto'));
  elements.modeMicBtn?.addEventListener('click', () => switchPlayMode('mic'));

  // マイクON/OFFボタン
  elements.btnToggleMic?.addEventListener('click', () => {
    if (state.isMicActive) {
      stopMicListening();
    } else {
      startMicListening();
    }
  });

  // 度数トグルボタンのリスナー
  elements.btnDegR?.addEventListener('click', () => toggleDegree('R'));
  elements.btnDeg3?.addEventListener('click', () => toggleDegree('3'));
  elements.btnDeg5?.addEventListener('click', () => toggleDegree('5'));
  elements.btnDeg7?.addEventListener('click', () => toggleDegree('7'));


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
      // 選択中の小節から再生スタート
      audioEngine.setBpm(state.bpm);
      audioEngine.setBackingEnabled(state.enableBacking);
      audioEngine.start(state.countInBeats, state.selectedMeasureIndex);
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
    state.selectedMeasureIndex = 0;
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
