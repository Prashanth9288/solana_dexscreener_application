export const CHART_LAYOUT_CONFIG = {
  layout: {
    background: { color: '#0a0d12' },
    textColor: '#536078',
    fontFamily: "'Inter', sans-serif",
    fontSize: 10,
  },
  grid: {
    vertLines: { color: '#1a223520' },
    horzLines: { color: '#1a223520' },
  },
  crosshair: {
    mode: 0,
    vertLine: { color: '#3b82f680', width: 1, style: 2, labelBackgroundColor: '#3b82f6' },
    horzLine: { color: '#3b82f680', width: 1, style: 2, labelBackgroundColor: '#3b82f6' },
  },
  rightPriceScale: {
    borderColor: '#1a2235',
    scaleMargins: { top: 0.08, bottom: 0.22 },
  },
  timeScale: {
    borderColor: '#1a2235',
    timeVisible: true,
    secondsVisible: false,
    rightOffset: 5,
  },
  handleScroll: { mouseWheel: true, pressedMouseMove: true },
  handleScale: { mouseWheel: true, pinch: true },
};

export const CANDLESTICK_SERIES_CONFIG = {
  upColor: '#22c55e',
  downColor: '#ef4444',
  borderUpColor: '#22c55e',
  borderDownColor: '#ef4444',
  wickUpColor: '#22c55e60',
  wickDownColor: '#ef444460',
};

export const VOLUME_SERIES_CONFIG = {
  priceFormat: { type: 'volume' },
  priceScaleId: 'volume',
};
