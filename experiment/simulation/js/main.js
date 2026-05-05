// =================== SIMULATION STATE ===================
const state = {
  voltage: 0,       // kV
  step: 0,          // time steps
  broken: false,
  shape: "spherical",
  gap: 10,          // mm
  breakdowns: [],   // { testNum, kv, shape, gap }
  testCount: 0,
  graphPoints: [],  // { step, v, breakdown? }
  animFrame: null
};

const SHAPE_ETA    = { spherical: 0.90, flat: 1.00, pointed: 0.50 };
const SHAPE_LABELS = { spherical: "Spherical", flat: "Flat Plate", pointed: "Pointed" };

let oilFactor = 1.0;          // degrades after each breakdown, resets on oil change
let breakdownVoltage = 0;
const VOLTAGE_STEP = 1.0;     // 1 kV per click → breakdown at ~27 clicks for 10 mm

// =================== INIT ===================
window.onload = function () {
  recalcBreakdown();
  drawGraph();
  clearSparks();
};

// =================== BREAKDOWN VOLTAGE ===================
function recalcBreakdown() {
  const eta = SHAPE_ETA[state.shape];
  // Air dielectric strength ≈ 3 kV/mm (Paschen's law)
  const base = 3.0 * state.gap * eta * oilFactor;
  // ±8 % scatter per test run
  const scatter = 1 + (Math.random() - 0.5) * 0.16;
  breakdownVoltage = base * scatter;
  updateSettingsInfo();
}

function updateSettingsInfo() {
  const el = document.getElementById("settingsInfo");
  if (!el) return;
  const eta = SHAPE_ETA[state.shape];
  el.textContent =
    "Shape Factor η = " + eta.toFixed(2) +
    " · Gap = " + state.gap + " mm" +
    " · Oil Quality = " + Math.round(oilFactor * 100) + "%" +
    " · Expected V_bd ≈ " + breakdownVoltage.toFixed(1) + " kV";
}

// =================== SETTINGS HANDLERS ===================
function onShapeChange() {
  const sel = document.querySelector("input[name=shape]:checked");
  if (sel) { state.shape = sel.value; recalcBreakdown(); }
}

function onGapChange() {
  const sel = document.querySelector("input[name=gap]:checked");
  if (sel) { state.gap = parseInt(sel.value); recalcBreakdown(); }
}

// =================== VOLTAGE CONTROL ===================
function increaseVoltage() {
  if (state.broken) return;
  state.voltage += VOLTAGE_STEP;
  state.step++;
  state.graphPoints.push({ step: state.step, v: state.voltage });
  updateVoltmeter();
  drawGraph();
  if (state.voltage >= breakdownVoltage) triggerBreakdown();
}

function updateVoltmeter() {
  const el = document.getElementById("voltmeter");
  el.textContent = state.voltage.toFixed(1);
  const ratio = state.voltage / (breakdownVoltage || 1);
  if (ratio >= 0.93) {
    el.style.color = "#ff3333";
    el.style.textShadow = "0 0 10px #ff0000";
  } else if (ratio >= 0.68) {
    el.style.color = "#ffaa00";
    el.style.textShadow = "0 0 7px #ff8800";
  } else {
    el.style.color = "lightgreen";
    el.style.textShadow = "0 0 6px #00ff00";
  }
}

// =================== BREAKDOWN ===================
function triggerBreakdown() {
  state.broken = true;
  state.testCount++;
  oilFactor = Math.max(0.30, oilFactor - 0.08);

  const record = {
    testNum: state.testCount,
    kv: state.voltage.toFixed(1),
    shape: state.shape,
    gap: state.gap
  };
  state.breakdowns.push(record);

  if (state.graphPoints.length > 0)
    state.graphPoints[state.graphPoints.length - 1].breakdown = true;

  document.getElementById("btnIncrease").disabled = true;

  const msgBox = document.getElementById("messageBox");
  msgBox.textContent =
    "⚡ BREAKDOWN at " + record.kv + " kV! (" +
    SHAPE_LABELS[record.shape] + " · " + record.gap + " mm)";

  renderBreakdownList();
  drawGraph();
  playSparkAnimation();

  setTimeout(recalcBreakdown, 1500);
}

function renderBreakdownList() {
  const sel = document.getElementById("breakdownList");
  sel.innerHTML = "";
  [...state.breakdowns].reverse().forEach(function (bd) {
    const opt = document.createElement("option");
    opt.textContent =
      "Test " + bd.testNum + ": " + bd.kv + " kV  [" +
      SHAPE_LABELS[bd.shape] + ", " + bd.gap + " mm]";
    sel.appendChild(opt);
  });
}

// =================== RESET ===================
function resetTest() {
  state.voltage = 0;
  state.step = 0;
  state.broken = false;
  state.graphPoints = [];
  if (state.animFrame) { cancelAnimationFrame(state.animFrame); state.animFrame = null; }

  document.getElementById("btnIncrease").disabled = false;
  const vm = document.getElementById("voltmeter");
  vm.textContent = "0";
  vm.style.color = "lightgreen";
  vm.style.textShadow = "0 0 6px #00ff00";
  document.getElementById("messageBox").textContent = "";

  clearSparks();
  recalcBreakdown();
  drawGraph();
}

