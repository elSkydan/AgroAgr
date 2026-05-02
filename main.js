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
}
