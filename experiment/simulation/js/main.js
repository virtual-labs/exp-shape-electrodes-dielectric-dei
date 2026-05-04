//Yo// =================== SIMULATION STATE ===================
const state = {
  voltage: 0,
  step: 0,
  broken: false,
  shape: "spherical",
  gap: 10,
  breakdowns: [],
  testCount: 0,
  graphPoints: [],
  animFrame: null
};

const SHAPE_ETA    = { spherical: 0.90, flat: 1.00, pointed: 0.50 };
const SHAPE_LABELS = { spherical: "Spherical", flat: "Flat Plate", pointed: "Pointed" };

let oilFactor = 1.0;
let breakdownVoltage = 0;
const VOLTAGE_STEP = 0.5;

// =================== INIT ===================
window.onload = function () {
  recalcBreakdown();
  drawApparatus();
  drawGraph();
};

// =================== BREAKDOWN VOLTAGE ===================
function recalcBreakdown() {
  const eta = SHAPE_ETA[state.shape];
  const base = 10.0 * state.gap * eta * oilFactor;
  const scatter = 1 + (Math.random() - 0.5) * 0.16;
  breakdownVoltage = base * scatter;
  updateInfoStrip();
}

function updateInfoStrip() {
  const eta = SHAPE_ETA[state.shape];
  const $ = id => document.getElementById(id);
  $("iEta").textContent  = eta.toFixed(2);
  $("iGap").textContent  = state.gap + " mm";
  $("iOil").textContent  = Math.round(oilFactor * 100) + "%";
  $("iBdV").textContent  = "~" + breakdownVoltage.toFixed(1) + " kV";
  $("iTests").textContent = state.testCount;
  const maxKV = Math.ceil(breakdownVoltage * 1.4);
  document.getElementById("voltMax").textContent = maxKV + " kV";
}

// =================== SETTINGS HANDLERS ===================
function onShapeChange() {
  const sel = document.querySelector("input[name=shape]:checked");
  if (sel) { state.shape = sel.value; recalcBreakdown(); drawApparatus(); }
}

function onGapChange() {
  const sel = document.querySelector("input[name=gap]:checked");
  if (sel) { state.gap = parseInt(sel.value); recalcBreakdown(); drawApparatus(); }
}

// =================== VOLTAGE CONTROL ===================
function increaseVoltage() {
  if (state.broken) return;
  state.voltage += VOLTAGE_STEP;
  state.step++;
  state.graphPoints.push({ step: state.step, v: state.voltage });
  updateVoltmeter();
  drawApparatus();
  drawGraph();
  if (state.voltage >= breakdownVoltage) triggerBreakdown();
}

function updateVoltmeter() {
  const el  = document.getElementById("voltmeter");
  const bar = document.getElementById("voltBar");
  const maxV = breakdownVoltage * 1.4;
  const ratio = state.voltage / (breakdownVoltage || 1);
  el.textContent = state.voltage.toFixed(1);
  bar.style.width = Math.min(100, (state.voltage / maxV) * 100) + "%";
  el.className = "voltmeter-display";
  if (ratio >= 0.92)      el.classList.add("danger");
  else if (ratio >= 0.65) el.classList.add("warn");
}

// =================== BREAKDOWN ===================
function triggerBreakdown() {
  state.broken = true;
  state.testCount++;
  oilFactor = Math.max(0.30, oilFactor - 0.08);
  const record = { testNum: state.testCount, kv: state.voltage.toFixed(1), shape: state.shape, gap: state.gap };
  state.breakdowns.push(record);
  if (state.graphPoints.length > 0)
    state.graphPoints[state.graphPoints.length - 1].breakdown = true;
  document.getElementById("btnIncrease").disabled = true;
  const msgBox = document.getElementById("messageBox");
  msgBox.style.display = "block";
  msgBox.innerHTML = "BREAKDOWN at " + record.kv + " kV!  " + SHAPE_LABELS[record.shape] + " electrodes, " + record.gap + "mm gap";
  renderBreakdownList();
  drawGraph();
  playSparkAnimation();
  setTimeout(recalcBreakdown, 1500);
}

