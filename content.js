// Game content. Placeholder data: replace with theme content.
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

  journalists: [
    { id: 'j1', name: 'Reporter One', outlet: 'The Daily Placeholder', voiceId: '' },
    { id: 'j2', name: 'Reporter Two', outlet: 'Channel 0 News', voiceId: '' },
  ],

  // journalist: id from the list above (random if left out).
  // audio: optional pre-made MP3 in public/audio/, played instead of live text-to-speech.
  questions: [
    { text: 'Placeholder question one?', journalist: 'j1' },
    { text: 'Placeholder question two?', journalist: 'j2' },
    { text: 'Placeholder question three?' },
    { text: 'Placeholder question four?' },
  ],

  // Used when a player doesn't answer in time.
  stockAnswers: ['No comment.', 'I will not dignify that with a response.', 'Next question.'],

  // Bots fill the room when a judge plays alone. They pick one of these at random,
  // so make them funny and general enough to fit any question. Audio tags work here.
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
