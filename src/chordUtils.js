/**
 * コードの解析、12キー移調、構成音（コードトーン）計算、ギター指板音位計算を行うユーティリティ
 */

// 音名（クロマチックスケール）
const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ギターの標準チューニング（6弦〜1弦）
// 6弦=E2(4), 5弦=A2(9), 4弦=D3(2), 3弦=G3(7), 2弦=B3(11), 1弦=E4(4)
export const GUITAR_STRINGS = [
  { stringNum: 1, openNote: 'E', openIndex: 4 }, // 1弦 High E
  { stringNum: 2, openNote: 'B', openIndex: 11 }, // 2弦 B
  { stringNum: 3, openNote: 'G', openIndex: 7 },  // 3弦 G
  { stringNum: 4, openNote: 'D', openIndex: 2 },  // 4弦 D
  { stringNum: 5, openNote: 'A', openIndex: 9 },  // 5弦 A
  { stringNum: 6, openNote: 'E', openIndex: 4 }   // 6弦 Low E
];

// 音名をインデックス(0-11)に変換
export function noteToIndex(noteStr) {
  if (!noteStr) return 0;
  // フラット/シャープ正規化
  const n = noteStr.trim().replace(/♭/g, 'b').replace(/♯/g, '#');
  let idx = NOTES_FLAT.indexOf(n);
  if (idx !== -1) return idx;
  idx = NOTES_SHARP.indexOf(n);
  if (idx !== -1) return idx;

  // 異名同音マッチ
  const altMap = { 'C#': 1, 'Db': 1, 'D#': 3, 'Eb': 3, 'F#': 6, 'Gb': 6, 'G#': 8, 'Ab': 8, 'A#': 10, 'Bb': 10 };
  return altMap[n] ?? 0;
}

// インデックス(0-11)を音名表記に変換
export function indexToNote(idx, preferSharp = false) {
  const norm = ((idx % 12) + 12) % 12;
  return preferSharp ? NOTES_SHARP[norm] : NOTES_FLAT[norm];
}

// キーの差分（半音数）を取得
export function getKeyDistance(fromKey, toKey) {
  const fromIdx = noteToIndex(fromKey);
  const toIdx = noteToIndex(toKey);
  return (toIdx - fromIdx + 12) % 12;
}

/**
 * コード記号からルートとタイプを分解
 * 例: "F^7" -> root: "F", type: "^7"
 * 例: "G-7" -> root: "G", type: "-7"
 * 例: "C7/E" -> root: "C", type: "7", bass: "E"
 */
