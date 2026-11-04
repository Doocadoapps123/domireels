import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/Brand";

export const metadata = {
  title: "API for ordering platforms",
  description: "Connect an ordering platform's restaurants to Domi Reels: the REST API, and the kit and drop calls your platform answers.",
};

const BASE = process.env.DR_PUBLIC_URL || "https://domi-reels.vercel.app";

const Code = ({ children }) => <pre><code>{children.trim()}</code></pre>;

function Endpoint({ method, path, children }) {
  return (
    <div className="endpoint">
      <div className="row gap-12" style={{ flexWrap: "wrap" }}>
        <span className={`method m-${method.toLowerCase()}`}>{method}</span>
        <span className="ep-path">{path}</span>
      </div>
      {children}
    </div>
  );
}

const NAV = [
  ["Start", [["overview", "Overview"], ["connect", "Getting connected"], ["auth", "Authentication"]]],
  ["API v1", [["restaurants", "Restaurants"], ["reels", "Reels"], ["jobs", "Jobs"], ["errors", "Errors"], ["timing", "When Reels arrive"]]],
  ["Your side", [["contract", "The contract"], ["kit", "kit"], ["drop", "drop"], ["rules", "Rules"]]],
];

export default function Docs() {
  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="docs">
          <nav className="docs-nav" aria-label="Docs">
            {NAV.map(([h, items]) => (
              <div key={h} className="stack">
                <span className="docs-nav-h">{h}</span>
                {items.map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}
              </div>
            ))}
          </nav>
          <div className="docs-body">
            <h1 style={{ fontSize: "clamp(2.3rem, 7vw, 3.6rem)" }}>The Domi Reels API</h1>
            <p className="lede">
              Your restaurants already have their menus and food photos on your platform. Connect them to Domi Reels and Meta&apos;s
              Muse directs a Reel for each one, every week, that keeps their real food. Doocado is the first platform connected.
            </p>

            <h2 id="overview">Overview</h2>
            <p>There are two halves, and you need both:</p>
            <ul>
              <li><strong>You call us</strong> (API v1, below): tell Domi Reels which restaurants to make Reels for and when, ask for a Reel now, and read the Reels back.</li>
              <li><strong>We call you</strong> (<a className="link" href="#contract">the contract</a>): before a Reel, Domi Reels asks your <code>kit</code> url for the restaurant&apos;s menu and photos. When the Reel is ready, it hands it to your <code>drop</code> url, and you send it to the owner on your own channel.</li>
            </ul>
            <Code>{`
ordering platform                              Domi Reels
-----------------                              ----------
PUT  /api/v1/restaurants/8      ───────────▶   restaurant 8: Sundays at 8 PM, 1 Reel a week
                                               (or POST /api/v1/restaurants/8/reels for one now)
kit  ◀───────────────────────────────────────  "what's on the menu at 8?"
     ───────────────────────────────────────▶  menu + owner notes + the restaurant's photos
                                               Muse looks at every photo, pitches, plans,
                                               films takes, keeps the good seconds, cuts,
                                               scores, writes the text, gives it a last look
drop ◀───────────────────────────────────────  the Reel, its cover, the owner's message
GET  /api/v1/reels?restaurant=8 ───────────▶   the same Reels, any time, with download urls
`}</Code>

            <h2 id="connect">Getting connected</h2>
            <p>Domi Reels is by invitation only, for platforms too. When we connect you:</p>
            <ul>
              <li>We give you an <strong>API key</strong> once. We keep only its SHA-256 hash, so store it somewhere safe; a lost key is replaced, not recovered.</li>
              <li>You give us your <strong>kit url</strong>, your <strong>drop url</strong> and a <strong>token</strong>. We send that token on every call to you as <code>x-reels-token</code>, so you can keep only its hash too.</li>
            </ul>
            <p>Every request and response is JSON. The base url is <code>{BASE}</code>.</p>

            <h2 id="auth">Authentication</h2>
            <p>Send your key on every call:</p>
            <Code>{`
curl ${BASE}/api/v1/restaurants \\
  -H "Authorization: Bearer $DOMI_REELS_KEY"
`}</Code>
            <p>A missing or wrong key answers <code>401</code>. A key only ever sees its own platform&apos;s restaurants, jobs and Reels.</p>

            <h2 id="restaurants">Restaurants</h2>
            <p>A restaurant is known by <strong>your</strong> id for it, <code>external_id</code>: whatever your platform uses (letters, digits, <code>_ - . :</code>, up to 64). That same id is what we send back to your kit and drop.</p>

            <Endpoint method="PUT" path="/api/v1/restaurants/{external_id}">
              <p>Creates the restaurant, or updates the fields you send. <code>201</code> when it is new, <code>200</code> when it already existed. Send only what changed; a new restaurant needs at least a <code>name</code>.</p>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Field</th><th>Type</th><th>Default</th><th>Meaning</th></tr></thead>
                  <tbody>
                    <tr><td><code>name</code></td><td>string</td><td></td><td>The restaurant&apos;s name, as customers know it.</td></tr>
                    <tr><td><code>cuisine</code></td><td>string</td><td>null</td><td>&quot;Empanadas, sandwiches&quot;. Muse reads it.</td></tr>
                    <tr><td><code>city</code></td><td>string</td><td>null</td><td>Where it is.</td></tr>
                    <tr><td><code>language</code></td><td><code>en</code> | <code>es</code></td><td><code>en</code></td><td>The language of the Reel&apos;s words and the owner&apos;s message.</td></tr>
                    <tr><td><code>timezone</code></td><td>IANA name</td><td><code>America/New_York</code></td><td>Days and hours are counted here.</td></tr>
                    <tr><td><code>delivery_day</code></td><td>0 to 6</td><td>0</td><td>The day the week&apos;s Reels go out. 0 is Sunday.</td></tr>
                    <tr><td><code>delivery_hour</code></td><td>0 to 23</td><td>20</td><td>The hour they go out, in the restaurant&apos;s timezone.</td></tr>
                    <tr><td><code>reels_per_week</code></td><td>0 to 3</td><td>1</td><td>How many Reels a week. 0 pauses the weekly Reels; a Reel on demand still works.</td></tr>
                  </tbody>
                </table>
              </div>
              <Code>{`
curl -X PUT ${BASE}/api/v1/restaurants/8 \\
  -H "Authorization: Bearer $DOMI_REELS_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "name": "Pikalo", "cuisine": "Empanadas, Sandwiches", "city": "Jamaica Plain",
        "language": "en", "timezone": "America/New_York",
        "delivery_day": 0, "delivery_hour": 20, "reels_per_week": 1 }'
`}</Code>
              <Code>{`
{
  "restaurant": {
    "external_id": "8", "name": "Pikalo", "cuisine": "Empanadas, Sandwiches", "city": "Jamaica Plain",
    "language": "en", "timezone": "America/New_York", "delivery_day": 0, "delivery_hour": 20,
    "reels_per_week": 1, "active": true, "created_at": "2026-11-04T06:00:00.000Z"
  },
  "created": true
}
`}</Code>
            </Endpoint>

            <Endpoint method="GET" path="/api/v1/restaurants">
              <p>All your restaurants: <code>{`{ "restaurants": [ ... ] }`}</code>, each in the shape above.</p>
            </Endpoint>

            <Endpoint method="GET" path="/api/v1/restaurants/{external_id}">
              <p>One restaurant: <code>{`{ "restaurant": { ... } }`}</code>, or <code>404</code>.</p>
            </Endpoint>

            <h2 id="reels">Reels</h2>
            <Endpoint method="POST" path="/api/v1/restaurants/{external_id}/reels">
              <p>Asks Muse for a Reel now, outside the weekly schedule. No body needed. Answers <code>202</code> with the job to follow; the Reel is dropped to your <code>drop</code> url as soon as Muse approves it. One Reel in the making per restaurant (a second ask answers <code>409</code> with the job already running), at most 3 per restaurant and 20 per account in 24 hours (<code>429</code>).</p>
              <Code>{`
curl -X POST ${BASE}/api/v1/restaurants/8/reels -H "Authorization: Bearer $DOMI_REELS_KEY"
`}</Code>
              <Code>{`
{
  "job": {
    "id": "6f1c2a0e-8d1b-4c55-9a7e-3b9f0d2e4a11", "restaurant": "8", "kind": "reel", "status": "queued",
    "week": "2026-11-04", "questions": [], "error": null, "reel_id": null,
    "created_at": "2026-11-04T15:02:11.000Z", "updated_at": "2026-11-04T15:02:11.000Z"
  }
}
`}</Code>
            </Endpoint>

            <Endpoint method="GET" path="/api/v1/reels?restaurant={external_id}&limit=20">
              <p>Your Reels, newest first. Leave out <code>restaurant</code> to get every restaurant&apos;s. <code>limit</code> is 1 to 100 (default 20). Every url is signed and lasts one hour (<code>urls_expire_at</code>); ask again for fresh ones.</p>
              <Code>{`
{
  "reels": [
    {
      "id": "0b8e7c1d-...", "restaurant": "8", "job_id": "6f1c2a0e-...",
      "title": "The plancha that melts the big quesadilla", "idea": "...", "kind": "Cheese on the plancha",
      "dishes": ["Large Quesadilla"], "seconds": 11.2,
      "status": "delivered",
      "deliver_at": "2026-11-08T01:00:00.000Z", "delivered_at": "2026-11-08T01:00:12.000Z",
      "created_at": "2026-11-07T18:40:00.000Z",
      "cover": "https://...signed",
      "versions": [ { "index": 0, "register": "dembow", "url": "https://...full quality", "phone_url": "https://...smaller copy" } ],
      "chosen": 0,
      "gallery_url": null,
      "urls_expire_at": "2026-11-08T02:00:12.000Z"
    }
  ]
}
`}</Code>
              <ul>
                <li><code>status</code>: <code>ready</code> when the Reel is made but not dropped to you yet, <code>delivered</code> once it was.</li>
                <li><code>versions</code>: the same cut with different music. A platform&apos;s Reel has one; <code>url</code> is the full-quality file, <code>phone_url</code> a smaller copy for messaging apps.</li>
                <li><code>gallery_url</code>: the public &quot;how Muse directed it&quot; page, when the Reel is in the gallery. Otherwise null.</li>
              </ul>
            </Endpoint>

            <h2 id="jobs">Jobs</h2>
            <Endpoint method="GET" path="/api/v1/jobs/{id}">
              <p>Where a job is. When it is <code>done</code>, <code>reel_id</code> is the Reel it made.</p>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>status</th><th>Meaning</th></tr></thead>
                  <tbody>
                    <tr><td><code>queued</code></td><td>Waiting for Muse to start.</td></tr>
                    <tr><td><code>running</code></td><td>Muse is on it: looking at the photos, pitching, filming takes, cutting. This takes a while.</td></tr>
                    <tr><td><code>waiting_owner</code></td><td>Muse asked the owner something it could not see in the photos (<code>questions</code>). Platform Reels are made without questions, so you should rarely see it.</td></tr>
                    <tr><td><code>done</code></td><td>The Reel is made. See <code>reel_id</code>.</td></tr>
                    <tr><td><code>failed</code></td><td>No Reel this time; <code>error</code> says why. Most often: no dish with a usable photo in the kit.</td></tr>
                    <tr><td><code>cancelled</code></td><td>Stopped by Domi Reels.</td></tr>
                  </tbody>
                </table>
              </div>
            </Endpoint>

            <h2 id="errors">Errors</h2>
            <p>Every error is JSON, <code>{`{ "error": "what went wrong" }`}</code>, with its status:</p>
            <ul>
              <li><code>400</code> the request is not what the endpoint expects. <code>422</code> a field is out of range.</li>
              <li><code>401</code> no API key, or not a valid one.</li>
              <li><code>404</code> that restaurant, job or Reel is not yours, or does not exist.</li>
              <li><code>409</code> a conflict: two creates of the same restaurant at once (retry), or a Reel already being made for it.</li>
              <li><code>429</code> too many Reels in the last 24 hours. Every Reel costs real money, so the limit protects you from a loop in your code.</li>
              <li><code>500</code> our side. Retry in a moment.</li>
            </ul>

            <h2 id="timing">When Reels arrive</h2>
            <ul>
              <li>Weekly Reels are made the day before <code>delivery_day</code>, from 9 AM in the restaurant&apos;s timezone, so Muse has the whole day.</li>
              <li>A platform&apos;s Reel is dropped to you as soon as it is approved. When the owner sees it is up to you; <code>delivery_hour</code> is there so you can match it.</li>
              <li>A Reel asked for with <code>POST .../reels</code> is dropped the moment it is done.</li>
            </ul>

            <h2 id="contract">The contract: what your platform answers</h2>
            <p>
              Domi Reels does not need to know which ordering platform a restaurant uses. Any platform that answers these two calls
              gets Reels for its restaurants. Both are <code>POST</code> with JSON and the header <code>x-reels-token: &lt;your token&gt;</code>.
            </p>

            <h3 id="kit">kit: <code>domi-reels/kit@1</code></h3>
            <p>Before each Reel, Domi Reels asks for the restaurant&apos;s menu and photos.</p>
            <Code>{`
POST {your kit url}
x-reels-token: <your token>

{ "restaurant_id": 8 }
`}</Code>
            <Code>{`
{
  "contract": "domi-reels/kit@1",
  "platform": "doocado",
  "restaurant": { "id": 8, "name": "Pikalo - JP", "cuisine": "Empanadas, Sandwiches", "language": "en",
                  "city": "Jamaica Plain", "logo": "https://...", "brand_color": "" },
  "menu": [
    { "id": 676, "name": "Classico Dominicano", "description": "...", "price": 13.5,
      "photo": "https://...",
      "ai_note": "Dominican cheese is cheddar. The onion goes on the plancha, the tomato never does.",
      "addons": [{ "group": "Protein", "required": true, "options": ["Chicken", "Carnitas"] }] }
  ],
  "library": [
    { "id": 39, "photo": "https://...", "product_id": null, "dish": "Mangú Tripleta", "kind": "food" }
  ]
}
`}</Code>
            <ul>
              <li><code>restaurant_id</code> is your <code>external_id</code> for it (a number when it is all digits).</li>
              <li><code>menu</code>: what the restaurant sells, with its real photo when it has one (<code>&quot;&quot;</code> when not). <code>ai_note</code> is the owner&apos;s own note on the dish: Muse takes it as the owner&apos;s word, above what it sees in the photo. <code>addons</code> are the dish&apos;s option groups as the customer sees them (<code>[]</code> when none): Muse reads the sauce, the protein or the dip there before it asks anyone anything.</li>
              <li>Menu ids must be numbers.</li>
              <li>Photos keep coming: a menu photo with a new url is downloaded again, and every photo is rated by what is in it, so a new or better one takes over its dish on its own.</li>
              <li><code>library</code>: every photo the owner sent you: dishes, the griddle, the fryer, the dining room, the storefront. Muse logs each one. A dish with no menu photo takes the owner&apos;s library photo of it.</li>
              <li>Only active restaurants. Nothing in the kit is private to anyone but the restaurant.</li>
            </ul>

            <h3 id="drop">drop: <code>domi-reels/drop@1</code></h3>
            <p>Two steps, so the video never travels inside JSON.</p>
            <p><strong>1. open.</strong> You answer with an upload url for each file; Domi Reels <code>PUT</code>s the files there.</p>
            <Code>{`
POST {your drop url}
x-reels-token: <your token>

{ "action": "open", "restaurant_id": 8, "run": "8-0" }

=> { "upload": { "reel.mp4": "https://...", "cover.jpg": "https://..." } }
`}</Code>
            <p><strong>2. close.</strong> The Reel&apos;s words. You answer with its public links and the message for the owner, in the restaurant&apos;s language.</p>
            <Code>{`
POST {your drop url}
x-reels-token: <your token>

{ "action": "close", "restaurant_id": 8, "run": "8-0",
  "title": "...", "owner_summary": "...",
  "dishes": [676], "ai_label": true, "cost": 1.42 }

=> { "video": "https://...", "cover": "https://...", "owner_message": "..." }
`}</Code>
            <p>Then the owner gets it on your own channel (Doocado sends it on WhatsApp) and posts it.</p>

            <h3 id="rules">Rules on the way out</h3>
            <ul>
              <li>A drop is a draft. Nothing in it publishes anything: the owner posts it from their own account.</li>
              <li>Only a Reel Muse approved in its last look is dropped.</li>
              <li><code>ai_label</code> is always true: every Reel holds AI video, and the owner is told to turn on Instagram&apos;s AI label.</li>
              <li>People in a Reel are made up, and only ever appear as hands. A Reel never presents anyone as a customer, a regular or a review.</li>
            </ul>

            <div className="band mt-32">
              <div className="stack gap-8">
                <p className="display" style={{ fontSize: "1.6rem", lineHeight: 1.2 }}>Want your restaurants on Domi Reels?</p>
                <p className="muted small">We connect platforms one at a time. Ask the Domi Reels team for an API key.</p>
              </div>
              <div><Link href="/#gallery" className="btn btn-ghost">See the Reels</Link></div>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
