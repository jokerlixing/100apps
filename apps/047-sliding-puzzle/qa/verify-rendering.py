from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
import json, tempfile
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(tempfile.mkdtemp(prefix='shift47-rendering-'))
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/apps/047-sliding-puzzle/'
results = []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=3)
        page = ctx.new_page()
        page.add_init_script('''
            window.liveImageURLs = new Set();
            const createURL = URL.createObjectURL.bind(URL);
            const revokeURL = URL.revokeObjectURL.bind(URL);
            URL.createObjectURL = blob => {
                const url = createURL(blob);
                liveImageURLs.add(url);
                return url;
            };
            URL.revokeObjectURL = url => {
                liveImageURLs.delete(url);
                revokeURL(url);
            };
        ''')
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        for dimension in [3, 4, 5]:
            page.goto(url, wait_until='networkidle')
            if dimension != 3:
                page.locator(f'input[name="difficulty"][value="{dimension}"]').locator('..').click()
            assert page.locator('.puzzle-tile').count() == dimension**2
            result = page.evaluate('''async dimension => {
                const grid = document.querySelector('#puzzle-grid');
                const nodes = [...grid.children];
                const assert = (condition, message) => { if (!condition) throw Error(message); };
                const values = () => nodes.map(n => Number(n.dataset.tile));
                const image = getComputedStyle(nodes[0]).backgroundImage;
                const decoded = new Image(); decoded.src = image.slice(5,-2); await decoded.decode();
                assert(decoded.naturalWidth === 1024, 'optimized image must decode');
                assert(getComputedStyle(document.querySelector('#preview-layer')).backgroundImage === image, 'preview and tiles share source');
                assert(performance.getEntriesByType('resource').filter(r => /colorful-desk-puzzle/.test(r.name)).length === 1, 'download image only once');
                const original = values();
                nodes[0].click();
                assert(document.activeElement === nodes[0], 'selected tile retains focus');
                assert(nodes[0].getAttribute('aria-pressed') === 'true', 'selection is announced');
                nodes[1].click();
                assert(nodes.every(n => n.isConnected), 'swap must retain every cell');
                assert(values()[0] === original[1] && values()[1] === original[0], 'exactly two tile values swap');
                assert(values().slice(2).every((value, index) => value === original[index+2]), 'other tiles stay unchanged');
                assert(document.activeElement === nodes[1], 'focus follows destination');
                nodes[1].dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true, cancelable: true}));
                assert(document.activeElement === nodes[2], 'arrow key moves focus');
                nodes[2].dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}));
                assert(nodes[2].getAttribute('aria-pressed') === 'true', 'keyboard selection works');
                nodes[2].dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
                assert(nodes[2].getAttribute('aria-pressed') === 'false', 'escape cancels selection');
                for (let i=0; i<nodes.length; i++) {
                    const target = nodes.findIndex(n => Number(n.dataset.tile) === i+1);
                    if (target !== i) { nodes[i].click(); nodes[target].click(); }
                }
                assert(document.querySelector('#completion-dialog').open, 'solving still opens completion dialog');
                assert(document.querySelector('#preview-layer').classList.contains('is-complete'), 'completed image is visible');
                assert(values().every((value, index) => value === index+1), 'completed order is correct');
                for (let i=0; i<nodes.length; i++) {
                    const n = nodes[i];
                    const [x, y] = n.style.backgroundPosition.split(' ').map(parseFloat);
                    assert(Math.abs(x - (i%dimension)*100/(dimension-1)) < .01, 'tile image x position matches content');
                    assert(Math.abs(y - Math.floor(i/dimension)*100/(dimension-1)) < .01, 'tile image y position matches content');
                    assert(n.getAttribute('aria-label').includes(`图片块 ${i+1}，`), 'tile label matches content');
                }
                document.querySelector('#play-again-button').click();
                assert(nodes.every(n => n.isConnected), 'same-size shuffle retains cells');
                assert(document.querySelector('#move-value').textContent === '000', 'replay resets moves');
                return {dimension, retainedTiles: nodes.length, decodedWidth: decoded.naturalWidth, result: 'passed'};
            }''', dimension)
            results.append(result)
            print(json.dumps(result), flush=True)
        # A size change must rebuild the geometry, even though same-size operations do not.
        page.locator('input[name="difficulty"][value="3"]').locator('..').click()
        assert page.locator('.puzzle-tile').count() == 9
        page.locator('#image-input').set_input_files(str(ROOT/'apps/047-sliding-puzzle/assets/colorful-desk-puzzle.png'))
        page.wait_for_function("document.querySelector('#image-name').textContent !== '彩色创意桌面'")
        upload = page.evaluate('''async () => {
            const cells = [...document.querySelectorAll('.puzzle-tile')];
            const source = getComputedStyle(cells[0]).backgroundImage;
            if (!source.startsWith('url("blob:')) throw Error('uploaded source not applied');
            if (!cells.every(n => getComputedStyle(n).backgroundImage === source)) throw Error('uploaded tiles use inconsistent source');
            if (getComputedStyle(document.querySelector('#preview-layer')).backgroundImage !== source) throw Error('uploaded preview uses wrong source');
            const image = new Image(); image.src = source.slice(5,-2); await image.decode();
            cells[0].click(); cells[1].click();
            if (!cells.every(n => n.isConnected)) throw Error('upload swaps rebuilt cells');
            return {uploadedImageWidth: image.naturalWidth, retainedTiles: cells.length};
        }''')
        assert upload['uploadedImageWidth'] == 1024
        assert page.evaluate('liveImageURLs.size') == 1, 'source file URL must be released after conversion'
        # Cancelling a replacement keeps the current image alive without leaking URLs.
        previous_source = page.locator('.puzzle-frame').evaluate("el => el.style.getPropertyValue('--puzzle-image')")
        page.locator('#image-input').set_input_files(str(ROOT/'apps/047-sliding-puzzle/assets/colorful-desk-puzzle.png'))
        page.locator('#confirm-no').click()
        assert page.locator('.puzzle-frame').evaluate("el => el.style.getPropertyValue('--puzzle-image')") == previous_source
        assert page.evaluate('liveImageURLs.size') == 1
        # Browsers without a WebP canvas encoder may return PNG; large PNG blobs must also render.
        page.evaluate('''() => {
            const encode = HTMLCanvasElement.prototype.toBlob;
            HTMLCanvasElement.prototype.toBlob = function(callback) {
                return encode.call(this, callback, 'image/png');
            };
        }''')
        page.locator('#image-input').set_input_files(str(ROOT/'apps/047-sliding-puzzle/assets/colorful-desk-puzzle.png'))
        page.locator('#confirm-yes').click()
        assert page.evaluate('liveImageURLs.size') == 1, 'replacing an image releases the previous URL'
        assert page.locator('.puzzle-frame').evaluate("el => el.style.getPropertyValue('--puzzle-image')") != previous_source
        page.evaluate('''async () => {
            const source = getComputedStyle(document.querySelector('.puzzle-tile')).backgroundImage.slice(5,-2);
            const image = new Image(); image.src = source; await image.decode();
            if (image.naturalWidth !== 1024) throw Error('PNG fallback did not render');
            document.querySelectorAll('.puzzle-tile')[0].click();
            document.querySelectorAll('.puzzle-tile')[1].click();
        }''')
        page.locator('#default-image-button').click()
        page.locator('#confirm-no').click()
        assert page.locator('#image-name').inner_text() != '彩色创意桌面'
        page.locator('#default-image-button').click()
        page.locator('#confirm-yes').click()
        assert page.locator('#image-name').inner_text() == '彩色创意桌面'
        assert '.webp' in page.locator('.puzzle-tile').first.evaluate('el => getComputedStyle(el).backgroundImage')
        assert page.evaluate('liveImageURLs.size') == 0, 'restoring the default image releases uploaded resources'
        page.locator('#image-input').set_input_files({'name':'broken.png','mimeType':'image/png','buffer':b'not an image'})
        page.wait_for_function("document.querySelector('#notice').classList.contains('is-error')")
        assert page.evaluate('liveImageURLs.size') == 0, 'failed uploads release their source URL'
        assert page.locator('#image-name').inner_text() == '彩色创意桌面'
        # Touch dragging still swaps the intended tiles exactly once.
        page.locator('.puzzle-frame').scroll_into_view_if_needed()
        tiles = page.locator('.puzzle-tile')
        old = [tiles.nth(i).get_attribute('data-tile') for i in range(2)]
        boxes = [tiles.nth(i).bounding_box() for i in range(2)]
        cdp = ctx.new_cdp_session(page)
        for kind, box in zip(['touchStart', 'touchMove'], boxes):
            cdp.send('Input.dispatchTouchEvent', {'type':kind, 'touchPoints':[{'x':box['x']+box['width']/2,'y':box['y']+box['height']/2,'id':1}]})
        cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
        assert [tiles.nth(i).get_attribute('data-tile') for i in range(2)] == old[::-1]
        assert page.locator('#move-value').inner_text() == '001'
        assert not errors, errors
        page.screenshot(path=str(OUT/'rendering-mobile.png'), full_page=True)
        results.append({'upload':upload,'touchDrag':'passed','restoreAndCancel':'passed','pageErrors':errors})
        print(json.dumps(results[-1]), flush=True)
        ctx.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()
(OUT/'functional-results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
print('Artifacts:', OUT)
