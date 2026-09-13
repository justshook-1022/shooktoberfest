# Shooktoberfest — Product Brief

> **Design status:** This is a functional product brief, not a visual-design source. The approved site design is locked in `site/design-lock.json` to Vercel deployment `dpl_9EZcZh48DNhzz7fsiC3LWFSaYX7L`. Do not use the design-direction notes below to restyle the current site unless Justin explicitly requests a visual change.

## What this is

A single-event website for a private golf outing. Not a product, not a platform, not multi-tenant. One event, one course, one day. Every design and engineering decision should optimize for that day going smoothly, not for future extensibility.

**Event:** Shooktoberfest
**Date:** Friday, October 2, 2026
**Course:** Mt Prospect Golf Club, 600 S See-Gwun Ave, Mount Prospect, IL — par 70, played from a **custom mixed-tee routing** Justin selected hole by hole (8 Black, 5 Silver, 5 Gold, ~5,925 yds). Every hole's tee color must be visible on the score entry screen and the tee sheet, or half the field tees off from the wrong box.
**Format:** 2-person scramble, net scoring
**Field:** 32 golfers (16 teams), hard cap
**Entry:** $207/golfer — covers golf, $75 into the prize pot, food, drink, and a live band after the round
**Start:** Sequential, first tee 10:00 AM CT, groups every 10 minutes through 11:10 AM

## Who uses it

| Audience | Size | What they need |
|---|---|---|
| Golfers | 32 | Register and pay, find their tee time and partner, enter scores on the course, see where they stand |
| Spouses / guests | ~16 | Nothing to sign into. They're on the site to watch the leaderboard and see photos |
| Spectators at the event | unknown | Live leaderboard on a phone, no login |
| Administrator (Justin) | 1 | Everything else |

The single administrator matters. Every "who approves this" question has the same answer, so build for one person with full control and no approval flows.

## The three phases

The site does three different jobs at three different times, and they barely overlap. Treat them as three distinct products sharing one database.

**Phase 1 — Signup (now through late September).**
A golfer lands on a marketing page, registers themselves plus optionally their wife, pays $207 via Stripe, and receives confirmation. The site's job is to fill 32 spots and collect money. Nothing else is live yet — no teams, no tee times, no leaderboard.

**Phase 2 — The draw (once signups close).**
Justin sets everyone's course handicap, runs a random draw that pairs one low-handicap (A) player with one high-handicap (B) player, and assigns the 16 teams to the 8 tee groups. Players get an email: here's your partner, here's your tee time. The site flips from "register" to "you're in."

**Phase 3 — Event day (October 2).**
Scoring opens. One phone per team enters a score after each hole. The leaderboard updates live for everyone watching. Players upload photos, react to scores, and talk trash in comments. After the round Justin records the closest-to-pin winners, settles any playoff, and the site shows the final standings and the payout.

## Money

Pot is $75/golfer. At a full field that's $2,400.

| Bucket | Rule | At 32 players |
|---|---|---|
| Greenies | $50 to the individual closest to the pin on each of the 5 par-3s (holes 4, 7, 10, 12, 16) | $250 |
| Distributable | Pot minus greenies | $2,150 |
| 1st place team | 60% | $1,290 |
| 2nd place team | 30% | $645 |
| 3rd place team | 10% | $215 |

Greenies are awarded to a **person**, not a team. A player can win a greenie and also be on the winning team; that's intended.

The payout recalculates automatically off the actual paid count. If only 28 players register, the numbers scale down and the site should display the real figures, not the full-field ones.

## Scoring rules

These are settled. Do not reinterpret them.

- **Team handicap** = 35% of the lower course handicap + 15% of the higher, rounded to a whole number.
- **All handicaps are whole numbers.** No decimals anywhere in the UI or the database.
- **Strokes are allocated by hole difficulty.** A team with a handicap of 8 gets one stroke on the 8 hardest holes (stroke index 1–8), not a fractional stroke on every hole.
- **Ranking is by net-to-par, not cumulative net strokes.** This is critical and non-obvious — with a sequential start, teams are always at different hole counts. Cumulative strokes would rank whoever has played fewest holes first, inverting the leaderboard all day. Net-to-par is comparable at any moment and identical to net once everyone finishes.
- **Tie for 1st** is settled by a playoff hole after the round. Justin records the result; the site does not compute it.
- **Ties for 2nd and 3rd** are settled by countback: low net on 18, then 17, then 16, and so on.

## What success looks like

1. 32 people register and pay without Justin chasing anyone.
2. On October 2, all 16 teams enter scores from the course without a support question.
3. The leaderboard is correct and live all afternoon — including at 11:00 AM when half the field hasn't teed off.
4. Justin never has to touch SQL.

## What this is not

- Not multi-event or multi-year. If Justin runs it again in 2027, he can duplicate the project.
- Not a handicap service. Handicaps are entered by hand; there's no GHIN integration.
- Not a social network. Photos, reactions, and comments exist to make event day fun, not to be a feed people return to.
- Not a native app. Mobile web only.

## Design direction

The people using this are 32 adults standing on a golf course in October in the Chicago suburbs, mostly on phones, some in bright sun, some slightly drunk by hole 14. That's the brief.

**Priorities, in order:**

1. **Legible outdoors.** High contrast, large type, generous tap targets. Assume glare and one free hand.
2. **The leaderboard is the product.** On event day it should be the first thing on screen with no navigation required, showing position, team, thru, and net-to-par. Everything else is secondary.
3. **Score entry in under five seconds.** Big number stepper, one tap to save, immediate confirmation. No modals, no dropdowns, no "are you sure."
4. **Never lose an entered score.** Optimistic UI with retry on failure, and keep the value in the input until the save confirms. (Mt Prospect is a suburban Chicago course with normal LTE — a full offline-first sync engine is not warranted. Simple retry is.)

Avoid the generic AI-app look: cream background, high-contrast serif, terracotta accent. Ground the visual identity in something specific — an October golf outing in the Midwest, a scorecard, the course's own hole names (Principal's Nose, Redan, Punchbowl, Biarritz, Alps — they're printed on the real scorecard and are genuinely distinctive). Pick a direction and commit to it.

Content voice: dry and direct. This is a group of friends, not a corporate outing. Buttons say what they do. Errors say what broke and what to do next.
