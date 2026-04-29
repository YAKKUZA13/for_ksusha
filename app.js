const canvas = document.querySelector("#stage");
const ctx = canvas.getContext("2d");

const titleInput = document.querySelector("#titleInput");
const resetButton = document.querySelector("#resetButton");
const freezeButton = document.querySelector("#freezeButton");
const exportSvgButton = document.querySelector("#exportSvgButton");
const phaseLabel = document.querySelector("#phaseLabel");
const weightsTable = document.querySelector("#weightsTable");

const controls = {
  seed: document.querySelector("#seedInput"),
  gravity: document.querySelector("#gravityInput"),
  floatiness: document.querySelector("#floatinessInput"),
  collision: document.querySelector("#collisionInput"),
  damping: document.querySelector("#dampingInput"),
  padding: document.querySelector("#paddingInput"),
  fontScale: document.querySelector("#fontScaleInput"),
  wobbleAmount: document.querySelector("#wobbleAmountInput"),
  wobbleSpeed: document.querySelector("#wobbleSpeedInput"),
  maskBlur: document.querySelector("#maskBlurInput"),
  contour: document.querySelector("#contourInput"),
};

const fontFamily = '"Inter Tight", Inter, Arial, sans-serif';
const baseFontSize = 62;

const stopwords = new Set([
  "а",
  "без",
  "в",
  "во",
  "для",
  "до",
  "за",
  "и",
  "или",
  "из",
  "к",
  "ко",
  "на",
  "над",
  "но",
  "о",
  "об",
  "от",
  "по",
  "под",
  "при",
  "с",
  "со",
  "у",
  "через",
  "что",
]);

const coreStems = [
  "атом",
  "биосфер",
  "вспыш",
  "галактик",
  "ген",
  "днк",
  "звезд",
  "зон",
  "карлик",
  "клетк",
  "матери",
  "нейрон",
  "обитаем",
  "планет",
  "частиц",
  "энерги",
];

const actionEndings = [
  "ается",
  "яются",
  "ется",
  "ются",
  "ила",
  "или",
  "ило",
  "ает",
  "яют",
  "уют",
  "яли",
  "яет",
  "ла",
  "ло",
  "ли",
  "ет",
  "ют",
  "ил",
];

const detailEndings = [
  "ая",
  "ее",
  "ей",
  "ое",
  "ые",
  "ых",
  "ый",
  "ий",
  "их",
  "ой",
  "ую",
  "ого",
  "его",
  "ыми",
  "ими",
  "ной",
  "ная",
  "нее",
  "ски",
];

const state = {
  width: 0,
  height: 0,
  dpr: 1,
  frame: 0,
  frozen: false,
  words: [],
  maskCanvas: document.createElement("canvas"),
  maskCtx: null,
  resizeTimer: 0,
};

