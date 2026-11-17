/**
 * PP-002 regression tests: admission prices come only from admission wording; anything
 * unclear stays unknown. Fixtures are synthetic, several paraphrase real listing styles.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventPriceRange, priceFrom } from '../src/utils/pulse.ts';

const free = { priceNote: 'Free (per listing)', free: true, priceMin: 0, priceMax: 0 };

test('free parking (or other free extras) does not make a paid event free', () => {
  assert.deepEqual(priceFrom('Free parking in the garage. Tickets $15.'), { priceNote: '$15 (per listing)', priceMin: 15, priceMax: 15 });
  assert.deepEqual(priceFrom('Holiday Shopping Event.\nMembers save 10%. Free gift wrap with every purchase.'), {});
  assert.deepEqual(priceFrom('Free trolley loop between districts.'), {});
  assert.deepEqual(priceFrom('Gluten-free and sugar-free snacks available.'), {});
  assert.deepEqual(priceFrom('A free-form jam session for carefree musicians.'), {});
});

test('genuine free admission is recognised', () => {
  for (const t of [
    'Free and open to the public.',
    'Galleries open across seven districts. Free trolley loop. Free and open to the public.',
    'This free event will be held in the main hall.',
    'This meetup is free of charge and open to all.',
    'Reserve your Free Seat Now',
    'FREE Yoga in the Park.\nBring a mat.',
    'Admission is free.',
    'Play any of our open play games for free!',
    'No cover.',
  ])
    assert.deepEqual(priceFrom(t), free, t);
});

test('free with admission, or free for some visitors, is not free', () => {
  assert.deepEqual(priceFrom('Tours are free with museum admission.'), {});
  assert.deepEqual(priceFrom('Free for members; $20 general admission.'), { priceNote: '$20 · free for some (per listing)', priceMin: 20, priceMax: 20 });
  assert.deepEqual(priceFrom('Kids under 12 free, adults $15.'), { priceNote: '$15 · free for some (per listing)', priceMin: 15, priceMax: 15 });
  assert.deepEqual(priceFrom('Members free.'), { priceNote: 'Free for some visitors (see listing)' });
  assert.deepEqual(priceFrom('Free for MFA members; $15 non-members.'), { priceNote: '$15 · free for some (per listing)', priceMin: 15, priceMax: 15 });
});

test('explicit admission amounts and ranges are kept', () => {
  assert.deepEqual(priceFrom('Tickets $15–$20.'), { priceNote: '$15–$20 (per listing)', priceMin: 15, priceMax: 20 });
  assert.deepEqual(priceFrom('Cost: $10 to $15, sliding scale.'), { priceNote: '$10–$15 (per listing)', priceMin: 10, priceMax: 15 });
  assert.deepEqual(priceFrom('Entry Fee: $5, $10 for Tier 3 & 4 Tables.'), { priceNote: '$5–$10 (per listing)', priceMin: 5, priceMax: 10 });
  assert.deepEqual(priceFrom('Tickets are $25 in advance, $30 day of show.'), { priceNote: '$25–$30 (per listing)', priceMin: 25, priceMax: 30 });
  assert.deepEqual(priceFrom('Registration $12.50 per person.'), { priceNote: '$12.50 (per listing)', priceMin: 12.5, priceMax: 12.5 });
});

test('amounts that are not admission are ignored', () => {
  assert.deepEqual(priceFrom('$5 parking on site. Tickets $12.'), { priceNote: '$12 (per listing)', priceMin: 12, priceMax: 12 });
  assert.deepEqual(priceFrom('Show your student ID for $5 off. Tickets $25.'), { priceNote: '$25 (per listing)', priceMin: 25, priceMax: 25 });
  assert.deepEqual(priceFrom('Suggested donation $10.'), {});
  assert.deepEqual(priceFrom('$10 suggested donation at the door.'), {});
  assert.deepEqual(priceFrom('Bring $20 for the food trucks.'), {});
  assert.deepEqual(priceFrom('Drink specials: $4 beers all night.'), {});
  assert.deepEqual(priceFrom('Raffle prizes worth $500.'), {});
});

test('a lone amount is the price; several unexplained amounts are unknown', () => {
  assert.deepEqual(priceFrom('Karaoke night. $8 for unlimited songs.'), { priceNote: '$8 (per listing)', priceMin: 8, priceMax: 8 });
  assert.deepEqual(priceFrom('Bring $10. Or $20.'), {});
});

test('real-world phrasings from the branch price report (paraphrased)', () => {
  assert.deepEqual(priceFrom('Admission: FREE for qualifying local heroes plus one guest.'), { priceNote: 'Free for some visitors (see listing)' });
  assert.deepEqual(priceFrom('Free museum admission for qualifying community heroes this month.'), { priceNote: 'Free for some visitors (see listing)' });
  assert.deepEqual(priceFrom('The live competition is free. Finalists compete for a $5,000 commissioned portrait.'), free);
  assert.deepEqual(
    priceFrom('Trivia tickets are $5 per person. Gallery admission $16 for non-members. Not yet a member? Enjoy free admission, special access and discounts.'),
    { priceNote: '$5–$16 · free for some (per listing)', priceMin: 5, priceMax: 16 },
  );
  assert.deepEqual(priceFrom('Adults are free with MFA membership or general admission.'), {}, 'included with membership or admission — not free');
  assert.deepEqual(priceFrom('Gallery concert. $22 purchase tickets ahead.'), { priceNote: '$22 (per listing)', priceMin: 22, priceMax: 22 });
  assert.deepEqual(priceFrom('Get the $20 Eat & Play Deal: three tacos and a draft.'), {});
  assert.deepEqual(priceFrom('Enjoy $8 Unlimited Play on our arcade cabinets all night.'), {});
  assert.deepEqual(priceFrom('This event is free for everyone, members and non-members alike.'), free);
  assert.deepEqual(
    priceFrom('Local Heroes Month | Free Admission + One Guest.\nWe thank local heroes with free museum admission for qualifying community heroes plus one guest.'),
    { priceNote: 'Free for some visitors (see listing)' },
  );
  assert.deepEqual(priceFrom('Ticket Price: $300 per person. Open bar with complimentary chef-curated stations.'), { priceNote: '$300 (per listing)', priceMin: 300, priceMax: 300 });
  assert.deepEqual(priceFrom('Members $25, non-members $35. Enjoy free admission, special access, discounts at the shop and more.'), { priceNote: '$25–$35 · free for some (per listing)', priceMin: 25, priceMax: 35 });
  assert.deepEqual(priceFrom('Complimentary admission for all guests.'), free);
});

test('mixed free and paid admission is reported as unclear, not as free', () => {
  assert.deepEqual(priceFrom('Free admission. Workshop registration $25.'), { priceNote: 'Free and paid options (see listing)' });
});

test('no price wording means unknown', () => {
  assert.deepEqual(priceFrom('Join us for an evening of music.'), {});
  assert.deepEqual(priceFrom(''), {});
});

test('budget range uses structured fields, with a fallback for older data', () => {
  assert.deepEqual(eventPriceRange({ free: true }), [0, 0]);
  assert.deepEqual(eventPriceRange({ priceMin: 5, priceMax: 10, priceNote: '$5–$10 (per listing)' }), [5, 10]);
  assert.deepEqual(eventPriceRange({ priceNote: '$15–$20 (per listing)' }), [15, 20], 'pulse.json from before this change');
  assert.equal(eventPriceRange({ priceNote: 'Free and paid options (see listing)' }), null);
  assert.equal(eventPriceRange({}), null);
});

// ─── Review revisions (independent review of #16) ─────────────────────
/** What the Pulse "cheap" filter does: an unknown range never counts as ≤ $25. */
const cheap = (t: string) => (eventPriceRange(priceFrom(t))?.[1] ?? Infinity) <= 25;

