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
