# BrickCircle V3 UX architecture

V3 consolidates the former layered V2.x frontend into one product model and one runtime.

## Primary information architecture

There are exactly five primary destinations on desktop and mobile:

1. Home
2. Browse
3. My Sets
4. Matches
5. Exchanges

Wishlist is a tab inside **My Sets**. Requests, meetup, active temporary swap, return and completed history are all inside **Exchanges**. Messages and notifications are utility surfaces in the top bar rather than primary destinations.

## Match Ready activation

The signed-in Home dashboard measures one shared activation model:

- profile and home city complete
- at least 3 owned sets
- at least 2 owned sets marked exchangeable
- at least 3 wishlist sets
- at least 1 local AFOL referral

The dashboard always recommends the next incomplete action.

## Canonical exchange lifecycle

V3 intentionally exposes only the local, in-person lifecycle:

`Request → Accept → Plan meetup → Safety acknowledgement → Arrive → Inspect → Confirm handoff → Temporary swap → Return meetup → Inspect return → Confirm return → Review`

The previous deposit, shipping and return-shipping interface is not part of V3. Existing database columns remain for compatibility, but V3 proposals explicitly use a zero proposed deposit and never call the legacy `advance_exchange` RPC.

## Runtime ownership

`v2.html` loads only the active app runtime and supporting utilities:

- `app-v3.css`
- `locations-v3.js`
- `app-v3.js`
- `v3-ui-polish.js`
- analytics / observability
- Supabase browser SDK

`app-v3.js` owns the Supabase client, session state, router, navigation, page rendering and exchange UX. `v3-ui-polish.js` contains only small presentation/accessibility behavior and delegates routing back to the V3 router.

The superseded V2/V2.2/V2.3/V2.4/V2.5 patch scripts were deleted from the V3 branch after their needed behavior was incorporated. Git history remains the archive.

## PWA

The service worker caches the V3 shell. Install prompts are shown only after a member has started getting value from BrickCircle rather than on the public acquisition page. PWA shortcuts are **My Sets**, **Matches** and **Exchanges**.

## Safety and trust

V3 is currently an 18+ local exchange community. Members are encouraged to meet in public, inspect sets before handoff, avoid unnecessary advance payment, and complete the mutual return confirmation workflow. New members display as **New collector** until they have real completed-exchange reviews.
