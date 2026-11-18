# LED wall behind the main stage

The wall behind the speakers. The two projector screens either side
carry the speakers' slides and the remarks decks, so the wall never shows
slides. It carries the brand, the sponsors and who is on stage.

## Canvas

**3696 × 1176**, as given by the AV vendor. The cabinet size is assumed: both
sides divide by 168, so 22 × 7 cabinets of 168 × 168 px (the grid under `g`).
It lives in `content/2026-stage.json` → `wall`, and every layout in
`stage/stage.css` and `stage/stage.js` is positioned against it.

To confirm with the vendor:

- Pitch and cabinet size, and whether the processor takes 3696×1176
  directly or a larger signal (3840×2160, say) with the wall mapped into the
  top-left corner
- Our laptop on HDMI/DP, or files to their operator (and which codec)
- Mounting height: whether the bottom cabinet row is hidden by the
  lectern or monitors (`g` in the player shows that band)
- Whether the stage is filmed. The wall runs at 50 fps for European
  cameras, and should run well below full brightness

## Rules

1. **The speaker comes first.** Someone stands in front of the middle third
   (1232–2464). While they talk, content sits in the left and right thirds
   and the centre carries only a very faint hexagon drift.
2. **No straight lines.** Zones fade into each other through the hexagon
   field, and every scene change is a hexagon wave.
3. **Navy ground.** Full sand or white on LED is blinding and washes out the
   speaker on camera. Red is for accents only, because it blooms.
4. **Slow motion.** The only movement behind a talk is cells breathing over
   14–26 s and a few faint hexagons crossing over several minutes.
5. **Brand rules still hold.** Nine colours, the logo artwork as drawn,
   portraits in the brand shape, the deck's display type.

## Scenes

| Scene | When | On the wall |
|---|---|---|
| `walkin` | Doors open | Lockup left, welcome and dates right, hex field centre. Loops with `sponsors` and `team`, 30 s each, and `social` from the 08:30 pre-show |
| `team` | In the walk-in loops | "Your organizers." left, the ten organizers as two rows of portraits |
| `countdown` | Before a block | Outline countdown clock left, the next talks right. Each minute: 40 s clock, 10 s sponsors, 10 s `social`; the last minute stays on the clock |
| `talk`, walk-on | Speaker walking up | Portrait, talk title, name, job title, large across the middle |
| `talk`, live | Speaker talking | Portrait, with name and job title under it, glides to the left third, talk title to the right third; the field clears from the centre outward |
| `break` | Coffee, lunch, between sessions | "Back at …" left; right, what's next in this room, large, and what starts in the other rooms at the same time. Loops with `feedback`, `sponsors` and `photos`, 30 s each |
| `feedback` | In the break loops | "How was it?" for the talk this room just had, with its Sessionize feedback QR. Left out of the loop until that talk has a link |
| `photos` | In the break loops and the breakout walk-in | The photographers' Picdrop gallery, with its QR |
| `social` | In the pre-show and countdown loops | "Post about your experience." left, the hashtags and the prize draw right (`social` in the stage file) |
| `pitch` | Gold sponsor pitches, day two | The sponsor's logo on a white hexagon and a two-minute clock that starts when the cue comes up |
| `sponsors` | Breaks | Tiered honeycomb of white hexagons |
| `community` | Walk-in and break loops, after `sponsors` | "Thank you, community.": the Community sponsors as a honeycomb of five across, and Partners & media (CNCF, HackYourFuture) beside them. Its own scene, so the paid tiers keep their size |
| `message` | Remarks, end of day | Eyebrow and headline left, one line right |
| `lyrics` | After the day-one afterparty | Sing-along: "The November Beat" starts from the top and loops; the title left, the line being sung large across the rest of the wall, the next one dimmed under it. In the intro and instrumental gaps the coming line waits, dimmed. Lines and their times (seconds into the track) are the cue's `lines`. It follows the track in the window that plays it; other windows count from when the cue came up. `?lyricsAt=52` freezes it at 0:52 for stills |
| panic still (`b`) | Anything goes wrong | Lockup small at the left, nothing in the centre; safe mid-talk |

## Running the show

The laptop feeding the wall runs a small show server. It holds the current
cue, and every page follows it:

```bash
node stage/serve.mjs main       # main stage laptop: opens its control panel and screen
node stage/serve.mjs breakout   # breakout laptop: the same for the breakout
node stage/serve.mjs            # just prints both rooms' links
```

