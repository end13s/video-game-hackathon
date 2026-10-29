// Generates the sound effects and music into public/audio/ with ElevenLabs sound generation.
// Files that already exist are skipped, so a bad one can be redone by deleting it.
//   npm run audio:sfx               make the missing ones
//   npm run audio:sfx -- boo gasp   redo just these
// API reference: https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert
const fs = require('fs');
const path = require('path');
const { AUDIO_DIR, requireKey, api, saveMp3 } = require('./eleven');

// name -> file in public/audio/<name>.mp3. public/sound.js uses the same names.
const SOUNDS = {
  shutter: { text: 'Rapid burst of many press camera shutters clicking and flashes popping in a crowded press room', seconds: 2.5 },
  murmur: { text: 'Crowd of journalists murmuring and chatting quietly in a press conference room, room tone, no music', seconds: 15, loop: true },
  boo: { text: 'Small crowd booing and jeering in disapproval', seconds: 2.5 },
  gasp: { text: 'Crowd of people gasping in shock at the same time', seconds: 1.5 },
  laugh: { text: 'Audience of reporters laughing out loud together', seconds: 3 },
  applause: { text: 'Enthusiastic applause and cheering from a crowd in a hall', seconds: 4 },
  sting: { text: 'Dramatic orchestral news sting, big brass and timpani hit, breaking news reveal', seconds: 2 },
  countdown: { text: 'Tense clock ticking getting louder, five ticks, ending with a buzzer', seconds: 5 },
  join: { text: 'Short bright friendly notification chime, two rising notes', seconds: 1 },
  intro: { text: 'Upbeat cheesy TV news theme music, brass and synth, energetic party game lobby music, instrumental', seconds: 30, loop: true },
  victory: { text: 'Triumphant short victory fanfare, brass band, celebratory, instrumental', seconds: 10 },
};

(async () => {
  requireKey();
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  for (const name of only) if (!SOUNDS[name]) throw new Error(`Unknown sound "${name}". Known: ${Object.keys(SOUNDS).join(', ')}`);

  for (const [name, s] of Object.entries(SOUNDS)) {
    const file = path.join(AUDIO_DIR, `${name}.mp3`);
    if (only.length ? !only.includes(name) : fs.existsSync(file)) continue;
    process.stdout.write(`  ${name.padEnd(10)} ... `);
    const res = await api('POST', '/sound-generation?output_format=mp3_44100_128', {
      text: s.text,
      duration_seconds: s.seconds,
      prompt_influence: 0.4,
      loop: Boolean(s.loop),
      model_id: 'eleven_text_to_sound_v2',
    });
    await saveMp3(res, file);
    console.log('done');
  }
  console.log(`Sounds are in ${path.relative(process.cwd(), AUDIO_DIR)}/`);
})().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
