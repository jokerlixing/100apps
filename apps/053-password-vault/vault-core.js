(function initVaultCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VaultCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function vaultCoreFactory() {
  'use strict';

  const LIMITS = Object.freeze({
    masterPassword: 256,
    entries: 200,
    title: 80,
    username: 160,
    password: 512,
    url: 2048,
    notes: 4000,
    vaultBytes: 5 * 1024 * 1024,
    generatorMin: 12,
    generatorMax: 128,
  });
  const VAULT_VERSION = 1;
  const MIN_KDF_ITERATIONS = 100000;
  const MAX_KDF_ITERATIONS = 5000000;
  const PRODUCTION_KDF_ITERATIONS = 600000;
  const SALT_BYTES = 16;
  const IV_BYTES = 12;
  const AAD_TEXT = 'LOCKBOX/53:VAULT:V1';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });

  class VaultError extends Error {
    constructor(code, message, cause) {
      super(message, cause ? { cause } : undefined);
      this.name = 'VaultError';
      this.code = code;
    }
  }

  function codePointLength(value) {
    return Array.from(value).length;
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function isIsoDate(value) {
    return typeof value === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
      && Number.isFinite(Date.parse(value));
  }

  function requireString(value, fieldName, maxLength, { trim = true, allowEmpty = true } = {}) {
    if (typeof value !== 'string') {
      throw new VaultError('INVALID_ENTRY', `${fieldName}格式不正确`);
    }
    const result = trim ? value.trim() : value;
    if (!allowEmpty && result.length === 0) {
      throw new VaultError('INVALID_ENTRY', `请填写${fieldName}`);
    }
    if (codePointLength(result) > maxLength) {
      throw new VaultError('INVALID_ENTRY', `${fieldName}不能超过 ${maxLength} 个字符`);
    }
    return result;
  }

  function validateMasterPassword(password) {
    if (typeof password !== 'string' || codePointLength(password) < 12) {
      return { valid: false, message: '主密码至少需要 12 个字符' };
    }
    if (codePointLength(password) > LIMITS.masterPassword) {
      return { valid: false, message: `主密码不能超过 ${LIMITS.masterPassword} 个字符` };
    }
    return { valid: true, message: '' };
  }

  function evaluatePasswordStrength(password) {
    if (typeof password !== 'string' || password.length === 0) {
      return {
        score: 0,
        label: '较弱',
        percent: 0,
        suggestions: ['使用 16 个以上字符会更稳妥'],
      };
    }

    const length = codePointLength(password);
    const categories = [/[a-z]/, /[A-Z]/, /\d/, /[^\p{L}\p{N}\s]/u]
      .reduce((count, pattern) => count + Number(pattern.test(password)), 0);
    let score = 0;
    if (length >= 12) score += 1;
    if (length >= 16) score += 1;
    if (categories >= 3) score += 1;
    if (categories === 4 && length >= 16) score += 1;

    const lowered = password.toLowerCase();
    if (/password|123456|qwerty|admin|letmein|密码/.test(lowered)) score -= 1;
    if (/(.)\1{3,}/u.test(password)) score -= 1;
    score = Math.max(0, Math.min(4, score));

    const suggestions = [];
    if (length < 16) suggestions.push('增加到至少 16 个字符');
    if (categories < 3) suggestions.push('混合大小写、数字或符号');
    if (score === 4) suggestions.push('长度和字符变化都很好');

    return {
      score,
      label: ['较弱', '较弱', '一般', '强', '很强'][score],
      percent: score * 25,
      suggestions,
    };
  }

  function toSafeHttpUrl(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return '';
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      const url = new URL(candidate);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  function normalizeEntry(input, options = {}) {
    if (!isPlainObject(input)) {
      throw new VaultError('INVALID_ENTRY', '账号记录格式不正确');
    }
    const id = options.id || input.id;
    if (typeof id !== 'string' || !/^[a-f\d]{32}$/i.test(id)) {
      throw new VaultError('INVALID_ENTRY', '账号记录编号不正确');
    }
    const now = options.now || input.updatedAt;
    const createdAt = options.createdAt || input.createdAt || now;
    if (!isIsoDate(now) || !isIsoDate(createdAt)) {
      throw new VaultError('INVALID_ENTRY', '账号记录时间不正确');
    }

    const rawUrl = requireString(input.url || '', '网址', LIMITS.url);
    const safeUrl = toSafeHttpUrl(rawUrl);
    if (safeUrl === null) {
      throw new VaultError('INVALID_ENTRY', '网址只能使用 http 或 https，且不能包含登录凭据');
    }

    return {
      id: id.toLowerCase(),
      title: requireString(input.title, '标题', LIMITS.title, { allowEmpty: false }),
      username: requireString(input.username || '', '用户名', LIMITS.username),
      password: requireString(input.password || '', '密码', LIMITS.password, { trim: false }),
      url: safeUrl,
      notes: requireString(input.notes || '', '备注', LIMITS.notes),
      createdAt,
      updatedAt: now,
    };
  }

  function validateVaultData(value) {
    try {
      if (!isPlainObject(value) || !Array.isArray(value.entries)) {
        throw new Error('保险箱数据格式不正确');
      }
      if (value.entries.length > LIMITS.entries) {
        throw new Error(`保险箱最多保存 ${LIMITS.entries} 条账号记录`);
      }
      if (!isIsoDate(value.createdAt) || !isIsoDate(value.updatedAt)) {
        throw new Error('保险箱时间格式不正确');
      }

      const seenIds = new Set();
      const entries = value.entries.map((entry) => {
        const normalized = normalizeEntry(entry, {
          id: entry && entry.id,
          now: entry && entry.updatedAt,
          createdAt: entry && entry.createdAt,
        });
        if (seenIds.has(normalized.id)) throw new Error('账号记录编号重复');
        seenIds.add(normalized.id);
        return normalized;
      });
      return { entries, createdAt: value.createdAt, updatedAt: value.updatedAt };
    } catch (error) {
      if (error instanceof VaultError && error.code === 'INVALID_DATA') throw error;
      throw new VaultError('INVALID_DATA', error.message || '保险箱数据格式不正确', error);
    }
  }

  function bytesToBase64(value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    if (typeof value !== 'string'
      || value.length === 0
      || value.length % 4 !== 0
      || !/^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/.test(value)) {
      throw new VaultError('INVALID_BASE64', 'Base64 数据格式不正确');
    }
    try {
      const bytes = typeof Buffer !== 'undefined'
        ? Uint8Array.from(Buffer.from(value, 'base64'))
        : Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
      if (bytesToBase64(bytes) !== value) throw new Error('not canonical');
      return bytes;
    } catch (error) {
      throw new VaultError('INVALID_BASE64', 'Base64 数据格式不正确', error);
    }
  }

  function validateKdf(value) {
    if (!isPlainObject(value)
      || value.name !== 'PBKDF2'
      || value.hash !== 'SHA-256'
      || !Number.isInteger(value.iterations)
      || value.iterations < MIN_KDF_ITERATIONS
      || value.iterations > MAX_KDF_ITERATIONS) {
      throw new VaultError('INVALID_ENVELOPE', '保险箱密钥派生参数不正确');
    }
    const salt = base64ToBytes(value.salt);
    if (salt.length !== SALT_BYTES) {
      throw new VaultError('INVALID_ENVELOPE', '保险箱随机盐长度不正确');
    }
    return {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: value.iterations,
      salt: value.salt,
    };
  }

  function validateVaultEnvelope(value) {
    try {
      if (!isPlainObject(value)) throw new Error('保险箱文件格式不正确');
      const jsonLength = JSON.stringify(value).length;
      if (jsonLength > Math.ceil((LIMITS.vaultBytes * 4) / 3) + 8192) {
        throw new Error('保险箱文件过大');
      }
      if (value.version !== VAULT_VERSION) throw new Error('不支持的保险箱版本');
      const kdf = validateKdf(value.kdf);
      if (!isPlainObject(value.cipher) || value.cipher.name !== 'AES-GCM') {
        throw new Error('保险箱加密算法不正确');
      }
      const iv = base64ToBytes(value.cipher.iv);
      if (iv.length !== IV_BYTES) throw new Error('保险箱初始化向量长度不正确');
      const ciphertext = base64ToBytes(value.cipher.ciphertext);
      if (ciphertext.length < 17 || ciphertext.length > LIMITS.vaultBytes + 16) {
        throw new Error('保险箱密文长度不正确');
      }
      if (!isIsoDate(value.updatedAt)) throw new Error('保险箱更新时间不正确');

      return {
        version: VAULT_VERSION,
        kdf,
        cipher: {
          name: 'AES-GCM',
          iv: value.cipher.iv,
          ciphertext: value.cipher.ciphertext,
        },
        updatedAt: value.updatedAt,
      };
    } catch (error) {
      if (error instanceof VaultError && error.code === 'INVALID_ENVELOPE') throw error;
      throw new VaultError('INVALID_ENVELOPE', error.message || '保险箱文件格式不正确', error);
    }
  }

  function getCryptoApi(options = {}) {
    const cryptoApi = options.cryptoApi || (typeof globalThis !== 'undefined' && globalThis.crypto);
    if (!cryptoApi || !cryptoApi.subtle || typeof cryptoApi.getRandomValues !== 'function') {
      throw new VaultError('CRYPTO_UNAVAILABLE', '当前浏览器不支持安全加密功能');
    }
    return cryptoApi;
  }

  function randomBytes(length, cryptoApi) {
    const bytes = new Uint8Array(length);
    cryptoApi.getRandomValues(bytes);
    return bytes;
  }

  async function deriveVaultKey(masterPassword, kdf, cryptoApi) {
    const validation = validateMasterPassword(masterPassword);
    if (!validation.valid) throw new VaultError('INVALID_MASTER', validation.message);
    const keyMaterial = await cryptoApi.subtle.importKey(
      'raw',
      encoder.encode(masterPassword),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    return cryptoApi.subtle.deriveKey({
      name: 'PBKDF2',
      hash: kdf.hash,
      salt: base64ToBytes(kdf.salt),
      iterations: kdf.iterations,
    }, keyMaterial, {
      name: 'AES-GCM',
      length: 256,
    }, false, ['encrypt', 'decrypt']);
  }

  async function sealVault(key, data, kdfValue, options = {}) {
    const cryptoApi = getCryptoApi(options);
    const kdf = validateKdf(kdfValue);
    const normalizedData = validateVaultData(data);
    const plaintext = encoder.encode(JSON.stringify(normalizedData));
    if (plaintext.byteLength > LIMITS.vaultBytes) {
      throw new VaultError('VAULT_TOO_LARGE', '保险箱内容超过本地容量上限');
    }
    const iv = randomBytes(IV_BYTES, cryptoApi);
    const encrypted = await cryptoApi.subtle.encrypt({
      name: 'AES-GCM',
      iv,
      additionalData: encoder.encode(AAD_TEXT),
      tagLength: 128,
    }, key, plaintext);
    return {
      version: VAULT_VERSION,
      kdf,
      cipher: {
        name: 'AES-GCM',
        iv: bytesToBase64(iv),
        ciphertext: bytesToBase64(new Uint8Array(encrypted)),
      },
      updatedAt: normalizedData.updatedAt,
    };
  }

  async function createVault(masterPassword, data, options = {}) {
    const cryptoApi = getCryptoApi(options);
    const validation = validateMasterPassword(masterPassword);
    if (!validation.valid) throw new VaultError('INVALID_MASTER', validation.message);
    const iterations = options.iterations === undefined
      ? PRODUCTION_KDF_ITERATIONS
      : options.iterations;
    const kdf = validateKdf({
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations,
      salt: bytesToBase64(randomBytes(SALT_BYTES, cryptoApi)),
    });
    const key = await deriveVaultKey(masterPassword, kdf, cryptoApi);
    const envelope = await sealVault(key, data, kdf, { cryptoApi });
    return { envelope, key };
  }

  async function unlockVault(masterPassword, envelopeValue, options = {}) {
    try {
      const cryptoApi = getCryptoApi(options);
      const envelope = validateVaultEnvelope(envelopeValue);
      const key = await deriveVaultKey(masterPassword, envelope.kdf, cryptoApi);
      const plaintext = await cryptoApi.subtle.decrypt({
        name: 'AES-GCM',
        iv: base64ToBytes(envelope.cipher.iv),
        additionalData: encoder.encode(AAD_TEXT),
        tagLength: 128,
      }, key, base64ToBytes(envelope.cipher.ciphertext));
      const data = validateVaultData(JSON.parse(decoder.decode(plaintext)));
      return { key, data, envelope };
    } catch (error) {
      throw new VaultError(
        'UNLOCK_FAILED',
        '主密码不正确或保险箱已损坏',
        error,
      );
    }
  }

  function secureRandomInt(max, cryptoApi) {
    if (!Number.isInteger(max) || max <= 0 || max > 256) {
      throw new VaultError('INVALID_GENERATOR', '随机范围不正确');
    }
    const boundary = 256 - (256 % max);
    const byte = new Uint8Array(1);
    do {
      cryptoApi.getRandomValues(byte);
    } while (byte[0] >= boundary);
    return byte[0] % max;
  }

  function generatePassword(input = {}, options = {}) {
    const settings = {
      length: Number(input.length),
      lowercase: input.lowercase !== false,
      uppercase: input.uppercase !== false,
      digits: input.digits !== false,
      symbols: input.symbols !== false,
      excludeAmbiguous: input.excludeAmbiguous !== false,
    };
    if (!Number.isInteger(settings.length)
      || settings.length < LIMITS.generatorMin
      || settings.length > LIMITS.generatorMax) {
      throw new VaultError(
        'INVALID_GENERATOR',
        `密码长度需在 ${LIMITS.generatorMin}–${LIMITS.generatorMax} 之间`,
      );
    }

    const groups = [];
    const ambiguous = /[O0Il1|]/g;
    const addGroup = (enabled, characters) => {
      if (enabled) groups.push(settings.excludeAmbiguous ? characters.replace(ambiguous, '') : characters);
    };
    addGroup(settings.lowercase, 'abcdefghijklmnopqrstuvwxyz');
    addGroup(settings.uppercase, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    addGroup(settings.digits, '0123456789');
    addGroup(settings.symbols, '!@#$%^&*()_+-=');
    if (groups.length === 0) {
      throw new VaultError('INVALID_GENERATOR', '至少选择一组字符');
    }
    if (settings.length < groups.length) {
      throw new VaultError('INVALID_GENERATOR', '密码长度不能小于已选字符组数量');
    }

    const cryptoApi = options.randomInt ? null : getCryptoApi(options);
    const randomInt = options.randomInt || ((max) => secureRandomInt(max, cryptoApi));
    const allCharacters = groups.join('');
    const output = groups.map((group) => group[randomInt(group.length)]);
    while (output.length < settings.length) {
      output.push(allCharacters[randomInt(allCharacters.length)]);
    }
    for (let index = output.length - 1; index > 0; index -= 1) {
      const swapIndex = randomInt(index + 1);
      [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
    }
    return output.join('');
  }

  function createEntryId(options = {}) {
    const cryptoApi = getCryptoApi(options);
    return Array.from(randomBytes(16, cryptoApi), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  return Object.freeze({
    LIMITS,
    VAULT_VERSION,
    MIN_KDF_ITERATIONS,
    MAX_KDF_ITERATIONS,
    PRODUCTION_KDF_ITERATIONS,
    VaultError,
    bytesToBase64,
    base64ToBytes,
    validateMasterPassword,
    evaluatePasswordStrength,
    normalizeEntry,
    validateVaultData,
    validateVaultEnvelope,
    toSafeHttpUrl,
    generatePassword,
    createEntryId,
    createVault,
    unlockVault,
    sealVault,
  });
}));

