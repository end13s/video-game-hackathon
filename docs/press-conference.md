# Press Conference

## Concept

One player is the politician at the podium. The others are journalists and type questions on their phones. The politician has to answer every question using a random hand of 3–4 talking points, like "family values", "the previous government" or "infrastructure". The TV reads each question in a journalist voice and each answer in the politician's voice. The room votes on the toughest question and rates the dodge. The podium rotates every round.

Before the game, everyone builds their politician's look on their phone (skin, hair, suit, face, expression). The TV draws that character in the lobby, at the podium and on the scoreboard.

Theme: decides who the politicians are, what the talking points are, and the look of the room. Elijah writes the characters, outlets, talking points and backup questions in `content.js`.

## Round loop

Each player takes the podium once (set `ROUNDS` in `.env` to play fewer, e.g. 1 for the demo).

| Phase | Length | What happens |
|---|---|---|
| `lobby` | until Start | Players scan the QR code, join and build their politician's look. The TV can add bots |
| `ask` | 40 s, or until every journalist has asked | The next player takes the podium and gets 3–4 talking points (shown on the TV and on every phone). Journalists type one question each. Blank ones get a backup question from `content.js` |
| `question` | until the TV finishes playing it (max 20 s) | The TV reads one journalist's question. Repeats for every question |
| `answer` | 40 s, or until the politician answers | The politician types an answer that must contain an unused talking point (tapping a card inserts it). If time runs out, a talking point plus a stock line is said for them |
| `hearing` | until the TV finishes playing it | The TV plays the answer in the politician's voice, with the talking point highlighted in the subtitle. Then the next `question`, or `vote` after the last one |
| `vote` | 25 s, or until everyone has voted | Everyone picks the toughest question (not their own). Journalists also rate the dodge 1–5 stars |
| `results` | 10 s | Points for the round. Then the next player takes the podium |
| `final` | until the host restarts | After the last round: final scores and the winner |

Scoring: journalists get 100 points per vote for their question. The politician gets the average dodge rating × 100 (5 stars = 500).

Talking points: each can be used once. If there are more questions than cards, used cards come back once all are used. Matching ignores case and punctuation.

## Message list

Naming: `subject:action`. The server knows who sent a message from the socket, so phones never send their own id after joining.

**Rooms:** every TV page gets its own room with a 4-letter code, so several groups (or judges) can play at once. The TV shows a QR code for `/?room=CODE`; the phone reads `room` from its URL. Everything below happens inside one room.

**Bots:** the TV can add bots (`bot:add`) so one person can play alone. Bots live in the server: they ask, dodge and vote by themselves and show up in `players` with `bot: true`. Lines for them are in `content.js`.

**The main idea:** the server broadcasts `game:state` with everything public after every change. Screens just redraw from the latest `game:state`. A few extra messages carry things that happen once (play this audio) or are private (your own question and votes).

### Phone → server

