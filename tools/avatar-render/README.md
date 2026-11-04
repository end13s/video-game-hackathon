# Avatar render

Source for the character picker images in `public/avatars`, one per suit, face item and hair combination (`{suit}-{face}-{hair}.webp`). The game only uses the finished images; three.js is not a game dependency.

1. `mkdir out && npm install --no-save three && node serve.js`, then open `http://localhost:3120/pick.html` and wait for DONE. It writes `out/pick-{suit}-{face}-{hair}.png`.
2. Convert each PNG to WebP at quality 80 and save it in `public/avatars`.

The TV's full figures in `public/avatars/figures` come from `figures.html?n=20` the same way: `out/fig-front-{suit}-{face}-{hair}.png` and `out/fig-back-{suit}-{hair}[-raise].png`, saved as WebP without the `fig-` prefix.

More options per item need new entries in `pick-render.js`, new images, and matching entries in `AVATAR_OPTIONS` and `AVATAR_LOOKS` in `server.js`, plus a higher `MAX_AVATAR_OPTIONS`.
