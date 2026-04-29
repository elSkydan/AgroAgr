'use strict';

/**
 * pricingService.js
 * Server is the ONLY source of truth for pricing.
 * The client calc.js may mirror this for UX preview only.
 */

const MIN_AREA   = 0.5;
const MAX_AREA   = 50;
const MIN_ORDER  = 1000;

const OGOROD_FLAT_THRESHOLD = 3;
const OGOROD_FLAT_PRICE     = 1700;
const OGOROD_RATE_PER_SOTKA = 300;
const OGOROD_MIN            = 1700;

const CELINA_RATE_PER_SOTKA = 600;
const CELINA_MIN            = 1800;

/**
 * Round area UP to the nearest 0.5 sotka.
 */
function roundArea(raw) {
  return Math.ceil(raw * 2) / 2;
}

/**
 * Calculate total price for a lead.
 *
 * @param {'ogorod'|'celina'} serviceType
 * @param {number} rawArea           - sotki, before rounding
 * @param {boolean} outOfCity
 * @param {{ delivery_price: number|string }} city
 * @returns {number}                 - integer UAH (Math.round applied)
 * @throws {Error}
 */
function calcPrice(serviceType, rawArea, outOfCity, city) {
  const area = roundArea(rawArea);

  if (area < MIN_AREA || area > MAX_AREA) {
    throw Object.assign(
      new Error(`Area must be between ${MIN_AREA} and ${MAX_AREA} sotki. Got: ${rawArea}`),
      { code: 'INVALID_AREA', statusCode: 422 }
    );
  }

  let price;

  if (serviceType === 'ogorod') {
    price = area <= OGOROD_FLAT_THRESHOLD
      ? OGOROD_FLAT_PRICE
      : area * OGOROD_RATE_PER_SOTKA;
    price = Math.max(price, OGOROD_MIN);

  } else if (serviceType === 'celina') {
    price = area * CELINA_RATE_PER_SOTKA;
    price = Math.max(price, CELINA_MIN);

  } else {
    throw Object.assign(
      new Error(`Unknown serviceType: "${serviceType}". Expected "ogorod" or "celina".`),
      { code: 'INVALID_SERVICE_TYPE', statusCode: 422 }
    );
  }

  if (outOfCity) {
    // Validate delivery_price before using it — guard against bad DB data
    const surcharge = Number(city.delivery_price);
    if (!Number.isFinite(surcharge) || surcharge < 0) {
      throw Object.assign(
        new Error(`Invalid city.delivery_price: "${city.delivery_price}"`),
        { code: 'INVALID_DELIVERY_PRICE', statusCode: 500 }
      );
    }
    price += surcharge;
  }

  // Round to nearest integer UAH, then apply absolute floor
  return Math.round(Math.max(price, MIN_ORDER));
}

module.exports = { calcPrice, roundArea };
