"use strict";

const STORAGE_KEY = "grinding-classic-mobile-v1";
const TEXTURE_LIMITS = {
  simple: 0.93,
  complex: 0.82,
  veinlet: 0.87,
  massive: 0.78,
};
const TEXTURE_RATES = {
  simple: 1.8,
  complex: 1.0,
  veinlet: 1.3,
  massive: 0.8,
};
const TEXTURE_LABELS = {
  simple: "简单嵌布",
  complex: "复杂嵌布",
  veinlet: "脉状嵌布",
  massive: "块状嵌布",
};
const MILL_FACTORS = {
  ball: 4.0,
  rod: 3.2,
  autogenous: 1.8,
};
const MILL_LABELS = {
  ball: "球磨机",
  rod: "棒磨机",
  autogenous: "自磨机",
};

const state = {
  mineralsData: [],
  minerals: [],
  result: null,
  reportText: "",
};

const elements = {};

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  cacheElements();
  bindEvents();

  try {
    const response = await fetch("./minerals.json");
    state.mineralsData = await response.json();
  } catch (error) {
    showNotice(`矿物数据加载失败：${error.message}`, "error");
    state.mineralsData = [];
  }

  populateMineralSelect();
  restoreState();
  updateMineralMeta();
  renderComposition();
  updateManualWiVisibility();
}

function cacheElements() {
  [
    "mineralSelect",
    "mineralContent",
    "grainSize",
    "mineralMeta",
    "addMineral",
    "mineralList",
    "totalContent",
    "normalizeComposition",
    "resetAll",
    "f80",
    "targetP80",
    "millType",
    "grindTime",
    "manualWi",
    "manualWiField",
    "inputNotice",
    "analyzeButton",
    "curveStatus",
    "p80Chart",
    "metricGrid",
    "sieveInput",
    "fitSieve",
    "sieveResult",
    "reportCard",
    "downloadReport",
    "copyReport",
  ].forEach((id) => {
    elements[id] = document.getElementById(id);
  });
}

function bindEvents() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });
  elements.mineralSelect.addEventListener("change", () => {
    updateMineralMeta();
    const mineral = getSelectedMineral();
    if (mineral) {
      elements.grainSize.value = Math.round((mineral.grain_min + mineral.grain_max) / 2);
    }
  });
  elements.addMineral.addEventListener("click", addMineral);
  elements.normalizeComposition.addEventListener("click", normalizeComposition);
  elements.resetAll.addEventListener("click", resetAll);
  elements.analyzeButton.addEventListener("click", analyze);
  elements.fitSieve.addEventListener("click", fitSieveData);
  elements.downloadReport.addEventListener("click", downloadReport);
  elements.copyReport.addEventListener("click", copyReport);

  [
    elements.f80,
    elements.targetP80,
    elements.millType,
    elements.grindTime,
    elements.manualWi,
  ].forEach((element) => {
    element.addEventListener("change", saveState);
  });
}

