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

  let params = { ...presets.stable };
  let activePreset = "stable";
  let running = true;
  let samples = [];
  let plant = createPlant();
  let lastFrame = 0;

  function createPlant() {
    return { time: 0, output: 0, velocity: 0, integral: 0, previousError: 0 };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function currentSetpoint(time) {
    return time >= stepTime ? params.setpoint : 0;
  }

  function currentDisturbance(time) {
    return time >= disturbanceTime ? params.disturbance : 0;
  }

  function simulateStep() {
    const target = currentSetpoint(plant.time);
    const error = target - plant.output;
    plant.integral = clamp(plant.integral + error * dt, -8, 8);
    const derivative = (error - plant.previousError) / dt;
    const control = clamp(params.kp * error + params.ki * plant.integral + params.kd * derivative, -14, 14);
    const acceleration = control - plant.output - params.damping * 1.7 * plant.velocity - currentDisturbance(plant.time);

    plant.velocity = clamp(plant.velocity + acceleration * dt, -8, 8);
    plant.output = clamp(plant.output + plant.velocity * dt, -4, 4);
    plant.previousError = error;
    plant.time += dt;

    samples.push({
      time: plant.time,
      setpoint: currentSetpoint(plant.time),
      output: plant.output,
      error: currentSetpoint(plant.time) - plant.output,
      control,
    });

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

  function updateMetrics() {
    const afterStep = samples.filter((point) => point.time >= stepTime);
    const target = Math.max(0.001, Math.abs(params.setpoint));
    const reached10 = afterStep.find((point) => point.output >= 0.1 * target);
    const reached90 = afterStep.find((point) => point.output >= 0.9 * target);
    const rise = reached10 && reached90 ? reached90.time - reached10.time : Number.NaN;
    const peak = afterStep.reduce((max, point) => Math.max(max, point.output), -Infinity);
    const overshoot = Math.max(0, ((peak - target) / target) * 100);
    const last = samples[samples.length - 1];
    const steadyError = last ? Math.abs(params.setpoint - last.output) / target * 100 : Number.NaN;
    const tolerance = target * 0.02;
    let settling = Number.NaN;

    for (let index = 0; index < afterStep.length; index += 1) {
      const candidate = afterStep[index];
      const allSettled = afterStep.slice(index).every((point) => Math.abs(params.setpoint - point.output) <= tolerance);
      if (allSettled) {
        settling = candidate.time - stepTime;
        break;
      }
    }

    metric.rise.textContent = formatSeconds(rise);
    metric.overshoot.textContent = formatPercent(overshoot);
    metric.error.textContent = formatPercent(steadyError);
    metric.settling.textContent = formatSeconds(settling);
    simTime.textContent = `${Math.min(plant.time, duration).toFixed(1)} s`;
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(320, rect.width);
    const height = Math.max(260, rect.height);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { width, height };
  }

  function getSeries() {
    if (viewSelect.value === "error") return [{ key: "error", color: "#f97316" }];
    if (viewSelect.value === "control") return [{ key: "control", color: "#f97316" }];
    return [
      { key: "setpoint", color: "#2563eb" },
      { key: "output", color: "#11863b" },
    ];
  }

  function drawChart() {
    const { width, height } = resizeCanvas();
    const margin = { top: 22, right: 18, bottom: 42, left: 50 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const series = getSeries();
    const values = [0, params.setpoint];

    samples.forEach((point) => {
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

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#d9e0e8";
    context.lineWidth = 1;
    context.setLineDash([5, 5]);

    for (let i = 0; i <= 5; i += 1) {
      const x = margin.left + (plotWidth / 5) * i;
      context.beginPath();
      context.moveTo(x, margin.top);
      context.lineTo(x, margin.top + plotHeight);
      context.stroke();
    }

    for (let i = 0; i <= 4; i += 1) {
      const y = margin.top + (plotHeight / 4) * i;
      context.beginPath();
      context.moveTo(margin.left, y);
      context.lineTo(margin.left + plotWidth, y);
      context.stroke();
    }

    context.setLineDash([]);
    context.strokeStyle = "#b9c4d1";
    context.beginPath();
    context.moveTo(margin.left, margin.top);
    context.lineTo(margin.left, margin.top + plotHeight);
    context.lineTo(margin.left + plotWidth, margin.top + plotHeight);
    context.stroke();

    context.fillStyle = "#1f2933";
    context.font = "12px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    context.textAlign = "right";
    context.textBaseline = "middle";
    for (let i = 0; i <= 4; i += 1) {
      const value = maxY - ((maxY - minY) / 4) * i;
      context.fillText(value.toFixed(1), margin.left - 10, margin.top + (plotHeight / 4) * i);
    }

    context.textAlign = "center";
    context.textBaseline = "top";
    for (let i = 0; i <= 5; i += 1) {
      const value = (duration / 5) * i;
      context.fillText(value.toFixed(0), margin.left + (plotWidth / 5) * i, margin.top + plotHeight + 10);
    }
    context.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    context.fillText("Time (s)", margin.left + plotWidth / 2, height - 16);

    context.save();
    context.translate(16, margin.top + plotHeight / 2);
    context.rotate(-Math.PI / 2);
    context.fillText(viewSelect.value === "response" ? "PV" : viewSelect.value === "error" ? "Error" : "Control", 0, 0);
    context.restore();

    const disturbanceX = xScale(disturbanceTime);
    context.strokeStyle = "#f97316";
    context.setLineDash([4, 4]);
    context.beginPath();
    context.moveTo(disturbanceX, margin.top);
    context.lineTo(disturbanceX, margin.top + plotHeight);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = "#f97316";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText("disturbance", disturbanceX, margin.top - 4);

    series.forEach((item) => {
      context.strokeStyle = item.color;
      context.lineWidth = item.key === "setpoint" ? 2 : 2.5;
      context.beginPath();
      samples.forEach((point, index) => {
        const x = xScale(point.time);
        const y = yScale(point[item.key]);
        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      });
      context.stroke();
    });
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
  window.addEventListener("resize", drawChart);

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
  resetSimulation(true);
  window.requestAnimationFrame(frame);
})();
