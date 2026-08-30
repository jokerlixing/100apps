(function runPatternLab() {
  "use strict";

  const Core = window.RegexCore;
  const STORAGE_KEY = "pattern-lab-056:v1";
  const MATCH_LIMIT = 300;
  const DEFAULT_PRESET = "date";

  const PRESETS = [
    {
      id: "date",
      label: "日期分组",
      source: "(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})",
      flags: "g",
      text: "版本冻结：2026-08-30\n下次复盘：2026-09-06\n无效示例：26-8-30",
      replacement: "$<day>/$<month>/$<year>",
    },
    {
      id: "email",
      label: "邮箱地址",
      source: "[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}",
      flags: "gi",
      text: "联系：hello@example.com\n备用：LAB.056+demo@sample.dev\n干扰：hello@example",
      replacement: "[已隐藏邮箱]",
    },
    {
      id: "phone",
      label: "手机号",
      source: "(?<!\\d)1[3-9]\\d{9}(?!\\d)",
      flags: "g",
      text: "预约电话 13800138000，备用 18612345678。\n干扰数字：1234567890",
      replacement: "1**********",
    },
    {
      id: "url",
      label: "URL 链接",
      source: "https?:\\/\\/[^\\s<>'\"]+",
      flags: "gi",
      text: "文档：https://developer.mozilla.org/zh-CN/\n项目：https://github.com/jokerlixing/100apps?tab=readme",
      replacement: "[链接]",
    },
    {
      id: "duplicate",
      label: "重复单词",
      source: "\\b(?<word>[A-Z]+)\\s+\\k<word>\\b",
      flags: "giu",
      text: "This is is a pattern lab.\nWe test TEST repeated words, but keep normal text.",
      replacement: "$<word>",
    },
    {
      id: "log",
      label: "日志行",
      source: "^\\[(?<level>INFO|WARN|ERROR)\\]\\s+(?<time>\\d{2}:\\d{2}:\\d{2})\\s+(?<message>.+)$",
      flags: "gm",
      text: "[INFO] 09:20:11 server ready\n[WARN] 09:21:04 cache miss\n[ERROR] 09:22:30 request failed\nDEBUG 09:23:00 ignored",
      replacement: "$<time> [$<level>] $<message>",
    },
    {
      id: "color",
      label: "HEX 颜色",
      source: "#(?:[0-9a-f]{3}|[0-9a-f]{6})\\b",
      flags: "gi",
      text: "--ink: #17212b;\n--blue: #2357d8;\n--accent: #f25c3b;\ninvalid: #12zz99;",
      replacement: "[color]",
    },
  ];

  const elements = {
    pattern: document.getElementById("patternInput"),
    expressionBox: document.getElementById("expressionBox"),
    patternMessage: document.getElementById("patternMessage"),
    flags: Array.from(document.querySelectorAll(".flag-toggle input")),
    presetList: document.getElementById("presetList"),
    text: document.getElementById("testText"),
    textCount: document.getElementById("textCount"),
    highlightLayer: document.getElementById("highlightLayer"),
    highlightContent: document.getElementById("highlightContent"),
    matchList: document.getElementById("matchList"),
    resultPill: document.getElementById("resultPill"),
    replacement: document.getElementById("replacementInput"),
    replacementOutput: document.getElementById("replacementOutput"),
    copyResult: document.getElementById("copyResultButton"),
    stateMetric: document.getElementById("stateMetric"),
    matchMetric: document.getElementById("matchMetric"),
    timeMetric: document.getElementById("timeMetric"),
    charMetric: document.getElementById("charMetric"),
    restoreSample: document.getElementById("restoreSampleButton"),
    clearText: document.getElementById("clearTextButton"),
    toast: document.getElementById("toast"),
  };

  let evaluationTimer = null;
  let toastTimer = null;
  let selectedOrder = null;
  let selectedPreset = null;
  let latestResult = null;
  let latestReplacement = "";

  function getFlags() {
    return elements.flags
      .filter((input) => input.checked && !input.disabled)
      .map((input) => input.value)
      .join("");
  }

  function setFlags(flags) {
    elements.flags.forEach((input) => {
      input.checked = flags.includes(input.value) && !input.disabled;
    });
  }

  function setStateMetric(label, state) {
    elements.stateMetric.textContent = label;
    elements.stateMetric.dataset.state = state;
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 2200);
  }

  function saveState() {
    const state = {
      version: 1,
      source: elements.pattern.value,
      flags: getFlags(),
      text: elements.text.value,
      replacement: elements.replacement.value,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // Private browsing and storage quotas must not block the tester.
    }
  }

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!parsed || parsed.version !== 1) return null;
      if (![parsed.source, parsed.flags, parsed.text, parsed.replacement].every((value) => typeof value === "string")) {
        return null;
      }
      return {
        source: parsed.source.slice(0, 500),
        flags: parsed.flags,
        text: parsed.text.slice(0, 50000),
        replacement: parsed.replacement.slice(0, 500),
      };
    } catch (_) {
      return null;
    }
  }

  function renderPresets() {
    const fragment = document.createDocumentFragment();
    PRESETS.forEach((preset) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "preset-button";
      button.dataset.preset = preset.id;
      button.textContent = preset.label;
      button.addEventListener("click", () => loadPreset(preset.id));
      fragment.append(button);
    });
    elements.presetList.replaceChildren(fragment);
  }

  function updatePresetSelection() {
    elements.presetList.querySelectorAll(".preset-button").forEach((button) => {
      const active = button.dataset.preset === selectedPreset;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function loadPreset(id, announce = true) {
    const preset = PRESETS.find((item) => item.id === id) || PRESETS[0];
    selectedPreset = preset.id;
    elements.pattern.value = preset.source;
    setFlags(preset.flags);
    elements.text.value = preset.text;
    elements.replacement.value = preset.replacement;
    selectedOrder = null;
    updatePresetSelection();
    evaluateNow();
    if (announce) showToast(`已载入“${preset.label}”样例`);
  }

  function markCustomInput() {
    selectedPreset = null;
    updatePresetSelection();
    scheduleEvaluation();
  }

  function updateMessage(result) {
    elements.patternMessage.className = "pattern-message";
    if (!result.ok) {
      elements.patternMessage.classList.add("error");
      elements.patternMessage.textContent = `无法编译：${result.error}`;
      return;
    }
    if (result.empty) {
      elements.patternMessage.textContent = "输入表达式后即时检验。";
      return;
    }
    if (result.truncated) {
      elements.patternMessage.textContent = `命中过多，检验带只展示前 ${MATCH_LIMIT} 项。`;
      return;
    }
    if (!result.flags.includes("g") && result.matches.length > 0) {
      elements.patternMessage.textContent = "当前未启用 g 标志，只检查第一个匹配。";
      return;
    }
    elements.patternMessage.classList.add("success");
    elements.patternMessage.textContent = result.matches.length
      ? `模式有效，找到 ${result.matches.length} 个匹配。`
      : "模式有效，但测试文本中没有命中。";
  }

  function renderHighlights(text, matches) {
    const segments = Core.createHighlightSegments(text, matches);
    const fragment = document.createDocumentFragment();
    segments.forEach((segment) => {
      if (segment.type === "text") {
        fragment.append(document.createTextNode(segment.value));
        return;
      }
      const mark = document.createElement("mark");
      mark.className = segment.type === "zero" ? "zero-mark" : "match-mark";
      mark.dataset.order = String(segment.order);
      if (segment.order === selectedOrder) mark.classList.add("active");
      mark.textContent = segment.value || "\u200b";
      fragment.append(mark);
    });
    if (text.endsWith("\n")) fragment.append(document.createTextNode("\n "));
    elements.highlightContent.replaceChildren(fragment);
    syncEditorScroll();
  }

  function shortValue(value, limit = 120) {
    if (value == null) return "未参与匹配";
    if (value === "") return "∅ 零长度";
    const normalized = value.replace(/\n/g, "↵").replace(/\t/g, "⇥");
    return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
  }

  function createGroupRow(label, value, start, end) {
    const row = document.createElement("div");
    row.className = "group-row";
    const name = document.createElement("span");
    name.className = "group-label";
    name.textContent = label;
    const content = document.createElement("span");
    content.className = "group-value";
    const range = start == null ? "" : `  [${start}, ${end}]`;
    content.textContent = `${shortValue(value, 80)}${range}`;
    content.title = value == null ? "未参与匹配" : value;
    row.append(name, content);
    return row;
  }

  function createMatchCard(match) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "match-card";
    card.dataset.order = String(match.order);
    card.classList.toggle("active", match.order === selectedOrder);
    card.setAttribute("aria-label", `匹配 ${match.order}，位置 ${match.index} 到 ${match.end}`);

    const summary = document.createElement("span");
    summary.className = "match-summary";
    const number = document.createElement("span");
    number.className = "match-number";
    number.textContent = `#${String(match.order).padStart(2, "0")}`;
    const value = document.createElement("span");
    value.className = "match-value";
    value.textContent = shortValue(match.value);
    value.title = match.value || "零长度匹配";
    const range = document.createElement("span");
    range.className = "match-range";
    range.textContent = `[${match.index}, ${match.end}]`;
    summary.append(number, value, range);
    card.append(summary);

    if (match.captures.length || match.named.length) {
      const sheet = document.createElement("span");
      sheet.className = "group-sheet";
      match.captures.forEach((capture) => {
        sheet.append(createGroupRow(`GROUP $${capture.number}`, capture.value, capture.start, capture.end));
      });
      match.named.forEach((group) => {
        sheet.append(createGroupRow(`<${group.name}>`, group.value, group.start, group.end));
      });
      card.append(sheet);
    }

    card.addEventListener("click", () => selectMatch(match.order));
    return card;
  }

  function renderInspector(result) {
    const fragment = document.createDocumentFragment();
    const count = result.ok ? result.matches.length : 0;
    elements.resultPill.textContent = result.truncated ? `${count}+ 命中` : `${count} 命中`;

    if (result.truncated) {
      const note = document.createElement("div");
      note.className = "truncate-note";
      note.textContent = `为保持页面流畅，只展示前 ${MATCH_LIMIT} 个匹配。请缩小测试文本或收窄模式。`;
      fragment.append(note);
    }

    if (!result.ok || result.empty || count === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-result";
      const content = document.createElement("div");
      const title = document.createElement("strong");
      const description = document.createElement("span");
      if (!result.ok) {
        title.textContent = "等待修正模式";
        description.textContent = "修复上方的语法错误后，检验带会立即恢复。";
      } else if (result.empty) {
        title.textContent = "还没有检验任务";
        description.textContent = "输入一个正则表达式，或从常用正则库载入示例。";
      } else {
        title.textContent = "没有找到匹配";
        description.textContent = "模式语法正确。请检查文本、大小写和标志设置。";
      }
      content.append(title, description);
      empty.append(content);
      fragment.append(empty);
    } else {
      result.matches.forEach((match) => fragment.append(createMatchCard(match)));
    }
    elements.matchList.replaceChildren(fragment);
  }

  function updateReplacement() {
    const replacement = Core.replacePattern({
      source: elements.pattern.value,
      flags: getFlags(),
      text: elements.text.value,
      replacement: elements.replacement.value,
    });
    latestReplacement = replacement.value;
    elements.replacementOutput.textContent = replacement.ok
      ? replacement.value
      : `暂时无法预览：${replacement.error}`;
    elements.copyResult.disabled = !replacement.ok;
  }

  function selectMatch(order) {
    const match = latestResult?.matches.find((item) => item.order === order);
    if (!match) return;
    selectedOrder = order;
    renderHighlights(elements.text.value, latestResult.matches);
    elements.matchList.querySelectorAll(".match-card").forEach((card) => {
      card.classList.toggle("active", Number(card.dataset.order) === order);
    });
    elements.text.focus({ preventScroll: true });
    elements.text.setSelectionRange(match.index, match.end);

    const lineCount = elements.text.value.slice(0, match.index).split("\n").length - 1;
    const computed = getComputedStyle(elements.text);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 24;
    elements.text.scrollTop = Math.max(0, lineCount * lineHeight - elements.text.clientHeight * 0.35);
    syncEditorScroll();
  }

  function syncEditorScroll() {
    elements.highlightLayer.scrollTop = elements.text.scrollTop;
    elements.highlightLayer.scrollLeft = elements.text.scrollLeft;
  }

  function evaluateNow() {
    window.clearTimeout(evaluationTimer);
    evaluationTimer = null;
    const source = elements.pattern.value;
    const flags = getFlags();
    const text = elements.text.value;
    const start = performance.now();
    const result = Core.analyzePattern({ source, flags, text, limit: MATCH_LIMIT });
    const elapsed = performance.now() - start;
    latestResult = result;
    if (!result.matches.some((match) => match.order === selectedOrder)) selectedOrder = null;

    elements.expressionBox.classList.toggle("invalid", !result.ok);
    elements.pattern.setAttribute("aria-invalid", String(!result.ok));
    elements.matchMetric.textContent = result.truncated ? `${result.matches.length}+` : String(result.matches.length);
    elements.timeMetric.textContent = result.empty ? "—" : `${elapsed < 10 ? elapsed.toFixed(2) : elapsed.toFixed(1)} ms`;
    elements.charMetric.textContent = text.length.toLocaleString("zh-CN");
    elements.textCount.textContent = `${text.length.toLocaleString("zh-CN")} / 50,000`;

    if (!result.ok) setStateMetric("ERROR", "error");
    else if (result.empty) setStateMetric("WAITING", "waiting");
    else setStateMetric(elapsed > 100 ? "SLOW" : "VALID", elapsed > 100 ? "waiting" : "valid");

    updateMessage(result);
    renderHighlights(text, result.matches);
    renderInspector(result);
    updateReplacement();
    saveState();
  }

  function scheduleEvaluation() {
    window.clearTimeout(evaluationTimer);
    evaluationTimer = window.setTimeout(evaluateNow, 90);
  }

  async function copyReplacement() {
    if (elements.copyResult.disabled) return;
    try {
      await navigator.clipboard.writeText(latestReplacement);
      showToast("替换结果已复制");
    } catch (_) {
      const helper = document.createElement("textarea");
      helper.value = latestReplacement;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.append(helper);
      helper.select();
      const copied = document.execCommand("copy");
      helper.remove();
      showToast(copied ? "替换结果已复制" : "复制失败，请手动选择结果");
    }
  }

  function configureFlagSupport() {
    elements.flags.forEach((input) => {
      try {
        new RegExp("", input.value);
      } catch (_) {
        input.disabled = true;
        input.closest("label").title = `当前浏览器不支持 ${input.value} 标志`;
      }
    });
  }

  function handleFlagChange(changed) {
    if (changed.checked && changed.value === "u") {
      const unicodeSets = elements.flags.find((input) => input.value === "v");
      if (unicodeSets) unicodeSets.checked = false;
    }
    if (changed.checked && changed.value === "v") {
      const unicode = elements.flags.find((input) => input.value === "u");
      if (unicode) unicode.checked = false;
    }
    markCustomInput();
  }

  function bindEvents() {
    elements.pattern.addEventListener("input", markCustomInput);
    elements.text.addEventListener("input", markCustomInput);
    elements.text.addEventListener("scroll", syncEditorScroll);
    elements.replacement.addEventListener("input", () => {
      selectedPreset = null;
      updatePresetSelection();
      updateReplacement();
      saveState();
    });
    elements.flags.forEach((input) => input.addEventListener("change", () => handleFlagChange(input)));
    elements.restoreSample.addEventListener("click", () => loadPreset(DEFAULT_PRESET));
    elements.clearText.addEventListener("click", () => {
      elements.text.value = "";
      selectedPreset = null;
      selectedOrder = null;
      updatePresetSelection();
      evaluateNow();
      elements.text.focus();
      showToast("测试文本已清空");
    });
    elements.copyResult.addEventListener("click", copyReplacement);
    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        evaluateNow();
        showToast("已重新检验");
      }
    });
  }

  function initialize() {
    if (!Core) throw new Error("RegexCore failed to load");
    configureFlagSupport();
    renderPresets();
    bindEvents();
    const saved = readState();
    if (saved) {
      elements.pattern.value = saved.source;
      setFlags(saved.flags);
      elements.text.value = saved.text;
      elements.replacement.value = saved.replacement;
      selectedPreset = null;
      updatePresetSelection();
      evaluateNow();
    } else {
      loadPreset(DEFAULT_PRESET, false);
    }
  }

  initialize();
})();
