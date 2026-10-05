# Collector showcase design preview

Open `/visual-prototype.html#home`, `/visual-prototype.html#browse` or `/visual-prototype.html#messages` on this branch's deployment preview. Home has signed-out and signed-in states; Messages requires an account and an existing conversation.

The preview uses the current application runtime. The canonical `/` and `/v2.html` keep their current design. All new CSS is scoped to `html.bc-collector-preview`; preview pages are marked `noindex,nofollow`.

The visual system combines white cards and cool grey backgrounds with a charcoal and yellow landing hero, red discovery actions, blue conversations, larger set images, wrapped category controls, visible focus rings and reduced-motion support. Mobile set cards retain two columns with stacked 44px actions. No new production dependency, font, generated image, backend or application logic is introduced.

Review Home, signed-in dashboard, Find Sets, detail dialogs and Messages at 320px, 390px and desktop widths before approving wider rollout. The isolated collector-preview tests check category selection, details, message sending, mobile back navigation, document overflow and separation from the canonical app. Existing messaging tests continue to cover readonly exchanges and failed sends.

Local static checks completed. Browser verification is pending cloud CI and visual review; the scratch runtime has no installed browser. Do not treat this prototype as a production rollout approval.
