(function exposeRecorderCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RecorderCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRecorderCore() {
  "use strict";

  const MIME_CANDIDATES = Object.freeze([
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4;codecs=h264,aac",
    "video/mp4",
  ]);

  function selectMimeType(checker) {
    const supports = checker || ((type) => {
      return typeof MediaRecorder !== "undefined" &&
        typeof MediaRecorder.isTypeSupported === "function" &&
        MediaRecorder.isTypeSupported(type);
    });

    return MIME_CANDIDATES.find((type) => supports(type)) || "";
  }

  function formatDuration(milliseconds) {
    const safeMilliseconds = Number.isFinite(milliseconds)
      ? Math.max(0, milliseconds)
      : 0;
    const totalSeconds = Math.floor(safeMilliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds]
      .map((value) => String(value).padStart(2, "0"))
      .join(":");
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const unitIndex = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1,
    );
    const value = bytes / (1024 ** unitIndex);
    const rounded = unitIndex === 0 ? Math.round(value) : Number(value.toFixed(1));
    return `${rounded} ${units[unitIndex]}`;
  }

  function captureProfile(profileName) {
    if (profileName === "720") {
      return {
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
        frameRate: { ideal: 30, max: 30 },
      };
    }
    if (profileName === "original") {
      return { frameRate: { ideal: 30, max: 60 } };
    }
    return {
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 },
      frameRate: { ideal: 30, max: 60 },
    };
  }

  function recordingExtension(mimeType) {
    return String(mimeType).toLowerCase().includes("mp4") ? "mp4" : "webm";
  }

  function buildRecordingName(date = new Date(), extension = "webm") {
    const pad = (value) => String(value).padStart(2, "0");
    const stamp = [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      "-",
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds()),
    ].join("");
    const safeExtension = String(extension).replace(/^\./, "").replace(/[^a-z0-9]/gi, "") || "webm";
    return `FRAME49-${stamp}.${safeExtension.toLowerCase()}`;
  }

  return {
    MIME_CANDIDATES,
    buildRecordingName,
    captureProfile,
    formatBytes,
    formatDuration,
    recordingExtension,
    selectMimeType,
  };
});
