# Team plan for tonight

Concept: **Press Conference** (players are politicians, journalists ask the questions, every answer is read aloud on the TV in the player's character voice).

| | Role | Owns |
|---|---|---|
| **Eduard (A)** | Server | `server.js`: players, phases, timers, scoring, sockets, `/api/speak` |
| **Finn (B)** | Screens | `public/phone.*`, `public/tv.*`: phone controller and TV visuals |
| **Elijah (C)** | Audio and content | `content.js`, `public/audio/`, voices, sound effects, music, text-to-speech playback on the TV |

Each person works in their own files, so merges stay clean. Pull before you start, commit and push small working steps often.

## Working round loop (change it after the reveal)

One round is about 2 minutes, which is also the demo.

1. **Lobby.** Players scan the QR code and join. Each gets a politician character (name, look, voice).
2. **Question, ~10 s.** The anchor introduces a journalist, who asks a question in their own voice. Camera shutters.
3. **Answer, 45 s.** Everyone types an answer on their phone.
4. **Hearings, ~30 s.** The TV plays each answer in that player's politician voice, with subtitles and crowd reactions.
5. **Vote, 20 s.** Phones vote for the best answer (not your own).
6. **Results, ~10 s.** Scores, sting, applause. Next question or back to the lobby.

The message list is the contract between Eduard (server) and Finn (screens). It goes in [press-conference.md](press-conference.md), and Eduard owns it.

## Goals

### Eduard (A): server

1. **By 6:00, skeleton.** Players can join through the tunnel. Phases advance on timers (with a dev skip). Placeholder questions go out. Every message in the list is sent and received, even with fake data.
2. **By 6:50, full round.** The server collects answers and closes them when time is up (empty answers become a stock line). It starts text-to-speech for every answer **as soon as answering closes**, so the audio is ready by the time hearings start. Then it collects votes, scores and sends results. Refresh and reconnect put a player back mid-round.
3. **By 7:40, demo-proof.** Tested with 2, 3 and 6 players. Dev controls: skip phase, reset game. Text length and request caps are in place. If ElevenLabs fails, the round still finishes (subtitles only). The final message list is in the doc.

### Finn (B): screens

1. **By 6:00, every screen exists.** Phone: join, your character, answer box, vote list, a screen per phase. TV: QR code and lobby list, a screen per phase, the timer.
2. **By 6:50, the TV tells the story.** Question card with the journalist's name; hearings view that highlights who's speaking with big subtitles; vote counter; scoreboard. Readable from 3 metres.
3. **By 7:40, polish and real phones.** Theme colours and art, small animations (camera flashes, podium, spotlight). Checked on an iPhone and an Android phone: no zoom, the keyboard doesn't cover the answer box, clear "waiting for others" states.

### Elijah (C): audio and content

1. **By 6:00, voices and sounds exist.** Anchor, 3–6 politicians and 2–3 journalists created in the ElevenLabs web app, with their voice IDs in `content.js`. Sound effects in `public/audio/`: camera shutters, crowd murmur, boo, gasp, laugh, applause, sting, countdown, join chime.
2. **By 6:50, content and playback.** 15+ questions that fit the theme, character names and one-line bios, anchor lines (intro, transitions, winner). The TV plays a queue of text-to-speech lines one after another, with each line's subtitle.
3. **By 7:40, sound design.** Crowd reactions on the right moments, an intro loop in the lobby, a victory song at the results, balanced volumes. Audio tags tested on our voices (`[sighs]`, `[nervous laugh]`…). Questions pre-generated as MP3s so they play instantly.

## Scope

**The rule:** if it's not in your goals above, don't build it. New idea? Say it out loud, Eduard writes it in the parking lot below, and we only look at the parking lot after the 7:40 checkpoint.

### Not building tonight

- Accounts, logins, saved data, databases. Everything lives in server memory
- More than one room or game at a time, room codes, a host menu
- Settings screens (volume, language, timers). Hard-code good values
- Chat between players
- Custom avatars or photo uploads
- Several game modes. One mode, done well
- Frameworks or build tools (React, bundlers, TypeScript). Plain JavaScript, no build step
- Questions or reactions made up live during a round. Elijah writes the questions during the build, and the game picks from that list
- Voice input on phones. Players type, characters speak
- Supporting more than 6 players, landscape mode, desktop controls
- Fixing every edge case: if it only breaks when someone does something weird, note it and move on

### Parking lot

Ideas for after 7:40, if everything above works:

- 

## Checkpoints

At each one: stop for 5 minutes, everyone pulls, and play one round together on real phones.

| Time | Checkpoint |
|---|---|
| 5:20 | Building starts. Message list agreed |
| 6:00 | Skeleton: phones join, phases switch, placeholder data everywhere |
| 6:50 | One full round plays start to finish, ugly but complete |
| 7:40 | It's fun with 3 people, sounds and visuals in |
| 8:10 | **Feature freeze.** Playtest with another team, record the backup video |
| 8:30 | Stop |

## If we're behind, cut in this order

1. Animations and art (keep colours and big text)
2. Music (keep the sound effects)
3. Multiple questions per game (one round is enough for the demo)
4. Live text-to-speech for answers: fall back to subtitles plus a generic crowd sound

Never cut: joining by QR code, the answer → hearing → vote → results loop, and sound on the TV.
