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

test('ogorod: 300 UAH per sotka, minimum 5 sot.', () => {
  assert.strictEqual(calcPrice('ogorod', 5, false, cityFree), 1500);
  assert.strictEqual(calcPrice('ogorod', 6, false, cityFree), 1800);
});

test('ogorod: below min area clamps to minimum (after rounding)', () => {
  assert.strictEqual(calcPrice('ogorod', 4.4, false, cityFree), 1500);
});

test('celina: rate with minimum', () => {
  assert.strictEqual(calcPrice('celina', 3, false, cityFree), 1800);
  assert.strictEqual(calcPrice('celina', 4, false, cityFree), 2400);
});

test('out_of_city adds fixed surcharge (800 UAH)', () => {
  assert.strictEqual(calcPrice('ogorod', 5, true, cityLegacy), 1500 + OUT_OF_CITY_SURCHARGE_UAH);
  assert.strictEqual(OUT_OF_CITY_SURCHARGE_UAH, 800);
});

test('mowing: 200 UAH/sot., minimum area 10', () => {
  assert.strictEqual(calcPrice('mowing', 10, false, cityFree), 2000);
  assert.strictEqual(calcPrice('mowing', 9.4, false, cityFree), 2000);
});

test('tree and washing: fixed minimums, floor MIN_ORDER', () => {
  assert.strictEqual(calcPrice('tree', 1, false, cityFree), 1000);
  assert.strictEqual(calcPrice('washing', 1, false, cityFree), 1000);
  assert.strictEqual(calcPrice('tree', 0.4, false, cityFree), 1000);
});
