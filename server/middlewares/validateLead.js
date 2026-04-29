'use strict';

const VALID_SERVICE_TYPES = ['ogorod', 'celina'];
const MIN_AREA = 0.5;
const MAX_AREA = 50;

function normalizePhone(raw) {
  if (!raw || typeof raw !== 'string') {
    throw Object.assign(new Error('Phone is required'), { statusCode: 422 });
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('380')) return '+' + digits;
  if (digits.length === 10 && digits.startsWith('0'))   return '+38' + digits;
  if (digits.length === 11 && digits.startsWith('80'))  return '+3' + digits;
  throw Object.assign(
    new Error(`Cannot normalize phone: "${raw}"`),
    { statusCode: 422, code: 'INVALID_PHONE' }
  );
}

function validateLead(req, res, next) {
  const errors = [];
  const body   = req.body ?? {};

  try { normalizePhone(body.phone); }
  catch { errors.push({ field: 'phone', message: 'Valid Ukrainian phone number required' }); }

  if (!VALID_SERVICE_TYPES.includes(body.service_type)) {
    errors.push({ field: 'service_type', message: `Must be one of: ${VALID_SERVICE_TYPES.join(', ')}` });
  }

  const area = parseFloat(body.area);
  if (!Number.isFinite(area) || area < MIN_AREA || area > MAX_AREA) {
    errors.push({ field: 'area', message: `Area must be between ${MIN_AREA} and ${MAX_AREA} sotki` });
  }

  const cityId = parseInt(body.city_id, 10);
  if (!Number.isFinite(cityId) || cityId < 1) {
    errors.push({ field: 'city_id', message: 'Valid city_id required' });
  }

  if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length > 100)) {
    errors.push({ field: 'name', message: 'Name must be a string <= 100 characters' });
  }

  if (body.out_of_city !== undefined && typeof body.out_of_city !== 'boolean') {
    errors.push({ field: 'out_of_city', message: 'Must be a boolean' });
  }

  if (errors.length) {
    return res.status(422).json({ error: 'Validation failed', fields: errors });
  }

  req.body.area        = area;
  req.body.city_id     = cityId;
  req.body.out_of_city = body.out_of_city ?? false;

  next();
}

module.exports = { validateLead, normalizePhone };
