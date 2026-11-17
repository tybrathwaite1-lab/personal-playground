import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_EXPERIENCES as X } from '../src/data/experiences.ts';
import { SEED_PLACES as P } from '../src/data/places.ts';
import * as PL from '../src/utils/plan.ts';

test('plans respect hours, area, weather and never duplicate', () => {
  let made = 0;
  for (const start of ['morning', 'afternoon', 'evening'] as const)
    for (const length of ['short', 'half', 'full'] as const)
      for (const area of ['anywhere', 'stpete', 'tampa'] as const)
        for (const indoorDay of [false, true]) {
          const o = { ...PL.DEFAULT_PLAN_OPTIONS, start, length, area, indoorDay };
          const p = PL.buildPlan(X, P, o);
          if (!p) continue;
          made++;
          const ex = p.stops.filter((s) => s.kind === 'experience');
          const ids = ex.map((s) => s.experience!.id);
          assert.equal(new Set(ids).size, ids.length);
          for (const s of ex) {
            if (indoorDay) assert.ok(!s.experience!.environments.every((e) => e === 'outdoors'));
            if (s.place) assert.ok(PL.placeInArea(s.place, area));
            const slot = s.startsAt < 720 ? 'morning' : s.startsAt < 1020 ? 'afternoon' : 'evening';
            if (s.experience!.when) assert.ok(s.experience!.when.includes(slot), `${s.experience!.id} at ${slot}`);
          }
        }
  assert.ok(made > 40);
});
