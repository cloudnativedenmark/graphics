# Cloud Native Denmark 2026 — social media plan

**Event.** Cloud Native Denmark 2026, edition Nº 04. 19–20 November 2026, Scandic Copenhagen, Vester Søgade 6, 1601 Copenhagen V. Capacity 500.

**Positioning line (from the site, reuse it verbatim).** Two days in Copenhagen with the platform engineers, SREs, and architects shipping the Nordics' most demanding cloud native systems to production.

**Program.** 32 sessions across three rooms (main stage, breakout, workshop). 35 speakers. 4 hands-on workshops. 6 keynotes.

> Counted from the Sessionize exports of 20 August 2026. Re-check before the first post if the schedule moves.

**Charity.** All 2026 profits go to Hack Your Future Denmark. Cumulative donations across the last three years exceed 840,000 DKK. The 2026 goal is to pass 1,000,000 DKK.

**Links used throughout.**

- Tickets: https://cloudnativedenmark.ticketbutler.io/en/e/cloud-native-denmark-26/
- Schedule: https://cloudnativedenmark.dk/schedule
- Site: https://cloudnativedenmark.dk
- Partner: https://www.hackyourfuture.dk/

---

## 1. How to use this document

Each week has a theme, a fixed set of slots, and ready-to-post copy. The copy is written for the Cloud Native Denmark LinkedIn page. Swap the first person for "we" if you repost from a personal account.

Every post names the graphic it goes with. Filenames refer to `graphics/out/announcements/` in the `cloudnativedenmark/graphics` repo. Cards that do not exist yet are marked **NEEDS RENDER** with the headline copy to render, so you can add them to `content/2026-announcements.json` and run `node graphics/build-announcements.mjs`.

Three cadence rules:

1. **Two to four posts a week until 30 days out, then daily.** The page has one job in the last month: convert people who already know the event exists.
2. **One link per post, in the post body, not the comments.** LinkedIn no longer punishes body links enough to justify the friction.
3. **Tag every speaker and every sponsor by their LinkedIn handle.** This is the single biggest reach lever the page has, and it costs nothing.

---

## 2. Voice and look

The card system already sets the tone. Match it in the copy.

- **Sentence case, ending in a full stop.** The lockup says `DENMARK.` and every card headline echoes it. Do the same in the post's opening line.
- **Short lines. One idea per line.** The first two lines are all most people read before "see more". Put the hook there and the date at the bottom.
- **No emoji in headlines.** One at most in the body, and only where it carries information (⭐ for the charity goal, → for a link). Never a row of them.
- **No hype adjectives.** No "excited to announce", no "game-changing", no "unmissable". State the fact and let the program be the pitch.
- **Name the specific thing.** "230 production databases lost during maintenance" beats "lessons learned with Crossplane". Every talk in this program has one concrete detail. Find it in the abstract and lead with it.
- **Three to five hashtags, at the end.** `#CloudNativeDenmark #CND2026` on every post, then two or three that match the topic: `#Kubernetes #PlatformEngineering #OpenTelemetry #Observability #DigitalSovereignty #CloudNative`.
- **Danish or English.** English by default, since a third of the speakers are international. Danish is fine for the Hack Your Future post and the local logistics posts.

**Graphic rules that must not drift** (they are enforced in the repo, and print depends on them): `sand` is the social ground and `bone` is the deck ground; social copy is Space Grotesk Medium; the logo lockup is never re-typeset; sponsor logos sit contained on a white hexagon. If you make something in Canva, import the HTML the repo generates, never the PDF.

---

## 3. Asset inventory

### Ready to post (26 cards, in `CND26 Social Templates/`)

> **The exported folder is one card behind.** `countdown-90.png` was re-rendered on 20 August with the sold-out copy. The version in `CND26 Social Templates/` is still the old "Blind bird pricing, 1.499 DKK" card. Re-export from `graphics/out/announcements/` before you post it, and do the same after every fix in the list below.

| Asset | Use |
|---|---|
| `countdown-90.png` | 90-day countdown. **Re-export needed** — the copy in the templates folder is stale. |
| `countdown-60.png` … `countdown-01.png` | 6 countdown cards: 60, 30, 14, 7, 3, 1 |
| `d1-agent-no-idea.png` | Joseph Sandoval keynote |
| `d1-whose-code.png` | Adriana Villela & Josh Lee keynote |
| `d1-goblins-druids.png` | Michael Coté keynote |
| `d2-developers-nightmare.png` | Thomas Vitale & Alexandra Hou Aldershaab keynote |
| `d2-map-keeps-changing.png` | Paula Kennedy keynote |
| `d2-dbaas-trap.png` | Gabriele Bartolini keynote |
| `sponsor-scannet.png` | Platinum |
| `sponsor-aws.png`, `sponsor-exoscale.png`, `sponsor-netic.png`, `sponsor-suse.png` | Gold |
| `sponsor-chainguard.png`, `sponsor-dash0.png`, `sponsor-edb.png`, `sponsor-everpure.png`, `sponsor-systematic.png`, `sponsor-tigera.png` | Bronze |
| `tier-gold.png`, `tier-bronze.png` | Tier honeycombs |

### Rendered 20 August (30 new squares, in `graphics/out/announcements/`)

| Asset | Use |
|---|---|
| `talk-*.png` (22) | One card per non-keynote session, speaker portrait in the big hexagon |
| `ws-cloudnativepg.png`, `ws-otel-playbook.png`, `ws-crossplane.png`, `ws-regenerative.png` | The four workshops, with a `Workshop · day one` / `day two` eyebrow |
| `partner-hyf-profits.png` | "Every profit goes here." Sand. The main charity card. |
| `partner-hyf-million.png` | "840.000 DKK donated." Navy, big-figure treatment. |
| `partner-hyf-volunteers.png` | "34 weeks. Taught entirely by volunteers." Sand. |
| `partner-hyf-stage.png` | "On the main stage, right after the welcome." Red. |

All four carry the Hack Your Future mark on a white hexagon, contained the way a sponsor logo is. Variation comes from the ground — sand, navy, sand, red — since the logo needs the `hexfield` big hexagon and the four-hexagon cluster has no slot for it. All four are also pages in `cnd-announcements.html` for Canva.

All 30 are defined in `content/2026-announcements.json` — the 26 sessions under a new `sessions` array, the four Hack Your Future cards under `general` — so they rebuild with `node graphics/build-announcements.mjs`. Grounds run 10 sand, 11 navy, 5 red so the feed never shows two identical backgrounds in a row.

### Still to render

| What | Count | Note |
|---|---|---|
| `preview-day-one.png`, `preview-day-two.png` | 2 | Week 13. Type-only, no portrait. |
| "Send this to your manager" card | 1 | Week 9. |
| "Standard closes tonight" card | 1 | Week 14, red ground. |
| Platinum tier honeycomb | 1 | `tier-gold.png` and `tier-bronze.png` exist; there is no `tier-platinum`. With one Platinum sponsor the single `sponsor-scannet.png` card covers it. |
| Speaker video end-card | 1 | A 5-second outro frame for the promo videos: logo, dates, venue, ticket URL. |
| 4:5 versions of everything new | 30 | Only squares were rendered. `node graphics/build-announcements.mjs` with no `--surface` flag produces both. |

### Two source-asset problems

**The Hack Your Future mark is on all four charity cards, and their artwork is defective.** Their mark sits on the white hexagon, contained, the way a sponsor logo does. Look at it before you post any of them: the middle line reads "YO UR" with a hole in it.

That is not our export. Every source has the same defect:

- the SVG you gave me is byte-identical to the one served from their own site, `cdn.prod.website-files.com/.../66f16bd253854657d909fae6_logo-round.svg`
- widening the viewBox proves the letters are absent rather than clipped
- their 567px PNG is cropped on top of it, losing letters at both edges
- their own 256px favicon has the same hole

The Sketch path ids run Fill-13, 15, 16, 17, 19, 21, 22, 25, 26, with 14, 18, 20, 23 and 24 dropped, which is consistent with an export that lost shapes.

**Ask them for a clean SVG or EPS.** When it arrives, drop it at `assets/partners/hyf-mark.png` (or point the `logo` field at the new file) and re-run the builder — nothing else changes. Until then all four cards show the hole, so if you would rather not ship their mark in that state, say so and I will put the type-only versions back — the copy and layout are unchanged either way. The broken original is kept at `assets/partners/hyf-logo-BROKEN.svg` with a note, so nobody reaches for it by accident.

**Three speaker photos are too wide or too busy for the hexagon crop.** Seva Kaloshin is a mountain landscape with him small in frame; Karsten Nielsen is a distant beach profile; Jacob Avlund is shot against a LEGO booth banner whose text competes with the headline. The cards are usable, but a tighter headshot from each would make three of the weakest cards into three good ones. Same for the Hack Your Future classroom photo: at 1500×500 and very dark, the hexagon crop lands on the back of someone's head.

### Fixes

**Done in the repo, not yet in the export.** `countdown-90.png` said "Blind bird pricing, 1.499 DKK". Blind Bird is sold out, so the card now reads `BLIND BIRD · SOLD OUT` over "All 100 blind bird seats are gone. Standard, 1.999 DKK, until 17 November." Re-rendered square and 4:5, `content/2026-announcements.json` updated, `test/run.sh` passing. The sell-out is a better post than the price ever was.

