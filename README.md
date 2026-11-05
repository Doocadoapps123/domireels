# Domi Reels

Small restaurants have the food but not the Reels. Domi Reels turns the photos a restaurant already has into
Instagram and Facebook Reels, and Meta's Muse makes every creative call: no person writes a script, picks a frame or
chooses a cut.

Built for the Meta Global AI Developer Hackathon (Oct 26 to Nov 4, 2026).

- Live: https://domireels.com (the gallery shows real pilot Reels and, for each one, how Muse directed it:
  the photos it started from, what it saw, every take it kept and threw away). Sign up is by invitation; the judges'
  code is in our submission notes.
- WhatsApp: +1 407-439-7335 (Domi Reels' own number on the WhatsApp Cloud API).

## What existed before, and what is new

- **Before the hackathon:** Domi (Doocado), the company's existing platform: online ordering and Instagram photo
  content for restaurants. None of it is in this repo, and the demo video does not show it as new work.
- **Built Oct 26 to Nov 4, 2026:** Domi Reels, all of this repository and everything shown in the demo video: the
  director pipeline, the web app at domireels.com, the WhatsApp channel, the platform API, and the gallery.

## Models and the Meta-only rule

Meta's models make every decision. Muse Spark invents each idea, writes every shot for the video model and the brief
for the music, watches every take, keeps or drops each second, edits, writes the on-screen text and reviews the final
Reel. Muse Image draws the frames, SAM 3.1 keeps the real dish in every frame, and Muse Voice Transcribe reads the
owner's voice notes. Meta's Model API has no video or music model, so two providers only render what Muse wrote:
video from Gemini Omni and music from ElevenLabs, both through fal. Upscaling uses Topaz on fal.

**Demo video narration (TTS):** the voice-over is text-to-speech from ElevenLabs. It is not part of the product.

## The product

- **Owners**: by invitation only. A restaurant signs up with a code, adds its website and the WhatsApp numbers of the
  people who send photos, and picks the day its Reels arrive. Then nobody touches anything: staff send food photos and
  voice notes to Domi Reels' WhatsApp number, Muse looks at every photo, asks only what the menu does not say ("is the
  cheese sliced or shredded?"), and the Reel arrives on WhatsApp on that day, in three versions with different music.
  The owner taps the one they like, or says "más movida" in a voice note, and Muse learns their taste.
- **Ordering platforms**: any platform connects its restaurants through the API and the kit/drop contract below.
  Doocado is the first. Its restaurants never get asked anything: Muse decides from the menu, the owner's notes and
  the photos, and the Reel lands back in the platform as a draft.
- **What Muse learns** from one owner improves every Reel, and never travels: a restaurant's own lessons stay with it,
  and a global lesson never names a restaurant or quotes anyone. The Muse that talks to an owner on WhatsApp only ever
  sees that one restaurant.

```
 web (Vercel, web/)            Supabase (private tables)          worker (Hetzner, src/server/)
 sign up with a code   ───▶    restaurants, members, dishes  ◀──  schedule: the day before delivery
 dashboard, API v1, gallery    photos, jobs, reels, lessons  ───▶ work: lab/friday.mjs + lab/auto.mjs per job
                                       ▲                          deliver: WhatsApp, or the platform's drop
 WhatsApp (src/chat/) ─────────────────┘
 photos, voice notes (Muse Voice Transcribe), Muse answers and acts for one restaurant
```

## How it fits

Domi Reels is a product on its own. An online ordering platform hands it a **kit** (the menu with its photos and the
owner's notes, plus the restaurant's own photos) and gets back a **drop** (the Reel, its cover and the
message for the owner). Doocado is the first platform connected. See [docs/CONTRACT.md](docs/CONTRACT.md).

```
kit ─▶ assets ─▶ inventory ─▶ week ─▶ pitch ─▶ card ─▶ plan ─▶ frames ─▶ takes ─▶ dailies ─▶ sharp ─▶ cut ─▶ music + text ─▶ review ─▶ drop
```

Muse directs from a handbook, not from a list of templates: [data/craft.md](data/craft.md) is what our camera can and
cannot really do and the Reels we made with the owner's own words about each. The ideas are Muse's: every week it
searches the web for what is working in food Reels and what the days ahead bring (rain, a big game, National Nachos
Day, Thanksgiving), looks at what each restaurant has, and invents its ideas in different styles (up close, the
making on real equipment, a documentary pass over the table, told in on-screen text, the restaurant's own place).
No two restaurants get the same style in a week, and Muse chooses which idea each one makes.

| stage | what Muse does | file |
|---|---|---|
| kit | the platform's menu, owner notes and photos, laid out as a folder | `src/kit.mjs` |
| assets | logs the restaurant's own photos: its griddle, fryer, room, storefront | `src/assets.mjs` |
| cast | designs and draws 3-4 recurring people in the restaurant's t-shirt; off camera since Nov 1 (in motion they read as AI, and holding the dish meant redrawing it), so people appear only as hands | `src/cast.mjs` |
| inventory | looks at every good dish photo and writes what it can really do: how people really eat it (a sandwich by hand, never a fork), the layers it peels into, what a hand can do to it, whether it can start wrapped, where it is cooked | `src/inventory.mjs` |
| trends | searches the web (Muse with web search) for the food Reel formats working this week and the dates ahead in the restaurants' cities, with sources | `src/trends.mjs` |
| ideas | invents 6 ideas per restaurant across the styles its photos can make; a blind Muse judge scores each only against ideas of its own style; Muse picks the week's one, and no two restaurants share a style | `src/ideas.mjs`, `src/menu.mjs`, `lab/friday.mjs` |
| card | reads the hero dish like a line cook; asks the owner what it cannot see | `src/dish.mjs` |
| plan | the shots, the layers of the real photo, the stock, the music, every word the models get | `src/director.mjs` |
| frames | Muse Image takes the real photo apart; SAM measures every frame; Muse checks each against the real dish | `src/frames.mjs` |
| takes, dailies | cheap 360p takes; Muse watches each one like an editor watching dailies and marks which seconds go in the Reel and which to avoid, and rewrites the shot only when its key action never plays clean | `src/auto.mjs`, `src/director.mjs` |
| sharp | the approved clips, upscaled without invented detail | `src/video.mjs` |
| cut, music, text, review | Muse cuts the good seconds to the idea's rhythm, writes the music for its register, places the on-screen text a creator would type, and gives the finished Reel a last look that checks again every problem it named before; what it drops never comes back | `src/auto.mjs`, `src/edit.mjs`, `src/overlay.mjs` |
| drop | the cover and the Reel back to the platform as a draft | `src/drop.mjs` |

Domi prepares, the owner publishes. Nothing here posts to anyone's account.

## Models

- **Muse Spark** (`muse-spark-1.3`, api.meta.ai): every decision, every judgment, every word, and the weekly web
  research (its `web_search` tool).
- **Muse Image** (`muse-image-1.0`): every drawn frame and the house cast.
- **SAM 3.1** (`sam-3.1`, api.meta.ai): finds the dish, its container and its parts, so no food floats off the plate.
- **Muse Voice Transcribe** (`muse-voice-transcribe-1.0`, realtime stream): the owner's voice notes on WhatsApp
  (`src/transcribe.mjs`).
- Video comes from Gemini Omni on fal (Meta has no video model in the API yet), music from ElevenLabs on fal,
  upscaling from Topaz on fal. Equipment footage from Mixkit's free license, chosen by Muse.

## Run it

Keys go in `../.env` (`META_API_KEY`, `FAL_KEY`, and the platform's kit and drop urls and token), never in the repo.

```
node --env-file=../.env lab/prep.mjs 8             # kit, assets, cast and pitch for restaurant 8
node --env-file=../.env lab/auto.mjs kits/doocado-8 0       # plan and frames for pitch 0, no paid video
node --env-file=../.env lab/auto.mjs kits/doocado-8 0 3     # the Reel, with a $3 spend cap
node --env-file=../.env lab/drop.mjs lab/out/auto/doocado-8-0 kits/doocado-8   # back to the owner
```
