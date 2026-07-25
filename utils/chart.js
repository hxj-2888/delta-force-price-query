// ===== Canvas 图表绘制 =====

const { shortPrice } = require('./util.js');

/**
 * 绘制价格趋势曲线（用于详情页）
 * @param {CanvasContext} ctx - Canvas上下文
 * @param {number} canvasWidth - Canvas宽度
 * @param {number} canvasHeight - Canvas高度
 * @param {Array} pricePoints - 价格数据点 [{day, price}, ...]
 */
function drawPriceCurve(ctx, canvasWidth, canvasHeight, pricePoints) {
  if (!pricePoints || pricePoints.length < 2) return;

  const W = canvasWidth;
  const H = canvasHeight;
  const PAD = { top: 30, right: 18, bottom: 36, left: 72 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // 按 day 降序排列（30天前 → 当前）
  const pts = pricePoints.slice().sort((a, b) => b.day - a.day);
  const prices = pts.map(p => p.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = (maxPrice - minPrice) || 1;
  const paddedMin = minPrice - priceRange * 0.08;
  const paddedMax = maxPrice + priceRange * 0.08;
  const paddedRange = paddedMax - paddedMin || 1;

  // 计算数据点坐标
  const dataPoints = pts.map(p => ({
    x: PAD.left + (1 - p.day / 30) * plotW,
    y: PAD.top + plotH - ((p.price - paddedMin) / paddedRange) * plotH,
    day: p.day,
    price: p.price,
    hist: !!p.hist
  }));

  // 清空画布
  ctx.clearRect(0, 0, W, H);

  // 背景
  ctx.setFillStyle('rgba(255,255,255,0.02)');
  ctx.fillRect(0, 0, W, H);

  // Y轴网格线和标签
  const yLabels = getYLabels(dataPoints, priceRange);
  yLabels.forEach(yl => {
    ctx.setStrokeStyle('rgba(255,255,255,0.06)');
    ctx.setLineWidth(0.5);
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD.left, yl.y);
    ctx.lineTo(W - PAD.right, yl.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.setFillStyle('#888');
    ctx.setFontSize(10);
    ctx.setTextAlign('right');
    ctx.setTextBaseline('middle');
    ctx.fillText('¥' + shortPrice(yl.price), PAD.left - 8, yl.y);
  });

  // X轴标签
  [30, 25, 20, 15, 10, 5, 0].forEach(d => {
    const xx = PAD.left + (1 - d / 30) * plotW;
    ctx.setStrokeStyle('rgba(255,255,255,0.04)');
    ctx.setLineWidth(0.5);
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.moveTo(xx, PAD.top);
    ctx.lineTo(xx, PAD.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.setFillStyle('#888');
    ctx.setFontSize(9);
    ctx.setTextAlign('center');
    const label = d === 0 ? '当前' : d === 30 ? '30天前' : d + '天前';
    ctx.fillText(label, xx, H - 4);
  });

  // 面积填充
  const gradient = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + plotH);
  gradient.addColorStop(0, 'rgba(102,126,234,0.28)');
  gradient.addColorStop(1, 'rgba(102,126,234,0.03)');
  ctx.setFillStyle(gradient);

  ctx.beginPath();
  ctx.moveTo(dataPoints[0].x, PAD.top + plotH);
  dataPoints.forEach(dp => ctx.lineTo(dp.x, dp.y));
  ctx.lineTo(dataPoints[dataPoints.length - 1].x, PAD.top + plotH);
  ctx.closePath();
  ctx.fill();

  // 折线
  ctx.setStrokeStyle('#667eea');
  ctx.setLineWidth(2);
  ctx.setLineCap('round');
  ctx.setLineJoin('round');
  ctx.beginPath();
  ctx.moveTo(dataPoints[0].x, dataPoints[0].y);
  for (let i = 1; i < dataPoints.length; i++) {
    ctx.lineTo(dataPoints[i].x, dataPoints[i].y);
  }
  ctx.stroke();

  // 数据点标记和价格标签
  dataPoints.forEach(dp => {
    const isCurrent = dp.day === 0;
    const dotColor = isCurrent ? '#ffd700' : (dp.hist ? '#aaa' : '#667eea');
    const r = isCurrent ? 4 : (dp.hist ? 2.5 : 3);

    ctx.setFillStyle(dotColor);
    ctx.setStrokeStyle('rgba(0,0,0,0.5)');
    ctx.setLineWidth(1);
    ctx.beginPath();
    ctx.arc(dp.x, dp.y, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // 价格标签
    ctx.setFillStyle(isCurrent ? '#ffd700' : '#bbb');
    ctx.setFontSize(isCurrent ? 10 : 9);
    ctx.setTextAlign('center');
    ctx.fillText('¥' + shortPrice(dp.price), dp.x, dp.y - 10);
  });
}

/**
 * 获取Y轴标签（去重）
 */
function getYLabels(dataPoints, priceRange) {
  const seen = {};
  const labels = [];
  dataPoints.forEach(dp => {
    const key = Math.round(dp.price / (priceRange > 100 ? 10 : 1)) * (priceRange > 100 ? 10 : 1);
    if (!seen[key]) {
      seen[key] = true;
      labels.push(dp);
    }
  });
  if (labels.length <= 5) return labels;
  return [
    labels[0],
    labels[Math.floor(labels.length / 3)],
    labels[Math.floor(labels.length * 2 / 3)],
    labels[labels.length - 1]
  ];
}

/**
 * 绘制迷你走势线
 */
function drawSparkline(ctx, canvasWidth, canvasHeight, pricePoints) {
  if (!pricePoints || pricePoints.length < 2) return;

  const prices = pricePoints.map(p => p.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = (maxP - minP) || 1;
  const W = canvasWidth;
  const H = canvasHeight;
  const padX = 4;
  const padY = 4;
  const pw = W - padX * 2;
  const ph = H - padY * 2;

  const firstPrice = pricePoints[0].price;
  const lastPrice = pricePoints[pricePoints.length - 1].price;
  const isUp = lastPrice >= firstPrice;
  const color = isUp ? '#4caf50' : '#f44336';

  ctx.clearRect(0, 0, W, H);
  ctx.setStrokeStyle(color);
  ctx.setLineWidth(1.5);
  ctx.setLineCap('round');
  ctx.setLineJoin('round');
  ctx.beginPath();

  pricePoints.forEach((p, i) => {
    const x = padX + (i / (pricePoints.length - 1)) * pw;
    const y = padY + ph - ((p.price - minP) / range) * ph;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

module.exports = {
  drawPriceCurve,
  drawSparkline
};
