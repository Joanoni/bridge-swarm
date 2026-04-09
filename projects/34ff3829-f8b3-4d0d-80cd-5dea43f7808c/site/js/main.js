/* ================================================================
   JUANITA FOTOGRAFÍA — main.js
   JavaScript Vanilla · ES6+
   Portafolio Web · Bogotá, Colombia
================================================================ */

'use strict';

/* ----------------------------------------------------------------
   1. PAGE LOADER
   Muestra una pantalla de carga elegante al iniciar
---------------------------------------------------------------- */
function initPageLoader() {
  // Inject loader HTML
  const loader = document.createElement('div');
  loader.className = 'page-loader';
  loader.innerHTML = `
    <div class="page-loader__logo">Juanita</div>
    <div class="page-loader__bar"></div>
  `;
  document.body.prepend(loader);

  window.addEventListener('load', () => {
    setTimeout(() => {
      loader.classList.add('hidden');
      // After loader hides, start hero reveal
      triggerHeroReveal();
      setTimeout(() => loader.remove(), 700);
    }, 800);
  });
}

/* ----------------------------------------------------------------
   2. HERO REVEAL
   Dispara las animaciones del hero al cargar la página
---------------------------------------------------------------- */
function triggerHeroReveal() {
  const heroItems = document.querySelectorAll('.hero .reveal-up');
  heroItems.forEach(el => el.classList.add('visible'));
}

/* ----------------------------------------------------------------
   3. NAVBAR — scroll state + hamburger mobile
---------------------------------------------------------------- */
function initNavbar() {
  const navbar     = document.getElementById('navbar');
  const hamburger  = document.getElementById('hamburger');
  const navMenu    = document.getElementById('navMenu');
  const navLinks   = document.querySelectorAll('.nav-link');

  // --- Scroll: add class when scrolled past 60px ---
  function onScroll() {
    if (window.scrollY > 60) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // run on load

  // --- Hamburger toggle ---
  hamburger.addEventListener('click', () => {
    const isOpen = navMenu.classList.toggle('open');
    hamburger.classList.toggle('open', isOpen);
    hamburger.setAttribute('aria-expanded', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  // --- Close menu on link click ---
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      navMenu.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });

  // --- Active link on scroll (Intersection Observer per section) ---
  const sections = document.querySelectorAll('section[id]');
  const observerOptions = { threshold: 0.3 };
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(l => l.classList.remove('active'));
        const active = document.querySelector(`.nav-link[href="#${entry.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, observerOptions);

  sections.forEach(s => sectionObserver.observe(s));
}

/* ----------------------------------------------------------------
   4. SCROLL REVEAL (Intersection Observer)
   Anima elementos al entrar en el viewport
---------------------------------------------------------------- */
function initScrollReveal() {
  const revealEls = document.querySelectorAll(
    '.reveal-up:not(.hero .reveal-up), .reveal-left, .reveal-right'
  );

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target); // animate only once
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -40px 0px'
  });

  revealEls.forEach(el => observer.observe(el));
}

/* ----------------------------------------------------------------
   5. PORTAFOLIO FILTER
   Filtra las fotos según la categoría seleccionada
---------------------------------------------------------------- */
function initPortfolioFilter() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  const items      = document.querySelectorAll('.portfolio-item');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;

      // Update active button
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Filter items with fade effect
      items.forEach(item => {
        const category = item.dataset.category;
        if (filter === 'all' || category === filter) {
          item.classList.remove('hidden');
          item.style.animation = 'fadeInItem 0.4s ease forwards';
        } else {
          item.classList.add('hidden');
        }
      });
    });
  });

  // Inject animation keyframe
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeInItem {
      from { opacity: 0; transform: scale(0.97); }
      to   { opacity: 1; transform: scale(1); }
    }
  `;
  document.head.appendChild(style);
}

/* ----------------------------------------------------------------
   6. LIGHTBOX
   Visor de imagens a tela cheia con navegación
---------------------------------------------------------------- */
function initLightbox() {
  const lightbox     = document.getElementById('lightbox');
  const lbImg        = document.getElementById('lightboxImg');
  const lbCaption    = document.getElementById('lightboxCaption');
  const lbClose      = document.getElementById('lightboxClose');
  const lbPrev       = document.getElementById('lightboxPrev');
  const lbNext       = document.getElementById('lightboxNext');

  let currentIndex   = 0;
  let visibleItems   = [];

  function getVisibleItems() {
    return [...document.querySelectorAll('.portfolio-item:not(.hidden)')];
  }

  function openLightbox(index) {
    visibleItems = getVisibleItems();
    currentIndex = index;
    updateLightbox();
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
    lbClose.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
  }

  function updateLightbox() {
    const item   = visibleItems[currentIndex];
    const img    = item.querySelector('img');
    const h3     = item.querySelector('.portfolio-overlay__content h3');
    const series = item.querySelector('.portfolio-overlay__content span');

    lbImg.style.opacity = '0';
    setTimeout(() => {
      lbImg.src = img.src.replace('w=800', 'w=1400');
      lbImg.alt = img.alt;
      lbCaption.textContent = `${h3?.textContent || ''} · ${series?.textContent || ''}`;
      lbImg.style.opacity = '1';
    }, 200);
  }

  function prevImage() {
    visibleItems = getVisibleItems();
    currentIndex = (currentIndex - 1 + visibleItems.length) % visibleItems.length;
    updateLightbox();
  }

  function nextImage() {
    visibleItems = getVisibleItems();
    currentIndex = (currentIndex + 1) % visibleItems.length;
    updateLightbox();
  }

  // Open on portfolio item click
  document.querySelectorAll('.portfolio-item').forEach((item, idx) => {
    item.addEventListener('click', () => {
      // Find actual index among visible
      visibleItems = getVisibleItems();
      const vIdx = visibleItems.indexOf(item);
      if (vIdx !== -1) openLightbox(vIdx);
    });
  });

  lbClose.addEventListener('click', closeLightbox);
  lbPrev.addEventListener('click',  prevImage);
  lbNext.addEventListener('click',  nextImage);

  // Close on overlay click
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape')      closeLightbox();
    if (e.key === 'ArrowLeft')   prevImage();
    if (e.key === 'ArrowRight')  nextImage();
  });

  // Touch swipe support
  let touchStartX = 0;
  lightbox.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });
  lightbox.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].screenX;
    if (Math.abs(diff) > 50) {
      diff > 0 ? nextImage() : prevImage();
    }
  }, { passive: true });
}

