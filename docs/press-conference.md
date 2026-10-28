# Press Conference

> **TODO before the jam:** write the concept summary and the round loop. The sections below only hold what's already agreed elsewhere (the stack, the audio list and the decision rule in [PLAN.md](PLAN.md)). Fill in the gaps and finish the message list, in the same format as [one-vessel-one-traitor.md](one-vessel-one-traitor.md).

## Concept

TODO: one-paragraph summary.

Already agreed:

- We build this if the theme suits a **talking game**.
- Players **write text on their phones**, and a **character voice reads it aloud on the TV** (ElevenLabs text-to-speech, called from the server). No Voice Changer.
- Audio planned in [night-of-checklist.md](night-of-checklist.md): an anchor voice plus about 6 character voices, camera shutters, crowd murmur, boo, gasp, laugh, applause, sting, countdown, join chime, an intro loop and a victory song.

## Round loop

TODO.

## Message list

Same naming style as the starter: `subject:action`. The server adds `playerId` to anything it forwards from a phone.

These are needed whatever the final rules are:

| Message | From → To | Payload | When |
|---|---|---|---|
| `player:join` | phone → server | `{ playerId, name }`, ack `{ player, phase }` or `{ error }` | Tap to join, and after every reconnect |
| `tv:join` | TV → server | none, ack `{ players, phase, scores }` | TV connects or reconnects |
| `players` | server → everyone | `{ players: [{ id, name, color, connected }] }` | Any join, rejoin or disconnect |
| `phase` | server → everyone | `{ phase }` | Every phase change (phase names TODO) |
| `game:start` | TV → server | none | Host presses Start in the lobby |
| `player:text` | phone → server | `{ text }` (cap the length, e.g. 200 chars) | Player submits a line |
| `line:speak` | server → TV | `{ playerId, text, voiceId, audioUrl }` | Server has started text-to-speech for a line; the TV plays `audioUrl` |
| `line:done` | TV → server | `{ playerId }` | The TV finished playing a line, so the server can move on |
| `vote:cast` | phone → server | `{ targetId }`, ack `{ ok }` | Player votes |
| `vote:progress` | server → TV | `{ voted, total }` | After every vote |
| `phase:next` | TV → server | none | Host or dev button |

TODO: messages specific to this concept's rules.

Text-to-speech flow: the server calls `/v1/text-to-speech/{voice_id}/stream` with `eleven_v4_turbo` and streams it to the TV (see [tools/phone-test/tts.js](../tools/phone-test/tts.js) and [cheatsheet.md](cheatsheet.md)). Expect a short delay before playback; measure it with the phone test's voice test and design around it (e.g. the anchor's line or a camera-shutter sound covers the gap).
