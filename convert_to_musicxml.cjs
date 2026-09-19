const fs = require('fs');
const path = require('path');
const { convertSync } = require('@music-i18n/ireal-musicxml');

const htmlPath = path.join(__dirname, 'songs', 'KUROHON_ver5.html');
const outDir = path.join(__dirname, 'songs', 'musicxml');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const htmlContent = fs.readFileSync(htmlPath, 'utf8');

const match = htmlContent.match(/href="([^"]+)"/);
if (!match) {
  console.error('No irealb link found in HTML');
  process.exit(1);
}

const rawUrl = match[1];
const uri = decodeURIComponent(rawUrl);
console.log('Converting playlist to MusicXML...');

try {
  const playlist = convertSync(uri);
  console.log('Total songs in playlist:', playlist.songs.length);

  let successCount = 0;
  playlist.songs.forEach((song, idx) => {
    if (song.musicXml) {
      const safeTitle = song.title.replace(/[\/\\:*?"<>|]/g, '').trim().replace(/\s+/g, '_');
      const filename = `${String(idx + 1).padStart(3, '0')}_${safeTitle}.musicxml`;
      const filePath = path.join(outDir, filename);
      
      fs.writeFileSync(filePath, song.musicXml, 'utf8');
      successCount++;
    } else {
      console.warn(`No MusicXML generated for song ${idx + 1} (${song.title})`);
    }
  });

  console.log(`\n🎉 Successfully exported ALL ${successCount} / ${playlist.songs.length} MusicXML files to ${outDir}`);
} catch (e) {
  console.error('Conversion error:', e.message);
}
