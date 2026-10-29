// Fake players for testing without phones. They join, answer and vote by themselves.
// Usage: npm run bots -- <ROOM> [count] [url]     e.g. npm run bots -- ABCD 3
// The TV can also add bots itself (they run inside the server); this script is for load testing.
const { io } = require('socket.io-client');

const roomCode = String(process.argv[2] || '').toUpperCase();
const count = Math.min(6, Number(process.argv[3]) || 3);
const url = process.argv[4] || `http://localhost:${process.env.PORT || 3000}`;
if (!roomCode) {
  console.log('Usage: npm run bots -- <ROOM> [count] [url]');
  process.exit(1);
}

const NAMES = ['Ada', 'Bruno', 'Chen', 'Dara', 'Emil', 'Fay'];
const ANSWERS = [
  'Let me be absolutely clear: I have no idea what you are talking about.',
  'That is a great question, and I will answer it after the election.',
  'I was not there. And if I was there, I was not paying attention.',
  'My opponent would love for you to ask that. Next question!',
  'I take full responsibility, and I blame my staff.',
  '[sighs] Look. We all make mistakes. Mine were just bigger.',
  'Absolutely not. Well, maybe. Probably yes.',
];

const wait = (min, max) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
const pick = (list) => list[Math.floor(Math.random() * list.length)];

for (let i = 0; i < count; i++) {
  const name = `${NAMES[i]} (bot)`;
  const playerId = `ext-bot-${roomCode}-${i}`;
  const socket = io(url);
  let answeredRound = 0;
  let votedRound = 0;

  socket.on('connect', () => {
    socket.emit('player:join', { roomCode, playerId, name }, (res) => {
      if (res.error) return console.log(`${name}: ${res.error}`);
      console.log(`${name} joined as ${res.you.player.character?.name}`);
    });
  });

  socket.on('game:state', async (state) => {
    if (state.phase === 'answer' && answeredRound !== state.round) {
      answeredRound = state.round;
      await wait(1000, 5000);
      socket.emit('answer:submit', { text: pick(ANSWERS) }, () => {});
    }
    if (state.phase === 'vote' && votedRound !== state.round) {
      votedRound = state.round;
      const others = state.answers.filter((a) => a.playerId !== playerId);
      if (!others.length) return;
      await wait(1000, 4000);
      socket.emit('vote:cast', { targetId: pick(others).playerId }, () => {});
    }
  });

  socket.on('disconnect', () => console.log(`${name} disconnected`));
}

console.log(`${count} bots connecting to ${url}, room ${roomCode}. Ctrl+C to stop.`);