**One step left:** copy the new `countdown-90.png` and `countdown-90-post.png` out of `graphics/out/announcements/` into `CND26 Social Templates/`, replacing the stale files. Nothing posts from the repo — it posts from that folder, so a fix that stops at the render is not a fix.

**Still open.**

1. **`countdown-30.png` and the `schedule-live` card say "four tracks".** The schedule has three rooms: main stage, breakout, workshop. Change the copy to "two days, three rooms, 32 sessions" or drop the number.
2. **The 60-day mark falls on Sunday 20 September.** Re-render that card as `59` and post it Monday 21 September.
3. **`countdown-07.png` and `countdown-01.png` say "doors at 08:30". The schedule says registration and breakfast from 08:00.** Fix the cards, not the schedule.
4. **The "convince your manager" letter on the site calls this "the third annual Cloud Native Denmark conference".** The rest of the site says edition Nº 04. Pick one before anyone forwards that letter to a budget holder.
5. **The ticket page still lists Blind Bird.** Struck through and marked sold out is good social proof, so leave it visible — just make sure Standard is the one with the button on it.

---

## 4. The calendar at a glance

| Week | Dates | Days out | Theme | Posts |
|---|---|---|---|---|
| 1 | Aug 20–21 | 91–90 | Program is live | 2 |
| 2 | Aug 24–28 | 87 | Keynotes, part one, and the charity partner | 4 |
| 3 | Aug 31–Sep 4 | 80 | Keynotes, part two | 3 |
| 4 | Sep 7–11 | 73 | Observability and OpenTelemetry | 4 |
| 5 | Sep 14–18 | 66 | Platform engineering | 4 |
| 6 | Sep 21–25 | 59 | Sponsors and the 60-day mark | 4 |
| 7 | Sep 28–Oct 2 | 52 | AI and agents | 4 |
| 8 | Oct 5–9 | 45 | Digital sovereignty | 4 |
| 9 | Oct 12–16 | 38 | Security, policy and data | 4 |
| 10 | Oct 19–23 | 31 | Workshops and the 30-day mark | 5 |
| 11 | Oct 26–30 | 24 | Infrastructure and open source | 5 |
| 12 | Nov 2–6 | 17 | Hack Your Future, 14-day mark, logistics | 5 |
| 13 | Nov 9–13 | 10 | Speaker videos, 7-day mark, last call | 6 |
| 14 | Nov 16–20 | 3–0 | Countdown and live coverage | 8 |

Total: roughly 61 page posts over 14 weeks. Fridays are the meme slot from week 4 onward.

---

## 5. Week by week

### Week 1 — Aug 20–21 · Program is live

**Thu 20 Aug · Schedule reveal**
Asset: `schedule-live.png` (already defined in `content/2026-announcements.json`, re-render with the track count fixed)

> The schedule is live.
>
> 32 sessions. 35 speakers. Four hands-on workshops. Two days at Scandic Copenhagen.
>
> Six keynotes on agentic infrastructure, compliance, data sovereignty and what AI is doing to our craft. Two parallel session tracks. A workshop room running all day, both days.
>
> Every profit from this year's edition goes to Hack Your Future Denmark.
>
> Full program → cloudnativedenmark.dk/schedule
>
> 19–20 November, Copenhagen.
>
> #CloudNativeDenmark #CND2026 #Kubernetes #PlatformEngineering #CloudNative

**Fri 21 Aug · 90 days**
Asset: `countdown-90.png` — **re-export from `graphics/out/announcements/`.** The card in the templates folder still shows the old Blind Bird price.

> 90 days. And Blind Bird is gone.
>
> All 100 seats, sold before the schedule was even a week old. Standard is 1.999 DKK including VAT and holds until 17 November. After that it is Late Bird at 4.999.
>
> Every krone of profit goes to Hack Your Future Denmark. Over the last three editions we have donated more than 840,000 DKK to charity. This year we want to pass a million.
>
> Tickets → cloudnativedenmark.ticketbutler.io/en/e/cloud-native-denmark-26/
>
> #CloudNativeDenmark #CND2026 #Kubernetes #Copenhagen

---

### Week 2 — Aug 24–28 · Keynotes, part one

**Mon 24 Aug**
Asset: `d1-agent-no-idea.png`

> Your agent has no idea where it's running.
>
> We spent a decade learning how to run infrastructure well: identity, isolation, scheduling, policy, cost control, safe operations. Then we made the infrastructure invisible, and started shipping a whole new class of workload on top of it.
>
> Joseph Sandoval opens day one with what the cloud native community owes the agentic systems now moving into production — and what happens when they inherit none of the operational lessons.
>
> Day one, 09:25, main stage.
>
> Schedule → cloudnativedenmark.dk/schedule
>
> #CloudNativeDenmark #CND2026 #PlatformEngineering #CloudNative

**Tue 25 Aug · Charity partner announcement**
Asset: `partner-hyf-profits.png` (short version of the copy in section 9)

**Wed 26 Aug**
Asset: `d1-whose-code.png`

> Whose code is it anyways?
>
> AI let contributors move faster than maintainers can review. Senior maintainers are drowning in shoddy PRs. Junior developers are not growing, because the pressure is on seniors to do everything themselves.
>
> Adriana Villela and Josh Lee on guardrails for AI-assisted pull requests, and on bidirectional empathy in open source when the volume goes up and the quality does not.
>
> Day one, 16:00, main stage.
>
> #CloudNativeDenmark #CND2026 #OpenSource #CloudNative

**Fri 28 Aug**
Asset: `d1-goblins-druids.png`

> What goblins and druids can teach us about enterprise AI.
>
> Michael Coté tried to run a D&D game with an LLM. Week one was magic. Then it got boring, repetitive, and could not remember anything that happened more than an hour ago.
>
> Fixing that turned into the same question everyone at work keeps asking. Where does a capability live? A prompt you paste in? A skill the model loads when it feels like it? An MCP server anyone can call? And who owns it when it breaks?
>
> Day one, 16:25, main stage.
>
> #CloudNativeDenmark #CND2026 #AI #PlatformEngineering

---

### Week 3 — Aug 31–Sep 4 · Keynotes, part two

**Mon 31 Aug**
Asset: `d2-developers-nightmare.png`

> The developer's nightmare.
>
> "Not so fast." Are you using an unapproved license? Any CVE in those new dependencies? Can you prove the artifact in production has not been tampered with?
>
> Several checklists, some paperwork and three meetings later, you ship. Thomas Vitale and Alexandra Hou Aldershaab open day two with how to break the compliance barrier without giving up developer joy.
>
> Day two, 09:10, main stage.
>
> #CloudNativeDenmark #CND2026 #SupplyChainSecurity #DevEx

**Wed 2 Sep**
Asset: `d2-map-keeps-changing.png`

> How do you explore when the map keeps changing?
>
> AI is moving faster than governance and legal can follow. Geopolitics is redrawing where data may sit and who may touch it. Sustainability has gone from an ESG line item to an engineering constraint.
>
> And platform engineers are being asked to make foundational calls that commit the whole organisation. Paula Kennedy does not offer a map. She shares how she is handling the questions anyway.
>
> Day two, 15:50, main stage.
>
> #CloudNativeDenmark #CND2026 #PlatformEngineering #DigitalSovereignty

**Fri 4 Sep**
Asset: `d2-dbaas-trap.png`

> Beyond the DBaaS trap.
>
> Managed databases are the single biggest source of lock-in most organisations have. That gravity is exactly what makes a move to a sovereign cloud so hard.
>
> Gabriele Bartolini, co-founder and maintainer of CloudNativePG, closes the conference with how to run PostgreSQL on Kubernetes in a way that satisfies the EU Data Act without pretending sovereignty is free.
>
> Day two, 16:15, main stage.
>
> #CloudNativeDenmark #CND2026 #PostgreSQL #DigitalSovereignty

---

### Week 4 — Sep 7–11 · Observability and OpenTelemetry

**Mon 7 Sep**
Asset: `talk-lazy-developer.png`

> We keep telling developers to instrument their own code. When they do, it feels like a favour to the SRE team.
>
> Adriana Villela and Diana Todea make the selfish case instead: desktop tooling to see your own traces, the minimum instrumentation that pays for itself, and how to debug your own service faster with OpenTelemetry than without it.
>
> Day one, 10:25, breakout.
>
> #CloudNativeDenmark #CND2026 #OpenTelemetry #Observability

**Tue 8 Sep**
Asset: `talk-manual-otel.png`

> Mature observability teams still run auto-instrumentation, then spend their weeks chasing cost anomalies.
>
> Juliano Costa's argument: the problem is not how much you collect, it is what you collect. He compares the same trace produced automatically and by hand, and shows what disappears from the bill when you control your spans and attributes.
>
> Day two, 14:00, breakout.
>
> #CloudNativeDenmark #CND2026 #OpenTelemetry #Observability

**Thu 10 Sep**
Asset: `talk-data-swamp.png`

> More logs, more metrics, more traces than ever. And when something critical breaks, still blind.
>
> Graziano Casto and Josh Lee on why the shortage is shared meaning, not data: turning raw expensive telemetry into a semantic observability mesh, with ClickHouse doing the heavy lifting.
>
> Day two, 11:20, breakout.
>
> #CloudNativeDenmark #CND2026 #Observability #ClickHouse