export function parseChordSymbol(symbol) {
  if (!symbol) return { root: 'C', type: '', bass: null, original: 'C' };

  let s = symbol.trim();
  
  // 1N, 2N, N1, N2 などの不要な繰り返しタグのみを除去 (C7 や C6 などのルートCコードを破壊しない)
  s = s.replace(/N\d|\dN/g, '');

  let bass = null;
  if (s.includes('/')) {
    const parts = s.split('/');
    s = parts[0];
    bass = parts[1].replace(/[^A-G#b♯♭]/g, '');
  }

  // ルート音抽出 (A-G に #, b, ♯, ♭ がつく)
  const rootMatch = s.match(/^([A-G][#b♯♭]?)(.*)$/);
  if (!rootMatch) {
    return { root: 'C', type: s, bass, original: symbol };
  }

  // type からゴミ文字（括弧など）をクリーンアップ
  let cleanType = rootMatch[2] || '';
  cleanType = cleanType.replace(/[()\[\]{}|]/g, '');

  const normRoot = rootMatch[1].replace(/♭/g, 'b').replace(/♯/g, '#');
  const normBass = bass ? bass.replace(/♭/g, 'b').replace(/♯/g, '#') : null;

  return {
    root: normRoot,
    type: cleanType,
    bass: normBass,
    original: symbol
  };
}

/**
 * コード記号をトランスポーズ（半音シフト）
 */
export function transposeChord(symbol, semitones) {
  if (!symbol) return symbol;
  const parsed = parseChordSymbol(symbol);
  if (semitones === 0) {
    return `${parsed.root}${parsed.type}${parsed.bass ? '/' + parsed.bass : ''}`;
  }

  const rootIdx = noteToIndex(parsed.root);
  const newRootIdx = (rootIdx + semitones + 12) % 12;
  // フラット表記主体
  const newRoot = indexToNote(newRootIdx, parsed.root.includes('#'));

  let newBass = null;
  if (parsed.bass) {
    const bassIdx = noteToIndex(parsed.bass);
    const newBassIdx = (bassIdx + semitones + 12) % 12;
    newBass = indexToNote(newBassIdx, parsed.bass.includes('#'));
  }

  return `${newRoot}${parsed.type}${newBass ? '/' + newBass : ''}`;
}

/**
 * iReal Proコード記号を分かりやすい表示名（B♭Δ7, B♭m7, E♭7, A♭Δ7, G7♭9 等）に整形
 */
export function formatChordForDisplay(symbol) {
  if (!symbol) return '';
  let formatted = symbol.trim();

  // 1N, 2N などの不要な繰り返しタグ削除 (C7 や C6 を破壊しない)
  formatted = formatted.replace(/N\d|\dN/g, '');
  formatted = formatted.replace(/[()\[\]{}|]/g, '');

  const parsed = parseChordSymbol(formatted);

  // ルート音のフラット・シャープ表記を音楽記号 (♭, ♯) に変換
  let rootDisp = parsed.root ? parsed.root.replace(/b/g, '♭').replace(/#/g, '♯') : '';

  let bassDisp = parsed.bass;
  if (bassDisp) {
    bassDisp = bassDisp.replace(/b/g, '♭').replace(/#/g, '♯');
  }

  let typeDisp = parsed.type || '';
  // iReal表記の人間用・黒本用変換
  typeDisp = typeDisp.replace(/\^7/g, 'Δ7');
  typeDisp = typeDisp.replace(/\^/g, 'Δ7');
  typeDisp = typeDisp.replace(/-7/g, 'm7');
  typeDisp = typeDisp.replace(/-/g, 'm');
  typeDisp = typeDisp.replace(/h7/g, 'm7(♭5)');
  typeDisp = typeDisp.replace(/h/g, 'm7(♭5)');
  typeDisp = typeDisp.replace(/o7/g, 'dim7');
  typeDisp = typeDisp.replace(/o/g, 'dim');
  typeDisp = typeDisp.replace(/b9/g, '♭9');
  typeDisp = typeDisp.replace(/#9/g, '♯9');
  typeDisp = typeDisp.replace(/b13/g, '♭13');
  typeDisp = typeDisp.replace(/b5/g, '♭5');
  typeDisp = typeDisp.replace(/#5/g, '♯5');

  return `${rootDisp}${typeDisp}${bassDisp ? '/' + bassDisp : ''}`;
}

/**
 * 音楽理論に基づく文字階名ステップ算出 (Letter-based pitch spelling)
 * ルート音と度数オフセット (度数ステップ) から正しく音名を決定
 * 例: Root = 'A', degreeStep = 2 (3度) -> 'C' 系統 (C, C#, Cb)
 */
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_PITCHES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function getSpelledNoteName(rootStr, degreeStepOffset, pitchIdx) {
  if (!rootStr) return indexToNote(pitchIdx);

  // ルートの文字名 (A-G)
  const cleanedRoot = rootStr.trim();
  const rootLetter = cleanedRoot[0].toUpperCase();
  const rootLetterIdx = LETTERS.indexOf(rootLetter);
  if (rootLetterIdx === -1) return indexToNote(pitchIdx);

  // 目標となる文字名 (例: A から +2 ステップ -> C)
  const targetLetterIdx = (rootLetterIdx + degreeStepOffset) % 7;
  const targetLetter = LETTERS[targetLetterIdx];
  const naturalPitch = NATURAL_PITCHES[targetLetter];

  // 目標ピッチ index との差分計算 (-6..+6 の最小差分)
  let diff = (pitchIdx - naturalPitch + 12) % 12;
  if (diff > 6) diff -= 12;

  if (diff === 0) return targetLetter;
  if (diff === 1) return targetLetter + '#';
  if (diff === 2) return targetLetter + '##';
  if (diff === -1) return targetLetter + 'b';
  if (diff === -2) return targetLetter + 'bb';

  return indexToNote(pitchIdx);
}

/**
 * コードの構成音（コードトーン）度数と音名を計算
 */
export function getChordTones(symbol) {
  const { root, type } = parseChordSymbol(symbol);
  const rootIdx = noteToIndex(root);

  let thirdInterval = 4; // Major 3rd (デフォルト)
  let fifthInterval = 7; // Perfect 5th
  let seventhInterval = 11; // Major 7th

  let thirdDegree = '3';
  let fifthDegree = '5';
  let seventhDegree = '7';

  const origType = (type || '').trim();
  // 全角記号・異名記号の正規化
  const normType = origType
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#');

  // 1. Minor系の判定 (小文字の m, -, min, minor にマッチ。ただし MAJ, Maj などの Maj は除く)
  // 例: "m", "-7", "m7", "min7", "m7b5", "m6"
  const isMinor = /^(m(?!aj)|-|min)/.test(normType) || /(^|[^a-zA-Z])(m(?!aj)|-|min)/.test(normType);

  if (isMinor) {
    thirdInterval = 3;
    thirdDegree = '♭3';
  } else if (/sus4|sus/i.test(normType)) {
    thirdInterval = 5;
    thirdDegree = '4';
  }

  // 2. 5度の判定
  if (/b5|-5|h|dim|o/i.test(normType)) {
    fifthInterval = 6;
    fifthDegree = '♭5';
  } else if (/#5|\+5|aug/i.test(normType)) {
    fifthInterval = 8;
    fifthDegree = '♯5';
  }

  // 3. 7度の判定 (R, 3, 5, 7度のみ対応。6thコードの6度音はユーザー指示により不要)
  let hasSeventh = false;

  // Major 7th (大文字 M7, MA7, MAJ7, Maj7, maj7, Δ7, Δ, ^7, ^)
  const isMajor7th = /^(M7|MA7|MAJ7|Maj7|maj7|Δ|\^)/.test(normType) ||
                     /(^|[^a-zA-Z])(M7|MA7|MAJ7|Maj7|maj7|Δ|\^)/.test(normType) ||
                     (origType.includes('M') && !origType.includes('m') && !origType.includes('min'));

  // Diminished 7th (o7, dim7) -> ♭♭7
  const isDim7 = /o7|dim7/i.test(normType);

  // Minor 7th / Minor 7th(♭5) / Dominant 7th (7, m7, -7, h7, h, m7b5, dom7) -> 必ず ♭7 (10半音)
  const is7th = /7|h/i.test(normType);

  if (isMajor7th) {
    seventhInterval = 11;
    seventhDegree = '7';
    hasSeventh = true;
  } else if (isDim7) {
    seventhInterval = 9;
    seventhDegree = '♭♭7';
    hasSeventh = true;
  } else if (is7th) {
    // m7, m7♭5, 7 等のすべての 7th コードで 7度音は ♭7 (10半音)
    seventhInterval = 10;
    seventhDegree = '♭7';
    hasSeventh = true;
  }

  // 音楽理論ステップに基づく音名導出
  const rootNote = getSpelledNoteName(root, 0, (rootIdx + 0) % 12);
  const thirdStep = thirdDegree === '4' ? 3 : 2; // sus4の場合は4度ステップ(+3)
  const thirdNote = getSpelledNoteName(root, thirdStep, (rootIdx + thirdInterval) % 12);
  const fifthNote = getSpelledNoteName(root, 4, (rootIdx + fifthInterval) % 12);

  const res = [
    { degree: 'R', note: rootNote, semitones: 0, order: 0 },
    { degree: thirdDegree, note: thirdNote, semitones: thirdInterval, order: 1 },
    { degree: fifthDegree, note: fifthNote, semitones: fifthInterval, order: 2 }
  ];

  if (hasSeventh) {
    const seventhNote = getSpelledNoteName(root, 6, (rootIdx + seventhInterval) % 12);
    res.push({ degree: seventhDegree, note: seventhNote, semitones: seventhInterval, order: 3 });
  }

  return res;
}

/**
 * 設定（表示音数、開始度数）に応じて表示用コードトーンをソート・抽出
 * countMode: 'R', 'R+3', 'R+3+5', 'R+3+5+7'
 * startDegree: 'R', '3', '5', '7', 'descending'
 */
export function getFormattedChordTones(symbol, countMode = 'R+3+5+7', startDegree = 'R') {
  const tones = getChordTones(symbol);
  if (!tones || tones.length === 0) return [];

  // 表示音数制限
  let count = 4;
  if (countMode === 'R') count = 1;
  else if (countMode === 'R+3') count = 2;
  else if (countMode === 'R+3+5') count = 3;
  else count = 4;

  let sorted = [...tones];

  // 4音未満（トライアド等）への安全策
  const t0 = tones[0];
  const t1 = tones[1] || tones[0];
  const t2 = tones[2] || tones[0];
  const t3 = tones[3] || tones[2] || tones[0];

  // 開始度数に応じたシフト/並び替え
  if (startDegree === '3') {
    sorted = [t1, t2, t3, t0].filter(Boolean);
  } else if (startDegree === '5') {
    sorted = [t2, t3, t0, t1].filter(Boolean);
  } else if (startDegree === '7') {
    sorted = [t3, t0, t1, t2].filter(Boolean);
  } else if (startDegree === 'descending') {
    sorted = [...tones].reverse();
  }

  return sorted.slice(0, count);
}

/**
 * ギター指板上のノート位置（音名ベース）を算出
 * コード構成音の音名リスト（例: ['A', 'C#', 'E', 'G#']）が含まれる全フレット位置を返す
 */
export function getGuitarFretboardNotes(targetNoteNames, numFrets = 15) {
  // 音名とピッチIndexのマップ構築
  const noteNameMap = {};
  targetNoteNames.forEach(n => {
    const idx = noteToIndex(n);
    noteNameMap[idx] = n;
  });

  const targetIndices = new Set(Object.keys(noteNameMap).map(Number));
  const fretNotes = [];

  for (const stringConfig of GUITAR_STRINGS) {
    for (let fret = 0; fret <= numFrets; fret++) {
      const noteIdx = (stringConfig.openIndex + fret) % 12;
      if (targetIndices.has(noteIdx)) {
        const noteName = noteNameMap[noteIdx] || indexToNote(noteIdx);
        fretNotes.push({
          string: stringConfig.stringNum,
          fret,
          note: noteName,
          noteIdx
        });
      }
    }
  }

  return fretNotes;
}
