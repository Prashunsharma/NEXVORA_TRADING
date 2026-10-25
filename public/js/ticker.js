// Fixed bottom ticker bar (views/partials/background.ejs).
//
// IMPORTANT: every value here is SIMULATED. Nexvora is an education website,
// not a data provider — the bar is a design element, and it carries a visible
// "Illustrative" label for exactly that reason. Prices start from plausible
// values and update with a tiny random walk every ~2.5 seconds. Nothing here
// is a live feed, a quote, or a recommendation.
(() => {
  const track = document.getElementById("ticker-track");
  if (!track) return;

  const INSTRUMENTS = [
    { symbol: "NIFTY 50", value: 24315.75, change: 0.42, decimals: 2, volatility: 0.0006 },
    { symbol: "BANKNIFTY", value: 51240.60, change: -0.18, decimals: 2, volatility: 0.0008 },
    { symbol: "SENSEX", value: 79842.10, change: 0.35, decimals: 2, volatility: 0.0006 },
    { symbol: "BTC/USDT", value: 97412, change: -1.18, decimals: 0, volatility: 0.0016 },
    { symbol: "ETH/USDT", value: 3412.55, change: 1.05, decimals: 2, volatility: 0.0018 },
    { symbol: "GOLD", value: 2934.50, change: 0.90, decimals: 2, volatility: 0.0007 },
    { symbol: "SOL/USDT", value: 186.35, change: -2.14, decimals: 2, volatility: 0.0022 }
  ];

  const formatValue = (instrument) => instrument.value.toLocaleString("en-US", {
    minimumFractionDigits: instrument.decimals,
    maximumFractionDigits: instrument.decimals
  });

  const render = (instrument) => {
    document.querySelectorAll(`.ticker-item[data-symbol="${instrument.symbol}"]`).forEach((item) => {
      const valueEl = item.querySelector(".ticker-value");
      const changeEl = item.querySelector(".ticker-change");
      if (valueEl) valueEl.textContent = formatValue(instrument);
      if (changeEl) {
        const up = instrument.change >= 0;
        changeEl.textContent = `${up ? "▲" : "▼"} ${Math.abs(instrument.change).toFixed(2)}%`;
        changeEl.classList.toggle("up", up);
        changeEl.classList.toggle("down", !up);
      }
    });
  };

  INSTRUMENTS.forEach(render);

  window.setInterval(() => {
    if (document.hidden) return; // no invisible updates; values resume on return
    INSTRUMENTS.forEach((instrument) => {
      const drift = (Math.random() - 0.5) * 2 * instrument.volatility;
      instrument.value = Math.max(0.01, instrument.value * (1 + drift));
      // The daily change drifts more slowly than the price itself.
      instrument.change = Math.max(-9.99, Math.min(9.99, instrument.change + drift * 35));
      render(instrument);
    });
  }, 2500);
})();