**Fri 11 Sep · Lightning talk + meme slot**
Asset: `talk-collector-stories.png`

> The OpenTelemetry Developer Experience SIG went and asked: how do organisations actually run the Collector in production?
>
> Johanna Öjeling brings the findings in five minutes. A lean setup that has never had a production incident. Pipelines simplified at enterprise scale. Collector config managed across dozens of clusters.
>
> Day one, 09:55, main stage. One of two lightning talks in the morning keynote block.
>
> #CloudNativeDenmark #CND2026 #OpenTelemetry #Observability

---

### Week 5 — Sep 14–18 · Platform engineering

**Mon 14 Sep**
Asset: `talk-platforms-asked.png`

> "Treat your internal teams as customers" assumes the customer has a choice.
>
> Jacob Avlund spent three and a half years at the LEGO Group building two platforms: a Kubernetes platform teams could take or leave, and an observability platform that was company-wide consolidation. Same org, same people, completely different job.
>
> Day one, 11:20, main stage.
>
> #CloudNativeDenmark #CND2026 #PlatformEngineering #Kubernetes

**Tue 15 Sep**
Asset: `talk-platforms-matter-ai.png`

> Without a strategy, agentic coding accelerates fragmentation. Different tools, inconsistent environments, ad hoc process — compounding into chaos at machine speed.
>
> Jessica Andersson's case: every developer is about to be responsible for more software than ever, so cognitive load has to go down while volume goes up. That means fewer bespoke setups and stronger defaults, not more freedom.
>
> Day two, 11:20, main stage.
>
> #CloudNativeDenmark #CND2026 #PlatformEngineering #InternalDeveloperPlatform

**Thu 17 Sep**
Asset: `talk-pdb-trust.png`

> You set a PodDisruptionBudget. Kubernetes evicted your pods anyway.
>
> Priority classes, rolling restarts and resource pressure all quietly bypass your budget, and you find out during an upgrade. Kārlis Akots Gribulis walks through the failure modes that hit their platform, how to reproduce each one, and how to test that your disruption policy does what you think.
>
> Day one, 11:20, breakout.
>
> #CloudNativeDenmark #CND2026 #Kubernetes #SRE

**Fri 18 Sep**
Asset: `talk-cadence-uber.png`

> Millions of concurrent workflow executions. Then a whole geographic region fails.
>
> Seva Kaloshin on regional resilience in Cadence, Uber's open source workflow engine: replication lag, split-brain, and not losing or duplicating tasks across regions. Plus how they turned massive failover drills into a routine Tuesday.
>
> Day two, 14:00, main stage.
>
> #CloudNativeDenmark #CND2026 #Resilience #CloudNative

---

### Week 6 — Sep 21–25 · Sponsors and the 60-day mark

Sponsor posts work best when the sponsor's own page can reshare them the same day. Send the graphic to each sponsor contact a week ahead, with the post text, so their social team is ready.

**Mon 21 Sep · 59 days**
Asset: `countdown-60.png` (re-render as `59`, see fix 2)

> Two months out.
>
> Standard tickets are 1.999 DKK including VAT, and hold until 17 November. The program is already published in full — 32 sessions, 35 speakers, four workshops.
>
> Tickets → cloudnativedenmark.ticketbutler.io/en/e/cloud-native-denmark-26/
>
> #CloudNativeDenmark #CND2026 #Kubernetes #Copenhagen

**Tue 22 Sep · Platinum**
Asset: `sponsor-scannet.png`

> Thank you, ScanNet.
>
> ScanNet, part of team.blue, is Platinum sponsor of Cloud Native Denmark 2026 — the largest single contribution to this year's edition, and a big part of why every profit can go to charity instead of to a balance sheet.
>
> Find them at the exhibition area on both days.
>
> #CloudNativeDenmark #CND2026 #Sponsors

**Thu 24 Sep · Gold**
Asset: `tier-gold.png`

> Thank you to our Gold sponsors.
>
> AWS, Exoscale, Netic and SUSE are backing Cloud Native Denmark 2026. Each has a booth, and each gets stage time in the day-two keynote block.
>
> Come and ask them hard questions. That is what the exhibition area is for.
>
> #CloudNativeDenmark #CND2026 #Sponsors

**Fri 25 Sep · Bronze**
Asset: `tier-bronze.png`

> Thank you to our Bronze sponsors.
>
> Chainguard, Dash0, EDB, Everpure, Systematic and Tigera.
>
> Six companies whose engineers you will actually recognise from the CNCF projects they maintain. Say hello in the exhibition area.
>
> #CloudNativeDenmark #CND2026 #Sponsors

> **Individual sponsor cards.** `sponsor-aws.png`, `sponsor-exoscale.png`, `sponsor-netic.png`, `sponsor-suse.png`, `sponsor-chainguard.png`, `sponsor-dash0.png`, `sponsor-edb.png`, `sponsor-everpure.png`, `sponsor-systematic.png` and `sponsor-tigera.png` are best used as a gift to the sponsor rather than as page posts. Send each company its own card and let them post it. The page reshares. That way the page timeline stays program-led and the sponsors still get their moment.

---

### Week 7 — Sep 28–Oct 2 · AI and agents

**Mon 28 Sep**
Asset: `talk-agent-substrate.png`

> Standard Kubernetes handles thousands of long-running services. The agentic web needs millions of bursty, stateful sessions, and control planes collapse under the chatter of sub-second tool calls while idle containers burn money.
>
> Abdel Sghiouar introduces Agent Substrate: agents as actors rather than pods, gVisor sandboxing, instant state snapshots to suspend and resume, and 30x oversubscription.
>
> Day one, 10:25, main stage. Advanced.
>
> #CloudNativeDenmark #CND2026 #Kubernetes #AI

**Tue 29 Sep**
Asset: `talk-observability-matrix.png`

> Does AI-driven observability get you out of the chaos, or does it just build a more convincing illusion?
>
> Henrik Rexed takes five AI-powered agents — HolmesGPT, Kagent, Opni, K8sGPT and Monte Carlo — and shows what each one actually does to root cause, signal enrichment and alert fatigue. Not all of them are your ally.
>
> Day two, 12:15, main stage.
>
> #CloudNativeDenmark #CND2026 #Observability #AIOps

**Thu 1 Oct**
Asset: `talk-two-standards.png`

> Every vendor built their own observability stack, we paid for it, so we built OpenTelemetry. Same story with feature flags, so we built OpenFeature.
>
> Agents are here and the control layer is being rebuilt as proprietary infrastructure. Simon Schrottner argues for the open version, using a physical party game, a Raspberry Pi and an agent that rewrites the rules in real time.
>
> Day two, 10:25, breakout.
>
> #CloudNativeDenmark #CND2026 #OpenTelemetry #OpenFeature

**Fri 2 Oct**
Asset: `talk-ai-side-effects.png`

> Not carbon. Not training data. Not non-determinism. We have had those arguments.
>
> Marcus Noble wants to talk about us: the erosion of engineering craft, the shift from software engineer to software approver, and what happens to a profession that stops making juniors.
>
> Day two, 14:55, main stage. Expect a frank and slightly uncomfortable 35 minutes.
>
> #CloudNativeDenmark #CND2026 #AI #SoftwareEngineering

---

### Week 8 — Oct 5–9 · Digital sovereignty

**Mon 5 Oct**
Asset: `talk-us-independent.png`

> Everyone talks about provider exit. Almost nobody has built it and can tell you what it cost.
>
> Thomas Ornell has: a US-independent fallback environment for a European telematics platform running half a million connected assets. Kafka, HiveMQ, MinIO, OpenBao, GitLab, Harbor, ArgoCD. Reproducible from open source parts. Pain included.
>
> Day one, 12:15, breakout.
>
> #CloudNativeDenmark #CND2026 #DigitalSovereignty #Kubernetes

**Tue 6 Oct**
Asset: `talk-sovereign-boring.png`

> Getting multi-cloud wrong is easy. Building a genuinely sovereign stack across providers is hard.
>
> Steffen Karlsson and Nicklas Frahm on Kommodity.io, the platform team at Corti.ai's open source answer: Talos Linux plus Cluster API in a single binary, same configuration across cloud, virtualisation and bare metal.
>
> Day two, 12:15, breakout. Advanced deep dive.
>
> #CloudNativeDenmark #CND2026 #DigitalSovereignty #Kubernetes

**Thu 8 Oct**
Asset: `talk-sovereign-agentic-coding.png`

> What does it take to leave Claude Code and Codex behind and build your own agentic coding framework, running locally in containers?
>
> Rasmus Steiniche has the answers, including the honest one: how good open weights models actually are for coding, and what it takes to make them useful. Sovereignty as a side benefit.
>
> Day one, 14:00, main stage. Deep dive.
>
> #CloudNativeDenmark #CND2026 #DigitalSovereignty #AI

**Fri 9 Oct**
Asset: `talk-root-of-trust.png`

> It sounds simple. Then it turns into node trust stores, workload injection, admission control, five language runtimes with five opinions, and a developer experience nobody wants to own.
>
> Jakub Krzywda and Cristian Klein on building a custom root of trust for Kubernetes workloads in regulated environments, in a way platform admins can actually manage.
>
> Day two, 10:25, main stage.
>
> #CloudNativeDenmark #CND2026 #Kubernetes #Security

---

