# Approved collector showcase rollout

Approved for production rollout on 5 October 2026. The normal `/` and `/v2.html` entry pages now load `collector-ux.css` with the `bc-collector` class. The design preview remains available at `/visual-prototype.html` and is marked `noindex,nofollow`.

The visual system combines white cards and cool grey backgrounds with a charcoal and yellow landing hero, red discovery actions, blue conversations, larger set images, wrapped category controls, visible focus rings and reduced-motion support. Mobile set cards retain two columns with stacked 44px actions. Dialogs appear above floating match notifications.

No new production dependency, font, generated image, backend or application logic is introduced. Release `20261005-collector-ux-r1` includes the shared stylesheet in the shell manifest and synchronizes entry pages and service-worker asset versions.

The isolated collector tests exercise production routes at 320px, 390px and desktop widths: category selection, set details, sending messages, mobile Back navigation, document overflow and stylesheet activation. The same design passed the three-browser functional suites in preview before approval. The rollout head is checked by the full CI and beta gates before merge.
