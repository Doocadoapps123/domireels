# The Domi Reels contract

Domi Reels is its own product. It does not need to know which ordering platform a restaurant uses: any platform that
answers these two calls gets Reels for its restaurants. Doocado is the first one connected.

```
ordering platform                      Domi Reels (Muse decides everything in between)
-----------------                      ----------------------------------------------
kit  ───────────────────────────────▶  menu + owner notes + the restaurant's own photos
                                        Muse logs the photos, makes the house cast, pitches,
                                        plans, draws, films, judges, cuts, scores, reviews
drop ◀───────────────────────────────  the Reel, its cover, the owner's message
the owner gets it on the platform's own channel (Doocado: WhatsApp) and posts it.
```

Both calls are `POST` with JSON and a header `x-reels-token: <token>`. The platform keeps only a hash of the token.

## kit: `domi-reels/kit@1`

Request: `{ "restaurant_id": 8 }`

```json
{
  "contract": "domi-reels/kit@1",
  "platform": "doocado",
  "restaurant": { "id": 8, "name": "Pikalo - JP", "cuisine": "Empanadas, Sandwiches", "language": "en",
                  "city": "Jamaica Plain", "logo": "https://...", "brand_color": "" },
  "menu": [
    { "id": 676, "name": "Classico Dominicano", "description": "...", "price": 13.5,
      "photo": "https://...", "ai_note": "Dominican cheese is cheddar. The onion goes on the plancha, the tomato never does.",
      "addons": [{ "group": "Protein", "required": true, "options": ["Chicken", "Carnitas"] }] }
  ],
  "library": [
    { "id": 39, "photo": "https://...", "product_id": null, "dish": "Mangú Tripleta", "kind": "food" }
  ]
}
```

- `menu`: what the restaurant sells, with its real photo when it has one (`""` when not). `ai_note` is the owner's own
  note on the dish. Muse takes it as the owner's word, above what it sees in the photo. `addons` are the dish's option
  groups as the customer sees them (`[]` when none): Muse reads the sauce, the protein or the dip there before it asks the
  owner anything.
- Photos keep coming: a menu photo with a new url is downloaded again, and every photo is rated by its content, so a new
  or better one takes over its dish on its own (`src/menu.mjs`).
- `library`: every photo the owner sent: dishes, the griddle, the fryer, the dining room, the storefront. Muse logs each
  one (`src/assets.mjs`). A dish with no menu photo takes the owner's library photo of it.
- Only active restaurants. Nothing in the kit is private to anyone but the restaurant.

## drop: `domi-reels/drop@1`

Two steps, so the video never travels inside JSON.

1. `{ "action": "open", "restaurant_id": 8, "run": "8-0" }` returns `{ "upload": { "reel.mp4": url, "cover.jpg": url } }`.
   Domi Reels `PUT`s each file to its url.
2. `{ "action": "close", "restaurant_id": 8, "run": "8-0", "title", "owner_summary", "dishes": [676],
   "ai_label": true, "cost": 1.42 }` returns the public `video` and `cover` links and `owner_message`: the text the
   platform sends the owner, in the restaurant's language.

Rules on the way out:

- A drop is a draft. Nothing in it publishes anything: the owner posts it from their own account.
- Only a Reel Muse approved in its last look is dropped.
- `ai_label` is always true: every Reel holds AI video, and the owner is told to turn on Instagram's AI label.
- The house cast (`src/cast.mjs`) are made-up people in the restaurant's t-shirt. A Reel never presents them as
  customers, regulars or reviews, and never puts them inside a drawn copy of the restaurant's real room.

## Doocado's side

`reels-kit` and `reels-drop` are two Supabase edge functions in Doocado. They read the menu (`"Menu Products"`, with
`ai_note`), the photo library and the logo, and store each drop under `posts/<restaurant>/reels/<run>/`.
