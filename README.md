# video-game-hackathon

Our entry for the Chroma Awards 4-hour game jam (San Francisco, Oct 28, 2026), probably in the Party Games track: the game runs on a TV or laptop screen, 2–6 players join by scanning a QR code, and their phones are the controllers.

Stack: one Node.js process (Express + Socket.io) on port 3000, a Phaser 3 + Matter.js TV page, plain JavaScript with no build step, ElevenLabs text-to-speech called from the server, and a Cloudflare quick tunnel for HTTPS so phones can reach the laptop.

The game itself gets built during the jam. Right now the repo has the plan, the docs and a phone test tool.

## Quick start

```
npm install
cp .env.example .env        # then fill in the values (see below)
npm run phone-test
cloudflared tunnel --url http://localhost:3000
```

`.env`:

| Variable | What |
|---|---|
| `ELEVENLABS_API_KEY` | ElevenLabs API key. Shared privately in the team, never committed |
| `ELEVENLABS_TEST_VOICE_ID` | Any voice id from the ElevenLabs web app, for the voice test |
| `PORT` | Defaults to 3000 |
| `PUBLIC_URL` | The tunnel URL, if the TV page should show it in the QR code while opened on `localhost` |

## Phone test

A throwaway diagnostic to check real phones before we build anything on top of them.

1. Install `cloudflared` once: `winget install --id Cloudflare.cloudflared` (Windows) or `brew install cloudflared` (macOS). No account needed for quick tunnels.
2. `npm run phone-test`
3. In a second terminal: `cloudflared tunnel --url http://localhost:3000`. It prints a `https://<random>.trycloudflare.com` URL. The URL changes every time you restart the tunnel.
4. On the laptop, open `http://localhost:3000/results`. Click **Enable audio** if you'll run the voice test.
5. On each phone, open the tunnel URL. Tap the device name at the top to rename it (e.g. "Ana iPhone 13").
6. Tap through the tests. Every result shows on the phone and on `/results`, grouped by device. `/results.json` downloads everything.

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

- [docs/PLAN.md](docs/PLAN.md): timeline, rules, decision rule, roles, build schedule, demo
- [docs/press-conference.md](docs/press-conference.md): concept for a talking theme
- [docs/one-vessel-one-traitor.md](docs/one-vessel-one-traitor.md): concept for any other theme
- [docs/night-of-checklist.md](docs/night-of-checklist.md): arrival, audio to make, first 15 minutes after the reveal
- [docs/cheatsheet.md](docs/cheatsheet.md): Phaser + Matter, Socket.io, tilt, wake lock, ElevenLabs snippets
