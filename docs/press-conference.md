# Press Conference

## Concept

Every player is a politician at a press conference. A journalist asks a question (read aloud in the journalist's voice), everyone types an answer on their phone, and then the TV plays every answer in that player's politician voice, with subtitles and crowd reactions. Players vote for the best answer. Votes are points.

Theme: decides who the politicians are, what the journalists ask, and the look of the room. Elijah writes the questions and characters in `content.js`.

## Round loop

One round is about 2 minutes. A game is `ROUNDS` rounds (3 by default, 1 for the demo).

| Phase | Length | What happens |
|---|---|---|
| `lobby` | until Start | Players scan the QR code and join. Each gets a politician character. The TV can add bots |
| `question` | until the TV finishes playing it (max 20 s) | A journalist asks the question |
| `answer` | 45 s, or until everyone has answered | Players type an answer. They can change it until time is up. Empty answers get a stock line ("No comment.") |
| `hearing` | one line after another | The TV plays each answer in the player's voice. Text-to-speech for all answers starts as soon as answering closes |
| `vote` | 20 s, or until everyone has voted | Each player votes for one answer, not their own |
| `results` | 10 s | Votes and points for the round |
| `final` | until the host restarts | After the last round: final scores and the winner |

Scoring: 100 points per vote received.

## Message list

Naming: `subject:action`. The server knows who sent a message from the socket, so phones never send their own id after joining.

**Rooms:** every TV page gets its own room with a 4-letter code, so several groups (or judges) can play at once. The TV shows a QR code for `/?room=CODE`; the phone reads `room` from its URL. Everything below happens inside one room.

**Bots:** the TV can add bots (`bot:add`) so one person can play alone. Bots live in the server: they answer and vote by themselves and show up in `players` with `bot: true`. Lines for them are in `content.js`.

**The main idea:** the server broadcasts `game:state` with everything public after every change. Screens just redraw from the latest `game:state`. A few extra messages carry things that happen once (play this audio) or are private (your own answer).

### Phone → server

| Message | Payload | Ack | When |
|---|---|---|---|
| `player:join` | `{ roomCode, playerId, name }` | `{ roomCode, you }` or `{ error }` | Tap to join, and after every reconnect. `roomCode` from the page URL |
| `answer:submit` | `{ text }` (max 200 chars) | `{ ok: true }` or `{ error }` | During `answer`. Sending again replaces the answer |
| `vote:cast` | `{ targetId }` (a player id) | `{ ok: true }` or `{ error }` | During `vote`. Sending again changes the vote. Can't vote for yourself |

### TV → server

All of these only work from a socket that sent `tv:join`.

| Message | Payload | Ack | When |
|---|---|---|---|
| `tv:join` | `{ roomCode }` (optional) | `{ roomCode, state }` or `{ error }` | TV connects or reconnects. Without a code (or with an unknown one) it gets a new room. Keep the code in the URL (`/tv?room=CODE`) and send it again after a refresh |
| `bot:add` | none | `{ ok, playerId }` or `{ error }` | "Add bot" button in the lobby |
| `bot:remove` | `{ playerId }` | `{ ok }` or `{ error }` | Remove a bot (lobby only) |
| `game:start` | none | `{ ok }` or `{ error }` | Start button in the lobby (needs 2+ players) |
| `question:done` | `{ round }` | none | The question audio finished playing |
| `hearing:done` | `{ index }` | none | One hearing line finished playing |
| `phase:next` | none | none | Dev button: skip the rest of the current phase (in the lobby it starts the game with any number of players) |
| `game:reset` | none | none | Dev button / "Play again": back to the lobby, scores to 0, players stay |

If the TV never sends `question:done` or `hearing:done` (no audio, page closed), the server moves on by itself after a time based on the text length.

### Server → everyone

| Message | Payload | When |
|---|---|---|
| `game:state` | see below | After every change |
| `question:ask` | `{ round, text, journalist: { id, name, outlet }, audioUrl }` | Start of `question`. The TV plays `audioUrl` (may be `null`: show the text only) |
| `hearing:line` | `{ index, total, playerId, character: { id, name, title }, text, audioUrl }` | Each line in `hearing`. The TV plays `audioUrl` and shows `text` as a subtitle |

### Server → one phone

| Message | Payload | When |
|---|---|---|
| `you` | `{ player, answer, vote }`: your player (with character), your answer text this round, the id you voted for | After joining, after your own answer or vote, and at the start of each round |

### `game:state`

```js
{
  roomCode: 'KQZT',
  phase: 'lobby' | 'question' | 'answer' | 'hearing' | 'vote' | 'results' | 'final',
  remainingMs: 31000,        // time left in this phase, null if it has no timer. Start your countdown when the message arrives
  round: 1,                  // 0 in the lobby
  totalRounds: 3,
  players: [{
    id, name, color, connected, bot, score,
    character: { id, name, title },
    answered: true,          // this round (during answer)
    voted: false,            // this round (during vote)
  }],
  question: { text, journalist: { id, name, outlet } },   // null in the lobby
  hearing: { index: 0, total: 4, playerId },              // null outside hearing
  answers: [{ playerId, text }],                          // only in vote, results and final, otherwise []
  results: { votes: { [playerId]: 2 }, points: { [playerId]: 200 }, winners: [playerId] },  // results and final, otherwise null
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
