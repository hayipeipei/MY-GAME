const LEVELS = [
  { difficulty: 1, candies: 6, sticks: 1, groups: 2, timeLimit: 8 },
  { difficulty: 2, candies: 8, sticks: 1, groups: 2, timeLimit: 9 },
  { difficulty: 3, candies: 10, sticks: 1, groups: 2, timeLimit: 10 },
  { difficulty: 4, candies: 12, sticks: 1, groups: 2, timeLimit: 11 },
  { difficulty: 5, candies: 12, sticks: 2, groups: 3, timeLimit: 18 },
  { difficulty: 6, candies: 15, sticks: 2, groups: 3, timeLimit: 20 },
  { difficulty: 7, candies: 18, sticks: 2, groups: 3, timeLimit: 22 },
  { difficulty: 8, candies: 21, sticks: 2, groups: 3, timeLimit: 24 },
  { difficulty: 9, candies: 16, sticks: 2, groups: 4, timeLimit: 25 },
  { difficulty: 10, candies: 20, sticks: 2, groups: 4, timeLimit: 27 },
  { difficulty: 11, candies: 24, sticks: 2, groups: 4, timeLimit: 28 },
  { difficulty: 12, candies: 28, sticks: 2, groups: 4, timeLimit: 30 },
];

const MIN_DISTANCE = 0.082;
const LINE_THRESHOLD = 0.024;
const STICK_IMAGE = "./棍子.png";

const candyImages = [
  "./糖果1.png",
  "./糖果2.png",
  "./糖果3.png",
  "./糖果4.png",
  "./糖果5.png",
  "./糖果6.png",
  "./糖果7.png",
];

const scene = document.getElementById("scene");
const table = document.getElementById("table");
const candiesLayer = document.getElementById("candiesLayer");
const sticksLayer = document.getElementById("sticksLayer");
const countsLayer = document.getElementById("countsLayer");
const statusText = document.getElementById("statusText");
const instructionText = document.getElementById("instructionText");
const levelText = document.getElementById("levelText");
const timerText = document.getElementById("timerText");
const resetButton = document.getElementById("resetButton");

let levelIndex = 0;
let candies = [];
let placedSticks = [];
let drawingStick = null;
let pointerId = null;
let solved = false;
let audioContext = null;
let timerId = null;
let timeLeft = 0;

