// Pre-generates every question as an MP3 in the asking journalist's voice, so questions
// play instantly instead of waiting for live text-to-speech. content.js picks them up by
// itself. Run it again after changing a question or a voice; old files can be deleted.
//   npm run audio:questions
const fs = require('fs');
const path = require('path');
const { AUDIO_DIR, requireKey, api, saveMp3 } = require('./eleven');
const content = require('../../content');

// Best quality model; these are made ahead of time, so speed doesn't matter.
// https://elevenlabs.io/docs/overview/models
const MODEL = 'eleven_v4';
const FALLBACK_VOICE = process.env.ELEVENLABS_TEST_VOICE_ID || '';

(async () => {
  requireKey();
  let made = 0;
  for (const q of content.questions) {
    const file = path.join(AUDIO_DIR, content.questionFile(q));
    if (fs.existsSync(file)) continue;
    const j = content.journalists.find((x) => x.id === q.journalist);
    const voiceId = (j && j.voiceId) || FALLBACK_VOICE;
    if (!voiceId) throw new Error('Journalists have no voiceId. Run `npm run audio:voices` first.');
    process.stdout.write(`  ${q.text.slice(0, 60).padEnd(60)} ... `);
    const res = await api('POST', `/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, { text: q.text, model_id: MODEL });
    await saveMp3(res, file);
    made++;
    console.log('done');
  }
  console.log(`${made} new, ${content.questions.length - made} already there. Restart the server to pick them up.`);
})().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
