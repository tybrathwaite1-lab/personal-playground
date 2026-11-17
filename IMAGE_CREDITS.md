# Image credits

Every photograph in Personal Playground is free-licensed. Photos are downloaded and converted to WebP during the build (`scripts/images/fetch.ts`) and served from the app itself.

All current images are **illustrative** mood photos and are labelled that way in the app. No image is presented as a photo of a specific venue. Real venue photos will only be added when the place is correctly identified and the license allows it (e.g. Wikimedia Commons under CC BY / CC BY-SA, with attribution here).

| Image | Photographer | License | Source | Used for |
|---|---|---|---|---|
| Crates and shelves of vinyl records in a record store in Rotterdam | Dick Hoogerdijk | [Unsplash License](https://unsplash.com/license) | [unsplash.com](https://unsplash.com/photos/a-record-store-filled-with-lots-of-records-mI80ylVcd20) | record, vinyl, album, sampling |
| A narrow street in Akihabara, Tokyo, at night under neon signs | mos design | [Unsplash License](https://unsplash.com/license) | [unsplash.com](https://unsplash.com/photos/a-narrow-city-street-at-night-with-people-walking-on-the-sidewalk-3WyDK5E8ACA) | night, neo-noir, cyberpunk, film |
| A row of lit arcade cabinets with stools in a dark room | Matt & Chris Pua | [Unsplash License](https://unsplash.com/license) | [unsplash.com](https://unsplash.com/photos/turned-on-arcade-machines-with-stools-_aSOc5RT-8U) | arcade, gaming, fighting game, retro |
| Close-up of a black Raspberry Pi mini computer on a table | Jainath Ponnala | [Unsplash License](https://unsplash.com/license) | [unsplash.com](https://unsplash.com/photos/a-close-up-of-a-raspberry-board-on-a-table-jvHymbpto1E) | raspberry, technology, diy, smart home |
| A narrow lane with every wall covered in graffiti and street art (Hosier Lane, Melbourne) | Dominic Kurniawan Suryaputra | [Unsplash License](https://unsplash.com/license) | [unsplash.com](https://unsplash.com/photos/a-narrow-alleyway-with-graffiti-on-the-walls-2q2eSpt2cf8) | graffiti, street art, mural, lettering |
| A stack of comic books beside a mug of coffee | Rahul Mishra | [Unsplash License](https://unsplash.com/license) | [unsplash.com](https://unsplash.com/photos/stack-of-comic-books-next-to-a-mug-of-coffee-lBwsXs4T8jo) | comic, manga, graphic novel, illustration |
| A group of people around a table playing a board game | Derek Lee | [Unsplash License](https://unsplash.com/license) | [unsplash.com](https://unsplash.com/photos/a-group-of-people-playing-a-board-game-IaWFSeYMLek) | tabletop, game night, small gatherings, friends |
| A mermaid-shaped map marker sculpture on a beach in St. Petersburg, Florida | Annette Batista Day | [Unsplash License](https://unsplash.com/license) | [unsplash.com](https://unsplash.com/photos/IxirSFonSgA) | walking, waterfront, beach, st. petersburg |

Licenses were checked on each photo's page on 2026-11-17; all are under the free Unsplash License (not Unsplash+). The Unsplash License allows free use without permission; credit is given anyway.

To add an image: add an entry to `src/data/images.ts` with its download URL, source page, credit, license, alt text and the subjects/tags it illustrates, then add a row here. The next build fetches and converts it. If a download fails, the app shows a typographic placeholder instead.
