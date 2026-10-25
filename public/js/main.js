(() => {
  const button = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav-links");
  if (button && nav) {
    button.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
      button.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
      button.innerHTML = open
        ? '<svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg>'
        : '<svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
    });
    nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
      nav.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "Open navigation menu");
      button.innerHTML = '<svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
    }));
  }
  const year = document.querySelector("[data-year]");
  if (year) year.textContent = new Date().getFullYear();

  const form = document.querySelector("#enquiry-form");
  if (form) {
    form.addEventListener("submit", event => {
      const phone = form.elements.phone.value.trim().replace(/\D/g, "");
      if (phone.length < 7 || phone.length > 18) {
        event.preventDefault();
        alert("Please enter a valid phone number including your country code.");
        form.elements.phone.focus();
        return;
      }
      const submit = form.querySelector('button[type="submit"]');
      if (submit) {
        submit.disabled = true;
        const label = submit.querySelector(".submit-label");
        if (label) label.textContent = "Submitting enquiry…";
        else submit.textContent = "Submitting enquiry…";
      }
    });
  }
})();

// Theme toggle: flips <html data-theme>, persists the choice, and notifies
// listeners (the hero canvas) so they can re-read their colours.
(() => {
  const rootEl = document.documentElement;
  const toggle = document.querySelector("[data-theme-toggle]");
  if (!toggle) return;

  const sync = () => {
    const isLight = rootEl.getAttribute("data-theme") === "light";
    toggle.setAttribute("aria-label", isLight ? "Switch to dark theme" : "Switch to light theme");
    toggle.setAttribute("aria-pressed", String(isLight));
  };
  sync();

  toggle.addEventListener("click", () => {
    const next = rootEl.getAttribute("data-theme") === "light" ? "dark" : "light";
    rootEl.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem("nexvora-theme", next);
    } catch (error) {
      // Storage may be unavailable (private browsing); the theme still applies for this visit.
    }
    sync();
    document.dispatchEvent(new CustomEvent("nexvora:themechange", { detail: { theme: next } }));
  });
})();

// Cursor spotlight, custom crosshair cursor and pointer-tracking card glow.
// One shared rAF loop drives the eased spotlight and the reticle cursor.
// The native cursor is replaced (cursor: none via the .custom-cursor class,
// fine pointers only) EXCEPT on form fields, which keep their native cursor.
// Over blank areas a still cursor shows only the clean reticle; while the
// mouse moves, tiny green/red candlestick pairs fade in along its path and
// disappear in ~0.55s. Over interactive elements no trail spawns and
// the ring expands and glows green. Everything here is disabled on touch
// devices (pointer: coarse) and for reduced-motion users.
(() => {
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!finePointer || reducedMotion) return;

  const glow = document.createElement("div");
  glow.className = "cursor-glow";
  glow.setAttribute("aria-hidden", "true");
  document.body.appendChild(glow);

  const cursor = document.querySelector(".cursor-fx");
  if (cursor) document.documentElement.classList.add("custom-cursor");

  const INTERACTIVE = "a, button, summary, input, select, textarea, label, [data-cursor]";

  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;
  let glowX = targetX;
  let glowY = targetY;
  let cursorX = targetX;
  let cursorY = targetY;
  let running = false;
  let seenPointer = false;

  const tick = () => {
    glowX += (targetX - glowX) * 0.14;
    glowY += (targetY - glowY) * 0.14;
    cursorX += (targetX - cursorX) * 0.38;
    cursorY += (targetY - cursorY) * 0.38;
    glow.style.transform = `translate(${glowX}px, ${glowY}px) translate(-50%, -50%)`;
    if (cursor) cursor.style.transform = `translate(${cursorX}px, ${cursorY}px)`;
    if (Math.abs(targetX - glowX) > 0.4 || Math.abs(targetY - glowY) > 0.4) {
      window.requestAnimationFrame(tick);
    } else {
      running = false;
    }
  };

  const wake = () => {
    if (!running) {
      running = true;
      window.requestAnimationFrame(tick);
    }
  };

  let hovering = false;
  const trail = document.getElementById("cursor-trail");
  let lastTrailX = -999, lastTrailY = -999;

  function spawnTrail(x, y) {
    if (!trail || hovering) return;                 // no bars over links/buttons
    const dx = x - lastTrailX, dy = y - lastTrailY;
    if (dx * dx + dy * dy < 42 * 42) return;        // one pair every ~42px of travel
    lastTrailX = x; lastTrailY = y;
    const pair = document.createElement("span");
    pair.className = "trail-candles";
    pair.style.left = x + "px";
    pair.style.top = y + "px";
    pair.innerHTML = '<span class="fx-candle fx-up"></span><span class="fx-candle fx-down"></span>';
    trail.appendChild(pair);
    setTimeout(() => pair.remove(), 600);           // matches the fade animation
  }

  window.addEventListener("pointermove", (event) => {
    targetX = event.clientX;
    targetY = event.clientY;
    spawnTrail(event.clientX, event.clientY);
    if (!seenPointer) {
      // First move: snap both layers to the pointer so nothing flies in
      // from the centre of the screen, then reveal the custom cursor.
      seenPointer = true;
      glowX = cursorX = targetX;
      glowY = cursorY = targetY;
      if (cursor) cursor.classList.add("is-on");
    }
    wake();
  }, { passive: true });

  if (cursor) {
    document.addEventListener("pointerover", (event) => {
      const interactive = event.target instanceof Element && event.target.closest(INTERACTIVE);
      hovering = Boolean(interactive);
      cursor.classList.toggle("is-interactive", hovering);
    }, { passive: true });
    window.addEventListener("pointerdown", () => cursor.classList.add("is-pressed"), { passive: true });
    window.addEventListener("pointerup", () => cursor.classList.remove("is-pressed"), { passive: true });
    document.documentElement.addEventListener("pointerleave", () => cursor.classList.remove("is-on"));
    document.documentElement.addEventListener("pointerenter", () => { if (seenPointer) cursor.classList.add("is-on"); });
  }

  document.querySelectorAll(".feature, .program-card, .contact-form, .chart-frame, .offer-card").forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      card.style.setProperty("--my", `${event.clientY - rect.top}px`);
    }, { passive: true });
  });
})();

// Scroll reveal: IntersectionObserver adds .revealed as elements enter the
// viewport, staggered within each parent group. Content is only hidden once
// JS opts in via .reveal-on, so no-JS and reduced-motion visitors see
// everything immediately.
(() => {
  const elements = document.querySelectorAll("[data-reveal]");
  if (!elements.length) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion || !("IntersectionObserver" in window)) {
    elements.forEach((element) => element.classList.add("revealed"));
    return;
  }

  document.documentElement.classList.add("reveal-on");

  const groupCounts = new Map();
  elements.forEach((element) => {
    const parent = element.parentElement;
    const index = groupCounts.get(parent) || 0;
    groupCounts.set(parent, index + 1);
    element.style.setProperty("--reveal-delay", `${Math.min(index, 5) * 80}ms`);
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });

  elements.forEach((element) => observer.observe(element));
})();