test('review fixture: "Free cancellation…" is a policy, not free admission → unknown', () => {
  assert.deepEqual(priceFrom('Free cancellation up to 24 hours before the event.'), {});
  assert.deepEqual(priceFrom('Free refunds and free returns on merch.'), {});
});

test('review fixture: "not free" is never classified as free', () => {
  assert.deepEqual(priceFrom('This event is not free.'), {});
  assert.deepEqual(priceFrom("Sorry, it isn't free this year."), {});
  assert.equal(priceFrom('Not free: $10 at the door.').free, undefined);
});

test('review fixture: free admission with RSVP stays free and keeps the RSVP note', () => {
  assert.deepEqual(priceFrom('Free admission with RSVP.'), { priceNote: 'Free · RSVP (per listing)', free: true, priceMin: 0, priceMax: 0 });
  assert.equal(priceFrom('Free. Registration required.').priceNote, 'Free · RSVP (per listing)');
});

test('review fixture: a stated mandatory fee is added to the ticket → $28, not "under $25"', () => {
  const p = priceFrom('Tickets $20. Mandatory service fee $8.');
  assert.deepEqual(p, { priceNote: '$28 incl. $8 fees (per listing)', priceMin: 28, priceMax: 28 });
  assert.equal(cheap('Tickets $20. Mandatory service fee $8.'), false);
  assert.equal(priceFrom('Tickets $20 plus $8 service fee.').priceMin, 28);
});

test('review fixture: a free perk at a paid event → the admission price', () => {
  assert.deepEqual(priceFrom('Tickets $25. Free photo booth.'), { priceNote: '$25 (per listing)', priceMin: 25, priceMax: 25 });
});

test('fees with no amount, or on several tiers: total uncertain, never "cheap"', () => {
  const plus = priceFrom('Tickets $20 + fees.');
  assert.deepEqual(plus, { priceNote: '$20 + fees (see listing for total)', priceMin: 20 });
  assert.equal(eventPriceRange(plus), null);
  assert.equal(cheap('Tickets $20 + fees.'), false);
  assert.equal(cheap('Tickets $15 plus taxes and fees.'), false);
  const tiers = priceFrom('Adults $20, kids $10. Service fee $4.');
  assert.equal(tiers.priceMax, undefined);
  assert.equal(cheap('Adults $20, kids $10. Service fee $4.'), false);
});

test('a fee already included is not added again; a registration fee is the price itself', () => {
  assert.equal(priceFrom('Tickets $20 (service fee $8 included).').priceMax, 20);
  assert.deepEqual(priceFrom('$15 registration fee.'), { priceNote: '$15 (per listing)', priceMin: 15, priceMax: 15 });
});

test('owner decision preserved: a lone uncued dollar amount is the price', () => {
  assert.deepEqual(priceFrom('Join us Saturday. $12.'), { priceNote: '$12 (per listing)', priceMin: 12, priceMax: 12 });
});