### Week 9 — Oct 12–16 · Security, policy and data

**Mon 12 Oct**
Asset: `talk-kyverno-victoriametrics.png`

> Policies get switched on to improve security and consistency. Then a deployment is rejected and nobody can say which rule fired, or how often it fires.
>
> Diana Todea and Cortney Nickerson build the answer from one validation policy up: Kyverno evaluations as metrics, into VictoriaMetrics, queried through a Prometheus-compatible API, on a dashboard that shows failures by namespace.
>
> Day one, 12:15, main stage.
>
> #CloudNativeDenmark #CND2026 #Kyverno #PolicyAsCode

**Wed 14 Oct**
Asset: `talk-postgres-observability.png`

> Logs in one system, metrics in another, and traces that stop at the application boundary. You cannot follow a slow request from the user into the SQL plan that caused it.
>
> Gabriele Rossini unifies all three for CloudNativePG-managed PostgreSQL clusters, under one roof.
>
> Day one, 14:55, main stage.
>
> #CloudNativeDenmark #CND2026 #PostgreSQL #Observability

**Thu 15 Oct · Practical**
Asset: photo of Scandic Copenhagen from `cloudnativedenmark.dk/venue`

> Where we land.
>
> Scandic Copenhagen, Vester Søgade 6. Five minutes on foot from Copenhagen Central Station, one stop from Vesterport. Fifteen to twenty minutes from the airport by metro or train.
>
> The conference takes over the large auditoriums plus a workshop room, with the exhibition area between them. Rooms at the venue are bookable, and plenty of hotels are within walking distance.
>
> Venue details → cloudnativedenmark.dk/venue
>
> #CloudNativeDenmark #CND2026 #Copenhagen

**Fri 16 Oct · Convince-your-boss**
Asset: **NEEDS RENDER** — a plain `bulletin` card, headline `Send this|to your|manager.`

> Need approval? The site has a letter you can send as-is.
>
> It covers the two days, what you will bring back, and why 500 engineers in Copenhagen solving the same problems you are is worth two days out of the office. Standard tickets are 1.999 DKK until 17 November — a fifth of what most vendor conferences cost, and the profit goes to charity.
>
> cloudnativedenmark.dk
>
> #CloudNativeDenmark #CND2026 #PlatformEngineering

---

### Week 10 — Oct 19–23 · Workshops and the 30-day mark

Workshops are the strongest remaining conversion argument, because they are capped by room size and people understand that instinctively. Say so.

**Mon 19 Oct**
Asset: `ws-cloudnativepg.png`

> Comfortable running stateless workloads on Kubernetes, and still reaching for a managed database the moment state shows up? This is the workshop.
>
> Gabriele Bartolini runs CloudNativePG's own local learning environment on your laptop: two Kubernetes clusters and object storage, one PostgreSQL cluster deployed and explored, then a controlled failover.
>
> Day one, 10:25–11:55, workshop room. Bring a laptop.
>
> #CloudNativeDenmark #CND2026 #PostgreSQL #Kubernetes

**Tue 20 Oct · 30 days**
Asset: `countdown-30.png` (re-render, see fix 1)

> 30 days.
>
> Two days, three rooms, 32 sessions. Standard tickets hold at 1.999 DKK until 17 November, then Late Bird takes it to 4.999.
>
> If you are still deciding, look at the workshop room. Four hands-on sessions, capped by the room, and no recording will replace them.
>
> Tickets → cloudnativedenmark.ticketbutler.io/en/e/cloud-native-denmark-26/
>
> #CloudNativeDenmark #CND2026 #Kubernetes #Copenhagen

**Wed 21 Oct**
Asset: `ws-otel-playbook.png`

> Beginner-friendly, hands on, and you leave with the whole path walked once.
>
> Imma Valls takes you through instrumenting an application with OpenTelemetry and shipping metrics, logs and traces into Loki, Grafana, Tempo and Prometheus. SDK instrumentation, infrastructure metrics through the Collector, and zero-code eBPF for service-to-service.
>
> Day one, 14:00–15:30, workshop room.
>
> #CloudNativeDenmark #CND2026 #OpenTelemetry #Grafana

**Thu 22 Oct**
Asset: `ws-crossplane.png`

> Heard of Crossplane and never touched it? Built a PoC and got stuck going further? This is the one.
>
> Riccardo Capraro takes you from nothing to a working internal developer platform: what Crossplane is, how it works, and when it beats the alternatives. No prior experience needed.
>
> Day two, 14:00–15:30, workshop room.
>
> #CloudNativeDenmark #CND2026 #Crossplane #PlatformEngineering

**Fri 23 Oct**
Asset: `ws-regenerative.png`

> "We want to make the world better — at least the world of software. How do we do that?"
>
> Lars Kruse facilitates a lean coffee on what "regenerative" even means when applied to how we build software. No slides. Bring an opinion.
>
> Day two, 10:25–11:55, workshop room.
>
> #CloudNativeDenmark #CND2026 #SoftwareEngineering

---

### Week 11 — Oct 26–30 · Infrastructure and open source

**Mon 26 Oct**
Asset: `talk-no-ssh-bare-metal.png`

> The cloud taught us to treat servers as cattle. Then we went back to bare metal and remembered that these are heavy cattle, in a rack, in a building, with a power button.
>
> Karsten Nielsen follows a powered-off EPYC server all the way to Kubernetes node with no manual step and no SSH — Metal3 and Ironic over Redfish/IPMI, Cluster API, and Talos Linux.
>
> Day one, 14:00, breakout. Advanced deep dive.
>
> #CloudNativeDenmark #CND2026 #BareMetal #Kubernetes

**Tue 27 Oct**
Asset: `talk-crossplane-should-not.png`

> Bending a framework is part of the job. Until the bending costs a customer 230 production databases during maintenance.
>
> Liene Luksika tells that story straight: what Crossplane is, what they wanted it to be, why Crossplane 2 exists, and what they changed afterwards. The silver lining is that they kept the customer.
>
> Day one, 14:55, breakout.
>
> #CloudNativeDenmark #CND2026 #Crossplane #PlatformEngineering

**Thu 29 Oct**
Asset: `talk-my-cloud-home.png`

> In a company, the path to Kubernetes is clear: pick a provider, use the managed thing, staff a team. At home you get none of that.
>
> Thomas Schuetz on running self-managed, on-demand Kubernetes at home — GitHub for management, virtualisation and a home network to integrate with, and a happy rediscovery of Proxmox. Fun experiments and hard lessons in equal measure.
>
> Day two, 14:55, breakout.
>
> #CloudNativeDenmark #CND2026 #Homelab #Kubernetes

**Fri 30 Oct**
Asset: `talk-sterile-patch.png`

> Issues go stale. Proposals stay theoretical. Pull requests wait for review, for testing, for the next release. Your project does not have to wait for any of it.
>
> Johan Thomsen makes the case for clean, intentional local patching: carrying small documented changes while you keep working upstream. Five minutes, day one, main stage.
>
> #CloudNativeDenmark #CND2026 #OpenSource

---

### Week 12 — Nov 2–6 · Hack Your Future, the 14-day mark, and logistics

**Mon 2 Nov · The charity post — the most important post of the campaign**
Asset: `partner-hyf-profits.png`, with `partner-hyf-million.png` as the second slide of a carousel

Full copy in section 9.

**Wed 4 Nov · Organizers**
Asset: organizer portraits from `assets/organizers/` in a honeycomb

> Nobody here does this for a living.
>
> Cloud Native Denmark is run by practitioners in their evenings and weekends. No parent company, no marketing budget, no profit motive — the profit is the point, and it goes to Hack Your Future.
>
> Jinhong Brejnholt, Allan Højgaard Jensen and Kasper Borg Nissen open and close both days. The wider crew handles everything you will not see.
>
> Come and say hello. We are the ones with the radios.
>
> #CloudNativeDenmark #CND2026 #Community

**Thu 5 Nov · 14 days**
Asset: `countdown-14.png`

> Two weeks out. Time to book the train.
>
> Standard tickets at 1.999 DKK until 17 November. After that it is Late Bird at 4.999, and we would rather you saved the money.
>
> If you are coming from Aarhus, Odense or Malmö: the venue is a five-minute walk from Copenhagen Central Station. Same-day travel works for both days.
>
> Tickets → cloudnativedenmark.ticketbutler.io/en/e/cloud-native-denmark-26/
>
> #CloudNativeDenmark #CND2026 #Copenhagen

**Fri 6 Nov · Meme slot**
See section 8.

---

### Week 13 — Nov 9–13 · Speaker videos, the 7-day mark, last call

This is the week the recorded speaker promos go out. See section 10 for how to capture them.

**Mon 9 Nov · Speaker video**
Asset: 30–45s vertical clip, subtitled, CND end card

> "Come to my talk" is a weak pitch. "Here is the thing that surprised me" is a good one.
>
> [Speaker name] on what they are bringing to Copenhagen on [day].
>
> Full program → cloudnativedenmark.dk/schedule
>
> #CloudNativeDenmark #CND2026

**Tue 10 Nov · Speaker video**
Same treatment, different speaker.

**Wed 11 Nov · Day-one preview**
Asset: **NEEDS RENDER** `preview-day-one.png` — headline `Day one|in five lines.`

