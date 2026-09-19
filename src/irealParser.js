/**
 * iReal Pro コード進行文字列を小節・拍構造にパースするモジュール
 */

// iReal Proのレイアウト・制御タグを除去し、純粋な小節とコードの配列にする
export function parseIrealChords(rawChords) {
  if (!rawChords) return { timeSignature: '4/4', beatsPerMeasure: 4, measures: [] };

  let cleaned = rawChords;

  // 1r34LbKcu7 スクランブル文字列が含まれている場合の復元処理
  if (cleaned.startsWith('1r34LbKcu7')) {
    cleaned = cleaned.slice(10);
    const blocks = [];
    for (let i = 0; i < cleaned.length; i += 50) {
      const block = cleaned.slice(i, i + 50);
      if (block.length === 50) {
        blocks.push(block.split('').reverse().join(''));
      } else {
        blocks.push(block);
      }
    }
    cleaned = blocks.join('');
  }

  // 1. タイムシグネチャの取得 (デフォルト 4/4)
  let beatsPerMeasure = 4;
  let timeSignature = '4/4';
  const timeMatch = cleaned.match(/T(\d)(\d)/);
  if (timeMatch) {
    const num = parseInt(timeMatch[1], 10);
    const den = parseInt(timeMatch[2], 10);
    timeSignature = `${num}/${den}`;
    beatsPerMeasure = num;
  }

  // 2. セクションや演奏用タグのクリーンアップ
  cleaned = cleaned.replace(/T\d\d/g, ''); // T44などを削除
  cleaned = cleaned.replace(/[*][A-Za-z0-9]/g, ''); // *A, *B, *i, *t などのセクションマーク削除
  cleaned = cleaned.replace(/N\d/g, ''); // 1番括弧/2番括弧の表記削除
  cleaned = cleaned.replace(/<[^>]+>/g, ''); // テキスト注釈 <Fine> 等の削除
  cleaned = cleaned.replace(/[{}()\[\]]/g, ' | '); // ブラケットを小節境界に置換
  
  // iRealレイアウト・制御文字のクリーンアップ
  cleaned = cleaned.replace(/Kcl|lcK|cK|LZ|Y|Z|S|Q|f/g, ' '); 
  cleaned = cleaned.replace(/y|X|L|p/g, ' '); // レイアウトパディング文字の置換 (bはフラット記号のため保持)

  // 3. 小節ごとの分割 (| で分割)
  const rawMeasures = cleaned.split('|');
  const measures = [];

  let lastChord = 'C';

  for (let mRaw of rawMeasures) {
    let text = mRaw.trim();
    if (!text) continue;

    // 小節内のトークン取得（コード、スラッシュ、延長記号など）
    const tokens = extractChordsFromMeasureText(text);

    if (tokens.length === 0) continue;

    // 拍ごとの割り当て
    const measureBeats = assignBeatsToTokens(tokens, beatsPerMeasure, lastChord);
    if (measureBeats.length > 0) {
      // 最後のコードを保持（コード延長用）
      lastChord = measureBeats[measureBeats.length - 1] || lastChord;
      measures.push({
        measureIndex: measures.length,
        chords: measureBeats, // 長さ beatsPerMeasure の配列 (例: ['F^7', 'F^7', 'F^7', 'F^7'])
        displayTokens: tokens.filter(t => t !== '/' && t !== 'x') // リードシート表示用の簡潔トークン
      });
    }
  }

  return {
    timeSignature,
    beatsPerMeasure,
    measures
  };
}

// 小節文字列からコード記号を抽出する
function extractChordsFromMeasureText(text) {
  // スペースやスラッシュでトークン分割
  const rawTokens = text.split(/\s+/).filter(t => t.length > 0);
  const chords = [];

  for (let t of rawTokens) {
    // 繰り返し記号 N1, N2, 1N, 2N やレイアウトタグの除去
    t = t.replace(/N\d|C\d|\dN|\dC/g, '').trim();
    if (!t) continue;

    // リピート・継続 'x', '%'
    if (t === 'x' || t === '%') {
      chords.push('x');
      continue;
    }
    if (t === '/') {
      chords.push('/');
      continue;
    }

    // コード記号の正規化判定 (A-G で始まるもの)
    const chordMatch = t.match(/([A-G][b#]?[^\s]*)/);
    if (chordMatch) {
      // 末尾についた不自然なゴミ文字のカット
      let c = chordMatch[1].replace(/[()\[\]{}|]/g, '');
      if (c) chords.push(c);
    }
  }

  return chords;
}

// 1小節内のコードを拍数に合わせて配分する
function assignBeatsToTokens(tokens, beatsPerMeasure, fallbackChord) {
  const beats = [];
  const validChords = tokens.filter(t => t !== '/' && t !== 'x');

  if (validChords.length === 0) {
    for (let i = 0; i < beatsPerMeasure; i++) beats.push(fallbackChord);
    return beats;
  }

  if (validChords.length === 1) {
    // 1つのコードが小節全体を占める
    const c = validChords[0];
    for (let i = 0; i < beatsPerMeasure; i++) beats.push(c);
  } else if (validChords.length === 2) {
    // 2つのコード (例: 4拍子の場合は2拍ずつ)
    const half = Math.floor(beatsPerMeasure / 2);
    for (let i = 0; i < half; i++) beats.push(validChords[0]);
    for (let i = half; i < beatsPerMeasure; i++) beats.push(validChords[1]);
  } else if (validChords.length === 3) {
    // 3つのコード (例: 4拍子で 2拍, 1拍, 1拍)
    beats.push(validChords[0]);
    beats.push(validChords[0]);
    beats.push(validChords[1]);
    beats.push(validChords[2]);
  } else {
    // 4つ以上のコード
    for (let i = 0; i < beatsPerMeasure; i++) {
      beats.push(validChords[i] || validChords[validChords.length - 1]);
    }
  }

  return beats;
}

