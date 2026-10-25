// Hero background animation: a line chart that draws itself slowly with a
// soft green glow over the hero's grid and gradient mesh (handled in CSS).
//
// Performance and accessibility rules:
// - requestAnimationFrame only; the loop stops when the hero is off-screen
//   (IntersectionObserver) or the tab is hidden.
// - prefers-reduced-motion: one static frame is drawn; nothing animates.
// - Colours come from the CSS --green token and are re-read whenever the
//   theme changes, so the chart matches the day/night theme.
(() => {
  const canvas = document.getElementById("hero-canvas");
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let width = 0;
  let height = 0;
  let points = [];
  let lineColor = { r: 0, g: 245, b: 160 };

  const readColors = () => {
    const value = window.getComputedStyle(document.documentElement).getPropertyValue("--green").trim();
    const match = /^#([0-9a-f]{6})$/i.exec(value);
    if (match) {
      const hex = Number.parseInt(match[1], 16);
      lineColor = { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 };
    }
  };

  const rgba = (alpha) => `rgba(${lineColor.r}, ${lineColor.g}, ${lineColor.b}, ${alpha})`;

  // Upward-trending random walk: educational "market perspective", not data.
  const buildPoints = () => {
    const steps = 56;
    points = [];
    let y = height * 0.72;
    for (let i = 0; i <= steps; i += 1) {
      y -= height * 0.006 + (Math.random() - 0.42) * height * 0.035;
      y = Math.max(height * 0.14, Math.min(height * 0.86, y));
      points.push({ x: (width / steps) * i, y });
    }
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    buildPoints();
  };

  const draw = (progress, time) => {
    context.clearRect(0, 0, width, height);
    if (points.length < 2 || progress <= 0) return;

    // Gentle sine bob keeps the drawn line alive without redrawing data.
    const bob = (index) => (reducedMotion ? 0 : Math.sin(time / 1400 + index * 0.55) * 3);
    const visible = Math.max(2, Math.floor(points.length * progress));
    const drawn = points.slice(0, visible);

    // Area fill under the line.
    const fill = context.createLinearGradient(0, 0, 0, height);
    fill.addColorStop(0, rgba(0.14));
    fill.addColorStop(1, rgba(0));
    context.beginPath();
    drawn.forEach((point, index) => {
      const y = point.y + bob(index);
      if (index === 0) context.moveTo(point.x, y);
      else context.lineTo(point.x, y);
    });
    context.lineTo(drawn[drawn.length - 1].x, height);
    context.lineTo(drawn[0].x, height);
    context.closePath();
    context.fillStyle = fill;
    context.fill();

    // The line itself, with a soft glow.
    context.beginPath();
    drawn.forEach((point, index) => {
      const y = point.y + bob(index);
      if (index === 0) context.moveTo(point.x, y);
      else context.lineTo(point.x, y);
    });
    context.strokeStyle = rgba(0.85);
    context.lineWidth = 2.5;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.shadowColor = rgba(0.55);
    context.shadowBlur = 16;
    context.stroke();
    context.shadowBlur = 0;

    // Head dot with a slow pulse while the chart is "live".
    const head = drawn[drawn.length - 1];
    const headY = head.y + bob(drawn.length - 1);
    const pulse = reducedMotion ? 0 : (Math.sin(time / 600) + 1) / 2;
    context.beginPath();
    context.arc(head.x, headY, 7 + pulse * 4, 0, Math.PI * 2);
    context.fillStyle = rgba(0.12);
    context.fill();
    context.beginPath();
    context.arc(head.x, headY, 3.5, 0, Math.PI * 2);
    context.fillStyle = rgba(0.95);
    context.fill();
  };

  readColors();
  resize();

  if (reducedMotion) {
    draw(1, 0);
    window.addEventListener("resize", () => { resize(); draw(1, 0); });
    document.addEventListener("nexvora:themechange", () => { readColors(); draw(1, 0); });
    return;
  }

  // Animation cycle: draw in over ~5.5s, hold, fade, regenerate.
  const DRAW_MS = 5500;
  const HOLD_MS = 2600;
  const FADE_MS = 1200;
  const CYCLE_MS = DRAW_MS + HOLD_MS + FADE_MS;

  let visible = true;
  let frameId = null;
  let cycleStart = null;

  const frame = (time) => {
    if (!visible) { frameId = null; return; }
    if (cycleStart === null) cycleStart = time;
    let elapsed = time - cycleStart;
    if (elapsed >= CYCLE_MS) {
      cycleStart = time;
      elapsed = 0;
      buildPoints();
    }
    let progress;
    if (elapsed < DRAW_MS) {
      const t = elapsed / DRAW_MS;
      progress = 1 - Math.pow(1 - t, 3); // ease-out cubic
      canvas.style.opacity = "";
    } else if (elapsed < DRAW_MS + HOLD_MS) {
      progress = 1;
      canvas.style.opacity = "";
    } else {
      progress = 1;
      const fade = 1 - (elapsed - DRAW_MS - HOLD_MS) / FADE_MS;
      canvas.style.opacity = String(0.55 * Math.max(0, fade));
    }
    draw(progress, time);
    frameId = window.requestAnimationFrame(frame);
  };

  const start = () => {
    if (frameId === null && visible) frameId = window.requestAnimationFrame(frame);
  };

  const hero = canvas.closest(".hero") || canvas;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) start();
    }, { threshold: 0.02 }).observe(hero);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      visible = false;
    } else if (hero.getBoundingClientRect().bottom > 0) {
      visible = true;
      cycleStart = null;
      start();
    }
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { resize(); cycleStart = null; }, 150);
  });
  document.addEventListener("nexvora:themechange", () => { readColors(); });

  start();
})();
