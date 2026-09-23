/**
 * ギター指板（Fretboard）を描画し、構成音やゲームインタラクションを表示するコンポーネント
 * 弦（横線）の上にぴったり音名・度数マーカーが乗るリアルな指板レイアウト
 */
import { GUITAR_STRINGS, indexToNote, noteToIndex } from '../chordUtils.js';

// 各弦・フレットの音名算出
export function getNoteForStringAndFret(stringNum, fret) {
  const stringConfig = GUITAR_STRINGS.find(s => s.stringNum === stringNum);
  if (!stringConfig) return 'C';
  const openIdx = stringConfig.openIndex;
  const noteIdx = (openIdx + fret) % 12;
  return indexToNote(noteIdx);
}

/**
 * 指板のレンダリング
 * options: {
 *   targetChordTones: [{ note, degree }], // ガイドモードで点灯させる目標音
 *   startFret: 0,
 *   fretCount: 5,
 *   fixedNotes: [{ string, fret, degree, note }], // ゲームモードで正解固定表示された音
 *   activePopNote: { string, fret, note, isCorrect, degree }, // タップ時のアニメーション用
 *   onFretClick: function(stringNum, fret, noteName),
 *   interactive: true,
 *   mode: 'guide' | 'game',
 *   hideNotes: false,
 *   visible: true
 * }
 */