Each laptop runs its own server and opens its own room's pair. With `main`
or `breakout` the two windows open in a Chrome of their own (profile
`~/.cnd-stage-chrome`) started with `--autoplay-policy=no-user-gesture-required`,
so the music starts without anyone clicking on the screen. Opened any other
way, Chrome keeps the screen silent until someone presses a key in it, so
press `f` there.

- **Screen:** `http://localhost:4040/stage/index.html?output` (add
  `&room=breakout` for the breakout). Drag it onto the LED output or the
  projector and press `f`.
- **Control:** `http://localhost:4040/stage/control.html?key=…` (add
  `&room=breakout`). It shows a live preview, Now and Next (with a still of the
  next cue), large Next and Back buttons, panic still, music, guides, the
  countdown controls and the run of show. Tap a cue twice to jump to it.
  Switching day also takes two taps.

A presentation clicker works on either page (→, space, PageDown). If the
wall window crashes or reloads, it comes back on the current cue, because the
state lives in the server and not in the page.

**The key.** Changing the state needs the key in the control URL. The venue
Wi-Fi is shared with every attendee, and nobody should be able to drive the
wall from the audience. Set `STAGE_KEY` to keep it the same across restarts.
Even with the key, put the control machine on a cable or a private network if
the venue allows it. `--local` restricts the server to the wall laptop.

**Countdown.** A countdown cue counts to its own `at` time on the wall
laptop's clock. When the schedule slips, use **Start 5:00**, **Start 10:00**
or **±1 min** on the control page. **Clear** goes back to the scheduled time.

Other commands:

```bash
node stage/build.mjs          # content → stage/show.data.js (serve does this)
node stage/render.mjs         # a still of every cue → graphics/out/stage/
node stage/export-video.mjs   # an MP4 of day one with its music (below)
open stage/index.html         # rehearsal from file://, no server, keys only
```

A cue's `ticker` (a list of tiers) brings back the sponsor row along the
bottom. No cue uses it now, because the sponsor wall is in every loop.

**Breakout room.** The breakout projector (1920×1080) runs the same server
with its own state and its own operator. Add `&room=breakout` to both URLs;
the server prints them. The two rooms never move each other, and the
breakout's run of show is `days.<day>.breakout` in the stage file. Its
layouts are the wall's scenes rearranged for 16:9, with the field kept to the
edges.

## The schedule

The run of show follows the final schedule in Sessionize, the same feed the
website reads. The show runs from a snapshot, so the wall never depends on
the venue Wi-Fi:

```bash
node stage/sync-schedule.mjs  # Sessionize → content/2026-schedule.json
```

Re-run it when the programme changes and review the diff. It also downloads
the Sessionize photo of any speaker without a portrait in `assets/speakers/`.

The build matches sessions to the announcement and stage entries by title,
so hand-picked portraits and crops stay. A stage entry whose wall title
differs from Sessionize names the Sessionize one in `schedule`. Anything on
the schedule without an entry gets one from Sessionize, keyed `sz-<id>`, and
missing job titles come from the speakers' Sessionize taglines. The break
scenes read the whole programme for "next here" and "next in the breakout".

The cues themselves (`days` in the stage file) are edited by hand: when the
schedule moves, move the cue's `at` or `until` with it. `node stage/build.mjs`
holds you to that. It stops when a day's talk cues are not the main-stage
schedule in order, when a break cue's `until` is not the schedule's break end,
or when the countdown's `at` is not the first talk. It warns when a cue's
`$note` time is stale, when a cued talk has no walk-on words or clip, and
when `announce` has words for a talk no cue plays. A cancelled talk comes out
of the cues, `announce`, `roles` and the announcements file together.
A hosts' walk-on that is not a Sessionize session (the afternoon "Welcome
back" on both days) carries `"offSchedule": true` on its cue: it plays like any
other walk-on, and the order check leaves it out.

The break decks on the projectors (`decks/breaks/`) come from the same
programme: `node decks/build-breaks.mjs` after any schedule change.

**QR codes.** `qr` in the stage file holds the links: `photos` for the Picdrop
gallery, and `feedback.sessions` keyed by the talk's Sessionize title, with
`feedback.rooms` as the fallback for a whole room. The feedback links
(szfb.me) are not in Sessionize's public API; copy them from the Sessionize
dashboard's feedback page.

## Music

All generated with ElevenLabs Music, instrumental, loudness-matched:

