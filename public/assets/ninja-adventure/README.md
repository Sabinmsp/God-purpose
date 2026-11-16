# Ninja Adventure asset pack (selected sheets)

Art by [Pixel-boy](https://pixel-boy.itch.io/) and [AAA](https://www.instagram.com/challenger.aaa/),
from the [Ninja Adventure Asset Pack](https://pixel-boy.itch.io/ninja-adventure-asset-pack) on itch.io.
Released under CC0 1.0 (see `LICENSE.txt`); attribution is not required but is given with thanks.

Only the sheets Four Wins uses are kept here, unmodified. `src/game/art/pack.ts` loads them and
picks tiles and sprites by grid position (16 px tiles); anything not taken from the pack stays
procedural, and the game falls back to the procedural art if these files are missing.
