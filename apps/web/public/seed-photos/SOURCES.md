# Seed placeholder photos — sources and licences

Every file in this directory is either CC0 (public domain dedication) or provided directly
by this project's own maintainer. None depicts a real Opika shelter or a real Opika animal
— `docs/standing-constraints.md`'s "No real shelter data in the repository" rule is about
this repo's *own* shelters and animals being fictional, and these are placeholder photos
for a fictional seed corpus, not photographs sourced from any of them.

CC0 does not require attribution, but it's recorded here anyway — for provenance, and so a
later reviewer can verify the licence claim rather than take it on faith, per this repo's
own "verify, don't assume" standard (`docs/standing-constraints.md`).

Sourced via [Openverse](https://openverse.org) (`api.openverse.org`, `license=cc0`), which
indexes the licence Flickr itself reports for each photo; the `license_url` column below is
the canonical Creative Commons deed for CC0 1.0, the same for every entry.

| File | Title | Creator | Flickr source | Licence |
|---|---|---|---|---|
| `dog-1.jpg` | "Doggy fun at the beach" | Lottie's pets & stuff | https://www.flickr.com/photos/36943025@N07/16174686045 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `dog-2.jpg` | "Dominoe And the Apartment" | cogdogblog | https://www.flickr.com/photos/37996646802@N01/4826185758 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `dog-3.jpg` | "Beautiful Ritta" | Lottie's pets & stuff | https://www.flickr.com/photos/36943025@N07/4853534151 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `dog-4.jpg` | "2017/365/234 Biking is Hard Work" | cogdogblog | https://www.flickr.com/photos/37996646802@N01/35940625783 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `dog-5.jpg` | (untitled, a bull terrier) | Provided directly by this project's maintainer | — | Used with the owner's permission |
| `cat-1.jpg` | "Welcome to Our Family, Salvia" | andymiccone | https://www.flickr.com/photos/129822560@N05/29525568580 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `cat-2.jpg` | "The dreamer" | Lottie's pets & stuff | https://www.flickr.com/photos/36943025@N07/18363988709 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `cat-3.jpg` | "Theme day: Tired" | Greenville, SC Daily Photo | https://www.flickr.com/photos/120143184@N05/47943128917 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `cat-4.jpg` | "Boy cat" | sarahstierch | https://www.flickr.com/photos/7633518@N08/54079444236 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

## Why these nine, out of a much larger candidate pool

Curated by hand from ~40 CC0-licensed candidates fetched via Openverse, not taken as the
first N results. Rejected, and why — recorded so the criteria are visible for whoever
picks the next batch, not just applied silently:

- **Any photo showing a real shelter's or rescue's branding, or a real government animal
  services department** (a t-shirt reading a specific humane society's name; a Flickr
  account whose stream reads as an active shelter's own adoption-listing photos; a county
  animal-services account). Not a licence problem — CC0 permits reuse — but a real shelter's
  real adoptable animal has no business standing in for a fictional Opika listing, for the
  same reason `docs/standing-constraints.md`'s "no real shelter data" rule exists.
- **Any photo with a person's face as a subject**, not incidental background. These are
  meant to represent an *animal* on an adoption card; a stranger's identifiable face in
  that slot is a real person's likeness used for something they didn't picture when they
  released the photo CC0.
- **Collages, watermarks, decorative photo-app frames.** Would render as visibly wrong on
  a card designed for one clean photo.
- **Wildlife, or an image that's actually a photo of an empty parking lot.** Yes, one
  candidate ("The Story That is Not Here") was that, literally — its own title should have
  been the warning.
- **Vintage/archival portraits and vector-art "cat portrait clipart"/"drawing" results**
  that also matched the search terms — wrong register entirely for a modern adoption
  listing.

## Aspect ratios, deliberately not uniform

| File | Dimensions | Ratio (w/h) |
|---|---|---|
| `cat-1.jpg` | 1024×490 | 2.09 (wide landscape) |
| `cat-3.jpg` | 1024×683 | 1.50 (landscape) |
| `cat-2.jpg` | 1024×740 | 1.38 (landscape) |
| `dog-1.jpg` | 1024×768 | 1.33 (landscape) |
| `dog-4.jpg` | 1024×768 | 1.33 (landscape) |
| `dog-3.jpg` | 1023×782 | 1.31 (landscape) |
| `dog-2.jpg` | 766×1024 | 0.75 (portrait, close to the design's 4:5) |
| `cat-4.jpg` | 768×1024 | 0.75 (portrait, close to the design's 4:5) |
| `dog-5.jpg` | 387×516 | 0.75 (portrait, close to the design's 4:5) |

Every card renders its photo through a fixed CSS box (`aspect-[4/5]` vertical /
`w-30`-fixed-width horizontal, `object-cover` — `apps/web/src/features/gallery/
AnimalCard.tsx`), so a source photo whose own ratio doesn't match the slot is the normal
case, not an edge case — these nine exist specifically so that cropping path renders for
real during review, instead of every source image happening to already be the target shape.

## EXIF stripped

Every file had its EXIF segment (APP1) removed before being committed — one original
carried GPS coordinates, which have no business surviving into a publicly served file
regardless of the photo's own licence.
