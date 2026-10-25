// Site-wide ambient background: a fixed, full-viewport field of faint
// candlesticks drifting very slowly sideways over a fine CSS grid, with a
// few dozen tiny glowing dust particles floating through it. It sits behind
// every section on every page (see views/partials/background.ejs) and is
// intentionally much fainter than the hero's foreground chart panel.
//
// Performance and accessibility rules:
// - requestAnimationFrame throttled to ~30fps; the loop stops when the tab
//   is hidden. Candles/particles are few and cheap to draw.
// - prefers-reduced-motion: one static frame is drawn; nothing animates.
// - Colours come from the CSS --green token (re-read on theme change) plus
//   the site's muted red, so the field matches the day/night theme.
// - Device pixel ratio is capped at 2.
(() => {
  const canvas = document.getElementById("site-bg-canvas");
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const SPACING = 46;      // horizontal distance between candles (px)
  const BODY_WIDTH = 15;   // candle body width (px)
  const FRAME_MS = 33;     // ~30fps throttle
  const DRIFT_PX_S = 5;    // sideways drift speed (px per second)

  let width = 0;
  let height = 0;
  let candles = [];
  let particles = [];
  let walkPrice = 0;
  let upColor = { r: 0, g: 245, b: 160 };
  const downColor = { r: 217, g: 94, b: 107 };

  const readColors = () => {
    const value = window.getComputedStyle(document.documentElement).getPropertyValue("--green").trim();
    const match = /^#([0-9a-f]{6})$/i.exec(value);
    if (match) {
      const hex = Number.parseInt(match[1], 16);
      upColor = { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 };
    }
  };

  const rgba = (color, alpha) => `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;

  // One candle in a gentle random walk. Most candles stay very faint; every
  // ~9th is a slightly brighter "highlight" candle, like a scanned bar.
  const nextCandle = (index) => {
    const open = walkPrice;
    walkPrice += (Math.random() - 0.47) * height * 0.055;
    walkPrice = Math.max(height * 0.1, Math.min(height * 0.9, walkPrice));
    const close = walkPrice;
    const high = Math.min(open, close) - Math.random() * height * 0.03;
    const low = Math.max(open, close) + Math.random() * height * 0.03;
    const highlight = index % 9 === 4;
    return {
      open, close, high, low, highlight,
      alpha: highlight ? 0.28 + Math.random() * 0.10 : 0.11 + Math.random() * 0.06,
      phase: Math.random() * Math.PI * 2
    };
  };

  const buildField = () => {
    candles = [];
    walkPrice = height * (0.35 + Math.random() * 0.3);
    const count = Math.ceil(width / SPACING) + 3;
    for (let i = 0; i < count; i += 1) candles.push(nextCandle(i));
    const particleCount = Math.max(24, Math.min(90, Math.round((width * height) / 26000)));
    particles = [];
    for (let i = 0; i < particleCount; i += 1) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.8 + Math.random() * 1.8,
        speed: 4 + Math.random() * 9,            // px per second, drifting up
        sway: Math.random() * Math.PI * 2,
        alpha: 0.35 + Math.random() * 0.5
      });
    }
  };

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    buildField();
  };

  const drawCandle = (candle, x, time) => {
    const rising = candle.close <= candle.open;
    const color = rising ? upColor : downColor;
    // Gentle per-candle breathing keeps the field alive at near-zero cost.
    const shimmer = reducedMotion ? 0 : Math.sin(time / 2600 + candle.phase) * 0.03;
    context.globalAlpha = Math.max(0.05, candle.alpha + shimmer);
    context.strokeStyle = rgba(color, 1);
    context.fillStyle = rgba(color, 1);
    context.lineWidth = 1;
    const centerX = x + BODY_WIDTH / 2;
    context.beginPath();
    context.moveTo(centerX, candle.high);
    context.lineTo(centerX, candle.low);
    context.stroke();
    const top = Math.min(candle.open, candle.close);
    const bodyHeight = Math.max(2.5, Math.abs(candle.close - candle.open));
    context.fillRect(x, top, BODY_WIDTH, bodyHeight);
    context.globalAlpha = 1;
  };

  const draw = (time, dtSeconds, offsetX) => {
    context.clearRect(0, 0, width, height);
    candles.forEach((candle, index) => {
      drawCandle(candle, index * SPACING - offsetX, time);
    });
    // Dust particles: tiny glowing motes floating slowly upward.
    particles.forEach((particle) => {
      if (!reducedMotion) {
        particle.y -= particle.speed * dtSeconds;
        particle.x += Math.sin(time / 2400 + particle.sway) * 0.25;
        if (particle.y < -4) {
          particle.y = height + 4;
          particle.x = Math.random() * width;
        }
        if (particle.x < -4) particle.x = width + 4;
        if (particle.x > width + 4) particle.x = -4;
      }
      const twinkle = 0.75 + 0.25 * Math.sin(time / 700 + particle.sway * 3);
      context.beginPath();
      context.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
      context.fillStyle = rgba(upColor, particle.alpha * twinkle);
      context.shadowColor = rgba(upColor, 0.8);
      context.shadowBlur = 12;
      context.fill();
      context.shadowBlur = 0;
    });
  };

  readColors();
  resize();

  if (reducedMotion) {
    draw(0, 0, 0);
    window.addEventListener("resize", () => { resize(); draw(0, 0, 0); });
    document.addEventListener("nexvora:themechange", () => { readColors(); draw(0, 0, 0); });
    return;
  }

  let frameId = null;
  let lastDraw = 0;
  let lastTime = 0;
  let offsetX = 0;
  let running = false;

  const frame = (time) => {
    if (!running) { frameId = null; return; }
    frameId = window.requestAnimationFrame(frame);
    if (time - lastDraw < FRAME_MS) return;
    const dtSeconds = Math.min(0.1, (time - lastTime) / 1000 || 0);
    lastDraw = time;
    lastTime = time;
    // Drift the whole field slowly; when one candle scrolls off the left,
    // drop it and extend the walk on the right so the scroll is seamless.
    offsetX += DRIFT_PX_S * dtSeconds;
    while (offsetX >= SPACING) {
      offsetX -= SPACING;
      candles.shift();
      candles.push(nextCandle(candles.length));
    }
    draw(time, dtSeconds, offsetX);
  };

  const start = () => {
    if (running) return;
    running = true;
    lastTime = 0;
    lastDraw = 0;
    if (frameId === null) frameId = window.requestAnimationFrame(frame);
  };

  const stop = () => { running = false; };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { resize(); offsetX = 0; }, 150);
  });
  document.addEventListener("nexvora:themechange", readColors);

  start();
})();
