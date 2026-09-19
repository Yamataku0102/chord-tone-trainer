/**
 * ギター指板（Fretboard）を描画し、コード構成音を【音名表記】で点灯表示するコンポーネント
 */
import { getGuitarFretboardNotes, GUITAR_STRINGS } from '../chordUtils.js';

export function renderFretboard(containerEl, targetNoteNames = [], visible = true) {
  if (!containerEl) return;

  if (!visible) {
    containerEl.style.display = 'none';
    return;
  }
  containerEl.style.display = 'block';

  const numFrets = 12; // 0〜12フレット表示

  // 指板上の対象ノート位置を取得
  const activeNotes = getGuitarFretboardNotes(targetNoteNames, numFrets);

  let html = `
    <div class="fretboard-container">
      <div class="fretboard-header">
        <span class="fretboard-title">🎸 ギター指板ガイド（音名表示）</span>
      </div>
      <div class="fretboard-wrapper">
        <table class="fretboard-table">
          <thead>
            <tr>
              <th class="string-label-header">弦</th>
  `;

  for (let f = 0; f <= numFrets; f++) {
    html += `<th class="fret-num-header">${f === 0 ? 'Nut' : f}</th>`;
  }
  html += `</tr></thead><tbody>`;

  // 1弦(Top)から6弦(Bottom)の順に描画
  GUITAR_STRINGS.forEach(stringConfig => {
    html += `<tr><td class="string-label">${stringConfig.stringNum}弦 (${stringConfig.openNote})</td>`;

    for (let fret = 0; fret <= numFrets; fret++) {
      // 当該弦・フレットのノートがあるかチェック
      const match = activeNotes.find(n => n.string === stringConfig.stringNum && n.fret === fret);

      if (match) {
        html += `
          <td class="fret-cell fret-${fret}">
            <div class="note-badge active-note">${match.note}</div>
          </td>
        `;
      } else {
        html += `
          <td class="fret-cell fret-${fret}">
            <div class="note-slot"></div>
          </td>
        `;
      }
    }
    html += `</tr>`;
  });

  html += `</tbody></table></div></div>`;

  containerEl.innerHTML = html;
}
