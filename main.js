'use strict';

// ========================================
// LUCIDE ICONS INIT
// ========================================
document.addEventListener('DOMContentLoaded', () => {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  initNavbar();
  initMobileMenu();
  initCalculator();
  initBeforeAfter();
  initForm();
  initSmoothScroll();
  initSliderTrack();
});

// ========================================
// NAVBAR — scroll behaviour
// ========================================
function initNavbar() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  const onScroll = () => {
    if (window.scrollY > 20) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// ========================================
// MOBILE MENU
// ========================================
function initMobileMenu() {
  const btn = document.getElementById('mobile-menu-btn');
  const menu = document.getElementById('mobile-menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', () => {
    const isOpen = !menu.classList.contains('hidden');
    menu.classList.toggle('hidden', isOpen);

    const icon = btn.querySelector('[data-lucide]');
    if (icon) {
      icon.setAttribute('data-lucide', isOpen ? 'menu' : 'x');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  });

  document.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', () => {
      menu.classList.add('hidden');
      const icon = btn.querySelector('[data-lucide]');
      if (icon) {
        icon.setAttribute('data-lucide', 'menu');
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    });
  });
}

// ========================================
// SMOOTH SCROLL
// ========================================
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      const navHeight = document.getElementById('navbar')?.offsetHeight || 64;
      const top = target.getBoundingClientRect().top + window.scrollY - navHeight;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
}

// ========================================
// BEFORE / AFTER cards
// ========================================
function initBeforeAfter() {
  document.querySelectorAll('.before-after-card').forEach(card => {
    const container = card.querySelector('.ba-image-container');
    const afterEl = card.querySelector('.ba-after');
    const buttons = card.querySelectorAll('.ba-btn');
    if (!container || !afterEl || !buttons.length) return;

    let showAfter = false;

    function syncButtons() {
      buttons.forEach(btn => {
        const target = btn.getAttribute('data-target');
        const on = target === 'after' ? showAfter : !showAfter;
        btn.classList.remove('text-red-500', 'bg-red-50', 'text-primary', 'text-gray-400');
        if (!on) {
          btn.classList.add('text-gray-400');
        } else if (target === 'before') {
          btn.classList.add('text-red-500', 'bg-red-50');
        } else {
          btn.classList.add('text-primary');
        }
      });
    }

    function setShowAfter(next) {
      showAfter = next;
      afterEl.classList.toggle('opacity-0', !showAfter);
      afterEl.classList.toggle('opacity-100', showAfter);
      syncButtons();
    }

    setShowAfter(false);

    container.addEventListener('click', () => setShowAfter(!showAfter));

    buttons.forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        const target = btn.getAttribute('data-target');
        setShowAfter(target === 'after');
      });
    });
  });
}

// ========================================
// FORM (placeholder — wire API when city picker exists)
// ========================================
function initForm() {
  const form = document.getElementById('lead-form');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    // Submission requires city_id + backend; keep UX ready for integration.
  });
}

// ========================================
// Legacy hook — range sliders removed from calculator
// ========================================
function initSliderTrack() {}

// ========================================
// CALCULATOR (preview mirrors server/services/pricingService.js)
// ========================================

const CALC_DEBOUNCE_MS = 300;

/** Same fixed surcharge as server when «за містом» is checked. */
const OUT_OF_CITY_SURCHARGE_UAH = 800;

const MAX_AREA_DISPLAY = 50;

const OGOROD_FLAT_THRESHOLD = 3;
const OGOROD_FLAT_PRICE = 1700;
const OGOROD_RATE_PER_SOTKA = 300;
const OGOROD_MIN = 1700;
const CELINA_RATE_PER_SOTKA = 600;
const CELINA_MIN = 1800;

const MOWING_RATE_PER_SOTKA = 150;
const MOWING_MIN = 150;
const TREE_MIN = 500;
const WASHING_MIN = 200;

const MIN_ORDER = 1000;

const AREA_OPTIONAL_SERVICES = new Set(['tree', 'washing']);

function roundArea(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return NaN;
  return Math.ceil(n * 2) / 2;
}

function minAreaForService(serviceType) {
  switch (serviceType) {
    case 'ogorod':
    case 'celina':
      return 3;
    case 'mowing':
      return 10;
    case 'tree':
    case 'washing':
      return 0.5;
    default:
      return 0.5;
  }
}