state.maskCtx = state.maskCanvas.getContext("2d", { willReadFrequently: true });

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value) {
  return Number(value.toFixed(2)).toString();
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeWord(word) {
  return word.toLowerCase().replace(/ё/g, "е").replace(/[^а-яa-z0-9-]/gi, "");
}

function mulberry32(seed) {
  let value = seed >>> 0;

  return function random() {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function getSettings() {
  return {
    seed: Number(controls.seed.value) || 1,
    gravity: Number(controls.gravity.value),
    floatiness: Number(controls.floatiness.value),
    collision: Number(controls.collision.value),
    damping: Number(controls.damping.value),
    padding: Number(controls.padding.value),
    fontScale: Number(controls.fontScale.value),
    wobbleAmount: Number(controls.wobbleAmount.value),
    wobbleSpeed: Number(controls.wobbleSpeed.value),
    maskBlur: Number(controls.maskBlur.value),
    contour: Number(controls.contour.value),
  };
}

function classifyWord(word, index, total) {
  const normalized = normalizeWord(word);

  if (!normalized || stopwords.has(normalized)) {
    return { category: "service", weight: 0.05 };
  }

  if (coreStems.some((stem) => normalized.includes(stem))) {
    return { category: "core", weight: clamp(0.82 + normalized.length * 0.012, 0.82, 1) };
  }

  if (actionEndings.some((ending) => normalized.endsWith(ending))) {
    return { category: "action", weight: 0.56 + (index / Math.max(total - 1, 1)) * 0.1 };
  }

  if (detailEndings.some((ending) => normalized.endsWith(ending))) {
    return { category: "detail", weight: 0.24 + Math.min(normalized.length, 12) * 0.01 };
  }

  if (normalized.length >= 6) {
    return { category: "core", weight: clamp(0.76 + normalized.length * 0.012, 0.78, 0.94) };
  }

  return { category: "detail", weight: 0.32 };
}

function getLayoutBounds() {
  const width = Math.min(state.width * 0.42, 460);

  return {
    left: state.width * 0.24 - width * 0.5,
    top: state.height * 0.12,
    width,
    height: state.height * 0.78,
  };
}

function getMaskBounds() {
  const width = Math.min(state.width * 0.36, 420);

  return {
    left: state.width * 0.72 - width * 0.5,
    top: state.height * 0.16,
    width,
    height: state.height * 0.72,
  };
}

function getFloorY(bounds) {
  return bounds.top + bounds.height * 0.9;
}

function setupCanvas() {
  const bounds = canvas.getBoundingClientRect();
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.width = Math.max(720, bounds.width);
  state.height = Math.max(520, bounds.height);
  canvas.width = Math.round(state.width * state.dpr);
  canvas.height = Math.round(state.height * state.dpr);
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

  state.maskCanvas.width = Math.round(state.width);
  state.maskCanvas.height = Math.round(state.height);
}

function measureWords(words, settings) {
  const fontSize = baseFontSize * settings.fontScale;

  ctx.save();
  ctx.font = `900 ${fontSize}px ${fontFamily}`;

  const measured = words.map((text, index) => {
    const classified = classifyWord(text, index, words.length);
    const metrics = ctx.measureText(text);

    return {
      id: index,
      text,
      category: classified.category,
      weight: classified.weight,
      mass: 0.6 + classified.weight * 2.2,
      floatiness: 1 - classified.weight,
      fontSize,
      width: metrics.width,
      height: fontSize * 0.82,
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
      vx: 0,
      vy: 0,
      baseAngle: 0,
      angle: 0,
      seed: 0,
      opacity: 0,
      compression: 0,
      supportId: null,
    };
  });

  ctx.restore();
  return measured;
}

function buildPile(words, bounds, random) {
  const floorY = getFloorY(bounds);
  const centerX = bounds.left + bounds.width * 0.5;
  const sorted = [...words].sort((a, b) => b.weight - a.weight || random() - 0.5);
  const baseThreshold = Math.max(0.74, sorted[Math.min(3, sorted.length - 1)]?.weight - 0.08 || 0.74);
  let base = sorted.filter((word) => word.weight >= baseThreshold || word.category === "core");

  if (!base.length) {
    base = sorted.slice(0, Math.min(2, sorted.length));
  }

  base = base
    .map((word) => ({ word, rank: random() }))
    .sort((a, b) => a.rank - b.rank)
    .map((item) => item.word);

  const placed = [];

  base.forEach((word) => {
    word.supportId = null;
    word.tx = centerX + (random() - 0.5) * bounds.width * 0.58;
    word.ty =
      floorY -
      word.height * 0.5 -
      (1 - word.weight) * bounds.height * 0.18 -
      random() * bounds.height * 0.08;
    word.baseAngle = (random() - 0.5) * 28;
    placed.push(word);
  });

  sorted
    .filter((word) => !base.includes(word))
    .forEach((word) => {
      const candidates = placed.filter((support) => support.weight >= word.weight - 0.1);
      const support = (candidates.length ? candidates : placed)[
        Math.floor(random() * (candidates.length ? candidates : placed).length)
      ];
      const edge = random() < 0.5 ? -1 : 1;
      const offset = edge * Math.min(support.width * (0.12 + random() * 0.42), bounds.width * 0.24);

      word.supportId = support.id;
      word.tx = support.tx + offset;
      word.ty =
        support.ty -
        support.height * 0.38 -
        word.height * 0.38 -
        (support.weight - word.weight) * bounds.height * 0.16 +
        random() * 18;
      word.baseAngle = support.baseAngle + (random() - 0.5) * (22 + word.floatiness * 12);
      placed.push(word);
    });

  assignAccentAngles(words, random);

  words.forEach((word) => {
    word.tx = clamp(word.tx, bounds.left + word.width * 0.5, bounds.left + bounds.width - word.width * 0.5);
    word.ty = clamp(word.ty, bounds.top + word.height * 0.5, floorY - word.height * 0.5);
    word.x = centerX + (random() - 0.5) * bounds.width * 0.9;
    word.y = bounds.top + random() * bounds.height * 0.35;
    word.seed = random();
    word.angle = word.baseAngle;
  });
}

function assignAccentAngles(words, random) {
  const buckets = new Map();

  words.forEach((word) => {
    const key = Math.round(word.weight / 0.08) * 0.08;

    if (!buckets.has(key)) {
      buckets.set(key, []);
    }

    buckets.get(key).push(word);
  });

  const candidates = [...buckets.values()]
    .filter((bucket) => bucket.length >= 2)
    .sort((a, b) => b.length - a.length)[0];

  if (!candidates) {
    return;
  }

  const shuffled = candidates
    .map((word) => ({ word, rank: random() }))
    .sort((a, b) => a.rank - b.rank)
    .map((item) => item.word);
  const count = Math.min(shuffled.length, random() < 0.55 ? 1 : 2);

  for (let i = 0; i < count; i += 1) {
    shuffled[i].baseAngle = random() * 180;
  }
}

function parseTitle() {
  const rawWords = titleInput.value.match(/[а-яА-ЯёЁa-zA-Z0-9-]+/g) || [];
  const words = rawWords.slice(0, 18).map((word) => word.toLowerCase());
  const settings = getSettings();
  const random = mulberry32(settings.seed);
  const bounds = getLayoutBounds();

  state.words = measureWords(words, settings);
  buildPile(state.words, bounds, random);
  state.frame = 0;
  renderWeightsTable();
}

function renderWeightsTable() {
  weightsTable.innerHTML = "";

  state.words.forEach((word) => {
    const row = document.createElement("div");
    row.className = "word-row";
    row.innerHTML = `
      <div class="word-name" title="${word.text}">${word.text}</div>
      <div class="word-category">${word.category}</div>
      <div class="word-weight">${word.weight.toFixed(2)}</div>
    `;
    weightsTable.append(row);
  });
}

function getBox(word, settings) {
  const pad = settings.padding;
  const angle = (word.angle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const width = word.width * cos + word.height * sin;
  const height = word.width * sin + word.height * cos;

  return {
    left: word.x - width / 2 - pad,
    right: word.x + width / 2 + pad,
    top: word.y - height / 2 - pad,
    bottom: word.y + height / 2 + pad,
    width,
    height,
  };
}

function updatePhysics(time) {
  if (state.frozen) {
    return;
  }

  const settings = getSettings();
  const bounds = getLayoutBounds();
  const floorY = getFloorY(bounds);

  state.words.forEach((word) => {
    const hoverX = Math.sin(time * 0.00045 + word.seed * 18) * word.floatiness * 5 * settings.floatiness;
    const hoverY = Math.cos(time * 0.00055 + word.seed * 23) * word.floatiness * 4 * settings.floatiness;
    const targetX = word.tx + hoverX;
    const targetY = word.ty + hoverY;
    const stiffness = 0.016 + word.weight * 0.014;
    const gravity = (word.weight - 0.18) * 0.08 * settings.gravity;

    word.vx += ((targetX - word.x) * stiffness) / word.mass;
    word.vy += (((targetY - word.y) * stiffness) + gravity) / word.mass;
    word.vx *= settings.damping;
    word.vy *= settings.damping;
    word.x += word.vx;
    word.y += word.vy;

    const wobble = (2 + word.floatiness * 7) * settings.wobbleAmount;
    word.angle =
      word.baseAngle +
      Math.sin(time * 0.0011 * settings.wobbleSpeed + word.seed * 30) * wobble;
    word.opacity = clamp(word.opacity + 0.025, 0, 1);
    word.compression *= 0.88;

    const box = getBox(word, settings);

    if (box.bottom > floorY) {
      word.y -= box.bottom - floorY;
      word.vy *= -0.12;
      word.vx *= 0.82;
    }
  });

  for (let i = 0; i < 4; i += 1) {
    resolveCollisions(settings);
  }
  containWords(settings);
  state.frame += 1;
}

function resolveCollisions(settings) {
  for (let i = 0; i < state.words.length; i += 1) {
    for (let j = i + 1; j < state.words.length; j += 1) {
      const a = state.words[i];
      const b = state.words[j];
      const boxA = getBox(a, settings);
      const boxB = getBox(b, settings);
      const overlapX = Math.min(boxA.right, boxB.right) - Math.max(boxA.left, boxB.left);
      const overlapY = Math.min(boxA.bottom, boxB.bottom) - Math.max(boxA.top, boxB.top);

      if (overlapX <= 0 || overlapY <= 0) {
        continue;
      }

      const totalMass = a.mass + b.mass;
      const pushA = b.mass / totalMass;
      const pushB = a.mass / totalMass;
      const strength = Math.max(settings.collision, 0.55);

      if (overlapX < overlapY) {
        const direction = a.x < b.x ? -1 : 1;
        a.x += direction * overlapX * pushA * strength;
        b.x -= direction * overlapX * pushB * strength;
        a.vx += direction * 0.012 * pushA * overlapX;
        b.vx -= direction * 0.012 * pushB * overlapX;
      } else {
        const direction = a.y < b.y ? -1 : 1;
        a.y += direction * overlapY * pushA * strength;
        b.y -= direction * overlapY * pushB * strength;
        a.vy += direction * 0.012 * pushA * overlapY;
        b.vy -= direction * 0.012 * pushB * overlapY;
      }

      const compression = clamp(Math.min(overlapX, overlapY) * 0.004, 0, 0.16);
      a.compression = Math.max(a.compression, compression * pushA);
      b.compression = Math.max(b.compression, compression * pushB);
    }
  }
}

function containWords(settings) {
  const bounds = getLayoutBounds();
  const floorY = getFloorY(bounds);

  state.words.forEach((word) => {
    const box = getBox(word, settings);

    if (box.left < bounds.left) {
      word.x += bounds.left - box.left;
      word.vx *= -0.2;
    }

    if (box.right > bounds.left + bounds.width) {
      word.x -= box.right - (bounds.left + bounds.width);
      word.vx *= -0.2;
    }

    if (box.bottom > floorY) {
      word.y -= box.bottom - floorY;
      word.vy *= -0.12;
    }
  });
}

function drawBackground() {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, state.width, state.height);
}

function drawSourceHeadline() {
  const title = titleInput.value.trim().toLowerCase();

  if (!title) {
    return;
  }

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#000000";
  ctx.font = `900 16px ${fontFamily}`;
  ctx.fillText(title, state.width * 0.5, 34, state.width * 0.82);
  ctx.restore();
}

function drawWords(targetCtx, scale = 1, maskMode = false) {
  targetCtx.save();
  targetCtx.textAlign = "center";
  targetCtx.textBaseline = "middle";

  state.words.forEach((word) => {
    const scaleX = 1 + word.compression * 0.35;
    const scaleY = 1 - word.compression;

    targetCtx.save();
    targetCtx.translate(word.x * scale, word.y * scale);
    targetCtx.rotate((word.angle * Math.PI) / 180);
    targetCtx.scale(scaleX * scale, scaleY * scale);
    targetCtx.font = `900 ${word.fontSize}px ${fontFamily}`;
    targetCtx.fillStyle = maskMode ? "#ffffff" : `rgba(0, 0, 0, ${word.opacity})`;
    targetCtx.fillText(word.text, 0, 0);
    targetCtx.restore();
  });

  targetCtx.restore();
}

function getMaskTransform(sourceBounds, targetBounds) {
  const scale = Math.min(targetBounds.width / sourceBounds.width, targetBounds.height / sourceBounds.height);

  return {
    scale,
    offsetX: targetBounds.left + targetBounds.width * 0.5 - (sourceBounds.left + sourceBounds.width * 0.5) * scale,
    offsetY: targetBounds.top + targetBounds.height * 0.5 - (sourceBounds.top + sourceBounds.height * 0.5) * scale,
  };
}

function drawMaskPreview() {
  ctx.save();
  ctx.drawImage(state.maskCanvas, 0, 0, state.width, state.height);
  ctx.restore();
}

function updateMask(settings) {
  const scale = state.maskCanvas.width / state.width;
  const maskCtx = state.maskCtx;
  const sourceBounds = getLayoutBounds();
  const targetBounds = getMaskBounds();
  const transform = getMaskTransform(sourceBounds, targetBounds);
  maskCtx.save();
  maskCtx.setTransform(1, 0, 0, 1, 0, 0);
  maskCtx.clearRect(0, 0, state.maskCanvas.width, state.maskCanvas.height);
  maskCtx.fillStyle = "#ffffff";
  maskCtx.textAlign = "center";
  maskCtx.textBaseline = "middle";

  state.words.forEach((word) => {
    const scaleX = 1 + word.compression * 0.35;
    const scaleY = 1 - word.compression;
    const x = (word.x * transform.scale + transform.offsetX) * scale;
    const y = (word.y * transform.scale + transform.offsetY) * scale;

    maskCtx.save();
    maskCtx.translate(x, y);
    maskCtx.rotate((word.angle * Math.PI) / 180);
    maskCtx.scale(scaleX * transform.scale * scale, scaleY * transform.scale * scale);
    maskCtx.font = `900 ${word.fontSize}px ${fontFamily}`;
    maskCtx.fillText(word.text, 0, 0);
    maskCtx.restore();
  });

  maskCtx.restore();
  blurAndThresholdMask(Math.round(settings.maskBlur * scale), 46);
}

function blurAndThresholdMask(radius, threshold = 46) {
  const maskCtx = state.maskCtx;
  const width = state.maskCanvas.width;
  const height = state.maskCanvas.height;
  const image = maskCtx.getImageData(0, 0, width, height);
  const data = image.data;
  const alpha = new Uint8ClampedArray(width * height);

  for (let i = 0, pixel = 0; i < data.length; i += 4, pixel += 1) {
    alpha[pixel] = data[i + 3];
  }

  const blurredAlpha = radius > 0 ? boxBlurAlpha(alpha, width, height, radius) : alpha;

  for (let i = 0, pixel = 0; i < data.length; i += 4, pixel += 1) {
    const fill = blurredAlpha[pixel] > threshold ? 255 : 0;
    data[i] = 99;
    data[i + 1] = 115;
    data[i + 2] = 255;
    data[i + 3] = fill;
  }

  maskCtx.putImageData(image, 0, 0);
}

function boxBlurAlpha(source, width, height, radius) {
  const horizontal = new Uint8ClampedArray(source.length);
  const output = new Uint8ClampedArray(source.length);
  const diameter = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;

    for (let x = -radius; x <= radius; x += 1) {
      sum += source[row + clamp(x, 0, width - 1)];
    }

    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = sum / diameter;
      const removeX = clamp(x - radius, 0, width - 1);
      const addX = clamp(x + radius + 1, 0, width - 1);
      sum += source[row + addX] - source[row + removeX];
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0;

    for (let y = -radius; y <= radius; y += 1) {
      sum += horizontal[clamp(y, 0, height - 1) * width + x];
    }

    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = sum / diameter;
      const removeY = clamp(y - radius, 0, height - 1);
      const addY = clamp(y + radius + 1, 0, height - 1);
      sum += horizontal[addY * width + x] - horizontal[removeY * width + x];
    }
  }

  return output;
}

function slugify(value) {
  return normalizeWord(value).replace(/-+/g, "-").slice(0, 48) || "semantic-mask";
}

function buildMaskPathFromCanvas(sourceCanvas, outputWidth, outputHeight, threshold = 1) {
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = sourceCanvas;
  const image = sourceCtx.getImageData(0, 0, width, height);
  const data = image.data;
  const scaleX = outputWidth / width;
  const scaleY = outputHeight / height;
  const commands = [];

  for (let y = 0; y < height; y += 1) {
    let x = 0;

    while (x < width) {
      if (data[(y * width + x) * 4 + 3] <= threshold) {
        x += 1;
        continue;
      }

      const startX = x;

      while (x < width && data[(y * width + x) * 4 + 3] > threshold) {
        x += 1;
      }

      commands.push(
        `M${formatNumber(startX * scaleX)} ${formatNumber(y * scaleY)}H${formatNumber(
          x * scaleX,
        )}V${formatNumber((y + 1) * scaleY)}H${formatNumber(startX * scaleX)}Z`,
      );
    }
  }

  return commands.join("");
}

function buildSvgWordContours(settings) {
  return state.words
    .map((word) => {
      const transform = `translate(${formatNumber(word.x)} ${formatNumber(word.y)}) rotate(${formatNumber(
        word.angle,
      )}) scale(${formatNumber(1 + word.compression * 0.35)} ${formatNumber(
        1 - word.compression,
      )})`;

      return `    <text transform="${transform}" text-anchor="middle" dominant-baseline="central" font-family="Inter Tight, Inter, Arial, sans-serif" font-size="${formatNumber(
        word.fontSize,
      )}" font-weight="900">${escapeXml(word.text)}</text>`;
    })
    .join("\n");
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportMaskSvg() {
  const settings = getSettings();
  updateMask(settings);
  const maskBounds = getMaskBounds();
  const width = formatNumber(maskBounds.width);
  const height = formatNumber(maskBounds.height);
  const title = escapeXml(titleInput.value.trim().toLowerCase() || "semantic mask");
  const fullPath = buildMaskPathFromCanvas(state.maskCanvas, state.width, state.height);
  const path = fullPath
    ? `<g transform="translate(${formatNumber(-maskBounds.left)} ${formatNumber(-maskBounds.top)})"><path d="${fullPath}" /></g>`
    : "";

  if (!path) {
    return;
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">
  <title>${title}</title>
  <rect width="100%" height="100%" fill="#ffffff" />
  <g id="downloaded-mask" fill="#6373ff">
    ${path}
  </g>
</svg>
`;

  downloadTextFile(`${slugify(titleInput.value)}.svg`, svg, "image/svg+xml;charset=utf-8");
}

function drawDiagnostics() {
  const avgWeight =
    state.words.reduce((sum, word) => sum + word.weight, 0) / Math.max(state.words.length, 1);

  phaseLabel.textContent =
    state.frame < 60 ? "falling" : state.frame < 170 ? "stacking" : `shape ${avgWeight.toFixed(2)}`;
}

function render(time) {
  const settings = getSettings();
  updatePhysics(time);
  updateMask(settings);
  drawBackground();
  drawSourceHeadline();
  drawWords(ctx);
  drawMaskPreview();
  drawDiagnostics();
  requestAnimationFrame(render);
}

function resetSimulation() {
  state.frozen = false;
  freezeButton.setAttribute("aria-pressed", "false");
  freezeButton.textContent = "Freeze Shape";
  parseTitle();
}

function bindEvents() {
  let typingTimer = 0;

  titleInput.addEventListener("input", () => {
    window.clearTimeout(typingTimer);
    typingTimer = window.setTimeout(resetSimulation, 180);
  });

  resetButton.addEventListener("click", resetSimulation);
  exportSvgButton.addEventListener("click", exportMaskSvg);

  freezeButton.addEventListener("click", () => {
    state.frozen = !state.frozen;
    freezeButton.setAttribute("aria-pressed", String(state.frozen));
    freezeButton.textContent = state.frozen ? "Shape Frozen" : "Freeze Shape";
  });

  controls.seed.addEventListener("change", resetSimulation);
  controls.fontScale.addEventListener("input", resetSimulation);

  window.addEventListener("resize", () => {
    window.clearTimeout(state.resizeTimer);
    state.resizeTimer = window.setTimeout(() => {
      setupCanvas();
      resetSimulation();
    }, 120);
  });
}

setupCanvas();
bindEvents();
parseTitle();
requestAnimationFrame(render);