> Day one, 19 November.
>
> Doors at 08:00 with breakfast. Welcome at 09:00, then ten minutes on Hack Your Future — the charity this year's profits go to. Joseph Sandoval's keynote at 09:25, two lightning talks, and a wrap at 10:05.
>
> Then two parallel tracks all day — platforms, observability, sovereignty, policy — plus the CloudNativePG and OpenTelemetry workshops. Closing keynotes at 16:00 from Adriana Villela and Josh Lee, then Michael Coté.
>
> Doors close at 17:00. The after party does not.
>
> cloudnativedenmark.dk/schedule
>
> #CloudNativeDenmark #CND2026

**Thu 12 Nov · 7 days**
Asset: `countdown-07.png`

> One week.
>
> Standard closes on 17 November. Doors at 08:00 on the 19th, first keynote at 09:15.
>
> Last chance to bring a colleague at the sane price.
>
> Tickets → cloudnativedenmark.ticketbutler.io/en/e/cloud-native-denmark-26/
>
> #CloudNativeDenmark #CND2026

**Fri 13 Nov · Day-two preview**
Asset: **NEEDS RENDER** `preview-day-two.png` — headline `Day two|in five lines.`

> Day two, 20 November.
>
> Thomas Vitale and Alexandra Hou Aldershaab on surviving compliance at 09:10, then the sponsored keynote and the Gold sponsor pitches.
>
> Two tracks through the day — agents, sovereignty, semantic observability, durable execution — plus the Regenerative Software Development lean coffee and the Crossplane workshop. Paula Kennedy at 15:50, Gabriele Bartolini at 16:15, then thank-yous, surprises and raffles.
>
> cloudnativedenmark.dk/schedule
>
> #CloudNativeDenmark #CND2026

---

### Week 14 — Nov 16–20 · Countdown and live

**Mon 16 Nov · 3 days**
Asset: `countdown-03.png`

> Three days.
>
> The final headcount goes to the venue tomorrow. Standard closes tomorrow too — 17 November — and Late Bird is 4.999 DKK.
>
> See you at Scandic Copenhagen.
>
> #CloudNativeDenmark #CND2026

**Tue 17 Nov · Standard closes tonight**
Asset: **NEEDS RENDER** — `bulletin`, ground `red`, headline `Standard closes|tonight.`

> Standard tickets close at midnight. Tomorrow the only option is Late Bird at 4.999 DKK.
>
> Tickets → cloudnativedenmark.ticketbutler.io/en/e/cloud-native-denmark-26/
>
> #CloudNativeDenmark #CND2026

**Wed 18 Nov · 1 day**
Asset: `countdown-01.png`

> Tomorrow.
>
> Doors at 08:00, registration in the foyer, breakfast until 09:00. Welcome at 09:00, first keynote at 09:25.
>
> Bring a laptop if you are in a workshop. Bring your own mug if you can. Bring a question for someone whose talk you liked.
>
> #CloudNativeDenmark #CND2026

**Thu 19 Nov · Live, day one**
4–6 posts through the day, no card needed. Photos beat graphics once the room is full.

- 08:15 — a full foyer, "Day one. Doors are open."
- 09:20 — the Hack Your Future segment on the main stage, tagging them
- 10:10 — a keynote stage shot with one quotable line from Joseph Sandoval
- 12:30 — the exhibition area, tag every sponsor
- 15:00 — a workshop room mid-session, laptops open
- 17:15 — "Day one done" with the best photo of the day

**Fri 20 Nov · Live, day two**
Same rhythm. End with the number.

> That's a wrap on edition Nº 04.
>
> [N] attendees. 32 sessions. 35 speakers. Four workshops. Two days at Scandic Copenhagen.
>
> And [amount] DKK to Hack Your Future Denmark, which takes our three-year total past [total].
>
> Thank you to every speaker, every sponsor, every volunteer, and every one of you who took two days out to be in the room.
>
> Recordings follow. See you in 2027.
>
> #CloudNativeDenmark #CND2026

---

### After the event

| When | Post |
|---|---|
| Mon 23 Nov | Photo album, and the confirmed donation figure with the Hack Your Future team named |
| Wed 25 Nov | Attendee feedback highlights — three verbatim quotes beat any statistic |
| Early Dec | Recordings live on YouTube, one post per keynote over the following weeks |
| January | CFP for 2027 opens, using `render.mjs cfp-notification` |

---

## 6. Talk cards: render-ready content

The 26 non-keynote sessions need a card each. They use the same `bulletin` layout as the keynote cards, so this is a content edit, not a code change.

**Steps.**

1. Copy the speaker photos into the repo, lowercased with underscores, matching the paths below:
   `assets/speakers/adriana_villela.jpg`, `assets/speakers/abdel_sghiouar.png`, and so on.
2. Paste the block below into `content/2026-announcements.json` as a top-level `"sessions"` array.
3. Add a `sessions` loop to `graphics/build-announcements.mjs`, identical to the existing `keynotes` loop.
4. Run `node graphics/build-announcements.mjs` for square and 4:5, then `test/run.sh`.
5. **Open every card.** Portraits with the subject off-centre need an `align` value — that is what caught the dog in Paula Kennedy's photo.

Grounds run `sand`, `navy` and `red` so the feed never shows two identical backgrounds in a row. Two-speaker sessions use `portrait` and `portrait2`.

**Card copy structure.** The eyebrow is the session type only — `Session`, `Lightning talk`, `Workshop`. No day, no room, no time: that is what the schedule page is for, and it was eating the space the title needed. The body is the full session title, a blank line, then the speaker names. The headline stays the punchy fragment. The six keynote cards were rebuilt the same way, so the whole set reads consistently.