/**
 * Client-side approximate total (UAH), same rules as pricingService.
 */
function calcClientPreview(serviceType, rawArea, outOfCity) {
  const area = roundArea(rawArea);
  const minA = minAreaForService(serviceType);

  if (!Number.isFinite(area) || area > MAX_AREA_DISPLAY) {
    return { ok: false, area, reason: 'bounds' };
  }
  if (area < minA) {
    return { ok: false, area, reason: 'below_min', minRequired: minA };
  }

  let price;
  if (serviceType === 'ogorod') {
    price = area <= OGOROD_FLAT_THRESHOLD ? OGOROD_FLAT_PRICE : area * OGOROD_RATE_PER_SOTKA;
    price = Math.max(price, OGOROD_MIN);
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
    return { ok: false, area };
  }

  if (outOfCity) price += OUT_OF_CITY_SURCHARGE_UAH;

  const total = Math.round(Math.max(price, MIN_ORDER));
  return { ok: true, area, total };
}

function formatFormula(serviceType, area, outOfCity, preview) {
  if (!preview.ok) {
    if (preview.reason === 'below_min') {
      return `Мінімум ${String(preview.minRequired).replace('.', ',')} сот. для цієї послуги`;
    }
    if (preview.reason === 'bounds') {
      return `Площа від ${minAreaForService(serviceType)} до ${MAX_AREA_DISPLAY} сот.`;
    }
    return 'Вкажіть коректну площу';
  }

  let line;
  if (serviceType === 'ogorod') {
    if (area <= OGOROD_FLAT_THRESHOLD) {
      line = `Огород: ≤${OGOROD_FLAT_THRESHOLD} сот. — ${OGOROD_FLAT_PRICE} грн`;
    } else {
      line = `Огород: ${area} × ${OGOROD_RATE_PER_SOTKA} грн (мін. ${OGOROD_MIN} грн)`;
    }
  } else if (serviceType === 'celina') {
    line = `Цілина: ${area} × ${CELINA_RATE_PER_SOTKA} грн (мін. ${CELINA_MIN} грн)`;
  } else if (serviceType === 'mowing') {
    line = `Покос: ${area} × ${MOWING_RATE_PER_SOTKA} грн (мін. ${MOWING_MIN} грн)`;
  } else if (serviceType === 'tree') {
    line = `Демонтаж дерева: від ${TREE_MIN} грн (площа для орієнтиру)`;
  } else if (serviceType === 'washing') {
    line = `Мийка техніки: від ${WASHING_MIN} грн (площа для орієнтиру)`;
  } else {
    line = '';
  }

  if (outOfCity) line += ` + ${OUT_OF_CITY_SURCHARGE_UAH} грн (виїзд за місто)`;
  return line;
}

function initCalculator() {
  const serviceEl = document.getElementById('calc-service');
  const areaInput = document.getElementById('calc-area-input');
  const areaEffectiveEl = document.getElementById('area-effective');
  const areaSection = document.getElementById('area-section');
  const priceEl = document.getElementById('calc-price');
  const formulaEl = document.getElementById('price-formula');
  const outskirtsEl = document.getElementById('outskirts-cb');
  const areaHintEl = document.getElementById('calc-area-hint');

  if (!serviceEl || !areaInput || !priceEl) return;

  let debounceTimer = null;
  let lastPriceText = priceEl.textContent;

  function syncAreaInputForService(service) {
    const min = minAreaForService(service);
    areaInput.min = min;
    areaInput.max = MAX_AREA_DISPLAY;
    const v = parseFloat(areaInput.value);
    if (!Number.isFinite(v)) return;
    const r = roundArea(v);
    if (r < min) areaInput.value = String(min);
    if (r > MAX_AREA_DISPLAY) areaInput.value = String(MAX_AREA_DISPLAY);
  }

  function pulsePrice() {
    priceEl.classList.remove('calc-price-display--pulse');
    void priceEl.offsetWidth;
    priceEl.classList.add('calc-price-display--pulse');
  }

  function applyUpdate() {
    const service = serviceEl.value;
    const raw = areaInput.value;
    const outOfCity = outskirtsEl ? outskirtsEl.checked : false;

    const rounded = roundArea(raw);
    if (areaEffectiveEl) {
      areaEffectiveEl.textContent = Number.isFinite(rounded)
        ? String(rounded).replace('.', ',')
        : '—';
    }

    const result = calcClientPreview(service, raw, outOfCity);

    if (areaHintEl) {
      const m = minAreaForService(service);
      areaHintEl.textContent =
        `Мінімум ${String(m).replace('.', ',')} сот. · максимум ${MAX_AREA_DISPLAY} сот.`;
    }

    if (areaSection) {
      const dim = AREA_OPTIONAL_SERVICES.has(service);
      areaSection.style.opacity = dim ? '0.45' : '1';
      areaSection.style.pointerEvents = dim ? 'none' : 'auto';
    }

    if (formulaEl) {
      formulaEl.textContent = formatFormula(service, rounded, outOfCity, result);
    }

    const nextText = result.ok ? `${result.total} грн` : '— грн';
    if (nextText !== lastPriceText) {
      lastPriceText = nextText;
      priceEl.textContent = nextText;
      pulsePrice();
    } else {
      priceEl.textContent = nextText;
    }

    const formService = document.getElementById('form-service');
    if (formService) formService.value = service;
  }

  function scheduleUpdate() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      applyUpdate();
    }, CALC_DEBOUNCE_MS);
  }

  serviceEl.addEventListener('change', () => {
    syncAreaInputForService(serviceEl.value);
    scheduleUpdate();
  });
  areaInput.addEventListener('input', scheduleUpdate);
  if (outskirtsEl) outskirtsEl.addEventListener('change', scheduleUpdate);

  syncAreaInputForService(serviceEl.value);
  applyUpdate();