| Message | Payload | Ack | When |
|---|---|---|---|
| `player:join` | `{ roomCode, playerId, name }` | `{ roomCode, you }` or `{ error }` | Tap to join, and after every reconnect. `roomCode` from the page URL |
| `player:look` | `{ look: { skin, hair, hairColor, suit, extra, mouth } }` (option indexes, see `public/avatar.js`) | `{ ok: true }` or `{ error }` | In the lobby, whenever the player changes their look |
| `question:submit` | `{ text }` (max 160 chars) | `{ ok: true }` or `{ error }` | Journalists, during `ask`. Sending again replaces the question |
| `answer:submit` | `{ text }` (max 200 chars) | `{ ok: true }` or `{ error }` | Politician, during `answer`. Rejected if it doesn't contain a playable talking point |
| `vote:question` | `{ targetId }` (the journalist's player id) | `{ ok: true }` or `{ error }` | During `vote`. Sending again changes the vote. Can't vote for your own question |
| `vote:dodge` | `{ stars }` (1–5) | `{ ok: true }` or `{ error }` | Journalists, during `vote`. Sending again changes the rating |

### TV → server

All of these only work from a socket that sent `tv:join`.

| Message | Payload | Ack | When |
|---|---|---|---|
| `tv:join` | `{ roomCode }` (optional) | `{ roomCode, state }` or `{ error }` | TV connects or reconnects. Without a code (or with an unknown one) it gets a new room. Keep the code in the URL (`/tv?room=CODE`) and send it again after a refresh |
| `bot:add` | none | `{ ok, playerId }` or `{ error }` | "Add bot" button in the lobby |
| `bot:remove` | `{ playerId }` | `{ ok }` or `{ error }` | Remove a bot (lobby only) |
| `game:start` | none | `{ ok }` or `{ error }` | Start button in the lobby (needs 2+ players) |
| `question:done` | `{ round, index }` | none | The question audio finished playing |
| `hearing:done` | `{ round, index }` | none | The answer audio finished playing |
| `phase:next` | none | none | Dev button: skip the rest of the current phase (in the lobby it starts the game with any number of players) |
| `game:reset` | none | none | Dev button / "Play again": back to the lobby, scores to 0, players stay |

If the TV never sends `question:done` or `hearing:done` (no audio, page closed), the server moves on by itself after a time based on the text length.

### Server → everyone

| Message | Payload | When |
|---|---|---|
| `game:state` | see below | After every change |
| `question:ask` | `{ round, index, total, text, journalist: { playerId, name, outlet }, audioUrl }` | Start of each `question`. The TV plays `audioUrl` (may be `null`: show the text only) |
| `hearing:line` | `{ round, index, total, playerId, character: { id, name, title }, text, talkingPoint, audioUrl }` | Start of each `hearing`. The TV plays `audioUrl` and shows `text` as a subtitle |

### Server → one phone

| Message | Payload | When |
|---|---|---|
| `you` | `{ player, role, question, votes: { question, dodge } }`: your player, `'politician'` or `'journalist'` this round (`null` in the lobby), your question this round, your votes | After joining, after your own look, question or vote, and at the start of each round |

### `game:state`

```js
{
  roomCode: 'ABCD',
  phase: 'lobby' | 'ask' | 'question' | 'answer' | 'hearing' | 'vote' | 'results' | 'final',
  remainingMs: 31000,        // time left in this phase, null if it has no timer. Start your countdown when the message arrives
  round: 1,                  // 0 in the lobby
  totalRounds: 4,
  players: [{
    id, name, color, connected, bot, score,
    character: { id, name, title },   // their politician
    look: { skin, hair, hairColor, suit, extra, mouth },
    outlet,                  // their outlet when they're a journalist
    asked: true,             // this round (during ask)
    voted: false,            // all their votes are in (during vote)
  }],
  politicianId,              // who's at the podium, null in the lobby
  talkingPoints: [{ text, used }],
  grill: { index, total, journalistId, question, answer, talkingPoint },  // during question, answer, hearing; answer and talkingPoint only in hearing
  transcript: [{ journalistId, question, answer, talkingPoint }],         // only in vote, results and final, otherwise []
  results: {                 // results and final, otherwise null
    questionVotes: { [playerId]: 2 },
    bestQuestion: [playerId],
    dodge: { average: 3.7, count: 3 },
    points: { [playerId]: 200 },
  },
}
```

### HTTP

| Route | What |
|---|---|
| `GET /?room=CODE` | Phone page |
| `GET /tv` | TV page (creates a room). `/tv?room=CODE` gets that room back |
| `GET /debug.html` | Dev TV: raw state, event log, plays audio, Add bot / Start / Skip / Reset buttons |
| `GET /config` | `{ publicUrl, voiceEnabled }` |
| `GET /qr.svg?text=...` | QR code |
| `POST /api/speak` | `{ text, voice }` where `voice` is a character or journalist id, or `anchor`. Returns `{ url }`. For extra lines on the TV (anchor intro, winner) |
| `GET /speech/:id` | Streams a text-to-speech result |
| `/audio/*.mp3` | Elijah's sound effects and music in `public/audio/` |
