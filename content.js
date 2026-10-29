// Game content: characters, headlines, questions and stock lines.
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

  // Each player also gets one of these for the rounds they're a journalist: their outlet,
  // and the voice that reads their question. They repeat if there are more players.
  journalists: [
    { id: 'j1', name: 'Rita Vance', outlet: 'The Daily Leak', voiceId: 'pFZP5JQG7iQjIQuC4Bku', voice: { gender: 'female', age: 'middle_aged', words: ['news', 'sharp', 'confident', 'clear'] } },
    { id: 'j2', name: 'Marcus Webb', outlet: 'Channel 9 Action News', voiceId: 'IKne3meq5aSn9XLyUdCD', voice: { gender: 'male', age: 'young', words: ['news', 'energetic', 'excited', 'american'] } },
    { id: 'j3', name: 'Barnaby Thistle', outlet: 'The Quarterly Gazette', voiceId: 'JBFqnCBsd6RMkjVDRZzb', voice: { gender: 'male', age: 'old', words: ['british', 'wise', 'narrat', 'calm'] } },
  ],

  // One per round: the scandal the journalists ask about. The anchor reads it out.
  // {name} becomes the politician's character name. questions: backups for this headline,
  // used when a journalist doesn't write one in time, and by bots.
  headlines: [
    {
      text: '{name} spent the city budget on a giant inflatable duck',
      questions: ['Why a duck?', 'Where is the duck now?', 'How much did the duck cost, exactly?', 'Did the duck vote for you?'],
    },
    {
      text: '{name} photographed at a casino during the flood',
      questions: ['Were you gambling while the city flooded?', 'Did you win?', 'Who was holding the umbrella?', 'Was that flood money on the table?'],
    },
    {
      text: '{name} caught selling the Golden Gate Bridge to a penguin',
      questions: ['How much did the penguin pay?', 'Is the bridge still ours?', 'Was this your first bridge sale?', 'Have you met the penguin before?'],
    },
    {
      text: '{name}\'s campaign bus drives into a lake',
      questions: ['Who was driving the bus?', 'Why did you wave from the roof?', 'Is the bus still in the lake?', 'Was the lake on the campaign route?'],
    },
    {
      text: '{name} accused of cancelling Christmas',
      questions: ['Did you or did you not cancel Christmas?', 'What do you have against Santa?', 'Where did the presents go?', 'Is New Year next?'],
    },
    {
      text: '{name}\'s official portrait shows a completely different person',
      questions: ['Who is in the portrait?', 'Do you know what you look like?', 'Who painted it, and were they paid?', 'Is the person in the portrait running the city?'],
    },
    {
      text: 'Money for the new hospital found in {name}\'s garage',
      questions: ['Why is the hospital money in your garage?', 'Where is the hospital?', 'What else is in the garage?', 'Can we see the garage?'],
    },
    {
      text: '{name} seen leaving the zoo with a penguin under each arm',
      questions: ['Where are the penguins now?', 'Is this related to the bridge?', 'Do you have a permit for those penguins?', 'Why two?'],
    },
    {
      text: '{name} votes against their own bill, twice',
      questions: ['Did you read your own bill?', 'Which way will you vote next time?', 'Who wrote the bill?', 'Are you against yourself?'],
    },
    {
      text: '{name} replaces all city stop signs with suggestions',
      questions: ['What does a suggestion sign say?', 'How many crashes since Monday?', 'Was this your idea?', 'Do you stop at stop signs?'],
    },
  ],

  // General backup questions, for when a headline runs out of its own.
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

  // Said for the politician when they run out of time to answer.
  stockAnswers: [
    'No comment.',
    'I will not dignify that with a response.',
    'Next question.',
    '[clears throat] I was not aware this press conference was today.',
    'My lawyer has advised me to simply... smile.',
    'I would like to thank my mother. Goodbye.',
  ],

  // Random delivery for answers read on stage: one tag at the start, sometimes a second
  // one before a later sentence. Only the voice hears them; screens show the clean text.
  // Tag ideas: https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices
  answerTags: [
    '[nervous laugh]', '[sighs]', '[sarcastic]', '[whispers]', '[excited]', '[clears throat]',
    '[laughs]', '[confidently]', '[defensive]', '[crying]', '[snorts]', '[mischievously]',
    '[exhales]', '[gulps]', '[shouting]', '[starts laughing]',
  ],
  secondTagChance: 0.5,

  // Bots fill the room when a judge plays alone. They ask the headline's backup questions,
  // and at the podium answer with one of these, so keep them general. Audio tags work here.
  botNames: ['Ada', 'Bruno', 'Chen', 'Dara', 'Emil', 'Fay'],
  botAnswers: [
    'Let me be absolutely clear: I have no idea what you are talking about.',
    'That is a great question, and I will answer it right after the election.',
    'I was not there. And if I was there, I was not paying attention.',
    'My opponent would love for you to ask that. Next question!',
    'I take full responsibility, and I blame my staff.',
    '[sighs] Look. We all make mistakes. Mine were just bigger.',
    'Absolutely not. Well, maybe. Probably yes.',
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
