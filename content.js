// Game content: characters, questions and stock lines.
// voiceId: filled in by `npm run audio:voices`, or copy one from the ElevenLabs web app
// (My Voices > ... > Copy voice ID). An empty voiceId falls back to ELEVENLABS_TEST_VOICE_ID.
// voice: what `npm run audio:voices` looks for when it picks a voice.
// Keep each character on one line, the voice script rewrites the voiceId in place.
// Anchor lines and sound effects for the TV live in public/sound.js.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const content = {
  anchor: { name: 'Dale Brightwater', voiceId: 'nPczCjzI2devNBz1zQrb', voice: { gender: 'male', age: 'middle_aged', words: ['news', 'narrat', 'deep', 'confident', 'broadcast'] } },

  // One per player, handed out in this order. Need at least 6.
  politicians: [
    { id: 'p1', name: 'Senator Chet Granite', title: 'Senior Senator, 40 years in office', bio: 'Has never answered a question directly.', voiceId: 'pqHfZKP75CvOlQylNhV4', voice: { gender: 'male', age: 'old', words: ['deep', 'raspy', 'gravel', 'authorit'] } },
    { id: 'p2', name: 'Mayor Tiffany Sparks', title: 'First-term Mayor', bio: 'Won by eleven votes, all of them her cousins.', voiceId: 'cgSgspJ2msm6clMCkdW9', voice: { gender: 'female', age: 'young', words: ['upbeat', 'bright', 'energetic', 'cheer'] } },
    { id: 'p3', name: 'Governor Hal Buckley', title: 'Governor and part-time cattle rancher', bio: 'Thinks every problem can be solved with a ribbon cutting.', voiceId: 'CwhRBWXzGAHq8TQ4Fs17', voice: { gender: 'male', age: 'middle_aged', words: ['southern', 'american', 'warm', 'casual'] } },
    { id: 'p4', name: 'Minister Prudence Vale', title: 'Minister of Very Serious Affairs', bio: 'Has a binder for everything, including this binder.', voiceId: 'Xb7hH8MSUJpSbSDYk0k2', voice: { gender: 'female', age: 'middle_aged', words: ['british', 'crisp', 'confident', 'professional'] } },
    { id: 'p5', name: 'Rep. Danny "D-Money" Okafor', title: 'Representative, youngest in history', bio: 'Livestreams every vote. Has a merch line.', voiceId: 'TX3LPaxmHKxFdv7VOQHJ', voice: { gender: 'male', age: 'young', words: ['casual', 'energetic', 'friendly', 'social'] } },
    { id: 'p6', name: 'Press Secretary Gwen Holloway', title: 'Press Secretary', bio: 'Professional spinner. Has never been dizzy.', voiceId: 'EXAVITQu4vr4xnSDxMaL', voice: { gender: 'female', age: 'old', words: ['calm', 'mature', 'smooth', 'sophisticat'] } },
  ],

  journalists: [
    { id: 'j1', name: 'Rita Vance', outlet: 'The Daily Leak', voiceId: 'pFZP5JQG7iQjIQuC4Bku', voice: { gender: 'female', age: 'middle_aged', words: ['news', 'sharp', 'confident', 'clear'] } },
    { id: 'j2', name: 'Marcus Webb', outlet: 'Channel 9 Action News', voiceId: 'IKne3meq5aSn9XLyUdCD', voice: { gender: 'male', age: 'young', words: ['news', 'energetic', 'excited', 'american'] } },
    { id: 'j3', name: 'Barnaby Thistle', outlet: 'The Quarterly Gazette', voiceId: 'JBFqnCBsd6RMkjVDRZzb', voice: { gender: 'male', age: 'old', words: ['british', 'wise', 'narrat', 'calm'] } },
  ],

  // journalist: id from the list above.
  // audio is set automatically when `npm run audio:questions` has made an MP3 for the question.
  questions: [
    { text: 'Senator, sources say you were seen leaving a zoo at 3 AM carrying a penguin. Care to explain?', journalist: 'j1' },
    { text: 'Your campaign promised free pizza for every citizen. It has been two years. Where is the pizza?', journalist: 'j2' },
    { text: 'Is it true you have never actually read a single bill you voted on?', journalist: 'j3' },
    { text: 'A leaked email shows you called the national budget, quote, "a vibe." Do you stand by that?', journalist: 'j1' },
    { text: 'You were caught on camera falling asleep during your own speech. What were you dreaming about?', journalist: 'j2' },
    { text: 'Why did the city just spend four million dollars on a statue of your dog?', journalist: 'j1' },
    { text: 'Witnesses say you cried during a cooking show and blamed it on onions. There were no onions. Comment?', journalist: 'j2' },
    { text: 'What is your official position on pineapple on pizza, and how will it affect foreign policy?', journalist: 'j3' },
    { text: 'Your opponent says you have the charisma of a damp sock. How do you respond?', journalist: 'j1' },
    { text: 'You accidentally declared war on Canada in a group chat. What happens now?', journalist: 'j2' },
    { text: 'Can you name one thing you have accomplished this year? Just one. Take your time.', journalist: 'j3' },
    { text: 'Why are there forty-seven goats living in the government building?', journalist: 'j1' },
    { text: 'Your new slogan is "Probably Fine." Is that really the best you could do?', journalist: 'j2' },
    { text: 'Reports say you tried to pay your taxes in coupons. Is that legal?', journalist: 'j1' },
    { text: 'If you were a vegetable, which vegetable would you be, and why should voters trust it?', journalist: 'j3' },
    { text: 'A whistleblower claims your entire speech last week was written by your cat. Is the cat available for comment?', journalist: 'j2' },
    { text: 'You said you would fix the potholes. Instead you named them. Why?', journalist: 'j1' },
    { text: 'Final question: in one sentence, why should anyone ever vote for you again?', journalist: 'j3' },
  ],

  // Used when a player doesn't answer in time.
  stockAnswers: [
    'No comment.',
    'I will not dignify that with a response.',
    'Next question.',
    '[clears throat] I was not aware this press conference was today.',
    'My lawyer has advised me to simply... smile.',
    'I would like to thank my mother. Goodbye.',
  ],
};

// Pre-made question MP3s are named after the question text and the voice reading it,
// so editing a question or changing a voice just means running the script again.
const questionFile = (q) => {
  const j = content.journalists.find((x) => x.id === q.journalist);
  const hash = crypto.createHash('sha1').update(`${q.text}|${j ? j.voiceId : ''}`).digest('hex').slice(0, 10);
  return `questions/q-${hash}.mp3`;
};
for (const q of content.questions) {
  if (!q.audio && fs.existsSync(path.join(__dirname, 'public', 'audio', questionFile(q)))) q.audio = questionFile(q);
}

module.exports = content;
module.exports.questionFile = questionFile;