function switchTab(tabName) {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tabName}`);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function populateMineralSelect() {
  elements.mineralSelect.innerHTML = "";
  state.mineralsData.forEach((mineral) => {
    const option = document.createElement("option");
    option.value = mineral.name;
    option.textContent = `${mineral.name} · ${mineral.formula}`;
    elements.mineralSelect.appendChild(option);
  });
}

function getSelectedMineral() {
  return state.mineralsData.find(
    (mineral) => mineral.name === elements.mineralSelect.value,
  );
}

function updateMineralMeta() {
  const mineral = getSelectedMineral();
  if (!mineral) {
    elements.mineralMeta.textContent = "暂无矿物参数";
    return;
  }
  elements.mineralMeta.textContent =
    `密度 ${mineral.density} g/cm³ · 硬度 ${mineral.hardness} · ` +
    `Wi ${mineral.bond_wi} kWh/t · 嵌布 ${mineral.grain_min}-${mineral.grain_max} μm · ` +
    `${TEXTURE_LABELS[mineral.texture] || mineral.texture}`;
}

function addMineral() {
  const mineral = getSelectedMineral();
  const content = Number(elements.mineralContent.value);
  const grainSize = Number(elements.grainSize.value);

  if (!mineral) {
    showNotice("请选择矿物。", "error");
    return;
  }
  if (!Number.isFinite(content) || content <= 0 || content > 100) {
    showNotice("矿物含量应在 0-100% 之间。", "error");
    return;
  }
  if (!Number.isFinite(grainSize) || grainSize <= 0) {
    showNotice("嵌布粒度必须大于 0。", "error");
    return;
  }

  const existingIndex = state.minerals.findIndex((item) => item.name === mineral.name);
  const item = {
    name: mineral.name,
    formula: mineral.formula,
    content,
    bond_wi: Number(mineral.bond_wi),
    grain_size: grainSize,
    mineral_type: mineral.mineral_type,
    texture: mineral.texture,
  };

  if (existingIndex >= 0) {
    state.minerals[existingIndex] = item;
    showNotice("已更新该矿物的含量和粒度。", "success");
  } else {
    state.minerals.push(item);
    showNotice("矿物已加入配料。", "success");
  }

  renderComposition();
  saveState();
}

function renderComposition() {
  elements.mineralList.innerHTML = "";
  const total = state.minerals.reduce((sum, mineral) => sum + mineral.content, 0);
  elements.totalContent.textContent = `${total.toFixed(1)}%`;
  elements.normalizeComposition.disabled = state.minerals.length === 0 || Math.abs(total - 100) < 0.05;

  if (state.minerals.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "尚未加入矿物，可直接在磨矿页手动输入 Bond Wi。";
    elements.mineralList.appendChild(empty);
    return;
  }

  state.minerals.forEach((mineral, index) => {
    const row = document.createElement("div");
    row.className = "mineral-row";

    const description = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${mineral.name} · ${mineral.content.toFixed(1)}%`;
    const details = document.createElement("span");
    details.textContent =
      `${mineral.formula} · Wi ${mineral.bond_wi} · 嵌布 ${mineral.grain_size} μm · ` +
      `${TEXTURE_LABELS[mineral.texture] || mineral.texture}`;
    description.append(title, details);

    const actions = document.createElement("div");
    actions.className = "row-actions";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button";
    remove.setAttribute("aria-label", `删除${mineral.name}`);
    remove.textContent = "删";
    remove.addEventListener("click", () => {
      state.minerals.splice(index, 1);
      renderComposition();
      updateManualWiVisibility();
      saveState();
    });
    actions.appendChild(remove);
    row.append(description, actions);
    elements.mineralList.appendChild(row);
  });

  updateManualWiVisibility();
}

function normalizeComposition() {
  const total = state.minerals.reduce((sum, mineral) => sum + mineral.content, 0);
  if (total <= 0) {
    showNotice("当前配料总含量为 0，无法归一化。", "error");
    return;
  }
  state.minerals = state.minerals.map((mineral) => ({
    ...mineral,
    content: Math.round((mineral.content / total) * 1000) / 10,
  }));
  renderComposition();
  saveState();
  showNotice("配料已归一化到 100%。", "success");
}

function updateManualWiVisibility() {
  elements.manualWiField.style.display = state.minerals.length ? "none" : "grid";
}

function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  state.minerals = [];
  state.result = null;
  state.reportText = "";
  elements.mineralContent.value = "10";
  elements.grainSize.value = "100";
  elements.f80.value = "10000";
  elements.targetP80.value = "74";
  elements.grindTime.value = "15";
  elements.manualWi.value = "14.2";
  elements.millType.value = "ball";
  elements.curveStatus.textContent = "待计算";
  elements.curveStatus.className = "result-badge";
  elements.metricGrid.innerHTML = "";
  elements.reportCard.innerHTML = '<p class="empty-state">完成磨矿分析后生成报告。</p>';
  elements.downloadReport.disabled = true;
  elements.copyReport.disabled = true;
  showNotice("");
  renderComposition();
  updateMineralMeta();
  drawEmptyChart();
}

