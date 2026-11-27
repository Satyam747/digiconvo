/* =============================================================================
   qr.js - tiny self-contained QR Code generator (byte mode, versions 1-10, ECC L/M).
   No libraries, no network: QR codes with secret table tokens are generated in the browser only.
   Algorithm follows the QR Code Model 2 standard (ISO/IEC 18004).
   ============================================================================= */
(function (root) {
  "use strict";

  var ECC = {
    L: { fmt: 1, ecPerBlock: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18], blocks: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4] },
    M: { fmt: 0, ecPerBlock: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26], blocks: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5] }
  };
  var MAX_VERSION = 10;

  function utf8Bytes(str) {
    if (typeof TextEncoder !== "undefined") return Array.prototype.slice.call(new TextEncoder().encode(str));
    var out = [], s = unescape(encodeURIComponent(str));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function numRawDataModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }
  function numDataCodewords(ver, ecl) {
    return Math.floor(numRawDataModules(ver) / 8) - ecl.ecPerBlock[ver] * ecl.blocks[ver];
  }
  function byteCapacity(ver, ecl) {
    return Math.floor((numDataCodewords(ver, ecl) * 8 - 4 - (ver < 10 ? 8 : 16)) / 8);
  }

  /* ---- Reed-Solomon over GF(256), polynomial 0x11D ---- */
  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function rsDivisor(degree) {
    var result = [], i, j;
    for (i = 0; i < degree; i++) result.push(0);
    result[degree - 1] = 1;
    var rootv = 1;
    for (i = 0; i < degree; i++) {
      for (j = 0; j < result.length; j++) {
        result[j] = gfMul(result[j], rootv);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      rootv = gfMul(rootv, 2);
    }
    return result;
  }
  function rsRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (coef, i) { result[i] ^= gfMul(coef, factor); });
    });
    return result;
  }

  function addEccAndInterleave(data, ver, ecl) {
    var numBlocks = ecl.blocks[ver], blockEccLen = ecl.ecPerBlock[ver];
    var rawCodewords = Math.floor(numRawDataModules(ver) / 8);
    var numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    var shortBlockLen = Math.floor(rawCodewords / numBlocks);
    var blocks = [], rsDiv = rsDivisor(blockEccLen);
    for (var i = 0, k = 0; i < numBlocks; i++) {
      var dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
      k += dat.length;
      var ecc = rsRemainder(dat, rsDiv);
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var result = [];
    for (var x = 0; x < blocks[0].length; x++) {
      for (var j = 0; j < blocks.length; j++) {
        if (x !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(blocks[j][x]);
      }
    }
    return result;
  }

  function alignmentPositions(ver) {
    if (ver === 1) return [];
    var numAlign = Math.floor(ver / 7) + 2;
    var step = Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    var size = ver * 4 + 17, result = [6];
    for (var pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  function getBit(x, i) { return ((x >>> i) & 1) !== 0; }

  function build(bytes, ver, ecl, forceMask) {
    var size = ver * 4 + 17, modules = [], isFn = [], y, x;
    for (y = 0; y < size; y++) {
      modules.push(new Array(size).fill(false));
      isFn.push(new Array(size).fill(false));
    }
    function setFn(px, py, dark) { modules[py][px] = dark; isFn[py][px] = true; }

    function drawFormatBits(mask) {
      var data = (ecl.fmt << 3) | mask, rem = data, i;
      for (i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var bits = ((data << 10) | rem) ^ 0x5412;
      for (i = 0; i <= 5; i++) setFn(8, i, getBit(bits, i));
      setFn(8, 7, getBit(bits, 6));
      setFn(8, 8, getBit(bits, 7));
      setFn(7, 8, getBit(bits, 8));
      for (i = 9; i < 15; i++) setFn(14 - i, 8, getBit(bits, i));
      for (i = 0; i < 8; i++) setFn(size - 1 - i, 8, getBit(bits, i));
      for (i = 8; i < 15; i++) setFn(8, size - 15 + i, getBit(bits, i));
      setFn(8, size - 8, true);
    }
    function drawFinder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy)), xx = cx + dx, yy = cy + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFn(xx, yy, dist !== 2 && dist !== 4);
      }
    }
    function drawAlignment(cx, cy) {
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++)
        setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }

    for (var i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    drawFinder(3, 3); drawFinder(size - 4, 3); drawFinder(3, size - 4);
    var pos = alignmentPositions(ver), n = pos.length;
    for (var a = 0; a < n; a++) for (var b = 0; b < n; b++) {
      if (!((a === 0 && b === 0) || (a === 0 && b === n - 1) || (a === n - 1 && b === 0))) drawAlignment(pos[a], pos[b]);
    }
    drawFormatBits(0);
    if (ver >= 7) {
      var rem = ver;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vbits = (ver << 12) | rem;
      for (i = 0; i < 18; i++) {
        var bit = getBit(vbits, i), pa = size - 11 + (i % 3), pb = Math.floor(i / 3);
        setFn(pa, pb, bit); setFn(pb, pa, bit);
      }
    }

    // place data codewords in the zig-zag pattern
    var all = addEccAndInterleave(bytes, ver, ecl), bi = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var xx = right - j, upward = ((right + 1) & 2) === 0, yy = upward ? size - 1 - vert : vert;
          if (!isFn[yy][xx] && bi < all.length * 8) { modules[yy][xx] = getBit(all[bi >>> 3], 7 - (bi & 7)); bi++; }
        }
      }
    }

    function applyMask(mask) {
      for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) {
        var inv;
        switch (mask) {
          case 0: inv = (xx + yy) % 2 === 0; break;
          case 1: inv = yy % 2 === 0; break;
          case 2: inv = xx % 3 === 0; break;
          case 3: inv = (xx + yy) % 3 === 0; break;
          case 4: inv = (Math.floor(xx / 3) + Math.floor(yy / 2)) % 2 === 0; break;
          case 5: inv = (xx * yy) % 2 + (xx * yy) % 3 === 0; break;
          case 6: inv = ((xx * yy) % 2 + (xx * yy) % 3) % 2 === 0; break;
          default: inv = ((xx + yy) % 2 + (xx * yy) % 3) % 2 === 0;
        }
        if (!isFn[yy][xx] && inv) modules[yy][xx] = !modules[yy][xx];
      }
    }

    function penalty() {
      var score = 0, r, c, run, k, dark = 0, line;
      function scanLine(get) {
        run = 1;
        for (k = 1; k < size; k++) {
          if (get(k) === get(k - 1)) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
          else run = 1;
        }
        var s = "";
        for (k = 0; k < size; k++) s += get(k) ? "1" : "0";
        for (k = 0; k + 11 <= size; k++) {
          var seg = s.substr(k, 11);
          if (seg === "10111010000" || seg === "00001011101") score += 40;
        }
      }
      for (r = 0; r < size; r++) { (function (rr) { scanLine(function (i) { return modules[rr][i]; }); })(r); }
      for (c = 0; c < size; c++) { (function (cc) { scanLine(function (i) { return modules[i][cc]; }); })(c); }
      for (r = 0; r < size - 1; r++) for (c = 0; c < size - 1; c++) {
        var v = modules[r][c];
        if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) score += 3;
      }
      for (r = 0; r < size; r++) for (c = 0; c < size; c++) if (modules[r][c]) dark++;
      var total = size * size;
      score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return score;
    }

    var bestMask = 0, bestScore = Infinity;
    for (var m = 0; m < 8 && forceMask == null; m++) {
      applyMask(m); drawFormatBits(m);
      var p = penalty();
      if (p < bestScore) { bestScore = p; bestMask = m; }
      applyMask(m);
    }
    if (forceMask != null) bestMask = forceMask;
    applyMask(bestMask); drawFormatBits(bestMask);
    return { size: size, modules: modules, version: ver };
  }

  function encode(text, forceMask) {
    var bytes = utf8Bytes(String(text));
    var order = [ECC.M, ECC.L];
    for (var e = 0; e < order.length; e++) {
      var ecl = order[e];
      for (var ver = 1; ver <= MAX_VERSION; ver++) {
        if (bytes.length <= byteCapacity(ver, ecl)) {
          var cap = numDataCodewords(ver, ecl) * 8, bits = [], i;
          function push(val, len) { for (var b = len - 1; b >= 0; b--) bits.push((val >>> b) & 1); }
          push(4, 4);
          push(bytes.length, ver < 10 ? 8 : 16);
          bytes.forEach(function (byte) { push(byte, 8); });
          push(0, Math.min(4, cap - bits.length));
          while (bits.length % 8 !== 0) bits.push(0);
          var data = [];
          for (i = 0; i < bits.length; i += 8) {
            var v = 0;
            for (var q = 0; q < 8; q++) v = (v << 1) | bits[i + q];
            data.push(v);
          }
          for (var pad = 0xEC; data.length < cap / 8; pad ^= 0xEC ^ 0x11) data.push(pad);
          return build(data, ver, ecl, forceMask);
        }
      }
    }
    throw new Error("Text is too long for the QR code generator");
  }

  /* SVG string (self-contained, scalable, print-friendly) */
  function svg(text, opts) {
    opts = opts || {};
    var border = opts.border == null ? 4 : opts.border, fg = opts.fg || "#000", bg = opts.bg || "#fff";
    var qr = encode(text), n = qr.size, dim = n + border * 2, d = "";
    for (var y = 0; y < n; y++) {
      var x = 0;
      while (x < n) {
        if (qr.modules[y][x]) {
          var w = 1;
          while (x + w < n && qr.modules[y][x + w]) w++;
          d += "M" + (x + border) + "," + (y + border) + "h" + w + "v1h-" + w + "z";
          x += w;
        } else x++;
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + " " + dim +
      '" shape-rendering="crispEdges" role="img"><rect width="100%" height="100%" fill="' + bg +
      '"/><path d="' + d + '" fill="' + fg + '"/></svg>';
  }

  var API = { encode: encode, svg: svg };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else {
    root.QR = API;
    root.qrSvg = svg;
  }
})(typeof window !== "undefined" ? window : this);