export function renderFretboard(containerEl, options = {}) {
  if (!containerEl) return;

  const {
    targetChordTones = [],
    startFret = 0,
    fretCount = 5,
    fixedNotes = [],
    activePopNote = null,
    onFretClick = null,
    interactive = true,
    mode = 'guide',
    hideNotes = false,
    visible = true
  } = typeof options === 'boolean' ? { visible: options } : options;

  if (!visible) {
    containerEl.style.display = 'none';
    return;
  }
  containerEl.style.display = 'block';

  const minFret = Math.max(0, parseInt(startFret, 10) || 0);
  const numFrets = Math.max(1, parseInt(fretCount, 10) || 5);
  const maxFret = minFret + numFrets;

  // ガイドモード用のターゲットノートインデックスセット
  const targetIndicesMap = {};
  targetChordTones.forEach(t => {
    const idx = noteToIndex(t.note);
    targetIndicesMap[idx] = t.degree || '•';
  });

  // フレットヘッダー
  let html = `
    <div class="fretboard-card">
      <div class="fretboard-header-bar">
        <div class="fretboard-title-group">
          <span class="fretboard-icon">🎸</span>
          <span class="fretboard-title-text">${mode === 'game' ? '指板当てゲーム (フレットを押して度数を当てよう！)' : 'ギター指板ガイド'}</span>
        </div>
        <div class="fretboard-range-badge">
          ${minFret === 0 ? '開放〜' : minFret + 'フレ〜'} ${maxFret}フレット表示
        </div>
      </div>

      <div class="fretboard-main-wrapper">
        <!-- 指板本体 (弦とフレットのグリッド) -->
        <div class="fretboard-board" data-start-fret="${minFret}" data-fret-count="${numFrets}">
  `;

  // 各フレット列の列ヘッダー ＆ フレット線 ＆ ポジションマーク
  const startF = (minFret === 0 ? 0 : minFret);

  html += `<div class="fret-numbers-row">`;
  html += `<div class="fret-label-spacer">弦</div>`;
  if (minFret === 0) {
    html += `<div class="fret-num-col nut-col">Open</div>`;
  }
  for (let f = (minFret === 0 ? 1 : minFret); f <= maxFret; f++) {
    html += `<div class="fret-num-col">${f}</div>`;
  }
  html += `</div>`; // .fret-numbers-row

  // 弦とノートグリッド領域 (1弦: Top 〜 6弦: Bottom)
  html += `<div class="strings-container">`;

  // 1〜6弦の描画
  GUITAR_STRINGS.forEach((stringConfig) => {
    const stringNum = stringConfig.stringNum;
    html += `
      <div class="string-row string-${stringNum}" data-string="${stringNum}">
        <!-- 弦のラベル (左端) -->
        <div class="string-label-box">
          <span class="string-num-tag">${stringNum}弦</span>
          <span class="string-open-note">${stringConfig.openNote}</span>
        </div>
        
        <!-- フレットセル (弦の直線の上にノートマーカーを重ねる) -->
        <div class="string-frets-line">
          <!-- 背景に走る実際の弦の線 -->
          <div class="string-wire string-wire-${stringNum}"></div>
    `;

    for (let fret = startF; fret <= maxFret; fret++) {
      const isNut = (fret === 0);
      const noteName = getNoteForStringAndFret(stringNum, fret);
      const noteIdx = noteToIndex(noteName);

      // 固定表示（ゲームモードでの正解済みノート）
      const fixedMatch = fixedNotes.find(n => n.string === stringNum && n.fret === fret);

      // ガイドモードでのターゲットマッチ
      const isTarget = mode === 'guide' && (targetIndicesMap[noteIdx] !== undefined);
      const degreeTag = targetIndicesMap[noteIdx] || (fixedMatch ? fixedMatch.degree : '');

      // タップ直後のアクティブポップアップノート
      const isPopActive = activePopNote && activePopNote.string === stringNum && activePopNote.fret === fret;
      const isPopCorrect = isPopActive && activePopNote.isCorrect;

      // バッジ表示判定
      let badgeHtml = '';
      let cellClasses = `fret-node-cell fret-${fret}`;
      if (isNut) cellClasses += ' nut-node-cell';

      if (fixedMatch) {
        // ゲーム正解固定表示
        badgeHtml = `
          <div class="note-badge badge-fixed-correct animate-pop">
            <span class="badge-degree">${fixedMatch.degree}</span>
            ${!hideNotes ? `<span class="badge-note-sub">${noteName}</span>` : ''}
          </div>
        `;
      } else if (isPopActive) {
        // タップ直後の試聴/回答アニメーション
        const popClass = isPopCorrect ? 'badge-pop-correct' : 'badge-pop-wrong';
        badgeHtml = `
          <div class="note-badge ${popClass} animate-bounce">
            <span class="badge-note-main">${hideNotes && !isPopCorrect ? '?' : noteName}</span>
            ${activePopNote.degree ? `<span class="badge-degree-sub">${activePopNote.degree}</span>` : ''}
          </div>
        `;
      } else if (isTarget) {
        // ガイドモード点灯表示
        badgeHtml = `
          <div class="note-badge badge-guide-target">
            <span class="badge-degree">${degreeTag}</span>
            ${!hideNotes ? `<span class="badge-note-sub">${noteName}</span>` : ''}
          </div>
        `;
      }

      html += `
        <div class="${cellClasses}" 
             data-string="${stringNum}" 
             data-fret="${fret}" 
             data-note="${noteName}"
             title="${stringNum}弦 ${fret}フレット (${noteName})">
          <div class="wire-intersection"></div>
          ${badgeHtml}
        </div>
      `;
    }

    html += `</div></div>`; // .string-frets-line, .string-row
  });

  html += `</div>`; // .strings-container

  // 指板下部のポジションマーク (Inlay Position Markers)
  html += `<div class="fret-inlays-row">`;
  html += `<div class="fret-label-spacer"></div>`;
  if (minFret === 0) {
    html += `<div class="inlay-col nut-col"></div>`;
  }
  
  const singleDotFrets = [3, 5, 7, 9, 15, 17, 19, 21];
  const doubleDotFrets = [12, 24];

  for (let f = (minFret === 0 ? 1 : minFret); f <= maxFret; f++) {
    let inlayContent = '';
    if (doubleDotFrets.includes(f)) {
      inlayContent = `<span class="inlay-dot double-dot"></span><span class="inlay-dot double-dot"></span>`;
    } else if (singleDotFrets.includes(f)) {
      inlayContent = `<span class="inlay-dot single-dot"></span>`;
    }
    html += `<div class="inlay-col">${inlayContent}</div>`;
  }
  html += `</div>`; // .fret-inlays-row

  html += `</div></div></div>`;

  containerEl.innerHTML = html;

  // クリック・タップイベントの登録
  if (interactive && typeof onFretClick === 'function') {
    const nodes = containerEl.querySelectorAll('.fret-node-cell');
    nodes.forEach(node => {
      node.addEventListener('click', (e) => {
        e.preventDefault();
        const stringNum = parseInt(node.dataset.string, 10);
        const fret = parseInt(node.dataset.fret, 10);
        const noteName = node.dataset.note;
        onFretClick(stringNum, fret, noteName);
      });
    });
  }
}
