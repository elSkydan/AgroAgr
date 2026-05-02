'use strict';

/**
 * Pricing rules live in server/services/pricingService.js (source of truth).
 * Out-of-city surcharge is fixed 800 UAH. Service-specific minimum areas apply.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const {
  calcPrice,
  roundArea,
  OUT_OF_CITY_SURCHARGE_UAH,
} = require('../server/services/pricingService.js');

const cityLegacy = { delivery_price: 200 };
const cityFree = { delivery_price: 0 };

test('roundArea snaps to 0.5 sotka steps', () => {
  assert.strictEqual(roundArea(2.1), 2.5);
  assert.strictEqual(roundArea(2.25), 2.5);
  assert.strictEqual(roundArea(3), 3);
});

test('ogorod: flat up to 3 sot., then per-sotka with mins', () => {
  assert.strictEqual(calcPrice('ogorod', 3, false, cityFree), 1700);
  assert.strictEqual(calcPrice('ogorod', 4, false, cityFree), 1700);
  assert.strictEqual(calcPrice('ogorod', 6, false, cityFree), 1800);
});

test('ogorod: below minimum area rejected (after rounding)', () => {
  assert.throws(() => calcPrice('ogorod', 2.4, false, cityFree), /Area must be between 3/);
});

test('celina: rate with minimum', () => {
  assert.strictEqual(calcPrice('celina', 3, false, cityFree), 1800);
  assert.strictEqual(calcPrice('celina', 4, false, cityFree), 2400);
});

test('out_of_city adds fixed surcharge (800 UAH)', () => {
  assert.strictEqual(calcPrice('ogorod', 3, true, cityLegacy), 1700 + OUT_OF_CITY_SURCHARGE_UAH);
  assert.strictEqual(OUT_OF_CITY_SURCHARGE_UAH, 800);
});

test('mowing: per-sotka with minimum area 10', () => {
  assert.strictEqual(calcPrice('mowing', 10, false, cityFree), 1500);
  assert.throws(() => calcPrice('mowing', 9.4, false, cityFree), /Area must be between 10/);
});

test('tree and washing: fixed floor then MIN_ORDER', () => {
  assert.strictEqual(calcPrice('tree', 5, false, cityFree), 1000);
  assert.strictEqual(calcPrice('washing', 5, false, cityFree), 1000);
});
