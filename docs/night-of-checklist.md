# Night-of checklist

## Before leaving

- [ ] Laptops charged, chargers, a power strip, an HDMI adapter (USB-C → HDMI)
- [ ] `npm install` done on the demo laptop, `.env` filled in (key shared privately, never in chat logs or git)
- [ ] `cloudflared` installed on the demo laptop and on one backup laptop
- [ ] Phones charged, at least one iPhone and one Android
- [ ] Headphones for whoever does audio

## On arrival (4:30–5:00)

- [ ] Ask the organizers: is a generic starter allowed? Submission format and deadline? When and where is judging? Write the answers in [PLAN.md](PLAN.md).
- [ ] Start the server and the tunnel on the demo laptop:
  ```
  npm run phone-test
  cloudflared tunnel --url http://localhost:3000
  ```
- [ ] Every phone on the venue Wi-Fi: open the tunnel URL, run all tests, check `/results`. If the Wi-Fi blocks it or latency is bad, try a phone hotspot for the laptop.
- [ ] Note the latency and voice timing numbers here: ______
- [ ] Find out which screen we'll demo on (TV, projector, our laptop?), how it connects, and whether it has sound. Test the TV page and audio on it if we can.
- [ ] Log in to the ElevenLabs web app on C's laptop.

## Audio to make in the ElevenLabs web app (after the reveal)

Owner: C. Download everything as MP3 into `public/audio/`, short lowercase names (`boo.mp3`, `sting.mp3`).

**Voices** (pick from the Voice Library or design new ones to fit the theme; write each voice id down for the server):

- [ ] Anchor / host
- [ ] Character 1 ______
- [ ] Character 2 ______
- [ ] Character 3 ______
- [ ] Character 4 ______
- [ ] Character 5 ______
- [ ] Character 6 ______

**Sound effects:**

- [ ] Camera shutters (a burst)
- [ ] Crowd murmur (loop)
- [ ] Boo
- [ ] Gasp
- [ ] Laugh
- [ ] Applause
- [ ] Sting (dramatic hit for reveals)
- [ ] Countdown (3-2-1 or ticking)
- [ ] Join chime

**Music:**

- [ ] Intro loop (lobby)
- [ ] Victory song

Make the effects and music first (they don't depend on the game rules), voices once the characters are known.

## First 15 minutes after the reveal (5:00–5:15)

| Time | Who | What |
|---|---|---|
| 5:00 | all | Read the theme out loud. Everyone writes 3 ideas for how it fits each concept, silently, 2 minutes |
| 5:02 | all | Apply the decision rule from [PLAN.md](PLAN.md): talking game → Press Conference, otherwise One Vessel, One Traitor |
| 5:05 | all | **Concept locked.** Name the game. Decide the theme's vessel/obstacles or characters |
| 5:05 | A + B | Walk through the concept doc's message list, line by line. Rename, add, cut. A writes the final list in the doc |
| 5:05 | C | Write the prompts for the sound effects, music and voices, fitted to the theme (generate them from 5:20) |
| 5:10 | all | Settle any open design question in the concept doc (pick one option, move on) |
| 5:12 | all | Each person says what they'll have running by 6:00 |
| 5:15 | all | Pull the repo, check the server and tunnel still run, open the ElevenLabs web app. No code or assets yet |
| 5:20 | all | Building starts. A: server file and `start` script. B: phone and TV pages. C: generate audio, content file |

## At 8:10

- [ ] Feature freeze. Commit.
- [ ] Playtest with another team. Watch where they get confused, fix only text and obvious bugs.
- [ ] Record a backup video of a full round (screen recording of the TV plus a phone filmed in hand).
- [ ] Restart the server before the demo for a clean player list. Check the QR code points at the current tunnel URL.
