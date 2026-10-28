# One Vessel, One Traitor

## Concept

3–6 players tilt their phones to steer **one shared vessel** on the TV. The game averages everyone's tilt, so the vessel goes where the group leans.

Every phone shows the shared goal, except one secret **saboteur**, whose phone shows a different goal. Rounds last 60 seconds, then everyone votes on who the saboteur was.

The theme decides what the vessel is (boat, balloon, shopping cart, spaceship, a giant cake on a tray…) and what the obstacles are.

**Scoring** (numbers to tune in playtest):

- Crew: points for progress toward the shared goal, plus points for a correct accusation.
- Saboteur: points for sabotage (progress toward their own goal), plus points for escaping the vote.

## Round loop

1. **Lobby.** Players scan the QR code and join (3–6).
2. **Briefing, ~10 s.** The server picks a saboteur in secret. Every phone shows its goal. Players hold the phone the way they want and press Ready to zero their tilt.
3. **Steer, 60 s.** Phones send tilt. The server averages it and the TV moves the vessel through the obstacles. The TV shows the timer and progress.
4. **Round end.** The TV shows how far the vessel got and what went wrong.
5. **Vote, ~20 s.** Each phone lists the other players; everyone picks one. The TV shows how many have voted, not who.
6. **Reveal, ~10 s.** The TV reveals the saboteur, whether the vote caught them, and the scores.
7. Next round with a new saboteur, or back to the lobby.

For the demo: one round is about 2 minutes including joining.

## Message list

Same naming style as the starter: `subject:action`. The server adds `playerId` to anything it forwards from a phone. Times are durations in ms; each screen runs its own countdown when the message arrives.

| Message | From → To | Payload | When |
|---|---|---|---|
| `player:join` | phone → server | `{ playerId, name }`, ack `{ player, phase }` or `{ error }` | Tap to join, and after every reconnect |
| `tv:join` | TV → server | none, ack `{ players, phase, scores }` | TV connects or reconnects |
| `players` | server → everyone | `{ players: [{ id, name, color, connected }] }` | Any join, rejoin or disconnect |
| `phase` | server → everyone | `{ phase }`: `lobby`, `briefing`, `steer`, `vote`, `reveal` | Every phase change |
| `game:start` | TV → server | none | Host presses Start in the lobby (needs 3+ players) |
| `role:assign` | server → **each phone privately** | `{ role: 'crew' \| 'saboteur', goal: { id, text } }` | Start of briefing |
| `round:start` | server → everyone | `{ round, durationMs, crewGoal: { id, text } }` | Start of steer phase. TV shows the crew goal only |
| `player:input` | phone → server, **volatile** | `{ tx, ty }`, each -1..1 | Every 50 ms during steer |
| `steer:update` | server → TV, **volatile** | `{ x, y, inputs: n }`, the average of all tilts | Every 50 ms during steer |
| `vessel:progress` | TV → server | `{ progress, sabotage }`, each 0..1: toward the crew goal and toward the saboteur goal | Twice a second during steer, and once at the end |
| `vessel:hit` | TV → server | `{ obstacle }` | When the vessel hits something (sound cue, may count as sabotage) |
| `round:end` | server → everyone | `{ progress, sabotage, reason: 'time' \| 'goal' \| 'wrecked' }` | Timer runs out or the vessel reaches a goal |
| `vote:start` | server → phones | `{ candidates: [{ id, name, color }], durationMs }` | Start of vote phase. Each phone's list leaves out the player |
| `vote:cast` | phone → server | `{ targetId }`, ack `{ ok }` | Player taps a name. Can change their vote until time is up |
| `vote:progress` | server → TV | `{ voted, total }` | After every vote |
| `round:reveal` | server → everyone | `{ saboteurId, accusedId, caught, points: { [playerId]: n }, scores: { [playerId]: n } }` | Vote time is up or everyone has voted |
| `phase:next` | TV → server | none | Host or dev button: next round / back to lobby |

Who runs the physics: the TV runs Matter.js and is the source of truth for the vessel. The server only averages input, keeps time, counts votes and scores. That keeps the server small and avoids syncing physics.

## Open design questions

**How do we keep the saboteur hidden when every tilt is averaged?** With 5 players, one player is only 20% of the steering, which can make sabotage too weak, and if the TV shows each player's input the saboteur is caught instantly. Options, not decided:

1. **Only the average is visible.** The TV shows one steering arrow and nothing per player. The saboteur's goal is chosen so small, steady pushes matter (e.g. "brush past three rocks" rather than "crash"). The crew finds them by watching the vessel and by talking. Simplest to build; the vote may feel like a guess.
2. **Rotating helm.** Every ~8 seconds one random player gets double (or triple) weight for a few seconds. The TV shows that *someone* has the helm but not who; only that player's phone buzzes. Gives the saboteur moments of real control and gives the crew suspicious moments to remember.
3. **Black-box replays.** Inputs stay hidden during the round, but at round end the TV replays 2–3 short clips of individual players' steering arrows, chosen at random and labeled with their color. Clues, not proof, and it feeds the vote discussion.

Decide in the first 15 minutes after the reveal if we pick this concept.
