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
// FORM
// ========================================
function initForm() {
  const form = document.getElementById('lead-form');
  const success = document.getElementById('form-success');
  const phoneInput = document.getElementById('form-phone');
  const phoneError = document.getElementById('phone-error');
  const submitBtn = document.getElementById('submit-btn');

  if (!form) return;

  if (phoneInput) {
    phoneInput.addEventListener('input', () => {
      let val = phoneInput.value.replace(/\D/g, '');
      if (val.startsWith('380')) val = val.slice(0);
      else if (val.startsWith('0')) val = '38' + val;
      else if (val.startsWith('38')) val = val;

      if (val.length > 12) val = val.slice(0, 12);

      let formatted = '';
      if (val.length > 0) formatted = '+' + val.slice(0, 2);
      if (val.length > 2) formatted += ' (' + val.slice(2, 5);
      if (val.length > 5) formatted += ') ' + val.slice(5, 8);
      if (val.length > 8) formatted += '-' + val.slice(8, 10);
      if (val.length > 10) formatted += '-' + val.slice(10, 12);

      phoneInput.value = formatted || phoneInput.value;
      if (phoneError) phoneError.classList.add('hidden');
    });
  }

  function validatePhone(val) {
    const digits = val.replace(/\D/g, '');
    return digits.length >= 10;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const phone = phoneInput ? phoneInput.value.trim() : '';

    if (!validatePhone(phone)) {
      phoneError && phoneError.classList.remove('hidden');
      phoneInput && phoneInput.focus();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <svg class="animate-spin w-4 h-4 mr-2 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
        </svg>
        Відправляємо...
      `;
    }

    try {
      await fetch('/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('form-name')?.value.trim() || '',
          phone,
          service: document.getElementById('form-service')?.value || '',
          comment: document.getElementById('form-comment')?.value.trim() || '',
        }),
      }).catch(() => ({ ok: true }));

      form.classList.add('hidden');
      if (success) success.classList.remove('hidden');
    } catch {
      form.classList.add('hidden');
      if (success) success.classList.remove('hidden');
    }
  });
}

// ========================================
// Legacy — калькулятор на числовому полі, без range slider
// ========================================
function initSliderTrack() {}

// ========================================
// CALCULATOR (дзеркалить server/services/pricingService.js)
// ========================================

const CALC_DEBOUNCE_MS = 300;
const OUT_OF_CITY_SURCHARGE_UAH = 800;
const MAX_AREA_DISPLAY = 50;

const OGOROD_RATE_PER_SOTKA = 300;
const CELINA_RATE_PER_SOTKA = 600;
const CELINA_MIN = 1800;

const MOWING_RATE_PER_SOTKA = 200;
const MOWING_MIN = 200;
const TREE_MIN = 500;
const WASHING_MIN = 250;

const MIN_ORDER = 1000;

const AREA_OPTIONAL_SERVICES = new Set(['tree', 'washing']);

/** Короткі підказки під вибором послуги (UI). */
const SERVICE_UI_NOTE = {
  ogorod: '',
  celina: '',
  mowing: 'Покос виконується фрезами.',
  tree: 'Точна ціна за домовленістю.',
  washing: '',
};

function roundArea(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return NaN;
  return Math.ceil(n * 2) / 2;
}

function minAreaForService(serviceType) {
  switch (serviceType) {
    case 'ogorod':
      return 5;
    case 'celina':
      return 3;
    case 'mowing':
      return 10;
    case 'tree':
    case 'washing':
      return 1;
    default:
      return 1;
  }
}

/** Мінімально можлива сума (як на сервері) для цієї послуги при мін. площі + виїзд. */
function minimumBillForService(serviceType, outOfCity) {
  const a = minAreaForService(serviceType);
  let price;
  if (serviceType === 'ogorod') {
    price = a * OGOROD_RATE_PER_SOTKA;
  } else if (serviceType === 'celina') {
    price = a * CELINA_RATE_PER_SOTKA;
    price = Math.max(price, CELINA_MIN);
  } else if (serviceType === 'mowing') {
    price = a * MOWING_RATE_PER_SOTKA;
    price = Math.max(price, MOWING_MIN);
  } else if (serviceType === 'tree') {
    price = TREE_MIN;
  } else if (serviceType === 'washing') {
    price = WASHING_MIN;
  } else {
    return NaN;
  }
  if (outOfCity) price += OUT_OF_CITY_SURCHARGE_UAH;
  return Math.round(Math.max(price, MIN_ORDER));
}

function calcClientPreview(serviceType, rawArea, outOfCity) {
  const rounded = roundArea(rawArea);
  const minA = minAreaForService(serviceType);

  if (!Number.isFinite(rounded)) {
    return { ok: false, area: NaN, reason: 'bounds' };
  }

  const effectiveArea = Math.min(Math.max(rounded, minA), MAX_AREA_DISPLAY);
  const wasClampedMin = rounded < minA;
  const wasClampedMax = rounded > MAX_AREA_DISPLAY;

  let price;
  if (serviceType === 'ogorod') {
    price = effectiveArea * OGOROD_RATE_PER_SOTKA;
  } else if (serviceType === 'celina') {
    price = effectiveArea * CELINA_RATE_PER_SOTKA;
    price = Math.max(price, CELINA_MIN);
  } else if (serviceType === 'mowing') {
    price = effectiveArea * MOWING_RATE_PER_SOTKA;
    price = Math.max(price, MOWING_MIN);
  } else if (serviceType === 'tree') {
    price = TREE_MIN;
  } else if (serviceType === 'washing') {
    price = WASHING_MIN;
  } else {
    return { ok: false, area: effectiveArea, reason: 'unknown' };
  }

  if (outOfCity) price += OUT_OF_CITY_SURCHARGE_UAH;

  let total = Math.round(Math.max(price, MIN_ORDER));
  const floorMin = minimumBillForService(serviceType, outOfCity);
  total = Math.max(total, floorMin);

  return {
    ok: true,
    area: effectiveArea,
    rounded,
    wasClampedMin,
    wasClampedMax,
    total,
    minA,
  };
}

function formatFormula(serviceType, areaEffective, outOfCity, preview) {
  if (!preview.ok) {
    if (preview.reason === 'bounds') {
      return 'Вкажіть числову площу (округлення до 0,5 сот.)';
    }
    return 'Вкажіть коректну площу';
  }

  let clampNote = '';
  if (preview.wasClampedMin) {
    clampNote += ` — застосовано мінімум ${String(preview.minA).replace('.', ',')} сот.`;
  }
  if (preview.wasClampedMax) {
    clampNote += ` — застосовано максимум ${String(MAX_AREA_DISPLAY).replace('.', ',')} сот.`;
  }

  let line;
  if (serviceType === 'ogorod') {
    line = `Огород: ${areaEffective} × ${OGOROD_RATE_PER_SOTKA} грн/сот.${clampNote}`;
  } else if (serviceType === 'celina') {
    line = `Цілина: ${areaEffective} × ${CELINA_RATE_PER_SOTKA} грн (мін. ${CELINA_MIN} грн)${clampNote}`;
  } else if (serviceType === 'mowing') {
    line = `Покос (фрезами): ${areaEffective} × ${MOWING_RATE_PER_SOTKA} грн${clampNote}`;
  } else if (serviceType === 'tree') {
    line = `Демонтаж: орієнтир від ${TREE_MIN} грн — точна ціна за домовленістю`;
  } else if (serviceType === 'washing') {
    line = `Мийка техніки: від ${WASHING_MIN} грн (орієнтир за площею)`;
  } else {
    line = '';
  }

  if (outOfCity) {
    line += ` + ${OUT_OF_CITY_SURCHARGE_UAH} грн (виїзд за місто)`;
  }
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
  const serviceNoteEl = document.getElementById('calc-service-note');

  if (!serviceEl || !areaInput || !priceEl) return;

  let debounceTimer = null;
  let lastPriceText = priceEl.textContent;

  function syncAreaInputForService(service, forceMinValue) {
    const min = minAreaForService(service);
    areaInput.min = min;
    areaInput.max = MAX_AREA_DISPLAY;
    if (forceMinValue) {
      areaInput.value = String(min);
      return;
    }
    const v = parseFloat(areaInput.value);
    if (!Number.isFinite(v)) return;
    const r = roundArea(v);
    const eff = Math.max(r, min);
    if (r > MAX_AREA_DISPLAY) areaInput.value = String(MAX_AREA_DISPLAY);
    else if (eff !== r || r < min) areaInput.value = String(eff);
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

    const result = calcClientPreview(service, raw, outOfCity);

    if (result.ok && (result.wasClampedMin || result.wasClampedMax)) {
      areaInput.value = String(result.area);
    }

    if (areaEffectiveEl) {
      areaEffectiveEl.textContent = result.ok
        ? String(result.area).replace('.', ',')
        : '—';
    }

    if (areaHintEl) {
      const m = minAreaForService(service);
      areaHintEl.textContent =
        `Мінімум ${String(m).replace('.', ',')} сот. · максимум ${MAX_AREA_DISPLAY} сот. · округлення до 0,5 сот. · за потреби підставляються мін./макс. площі`;
    }

    if (serviceNoteEl) {
      serviceNoteEl.textContent = SERVICE_UI_NOTE[service] || '';
    }

    if (areaSection) {
      const dim = AREA_OPTIONAL_SERVICES.has(service);
      areaSection.style.opacity = dim ? '0.45' : '1';
      areaSection.style.pointerEvents = dim ? 'none' : 'auto';
    }

    if (formulaEl) {
      formulaEl.textContent = formatFormula(
        service,
        result.ok ? result.area : NaN,
        outOfCity,
        result
      );
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
    syncAreaInputForService(serviceEl.value, true);
    scheduleUpdate();
  });
  areaInput.addEventListener('input', scheduleUpdate);
  if (outskirtsEl) outskirtsEl.addEventListener('change', scheduleUpdate);

  syncAreaInputForService(serviceEl.value, false);
  applyUpdate();
}
