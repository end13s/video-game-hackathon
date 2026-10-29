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

  // Said for the politician when they run out of time to answer.
  stockAnswers: ['No comment.', 'I will not dignify that with a response.', 'Next question.', 'I do not recall.'],

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
