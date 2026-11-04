# Press Conference

**🏆 Party Games track winner, Chroma Awards 4H Game Jam** (San Francisco, Oct 28, 2026). Built in one evening by a team of three.

A party game about politics. The game runs on a TV or laptop screen, 2–6 players scan a QR code to join, and their phones become the controllers. One player takes the podium as the politician they built on their phone; everyone else is the press.

## How a round works

1. **Breaking news.** The TV cuts to the news desk, where the anchor reads a scandal about the next politician.
2. **The press asks.** Back in the press room, every journalist writes a question on their phone, then votes for the best one. The TV reads the winner aloud in a reporter's voice.
3. **Someone hacks the teleprompter.** One journalist secretly writes how the politician's answer starts ("As a proud lizard, I…").
4. **The politician answers.** They see the opener on their phone and have to finish the sentence, live.
5. **The hearing.** The TV plays the full answer in the politician's AI-generated voice while the press spends six reactions each: laughs, applause and cheers lift the politician's approval, boos, tomatoes and liar calls sink it. Nobody sees the number yet, but the politician starts sweating when it drops.
6. **News response.** The anchor comes back with a one-line verdict, the approval number, and credit for whoever asked the question or hacked the teleprompter. Everyone takes the podium once; most points wins.

The scoring rewards funny. The politician scores their final approval. Journalists score 10 for every vote their question gets, and the asker of the chosen question also scores half of whatever approval ended above 50.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/tv-lobby.jpg" alt="TV lobby with the QR code to join" /></td>
    <td width="50%"><img src="docs/screenshots/tv-results.jpg" alt="Final results on the TV" /></td>
  </tr>
  <tr>
    <td align="center">Scan to join</td>
    <td align="center">Final results</td>
  </tr>
</table>

<table>
  <tr>
    <td><img src="docs/screenshots/phone-create.jpg" alt="Phone: pick your politician" width="180" /></td>
    <td><img src="docs/screenshots/phone-answer.jpg" alt="Phone: the politician finishes the sabotaged answer" width="180" /></td>
  </tr>
  <tr>
    <td align="center">Pick your politician</td>
    <td align="center">Finish the teleprompter</td>
  </tr>
</table>

## Team

| | Built |
|---|---|
| [Eduard Dehelean](https://github.com/end13s) | Game server, phases and scoring, rooms, bots, the message list |
| [Finn Murray](https://github.com/finnmurray1) | Front end (TV game screen, phone controller, character creator, press-room scene) |
| Elijah Brough | Voices, sound effects, music, and game writing (headlines, questions, characters) |

## Stack

One Node.js process (Express + Socket.io) serves the TV page and the phone page. The TV and phone screens are plain HTML, CSS and JavaScript with pre-rendered low-poly art (made by `tools/avatar-render` and `tools/room-render`), no build step. Voices come from ElevenLabs text-to-speech, called only from the server.

## Run it

```
npm install
cp .env.example .env        # then fill in the values (see below)
npm start
```

Open `http://<your computer's local IP>:3000/tv` on the TV; phones on the same Wi-Fi scan the QR code or type the room code. Wi-Fi that blocks devices from each other needs a phone hotspot or a tunnel: `cloudflared tunnel --url http://localhost:3000`, then open `<tunnel URL>/tv`. Playing alone? Press **B** in the lobby to add bots. Add `ROUNDS=1` to `.env` for a one-round demo (default: everyone takes the podium once). Game content (characters, voices, headlines, questions) lives in `content.js`, the message list in [docs/press-conference.md](docs/press-conference.md).

TV shortcuts: **Enter** start, **B** add bot, **Esc** exit to menu. For testing, **N** skips a phase and **R** resets. They work on local addresses, or anywhere with `?dev` in the TV URL.

## Host it

The game needs one always-on Node process with WebSockets, so it runs on Render, Railway or Fly but not on serverless hosts like Vercel. Keep it to one instance: rooms live in memory, so a restart or redeploy ends the games in progress.

On Render, create a Blueprint from this repo. `render.yaml` sets everything up and asks for the voice settings. `/tv` on the site starts a game, and the home page lets players type a room code. On the free plan the site sleeps when idle, so the first visit can take about a minute.

The URL in the TV's address bar carries a private key that controls the game, so share the QR code or room code, not that URL.

`.env`:

| Variable | What |
|---|---|
| `ELEVENLABS_API_KEY` | ElevenLabs API key. Shared privately in the team, never committed. Without it the game still runs, without live voices |
| `ELEVENLABS_TEST_VOICE_ID` | Any voice id from the ElevenLabs web app, for the voice test |
| `PORT` | Defaults to 3000 |
| `PUBLIC_URL` | Only for a tunnel: its URL, if the TV page should show it in the QR code while opened on `localhost` |
| `TTS_DAILY_CHARS` | Stops voices past this many characters a day, so a public link can't run up the bill. Defaults to 50,000; a four-player game uses about 2,500 |
| `ROUNDS` | Number of rounds. Defaults to one per player |

Install `cloudflared` once: `winget install --id Cloudflare.cloudflared` (Windows) or `brew install cloudflared` (macOS). No account needed for quick tunnels; the URL changes every time you restart the tunnel.

## Phone test

A diagnostic we built before the jam to check real phones before building anything on top of them.

1. `npm run phone-test`
2. In a second terminal: `cloudflared tunnel --url http://localhost:3000`.
3. On the laptop, open `http://localhost:3000/results`. Click **Enable audio** if you'll run the voice test.
4. On each phone, open the tunnel URL. Tap the device name at the top to rename it (e.g. "Ana iPhone 13").
5. Tap through the tests. Every result shows on the phone and on `/results`, grouped by device. `/results.json` downloads everything.

What it checks:

| Test | Pass looks like |
|---|---|
| HTTPS | `secure: yes`. If it says no, you're not on the tunnel URL |
| Motion | iOS asks for permission, then tilt (beta/gamma) and shake numbers move |
| Wake lock | `active`, and it comes back after switching apps |
| Touch | One circle per finger, the page doesn't scroll or zoom |
| Vibration | `supported: yes` on Android. iPhone says no, that's expected |
| Latency | Average Socket.io round trip over 20 pings. Under ~100 ms is comfortable |
| Voice | Phone sends text, the server calls ElevenLabs, the laptop plays it. Shows the time from pressing Speak to playback. The tag buttons (`[sighs]`, `[nervous laugh]`…) check audio tags; compare `eleven_v4_turbo` with `eleven_flash_v2_5`, which reads tags out loud instead |

The voice test only appears when `ELEVENLABS_API_KEY` and `ELEVENLABS_TEST_VOICE_ID` are set. Text is capped at 300 characters per request because the tunnel URL is public.

## Docs

- [docs/press-conference.md](docs/press-conference.md): the game's rules, round loop, scoring and message list
- [docs/PLAN.md](docs/PLAN.md): jam timeline, rules, roles, build schedule, demo
- [docs/team-plan.md](docs/team-plan.md): goals per person, checkpoints, what to cut
- [docs/one-vessel-one-traitor.md](docs/one-vessel-one-traitor.md): the backup concept if the theme hadn't suited a talking game
- [docs/night-of-checklist.md](docs/night-of-checklist.md): arrival, audio to make, first 15 minutes after the reveal
- [docs/cheatsheet.md](docs/cheatsheet.md): Phaser + Matter, Socket.io, tilt, wake lock, ElevenLabs snippets