```json
[
  {
    "slug": "talk-lazy-developer",
    "eyebrow": "Session",
    "headline": "The lazy|developer's guide|to observing|your own code.",
    "body": "The lazy developer’s guide to observing your|own code||Adriana Villela & Diana Todea",
    "ground": "sand",
    "portrait": "assets/speakers/adriana_villela.jpg",
    "portrait2": "assets/speakers/diana_todea.jpg"
  },
  {
    "slug": "talk-manual-otel",
    "eyebrow": "Session",
    "headline": "Auto-instrumentation|is quietly|draining your|budget.",
    "body": "How manual OTel instrumentation saves more|than just money||Juliano Costa",
    "ground": "navy",
    "portrait": "assets/speakers/juliano_costa.jpg"
  },
  {
    "slug": "talk-data-swamp",
    "eyebrow": "Session",
    "headline": "Beyond the|data swamp.",
    "body": "Beyond the Data Swamp: Building Your|Semantic Observability Mesh||Graziano Casto & Josh Lee",
    "ground": "sand",
    "portrait": "assets/speakers/graziano_casto.jpg",
    "portrait2": "assets/speakers/josh_lee.jpg"
  },
  {
    "slug": "talk-collector-stories",
    "eyebrow": "Lightning talk",
    "headline": "How teams|actually run|the Collector.",
    "body": "OpenTelemetry Collector in Production: Real-|World User Stories||Johanna Öjeling",
    "ground": "navy",
    "portrait": "assets/speakers/johanna_ojeling.jpg"
  },
  {
    "slug": "talk-platforms-asked",
    "eyebrow": "Session",
    "headline": "What if your|customers can't|opt out?",
    "body": "Building platforms for teams that asked for|them — and teams that didn’t||Jacob Avlund",
    "ground": "sand",
    "portrait": "assets/speakers/jacob_avlund.jpg"
  },
  {
    "slug": "talk-platforms-matter-ai",
    "eyebrow": "Session",
    "headline": "Your platform|matters more|than ever|with AI.",
    "body": "Your platforms matter more than ever with AI||Jessica Andersson",
    "ground": "navy",
    "portrait": "assets/speakers/jessica_andersson.jpg"
  },
  {
    "slug": "talk-pdb-trust",
    "eyebrow": "Session",
    "headline": "Do you trust|your PDBs?|You shouldn't.",
    "body": "Do You Trust Your PodDisruptionBudgets? You|Shouldn’t!||Kārlis Akots Gribulis",
    "ground": "red",
    "portrait": "assets/speakers/karlis_akots_gribulis.png"
  },
  {
    "slug": "talk-cadence-uber",
    "eyebrow": "Session",
    "headline": "Durable execution|at Uber scale.",
    "body": "Durable Execution at Uber Scale:|Orchestrating Multi-Region Resilience with|Cadence||Seva Kaloshin",
    "ground": "sand",
    "portrait": "assets/speakers/seva_kaloshin.jpg"
  },
  {
    "slug": "talk-agent-substrate",
    "eyebrow": "Session",
    "headline": "Kubernetes was|built for services,|not for millions|of agents.",
    "body": "Scaling the Agentic Web with Agent Substrate||Abdel Sghiouar",
    "ground": "navy",
    "portrait": "assets/speakers/abdel_sghiouar.png"
  },
  {
    "slug": "talk-observability-matrix",
    "eyebrow": "Session",
    "headline": "Observability|in the Matrix.",
    "body": "Observability in the Matrix: Choosing the|Right AI Agent to Escape the Chaos||Henrik Rexed",
    "ground": "sand",
    "portrait": "assets/speakers/henrik_rexed.jpg"
  },
  {
    "slug": "talk-two-standards",
    "eyebrow": "Session",
    "headline": "Two standards|walk into|an agent.",
    "body": "Two Standards Walk Into an Agent: Runtime|Agent Control with OpenTelemetry and|OpenFeature||Simon Schrottner",
    "ground": "red",
    "portrait": "assets/speakers/simon_schrottner.jpg"
  },
  {
    "slug": "talk-ai-side-effects",
    "eyebrow": "Session",
    "headline": "The AI side|effects we're not|talking about.",
    "body": "The AI side effects we’re not talking about||Marcus Noble",
    "ground": "red",
    "portrait": "assets/speakers/marcus_noble.jpg"
  },
  {
    "slug": "talk-us-independent",
    "eyebrow": "Session",
    "headline": "We built the|US-independent|fallback. Here's|the bill.",
    "body": "Building a US-Independent Fallback|Environment: Successes, Failures, and the|Hidden Traps||Thomas Ornell",
    "ground": "navy",
    "portrait": "assets/speakers/thomas_ornell.jpg"
  },
  {
    "slug": "talk-sovereign-boring",
    "eyebrow": "Session",
    "headline": "Make sovereign|cloud boring.",
    "body": "Make Sovereign Cloud Boring: One Binary to|Run Kubernetes Anywhere||Steffen Karlsson & Nicklas Frahm",
    "ground": "sand",
    "portrait": "assets/speakers/steffen_karlsson.png",
    "portrait2": "assets/speakers/nicklas_frahm.png"
  },
  {
    "slug": "talk-sovereign-agentic-coding",
    "eyebrow": "Session",
    "headline": "Agentic coding,|entirely on|your laptop.",
    "body": "Digital Sovereign Agentic Coding||Rasmus Steiniche",
    "ground": "navy",
    "portrait": "assets/speakers/rasmus_steiniche.png"
  },
  {
    "slug": "talk-root-of-trust",
    "eyebrow": "Session",
    "headline": "“Just add|the CA cert.”",
    "body": "Trust Me, I’m Internal: Building a Custom|Root of Trust for Kubernetes Workloads||Jakub Krzywda & Cristian Klein",
    "ground": "navy",
    "portrait": "assets/speakers/jakub_krzywda.png",
    "portrait2": "assets/speakers/cristian_klein.jpg"
  },
  {
    "slug": "talk-kyverno-victoriametrics",
    "eyebrow": "Session",
    "headline": "Which policy|rejected my|workload?",
    "body": "Observing Kubernetes Policies with Kyverno|and VictoriaMetrics||Diana Todea & Cortney Nickerson",
    "ground": "navy",
    "portrait": "assets/speakers/diana_todea.jpg",
    "portrait2": "assets/speakers/cortney_nickerson.jpg"
  },
  {
    "slug": "talk-postgres-observability",
    "eyebrow": "Session",
    "headline": "The database|is the black box|at the bottom|of every trace.",
    "body": "Unified Observability for PostgreSQL on|Kubernetes: Logs, Traces, and Metrics under|One Roof||Gabriele Rossini",
    "ground": "sand",
    "portrait": "assets/speakers/gabriele_rossini.jpg"
  },
  {
    "slug": "ws-cloudnativepg",
    "eyebrow": "Workshop",
    "headline": "PostgreSQL on|Kubernetes,|hands on.",
    "body": "PostgreSQL on Kubernetes: A Hands-On|Introduction to CloudNativePG||Gabriele Bartolini",
    "ground": "navy",
    "portrait": "assets/speakers/gabriele_bartolini.png"
  },
  {
    "slug": "ws-otel-playbook",
    "eyebrow": "Workshop",
    "headline": "Instrument an app|from scratch.",
    "body": "Getting started with OpenTelemetry|instrumentation: A practical playbook||Imma Valls",
    "ground": "sand",
    "portrait": "assets/speakers/imma_valls.jpg"
  },
  {
    "slug": "ws-crossplane",
    "eyebrow": "Workshop",
    "headline": "Zero to your first|internal developer|platform.",
    "body": "Building Platforms with Crossplane: A Hands-|On Introduction||Riccardo Capraro",
    "ground": "navy",
    "portrait": "assets/speakers/riccardo_capraro.jpg"
  },
  {
    "slug": "ws-regenerative",
    "eyebrow": "Workshop",
    "headline": "What is...|regenerative software|development?",
    "body": "What is… Regenerative Software Development||Lars Kruse",
    "ground": "sand",
    "portrait": "assets/speakers/lars_kruse.jpg"
  },
  {
    "slug": "talk-no-ssh-bare-metal",
    "eyebrow": "Session",
    "headline": "No SSH.|No golden image.|No snowflakes.",
    "body": "No SSH, No Golden Image, No Snowflakes:|Provisioning Bare Metal from a Single|Kubernetes Cluster||Karsten Nielsen",
    "ground": "navy",
    "portrait": "assets/speakers/karsten_nielsen.png"
  },
  {
    "slug": "talk-crossplane-should-not",
    "eyebrow": "Session",
    "headline": "We bent Crossplane|until it broke.",
    "body": "How we used Crossplane for the things we|should not have||Liene Luksika",
    "ground": "red",
    "portrait": "assets/speakers/liene_luksika.jpg"
  },
  {
    "slug": "talk-my-cloud-home",
    "eyebrow": "Session",
    "headline": "It's my cloud.",
    "body": "It’s my Cloud! Building On-Demand Kubernetes|Platforms at Home||Thomas Schuetz",
    "ground": "red",
    "portrait": "assets/speakers/thomas_schuetz.jpg"
  },
  {
    "slug": "talk-sterile-patch",
    "eyebrow": "Lightning talk",
    "headline": "A sterile patch|is not a|dirty fork.",
    "body": "A sterile patch is not a dirty fork||Johan Thomsen",
    "ground": "sand",
    "portrait": "assets/speakers/johan_thomsen.jpg"
  }
]
```

---

---

## 7. Moments: the 2025 photography

Kim-Yen Nguyen shot 1,043 frames at Cloud Native Denmark 2025 in Savværket, Aarhus. Ten of them are now cards.

These are the "I don't want to miss that" posts, and they are the only asset in the campaign that cannot be argued with. A card can claim the room was full. A photograph of the full room ends the discussion.

They use the designer's own photo layout — `speaker-highlight --variant 1` — rather than the bulletin, because a wide room shot does not survive being cropped into a hexagon.

Three changes to her default, all opt-in so the measured geometry still guards the pixel diff:

- **No corner tab.** Her red tab lands on the top-right of the content window. Over a portrait she art-directed that is fine; over a room, or a twelve-person group photo, it covers a face. `--no-tab`.
- **A shorter footer band, 240px instead of 325.** The photograph gets the difference, so it now runs about 78% of the card instead of 70%. Her lockup, mark and year exactly fill her band with her own padding, so there is no slack to reclaim — the artwork scales down with the band rather than being shifted into it, which keeps her proportions. `--band 240`.
- **A lighter scrim, half her value.** Her gradient reaches 0.92 navy at the bottom edge, which is right under a low text block and buries the photograph. At 0.5 the picture reads and the white type still holds. Two frames needed more: the Chaos-as-a-service slide has its own large type competing with the headline (0.85) and the rain shot is pale where the statement sits (0.7). `--scrim`.

The footer band alternates `sand` and `navy` down the list, so a run of these in a feed does not read as one long navy block. Red is deliberately not offered: the year is a ground-coloured fill with a red stroke, so on a red band it disappears into itself.

**Three rules for these.**

1. **Credit Kim-Yen Nguyen in every post.** Photographer credit is not optional and it costs you nine characters.
2. **Say it is last year, in the copy.** The tab says `CND/2025`, but somebody skimming will read a packed hall as a 2026 promise. The venue also changed — 2025 was Savværket in Aarhus, 2026 is Scandic Copenhagen — so a caption that implies otherwise is just wrong.
3. **No photographs of identifiable children.** The delivery has a lot of them, from the FIRST LEGO League and Coding Pirates sets, and they are genuinely charming. Publishing them needs a media release per child, which is a question for the organisers rather than a rendering decision. I left all of them out.

### The ten cards

| Asset | Photograph | Statement | Posts |
|---|---|---|---|
| `moment-full-room.png` | The main hall, day two, every hand in the air | "You had to be in the room" | Tue 1 Sep |
| `moment-hallway.png` | Two people laughing over a drink between sessions | "The best talk isn't always on stage" | Wed 9 Sep |
| `moment-workshop.png` | The workshop room, mid-session | "No recording replaces this" | Wed 16 Sep |
| `moment-organizers.png` | The crew on stage at closing remarks | "Run by people who do it for free" | Wed 23 Sep |
| `moment-chaos.png` | "Chaos-as-a-service" on the main stage, in LEGO | "Talks you quote for months" | Wed 30 Sep |
| `moment-never-stop.png` | A hoodie reading "never stop developing" at the drinks table | "Never stop developing" | Wed 7 Oct |
| `moment-group.png` | Twelve people crammed into one frame, thumbs up | "Came for the talks. Stayed for these people." | Wed 28 Oct |
| `moment-lanyards.png` | Hundreds of lanyards laid out on a table before doors | "The calm before doors" | Mon 16 Nov |
| `moment-rain.png` | Arrivals in the rain on wet tarmac | "It rained. Nobody cared." | Tue 17 Nov |
| `moment-after-party.png` | Drinks being poured under purple light | "Nobody left at five" | Wed 18 Nov |

