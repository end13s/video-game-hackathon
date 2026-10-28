# Jam plan

Chroma Awards game jam, San Francisco. **Wednesday, Oct 28, 2026.** Track: probably Party Games (2–6 players, TV screen, phones as controllers).

## Timeline

| Time | What |
|---|---|
| 4:30 PM | Doors open. Set up (see [night-of-checklist.md](night-of-checklist.md)) |
| 5:00 | Theme reveal |
| 5:20 | Building starts |
| 8:30 | Building ends |

## Rules as we understand them

- The game is built during the jam and has to fit the theme, which is secret until 5:00.
- Before the jam we can prepare tools, docs, tests and know-how, but **no game code**.
- The generic starter (`_starter/`, local only, not in git) is only used if the organizers say boilerplate is allowed. Ask at check-in.
- Anything unclear (submission format, judging time, asset rules, use of generated audio): ask the organizers at check-in, write the answers here.

## Decision rule (5:00–5:05)

Decide within **5 minutes** of the reveal:

- Theme suits a talking game (speeches, interviews, lies, scandal, fame, news, debate…) → **Press Conference** ([press-conference.md](press-conference.md))
- Anything else → **One Vessel, One Traitor** ([one-vessel-one-traitor.md](one-vessel-one-traitor.md)). The theme picks the vessel and the obstacles.

## Stack

- One Node.js process: Express + Socket.io on port 3000. Serves the TV page, the phone page and static files.
- Phones connect through `cloudflared tunnel --url http://localhost:3000` (HTTPS, which phones need for motion and wake lock).
- TV: Phaser 3 with Matter.js, plain browser JavaScript, no build step. Libraries served from `node_modules`.
- ElevenLabs only from the server. The key stays in `.env` and never reaches a browser.
- Spoken lines are text-to-speech: players type, a character voice reads it. No Voice Changer.

## Roles

| | Owns | Typical files |
|---|---|---|
| **A, server** | Phases, timers, scoring, sockets, the message list | `server.js` |
| **B, screens** | Phone controller and TV visuals (Phaser) | `public/phone.*`, `public/tv.*` |
| **C, audio and content** | Voices and sound effects in the ElevenLabs web app, all game text (prompts, goals, names), text-to-speech playback on the TV | `public/audio/`, `content.js`, `/api/speak` |

The message list (in the concept doc) is the contract between A and B. Change it out loud, then update the doc.

## Build timeline

| Time | Goal | Done when |
|---|---|---|
| 5:00–5:20 | Theme reveal, pick the concept, finish the message list | Everyone agrees on the messages and their payloads |
| 5:20–6:00 | Skeleton running with placeholder data | Phones join through the tunnel, phases switch on the TV and phones |
| 6:00–6:50 | Full loop in its simplest form | One round plays start to finish, ugly but complete |
| 6:50–7:40 | Main mechanic, plus sound and visual polish | It's fun with 3 people |
| 7:40–8:10 | Finishing touches | Title screen, clear instructions on phones, no dead ends |
| 8:10–8:30 | **Feature freeze.** Playtest with another team, record a backup video | Video saved on two laptops |

Rules for the build:

- Commit working states often (we commit, not the tools).
- If something takes more than 20 minutes longer than planned, cut it.
- Keep the server running on one laptop (the demo laptop) from 6:00 on.

## Demo

- One teammate performs: introduces the game and runs the TV.
- The judges scan the QR code and play **one round, about 2 minutes**.
- Have the backup video ready in case the Wi-Fi or tunnel fails.
- Before the demo: restart the server (clean player list), check the tunnel URL in the QR code, check the volume on the demo screen.
