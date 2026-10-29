// Game content. Names, voices and outlets are placeholders: replace with theme content.
// voiceId: copy from the ElevenLabs web app (My Voices > ... > Copy voice ID).
// An empty voiceId falls back to ELEVENLABS_TEST_VOICE_ID from .env.

module.exports = {
  anchor: {
    name: 'The Anchor',
    voiceId: '',
  },

  // One per player, handed out in this order. Need at least 6.
  politicians: [
    { id: 'p1', name: 'Senator One', title: 'Senior Senator', voiceId: '' },
    { id: 'p2', name: 'Mayor Two', title: 'First-term Mayor', voiceId: '' },
    { id: 'p3', name: 'Governor Three', title: 'Governor', voiceId: '' },
    { id: 'p4', name: 'Minister Four', title: 'Minister', voiceId: '' },
    { id: 'p5', name: 'Rep Five', title: 'Representative', voiceId: '' },
    { id: 'p6', name: 'Spokesperson Six', title: 'Press Secretary', voiceId: '' },
  ],

  // Each player also gets an outlet for the rounds they're a journalist. Their questions
  // are read in that outlet's voice. Need at least 6.
  journalists: [
    { id: 'j1', name: 'Reporter One', outlet: 'The Daily Ledger', voiceId: '' },
    { id: 'j2', name: 'Reporter Two', outlet: 'Channel 9 News', voiceId: '' },
    { id: 'j3', name: 'Reporter Three', outlet: 'The Morning Post', voiceId: '' },
    { id: 'j4', name: 'Reporter Four', outlet: 'Radio Free Town', voiceId: '' },
    { id: 'j5', name: 'Reporter Five', outlet: 'The Gazette', voiceId: '' },
    { id: 'j6', name: 'Reporter Six', outlet: 'Breaking Now', voiceId: '' },
  ],

  // The politician gets 3-4 of these per round and must work one into every answer.
  talkingPoints: [
    'family values', 'the previous government', 'infrastructure', 'hardworking families',
    'job creators', 'our brave farmers', 'the economy', 'national security', 'common sense',
    'the children', 'freedom', 'small businesses', 'bridges', 'fiscal responsibility',
    'the middle class', 'tax relief', 'law and order', 'innovation', 'our great nation',
    'the American dream', 'clean energy', 'border security', 'healthcare costs', 'transparency',
    'moving forward', 'my grandmother', 'the free market', 'local communities', 'potholes',
    'the fake news media',
  ],

  // Backup questions: used when a journalist doesn't write one in time, and by bots.
  questions: [
    { text: 'Why was the city budget spent on a giant inflatable duck?' },
    { text: 'Can you explain the photos of you at the casino during the flood?' },
    { text: 'Is it true you have never seen a vegetable?' },
    { text: 'Why did your campaign bus drive into a lake?' },
    { text: 'Did you or did you not cancel Christmas?' },
    { text: 'Why does your official portrait show a different person?' },
    { text: 'What happened to the money for the new hospital?' },
    { text: 'Why were you seen leaving the zoo with a penguin?' },
    { text: 'Can you name a single thing you did this year?' },
    { text: 'Why did you vote against your own bill?' },
  ],

  // When the politician runs out of time, a talking point plus one of these is said for them.
  stockAnswers: ['No comment.', 'I will not dignify that with a response.', 'Next question.'],

  // Random delivery for answers read on stage: one tag at the start, sometimes a second
  // one before a later sentence. Only the voice hears them; screens show the clean text.
  // Tag ideas: https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices
  answerTags: [
    '[nervous laugh]', '[sighs]', '[sarcastic]', '[whispers]', '[excited]', '[clears throat]',
    '[laughs]', '[confidently]', '[defensive]', '[crying]', '[snorts]', '[mischievously]',
    '[exhales]', '[gulps]', '[shouting]', '[starts laughing]',
  ],
  secondTagChance: 0.5,

  // Bots fill the room when a judge plays alone. At the podium they pick one of these and
  // put a talking point in place of {point}, so keep them general. Audio tags work here.
  botNames: ['Ada', 'Bruno', 'Chen', 'Dara', 'Emil', 'Fay'],
  botDodges: [
    'Let me be absolutely clear: this is about {point}.',
    'That is a great question, and the answer is {point}.',
    'I was not there. But I can tell you about {point}.',
    'My opponent would love for you to ask that. I would rather talk about {point}.',
    'I take full responsibility, and I blame {point}.',
    '[sighs] Look. At the end of the day, it all comes down to {point}.',
    'Absolutely not. Well, maybe. What really matters is {point}.',
  ],
};
