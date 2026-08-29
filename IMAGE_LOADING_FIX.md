# Catalogue image loading fix (V3.4)

The production catalogue contains mostly suffixed LEGO set numbers such as `42228-1` and `71049-4`. The previous fallback appended another `-1`, producing invalid image URLs such as `42228-1-1.jpg`.

V3.4 normalizes the Brickset image key so suffixed set numbers remain unchanged and unsuffixed set numbers receive the default `-1` inventory suffix. The first eight catalogue images are eager/high-priority, below-the-fold images remain lazy, Brickset and the image proxy are preconnected, a fallback chain is used, and the service worker caches visited set images across sessions.

No paid image service or new paid infrastructure is enabled by this change.
