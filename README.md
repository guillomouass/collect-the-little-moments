# Collect the Little Moments 💙

A tiny romantic sky platformer. Play as **Mahmood**, collect five glowing hearts (each one
reveals a little message), cross the heart-bridge, and reach **Nuwara**. Then comes the flower,
the kiss, and a sweet little invitation.

No dependencies, no build step, no backend, no external images or sounds. Everything
(characters, world, music, sound effects) is drawn or synthesized in the browser.

## Run it

```bash
npm start
```

Then open http://localhost:5173. (Node 18+; there is nothing to install.)

You can also just **double-click `index.html`**. The game uses plain scripts, so it works
straight from the file. To share it, upload the folder as-is to any static host
(GitHub Pages, Netlify, Vercel…).

## Personalize it — `src/config.js`

Everything personal lives in **one file**:

| Setting | What it changes |
|---|---|
| `mainCharacterName` / `secondCharacterName` | The two monkeys (Mahmood / Nuwara) |
| `recipientName` / `creatorName` | Who the invitation is for / from |
| `dateActivity` | A date idea, e.g. `'a sunset walk and ice cream'` → *"How about a sunset walk and ice cream?"* Leave empty for *"How about we plan a cute date?"* |
| `finalInvitation` | Replaces the whole question (default: *"{recipient}, would you let {creator} take you on a date? 🐒💙"*) |
| `heartMessages` | The five heart titles and messages, in order |
| `ending.*` | Every line of the ending (approach line, answers, follow-ups, "play again"…) |
| `dedication` | Small line on the title screen (empty = hidden) |
| `ending.replyHint` | The "take a screenshot and send it…" line (empty = hidden) |
| `soundEnabled` | Sound on/off by default |

Placeholders usable in any text: `{main}` `{second}` `{recipient}` `{creator}` `{activity}`,
plus `{MAIN}` / `{SECOND}` in capitals. Empty values fall back to defaults; unknown
placeholders are removed, so nothing like `undefined` ever shows up.

## Controls

| Desktop | Mobile |
|---|---|
| ← → or A D: move | ◀ ▶ pad (you can slide between them) |
| Space / W / ↑: jump (hold for higher) | Jump button |
| Esc: pause · R: restart · M: sound | HUD buttons |

## Code map

| File | Responsibility |
|---|---|
| `src/config.js` | Personalization |
| `src/game.js` | Main loop (single `requestAnimationFrame`), state machine, rendering pipeline |
| `src/player.js` | Physics: gravity, one-way platforms, coyote time, jump buffer, bounce, knockback |
| `src/level.js` | Handcrafted level data + moving parts |
| `src/characters.js` | Mahmood & Nuwara (vector-drawn, pose-driven) + the flower |
| `src/ending.js` | Flower scene, kiss, invitation choreography |
| `src/world.js` | Sky, parallax clouds/islands, platforms, hearts, hazards, bridge |
| `src/camera.js` · `src/input.js` · `src/audio.js` · `src/particles.js` · `src/ui.js` | Camera, keyboard/touch, synthesized audio, particles, DOM overlays |

Game states: `menu → intro → playing ⇄ heartCollect → message`, `paused`, `respawning`,
`allHearts → … → finalReached → flowerOffer → flowerAccept → kiss → invitation →
responseYes | responseMore`, and *Play again* resets everything.