// =================== CHANGE TRANSFORMER OIL ===================
function changeOil() {
  oilFactor = 1.0;
  state.breakdowns = [];
  renderBreakdownList();
  resetTest();
  const msgBox = document.getElementById("messageBox");
  msgBox.textContent = "Oil changed — all readings reset.";
  setTimeout(function () { msgBox.textContent = ""; }, 2200);
}

// =================== SPARK ANIMATION (on photo overlay) ===================
function clearSparks() {
  const c = document.getElementById("sparkCanvas");
  if (!c) return;
  c.getContext("2d").clearRect(0, 0, c.width, c.height);
}

function playSparkAnimation() {
  const canvas = document.getElementById("sparkCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const cx = W * 0.48, cy = H * 0.50;

  const sparks = [];
  for (var i = 0; i < 110; i++) {
    sparks.push({
      x: cx, y: cy,
      vx: (Math.random() - 0.5) * 7,
      vy: (Math.random() - 0.5) * 7,
      life: Math.random() * 32 + 18,
      age: 0,
      color: ["#ffffff", "#ffff00", "#ffbb00", "#ff6600"][Math.floor(Math.random() * 4)]
    });
  }

  var frame = 0;
  function animate() {
    ctx.clearRect(0, 0, W, H);

    // Lightning bolt
    if (frame < 28) drawLightning(ctx, cx - 40, cy, cx + 40, cy);

    // Particles
    sparks.forEach(function (s) {
      if (s.age < s.life) {
        var a = 1 - s.age / s.life;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = s.color;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 7;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2.5 * a + 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.14;
        s.vx *= 0.97;
        s.age++;
      }
    });

    frame++;
    if (frame < 72) {
      state.animFrame = requestAnimationFrame(animate);
    } else {
      clearSparks();
    }
  }
  requestAnimationFrame(animate);
}

function drawLightning(ctx, x1, y1, x2, y2) {
  var seg = 10;
  var dx = (x2 - x1) / seg;
  var dy = (y2 - y1) / seg;
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "#88bbff";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (var i = 1; i < seg; i++) {
    ctx.lineTo(
      x1 + dx * i + (Math.random() - 0.5) * 14,
      y1 + dy * i + (Math.random() - 0.5) * 14
    );
  }
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

// =================== GRAPH DRAWING ===================
function drawGraph() {
  var canvas = document.getElementById("graphCanvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,200,0.08)";
  ctx.lineWidth = 1;
  for (var i = 0; i <= 10; i++) {
    var x = (W / 10) * i;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (var i = 0; i <= 8; i++) {
    var y = (H / 8) * i;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.restore();

  if (state.graphPoints.length === 0) {
    ctx.save();
    ctx.fillStyle = "#aaa";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText('Click "Increase Voltage" to start', W / 2, H / 2);
    ctx.restore();
    return;
  }

  var maxStep = Math.max(20, state.graphPoints[state.graphPoints.length - 1].step + 3);
  var maxV = Math.max(10, breakdownVoltage * 1.4);

  function toX(step) { return (step / maxStep) * W; }
  function toY(v) { return H - (v / maxV) * H; }

  // V_bd reference line
  ctx.save();
  ctx.strokeStyle = "rgba(200,0,0,0.45)";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(0, toY(breakdownVoltage));
  ctx.lineTo(W, toY(breakdownVoltage));
  ctx.stroke();
  ctx.fillStyle = "rgba(200,0,0,0.7)";
  ctx.font = "9px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("V_bd", W - 2, toY(breakdownVoltage) - 2);
  ctx.restore();

  // Fill area under curve
  ctx.save();
  ctx.fillStyle = "rgba(0,0,200,0.07)";
  ctx.beginPath();
  ctx.moveTo(toX(state.graphPoints[0].step), H);
  state.graphPoints.forEach(function (p) {
    ctx.lineTo(toX(p.step), toY(p.v));
  });
  ctx.lineTo(toX(state.graphPoints[state.graphPoints.length - 1].step), H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Voltage line
  ctx.save();
  ctx.strokeStyle = "#0000cc";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  state.graphPoints.forEach(function (p, i) {
    if (i === 0) ctx.moveTo(toX(p.step), toY(p.v));
    else ctx.lineTo(toX(p.step), toY(p.v));
  });
  ctx.stroke();
  ctx.restore();

  // Breakdown markers
  state.graphPoints.forEach(function (p) {
    if (p.breakdown) {
      ctx.save();
      ctx.fillStyle = "#cc0000";
      ctx.shadowColor = "#ff0000";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(toX(p.step), toY(p.v), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("⚡", toX(p.step), toY(p.v) - 10);
      ctx.restore();
    }
  });

  // Y-axis labels
  ctx.save();
  ctx.fillStyle = "#555";
  ctx.font = "9px sans-serif";
  ctx.textAlign = "left";
  for (var i = 0; i <= 4; i++) {
    var v = (maxV / 4) * i;
    ctx.fillText(v.toFixed(0), 2, toY(v) - 1);
  }
  ctx.restore();
}

// =================== KEYBOARD ===================
document.addEventListener("keydown", function (e) {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    if (!state.broken) increaseVoltage();
  }
  if (e.code === "KeyR") resetTest();
});
