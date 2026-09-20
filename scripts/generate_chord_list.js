import fs from 'fs';
import path from 'path';
import { getChordTones, formatChordForDisplay } from '../src/chordUtils.js';

const roots = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const chordTypes = [
  { name: 'メジャー7th', types: ['M7', 'Δ7', '^7'] },
  { name: 'ドミナント7th', types: ['7', '7sus4'] },
  { name: 'マイナー7th', types: ['m7', '-7'] },
  { name: 'マイナー7th(♭5)', types: ['m7b5', 'h7'] },
  { name: 'ディミニッシュ7th', types: ['dim7', 'o7'] },
  { name: '6th', types: ['6', 'm6'] },
  { name: 'トライアド', types: ['', 'm', 'dim', 'aug'] }
];

const rows = [];
rows.push(['コード記号', '表示表記', 'コード分類', 'ルート (R)', '3度音 (3/♭3/4)', '5度音 (5/♭5/♯5)', '7度音 (7/♭7/♭♭7/6)']);

roots.forEach(r => {
  chordTypes.forEach(group => {
    group.types.forEach(type => {
      const symbol = `${r}${type}`;
      const disp = formatChordForDisplay(symbol);
      const tones = getChordTones(symbol);

      const rTone = tones.find(t => t.degree === 'R')?.note || '-';
      const t3Tone = tones.find(t => t.order === 1) ? `${tones[1].degree}: ${tones[1].note}` : '-';
      const t5Tone = tones.find(t => t.order === 2) ? `${tones[2].degree}: ${tones[2].note}` : '-';
      const t7Tone = tones.find(t => t.order === 3) ? `${tones[3].degree}: ${tones[3].note}` : '-';

      rows.push([symbol, disp, group.name, rTone, t3Tone, t5Tone, t7Tone]);
    });
  });
});

// CSV形式文字列に変換 (UTF-8 BOM付きでExcelで直接開けるようにする)
const csvContent = '\uFEFF' + rows.map(r => r.map(cell => `"${cell}"`).join(',')).join('\n');

const outputPath = path.join(process.cwd(), 'chord_tones_list.csv');
fs.writeFileSync(outputPath, csvContent, 'utf8');

console.log(`Successfully generated ${rows.length - 1} chords to ${outputPath}`);
