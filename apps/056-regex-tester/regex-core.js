(function attachRegexCore(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.RegexCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRegexCore() {
  "use strict";

  const FLAG_ORDER = ["d", "g", "i", "m", "s", "u", "v", "y"];
  const FLAG_SET = new Set(FLAG_ORDER);

  function normalizeFlags(flags = "") {
    const requested = String(flags).split("");
    const unsupported = requested.find((flag) => !FLAG_SET.has(flag));
    if (unsupported) throw new SyntaxError(`Unsupported regular expression flag: ${unsupported}`);
    const unique = new Set(requested);
    return FLAG_ORDER.filter((flag) => unique.has(flag)).join("");
  }

  function compilePattern(source, flags = "") {
    try {
      const normalizedFlags = normalizeFlags(flags);
      return {
        ok: true,
        regex: new RegExp(String(source), normalizedFlags),
        flags: normalizedFlags,
        error: null,
      };
    } catch (error) {
      return {
        ok: false,
        regex: null,
        flags: String(flags),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  function supportsMatchIndices() {
    try {
      return new RegExp(".", "d").hasIndices === true;
    } catch (_) {
      return false;
    }
  }

  function addIndicesFlag(flags) {
    if (!supportsMatchIndices() || flags.includes("d")) return flags;
    return normalizeFlags(`${flags}d`);
  }

  function advanceStringIndex(text, index, unicode) {
    if (!unicode || index + 1 >= text.length) return index + 1;
    const first = text.charCodeAt(index);
    if (first < 0xd800 || first > 0xdbff) return index + 1;
    const second = text.charCodeAt(index + 1);
    return second >= 0xdc00 && second <= 0xdfff ? index + 2 : index + 1;
  }

  function fallbackCaptureRange(fullValue, captureValue, matchStart, searchFrom) {
    if (captureValue == null) return { start: null, end: null, next: searchFrom };
    const relative = fullValue.indexOf(captureValue, searchFrom);
    if (relative < 0) return { start: null, end: null, next: searchFrom };
    return {
      start: matchStart + relative,
      end: matchStart + relative + captureValue.length,
      next: relative + captureValue.length,
    };
  }

  function snapshotMatch(match, order) {
    let fallbackOffset = 0;
    const captures = match.slice(1).map((value, captureIndex) => {
      const indexed = match.indices?.[captureIndex + 1];
      const fallback = indexed
        ? { start: indexed[0], end: indexed[1], next: fallbackOffset }
        : fallbackCaptureRange(match[0], value, match.index, fallbackOffset);
      fallbackOffset = fallback.next;
      return {
        number: captureIndex + 1,
        value: value ?? null,
        start: fallback.start,
        end: fallback.end,
      };
    });

    const named = Object.entries(match.groups || {}).map(([name, value]) => {
      const indexed = match.indices?.groups?.[name];
      return {
        name,
        value: value ?? null,
        start: indexed ? indexed[0] : null,
        end: indexed ? indexed[1] : null,
      };
    });

    return {
      order,
      value: match[0],
      index: match.index,
      end: match.index + match[0].length,
      captures,
      named,
    };
  }

  function analyzePattern({ source = "", flags = "", text = "", limit = 300 } = {}) {
    const pattern = String(source);
    const material = String(text);
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 300));

    if (!pattern) {
      const emptyPattern = compilePattern("", flags);
      if (!emptyPattern.ok) {
        return {
          ok: false,
          empty: true,
          flags: emptyPattern.flags,
          matches: [],
          truncated: false,
          error: emptyPattern.error,
        };
      }
      return {
        ok: true,
        empty: true,
        flags: emptyPattern.flags,
        matches: [],
        truncated: false,
        error: null,
      };
    }

    const compiled = compilePattern(pattern, flags);
    if (!compiled.ok) {
      return {
        ok: false,
        empty: false,
        flags: compiled.flags,
        matches: [],
        truncated: false,
        error: compiled.error,
      };
    }

    const evaluator = new RegExp(compiled.regex.source, addIndicesFlag(compiled.flags));
    const repeats = evaluator.global || evaluator.sticky;
    const unicode = evaluator.unicode || evaluator.unicodeSets;
    const matches = [];
    let truncated = false;
    let result;

    while ((result = evaluator.exec(material)) !== null) {
      if (matches.length >= safeLimit) {
        truncated = true;
        break;
      }
      matches.push(snapshotMatch(result, matches.length + 1));
      if (!repeats) break;
      if (result[0] === "") {
        evaluator.lastIndex = advanceStringIndex(material, evaluator.lastIndex, unicode);
      }
    }

    return {
      ok: true,
      empty: false,
      flags: compiled.flags,
      matches,
      truncated,
      error: null,
    };
  }

  function createHighlightSegments(text, matches) {
    const material = String(text);
    const segments = [];
    let cursor = 0;

    for (const match of matches || []) {
      const start = Math.max(cursor, Math.min(material.length, Number(match.index) || 0));
      const end = Math.max(start, Math.min(material.length, Number(match.end) || start));
      if (start > cursor) {
        segments.push({ type: "text", value: material.slice(cursor, start), start: cursor, end: start });
      }
      segments.push({
        type: start === end ? "zero" : "match",
        value: material.slice(start, end),
        start,
        end,
        order: match.order,
      });
      cursor = end;
    }

    if (cursor < material.length || segments.length === 0) {
      segments.push({ type: "text", value: material.slice(cursor), start: cursor, end: material.length });
    }
    return segments;
  }

  function replacePattern({ source = "", flags = "", text = "", replacement = "" } = {}) {
    if (!String(source)) return { ok: true, value: String(text), error: null };
    const compiled = compilePattern(source, flags);
    if (!compiled.ok) return { ok: false, value: String(text), error: compiled.error };
    try {
      return {
        ok: true,
        value: String(text).replace(compiled.regex, String(replacement)),
        error: null,
      };
    } catch (error) {
      return {
        ok: false,
        value: String(text),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    FLAG_ORDER,
    normalizeFlags,
    compilePattern,
    analyzePattern,
    createHighlightSegments,
    replacePattern,
  };
});