function analyze() {
  const f80 = Number(elements.f80.value);
  const targetP80 = Number(elements.targetP80.value);
  const grindTime = Number(elements.grindTime.value);
  const millType = elements.millType.value;
  const manualWi = Number(elements.manualWi.value);

  if (!Number.isFinite(f80) || f80 <= 0) {
    return showNotice("F80 必须大于 0。", "error");
  }
  if (!Number.isFinite(targetP80) || targetP80 <= 0 || targetP80 >= f80) {
    return showNotice("目标 P80 必须大于 0 且小于 F80。", "error");
  }
  if (!Number.isFinite(grindTime) || grindTime <= 0) {
    return showNotice("磨矿时间必须大于 0。", "error");
  }

  const totalContent = state.minerals.reduce((sum, mineral) => sum + mineral.content, 0);
  const weightedWi = totalContent > 0
    ? state.minerals.reduce((sum, mineral) => sum + mineral.bond_wi * mineral.content, 0) / totalContent
    : NaN;
  const averageWi = Number.isFinite(weightedWi) ? weightedWi : manualWi;
  if (!Number.isFinite(averageWi) || averageWi <= 0) {
    return showNotice("Bond Wi 必须大于 0。", "error");
  }

  const kineticsK = MILL_FACTORS[millType] / averageWi;
  const predictedP80 = Math.max(f80 * Math.exp(-kineticsK * grindTime * 1.8), 5);
  const timeToTarget = -Math.log(targetP80 / f80) / (kineticsK * 1.8);
  const energy = averageWi * 10 * (1 / Math.sqrt(targetP80) - 1 / Math.sqrt(f80));
  const reductionRatio = f80 / targetP80;
  const liberation = state.minerals.map((mineral) => ({
    name: mineral.name,
    value: liberationDegree(mineral, targetP80, totalContent),
  }));

  state.result = {
    f80,
    targetP80,
    grindTime,
    millType,
    averageWi,
    kineticsK,
    predictedP80,
    timeToTarget,
    energy,
    reductionRatio,
    liberation,
  };

  renderMetrics();
  renderChart(timesToResult);
  renderReport();
  switchTab("curves");
  showNotice("分析完成。", "success");
  saveState();
}

function timesToResult() {
  const points = [];
  for (let time = 0; time <= 60; time += 2) {
    points.push(time);
  }
  return points;
}

function liberationDegree(mineral, grindSize, totalContent) {
  if (!grindSize || grindSize <= 0 || totalContent <= 0) return 0;
  const texture = mineral.texture in TEXTURE_LIMITS ? mineral.texture : "simple";
  const ratio = mineral.content / totalContent;
  const rate = (TEXTURE_RATES[texture] || 1.2) * (0.6 + 0.4 * ratio);
  const value = TEXTURE_LIMITS[texture] * (1 - Math.exp(-rate * mineral.grain_size / grindSize));
  return Math.max(0, Math.min(100, value * 100));
}

function renderMetrics() {
  const result = state.result;
  const metrics = [
    [format(result.predictedP80, 1), "预测 P80 (μm)"],
    [format(result.timeToTarget, 1), "达目标时间 (min)"],
    [format(result.energy, 2), "比能耗 (kWh/t)"],
    [format(result.reductionRatio, 2), "破碎比"],
    [format(result.averageWi, 1), `加权 Wi · ${classifyGrindability(result.averageWi)}`],
    [format(result.kineticsK, 4), "速率系数 k"],
  ];
  elements.metricGrid.innerHTML = "";
  metrics.forEach(([value, label]) => {
    const card = document.createElement("div");
    card.className = "metric-card";
    card.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    elements.metricGrid.appendChild(card);
  });

  const passed = result.predictedP80 <= result.targetP80;
  elements.curveStatus.textContent = passed ? "达到目标" : "未达目标";
  elements.curveStatus.className = `result-badge ${passed ? "pass" : "warn"}`;
}

