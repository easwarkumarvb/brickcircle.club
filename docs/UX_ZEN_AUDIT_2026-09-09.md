# BrickCircle Zen UX Audit — 2026-09-09

## Goal
Make BrickCircle understandable to a first-time collector within seconds, while preserving the existing catalogue, matching, exchange, trust, persistence, and notification behavior.

## Core product idea
A first-time user only needs to understand three human actions:

1. **Own** — add a LEGO set you physically own.
2. **Want** — save a LEGO set you want to experience.
3. **Exchange** — when another nearby collector wants yours and you want theirs, BrickCircle reveals a mutual match and the two collectors can arrange a temporary in-person exchange.

**Match is a system outcome, not another task the user must learn.**

## Audit findings

### 1. The same concept is explained too many times
The signed-out home currently contains a hero explanation, an exchange story, a four-step workflow, a reciprocal-match example, a six-item trust grid, and a final CTA. Signed-in users then see a dashboard hero, readiness score, five-item checklist, three-step guide, reassurance strip, dashboard cards, plus a second first-match coach injected by `phase-2f-first-match.js`.

**Impact:** repetition increases perceived complexity. First-time users have to decide which explanation is canonical.

**Change:** one explanation per screen, with progressive disclosure for secondary information.

### 2. “Match” is presented as work the user must do
The repeated `Own → Want → Match → Exchange` language makes matching feel like a fourth task.

**Impact:** the user has to understand an internal mechanism before taking a simple first action.

**Change:** teach `Own → Want → Exchange`; describe a mutual match as something BrickCircle finds automatically.

### 3. Signed-in Home behaves like an operations dashboard too early
Readiness percentage, checklist, workflow guide, trust strip, reciprocal-match count, exchange activity, and city liquidity are all visible together.

**Impact:** new users see metrics before they have built enough data for those metrics to be useful.

**Change:** Home becomes a single **Next step** card until the first-match setup is complete. Secondary dashboard data becomes visible only after the user is ready.

### 4. Two competing first-match coaches exist
`app-v3.js` already renders guided progress, while `phase-2f-first-match.js` injects another coach using a MutationObserver.

**Impact:** duplicate calls to action and inconsistent thresholds can produce conflicting guidance.

**Change:** stop loading the Phase 2F coach and replace the duplicate guidance with one lightweight Zen focus layer.

### 5. Catalogue discovery is valuable but too dominant
The broad-catalogue positioning card, catalogue statistics, popular sets, 16 iconic-set cards, discovery-group chips, filters, search guidance, catalogue grid, missing-set note, and pagination all compete for attention.

**Impact:** a user who simply wants to add a Ferrari or McLaren set has to scan a large amount of supporting content.

**Change:** Search is primary. Iconic discovery remains available behind a single **Explore iconic sets** progressive-disclosure control. Catalogue scale messaging is removed from the primary interaction path.

### 6. “My Sets” mixes an ownership list with readiness language
The screen shows a Match Ready score, Owned/Wanted tabs, a warning about exchangeability, status pills, completeness, condition, and row actions.

**Impact:** users can mistake “Match Ready” for a requirement or rating.

**Change:** call the two lists simply **Owned** and **Wanted**. Keep the exchangeability control but explain it in one sentence.

### 7. Reciprocal-match score adds unnecessary ambiguity
A reciprocal match is already binary: both collectors want what the other can offer. Showing a “% fit” suggests a ranking model users need to understand.

**Impact:** users may question why a mutual match is 88% rather than 100%.

**Change:** hide the fit percentage in the Zen interface; foreground the two sets and the primary action.

### 8. Exchange proposal copy is overly procedural
The proposal modal explains the trust model, duration, message, and a long next-step sequence before the user has committed.

**Impact:** a simple proposal feels like a multi-stage contract.

**Change:** shorten the modal to duration + optional message + one concise next-step line.

### 9. Visual hierarchy is too “dashboard-like”
Multiple gradients, shadows, pills, cards, stats, badges, and dense boxed sections create visual activity.

**Impact:** users must parse decoration before task hierarchy.

**Change:** warm neutral background, white surfaces, hairline borders, almost no shadows, one dark primary button, generous whitespace, fewer pills, and calmer navigation.

## Zen interaction rules

1. **One primary action per screen.**
2. **Show the next decision, not the whole system.**
3. **Progressive disclosure for inspiration, metrics, and advanced details.**
4. **Use human language:** Owned, Wanted, Mutual match, Start exchange.
5. **Do not expose internal scoring unless it changes the user's decision.**
6. **Trust copy appears at the moment it matters, not everywhere.**
7. **Preserve all underlying data and safety behavior.** This refactor is presentation-only.

## New first-time journey

### Signed out
Hero → three-step explanation → one CTA.

### Signed in, no owned sets
Home says: **Add a LEGO set you own.** → Discover.

### Has owned sets, insufficient wanted sets
Home says: **Choose what you want to experience next.** → Discover.

### Has owned/wanted sets, nothing exchangeable
Home says: **Choose a set to offer for exchange.** → Owned.

### Ready, no reciprocal match
Home says: **You are ready. BrickCircle is looking for a mutual match.** → Discover / Matches.

### Reciprocal match exists
Matches foregrounds the two sets and **Start exchange**.

### Exchange underway
Exchanges is the single home for request → meetup → handoff → return.

## Scope and safety
- No Supabase schema changes.
- No RLS changes.
- No matching-engine changes.
- No collection/wishlist persistence changes.
- No exchange-state-machine changes.
- No notification changes.
- Existing admin UX remains untouched.