The last three double up with the countdown posts in the final week. Two posts a day is normal at that stage, and the countdown does the selling while the photograph does the wanting.

### Post copy

**Tue 1 Sep · `moment-full-room.png`**

> This is the main hall on day two last year.
>
> Nobody was checking Slack. Every hand went up because the closing keynote asked a question and the whole room had an answer.
>
> That is the thing a recording cannot give you back.
>
> 19–20 November, Scandic Copenhagen. Photo: Kim-Yen Nguyen, CND 2025.
>
> Tickets → cloudnativedenmark.ticketbutler.io/en/e/cloud-native-denmark-26/
>
> #CloudNativeDenmark #CND2026

**Wed 9 Sep · `moment-hallway.png`**

> The hallway track is not a euphemism for skipping talks.
>
> It is where you find the person who solved last quarter's problem, describe your architecture out loud to somebody with no stake in it, and get told the thing your team is too polite to say.
>
> We build the schedule with breaks long enough for it. Twenty minutes between sessions, on purpose.
>
> Photo: Kim-Yen Nguyen, CND 2025.
>
> #CloudNativeDenmark #CND2026

**Wed 16 Sep · `moment-workshop.png`**

> Four workshops this year, and every one is capped by the size of the room.
>
> CloudNativePG on your own laptop. OpenTelemetry from zero to traces in Tempo. Crossplane to a working platform. A lean coffee on regenerative software development.
>
> The talks get recorded. These do not.
>
> Photo: Kim-Yen Nguyen, CND 2025.
>
> #CloudNativeDenmark #CND2026 #Kubernetes

**Wed 23 Sep · `moment-organizers.png`**

> This is the crew, on stage, at the end of last year.
>
> Not one of them is paid for it. There is no parent company and no marketing department. They book the venue, chase the AV, review the CFP, carry the boxes, and then hand the profit to charity.
>
> If you have ever wondered why the coffee breaks are twenty minutes and the schedule starts on time, it is because somebody argued about it in a Slack channel on a Sunday.
>
> Photo: Kim-Yen Nguyen, CND 2025.
>
> #CloudNativeDenmark #CND2026 #Community

**Wed 30 Sep · `moment-chaos.png`**

> "Chaos-as-a-service." In LEGO. On the main stage.
>
> The talks people were still quoting in the spring were not the ones with the most slides. Something about a goblin, a druid and an agentic AI strategy suggests this year will be no different.
>
> Photo: Kim-Yen Nguyen, CND 2025.
>
> #CloudNativeDenmark #CND2026

**Wed 7 Oct · `moment-never-stop.png`**

> Spotted at the drinks table last year.
>
> No caption needed.
>
> Photo: Kim-Yen Nguyen, CND 2025. 19–20 November, Copenhagen.
>
> #CloudNativeDenmark #CND2026

**Wed 28 Oct · `moment-group.png`**

> Twelve people who did not know each other on Wednesday.
>
> The talks are the reason you get budget approval. This is the reason you come back. Four editions in, and the same faces keep turning up — plus a few hundred new ones every year.
>
> Standard tickets are 1.999 DKK until 17 November.
>
> Photo: Kim-Yen Nguyen, CND 2025.
>
> #CloudNativeDenmark #CND2026 #Community

**Mon 16 Nov · `moment-lanyards.png`**

> Somewhere in Copenhagen tonight, this is happening.
>
> Three days out. The badges get laid out, the signage goes up, and somebody counts the lanyards twice.
>
> Photo: Kim-Yen Nguyen, CND 2025.
>
> #CloudNativeDenmark #CND2026

**Tue 17 Nov · `moment-rain.png`**

> Denmark in November. We know.
>
> Last year it rained on day one and the hall was full by 09:00 anyway. Standard tickets close tonight; after that it is Late Bird at 4.999 DKK.
>
> Photo: Kim-Yen Nguyen, CND 2025.
>
> Tickets → cloudnativedenmark.ticketbutler.io/en/e/cloud-native-denmark-26/
>
> #CloudNativeDenmark #CND2026

**Wed 18 Nov · `moment-after-party.png`**

> Doors at 08:00 tomorrow. And to answer the question we get every year: yes, there is an after party, and no, it does not end at five.
>
> Photo: Kim-Yen Nguyen, CND 2025.
>
> #CloudNativeDenmark #CND2026

### If you want more than ten

The full delivery is 1,043 frames. The strongest sets I did not use: the sponsor-wall portraits (frames 700–980, one clean portrait of nearly every attendee who stood there — ideal to send individually to the person in them), the Red Hat fedoras in the exhibition area, and the evening shots under purple light around frames 586–600. Frame numbers are recorded in `assets/photos/2025/README-note.txt`.

## 8. Memes

The memes have worked before, so keep them. What keeps them professional is not toning down the joke, it is where the joke points.

**Five rules.**

1. **The joke is about shared pain, never about a person, a sponsor, or a named competitor product.** "Your PDB is a suggestion" is fine. "Vendor X is a scam" is not.
2. **Every meme links to a real talk in the program.** A meme with no session behind it is noise on a conference page.
3. **Set the type in the brand.** Use `node graphics/render.mjs poster` for the type-only ones — that layout exists precisely for this. Space Grotesk on `sand` or `navy` reads as a joke told by a serious event. Impact on a stock photo reads as a different event.
4. **If you use a photo or a well-known format, make it the first slide of a two-slide carousel and put the brand card second.** The laugh gets the stop, the card gets the click.
5. **Nothing about outages, breaches, CVEs, or layoffs.** Someone in the audience lived it this quarter.

And one more: when a meme is at a speaker's expense, even affectionately, send it to them first. Every single one of these lands better when the speaker reshares it.

### Fifteen concepts, each tied to a session

| # | Concept | Format | Talk it points to |
|---|---|---|---|
| 1 | `minAvailable: 1` on top, the pod evicted anyway underneath. Caption: "Your PodDisruptionBudget is a suggestion." | Type-only poster, two lines of mono | Kārlis Akots Gribulis |
| 2 | An itemised invoice: "4.2M spans of GET /healthz", "attributes nobody has ever queried", "Total: your entire observability budget." | Receipt graphic on `sand` | Juliano Costa |
| 3 | A rack photo. "The cloud told us to treat servers like cattle. Nobody mentioned the cattle would be in a rack, in a building, with a power button." | Photo plus brand card | Karsten Nielsen — it is a direct quote from his abstract, so it flatters rather than mocks |
| 4 | Enormous `230`. Underneath: "production databases, during maintenance." Then, small: "We kept the customer." | Big-number poster | Liene Luksika — clear it with her first, it is her story to tell |
| 5 | `kubectl get agents` → `error: the server doesn't have a resource type "agents"`. Caption: "Your agent has no idea where it's running. Neither does your cluster." | Terminal screenshot on `navy` | Joseph Sandoval |
| 6 | A bouncer with a clipboard at a club door. "Are you using any license that is not approved?" | Photo plus brand card | Thomas Vitale & Alexandra Hou Aldershaab |
| 7 | Five pills instead of two, labelled HolmesGPT, Kagent, Opni, K8sGPT, Monte Carlo. "Pick one. Not all of them are your ally." | Illustration | Henrik Rexed |
| 8 | A d20 on a boardroom table. "Enterprise AI, week one: magic. Week three: it forgot everything that happened an hour ago." | Photo plus brand card | Michael Coté |
| 9 | "Two standards walk into an agent." Nothing else. Then: "Punchline: day two, 10:25, breakout." | Type-only poster | Simon Schrottner |
| 10 | A kWh bar chart climbing, captioned "It's my cloud." | Chart poster | Thomas Schuetz |
| 11 | A map of Europe, one pin dropped in Northern Virginia. "Sovereignty starts with knowing where the bytes sleep." | Map graphic, dry caption, no flags | The whole sovereignty track — link the schedule filter, not one talk |
| 12 | "Senior Software Engineer" struck through, replaced with "Senior Software Approver." | Type-only poster | Marcus Noble |
| 13 | Three speech bubbles — logs, metrics, traces — all talking past each other. "PostgreSQL observability, today." | Illustration | Gabriele Rossini |
| 14 | The price escalator: 999 → 1.499 → 1.999 → 4.999. Small print: "You had 90 days." | Type-only poster | Ticket push, use it once, week 13 |
| 15 | A candle next to a terminal. "Kubernetes, but hyggeligt." | Photo plus brand card | Use once, week 12, as the local-flavour post |

**Cadence.** One meme a week from week 4, in the Friday slot. Fifteen concepts across eleven Fridays leaves you spares, which is the right amount — the two that stop being funny by November get dropped instead of forced.

---

## 9. Hack Your Future

This is the strongest thing the page has to say all autumn, and it is not a talk. Announce it early (week 2), then tell the full story on Monday 2 November when people are deciding whether to buy the last tickets.

Hack Your Future Denmark is a not-for-profit running a free 34-week coding programme, taught by volunteers, for refugees, asylum seekers and others locked out of the Danish education system and job market. They measure success by employment, not graduation — graduates are now at Mærsk, LEGO, Nordea and TooGoodToGo. The next intake opens in 2026.

They also have ten minutes on the main stage on day one, right after the welcome, at 09:15.

### Short version — week 2

Asset: `partner-hyf-profits.png`

