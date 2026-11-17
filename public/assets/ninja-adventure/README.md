# Ninja Adventure asset pack (selected sheets)

Art by [Pixel-boy](https://pixel-boy.itch.io/) and [AAA](https://www.instagram.com/challenger.aaa/),
from the [Ninja Adventure Asset Pack](https://pixel-boy.itch.io/ninja-adventure-asset-pack) on itch.io.
Released under CC0 1.0 (see `LICENSE.txt`); attribution is not required but is given with thanks.

Only the files Four Wins uses are kept here, unmodified (some renamed after their folder in the pack):

- `Tileset*.png`: ground and nature sheets. `src/game/art/pack.ts` picks tiles and sprites by grid
  position (16 px tiles); the game falls back to its procedural art if they are missing.
- `animals/`, `emotes/`, `items/`, `fx/`: village animals, emote bubbles, the daily chest and pond
  ripples, loaded by `src/game/packSprites.ts`. A missing file only leaves that piece out.
