// Real Chromium MediaRecorder regression: only the browser's screen/microphone sources are substituted.
// Run: node apps/049-screen-recorder/qa/region-recording-smoke.cjs [output-directory]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

function loadPlaywright() {
  try { return require('playwright'); } catch {}
  return require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
}

const { chromium } = loadPlaywright();
const root = path.resolve(__dirname, '../../..');
const outputDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'frame49-region-smoke'));
const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
  const file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`, url.pathname.endsWith('/') ? 'index.html' : '');
  if (!file.startsWith(`${root}${path.sep}`)) { response.writeHead(403).end(); return; }
  fs.readFile(file, (error, content) => {
    if (error) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'content-type': mimeTypes[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(content);
  });
});

// Native canvas/audio tracks keep changing after the screenshot has been selected.
// The red border must never appear in the center-quarter recording.
function installSources() {
  window.__captureSources = [];
  window.__microphoneSources = [];
  window.__holdMicrophone = false;
  window.__displayRequests = [];
  function audioSource() {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const destination = context.createMediaStreamDestination();
    gain.gain.value = 0.04;
    oscillator.frequency.value = 440;
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    context.resume();
    return { context, stream: destination.stream };
  }
  Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async (options) => {
    window.__displayRequests.push(options);
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const context = canvas.getContext('2d');
    const source = { canvas, context, ticks: 0, stream: null, audio: null };
    function paint() {
      source.ticks += 1;
      context.fillStyle = '#ff0000';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = Math.floor(source.ticks / 9) % 2 ? '#00f000' : '#0020f0';
      context.fillRect(200, 150, 400, 300);
      source.stream?.getVideoTracks()[0]?.requestFrame?.();
    }
    paint();
    source.stream = canvas.captureStream(30);
    if (options.audio) {
      source.audio = audioSource();
      source.stream.addTrack(source.audio.stream.getAudioTracks()[0]);
    }
    const timer = setInterval(() => {
      if (source.stream.getVideoTracks()[0].readyState === 'ended') {
        clearInterval(timer);
        source.audio?.context.close();
      } else paint();
    }, 33);
    window.__captureSources.push(source);
    return source.stream;
  } });
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
    const source = audioSource();
    window.__microphoneSources.push(source);
    if (window.__holdMicrophone) await new Promise((resolve) => { window.__releaseMicrophone = resolve; });
    return source.stream;
  } });
  window.__endDisplay = () => {
    const track = window.__captureSources.at(-1).stream.getVideoTracks()[0];
    track.stop();
    track.dispatchEvent(new Event('ended'));
  };
}

async function waitState(page, state) {
  await page.waitForFunction((expected) => document.body.dataset.state === expected, state, { timeout: 15_000 });
}

async function setCheckbox(page, selector, checked) {
  const input = page.locator(selector);
  if (await input.isChecked() !== checked) await input.locator('..').click();
  assert.equal(await input.isChecked(), checked);
}

async function selectCenter(page) {
  await page.locator('#regionDialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#regionConfirm').isDisabled(), true, 'Confirm must require a selection');
  const box = await page.locator('#regionScreenshot').boundingBox();
  assert.ok(box?.width > 0 && box?.height > 0, 'Screenshot must have visible dimensions');
  // Inset two native pixels to keep subpixel CSS pointer rounding away from the red source border.
  await page.mouse.move(box.x + box.width * 202 / 800, box.y + box.height * 152 / 600);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 598 / 800, box.y + box.height * 448 / 600, { steps: 12 });
  await page.mouse.up();
  assert.equal(await page.locator('#regionConfirm').isEnabled(), true, 'Drag must enable confirmation');
  return { width: 396, height: 296 };
}

async function sampleVideo(page, selector) {
  return page.evaluate((target) => {
    const video = document.querySelector(target);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(video, 0, 0);
    const pixel = (x, y) => [...context.getImageData(x, y, 1, 1).data];
    return { width: canvas.width, height: canvas.height, center: pixel(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)), corners: [pixel(2, 2), pixel(canvas.width - 3, 2), pixel(2, canvas.height - 3), pixel(canvas.width - 3, canvas.height - 3)] };
  }, selector);
}

function assertCrop(sample, expected) {
  assert.ok(Math.abs(sample.width - expected.width) <= 2, `Crop width: ${sample.width}, expected about ${expected.width}`);
  assert.ok(Math.abs(sample.height - expected.height) <= 2, `Crop height: ${sample.height}, expected about ${expected.height}`);
  for (const pixel of [...sample.corners, sample.center]) {
    assert.ok(pixel[0] < 45 && Math.max(pixel[1], pixel[2]) > 160, `Crop leaked outside red pixels or captured blank frame: ${pixel}`);
  }
}

async function assertAllDisplayTracksEnded(page) {
  await page.waitForFunction(() => window.__captureSources.every(({ stream }) => stream.getTracks().every((track) => track.readyState === 'ended')));
}

async function run() {
  fs.mkdirSync(outputDir, { recursive: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/apps/049-screen-recorder/`;
  const executables = [
    chromium.executablePath(),
    path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
  ];
  const executablePath = executables.find((item) => fs.existsSync(item));
  assert.ok(executablePath, 'Chromium, Chrome or Edge must be installed');
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(installSources);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const checks = [];
  try {
    await page.goto(url);
    await waitState(page, 'ready');
    await setCheckbox(page, '#useCountdown', false);
    const buttonOrder = await page.evaluate(() => {
      const region = document.querySelector('#regionButton');
      const start = document.querySelector('#startButton');
      return { dom: Boolean(region.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING), above: region.getBoundingClientRect().bottom <= start.getBoundingClientRect().top };
    });
    assert.deepEqual(buttonOrder, { dom: true, above: true });
    assert.equal(await page.locator('#regionButton').isEnabled(), true);
    await page.screenshot({ path: path.join(outputDir, 'desktop.png'), fullPage: true });
    checks.push('Screenshot recording button is enabled and above Start');

    await page.locator('#regionButton').click();
    const expected = await selectCenter(page);
    await page.screenshot({ path: path.join(outputDir, 'selector.png'), fullPage: true });
    await page.locator('#regionConfirm').click();
    await waitState(page, 'recording');
    await page.waitForFunction(() => document.querySelector('#livePreview').readyState >= 2);
    const live = await sampleVideo(page, '#livePreview');
    assertCrop(live, expected);
    assert.equal(await page.evaluate(() => {
      const preview = document.querySelector('#livePreview').srcObject;
      return preview.getAudioTracks()[0]?.id === window.__captureSources.at(-1).stream.getAudioTracks()[0]?.id;
    }), true, 'Original system audio must remain in the cropped stream');
    let changed = false;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await page.waitForTimeout(110);
      const next = await sampleVideo(page, '#livePreview');
      assertCrop(next, expected);
      if (Math.abs(next.center[1] - live.center[1]) > 100) { changed = true; break; }
    }
    assert.ok(changed, 'Recorded region must contain changing live frames, not the static screenshot');
    await page.locator('#pauseButton').click();
    await waitState(page, 'paused');
    await page.waitForTimeout(180);
    await page.locator('#pauseButton').click();
    await waitState(page, 'recording');
    await page.waitForTimeout(1250);
    await page.locator('#stopButton').click();
    await waitState(page, 'result');
    await assertAllDisplayTracksEnded(page);
    const blobBytes = await page.evaluate(async () => (await (await fetch(document.querySelector('#downloadButton').href)).blob()).size);
    assert.ok(blobBytes > 1000, `Native MediaRecorder must create a nonempty video; got ${blobBytes} bytes`);
    const recordedAudio = await page.evaluate(async () => {
      const context = new AudioContext();
      try {
        const bytes = await (await fetch(document.querySelector('#downloadButton').href)).arrayBuffer();
        const buffer = await context.decodeAudioData(bytes);
        const samples = buffer.getChannelData(0);
        let energy = 0;
        for (const value of samples) energy += value * value;
        return { samples: samples.length, rms: Math.sqrt(energy / samples.length) };
      } finally { await context.close(); }
    });
    assert.ok(recordedAudio.samples > 1000 && recordedAudio.rms > 0.005, `Saved recording must contain audible source audio: ${JSON.stringify(recordedAudio)}`);
    await page.evaluate(async () => { const video = document.querySelector('#playbackPreview'); video.muted = true; await video.play(); });
    await page.waitForFunction(() => { const video = document.querySelector('#playbackPreview'); return video.readyState >= 2 && video.currentTime > 0.08; });
    const replay = await sampleVideo(page, '#playbackPreview');
    assertCrop(replay, expected);
    await page.screenshot({ path: path.join(outputDir, 'result.png'), fullPage: true });
    checks.push(`Live crop excludes outside pixels, changes over time, retains audio, pauses/resumes and replays a ${blobBytes}-byte native recording (${replay.width}x${replay.height})`);

    await page.locator('#newTakeButton').click();
    await page.locator('#regionButton').click();
    await page.locator('#regionDialog').waitFor({ state: 'visible' });
    await page.locator('#regionCancel').click();
    await waitState(page, 'ready');
    await assertAllDisplayTracksEnded(page);
    await page.locator('#regionButton').click();
    await page.locator('#regionDialog').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await waitState(page, 'ready');
    await assertAllDisplayTracksEnded(page);
    checks.push('Cancel button and Escape release every source track and allow retry');

    await page.locator('#regionButton').click();
    await page.locator('#regionDialog').waitFor({ state: 'visible' });
    await page.evaluate(() => window.__endDisplay());
    await waitState(page, 'ready');
    await page.locator('#regionDialog').waitFor({ state: 'hidden' });
    await assertAllDisplayTracksEnded(page);
    checks.push('Source ending while selecting closes dialog and returns to ready');

    await setCheckbox(page, '#microphone', true);
    await page.evaluate(() => { window.__holdMicrophone = true; });
    await page.locator('#regionButton').click();
    await selectCenter(page);
    await page.locator('#regionConfirm').click();
    await page.waitForFunction(() => typeof window.__releaseMicrophone === 'function');
    await page.evaluate(() => window.__endDisplay());
    await waitState(page, 'ready');
    await page.evaluate(() => window.__releaseMicrophone());
    await page.waitForFunction(() => window.__microphoneSources.every(({ stream }) => stream.getTracks().every((track) => track.readyState === 'ended')));
    await assertAllDisplayTracksEnded(page);
    assert.equal(await page.locator('body').getAttribute('data-state'), 'ready');
    await setCheckbox(page, '#microphone', false);
    checks.push('Source ending during delayed microphone permission releases the late microphone stream');

    await page.locator('#startButton').click();
    await waitState(page, 'recording');
    await page.waitForFunction(() => document.querySelector('#livePreview').videoWidth === 800);
    const full = await sampleVideo(page, '#livePreview');
    assert.deepEqual([full.width, full.height], [800, 600]);
    assert.ok(full.corners.every((pixel) => pixel[0] > 220 && pixel[1] < 30), 'Normal capture must retain outside screen pixels');
    await page.waitForTimeout(1050);
    await page.locator('#stopButton').click();
    await waitState(page, 'result');
    await assertAllDisplayTracksEnded(page);
    checks.push('Normal Start still records the whole source and finalizes successfully');

    await page.locator('#newTakeButton').click();
    await setCheckbox(page, '#useCountdown', true);
    await page.locator('#regionButton').click();
    await selectCenter(page);
    await page.locator('#regionConfirm').click();
    await waitState(page, 'countdown');
    assert.equal(await page.locator('#countdown').isVisible(), true, 'Region recording keeps the countdown preference');
    await waitState(page, 'recording');
    await page.waitForTimeout(1150);
    await page.evaluate(() => { window.__captureSources.at(-1).canvas.width = 1000; });
    await waitState(page, 'result');
    await assertAllDisplayTracksEnded(page);
    assert.match(await page.locator('#toast').innerText(), /尺寸|重新框选/, 'Resize must preserve the explanatory end notice');
    checks.push('Region capture respects countdown and saves existing frames with a resize explanation when source dimensions change');
    assert.deepEqual(errors, [], 'Browser must have no uncaught errors');
    const report = { passed: true, executablePath, checks, browserErrors: errors, outputDir };
    fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.join(outputDir, 'failure.png'), fullPage: true }).catch(() => {});
    console.error(JSON.stringify({ passed: false, checks, browserErrors: errors, state: await page.locator('body').getAttribute('data-state'), outputDir }, null, 2));
    throw error;
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => { console.error(error); server.close(); process.exitCode = 1; });
