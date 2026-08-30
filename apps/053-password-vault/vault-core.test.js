const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');

const {
  LIMITS,
  MIN_KDF_ITERATIONS,
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
  createVault,
  unlockVault,
  sealVault,
} = require('./vault-core.js');

const MASTER_PASSWORD = 'correct horse battery staple';
const NOW = '2026-08-30T15:00:00.000Z';

const sampleEntry = {
  id: '00112233445566778899aabbccddeeff',
  title: 'GitHub',
  username: 'alice@example.com',
  password: 'gH7! mV9# private',
  url: 'https://github.com/login',
  notes: 'Personal account',
  createdAt: NOW,
  updatedAt: NOW,
};

const sampleData = {
  entries: [sampleEntry],
  createdAt: NOW,
  updatedAt: NOW,
};

test('validateMasterPassword enforces length without composition rules', () => {
  assert.deepEqual(validateMasterPassword('short'), {
    valid: false,
    message: '主密码至少需要 12 个字符',
  });
  assert.equal(validateMasterPassword('一段足够长的中文主密码口令').valid, true);
  assert.equal(validateMasterPassword('x'.repeat(LIMITS.masterPassword + 1)).valid, false);
});

test('evaluatePasswordStrength distinguishes weak and strong secrets', () => {
  const weak = evaluatePasswordStrength('password');
  const strong = evaluatePasswordStrength('Raven-cabin-47!meteor');

  assert.equal(weak.label, '较弱');
  assert.ok(weak.score <= 1);
  assert.equal(strong.label, '很强');
  assert.equal(strong.score, 4);
  assert.equal(strong.percent, 100);
});

test('normalizeEntry trims labels but preserves password whitespace', () => {
  const entry = normalizeEntry({
    title: '  GitHub  ',
    username: ' alice@example.com ',
    password: ' secret with spaces ',
    url: ' github.com/login ',
    notes: '  recovery codes are offline  ',
  }, {
    id: sampleEntry.id,
    now: NOW,
    createdAt: NOW,
  });

  assert.equal(entry.title, 'GitHub');
  assert.equal(entry.username, 'alice@example.com');
  assert.equal(entry.password, ' secret with spaces ');
  assert.equal(entry.url, 'https://github.com/login');
  assert.equal(entry.notes, 'recovery codes are offline');
  assert.equal(entry.updatedAt, NOW);
});

test('normalizeEntry rejects missing titles, dangerous URLs, and oversized fields', () => {
  assert.throws(() => normalizeEntry({ title: '', password: 'x' }, {
    id: sampleEntry.id,
    now: NOW,
  }), (error) => error instanceof VaultError && error.code === 'INVALID_ENTRY');

  assert.throws(() => normalizeEntry({
    title: 'Unsafe',
    password: 'x',
    url: 'javascript:alert(1)',
  }, { id: sampleEntry.id, now: NOW }), /网址只能使用 http 或 https/);

  assert.throws(() => normalizeEntry({
    title: 'x'.repeat(LIMITS.title + 1),
    password: 'x',
  }, { id: sampleEntry.id, now: NOW }), /标题不能超过/);
});

test('toSafeHttpUrl normalizes domains and rejects script schemes or credentials', () => {
  assert.equal(toSafeHttpUrl('example.com/account'), 'https://example.com/account');
  assert.equal(toSafeHttpUrl('http://localhost:8000/login'), 'http://localhost:8000/login');
  assert.equal(toSafeHttpUrl('javascript:alert(1)'), null);
  assert.equal(toSafeHttpUrl('https://user:pass@example.com'), null);
  assert.equal(toSafeHttpUrl(''), '');
});

test('validateVaultData accepts normalized data and rejects excess entries', () => {
  const value = validateVaultData(sampleData);
  assert.deepEqual(value, sampleData);

  assert.throws(() => validateVaultData({
    ...sampleData,
    entries: Array.from({ length: LIMITS.entries + 1 }, () => sampleEntry),
  }), (error) => error instanceof VaultError && error.code === 'INVALID_DATA');
});

test('base64 helpers round trip bytes and reject malformed input', () => {
  const bytes = Uint8Array.from([0, 1, 2, 127, 128, 255]);
  const encoded = bytesToBase64(bytes);
  assert.deepEqual(base64ToBytes(encoded), bytes);
  assert.throws(() => base64ToBytes('not base64!'), /Base64/);
});

