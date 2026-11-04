# Press Conference

## Concept

Every round opens with a breaking-news headline about one player's politician, who takes the podium. The others are journalists: they each write a question about the headline on their phone, then vote for the best one (funniest, toughest, whatever they like). The TV reads the winning question in a journalist voice. Then one journalist secretly hacks the teleprompter: they write how the politician's answer starts, and the politician has to finish the sentence. The TV plays the whole answer in the politician's voice while the press reacts: six reactions each, which secretly move the politician's approval. Then the news anchor comes back with a short verdict, the approval number, and credit for the asker and the saboteur. Everyone takes the podium once, then the game is over.

Before the game, everyone builds their politician on their phone: they type any name, then pick a suit, a face item and hair. Each item has as many options as there are players, from 2 up to 4 (the art we have). Picks aren't exclusive. A preset from `content.js` is assigned behind the scenes for the voice.

Theme: decides who the politicians are, the headlines, and the look of the room. Elijah writes the characters, outlets, headlines and backup questions in `content.js`.

## Round loop

Each player takes the podium once (set `ROUNDS` in `.env` to play fewer, e.g. 1 for the demo).

| Phase | Length | What happens |
|---|---|---|
| `lobby` | until Start | Players scan the QR code, join and pick their politician. The TV can add bots |
| `breaking` | until the TV finishes the read (max 15 s) | The TV cuts to the news desk and the anchor reads the round's headline. Phones show it and tell the next player they're at the podium |
| `ask` | 40 s, or until every journalist has asked | The TV cuts back to the press room with the next player at the podium. Journalists type one question each about it. Blank ones get a backup question written for that headline |
| `pick` | 20 s, or until every journalist has voted | Journalists vote for the best question, not their own. Questions are anonymous. Skipped if there's only one question |
| `question` | until the TV finishes playing it (max 20 s) | The TV reads the winning question. Most votes wins; ties are settled at random |
| `sabotage` | 25 s, or until the saboteur writes | A random journalist (not the question's author, if there's a choice) secretly writes how the answer starts. If they don't, a stock opener from `content.js` is used |
| `answer` | 45 s, or until the politician answers | The politician sees the opener on their teleprompter and types the rest. The TV shows the opener too. If time runs out, a stock line finishes it |
| `hearing` | until the TV finishes playing it, then 6 s more | The TV plays opener + answer in the politician's voice, with the opener marked in the subtitle. Journalists react. No number is shown; the politician sweats while approval is below 35 |
| `news` | until the TV finishes the read (max 16 s) | The TV cuts to the news desk. The anchor reads the verdict, and the lower bar shows it with the approval number. Phones show the same number. Points are awarded when this phase starts. Then the next player takes the podium |
| `final` | until the host restarts | After the last round: ranked scores with each player's approval and press points. Ties share first place |

Scoring exists to reward funny answers.

- **Approval:** starts at 50 each round. Each journalist has 6 reactions per answer. `laugh`, `applause` and `cheer` add 50 / (journalists × 6); `boo`, `tomato` and `liar` remove half that. Approval is clamped to 0–100 and rounded at the end of the round. The number stays on the server until `news`; the TV only hears whether the politician is sweating.
- **Politician:** scores their final approval.
- **Journalists:** +10 for each Pick vote their question got, whether or not it was asked. The asker of the chosen question also scores half of (approval − 50), rounded, when approval ended above 50. The saboteur scores nothing for sabotage.

The anchor's verdict depends on approval: below 30 disaster, 30–44 poor, 45–55 shrug, 56–74 good, 75+ triumph, plus a separate line when nobody reacted. The asker is credited when approval ended above 50. The saboteur is named if they actually wrote the opener. Lines are in `anchor.lines` in `content.js`.

## Message list

Naming: `subject:action`. The server knows who sent a message from the socket, so phones never send their own id after joining.

**Rooms:** every TV page gets its own room with a 4-letter code, so several groups (or judges) can play at once. The TV shows a QR code for `/?room=CODE`; the phone reads `room` from its URL. Everything below happens inside one room.

**Bots:** the TV can add bots (`bot:add`) so one person can play alone. Bots live in the server: they ask, vote, answer and react by themselves. Each bot picks a mood every round, so a room of bots can produce a hit or a flop and show up in `players` with `bot: true`. Lines for them are in `content.js`.

**The main idea:** the server broadcasts `game:state` with everything public after every change. Screens just redraw from the latest `game:state`. A few extra messages carry things that happen once (play this audio) or are private (your own question and votes).

### Phone → server

| Message | Payload | Ack | When |
|---|---|---|---|
| `player:join` | `{ roomCode, playerId, name }` | `{ roomCode, you }` or `{ error }` | Tap to join, and after every reconnect. `roomCode` from the page URL |
| `player:name` | `{ name }` | `{ ok: true }` or `{ error }` | In the lobby. Changes the player's name. |
| `player:avatar` | any of `{ suit, face, hair }` (indexes into `avatarOptions`) | `{ ok: true }` or `{ error }` | In the lobby. Changes the player's look. |
| `question:submit` | `{ text }` (max 160 chars) | `{ ok: true }` or `{ error }` | Journalists, during `ask`. Sending again replaces the question |
| `vote:question` | `{ targetId }` (a question `id` from `game:state`) | `{ ok: true }` or `{ error }` | Journalists, during `pick`. Sending again changes the vote. Can't vote for your own |
| `answer:submit` | `{ text }` (max 200 chars) | `{ ok: true }` or `{ error }` | Politician, during `answer` |
| `opener:submit` | `{ text }` (max 90 chars) | `{ ok: true }` or `{ error }` | The saboteur, during `sabotage` |
| `crowd:react` | `{ type }`: `laugh`, `applause`, `cheer`, `boo`, `tomato` or `liar` | `{ ok: true }` or `{ error }` | Journalists, during `hearing`. At most one every 0.4 s and 6 per answer per player |
| `player:leave` | none | `{ ok: true }` | Exit button. In the lobby the player is removed; mid-game they count as disconnected |