| Set | When | Files |
|---|---|---|
| calm | 08:00 breakfast, breaks, sponsor wall | `walkin.wav` (2:46), then lo-fi Rhodes, Scandinavian acoustic and downtempo marimba (`calm-1…3`, 3:00 each); quieter (−18 LUFS) |
| preshow | the last 30 minutes before the show, the countdown, and day one's sponsor crawl and afterparty | "The November Beat" (3:00) first, then funky house, nu-disco, melodic house (4:30 each), disco house, indie electronic and nu-funk (`preshow-5…7`, 4:00 each); crossfading, and the list starts over at the end (−15.5 LUFS) |
| november | the sing-along after the afterparty | "The November Beat" on its own, from the top, looping |
| walk-on | every talk's walk-on | eight 20 s themes (`walkon-1…8`: piano, guitar and marimba, bells, electric piano, strings, brass, Nordic electronic, glockenspiel), taken in turn so neighbouring talks differ (−16 LUFS) |
| voice of god | every main-stage walk-on | "Please welcome to the stage… from Saxo Bank… Johan Thomsen!" over the walk-on theme, one clip per talk, the hosts' included. Switchable from the control page |

A cue picks its set by scene (`music.scenes` in `content/2026-stage.json`), or
by its own `"music"`. Moving between cues on the same set keeps the track
going. On a walk-on the bed fades out in under a second and the sting plays,
and the talk goes live by itself after `walkonSeconds` (20). Next goes live
sooner. The control page's Next button counts the 20 seconds down. Nothing
plays during a talk.

**Voice of god.** Every main-stage walk-on, speakers and hosts, carries a
voice-over: `assets/audio/announce/<talk slug>.mp3`, generated with
ElevenLabs (voice Brian), 4–11 s each. The words are in
`content/2026-stage.json` → `announce`, with names spelled for the voice
("Hoy-gore" for Højgaard, "Er-yeling" for Öjeling). Listen to them all before
the show, and regenerate any name that comes out wrong. The build picks up
any talk with a clip. The clip starts 1.2 s into the theme, the theme drops to
30% under it and comes back after it (`music.announce`). Next, going live or
panic stops it.

**Voice of god** on the control page has a mode per room. The main stage has
All sessions (the default), Hosts only (just the hosts' welcomes, wrap-ups
and remarks, for when the hosts introduce every speaker themselves) and Off.
The breakout has Off (its default) and All sessions. `v` steps through them.
A mode that leaves out the announcement in progress fades the voice and
brings the theme back up. It is independent of Music: with the music off and
the voice on, the voice plays on its own.

Only the wall window (`?output`) makes sound. The preview and the control page
never do, so a second window can't keep playing after the wall has moved on.
Add `?audio` to rehearse with sound in a single preview window.

**Open the wall with the Chrome command the server prints.** Its
`--autoplay-policy` flag lets the wall play without anyone touching it.
Opened any other way (the control page's link, `open`), Chrome holds all sound
until someone clicks the wall window or presses `f` there. The music then
starts on its own; `stageMusic()` shows `blocked: true` until then.

The beds start muted: Music on the control page (or `m`) turns everything on.
`stageMusic()` in the wall window's console shows what is playing, and
`stageMusic.skipToEnd(10)` jumps to 10 s before the end of the track, so you
can hear a handover without waiting. When the last track of a set ends, the
list starts over. The server supports HTTP range requests, which Chrome needs
to seek in and stream the long tracks.

Verified in Chrome: the switch from calm to preshow, the sting on walk-on, and
silence once live. **Not yet heard by a person**, and the track-to-track
crossfade inside the preshow set only happens 4:26 in, so let it run once in
rehearsal.

## Video export

`node stage/export-video.mjs` writes `graphics/out/stage/wall-day1.mp4`,
3696×1176 H.264 with AAC audio. It contains 5 minutes of the pre-show loop, the
first 2 minutes of the countdown, then every talk of the morning block:
4 s clear, the 20 s walk-on, 8 s live. `--preshow`, `--countdown` and `--talks`
change the lengths; `--fps 50` matches the wall.

It renders frame by frame, not as a screen recording. The page runs on a fake
clock that advances one frame at a time, and every animation is pinned to that
clock before the frame is captured, so the video is smooth on any machine. It
takes about 1.5× the video's length. The music is mixed from the same cue times
with the wall's own files and fades.

## Not done yet

- A ProRes master, if the vendor plays files rather than taking our laptop.
  The H.264 export above and the stills cover review and fallback.
- Stingers for the non-keynote main-stage talks. The `talk` scene already
  takes any session slug.
- A rehearsal on the real wall, with a person standing in front and the camera
  running.
- Drawing the QR codes. The `photos` and `feedback` scenes have their place
  for one, but the build doesn't encode the links yet.
- The Sessionize feedback links for `qr.feedback`.
- The new tracks, heard by a person.