function currentLevel() {
  return LEVELS[levelIndex];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getTargetPerGroup() {
  return currentLevel().candies / currentLevel().groups;
}

function getTableBounds() {
  const sceneRect = scene.getBoundingClientRect();
  const tableRect = table.getBoundingClientRect();

  return {
    left: (tableRect.left - sceneRect.left) / sceneRect.width,
    top: (tableRect.top - sceneRect.top) / sceneRect.height,
    width: tableRect.width / sceneRect.width,
    height: tableRect.height / sceneRect.height,
  };
}

function lineMetrics(line) {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const length = Math.hypot(dx, dy);
  return { dx, dy, length };
}

function getGroupCenters(bounds) {
  const cx = bounds.left + bounds.width / 2;
  const cy = bounds.top + bounds.height / 2;

  if (currentLevel().groups === 2) {
    return [
      { x: cx - bounds.width * 0.2, y: cy },
      { x: cx + bounds.width * 0.2, y: cy },
    ];
  }

  if (currentLevel().groups === 3) {
    return [
      { x: cx - bounds.width * 0.24, y: cy },
      { x: cx, y: cy },
      { x: cx + bounds.width * 0.24, y: cy },
    ];
  }

  return [
    { x: cx - bounds.width * 0.18, y: cy - bounds.height * 0.18 },
    { x: cx + bounds.width * 0.18, y: cy - bounds.height * 0.18 },
    { x: cx - bounds.width * 0.18, y: cy + bounds.height * 0.18 },
    { x: cx + bounds.width * 0.18, y: cy + bounds.height * 0.18 },
  ];
}

function groupJitter(bounds) {
  if (currentLevel().groups === 4) {
    return {
      x: bounds.width * 0.075,
      y: bounds.height * 0.085,
    };
  }

  return {
    x: bounds.width * 0.06,
    y: bounds.height * 0.1,
  };
}

function shuffled(array) {
  const next = [...array];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function buildGroupOffsets(count, bounds) {
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const spacingX = bounds.width * (currentLevel().groups === 4 ? 0.095 : 0.085);
  const spacingY = bounds.height * (currentLevel().groups === 4 ? 0.105 : 0.1);
  const offsets = [];

  for (let row = 0; row < rows; row += 1) {
    const countInRow = Math.min(columns, count - row * columns);
    const rowWidth = (countInRow - 1) * spacingX;
    for (let col = 0; col < countInRow; col += 1) {
      const x = col * spacingX - rowWidth / 2;
      const y = row * spacingY - ((rows - 1) * spacingY) / 2;
      const stagger = row % 2 === 0 ? 0 : spacingX * 0.18;
      offsets.push({ x: x + stagger, y });
    }
  }

  return shuffled(offsets);
}

function buildCandyPosition(existingPositions, bounds, index, center, offset) {
  const jitter = groupJitter(bounds);
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const candidate = {
      x: clamp(
        center.x + offset.x + randomBetween(-jitter.x * 0.18, jitter.x * 0.18),
        bounds.left + 0.07,
        bounds.left + bounds.width - 0.07,
      ),
      y: clamp(
        center.y + offset.y + randomBetween(-jitter.y * 0.18, jitter.y * 0.18),
        bounds.top + 0.09,
        bounds.top + bounds.height - 0.09,
      ),
      rotation: `${Math.round(randomBetween(-25, 25))}deg`,
      image: candyImages[(index + attempt) % candyImages.length],
    };

    const isFarEnough = existingPositions.every((item) => distance(item, candidate) >= MIN_DISTANCE);
    if (isFarEnough) {
      return candidate;
    }
  }

  return {
    x: clamp(center.x + offset.x, bounds.left + 0.07, bounds.left + bounds.width - 0.07),
    y: clamp(center.y + offset.y, bounds.top + 0.09, bounds.top + bounds.height - 0.09),
    rotation: `${Math.round(randomBetween(-18, 18))}deg`,
    image: candyImages[index % candyImages.length],
  };
}

function renderCandies() {
  candiesLayer.innerHTML = "";
  candies.forEach((candy, index) => {
    const node = document.createElement("img");
    node.className = "candy";
    node.src = candy.image;
    alt = `糖果 ${index + 1}`;
    node.style.left = `${candy.x * 100}%`;
    node.style.top = `${candy.y * 100}%`;
    node.style.setProperty("--rotation", candy.rotation);
    candiesLayer.appendChild(node);
  });
}

function clearOverlays() {
  sticksLayer.innerHTML = "";
  countsLayer.innerHTML = "";
}

function updateHud() {
  const level = currentLevel();
  instructionText.textContent = `第 ${level.difficulty} 关：画 ${level.sticks} 根棍子，把 ${level.candies} 颗糖果分成 ${level.groups} 份，每份 ${getTargetPerGroup()} 颗。`;
  levelText.textContent = `第 ${level.difficulty} 关｜糖果 ${level.candies} 颗｜${level.sticks} 根棍子`;
  timerText.textContent = `剩余时间：${timeLeft}s`;
}

function createCandies() {
  const bounds = getTableBounds();
  const centers = getGroupCenters(bounds);
  const groupSize = getTargetPerGroup();
  const nextCandies = [];

  for (let groupIndex = 0; groupIndex < currentLevel().groups; groupIndex += 1) {
    const center = centers[groupIndex];
    const offsets = buildGroupOffsets(groupSize, bounds);

    for (let slot = 0; slot < groupSize; slot += 1) {
      const index = groupIndex * groupSize + slot;
      const candy = buildCandyPosition(nextCandies, bounds, index, center, offsets[slot]);
      nextCandies.push(candy);
    }
  }

  candies = nextCandies;
  renderCandies();
}

function getAudioContext() {
  if (!audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
      return null;
    }
    audioContext = new AudioCtor();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  return audioContext;
}

function playTone({ frequency, duration, type = "sine", gain = 0.05, delay = 0 }) {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  const startTime = ctx.currentTime + delay;
  const endTime = startTime + duration;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(gain, startTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(endTime);
}

function playPlaceSound() {
  playTone({ frequency: 420, duration: 0.12, type: "triangle", gain: 0.035 });
}

function playSuccessSound() {
  playTone({ frequency: 523.25, duration: 0.16, type: "triangle", gain: 0.05 });
  playTone({ frequency: 659.25, duration: 0.18, type: "triangle", gain: 0.05, delay: 0.08 });
  playTone({ frequency: 783.99, duration: 0.24, type: "triangle", gain: 0.05, delay: 0.16 });
}

function playFailSound() {
  playTone({ frequency: 320, duration: 0.16, type: "sawtooth", gain: 0.035 });
  playTone({ frequency: 240, duration: 0.2, type: "sawtooth", gain: 0.03, delay: 0.08 });
}

function stopTimer() {
  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function startTimer() {
  stopTimer();
  timeLeft = currentLevel().timeLimit;
  updateHud();
  timerId = window.setInterval(() => {
    if (solved) {
      stopTimer();
      return;
    }

    timeLeft -= 1;
    timerText.textContent = `剩余时间：${Math.max(0, timeLeft)}s`;
    if (timeLeft > 0) {
      return;
    }

    stopTimer();
    playFailSound();
    resetRound(`第 ${currentLevel().difficulty} 关超时了，再试一次。`);
  }, 1000);
}

function resetRound(message) {
  placedSticks = [];
  drawingStick = null;
  pointerId = null;
  solved = false;
  clearOverlays();
  createCandies();
  timeLeft = currentLevel().timeLimit;
  updateHud();
  statusText.textContent = message;
  scene.classList.remove("success");
  startTimer();
}

function scenePointFromEvent(event) {
  const rect = scene.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  };
}

function midpoint(line) {
  return {
    x: (line.start.x + line.end.x) / 2,
    y: (line.start.y + line.end.y) / 2,
  };
}

function renderStick(line, badgeState = "", temp = false) {
  const { dx, dy, length } = lineMetrics(line);
  const angle = Math.atan2(dy, dx);
  const mid = midpoint(line);
  const stick = document.createElement("img");
  stick.className = `stick${temp ? " temp-stick" : ""}`;
  stick.src = STICK_IMAGE;
  stick.alt = "";
  stick.style.left = `${line.start.x * 100}%`;
  stick.style.top = `${line.start.y * 100}%`;
  stick.style.width = `${length * 100}%`;
  stick.style.transform = `translateY(-50%) rotate(${angle}rad)`;
  sticksLayer.appendChild(stick);

  if (badgeState) {
    const badge = document.createElement("div");
    badge.className = `stick-badge ${badgeState}`;
    badge.textContent = badgeState === "ok" ? "✓" : "✕";
    badge.style.left = `${mid.x * 100}%`;
    badge.style.top = `${mid.y * 100}%`;
    sticksLayer.appendChild(badge);
  }
}

function renderPlacedSticks(badgeState = "") {
  sticksLayer.innerHTML = "";
  placedSticks.forEach((line) => renderStick(line, badgeState));
  if (drawingStick) {
    renderStick(drawingStick, "", true);
  }
}

function renderCountBubbles(regions) {
  countsLayer.innerHTML = "";
  regions.forEach((region) => {
    const bubble = document.createElement("div");
    bubble.className = "count-bubble";
    bubble.textContent = `${region.count}颗`;
    bubble.style.left = `${region.anchor.x * 100}%`;
    bubble.style.top = `${region.anchor.y * 100}%`;
    countsLayer.appendChild(bubble);
  });
}

function regionKeyForCandy(candy, lines) {
  return lines.map((line) => {
    const { dx, dy, length } = lineMetrics(line);
    const side = dx * (candy.y - line.start.y) - dy * (candy.x - line.start.x);
    const distanceToLine = Math.abs(side) / length;
    if (distanceToLine < LINE_THRESHOLD) {
      return null;
    }
    return side > 0 ? "1" : "0";
  });
}

function analyzeCurrentSticks() {
  if (placedSticks.length !== currentLevel().sticks) {
    return null;
  }

  const groups = new Map();

  for (const candy of candies) {
    const keyParts = regionKeyForCandy(candy, placedSticks);
    if (keyParts.includes(null)) {
      return { ok: false, message: "有糖果压在棍子上，换个位置再试试。" };
    }

    const key = keyParts.join("");
    if (!groups.has(key)) {
      groups.set(key, {
        count: 0,
        points: [],
      });
    }
    const entry = groups.get(key);
    entry.count += 1;
    entry.points.push(candy);
  }

  if (groups.size !== currentLevel().groups) {
    return {
      ok: false,
      message: `这一关需要分成 ${currentLevel().groups} 份，现在分出来的是 ${groups.size} 份。`,
    };
  }

  const regions = Array.from(groups.values()).map((entry) => {
    const anchor = entry.points.reduce(
      (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
      { x: 0, y: 0 },
    );

    return {
      count: entry.count,
      anchor: {
        x: anchor.x / entry.points.length,
        y: anchor.y / entry.points.length,
      },
    };
  });

  const target = getTargetPerGroup();
  const ok = regions.every((region) => region.count === target);

  return {
    ok,
    regions,
    message: ok
      ? `分对了，每份都是 ${target} 颗！`
      : `还没分对，目标是每份 ${target} 颗。`,
  };
}

function goToNextLevel() {
  if (levelIndex < LEVELS.length - 1) {
    levelIndex += 1;
    resetRound(`进入第 ${currentLevel().difficulty} 关。`);
    return;
  }

  levelIndex = 0;
  resetRound("全部关卡完成了，从第 1 关重新开始。");
}

function commitStickAndCheck() {
  const analysis = analyzeCurrentSticks();
  if (!analysis) {
    const left = currentLevel().sticks - placedSticks.length;
    statusText.textContent = left > 0 ? `已放好一根棍子，再画 ${left} 根。` : statusText.textContent;
    renderPlacedSticks();
    return;
  }

  renderPlacedSticks(analysis.ok ? "ok" : "bad");
  if (analysis.regions) {
    renderCountBubbles(analysis.regions);
  }
  statusText.textContent = analysis.message;

  if (!analysis.ok) {
    solved = false;
    playFailSound();
    return;
  }

  solved = true;
  stopTimer();
  playSuccessSound();
  scene.classList.remove("success");
  void scene.offsetWidth;
  scene.classList.add("success");

  window.setTimeout(() => {
    goToNextLevel();
  }, 1000);
}

function beginStick(event) {
  if (pointerId !== null || solved) {
    return;
  }

  if (placedSticks.length >= currentLevel().sticks) {
    placedSticks = [];
    drawingStick = null;
    clearOverlays();
    statusText.textContent = "重新摆一遍棍子，试着把糖果平均分开。";
  }

  event.preventDefault();
  pointerId = event.pointerId;
  const start = scenePointFromEvent(event);
  drawingStick = { start, end: start };
  renderPlacedSticks();
}

function moveStick(event) {
  if (drawingStick === null || event.pointerId !== pointerId) {
    return;
  }

  event.preventDefault();
  drawingStick.end = scenePointFromEvent(event);
  renderPlacedSticks();
}

function finishStick(event) {
  if (drawingStick === null || event.pointerId !== pointerId) {
    return;
  }

  event.preventDefault();
  drawingStick.end = scenePointFromEvent(event);
  const { length } = lineMetrics(drawingStick);
  if (length < 0.14) {
    drawingStick = null;
    pointerId = null;
    renderPlacedSticks();
    statusText.textContent = "棍子太短了，画长一点更容易分糖果。";
    return;
  }

  placedSticks.push(drawingStick);
  drawingStick = null;
  pointerId = null;
  playPlaceSound();
  commitStickAndCheck();
}

scene.addEventListener("pointerdown", beginStick);
scene.addEventListener("pointermove", moveStick);
window.addEventListener("pointerup", finishStick);
window.addEventListener("pointercancel", finishStick);

document.body.addEventListener("touchmove", (e) => {
  e.preventDefault();
}, { passive: false });

resetButton.addEventListener("click", () => {
  resetRound(`第 ${currentLevel().difficulty} 关重新开始。`);
});

window.addEventListener("resize", () => {
  resetRound(`第 ${currentLevel().difficulty} 关场景已更新。`);
});

window.addEventListener("load", () => {
  resetRound(`进入第 ${currentLevel().difficulty} 关。`);
});