> Every profit from Cloud Native Denmark 2026 goes to Hack Your Future Denmark.
>
> They run a free 34-week coding programme, taught by volunteers, for refugees and others shut out of the Danish job market. They count a graduate as a success when that person has a job in tech — not when they finish the course.
>
> Over the last three editions we have donated more than 840,000 DKK. This year we want to push the total past a million.
>
> Your ticket is the donation. That is the whole mechanism.
>
> hackyourfuture.dk
>
> #CloudNativeDenmark #CND2026 #HackYourFuture #TechForGood

### Long version — Mon 2 Nov

Asset: `partner-hyf-volunteers.png`, or a photo of a Hack Your Future class if they will share a usable one

> Nobody makes money on Cloud Native Denmark.
>
> The organisers are practitioners doing this in evenings and weekends. There is no parent company. The sponsors pay for the venue, the food and the AV, and what is left over is donated. That has been the arrangement for four editions, and across the last three we have given more than 840,000 DKK to charity.
>
> This year all of it goes to Hack Your Future Denmark.
>
> They teach a free 34-week coding programme, entirely with volunteers, to people who cannot get into the Danish education system or the Danish job market — mostly refugees. And they do not count a graduation as a win. They count a job. Their alumni are at Mærsk, LEGO, Nordea and TooGoodToGo now.
>
> Two things you can do beyond buying a ticket.
>
> Volunteer as a mentor, if you write code for a living. They need engineers, not money, more than you would guess.
>
> And if you are hiring juniors, talk to them. There is a cohort of people who have done 34 weeks of hard voluntary work to get into this industry, and they are looking for a first job.
>
> They will be on the main stage at 09:15 on day one. Come and hear it from them.
>
> hackyourfuture.dk
>
> #CloudNativeDenmark #CND2026 #HackYourFuture #TechForGood #Copenhagen

**One ask for the organising team:** get a number and a face. "We funded N places in the 2027 cohort" converts far better than "profits go to charity", and the post-event donation post is much stronger with a photo of the handover.

---

## 10. Speaker promo videos: capture kit

You will meet a lot of these speakers at other conferences between now and November. A 30-second clip of a speaker explaining their own talk outperforms any card we can render, because it is the one thing the page cannot manufacture.

### Before you film

- **Pick a wall, not a view.** A plain wall in a corridor beats an expo floor. Backlight from a window is the one mistake you cannot fix afterwards.
- **Get close.** Phone at arm's length, or a clip-on mic. Audio is what makes it look professional or amateur; the picture is already fine.
- **Vertical, 9:16.** Shoot vertical and crop to 16:9 later if you need it. The reverse does not work.
- **Two takes. Never three.** By take three people are performing.

### The three questions

Ask one, use the best answer. All three are designed so the answer cannot be "yes, very excited".

1. What is the one thing you want people to walk out of your talk knowing?
2. What surprised you while you were preparing this?
3. Who should skip your talk?

Question three is the sleeper. It gets a laugh and it gets a genuinely useful answer.

Then ask for one clean line: *"See you at Cloud Native Denmark, 19 and 20 November in Copenhagen."*

Tell them to start on the answer. "We will cut the run-up, so just begin with the point." That saves you eight seconds of throat-clearing per clip, which is a quarter of the video.

### After you film

- **Burn in subtitles.** Most of LinkedIn watches muted.
- **Lower third for the first three seconds:** speaker name and talk title.
- **End card, 3–5 seconds:** logo, `19–20 November`, `Scandic Copenhagen`, `cloudnativedenmark.dk`. Render it once and reuse it on every clip.
- **File naming:** `promo-<lastname>-<event>-<YYYYMMDD>.mov`
- **Consent.** Get it on camera or in a message: their name, and that the clip may be used on Cloud Native Denmark's channels. It takes ten seconds and it settles the question permanently.

### Who to prioritise

Aim for eight to ten clips. That covers weeks 13 and 14 with spares. Prioritise two groups: speakers with large followings who will reshare, and speakers whose talk is hard to explain in a card.

**Best value:** Abdel Sghiouar, Adriana Villela, Josh Lee, Michael Coté, Paula Kennedy, Henrik Rexed, Marcus Noble, Thomas Vitale, Simon Schrottner, Juliano Costa, Imma Valls, Diana Todea, Gabriele Bartolini, Jessica Andersson.

**Hardest to explain in text, so most worth filming:** Lars Kruse (a lean coffee is impossible to sell on a card), Simon Schrottner (a party game and a Raspberry Pi), Karsten Nielsen (the whole point is watching a dead server become a node), Thomas Schuetz (the homelab).

Post them one a day in week 13 and, if you have enough, two in week 14.

---

## 11. Appendix

### Cross-posting

| Channel | What goes there |
|---|---|
| LinkedIn page | Everything. This is the primary channel and the plan above is written for it. |
| Bluesky and Mastodon | Same graphic, first two lines of the copy, one link. The CNCF maintainer crowd lives here and reshares generously. |
| X | Optional. Post it, do not invest in it. |
| Instagram | Live days only. Stories from the floor, not cards. |
| YouTube | Recordings from December, one keynote a week. |
| Meetup and CNCG Aarhus/Copenhagen | The 30-day and 7-day posts, plus the workshop posts. |

### Tagging checklist, every post

1. Every speaker in the session, by their LinkedIn profile.
2. Their employer, when the talk draws on that work — LEGO Group, Uber, Corti.ai, EDB.
3. The relevant CNCF project page — OpenTelemetry, Crossplane, CloudNativePG, Kyverno, Cilium.
4. Sponsors, on any post where they appear.
5. Hack Your Future, on any post that mentions the charity.

### Hashtag bank

Always: `#CloudNativeDenmark #CND2026`

Then two or three of: `#Kubernetes #CloudNative #PlatformEngineering #Observability #OpenTelemetry #DigitalSovereignty #SRE #DevEx #PostgreSQL #Crossplane #Copenhagen #TechForGood`

### Getting these into Canva

`.venv/bin/python graphics/build-canva-import.py` writes one HTML document per category to `graphics/out/canva-import/`, in both square and 4:5:

| File | Pages |
|---|---|
| `cnd-sessions.html` | 26 — the talk and workshop cards |
| `cnd-keynotes.html` | 6 |
| `cnd-countdowns.html` | 7 |
| `cnd-sponsors.html` | 13 — 11 sponsors plus the two tier honeycombs |
| `cnd-moments.html` | 10 — the 2025 photography, photos embedded as picture layers |
| `cnd-announcements.html` | 5 — schedule reveal and the four Hack Your Future cards |

**Import the HTML, never the PDF.** The PDF has no layers and Canva flattens it into one background image. It is also cropped: Chrome prints to its default paper size and the script does not set an `@page` box, so the bottom of a 1080-square page is cut. That only affects the PDF preview, and the HTML is the artefact that matters. The HTML arrives as native Canva elements: Space Grotesk and Inter are embedded as base64 woff2, every headline is a real text box somebody can retype, and the frame is real shapes rather than a screenshot. Verified on `cnd-sessions.html` — 26 pages, both fonts embedded, zero SVG data URIs (Canva drops the whole enclosing `<svg>` when it meets one, taking the artwork with it, which is why the script rasterises every asset).

Canva's `import-design-from-url` needs an already-public HTTPS URL and the script does not upload anywhere. Put the file somewhere on `cloudnativedenmark.dk` and hand Canva the URL, or use Canva > Uploads and File > Import directly.

One caveat I cannot test from here: a local render proving correct does not prove Canva accepts it. Import one document first and check the text is selectable before you import all five.

### Measuring it

Put a UTM on every ticket link so you can tell which post family sells:

`https://cloudnativedenmark.ticketbutler.io/en/e/cloud-native-denmark-26/?utm_source=linkedin&utm_medium=organic&utm_campaign=cnd26&utm_content=countdown-30`

Use `utm_content` values that match the asset name: `countdown-30`, `talk-pdb-trust`, `partner-hyf`, `meme-invoice`. At the end of the campaign you will know whether the memes sell tickets or only win impressions, which is worth knowing before you plan 2027.

The two numbers that matter each week: tickets sold, and reshares by speakers and sponsors. Impressions are a vanity metric on a page this size.

### Loose ends to close

- **The LinkedIn export you shared is the admin home feed, not the page's own post history.** It has no past Cloud Native Denmark posts in it, so nothing in this plan is calibrated against what actually performed. Export the page's own posts from the page analytics view — top posts by engagement over the 2025 campaign — and we can tune the mix, particularly the meme-to-card ratio.
- **No `tier-platinum` card exists.** With one Platinum sponsor it does not matter, but if a second signs, render it.
- **Gold is full at four; Platinum is capped at two and one is taken.** If you want to sell the second Platinum slot, that needs its own post, and the window closes around the 30-day mark when print goes to production. The prospectus page is live at `cloudnativedenmark.dk/sponsors`.
- **The sponsored keynote at 09:35 on day two has no name attached in the schedule export.** It needs a post of its own once the sponsor is confirmed.
- **Re-export after every card change.** Four fixes are still open above, and each one produces a new PNG that has to reach `CND26 Social Templates/` before it reaches LinkedIn. Worth doing all four in one pass and re-exporting the whole folder once.
- **Nothing in this plan covers paid promotion.** With a 500-seat venue and 90 days, organic plus speaker reshares should do it. Revisit at the 30-day mark if ticket sales are behind.
