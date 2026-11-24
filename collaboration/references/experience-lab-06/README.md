# Experience Lab 06: interaction reference

**What this is.** The primary interaction reference for [Creative Blueprint V2](../../CREATIVE_BLUEPRINT_V2.md) (blueprint §16). It records what the owner experienced in the prototype, so engineering and review can work from the same picture.

**What this is not.** It is not a specification, and it is not production code.

- The prototype was built in ChatGPT and was never committed.
- The images here were reconstructed afterwards by ChatGPT, from the interactive prototype (2026-11-24). They are not screenshots of it.
- The image slots are deliberately labelled placeholders: the prototype fetched its imagery on the fly, and that imagery couldn't be exported.

Exact copy, layout, data structures and the graph drawing are **not** binding requirements. The blueprint is authoritative.

## The images

| File | Shows |
|---|---|
| [01-desktop-cover.png](01-desktop-cover.png) | The desktop cover. It shows the composition: lead, supporting discoveries, a paired spread, an interruption, three small discoveries, an interlude and a finite ending. |
| [02-discovery.png](02-discovery.png) | A discovery page (Modal Soul). It shows the order: image, then title and context, then *Keep this*, *Look closer*, the connections, and the invitation to explore. |
| [03-nearby-constellation.png](03-nearby-constellation.png) | The constellation opened around the current discovery (the "nearby" view). |
| [04-wider-constellation.png](04-wider-constellation.png) | The wider view, which adds a second ring of relationships (dashed). |
| [05-mobile-cover.png](05-mobile-cover.png) | The mobile cover: the same sequence in a single column, with a strong visual lead and the pairs kept side by side. |

## The visitor flow it established

Every step after the first is optional.

1. Arrive at a visually expressive cover, with no onboarding.
2. Notice something, through its image, its type or how it is presented.
3. Open a discovery.
4. Read concise editorial context.
5. Optionally *Look closer*, for a deeper observation.
6. Under "There are connections here.", see a few related discoveries, each with a one-line reason for the relationship.
7. Optionally open the Living Constellation.
8. Expand it into the wider neighbourhood.
9. Move freely: recentre on another discovery, retrace the path, keep something, or return to the cover.

An actual path from the owner's evaluation:

> Samurai Champloo → Graffiti handstyles → Nujabes / *Modal Soul* → Miles Davis / *Kind of Blue* → Brian Eno / *Music for Airports* → Dieter Rams / industrial design

It ran from animation to industrial design without a predetermined route.

## The cover

The illustrative issue contained:

- a lead: Japanese game centres;
- supporting discoveries: *Modal Soul* and graffiti handstyles;
- a paired spread: the Dreamcast and the Nakagin Capsule Tower;
- a deliberate interruption: deep-ocean bioluminescence, set on its own dark surface;
- three small discoveries: handmade ceramics, Dieter Rams, Kawase Hasui;
- an editorial interlude: "Not everything interesting needs to be useful.";
- a finite ending: "Until next time."

The compositions vary with the content, rather than repeating one card grid.

## The discovery page

1. A prominent image or object.
2. A kicker (a short topic label), the title, the creator or subject with a year, and a sentence or two of context.
3. **Keep this**, a simple save.
4. **Look closer**, an optional deeper observation that expands in place.
5. **There are connections here.**: a few related discoveries, each with a short reason, for example:
   - *Samurai Champloo*: "Nujabes helped shape its soundtrack";
   - *Kind of Blue*: "The musical vocabulary behind jazz-inflected hip-hop";
   - Handstyles: "A shared spirit of remix and personal expression."
6. **Explore the wider constellation**, which opens the constellation in place:
   - the current discovery sits in the centre;
   - its direct relationships sit on an inner ring;
   - *Expand* adds the second-degree neighbourhood on a dashed outer ring;
   - selecting any node recentres the constellation there;
   - the prompt reads "Follow anything that catches your eye".
7. A simple trail lets the visitor retrace their steps.

The prototype also had an unrestricted **Surprise me**, a browsable **Collection**, temporary saves and three appearance options.

## Caveats from the prototype

These were recorded at the sprint closeout.

- Its saves were temporary.
- Its graph layout was simplified.
- Its mobile behaviour was simulated in the prototype, not tested on real devices.
- Its sample content, relationships and imagery are illustrative and unverified. Some relationships in the images are editorial interpretations, which the blueprint (§07) requires to be distinguishable from documented facts.
- The owner's absorption in it is encouraging qualitative evidence, not proof of general usability (blueprint §15, and Stage 6 of the proposed sequence).

The engineering reading of these references is in [ARCHITECTURE_ASSESSMENT_V2](../../ARCHITECTURE_ASSESSMENT_V2.md).