function renderChart() {
  const result = state.result;
  const svg = elements.p80Chart;
  svg.innerHTML = "";
  const namespace = "http://www.w3.org/2000/svg";
  const width = 720;
  const height = 300;
  const margin = { left: 58, right: 20, top: 24, bottom: 42 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const yMin = 1;
  const yMax = Math.max(result.f80, 10);

  const add = (tag, attributes, text) => {
    const node = document.createElementNS(namespace, tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    if (text != null) node.textContent = text;
    svg.appendChild(node);
    return node;
  };

  for (let line = 0; line <= 4; line += 1) {
    const ratio = line / 4;
    const y = margin.top + ratio * plotHeight;
    const value = yMax * Math.pow(yMin / yMax, ratio);
    add("line", {
      x1: margin.left,
      x2: width - margin.right,
      y1: y,
      y2: y,
      stroke: "#e5eaef",
      "stroke-width": 1,
    });
    add("text", {
      x: margin.left - 8,
      y: y + 4,
      "text-anchor": "end",
      fill: "#667085",
      "font-size": 11,
    }, `${Math.round(value)}`);
  }

  for (let time = 0; time <= 60; time += 10) {
    const x = margin.left + (time / 60) * plotWidth;
    add("line", {
      x1: x,
      x2: x,
      y1: margin.top,
      y2: height - margin.bottom,
      stroke: "#edf0f3",
      "stroke-width": 1,
    });
    add("text", {
      x,
      y: height - margin.bottom + 18,
      "text-anchor": "middle",
      fill: "#667085",
      "font-size": 11,
    }, String(time));
  }

  add("text", {
    x: margin.left + plotWidth / 2,
    y: height - 8,
    "text-anchor": "middle",
    fill: "#667085",
    "font-size": 12,
  }, "磨矿时间 (min)");
  add("text", {
    x: 14,
    y: margin.top + plotHeight / 2,
    "text-anchor": "middle",
    fill: "#667085",
    "font-size": 12,
    transform: `rotate(-90 14 ${margin.top + plotHeight / 2})`,
  }, "P80 (μm)");

  const xForTime = (time) => margin.left + Math.min(Math.max(time, 0), 60) / 60 * plotWidth;
  const yForP80 = (p80) => {
    const clamped = Math.min(Math.max(p80, yMin), yMax);
    return margin.top + (Math.log(yMax) - Math.log(clamped)) / (Math.log(yMax) - Math.log(yMin)) * plotHeight;
  };

  const points = timesToResult().map((time) => {
    const p80 = Math.max(result.f80 * Math.exp(-result.kineticsK * time * 1.8), 5);
    return `${xForTime(time).toFixed(1)},${yForP80(p80).toFixed(1)}`;
  });
  add("polyline", {
    points: points.join(" "),
    fill: "none",
    stroke: "#2563a8",
    "stroke-width": 3,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  });

  const targetY = yForP80(result.targetP80);
  add("line", {
    x1: margin.left,
    x2: width - margin.right,
    y1: targetY,
    y2: targetY,
    stroke: "#d98924",
    "stroke-width": 1.5,
    "stroke-dasharray": "7 5",
  });
  add("text", {
    x: width - margin.right,
    y: targetY - 7,
    "text-anchor": "end",
    fill: "#a45a0a",
    "font-size": 11,
  }, `目标 ${format(result.targetP80, 0)} μm`);

  const currentX = xForTime(result.grindTime);
  add("line", {
    x1: currentX,
    x2: currentX,
    y1: margin.top,
    y2: height - margin.bottom,
    stroke: "#19734b",
    "stroke-width": 1.5,
    "stroke-dasharray": "4 4",
  });
  add("circle", {
    cx: currentX,
    cy: yForP80(result.predictedP80),
    r: 5,
    fill: "#19734b",
  });
}

function drawEmptyChart() {
  const svg = elements.p80Chart;
  svg.innerHTML = `
    <rect x="0" y="0" width="720" height="300" fill="#ffffff"></rect>
    <text x="360" y="150" text-anchor="middle" fill="#667085" font-size="15">
      完成磨矿分析后显示 P80 曲线
    </text>
  `;
}

function renderReport() {
  const result = state.result;
  if (!result) return;
  const passed = result.predictedP80 <= result.targetP80;
  elements.reportCard.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = passed ? "当前时间达到目标细度" : "当前时间尚未达到目标细度";
  elements.reportCard.appendChild(title);

  const summary = document.createElement("div");
  summary.className = "report-summary";
  [
    ["F80", `${format(result.f80, 0)} μm`],
    ["目标 P80", `${format(result.targetP80, 0)} μm`],
    ["批磨时间", `${format(result.grindTime, 0)} min`],
    ["预测 P80", `${format(result.predictedP80, 1)} μm`],
    ["达目标时间", `${format(result.timeToTarget, 1)} min`],
    ["比能耗", `${format(result.energy, 2)} kWh/t`],
    ["破碎比", format(result.reductionRatio, 2)],
    ["磨机类型", MILL_LABELS[result.millType]],
    ["加权 Bond Wi", `${format(result.averageWi, 1)} kWh/t`],
  ].forEach(([label, value]) => {
    const line = document.createElement("div");
    line.className = "report-line";
    line.innerHTML = `<span>${label}</span><span>${value}</span>`;
    summary.appendChild(line);
  });
  elements.reportCard.appendChild(summary);

  if (result.liberation.length > 0) {
    const heading = document.createElement("h3");
    heading.textContent = "目标 P80 下的解离度估算";
    elements.reportCard.appendChild(heading);
    const list = document.createElement("div");
    list.className = "liberation-list";
    result.liberation.forEach((item) => {
      const row = document.createElement("div");
      row.className = "liberation-row";
      row.innerHTML = `<span>${item.name}</span><strong>${format(item.value, 1)}%</strong>`;
      list.appendChild(row);
    });
    elements.reportCard.appendChild(list);
  }

  state.reportText = buildReportText(result);
  elements.downloadReport.disabled = false;
  elements.copyReport.disabled = false;
}

function buildReportText(result) {
  const lines = [
    "# 工艺矿物学磨矿分析报告（经典版）",
    "",
    "## 矿物组成",
    ...state.minerals.map(
      (mineral) =>
        `- ${mineral.name} (${mineral.formula}): ${mineral.content}%，` +
        `嵌布 ${mineral.grain_size} μm，Bond Wi ${mineral.bond_wi}`,
    ),
    "",
    "## 工艺参数",
    `- F80: ${format(result.f80, 0)} μm`,
    `- 目标 P80: ${format(result.targetP80, 0)} μm`,
    `- 磨机类型: ${MILL_LABELS[result.millType]}`,
    `- 批磨时间: ${format(result.grindTime, 0)} min`,
    `- 加权 Bond Wi: ${format(result.averageWi, 2)} kWh/t`,
    "",
    "## 分析结果",
    `- 预测 P80: ${format(result.predictedP80, 1)} μm`,
    `- 达目标时间: ${format(result.timeToTarget, 1)} min`,
    `- 比能耗: ${format(result.energy, 2)} kWh/t`,
    `- 破碎比: ${format(result.reductionRatio, 2)}`,
  ];
  if (result.liberation.length > 0) {
    lines.push("", "## 解离度估算");
    result.liberation.forEach((item) => {
      lines.push(`- ${item.name}: ${format(item.value, 1)}%`);
    });
  }
  return lines.join("\n");
}

function fitSieveData() {
  const points = elements.sieveInput.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/[\s,;\t]+/).map(Number))
    .filter((parts) => parts.length >= 2 && parts[0] > 0 && parts[1] >= 0 && parts[1] <= 100);

  if (points.length < 3) {
    elements.sieveResult.innerHTML = '<p class="notice error">至少需要 3 组有效筛析数据。</p>';
    return;
  }

  const valid = points.filter((point) => point[1] > 0.5 && point[1] < 99.5);
  if (valid.length < 3) {
    elements.sieveResult.innerHTML = '<p class="notice error">有效点不足，累计通过率应位于 0.5%-99.5%。</p>';
    return;
  }

  const x = valid.map((point) => Math.log(point[0]));
  const y = valid.map((point) => Math.log(-Math.log(1 - point[1] / 100)));
  const xMean = average(x);
  const yMean = average(y);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < x.length; index += 1) {
    numerator += (x[index] - xMean) * (y[index] - yMean);
    denominator += (x[index] - xMean) ** 2;
  }
  if (denominator === 0) {
    elements.sieveResult.innerHTML = '<p class="notice error">粒度数据无有效变化，无法拟合。</p>';
    return;
  }

  const n = numerator / denominator;
  const intercept = yMean - n * xMean;
  if (n <= 0) {
    elements.sieveResult.innerHTML = '<p class="notice error">拟合斜率无效，请检查累计通过率。</p>';
    return;
  }

  const d63 = Math.exp(-intercept / n);
  const p80 = d63 * Math.pow(-Math.log(0.2), 1 / n);
  const predictions = x.map((value) => intercept + n * value);
  const ssResidual = y.reduce((sum, value, index) => sum + (value - predictions[index]) ** 2, 0);
  const ssTotal = y.reduce((sum, value) => sum + (value - yMean) ** 2, 0);
  const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 1;

  elements.sieveResult.innerHTML = "";
  [
    [format(n, 3), "均匀性指数 n"],
    [format(d63, 1), "特征粒度 d63 (μm)"],
    [format(p80, 1), "拟合 P80 (μm)"],
    [format(rSquared, 4), "拟合 R²"],
  ].forEach(([value, label]) => {
    const card = document.createElement("div");
    card.className = "metric-card";
    card.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    elements.sieveResult.appendChild(card);
  });
}