/* ----------------------------------------------------------------
   7. PARALLAX EN QUOTE SECTION
   Efecto parallax suave en la imagen de fondo
---------------------------------------------------------------- */
function initParallax() {
  const quoteSection = document.querySelector('.quote-section');
  const quoteBgImg   = document.querySelector('.quote-section__bg-img');

  if (!quoteSection || !quoteBgImg) return;

  // Only on desktop
  if (window.matchMedia('(max-width: 768px)').matches) return;

  window.addEventListener('scroll', () => {
    const rect   = quoteSection.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    const offset = (window.innerHeight / 2 - center) * 0.2;
    quoteBgImg.style.transform = `translateY(${offset}px)`;
  }, { passive: true });
}

/* ----------------------------------------------------------------
   8. CURSOR PERSONALIZADO
   Cursor custom en terracota para desktop
---------------------------------------------------------------- */
function initCursor() {
  // Only on devices with fine pointer (desktop)
  if (!window.matchMedia('(pointer: fine)').matches) return;

  const cursor   = document.getElementById('cursor');
  const follower = document.getElementById('cursorFollower');

  if (!cursor || !follower) return;

  let mouseX = 0, mouseY = 0;
  let followerX = 0, followerY = 0;

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    cursor.style.left = mouseX + 'px';
    cursor.style.top  = mouseY + 'px';
  });

  // Smooth follower
  function animateFollower() {
    followerX += (mouseX - followerX) * 0.1;
    followerY += (mouseY - followerY) * 0.1;
    follower.style.left = followerX + 'px';
    follower.style.top  = followerY + 'px';
    requestAnimationFrame(animateFollower);
  }
  animateFollower();

  // Expand on interactive elements
  const hoverTargets = document.querySelectorAll(
    'a, button, .portfolio-item, .servicio-card, .filter-btn, .testimonio-card'
  );
  hoverTargets.forEach(el => {
    el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
  });

  // Hide cursor when leaving window
  document.addEventListener('mouseleave', () => {
    cursor.style.opacity   = '0';
    follower.style.opacity = '0';
  });
  document.addEventListener('mouseenter', () => {
    cursor.style.opacity   = '1';
    follower.style.opacity = '1';
  });
}

