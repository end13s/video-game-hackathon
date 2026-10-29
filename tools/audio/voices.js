// Picks a voice for the anchor, every politician and every journalist from the voices on
// the ElevenLabs account (the premade ones plus anything in My Voices), and writes the
// ids into content.js. Characters that already have a voiceId are left alone.
//   npm run audio:voices            fill in empty voiceIds
//   npm run audio:voices -- --all   pick again for everyone
const fs = require('fs');
const path = require('path');
const { ROOT, requireKey, api } = require('./eleven');
const content = require('../../content');

const CONTENT_FILE = path.join(ROOT, 'content.js');
const redoAll = process.argv.includes('--all');

const norm = (s) => String(s || '').toLowerCase().replace(/[\s-]+/g, '_');

function score(voice, want) {
  const labels = voice.labels || {};
  const text = `${voice.name} ${voice.description || ''} ${Object.values(labels).join(' ')}`.toLowerCase();
  let s = 0;
  if (norm(labels.gender) === want.gender) s += 10;
  else if (labels.gender) s -= 20;
  if (norm(labels.age) === want.age) s += 4;
  for (const w of want.words || []) if (text.includes(w)) s += 2;
  return s;
}

(async () => {
  requireKey();
  const { voices } = await (await api('GET', '/voices')).json();
  if (!voices.length) throw new Error('No voices on this account');

  const cast = [{ id: 'anchor', ...content.anchor }, ...content.politicians, ...content.journalists];
  const used = new Set(cast.map((c) => (redoAll ? '' : c.voiceId)).filter(Boolean));
  let source = fs.readFileSync(CONTENT_FILE, 'utf8');

  for (const c of cast) {
    if (c.voiceId && !redoAll) {
      console.log(`  keep  ${c.name.padEnd(30)} ${c.voiceId}`);
      continue;
    }
    // Everyone gets a different voice while there are enough to go round.
    const ranked = [...voices].sort((a, b) => score(b, c.voice) - score(a, c.voice));
    const voice = ranked.find((v) => !used.has(v.voice_id)) || ranked[0];
    used.add(voice.voice_id);

    // The anchor line has no id field, so match it by the `anchor:` key instead.
    const lineMatch = c.id === 'anchor' ? /^(\s*anchor:.*?voiceId: )'[^']*'/m : new RegExp(`^(\\s*\\{ id: '${c.id}',.*?voiceId: )'[^']*'`, 'm');
    if (!lineMatch.test(source)) throw new Error(`Could not find the content.js line for ${c.id}`);
    source = source.replace(lineMatch, `$1'${voice.voice_id}'`);
    const labels = voice.labels || {};
    console.log(`  set   ${c.name.padEnd(30)} ${voice.voice_id}  ${voice.name} (${[labels.gender, labels.age, labels.accent].filter(Boolean).join(', ')})`);
  }

  fs.writeFileSync(CONTENT_FILE, source);
  console.log('\nVoice ids written to content.js. Not happy with one? Paste another id into its voiceId.');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
