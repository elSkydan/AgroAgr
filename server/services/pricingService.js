'use strict';

/**
 * pricingService.js
 * Server is the ONLY source of truth for pricing.
 * The client calc.js may mirror this for UX preview only.
 */

const MIN_AREA_GLOBAL = 0.5;
const MAX_AREA        = 50;
const MIN_ORDER       = 1000;

/** Fixed surcharge when lead is outside city (UAH). */
const OUT_OF_CITY_SURCHARGE_UAH = 800;

const SERVICE_MIN_AREA = {
  ogorod: 5,
  celina: 3,
  mowing: 10,
  tree: MIN_AREA_GLOBAL,
  washing: MIN_AREA_GLOBAL,
};

/** Огород: 300 UAH per 0.5 sot. step (per full sotka), min 5 sot. */
const OGOROD_RATE_PER_SOTKA = 300;

const CELINA_RATE_PER_SOTKA = 600;
const CELINA_MIN            = 1800;

const MOWING_RATE_PER_SOTKA = 150;
const MOWING_MIN            = 150;

const TREE_MIN    = 500;
const WASHING_MIN = 200;

/**
 * Round area UP to the nearest 0.5 sotka.
 */
function roundArea(raw) {
  return Math.ceil(raw * 2) / 2;
}

function minAreaForService(serviceType) {
  const m = SERVICE_MIN_AREA[serviceType];
  return m !== undefined ? m : MIN_AREA_GLOBAL;
}

/**
 * Calculate total price for a lead.
 *
 * @param {'ogorod'|'celina'|'mowing'|'tree'|'washing'} serviceType
 * @param {number} rawArea           - sotki, before rounding
 * @param {boolean} outOfCity
 * @param {*} [_city]                  Unused; API compatibility (out-of-city fee is fixed).
 * @returns {number}                 - integer UAH (Math.round applied)
 * @throws {Error}
 */
function calcPrice(serviceType, rawArea, outOfCity, _city) {
  const area = roundArea(rawArea);
  const minForService = minAreaForService(serviceType);

  if (!Number.isFinite(area) || area < minForService || area > MAX_AREA) {
    throw Object.assign(
      new Error(
        `Area must be between ${minForService} and ${MAX_AREA} sotki for "${serviceType}". Got: ${rawArea}`
      ),
      { code: 'INVALID_AREA', statusCode: 422 }
    );
  }

  let price;

  if (serviceType === 'ogorod') {
    price = area * OGOROD_RATE_PER_SOTKA;

  } else if (serviceType === 'celina') {
    price = area * CELINA_RATE_PER_SOTKA;
    price = Math.max(price, CELINA_MIN);

  } else if (serviceType === 'mowing') {
    price = area * MOWING_RATE_PER_SOTKA;
    price = Math.max(price, MOWING_MIN);

  } else if (serviceType === 'tree') {
    price = TREE_MIN;

  } else if (serviceType === 'washing') {
    price = WASHING_MIN;

  } else {
    throw Object.assign(
      new Error(`Unknown serviceType: "${serviceType}".`),
      { code: 'INVALID_SERVICE_TYPE', statusCode: 422 }
    );
  }

  if (outOfCity) {
    price += OUT_OF_CITY_SURCHARGE_UAH;
  }

  // Round to nearest integer UAH, then apply absolute floor
  return Math.round(Math.max(price, MIN_ORDER));
}

module.exports = {
  calcPrice,
  roundArea,
  minAreaForService,
  MAX_AREA,
  OUT_OF_CITY_SURCHARGE_UAH,
};
