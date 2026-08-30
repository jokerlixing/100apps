(function initMuseArtEngine(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./gallery-core'));
  else root.MuseArtEngine = factory(root.MuseCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMuseArtEngine(Core) {
  'use strict';

  if (!Core) throw new Error('MUSE/95 core is required by the art engine.');

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function fillRoundedRect(context, x, y, width, height, radius, fill) {
    roundedRect(context, x, y, width, height, radius);
    context.fillStyle = fill;
    context.fill();
  }

  function drawBackground(context, width, height, colors, random) {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(.48, colors[1]);
    gradient.addColorStop(1, colors[2]);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.save();
    context.globalAlpha = .08;
    for (let index = 0; index < 26; index += 1) {
      context.fillStyle = index % 2 ? colors[4] : colors[3];
      context.beginPath();
      context.arc(random() * width, random() * height, (12 + random() * 90) * Math.min(width, height) / 900, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawDream(context, width, height, colors, random) {
    drawBackground(context, width, height, colors, random);
    const unit = Math.min(width, height);

    context.save();
    context.globalCompositeOperation = 'screen';
    for (let index = 0; index < 11; index += 1) {
      const x = random() * width;
      const y = random() * height;
      const radius = (.08 + random() * .2) * unit;
      const glow = context.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, `${colors[(index + 2) % colors.length]}DD`);
      glow.addColorStop(1, `${colors[index % colors.length]}00`);
      context.fillStyle = glow;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    context.save();
    context.translate(width * .5, height * .52);
    context.rotate((random() - .5) * .28);
    context.strokeStyle = colors[4];
    context.lineWidth = unit * .045;
    context.globalAlpha = .78;
    for (let index = 0; index < 4; index += 1) {
      context.beginPath();
      context.ellipse(0, 0, unit * (.16 + index * .075), unit * (.25 + index * .06), random() * .5, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();

    for (let band = 0; band < 5; band += 1) {
      context.beginPath();
      const y = height * (.14 + band * .17);
      context.moveTo(-width * .1, y);
      context.bezierCurveTo(width * .2, y - unit * .18, width * .64, y + unit * .2, width * 1.1, y - unit * .04);
      context.strokeStyle = `${colors[(band + 2) % colors.length]}99`;
      context.lineWidth = unit * (.018 + random() * .035);
      context.lineCap = 'round';
      context.stroke();
    }
  }

  function drawArchitecture(context, width, height, colors, random) {
    drawBackground(context, width, height, [colors[1], colors[2], colors[3], colors[4], colors[0]], random);
    const unit = Math.min(width, height);
    const horizon = height * .78;

    context.fillStyle = colors[4];
    context.globalAlpha = .92;
    context.beginPath();
    context.arc(width * .2, height * .24, unit * .115, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;

    const blocks = [
      { x: .16, y: .43, w: .23, h: .35 },
      { x: .34, y: .24, w: .27, h: .54 },
      { x: .57, y: .38, w: .24, h: .4 }
    ];
    blocks.forEach((block, index) => {
      const x = width * block.x;
      const y = height * block.y;
      const w = width * block.w;
      const h = height * block.h;
      fillRoundedRect(context, x, y, w, h, unit * .012, index % 2 ? colors[4] : `${colors[3]}E8`);
      const openings = index + 2;
      for (let opening = 0; opening < openings; opening += 1) {
        const openingWidth = w / (openings * 2.1);
        const openingX = x + w * .12 + opening * (w * .76 / Math.max(1, openings - 1));
        context.fillStyle = colors[0];
        context.beginPath();
        context.arc(openingX, y + h * .42, openingWidth / 2, Math.PI, 0);
        context.rect(openingX - openingWidth / 2, y + h * .42, openingWidth, h * .44);
        context.fill();
      }
    });

    context.fillStyle = colors[0];
    context.fillRect(width * .08, horizon, width * .84, unit * .025);
    context.globalAlpha = .32;
    context.save();
    context.translate(0, horizon * 2);
    context.scale(1, -1);
    blocks.forEach((block, index) => {
      context.fillStyle = index % 2 ? colors[4] : colors[3];
      context.fillRect(width * block.x, height * block.y, width * block.w, height * block.h);
    });
    context.restore();
    context.globalAlpha = 1;

    context.strokeStyle = colors[4];
    context.lineWidth = Math.max(2, unit * .006);
    for (let stair = 0; stair < 8; stair += 1) {
      const progress = stair / 8;
      context.beginPath();
      context.moveTo(width * (.39 + progress * .21), height * (.7 - progress * .21));
      context.lineTo(width * (.5 + progress * .12), height * (.7 - progress * .21));
      context.stroke();
    }
  }

  function drawInk(context, width, height, colors, random) {
    context.fillStyle = colors[4];
    context.fillRect(0, 0, width, height);
    const unit = Math.min(width, height);
    context.strokeStyle = colors[0];
    context.lineCap = 'round';

    const origins = [width * .22, width * .51, width * .78];
    origins.forEach((originX, originIndex) => {
      for (let branch = 0; branch < 10; branch += 1) {
        const startY = height * (.95 - branch * .045);
        const bend = (random() - .5) * unit * .34;
        context.beginPath();
        context.moveTo(originX, height * 1.04);
        context.bezierCurveTo(originX + bend * .3, height * .7, originX + bend, height * .35, originX + bend * 1.25, height * (.08 + random() * .2));
        context.globalAlpha = .36 + random() * .5;
        context.lineWidth = unit * (.002 + random() * .008);
        context.stroke();

        const leafX = originX + bend * (.55 + branch * .025);
        const leafY = startY - height * .25;
        context.fillStyle = colors[(originIndex + branch + 1) % 4];
        context.beginPath();
        context.ellipse(leafX, leafY, unit * (.018 + random() * .025), unit * (.05 + random() * .05), random() * Math.PI, 0, Math.PI * 2);
        context.fill();
      }
    });

    context.globalAlpha = .18;
    context.strokeStyle = colors[1];
    context.lineWidth = Math.max(1, unit * .002);
    for (let ring = 0; ring < 13; ring += 1) {
      context.beginPath();
      context.arc(width * .5, height * .48, unit * (.08 + ring * .035), random() * .6, Math.PI * (1.15 + random() * .6));
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  function drawPoster(context, width, height, colors, random) {
    context.fillStyle = colors[4];
    context.fillRect(0, 0, width, height);
    const unit = Math.min(width, height);
    context.fillStyle = colors[0];
    context.fillRect(0, 0, width * .17, height);
    context.fillStyle = colors[1];
    context.fillRect(width * .17, 0, width * .83, height * .18);

    context.fillStyle = colors[3];
    context.beginPath();
    context.arc(width * (.68 + random() * .08), height * (.38 + random() * .08), unit * .22, 0, Math.PI * 2);
    context.fill();

    context.save();
    context.translate(width * .43, height * .62);
    context.rotate(-.18 + random() * .12);
    fillRoundedRect(context, -width * .25, -height * .09, width * .5, height * .18, unit * .015, colors[0]);
    context.restore();

    for (let index = 0; index < 7; index += 1) {
      context.fillStyle = index % 2 ? colors[1] : colors[2];
      const barWidth = width * (.1 + random() * .25);
      context.fillRect(width * (.22 + random() * .55), height * (.72 + index * .028), barWidth, Math.max(3, unit * .008));
    }

    context.strokeStyle = colors[0];
    context.lineWidth = unit * .008;
    context.strokeRect(width * .21, height * .23, width * .68, height * .64);
  }

  function drawTerrain(context, width, height, colors, random) {
    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, colors[0]);
    sky.addColorStop(.58, colors[1]);
    sky.addColorStop(1, colors[3]);
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);
    const unit = Math.min(width, height);

    context.fillStyle = colors[4];
    context.beginPath();
    context.arc(width * (.7 + random() * .12), height * .22, unit * .1, 0, Math.PI * 2);
    context.fill();

    for (let layer = 0; layer < 8; layer += 1) {
      const baseY = height * (.42 + layer * .075);
      context.beginPath();
      context.moveTo(-width * .05, height);
      context.lineTo(-width * .05, baseY);
      for (let point = 0; point <= 8; point += 1) {
        const x = width * (point / 8);
        const wave = Math.sin(point * 1.35 + layer * .78) * unit * (.025 + layer * .006);
        const jitter = (random() - .5) * unit * .055;
        context.lineTo(x, baseY + wave + jitter);
      }
      context.lineTo(width * 1.05, height);
      context.closePath();
      context.fillStyle = colors[(layer + 1) % colors.length];
      context.globalAlpha = .3 + layer * .085;
      context.fill();
    }
    context.globalAlpha = 1;

    context.strokeStyle = `${colors[4]}88`;
    context.lineWidth = Math.max(1, unit * .002);
    for (let line = 0; line < 9; line += 1) {
      context.beginPath();
      const y = height * (.5 + line * .048);
      context.moveTo(0, y);
      context.bezierCurveTo(width * .28, y - unit * .06, width * .68, y + unit * .055, width, y - unit * .02);
      context.stroke();
    }
  }

  function drawGrain(context, width, height, random) {
    context.save();
    context.globalAlpha = .075;
    for (let index = 0; index < 520; index += 1) {
      const shade = random() > .54 ? '#FFFFFF' : '#080812';
      context.fillStyle = shade;
      const size = .5 + random() * 1.7;
      context.fillRect(random() * width, random() * height, size, size);
    }
    context.restore();
  }

  function drawSignature(context, width, height, artwork, palette) {
    const unit = Math.min(width, height);
    const padding = Math.max(14, unit * .034);
    context.save();
    context.globalAlpha = .86;
    context.font = `700 ${Math.max(9, unit * .018)}px ui-monospace, Consolas, monospace`;
    context.textBaseline = 'bottom';
    context.fillStyle = palette.colors[4];
    context.fillText(`MUSE/95  ·  ${Core.STYLES[artwork.style].short}`, padding, height - padding);
    context.textAlign = 'right';
    context.fillText(`#${String(artwork.seed).padStart(6, '0')}`, width - padding, height - padding);
    context.restore();
  }

  function renderArtwork(canvas, artworkInput, options) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('A canvas element is required.');
    const artwork = Core.normalizeArtwork(artworkInput);
    if (!artwork) throw new TypeError('A valid artwork recipe is required.');
    const settings = options && typeof options === 'object' ? options : {};
    const size = settings.width && settings.height
      ? { width: Math.round(settings.width), height: Math.round(settings.height) }
      : Core.getCanvasSize(artwork.ratio, settings.longEdge || 900);
    canvas.width = Math.max(1, size.width);
    canvas.height = Math.max(1, size.height);
    canvas.dataset.signature = `${artwork.id}:${artwork.seed}:${artwork.style}:${artwork.ratio}`;

    const context = canvas.getContext('2d', { alpha: false });
    const random = Core.createRng(artwork.seed);
    const palette = Core.paletteForPrompt(artwork.prompt, artwork.style);
    context.imageSmoothingEnabled = true;

    const renderers = {
      dream: drawDream,
      architecture: drawArchitecture,
      ink: drawInk,
      poster: drawPoster,
      terrain: drawTerrain
    };
    renderers[artwork.style](context, canvas.width, canvas.height, palette.colors, random);
    drawGrain(context, canvas.width, canvas.height, random);
    drawSignature(context, canvas.width, canvas.height, artwork, palette);
    return { width: canvas.width, height: canvas.height, palette: palette.name, signature: canvas.dataset.signature };
  }

  return Object.freeze({ renderArtwork });
});