test('validateVaultEnvelope enforces version, algorithms, random sizes, and work factor', async () => {
  const { envelope } = await createVault(MASTER_PASSWORD, sampleData, {
    cryptoApi: webcrypto,
    iterations: MIN_KDF_ITERATIONS,
  });

  assert.deepEqual(validateVaultEnvelope(envelope), envelope);
  assert.equal(PRODUCTION_KDF_ITERATIONS, 600000);
  assert.throws(() => validateVaultEnvelope({ ...envelope, version: 2 }), /版本/);
  assert.throws(() => validateVaultEnvelope({
    ...envelope,
    kdf: { ...envelope.kdf, iterations: MIN_KDF_ITERATIONS - 1 },
  }), /派生参数/);
  assert.throws(() => validateVaultEnvelope({
    ...envelope,
    cipher: { ...envelope.cipher, iv: bytesToBase64(new Uint8Array(8)) },
  }), /初始化向量/);
});

test('createVault and unlockVault round trip authenticated encrypted data', async () => {
  const { envelope, key } = await createVault(MASTER_PASSWORD, sampleData, {
    cryptoApi: webcrypto,
    iterations: MIN_KDF_ITERATIONS,
  });

  assert.equal(key.extractable, false);
  assert.equal(JSON.stringify(envelope).includes(sampleEntry.password), false);
  const unlocked = await unlockVault(MASTER_PASSWORD, envelope, { cryptoApi: webcrypto });
  assert.deepEqual(unlocked.data, sampleData);
  assert.equal(unlocked.key.extractable, false);
});

test('unlockVault uses one generic error for a wrong master password or tampering', async () => {
  const { envelope } = await createVault(MASTER_PASSWORD, sampleData, {
    cryptoApi: webcrypto,
    iterations: MIN_KDF_ITERATIONS,
  });

  await assert.rejects(
    unlockVault('this is the wrong master password', envelope, { cryptoApi: webcrypto }),
    (error) => error instanceof VaultError && error.code === 'UNLOCK_FAILED',
  );

  const tamperedBytes = base64ToBytes(envelope.cipher.ciphertext);
  tamperedBytes[0] ^= 1;
  const tampered = {
    ...envelope,
    cipher: { ...envelope.cipher, ciphertext: bytesToBase64(tamperedBytes) },
  };
  await assert.rejects(
    unlockVault(MASTER_PASSWORD, tampered, { cryptoApi: webcrypto }),
    (error) => error instanceof VaultError && error.code === 'UNLOCK_FAILED',
  );
});

test('sealVault generates a fresh IV while preserving KDF parameters', async () => {
  const created = await createVault(MASTER_PASSWORD, sampleData, {
    cryptoApi: webcrypto,
    iterations: MIN_KDF_ITERATIONS,
  });
  const first = await sealVault(created.key, sampleData, created.envelope.kdf, {
    cryptoApi: webcrypto,
  });
  const second = await sealVault(created.key, sampleData, created.envelope.kdf, {
    cryptoApi: webcrypto,
  });

  assert.deepEqual(first.kdf, second.kdf);
  assert.notEqual(first.cipher.iv, second.cipher.iv);
  assert.notEqual(first.cipher.ciphertext, second.cipher.ciphertext);
});

test('generatePassword satisfies every selected group and excludes ambiguous characters', () => {
  let cursor = 0;
  const password = generatePassword({
    length: 32,
    lowercase: true,
    uppercase: true,
    digits: true,
    symbols: true,
    excludeAmbiguous: true,
  }, {
    randomInt(max) {
      const value = cursor % max;
      cursor += 1;
      return value;
    },
  });

  assert.equal(password.length, 32);
  assert.match(password, /[a-z]/);
  assert.match(password, /[A-Z]/);
  assert.match(password, /[0-9]/);
  assert.match(password, /[!@#$%^&*()_+\-=]/);
  assert.doesNotMatch(password, /[O0Il1|]/);
});

test('generatePassword rejects unsafe configurations', () => {
  assert.throws(() => generatePassword({
    length: 20,
    lowercase: false,
    uppercase: false,
    digits: false,
    symbols: false,
  }, { randomInt: () => 0 }), /至少选择一组字符/);
  assert.throws(() => generatePassword({ length: 5 }, { randomInt: () => 0 }), /长度/);
  assert.throws(() => generatePassword({ length: 129 }, { randomInt: () => 0 }), /长度/);
});

