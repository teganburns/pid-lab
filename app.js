(() => {
  const root = document.querySelector("[data-pid-lab]");
  if (!root) return;

  const canvas = root.querySelector("#response-chart");
  const context = canvas.getContext("2d");
  const viewSelect = root.querySelector("#chart-view");
  const inputs = Array.from(root.querySelectorAll("[data-param]"));
  const presetButtons = Array.from(root.querySelectorAll("[data-preset]"));
  const runLabel = root.querySelector("[data-run-icon]");
  const toggleButton = root.querySelector("[data-action='toggle']");
  const resetButton = root.querySelector("[data-action='reset']");
  const statusText = root.querySelector("[data-status-text]");
  const statusDot = root.querySelector("[data-status-dot]");
  const simTime = root.querySelector("[data-sim-time]");
  const tip = root.querySelector("[data-tip]");
  const metric = {
    rise: root.querySelector("[data-metric='rise']"),
    overshoot: root.querySelector("[data-metric='overshoot']"),
    error: root.querySelector("[data-metric='error']"),
    settling: root.querySelector("[data-metric='settling']"),
  };
  const gameCanvas = root.querySelector("#game-chart");
  const gameContext = gameCanvas ? gameCanvas.getContext("2d") : null;
  const gameLevelButtons = Array.from(root.querySelectorAll("[data-game-level]"));
  const gameInputs = Array.from(root.querySelectorAll("[data-game-param]"));
  const gameTitle = root.querySelector("[data-game-title]");
  const gameBrief = root.querySelector("[data-game-brief]");
  const gameConstraints = root.querySelector("[data-game-constraints]");
  const gameFeedback = root.querySelector("[data-game-feedback]");
  const gameCheckButton = root.querySelector("[data-game-action='check']");
  const gameResetButton = root.querySelector("[data-game-action='reset']");
  const gameNextButton = root.querySelector("[data-game-action='next']");
  const gameFixed = {
    setpoint: root.querySelector("[data-game-fixed='setpoint']"),
    disturbance: root.querySelector("[data-game-fixed='disturbance']"),
    damping: root.querySelector("[data-game-fixed='damping']"),
  };
  const gameMetric = {
    rise: root.querySelector("[data-game-metric='rise']"),
    overshoot: root.querySelector("[data-game-metric='overshoot']"),
    error: root.querySelector("[data-game-metric='error']"),
    settling: root.querySelector("[data-game-metric='settling']"),
  };
  const gameTarget = {
    rise: root.querySelector("[data-game-target='rise']"),
    overshoot: root.querySelector("[data-game-target='overshoot']"),
    error: root.querySelector("[data-game-target='error']"),
    settling: root.querySelector("[data-game-target='settling']"),
  };
  const gameCard = {
    rise: root.querySelector("[data-game-card='rise']"),
    overshoot: root.querySelector("[data-game-card='overshoot']"),
    error: root.querySelector("[data-game-card='error']"),
    settling: root.querySelector("[data-game-card='settling']"),
  };

  const duration = 50;
  const dt = 0.05;
  const stepTime = 2;
  const disturbanceTime = 15;
  const presets = {
    stable: { kp: 2, ki: 0.5, kd: 0.2, setpoint: 1, disturbance: 0.3, damping: 0.7 },
    overshoot: { kp: 5.4, ki: 1.05, kd: 0.03, setpoint: 1, disturbance: 0.25, damping: 0.32 },
    sluggish: { kp: 0.85, ki: 0.12, kd: 0.18, setpoint: 1, disturbance: 0.2, damping: 1.45 },
    disturbance: { kp: 2.7, ki: 0.8, kd: 0.32, setpoint: 1, disturbance: 0.7, damping: 0.72 },
  };
  const tips = {
    stable: "Tip: Increase Kp to reduce rise time. Add Ki to remove steady-state error. Add Kd to reduce overshoot.",
    overshoot: "Tip: Overshoot usually means the controller is pushing too hard or damping too little.",
    sluggish: "Tip: A sluggish loop often needs more proportional gain before adding integral action.",
    disturbance: "Tip: Integral action helps recover after a load disturbance, but too much Ki can ring.",
  };
  const gameStorageKey = "pidLabGameProgress";
  const gameLevels = [
    {
      id: "P",
      title: "Level 1: P Control",
      brief: "Use proportional gain to make the loop respond quickly without letting overshoot get out of hand.",
      active: ["kp"],
      fixed: { setpoint: 1, disturbance: 0, damping: 0.95, ki: 0, kd: 0 },
      initial: { kp: 1, ki: 0, kd: 0 },
      target: { rise: 2.2, overshoot: 35, error: 18 },
    },
    {
      id: "PI",
      title: "Level 2: PI Control",
      brief: "Add integral gain to recover from a load disturbance and remove steady-state error.",
      active: ["kp", "ki"],
      fixed: { setpoint: 1, disturbance: 0.2, damping: 0.85, kd: 0 },
      initial: { kp: 1, ki: 0.2, kd: 0 },
      target: { rise: 2.5, overshoot: 12, error: 3, settling: 26 },
    },
    {
      id: "PD",
      title: "Level 3: PD Control",
      brief: "Use derivative gain to damp a lively plant while keeping the response fast.",
      active: ["kp", "kd"],
      fixed: { setpoint: 1, disturbance: 0, damping: 0.35, ki: 0 },
      initial: { kp: 2, ki: 0, kd: 0.1 },
      target: { rise: 2.2, overshoot: 12, error: 18 },
    },
    {
      id: "PID",
      title: "Level 4: PID Control",
      brief: "Balance all three gains to move quickly, reject the disturbance, and settle cleanly.",
      active: ["kp", "ki", "kd"],
      fixed: { setpoint: 1, disturbance: 0.45, damping: 0.65 },
      initial: { kp: 1.2, ki: 0.25, kd: 0.15 },
      target: { rise: 2.5, overshoot: 10, error: 3, settling: 26 },
    },
  ];

  let params = { ...presets.stable };
  let activePreset = "stable";
  let running = true;
  let samples = [];
  let plant = createPlant();
  let lastFrame = 0;
  let gameProgress = loadGameProgress();
  let gameLevelIndex = Math.min(gameProgress.highestUnlocked, gameLevels.length - 1);
  let gameParams = {};
  let gameSamples = [];
  let gameMetrics = {};

  function createPlant() {
    return { time: 0, output: 0, velocity: 0, integral: 0, previousError: 0 };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function setpointAt(time, source) {
    return time >= stepTime ? source.setpoint : 0;
  }

  function disturbanceAt(time, source) {
    return time >= disturbanceTime ? source.disturbance : 0;
  }

  function advancePlant(state, source) {
    const target = setpointAt(state.time, source);
    const error = target - state.output;
    state.integral = clamp(state.integral + error * dt, -8, 8);
    const derivative = (error - state.previousError) / dt;
    const control = clamp(source.kp * error + source.ki * state.integral + source.kd * derivative, -14, 14);
    const acceleration = control - state.output - source.damping * 1.7 * state.velocity - disturbanceAt(state.time, source);

    state.velocity = clamp(state.velocity + acceleration * dt, -8, 8);
    state.output = clamp(state.output + state.velocity * dt, -4, 4);
    state.previousError = error;
    state.time += dt;

    return {
      time: state.time,
      setpoint: setpointAt(state.time, source),
      output: state.output,
      error: setpointAt(state.time, source) - state.output,
      control,
    };
  }

  function simulateResponse(source) {
    const state = createPlant();
    const simulated = [{ time: 0, setpoint: 0, output: 0, error: 0, control: 0 }];
    while (state.time < duration) {
      simulated.push(advancePlant(state, source));
    }
    return simulated;
  }

  function simulateStep() {
    samples.push(advancePlant(plant, params));

    if (plant.time >= duration) {
      running = false;
      updateRunState();
    }
  }

  function resetSimulation(shouldRun = running) {
    plant = createPlant();
    samples = [{ time: 0, setpoint: 0, output: 0, error: 0, control: 0 }];
    running = shouldRun;
    updateRunState();
    updateMetrics();
    drawChart();
  }

  function syncInputs() {
    inputs.forEach((input) => {
      input.value = Number(params[input.dataset.param]).toFixed(2);
    });
  }

  function setParam(name, rawValue) {
    const related = inputs.filter((input) => input.dataset.param === name);
    const min = Number(related[0].min);
    const max = Number(related[0].max);
    const value = clamp(Number(rawValue), min, max);
    params[name] = value;
    related.forEach((input) => {
      input.value = value.toFixed(2);
    });
    activePreset = "custom";
    updatePresetButtons();
    resetSimulation(true);
  }

  function updatePresetButtons() {
    presetButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.preset === activePreset);
    });
  }

  function applyPreset(name) {
    params = { ...presets[name] };
    activePreset = name;
    syncInputs();
    updatePresetButtons();
    tip.textContent = tips[name];
    resetSimulation(true);
  }

  function updateRunState() {
    runLabel.textContent = running ? "Pause" : "Run";
    statusText.textContent = running ? "Running" : plant.time >= duration ? "Complete" : "Paused";
    statusDot.classList.toggle("is-paused", !running);
  }

  function formatSeconds(value) {
    return Number.isFinite(value) ? `${value.toFixed(2)} s` : "--";
  }

  function formatPercent(value) {
    return Number.isFinite(value) ? `${value.toFixed(1)}%` : "--";
  }

  function computeMetrics(sourceSamples, source) {
    const afterStep = sourceSamples.filter((point) => point.time >= stepTime);
    const target = Math.max(0.001, Math.abs(source.setpoint));
    const reached10 = afterStep.find((point) => point.output >= 0.1 * target);
    const reached90 = afterStep.find((point) => point.output >= 0.9 * target);
    const rise = reached10 && reached90 ? reached90.time - reached10.time : Number.NaN;
    const peak = afterStep.reduce((max, point) => Math.max(max, point.output), -Infinity);
    const overshoot = Math.max(0, ((peak - target) / target) * 100);
    const last = sourceSamples[sourceSamples.length - 1];
    const steadyError = last ? Math.abs(source.setpoint - last.output) / target * 100 : Number.NaN;
    const tolerance = target * 0.02;
    let settling = Number.NaN;

    for (let index = 0; index < afterStep.length; index += 1) {
      const candidate = afterStep[index];
      const allSettled = afterStep.slice(index).every((point) => Math.abs(source.setpoint - point.output) <= tolerance);
      if (allSettled) {
        settling = candidate.time - stepTime;
        break;
      }
    }

    return { rise, overshoot, error: steadyError, settling };
  }

  function updateMetrics() {
    const currentMetrics = computeMetrics(samples, params);
    metric.rise.textContent = formatSeconds(currentMetrics.rise);
    metric.overshoot.textContent = formatPercent(currentMetrics.overshoot);
    metric.error.textContent = formatPercent(currentMetrics.error);
    metric.settling.textContent = formatSeconds(currentMetrics.settling);
    simTime.textContent = `${Math.min(plant.time, duration).toFixed(1)} s`;
  }

  function resizeCanvas(targetCanvas = canvas, targetContext = context) {
    const rect = targetCanvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(320, rect.width);
    const height = Math.max(260, rect.height);
    if (targetCanvas.width !== Math.round(width * ratio) || targetCanvas.height !== Math.round(height * ratio)) {
      targetCanvas.width = Math.round(width * ratio);
      targetCanvas.height = Math.round(height * ratio);
    }
    targetContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { width, height };
  }

  function getSeries(view = viewSelect.value) {
    if (view === "error") return [{ key: "error", color: "#f97316" }];
    if (view === "control") return [{ key: "control", color: "#f97316" }];
    return [
      { key: "setpoint", color: "#2563eb" },
      { key: "output", color: "#11863b" },
    ];
  }

  function drawResponseChart(targetCanvas, targetContext, sourceSamples, source, series, yLabel, showDisturbance = true) {
    const { width, height } = resizeCanvas(targetCanvas, targetContext);
    const margin = { top: 22, right: 18, bottom: 42, left: 50 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const values = [0, source.setpoint];

    sourceSamples.forEach((point) => {
      series.forEach((item) => values.push(point[item.key]));
    });

    let minY = Math.min(...values);
    let maxY = Math.max(...values);
    if (maxY - minY < 0.5) {
      maxY += 0.25;
      minY -= 0.25;
    }
    const pad = (maxY - minY) * 0.15;
    minY -= pad;
    maxY += pad;

    const xScale = (time) => margin.left + (time / duration) * plotWidth;
    const yScale = (value) => margin.top + (1 - (value - minY) / (maxY - minY)) * plotHeight;

    targetContext.clearRect(0, 0, width, height);
    targetContext.fillStyle = "#ffffff";
    targetContext.fillRect(0, 0, width, height);
    targetContext.strokeStyle = "#d9e0e8";
    targetContext.lineWidth = 1;
    targetContext.setLineDash([5, 5]);

    for (let i = 0; i <= 5; i += 1) {
      const x = margin.left + (plotWidth / 5) * i;
      targetContext.beginPath();
      targetContext.moveTo(x, margin.top);
      targetContext.lineTo(x, margin.top + plotHeight);
      targetContext.stroke();
    }

    for (let i = 0; i <= 4; i += 1) {
      const y = margin.top + (plotHeight / 4) * i;
      targetContext.beginPath();
      targetContext.moveTo(margin.left, y);
      targetContext.lineTo(margin.left + plotWidth, y);
      targetContext.stroke();
    }

    targetContext.setLineDash([]);
    targetContext.strokeStyle = "#b9c4d1";
    targetContext.beginPath();
    targetContext.moveTo(margin.left, margin.top);
    targetContext.lineTo(margin.left, margin.top + plotHeight);
    targetContext.lineTo(margin.left + plotWidth, margin.top + plotHeight);
    targetContext.stroke();

    targetContext.fillStyle = "#1f2933";
    targetContext.font = "12px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    targetContext.textAlign = "right";
    targetContext.textBaseline = "middle";
    for (let i = 0; i <= 4; i += 1) {
      const value = maxY - ((maxY - minY) / 4) * i;
      targetContext.fillText(value.toFixed(1), margin.left - 10, margin.top + (plotHeight / 4) * i);
    }

    targetContext.textAlign = "center";
    targetContext.textBaseline = "top";
    for (let i = 0; i <= 5; i += 1) {
      const value = (duration / 5) * i;
      targetContext.fillText(value.toFixed(0), margin.left + (plotWidth / 5) * i, margin.top + plotHeight + 10);
    }
    targetContext.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    targetContext.fillText("Time (s)", margin.left + plotWidth / 2, height - 16);

    targetContext.save();
    targetContext.translate(16, margin.top + plotHeight / 2);
    targetContext.rotate(-Math.PI / 2);
    targetContext.fillText(yLabel, 0, 0);
    targetContext.restore();

    if (showDisturbance) {
      const disturbanceX = xScale(disturbanceTime);
      targetContext.strokeStyle = "#f97316";
      targetContext.setLineDash([4, 4]);
      targetContext.beginPath();
      targetContext.moveTo(disturbanceX, margin.top);
      targetContext.lineTo(disturbanceX, margin.top + plotHeight);
      targetContext.stroke();
      targetContext.setLineDash([]);
      targetContext.fillStyle = "#f97316";
      targetContext.textAlign = "center";
      targetContext.textBaseline = "bottom";
      targetContext.fillText("disturbance", disturbanceX, margin.top - 4);
    }

    series.forEach((item) => {
      targetContext.strokeStyle = item.color;
      targetContext.lineWidth = item.key === "setpoint" ? 2 : 2.5;
      targetContext.beginPath();
      sourceSamples.forEach((point, index) => {
        const x = xScale(point.time);
        const y = yScale(point[item.key]);
        if (index === 0) {
          targetContext.moveTo(x, y);
        } else {
          targetContext.lineTo(x, y);
        }
      });
      targetContext.stroke();
    });
  }

  function drawChart() {
    const yLabel = viewSelect.value === "response" ? "PV" : viewSelect.value === "error" ? "Error" : "Control";
    drawResponseChart(canvas, context, samples, params, getSeries(), yLabel, true);
  }

  function loadGameProgress() {
    try {
      const stored = window.localStorage.getItem(gameStorageKey);
      if (!stored) return { highestUnlocked: 0, best: {} };
      const parsed = JSON.parse(stored);
      return {
        highestUnlocked: clamp(Number(parsed.highestUnlocked) || 0, 0, gameLevels.length - 1),
        best: parsed.best && typeof parsed.best === "object" ? parsed.best : {},
      };
    } catch {
      return { highestUnlocked: 0, best: {} };
    }
  }

  function saveGameProgress() {
    try {
      window.localStorage.setItem(gameStorageKey, JSON.stringify(gameProgress));
    } catch {
      // localStorage can be unavailable in private contexts; the game still works for this session.
    }
  }

  function currentGameLevel() {
    return gameLevels[gameLevelIndex];
  }

  function formatGameTarget(key, value) {
    if (!Number.isFinite(value)) return "No target";
    return key === "rise" || key === "settling" ? `Target <= ${value.toFixed(2)} s` : `Target <= ${value.toFixed(1)}%`;
  }

  function buildGameSource() {
    const level = currentGameLevel();
    return {
      ...level.fixed,
      kp: level.active.includes("kp") ? gameParams.kp : 0,
      ki: level.active.includes("ki") ? gameParams.ki : 0,
      kd: level.active.includes("kd") ? gameParams.kd : 0,
    };
  }

  function isMetricPassing(key) {
    const target = currentGameLevel().target[key];
    if (!Number.isFinite(target)) return true;
    return Number.isFinite(gameMetrics[key]) && gameMetrics[key] <= target;
  }

  function isGamePassing() {
    return ["rise", "overshoot", "error", "settling"].every(isMetricPassing);
  }

  function gameFeedbackText() {
    const level = currentGameLevel();
    if (Number.isFinite(level.target.rise) && !isMetricPassing("rise")) {
      return "Rise time is slow. Increase Kp to make the process variable move sooner.";
    }
    if (Number.isFinite(level.target.overshoot) && !isMetricPassing("overshoot")) {
      return level.active.includes("kd")
        ? "Overshoot is high. Reduce Kp or add Kd to damp the response."
        : "Overshoot is high. Reduce Kp until the response stops jumping past the setpoint.";
    }
    if (Number.isFinite(level.target.error) && !isMetricPassing("error")) {
      return level.active.includes("ki")
        ? "Steady-state error is high. Add Ki to push out the remaining offset."
        : "Steady-state error is high. With P-only control, increase Kp while keeping overshoot under control.";
    }
    if (Number.isFinite(level.target.settling) && !isMetricPassing("settling")) {
      return "Settling is taking too long. Reduce overshoot first, then soften aggressive integral action if it keeps ringing.";
    }
    return "This tune meets every target. Move to the next level when you are ready.";
  }

  function updateGameLevelButtons() {
    gameLevelButtons.forEach((button) => {
      const index = Number(button.dataset.gameLevel);
      const level = gameLevels[index];
      const isUnlocked = index <= gameProgress.highestUnlocked;
      button.disabled = !isUnlocked;
      button.classList.toggle("is-active", index === gameLevelIndex);
      button.classList.toggle("is-passed", Boolean(gameProgress.best[level.id]));
      button.setAttribute("aria-pressed", String(index === gameLevelIndex));
    });
  }

  function updateGameInputs() {
    const level = currentGameLevel();
    gameInputs.forEach((input) => {
      const name = input.dataset.gameParam;
      const isActive = level.active.includes(name);
      const value = isActive ? gameParams[name] : 0;
      input.disabled = !isActive;
      input.value = Number(value).toFixed(2);
    });
  }

  function updateGameMetricCards(showResult = false) {
    ["rise", "overshoot", "error", "settling"].forEach((key) => {
      const card = gameCard[key];
      const target = currentGameLevel().target[key];
      if (!card) return;
      card.classList.remove("is-pass", "is-fail");
      if (showResult && Number.isFinite(target)) {
        card.classList.add(isMetricPassing(key) ? "is-pass" : "is-fail");
      }
    });
  }

  function renderGame(showResult = false) {
    if (!gameCanvas || !gameContext) return;

    const level = currentGameLevel();
    const source = buildGameSource();
    gameSamples = simulateResponse(source);
    gameMetrics = computeMetrics(gameSamples, source);

    gameTitle.textContent = level.title;
    gameBrief.textContent = level.brief;
    gameConstraints.textContent = `Unlocked: ${level.active.map((name) => name.toUpperCase()).join(", ")}. Locked gains stay pinned at 0.00.`;
    gameFixed.setpoint.textContent = `SP ${source.setpoint.toFixed(2)}`;
    gameFixed.disturbance.textContent = `Disturbance ${source.disturbance.toFixed(2)}`;
    gameFixed.damping.textContent = `Damping ${source.damping.toFixed(2)}`;

    gameMetric.rise.textContent = formatSeconds(gameMetrics.rise);
    gameMetric.overshoot.textContent = formatPercent(gameMetrics.overshoot);
    gameMetric.error.textContent = formatPercent(gameMetrics.error);
    gameMetric.settling.textContent = formatSeconds(gameMetrics.settling);

    gameTarget.rise.textContent = formatGameTarget("rise", level.target.rise);
    gameTarget.overshoot.textContent = formatGameTarget("overshoot", level.target.overshoot);
    gameTarget.error.textContent = formatGameTarget("error", level.target.error);
    gameTarget.settling.textContent = formatGameTarget("settling", level.target.settling);

    updateGameLevelButtons();
    updateGameInputs();
    updateGameMetricCards(showResult);

    const hasPassed = Boolean(gameProgress.best[level.id]);
    gameFeedback.classList.toggle("is-pass", showResult && isGamePassing());
    gameFeedback.classList.toggle("is-fail", showResult && !isGamePassing());
    if (!showResult) {
      gameFeedback.textContent = hasPassed
        ? "Level passed. You can keep experimenting or move on."
        : "Tune the unlocked gains, then check your response against the targets.";
    }
    gameNextButton.disabled = gameLevelIndex >= gameLevels.length - 1 || !hasPassed;
    drawResponseChart(gameCanvas, gameContext, gameSamples, source, getSeries("response"), "PV", source.disturbance !== 0);
  }

  function selectGameLevel(index) {
    if (index > gameProgress.highestUnlocked) return;
    gameLevelIndex = clamp(index, 0, gameLevels.length - 1);
    const level = currentGameLevel();
    const saved = gameProgress.best[level.id]?.params;
    gameParams = { ...level.initial, ...(saved || {}) };
    renderGame(false);
  }

  function resetGameLevel() {
    gameParams = { ...currentGameLevel().initial };
    renderGame(false);
  }

  function setGameParam(name, rawValue) {
    const level = currentGameLevel();
    if (!level.active.includes(name)) return;
    const related = gameInputs.filter((input) => input.dataset.gameParam === name);
    const min = Number(related[0].min);
    const max = Number(related[0].max);
    gameParams[name] = clamp(Number(rawValue), min, max);
    renderGame(false);
  }

  function checkGameTune() {
    const passed = isGamePassing();
    gameFeedback.textContent = gameFeedbackText();
    gameFeedback.classList.toggle("is-pass", passed);
    gameFeedback.classList.toggle("is-fail", !passed);
    updateGameMetricCards(true);

    if (passed) {
      const level = currentGameLevel();
      gameProgress.highestUnlocked = Math.max(gameProgress.highestUnlocked, Math.min(gameLevelIndex + 1, gameLevels.length - 1));
      gameProgress.best[level.id] = {
        params: { kp: gameParams.kp || 0, ki: gameParams.ki || 0, kd: gameParams.kd || 0 },
        metrics: {
          rise: gameMetrics.rise,
          overshoot: gameMetrics.overshoot,
          error: gameMetrics.error,
          settling: gameMetrics.settling,
        },
      };
      saveGameProgress();
      updateGameLevelButtons();
      gameNextButton.disabled = gameLevelIndex >= gameLevels.length - 1;
    }
  }

  inputs.forEach((input) => {
    input.addEventListener("input", () => setParam(input.dataset.param, input.value));
  });

  presetButtons.forEach((button) => {
    button.addEventListener("click", () => applyPreset(button.dataset.preset));
  });

  toggleButton.addEventListener("click", () => {
    running = !running;
    updateRunState();
  });

  resetButton.addEventListener("click", () => resetSimulation(true));
  viewSelect.addEventListener("change", drawChart);
  gameInputs.forEach((input) => {
    input.addEventListener("input", () => setGameParam(input.dataset.gameParam, input.value));
  });
  gameLevelButtons.forEach((button) => {
    button.addEventListener("click", () => selectGameLevel(Number(button.dataset.gameLevel)));
  });
  gameCheckButton.addEventListener("click", checkGameTune);
  gameResetButton.addEventListener("click", resetGameLevel);
  gameNextButton.addEventListener("click", () => selectGameLevel(Math.min(gameLevelIndex + 1, gameLevels.length - 1)));
  window.addEventListener("resize", () => {
    drawChart();
    renderGame(false);
  });

  function frame(timestamp) {
    if (!lastFrame) lastFrame = timestamp;
    const elapsed = Math.min(80, timestamp - lastFrame);
    lastFrame = timestamp;

    if (running) {
      const steps = Math.max(1, Math.round((elapsed / 1000) / dt * 6));
      for (let index = 0; index < steps && running; index += 1) {
        simulateStep();
      }
      updateMetrics();
      drawChart();
    }

    window.requestAnimationFrame(frame);
  }

  syncInputs();
  selectGameLevel(gameLevelIndex);
  resetSimulation(true);
  window.requestAnimationFrame(frame);
})();