### TV → server

All of these only work from a socket that sent `tv:join`.

| Message | Payload | Ack | When |
|---|---|---|---|
| `tv:join` | `{ roomCode, key }` (optional) | `{ roomCode, key, state, sweating }` or `{ error }` | TV connects or reconnects. Without the right code and key it gets a new room, so players who know the code can't take over. Keep both in the URL (`/tv?room=CODE&key=KEY`) and send them again after a refresh |
| `bot:add` | none | `{ ok, playerId }` or `{ error }` | "Add bot" button in the lobby |
| `bot:remove` | `{ playerId }` | `{ ok }` or `{ error }` | Remove a bot (lobby only) |
| `game:start` | none | `{ ok }` or `{ error }` | Start button in the lobby (needs 2+ players) |
| `headline:done` | `{ round }` | none | The headline audio finished playing |
| `question:done` | `{ round }` | none | The question audio finished playing |
| `hearing:done` | `{ round }` | none | The answer audio finished playing. Reactions stay open 6 s more |
| `news:done` | `{ round }` | none | The anchor finished the verdict |
| `phase:next` | none | none | Dev button: skip the rest of the current phase (in the lobby it starts the game with any number of players) |
| `game:reset` | none | none | "Exit to menu" (Esc), dev button, "Play again": back to the lobby, scores to 0, players stay |

If the TV never sends `headline:done`, `question:done`, `hearing:done` or `news:done` (no audio, page closed), the server moves on by itself after a time based on the text length.

### Server → everyone

| Message | Payload | When |
|---|---|---|
| `game:state` | see below | After every change |
| `headline:read` | `{ round, text, audioUrl }` | Start of `breaking`. The TV plays the anchor reading the headline (`audioUrl` may be `null`) |
| `question:ask` | `{ round, text, journalist: { playerId, name, outlet }, audioUrl }` | Start of `question`. The TV plays `audioUrl` (may be `null`: show the text only) |
| `hearing:line` | `{ round, playerId, character: { id, name, title }, text, opener, audioUrl }` | Start of `hearing`. The TV plays `audioUrl` and shows `text` as a subtitle; `text` starts with `opener` |
| `news:read` | `{ round, text, audioUrl }` | Start of `news`. The TV plays the anchor reading the verdict (`audioUrl` may be `null`) |
| `final:read` | `{ audioUrl }` | Start of `final`. The TV plays the anchor's last line (`audioUrl` may be `null`) |

### Server → TV only

| Message | Payload | When |
|---|---|---|
| `crowd:react` | `{ playerId, type }` | A journalist reacted. The TV shows it from their seat |
| `podium:sweat` | `true` or `false` | Approval crossed 35 during `hearing`. The only hint of approval before `news`. `tv:join` also returns `sweating` |

### Server → one phone

| Message | Payload | When |
|---|---|---|
| `you` | `{ player, role, question, saboteur, votes: { question }, reactionsLeft }`: your player, `'politician'` or `'journalist'` this round (`null` in the lobby), your question this round, whether you're writing the teleprompter right now, the question you voted for and how many reactions you have left | After joining, after your own politician, question, vote or reaction, and at the start of each phase where you act |

### `game:state`

```js
{
  roomCode: 'ABCD',
  phase: 'lobby' | 'breaking' | 'ask' | 'pick' | 'question' | 'sabotage' | 'answer' | 'hearing' | 'news' | 'final',
  remainingMs: 31000,        // time left in this phase, null if it has no timer. Start your countdown when the message arrives
  round: 1,                  // 0 in the lobby
  totalRounds: 4,
  players: [{
    id, name, color, connected, bot,
    score, approvalPoints, pressPoints, // score is the sum of the other two
    character: { id, name, title },   // name is their typed name, title is empty, id picks the voice
    avatar: { suit, face, hair },     // their picks, as indexes
    avatarUrl,                        // /avatars/{suit}-{face}-{hair}.webp
    outlet,                  // their outlet when they're a journalist
    asked: true,             // wrote a question this round
    voted: false,            // voted in pick
  }],
  avatarOptions: { suit, face, hair }, // only in the lobby: the labels to pick from, one per player (2 to 4)
  politicianId,              // who's at the podium, null in the lobby
  headline: '...',           // this round's headline, null in the lobby
  questions: [{ id, text }], // only in pick, otherwise []. id is the author's player id; screens don't show it
  chosen: { journalistId, question, opener, answer },   // from question on; opener from answer on; answer from hearing on
  results: { approval: 72, verdict: '...' }, // news: the round's number and the anchor's words
           // final: { finalLine: '...' }; otherwise null
}
```

### HTTP

| Route | What |
|---|---|
| `GET /?room=CODE` | Phone page |
| `GET /tv` | TV page (creates a room). `/tv?room=CODE&key=KEY` gets that room back |
| `GET /healthz` | `ok`, for the host's health check |
| `GET /debug.html` | Dev TV: raw state, event log, plays audio, Add bot / Start / Skip / Reset buttons |
| `GET /config` | `{ publicUrl }` |
| `GET /qr.svg?text=...` | QR code |
| `GET /speech/:id` | Streams a text-to-speech result |
| `/audio/*.mp3` | Elijah's sound effects and music in `public/audio/` |
