// Fake players for testing without phones. They join, ask, dodge and vote by themselves.
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

const content = require('../content');
const NAMES = content.botNames;

const wait = (min, max) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
const pick = (list) => list[Math.floor(Math.random() * list.length)];

for (let i = 0; i < count; i++) {
  const name = `${NAMES[i]} (bot)`;
  const playerId = `ext-bot-${roomCode}-${i}`;
  const socket = io(url);
  const done = new Set(); // phase steps already handled, e.g. "ask:1" or "answer:1:0"

  socket.on('connect', () => {
    socket.emit('player:join', { roomCode, playerId, name }, (res) => {
      if (res.error) return console.log(`${name}: ${res.error}`);
      console.log(`${name} joined as ${res.you.player.character?.name}`);
    });
  });

  socket.on('game:state', async (state) => {
    const atPodium = state.politicianId === playerId;
    const step = `${state.phase}:${state.round}:${state.grill?.index ?? ''}`;
    if (done.has(step)) return;

    if (state.phase === 'ask' && !atPodium) {
      done.add(step);
      await wait(1000, 5000);
      socket.emit('question:submit', { text: pick(content.questions).text }, () => {});
    }
    if (state.phase === 'answer' && atPodium) {
      done.add(step);
      await wait(1000, 4000);
      const cards = state.talkingPoints.filter((c) => !c.used);
      const card = pick(cards.length ? cards : state.talkingPoints);
      socket.emit('answer:submit', { text: pick(content.botDodges).replace('{point}', card.text) }, () => {});
    }
    if (state.phase === 'vote') {
      done.add(step);
      await wait(1000, 4000);
      const others = state.transcript.filter((t) => t.journalistId !== playerId);
      if (others.length) socket.emit('vote:question', { targetId: pick(others).journalistId }, () => {});
      if (!atPodium) socket.emit('vote:dodge', { stars: 2 + Math.floor(Math.random() * 4) }, () => {});
    }
  });

  socket.on('disconnect', () => console.log(`${name} disconnected`));
}

console.log(`${count} bots connecting to ${url}, room ${roomCode}. Ctrl+C to stop.`);