function downloadReport() {
  if (!state.reportText) return;
  const blob = new Blob([state.reportText], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "磨矿分析报告_经典版.md";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function copyReport() {
  if (!state.reportText) return;
  try {
    await navigator.clipboard.writeText(state.reportText);
    showNotice("报告摘要已复制。", "success");
  } catch {
    showNotice("浏览器未允许复制，请使用下载报告。", "error");
  }
}

function saveState() {
  const payload = {
    minerals: state.minerals,
    f80: elements.f80.value,
    targetP80: elements.targetP80.value,
    millType: elements.millType.value,
    grindTime: elements.grindTime.value,
    manualWi: elements.manualWi.value,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function restoreState() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    saved = null;
  }

  if (!saved) {
    drawEmptyChart();
    return;
  }

  state.minerals = Array.isArray(saved.minerals) ? saved.minerals : [];
  elements.f80.value = saved.f80 || "10000";
  elements.targetP80.value = saved.targetP80 || "74";
  elements.millType.value = saved.millType || "ball";
  elements.grindTime.value = saved.grindTime || "15";
  elements.manualWi.value = saved.manualWi || "14.2";
  drawEmptyChart();
}

function showNotice(message, type = "") {
  elements.inputNotice.textContent = message;
  elements.inputNotice.className = `notice ${type}`.trim();
}

function classifyGrindability(wi) {
  if (wi < 8) return "易磨";
  if (wi < 12) return "中等可磨";
  if (wi < 16) return "难磨";
  return "极难磨";
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function format(value, digits = 1) {
  return Number(value).toFixed(digits);
}