// CALCULATOR
// ========================================

const PRICING = {
  plowing:  { rate: 120, min: 300, label: '120 грн × {area} сот. (мін. 300 грн)' },
  virgin:   { rate: 500, min: 500, label: '500 грн × {area} сот.' },
  mowing:   { rate: 150, min: 150, label: '150 грн × {area} сот.' },
  tree:     { rate: 0,   min: 500, label: 'За домовленістю (мін. 500 грн)' },
  washing:  { rate: 0,   min: 200, label: 'За домовленістю (мін. 200 грн)' },
};

const OUTSKIRTS_FEE = 200;

function calcPrice(service, area, outskirts) {
  const p = PRICING[service] || PRICING.plowing;
  const base = p.rate > 0 ? Math.max(p.rate * area, p.min) : p.min;
  return base + (outskirts ? OUTSKIRTS_FEE : 0);
}

function formatFormula(service, area, outskirts) {
  const p = PRICING[service] || PRICING.plowing;
  let formula = p.label.replace('{area}', area);
  if (outskirts) formula += ` + ${OUTSKIRTS_FEE} грн (виїзд)`;
  return formula;
}

function initCalculator() {
  const serviceEl  = document.getElementById('calc-service');
  const sliderEl   = document.getElementById('area-slider');
  const areaDisplay = document.getElementById('area-display');
  const priceEl    = document.getElementById('calc-price');
  const formulaEl  = document.getElementById('price-formula');
  const outskirtsEl = document.getElementById('outskirts-cb');
  const areaSection = document.getElementById('area-section');

  if (!serviceEl || !sliderEl || !priceEl) return;

  const FIXED_SERVICES = new Set(['tree', 'washing']);

  function update() {
    const service = serviceEl.value;
    const area = parseInt(sliderEl.value, 10);
    const outskirts = outskirtsEl.checked;

    areaDisplay.textContent = `${area} сот.`;

    // Hide area slider for services billed per unit / fixed
    if (FIXED_SERVICES.has(service)) {
      areaSection.style.opacity = '0.4';
      areaSection.style.pointerEvents = 'none';
    } else {
      areaSection.style.opacity = '1';
      areaSection.style.pointerEvents = 'auto';
    }

    const total = calcPrice(service, area, outskirts);
    priceEl.textContent = `${total} грн`;
    formulaEl.textContent = formatFormula(service, area, outskirts);

    // Sync form service select
    const formService = document.getElementById('form-service');
    if (formService) formService.value = service;
  }

  serviceEl.addEventListener('change', update);
  sliderEl.addEventListener('input', update);
  outskirtsEl.addEventListener('change', update);

  // Sync reverse: form → calc
  const formService = document.getElementById('form-service');
  if (formService) {
    formService.addEventListener('change', () => {
      serviceEl.value = formService.value;
      update();
    });
  }

  update();
}