function renderBreakdownList() {
  const ul = document.getElementById("breakdownList");
  ul.innerHTML = "";
  if (state.breakdowns.length === 0) {
    ul.innerHTML = "<li class='bd-empty'>No breakdowns yet...</li>";
    return;
  }
  [...state.breakdowns].reverse().forEach(bd => {
    const li = document.createElement("li");
    li.className = "bd-item";
    li.innerHTML = "<div class='bd-dot'></div><span class='bd-kv'>" + bd.kv + " kV</span><span class='bd-meta'>" + SHAPE_LABELS[bd.shape] + " / " + bd.gap + "mm</span>";
    ul.appendChild(li);
  });
}

// =================== RESET ===================
function resetTest() {
  state.voltage = 0;
  state.step    = 0;
  state.broken  = false;
  state.graphPoints = [];
  if (state.animFrame) { cancelAnimationFrame(state.animFrame); state.animFrame = null; }
  document.getElementById("btnIncrease").disabled = false;
  const vm = document.getElementById("voltmeter");
  vm.textContent = "0.0";
  vm.className = "voltmeter-display";
  document.getElementById("voltBar").style.width = "0%";
  const msgBox = document.getElementById("messageBox");
  msgBox.style.display = "none";
  msgBox.innerHTML = "";
  recalcBreakdown();
  drawApparatus();
  drawGraph();
}

// =================== CHANGE OIL ===================
function changeOil() {
  oilFactor = 1.0;
  state.breakdowns = [];
  renderBreakdownList();
  resetTest();
  const msgBox = document.getElementById("messageBox");
  msgBox.style.display = "block";
  msgBox.style.cssText = "display:block;background:#dcfce7;border-color:#86efac;border-left-color:#16a34a;color:#15803d";
  msgBox.textContent = "Transformer oil replaced — all readings reset.";
  setTimeout(() => { msgBox.style.display = "none"; msgBox.style.cssText = ""; }, 2500);
}