/* ----------------------------------------------------------------
   9. FORMULARIO DE CONTACTO
   Validación básica + feedback visual
---------------------------------------------------------------- */
function initContactForm() {
  const form       = document.getElementById('contactForm');
  const successMsg = document.getElementById('formSuccess');
  const errorMsg   = document.getElementById('formError');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nombre  = form.nombre.value.trim();
    const email   = form.email.value.trim();
    const mensaje = form.mensaje.value.trim();

    // Reset messages
    successMsg.classList.remove('show');
    errorMsg.classList.remove('show');

    // Basic validation
    if (!nombre || !email || !mensaje) {
      // Highlight empty required fields
      [form.nombre, form.email, form.mensaje].forEach(field => {
        if (!field.value.trim()) {
          field.style.borderBottomColor = '#c97b7b';
          setTimeout(() => field.style.borderBottomColor = '', 2000);
        }
      });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      form.email.style.borderBottomColor = '#c97b7b';
      setTimeout(() => form.email.style.borderBottomColor = '', 2000);
      return;
    }

    // Disable submit button
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Enviando...';
    submitBtn.disabled = true;

    // Simulate async send (replace with real endpoint)
    try {
      await simulateSend();
      successMsg.classList.add('show');
      form.reset();
    } catch (err) {
      errorMsg.classList.add('show');
    } finally {
      submitBtn.textContent = originalText;
      submitBtn.disabled    = false;
    }
  });

  // Clear error color on focus
  form.querySelectorAll('input, textarea').forEach(field => {
    field.addEventListener('focus', () => {
      field.style.borderBottomColor = '';
    });
  });
}

function simulateSend() {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // For demo: always succeed
      // In production, replace with fetch() to your endpoint
      resolve();
    }, 1200);
  });
}

/* ----------------------------------------------------------------
   10. SMOOTH SCROLL for anchor links
---------------------------------------------------------------- */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      const offsetTop = target.getBoundingClientRect().top + window.pageYOffset - 80;
      window.scrollTo({ top: offsetTop, behavior: 'smooth' });
    });
  });
}

/* ----------------------------------------------------------------
   11. PORTFOLIO ITEMS: staggered scroll reveal
   Cada item del grid aparece con delay escalonado
---------------------------------------------------------------- */
function initPortfolioReveal() {
  const items = document.querySelectorAll('.portfolio-item');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const index   = parseInt(entry.target.dataset.index) || 0;
        const delay   = (index % 3) * 120; // stagger by column
        entry.target.style.transitionDelay = delay + 'ms';
        entry.target.style.opacity         = '1';
        entry.target.style.transform       = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  items.forEach(item => {
    item.style.opacity   = '0';
    item.style.transform = 'translateY(30px)';
    item.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
    observer.observe(item);
  });
}

/* ----------------------------------------------------------------
   12. YEAR IN FOOTER
   Actualiza el año automáticamente
---------------------------------------------------------------- */
function updateYear() {
  const yearEls = document.querySelectorAll('[data-year]');
  const year    = new Date().getFullYear();
  yearEls.forEach(el => el.textContent = year);
}

/* ----------------------------------------------------------------
   13. LAZY LOADING ENHANCEMENT
   Mejora el lazy loading nativo con un efecto de fade
---------------------------------------------------------------- */
function initLazyImages() {
  const images = document.querySelectorAll('img[loading="lazy"]');

  images.forEach(img => {
    img.style.opacity    = '0';
    img.style.transition = 'opacity 0.5s ease';

    if (img.complete) {
      img.style.opacity = '1';
    } else {
      img.addEventListener('load', () => {
        img.style.opacity = '1';
      });
    }
  });
}

/* ----------------------------------------------------------------
   INIT — Arranque de todos los módulos
---------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  initPageLoader();
  initNavbar();
  initScrollReveal();
  initPortfolioFilter();
  initPortfolioReveal();
  initLightbox();
  initParallax();
  initCursor();
  initContactForm();
  initSmoothScroll();
  initLazyImages();
  updateYear();

  console.log('%cJuanita Fotografía · Bogotá, Colombia', [
    'color: #C97B5A',
    'font-family: Georgia, serif',
    'font-size: 14px',
    'font-style: italic'
  ].join(';'));
});