// ========================================
// SLIDER TRACK (fill left side with green)
// ========================================
function initSliderTrack() {
  const slider = document.getElementById('area-slider');
  if (!slider) return;

  function updateTrack() {
    const min = +slider.min;
    const max = +slider.max;
    const val = +slider.value;
    const pct = ((val - min) / (max - min)) * 100;
    slider.style.background = `linear-gradient(to right, #3E7B31 ${pct}%, #e5e7eb ${pct}%)`;
  }

  slider.addEventListener('input', updateTrack);
  updateTrack();
}

// ========================================
// BEFORE / AFTER
// ========================================
function initBeforeAfter() {
  document.querySelectorAll('.before-after-card').forEach(card => {
    const beforeImg = card.querySelector('.ba-before');
    const afterImg  = card.querySelector('.ba-after');
    const label     = card.querySelector('.ba-label');
    const container = card.querySelector('.ba-image-container');
    const [btnBefore, btnAfter] = card.querySelectorAll('.ba-btn');

    let showingAfter = false;

    function showBefore() {
      showingAfter = false;
      afterImg.classList.remove('visible');
      label.textContent = '← До';
      label.style.background = '#ef4444';
      btnBefore.classList.add('active-before');
      btnBefore.classList.remove('active-after');
      btnAfter.classList.remove('active-before', 'active-after');
    }

    function showAfter() {
      showingAfter = true;
      afterImg.classList.add('visible');
      label.textContent = 'Після →';
      label.style.background = '#3E7B31';
      btnAfter.classList.add('active-after');
      btnAfter.classList.remove('active-before');
      btnBefore.classList.remove('active-before', 'active-after');
    }

    if (container) {
      container.addEventListener('click', () => {
        showingAfter ? showBefore() : showAfter();
      });
      container.style.cursor = 'pointer';
    }

    if (btnBefore) btnBefore.addEventListener('click', showBefore);
    if (btnAfter)  btnAfter.addEventListener('click', showAfter);

    // Set initial state
    showBefore();
  });
}

// ========================================
// FORM
// ========================================
function initForm() {
  const form      = document.getElementById('lead-form');
  const success   = document.getElementById('form-success');
  const phoneInput = document.getElementById('form-phone');
  const phoneError = document.getElementById('phone-error');
  const submitBtn  = document.getElementById('submit-btn');

  if (!form) return;

  // Phone formatting
  if (phoneInput) {
    phoneInput.addEventListener('input', () => {
      let val = phoneInput.value.replace(/\D/g, '');
      if (val.startsWith('380')) val = val.slice(0);
      else if (val.startsWith('0')) val = '38' + val;
      else if (val.startsWith('38')) val = val;

      if (val.length > 12) val = val.slice(0, 12);

      // Format: +38 (0XX) XXX-XX-XX
      let formatted = '';
      if (val.length > 0) formatted = '+' + val.slice(0, 2);
      if (val.length > 2) formatted += ' (' + val.slice(2, 5);
      if (val.length > 5) formatted += ') ' + val.slice(5, 8);
      if (val.length > 8) formatted += '-' + val.slice(8, 10);
      if (val.length > 10) formatted += '-' + val.slice(10, 12);

      phoneInput.value = formatted || phoneInput.value;
      phoneError && phoneError.classList.add('hidden');
    });
  }

  function validatePhone(val) {
    const digits = val.replace(/\D/g, '');
    return digits.length >= 10;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const phone = phoneInput ? phoneInput.value.trim() : '';

    if (!validatePhone(phone)) {
      phoneError && phoneError.classList.remove('hidden');
      phoneInput && phoneInput.focus();
      return;
    }

    // Disable button, show loading
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <svg class="animate-spin w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
        </svg>
        Відправляємо...
      `;
    }

    const payload = {
      name:    document.getElementById('form-name')?.value.trim() || '',
      phone,
      service: document.getElementById('form-service')?.value || '',
      comment: document.getElementById('form-comment')?.value.trim() || '',
    };

    try {
      // Try sending to backend; silently succeed if unavailable
      const res = await fetch('/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => ({ ok: true }));

      form.classList.add('hidden');
      if (success) success.classList.remove('hidden');
    } catch {
      form.classList.add('hidden');
      if (success) success.classList.remove('hidden');
    }
  });
}