// =================== APPARATUS DRAWING ===================
function drawApparatus() {
  const canvas = document.getElementById("apparatusCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  drawApparatusScene(ctx, canvas.width, canvas.height);
}

function drawApparatusScene(ctx, W, H) {
  const cx = W / 2, cy = H / 2;
  const gapPx  = Math.max(30, state.gap * 3.5);
  const halfGap = gapPx / 2;
  const ratio = state.voltage / (breakdownVoltage || 1);

  // Dark oil background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0a1520");
  bg.addColorStop(1, "#020a10");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Amber oil tint
  ctx.fillStyle = "rgba(120,80,10," + (0.12 + oilFactor * 0.08) + ")";
  ctx.fillRect(0, 0, W, H);

  // Oil label top-left
  ctx.save();
  ctx.fillStyle = "rgba(200,160,60,0.5)";
  ctx.font = "12px Inter,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Oil Quality: " + Math.round(oilFactor * 100) + "%", 10, 20);
  ctx.restore();

  // E-field lines
  if (ratio > 0.05 && !state.broken) {
    ctx.save();
    ctx.globalAlpha = ratio * 0.35;
    ctx.strokeStyle = "#4488ff";
    ctx.lineWidth = 0.8;
    for (let dy = -24; dy <= 24; dy += 8) {
      ctx.beginPath();
      ctx.moveTo(cx - halfGap, cy + dy);
      ctx.quadraticCurveTo(cx, cy + dy + (Math.random() - 0.5) * 3 * ratio, cx + halfGap, cy + dy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Connecting rods
  ctx.save();
  ctx.strokeStyle = "#3a4a5a";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(32, cy); ctx.lineTo(cx - halfGap, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + halfGap, cy); ctx.lineTo(W - 32, cy); ctx.stroke();

  // Terminals
  ctx.fillStyle = "#cc2222";
  ctx.beginPath(); ctx.arc(32, cy, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#222222";
  ctx.beginPath(); ctx.arc(W - 32, cy, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("+", 32, cy);
  ctx.fillText("-", W - 32, cy);
  ctx.restore();

  // Electrodes
  drawElectrode(ctx, cx, cy, halfGap, state.shape);

  // Gap dimension bracket
  ctx.save();
  ctx.strokeStyle = "rgba(100,200,255,0.5)";
  ctx.lineWidth = 1;
  const lineY = cy + 52;
  ctx.beginPath();
  ctx.moveTo(cx - halfGap, lineY - 5); ctx.lineTo(cx - halfGap, lineY + 5);
  ctx.moveTo(cx - halfGap, lineY);     ctx.lineTo(cx + halfGap, lineY);
  ctx.moveTo(cx + halfGap, lineY - 5); ctx.lineTo(cx + halfGap, lineY + 5);
  ctx.stroke();
  ctx.fillStyle = "rgba(100,200,255,0.7)";
  ctx.font = "11px Inter,sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillText(state.gap + " mm", cx, lineY + 6);
  ctx.restore();

  // Near-breakdown warning pulse
  if (ratio >= 0.88 && !state.broken) {
    const p = 0.4 + 0.3 * Math.sin(Date.now() * 0.008);
    ctx.save();
    ctx.strokeStyle = "rgba(255,60,60," + p + ")";
    ctx.lineWidth = 2;
    ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.arc(cx - halfGap, cy, 28, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + halfGap, cy, 28, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

function drawElectrode(ctx, cx, cy, halfGap, shape) {
  const lx = cx - halfGap, rx = cx + halfGap;
  const r = 22;
  if (shape === "spherical") {
    ["left","right"].forEach(side => {
      const ex = side === "left" ? lx : rx;
      const g = ctx.createRadialGradient(ex - 4, cy - 4, 2, ex, cy, r);
      g.addColorStop(0, "#8aaac8"); g.addColorStop(0.5, "#3a5870"); g.addColorStop(1, "#0e1e30");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ex, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(100,180,255,0.4)"; ctx.lineWidth = 1.5; ctx.stroke();
    });
  } else if (shape === "pointed") {
    [{ex:lx,dir:1},{ex:rx,dir:-1}].forEach(({ex,dir}) => {
      const g = ctx.createLinearGradient(ex - dir*r, cy, ex + dir*r, cy);
      g.addColorStop(0, "#0e1e30"); g.addColorStop(1, "#8aaac8");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(ex + dir*r, cy);
      ctx.lineTo(ex - dir*r, cy - 18);
      ctx.lineTo(ex - dir*r, cy + 18);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(100,180,255,0.4)"; ctx.lineWidth = 1.5; ctx.stroke();
    });
  } else {
    [lx,rx].forEach(ex => {
      const g = ctx.createLinearGradient(ex - 8, cy, ex + 8, cy);
      g.addColorStop(0, ex === lx ? "#0e1e30" : "#8aaac8");
      g.addColorStop(1, ex === lx ? "#8aaac8" : "#0e1e30");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.rect(ex - 8, cy - 32, 16, 64);
      ctx.fill();
      ctx.strokeStyle = "rgba(100,180,255,0.4)"; ctx.lineWidth = 1.5; ctx.stroke();
    });
  }
}

// =================== SPARK ANIMATION ===================
function playSparkAnimation() {
  const canvas = document.getElementById("apparatusCanvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const halfGap = Math.max(30, state.gap * 3.5) / 2;
  const sparks = Array.from({length:120}, () => ({
    x:cx, y:cy,
    vx:(Math.random()-0.5)*8, vy:(Math.random()-0.5)*8,
    life:Math.random()*30+20, age:0,
    color:["#fff","#ffff80","#ffcc00","#ff8800"][Math.floor(Math.random()*4)]
  }));
  let frame = 0;
  function animate() {
    ctx.clearRect(0, 0, W, H);
    drawApparatusScene(ctx, W, H);
    if (frame < 28) drawLightning(ctx, cx - halfGap, cy, cx + halfGap, cy);
    sparks.forEach(s => {
      if (s.age < s.life) {
        const a = 1 - s.age / s.life;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = s.color;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(s.x, s.y, 2.5*a+0.4, 0, Math.PI*2); ctx.fill();
        ctx.restore();
        s.x += s.vx; s.y += s.vy; s.vy += 0.12; s.vx *= 0.97; s.age++;
      }
    });
    frame++;
    if (frame < 75) state.animFrame = requestAnimationFrame(animate);
    else drawApparatus();
  }
  requestAnimationFrame(animate);
}

function drawLightning(ctx, x1, y1, x2, y2) {
  const seg = 10, dx = (x2-x1)/seg, dy = (y2-y1)/seg;
  ctx.save();
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2.5;
  ctx.shadowColor = "#88aaff"; ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.moveTo(x1, y1);
  for (let i = 1; i < seg; i++)
    ctx.lineTo(x1+dx*i+(Math.random()-0.5)*16, y1+dy*i+(Math.random()-0.5)*16);
  ctx.lineTo(x2, y2);
  ctx.stroke(); ctx.restore();
}

// =================== GRAPH DRAWING ===================
function drawGraph() {
  const canvas = document.getElementById("graphCanvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#fafcff";
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.save();
  ctx.strokeStyle = "rgba(37,99,235,0.07)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) { const x=(W/10)*i; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let i = 0; i <= 6; i++)  { const y=(H/6)*i;  ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  ctx.restore();

  if (state.graphPoints.length === 0) {
    ctx.fillStyle = "#94a3b8"; ctx.font = "12px Inter,sans-serif"; ctx.textAlign = "center";
    ctx.fillText("Click Increase Voltage to start recording", W/2, H/2);
    return;
  }

  const maxStep = Math.max(20, state.graphPoints[state.graphPoints.length-1].step + 3);
  const maxV    = Math.max(10, breakdownVoltage * 1.4);
  const toX = s => (s/maxStep)*W;
  const toY = v => H - (v/maxV)*H;

  // V_bd reference
  ctx.save();
  ctx.strokeStyle = "rgba(220,38,38,0.45)"; ctx.lineWidth = 1; ctx.setLineDash([6,4]);
  ctx.beginPath(); ctx.moveTo(0, toY(breakdownVoltage)); ctx.lineTo(W, toY(breakdownVoltage)); ctx.stroke();
  ctx.fillStyle = "rgba(220,38,38,0.7)"; ctx.font = "9px Inter,sans-serif"; ctx.textAlign = "right";
  ctx.fillText("V_bd", W-2, toY(breakdownVoltage)-3);
  ctx.restore();

  // Area fill
  ctx.save();
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(37,99,235,0.18)");
  grad.addColorStop(1, "rgba(37,99,235,0.02)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(toX(state.graphPoints[0].step), H);
  state.graphPoints.forEach(p => ctx.lineTo(toX(p.step), toY(p.v)));
  ctx.lineTo(toX(state.graphPoints[state.graphPoints.length-1].step), H);
  ctx.closePath(); ctx.fill(); ctx.restore();

  // Line
  ctx.save();
  ctx.strokeStyle = "#2563eb"; ctx.lineWidth = 2.5; ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(37,99,235,0.25)"; ctx.shadowBlur = 4;
  ctx.beginPath();
  state.graphPoints.forEach((p,i) => {
    if (i===0) ctx.moveTo(toX(p.step), toY(p.v));
    else ctx.lineTo(toX(p.step), toY(p.v));
  });
  ctx.stroke(); ctx.restore();

  // Breakdown markers
  state.graphPoints.filter(p => p.breakdown).forEach(p => {
    ctx.save();
    ctx.fillStyle = "#dc2626"; ctx.shadowColor = "#dc2626"; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(toX(p.step), toY(p.v), 5, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("lightning", toX(p.step), toY(p.v)-10);
    ctx.restore();
  });

  // Y labels
  ctx.save();
  ctx.fillStyle = "#64748b"; ctx.font = "9px Inter,sans-serif"; ctx.textAlign = "left";
  for (let i = 0; i <= 4; i++) { const v=(maxV/4)*i; ctx.fillText(v.toFixed(0), 2, toY(v)-2); }
  ctx.restore();
}

// =================== KEYBOARD ===================
document.addEventListener("keydown", e => {
  if (e.code==="Space"||e.code==="ArrowUp") { e.preventDefault(); if (!state.broken) increaseVoltage(); }
  if (e.code==="KeyR") resetTest();
});
ur JavaScript goes in here
