# Room render

Source for the low-poly press room and cast in `public/room`. The game only uses the finished images; three.js is not a game dependency.

1. `mkdir out && node serve.js`, then open these on port 3122 and wait for DONE:
   - `room-game.html?n=160&scale=1.5&layer=room&out=game-room.png`
   - `room-game.html?n=50&scale=1.5&layer=lectern&out=game-lectern.png`
   - `room-game.html?n=50&scale=1.5&layer=chair&out=game-chair.png`
   - `game-figures.html?n=32`
   - `mic.html?n=32`, then crop `out/game-mic.png` to its visible area and save it as `public/room/mic.png`
2. `python3 game-assemble.py ../../public/room`

The news desk for the Breaking news cut scene is in `public/anchor`. Open `anchor.html` with `layer=studio`, `layer=body` and `layer=head` (`n=72`, `n=48`, `n=48`) and save `out/anchor-studio.png` as `studio.jpg`, and the other two as `anchor-body.webp` and `anchor-head.webp`. Add `layer=all` to see the whole shot in one image. All three share a camera, so they stack exactly. DONE prints where the neck lands in the frame, which is the `transform-origin` of `#anchor-head` in `tv.css`.
