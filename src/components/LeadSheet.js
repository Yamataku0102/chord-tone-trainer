/**
 * リードシート（楽譜・コード進行表）のレンダリングコンポーネント
 */
import { formatChordForDisplay, transposeChord } from '../chordUtils.js';

export function renderLeadSheet(containerEl, songParsedData, transposition = 0, currentMeasureIndex = -1) {
  if (!containerEl || !songParsedData) return;

  const { beatsPerMeasure, timeSignature, measures } = songParsedData;

  containerEl.innerHTML = '';

  const sheetWrapper = document.createElement('div');
  sheetWrapper.className = 'lead-sheet-grid';

  // 1行あたり4小節のレイアウト
  measures.forEach((m, idx) => {
    const measureBox = document.createElement('div');
    measureBox.className = `measure-card ${idx === currentMeasureIndex ? 'active-measure' : ''}`;
    measureBox.dataset.measureIndex = idx;

    const mNumber = document.createElement('span');
    mNumber.className = 'measure-num';
    mNumber.textContent = `${idx + 1}`;
    measureBox.appendChild(mNumber);

    // 小節内のコード（トランスポーズ適用済みの表記）
    const chordListEl = document.createElement('div');
    chordListEl.className = 'measure-chords';

    // ユニークコードの抽出・表示
    const rawTokens = m.displayTokens || m.chords;
    const transposedChords = rawTokens.map(c => {
      if (c === '/' || c === 'x') return c;
      const transposed = transposeChord(c, transposition);
      return formatChordForDisplay(transposed);
    });

    transposedChords.forEach(c => {
      const cSpan = document.createElement('span');
      cSpan.className = 'sheet-chord-symbol';
      cSpan.textContent = c;
      chordListEl.appendChild(cSpan);
    });

    measureBox.appendChild(chordListEl);
    sheetWrapper.appendChild(measureBox);
  });

  containerEl.appendChild(sheetWrapper);
}
