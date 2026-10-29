# Press Conference

## Concept

Every round opens with a breaking-news headline about one player's politician, who takes the podium. The others are journalists: they each write a question about the headline on their phone, then vote for the best one (funniest, toughest, whatever they like). The TV reads the winning question in a journalist voice, the politician types an answer, and the TV plays it in the politician's voice. The journalists rate the answer 1–5 stars. Everyone takes the podium once, then the game is over.

Before the game, everyone builds their politician's look on their phone (skin, hair, suit, face, expression). The TV draws that character in the press room: at the podium when it's their turn, and on the floor as a reporter when it isn't.

Theme: decides who the politicians are, the headlines, and the look of the room. Elijah writes the characters, outlets, headlines and backup questions in `content.js`.

## Round loop

Each player takes the podium once (set `ROUNDS` in `.env` to play fewer, e.g. 1 for the demo).

| Phase | Length | What happens |
|---|---|---|
| `lobby` | until Start | Players scan the QR code, join and build their politician's look. The TV can add bots |
| `ask` | 40 s, or until every journalist has asked | The next player takes the podium. The anchor reads the round's headline; the TV and phones show it. Journalists type one question each about it. Blank ones get a backup question written for that headline |
| `pick` | 20 s, or until every journalist has voted | Journalists vote for the best question, not their own. Questions are anonymous. Skipped if there's only one question |
| `question` | until the TV finishes playing it (max 20 s) | The TV reads the winning question. Most votes wins; ties are settled at random |
| `answer` | 45 s, or until the politician answers | The politician types an answer. If time runs out, a stock line is said for them |
| `hearing` | until the TV finishes playing it | The TV plays the answer in the politician's voice, with subtitles |
| `rate` | 20 s, or until every journalist has rated | Journalists rate the answer 1–5 stars. Ratings are averaged |
| `results` | 10 s | Points for the round. Then the next player takes the podium |
| `final` | until the host restarts | After the last round: final scores and the winner |

Scoring: the journalist whose question was picked gets 200 points. The politician gets the average rating × 100 (5 stars = 500).

## Message list

Naming: `subject:action`. The server knows who sent a message from the socket, so phones never send their own id after joining.

**Rooms:** every TV page gets its own room with a 4-letter code, so several groups (or judges) can play at once. The TV shows a QR code for `/?room=CODE`; the phone reads `room` from its URL. Everything below happens inside one room.

**Bots:** the TV can add bots (`bot:add`) so one person can play alone. Bots live in the server: they ask, vote, answer and rate by themselves and show up in `players` with `bot: true`. Lines for them are in `content.js`.

**The main idea:** the server broadcasts `game:state` with everything public after every change. Screens just redraw from the latest `game:state`. A few extra messages carry things that happen once (play this audio) or are private (your own question and votes).

### Phone → server

| Message | Payload | Ack | When |
|---|---|---|---|
| `player:join` | `{ roomCode, playerId, name }` | `{ roomCode, you }` or `{ error }` | Tap to join, and after every reconnect. `roomCode` from the page URL |
| `player:look` | `{ look: { skin, hair, hairColor, suit, extra, mouth } }` (option indexes, see `public/avatar.js`) | `{ ok: true }` or `{ error }` | In the lobby, whenever the player changes their look |
| `question:submit` | `{ text }` (max 160 chars) | `{ ok: true }` or `{ error }` | Journalists, during `ask`. Sending again replaces the question |
| `vote:question` | `{ targetId }` (a question `id` from `game:state`) | `{ ok: true }` or `{ error }` | Journalists, during `pick`. Sending again changes the vote. Can't vote for your own |
| `answer:submit` | `{ text }` (max 200 chars) | `{ ok: true }` or `{ error }` | Politician, during `answer` |
| `answer:rate` | `{ stars }` (1–5) | `{ ok: true }` or `{ error }` | Journalists, during `rate`. Sending again changes the rating |

### TV → server

All of these only work from a socket that sent `tv:join`.

| Message | Payload | Ack | When |
|---|---|---|---|
| `tv:join` | `{ roomCode }` (optional) | `{ roomCode, state }` or `{ error }` | TV connects or reconnects. Without a code (or with an unknown one) it gets a new room. Keep the code in the URL (`/tv?room=CODE`) and send it again after a refresh |
| `bot:add` | none | `{ ok, playerId }` or `{ error }` | "Add bot" button in the lobby |
| `bot:remove` | `{ playerId }` | `{ ok }` or `{ error }` | Remove a bot (lobby only) |
| `game:start` | none | `{ ok }` or `{ error }` | Start button in the lobby (needs 2+ players) |
| `question:done` | `{ round }` | none | The question audio finished playing |
| `hearing:done` | `{ round }` | none | The answer audio finished playing |
| `phase:next` | none | none | Dev button: skip the rest of the current phase (in the lobby it starts the game with any number of players) |
| `game:reset` | none | none | Dev button / "Play again": back to the lobby, scores to 0, players stay |

If the TV never sends `question:done` or `hearing:done` (no audio, page closed), the server moves on by itself after a time based on the text length.

### Server → everyone

| Message | Payload | When |
|---|---|---|
| `game:state` | see below | After every change |
| `headline:read` | `{ round, text, audioUrl }` | Start of `ask`. The TV plays the anchor reading the headline (`audioUrl` may be `null`) |
| `question:ask` | `{ round, text, journalist: { playerId, name, outlet }, audioUrl }` | Start of `question`. The TV plays `audioUrl` (may be `null`: show the text only) |
| `hearing:line` | `{ round, playerId, character: { id, name, title }, text, audioUrl }` | Start of `hearing`. The TV plays `audioUrl` and shows `text` as a subtitle |

### Server → one phone

| Message | Payload | When |
|---|---|---|
| `you` | `{ player, role, question, votes: { question, stars } }`: your player, `'politician'` or `'journalist'` this round (`null` in the lobby), your question this round, the question you voted for and your rating | After joining, after your own look, question, vote or rating, and at the start of each phase where you act |

### `game:state`

```js
{
  roomCode: 'ABCD',
  phase: 'lobby' | 'ask' | 'pick' | 'question' | 'answer' | 'hearing' | 'rate' | 'results' | 'final',
  remainingMs: 31000,        // time left in this phase, null if it has no timer. Start your countdown when the message arrives
  round: 1,                  // 0 in the lobby
  totalRounds: 4,
  players: [{
    id, name, color, connected, bot, score,
    character: { id, name, title },   // their politician
    look: { skin, hair, hairColor, suit, extra, mouth },
    outlet,                  // their outlet when they're a journalist
    asked: true,             // wrote a question this round
    voted: false,            // voted in pick
    rated: false,            // rated the answer
  }],
  politicianId,              // who's at the podium, null in the lobby
  headline: '...',           // this round's headline, null in the lobby
  questions: [{ id, text }], // only in pick, otherwise []. id is the author's player id; screens don't show it
  chosen: { journalistId, question, answer },   // from question on; answer from hearing on
  results: {                 // results and final, otherwise null
    bestQuestion: playerId,  // whose question was picked
    questionVotes: { [playerId]: 2 },
    rating: { average: 3.7, count: 3 },
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
