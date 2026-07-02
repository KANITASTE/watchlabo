/* ============================================================
   parts.js — 部品ジオメトリ生成 (プロシージャル)
   step1.json の type に応じて THREE.Group を組み立てる。

   v2: 高級時計仕上げ表現
   - CanvasTexture によるペルラージュ / コート・ド・ジュネーブ /
     サーキュラーブラッシング / サンレイ模様
   - ポリッシュ面取り(アングラージュ)・段付きハブ・青焼きネジ
   - ルビー穴石の発光制御 (PartFactory.setRubyGlow)
   ============================================================ */
(function () {
  "use strict";
  window.WatchSim = window.WatchSim || {};

  /* ---- 金属カラーパレット ---- */
  const COLORS = {
    plate:  0x9aa0aa,   // ロジウムめっき
    steel:  0xacb2bc,   // 磨き鋼
    polish: 0xd3d8e0,   // 鏡面ポリッシュ(面取り・リム)
    brass:  0xb49653,   // 真鍮・金めっき
    gilt:   0xbfa165,   // ジルト(輪列)
    gold:   0xcaa968,   // シャトン・装飾
    ruby:   0xef1b4d,   // 穴石・爪石(鮮やかな人工ルビー #EF1B4D)
    blued:  0x1e356f,   // 焼き入れ青(深い紺)
    ivory:  0xe9e6dc,   // アイボリー文字盤
    leather:0x141821,   // 革ベルト(濃紺〜黒)
    dark:   0x33363d
  };

  /* スモールセコンドの共通中心座標(文字盤・秒針・四番車・目盛りが参照)
     文字盤側(反転後)ワールド座標系。四番車の軸位置と一致させている。 */
  const SMALL_SECONDS_CENTER = { x: 13, y: 4.4, z: -0.8 };
  window.WatchSim.SMALL_SECONDS_CENTER = SMALL_SECONDS_CENTER;

  /* ============================================================
     1) 仕上げテクスチャ (CanvasTexture)
     すべて 512px 正方・シームレスでなくても部品単位なら十分
     ============================================================ */

  function makeCanvas(size) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    return c;
  }

  /** 共通: 微細なランダム傷を重ねる */
  function addScratches(ctx, size, count, alpha) {
    for (let i = 0; i < count; i++) {
      const x = Math.random() * size, y = Math.random() * size;
      const len = 20 + Math.random() * 90;
      const a = Math.random() * Math.PI * 2;
      ctx.strokeStyle = "rgba(255,255,255," + (alpha * Math.random()).toFixed(3) + ")";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
  }

  function finishTexture(canvas) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /** ペルラージュ(重なり合う円形の磨き目)— 地板用 */
  function perlageTexture(base) {
    const size = 512, cv = makeCanvas(size), ctx = cv.getContext("2d");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    const step = 46, r = 32;
    let row = 0;
    for (let y = -r; y < size + r; y += step * 0.82) {
      const off = (row % 2) * step / 2;
      for (let x = -r + off; x < size + r; x += step) {
        // 円形グラデーション(コントラストを大幅に弱める)
        const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, 2, x, y, r);
        g.addColorStop(0, "rgba(255,255,255,0.04)");
        g.addColorStop(0.55, "rgba(255,255,255,0.012)");
        g.addColorStop(1, "rgba(0,0,0,0.035)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        // 同心の磨き筋(ごく薄く)
        for (let k = 1; k <= 4; k++) {
          ctx.strokeStyle = "rgba(255,255,255," + (0.01 - k * 0.0016) + ")";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, (r * k) / 4.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      row++;
    }
    addScratches(ctx, size, 10, 0.012);
    return finishTexture(cv);
  }

  /** コート・ド・ジュネーブ(平行な帯状の磨き)— 受け用 */
  function genevaTexture(base) {
    const size = 512, cv = makeCanvas(size), ctx = cv.getContext("2d");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    const bands = 6, w = size / bands;
    for (let i = 0; i < bands; i++) {
      const x = i * w;
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0.0, "rgba(255,255,255,0.05)");
      g.addColorStop(0.35, "rgba(255,255,255,0.008)");
      g.addColorStop(0.8, "rgba(0,0,0,0.04)");
      g.addColorStop(1.0, "rgba(0,0,0,0.06)");
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, w + 1, size);
    }
    // ストライプに沿った髪の毛状の磨き筋(ごく薄く)
    for (let i = 0; i < 240; i++) {
      const x = Math.random() * size;
      ctx.strokeStyle = "rgba(255,255,255," + (0.006 + Math.random() * 0.008) + ")";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    addScratches(ctx, size, 8, 0.012);
    return finishTexture(cv);
  }

  /** サーキュラーブラッシング(同心円の磨き目)— 香箱蓋・ネジ頭用 */
  function circularBrushTexture(base) {
    const size = 512, cv = makeCanvas(size), ctx = cv.getContext("2d");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    const c = size / 2;
    for (let r = 3; r < size * 0.72; r += 1.6) {
      const light = Math.random() > 0.5;
      ctx.strokeStyle = light
        ? "rgba(255,255,255," + (0.02 + Math.random() * 0.05) + ")"
        : "rgba(0,0,0," + (0.02 + Math.random() * 0.06) + ")";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 半径方向の淡い光帯(金属の艶)
    const g = ctx.createRadialGradient(c, c, 10, c, c, size * 0.7);
    g.addColorStop(0, "rgba(255,255,255,0.10)");
    g.addColorStop(0.4, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(0,0,0,0.16)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    addScratches(ctx, size, 6, 0.03);
    return finishTexture(cv);
  }

  /** サンレイ(放射状の磨き目)— 角穴車・丸穴車用 */
  function sunburstTexture(base) {
    const size = 512, cv = makeCanvas(size), ctx = cv.getContext("2d");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    const c = size / 2;
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * Math.PI * 2;
      const light = i % 2 === 0;
      ctx.strokeStyle = light
        ? "rgba(255,240,210," + (0.02 + Math.random() * 0.05) + ")"
        : "rgba(40,25,0," + (0.02 + Math.random() * 0.05) + ")";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * 8, c + Math.sin(a) * 8);
      ctx.lineTo(c + Math.cos(a) * size * 0.72, c + Math.sin(a) * size * 0.72);
      ctx.stroke();
    }
    // 対角の光帯(サンレイの艶)
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, "rgba(255,255,255,0.10)");
    g.addColorStop(0.5, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(0,0,0,0.14)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return finishTexture(cv);
  }

  /* ---- テクスチャは種類ごとに1枚だけ生成して共有 ---- */
  const _texCache = {};
  function getTexture(kind) {
    if (_texCache[kind]) return _texCache[kind];
    let tex;
    switch (kind) {
      case "perlage":  tex = perlageTexture("#9298a2"); break;
      case "geneva":   tex = genevaTexture("#9aa0aa"); break;
      case "hairline": tex = hairlineTexture("#a2a8b2"); break;
      case "circular": tex = circularBrushTexture("#a98f52"); break;
      case "circularSteel": tex = circularBrushTexture("#a2a8b2"); break;
      case "sunburst": tex = sunburstTexture("#b39759"); break;
    }
    _texCache[kind] = tex;
    return tex;
  }

  /** ヘアライン(サテン)仕上げ — 一方向のごく微細な磨き目 */
  function hairlineTexture(base) {
    const size = 512, cv = makeCanvas(size), ctx = cv.getContext("2d");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 520; i++) {
      const y = Math.random() * size;
      ctx.strokeStyle = (Math.random() > 0.5 ? "rgba(255,255,255," : "rgba(0,0,0,") +
        (0.006 + Math.random() * 0.01) + ")";
      ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
    }
    return finishTexture(cv);
  }

  /* ============================================================
     2) マテリアル
     ============================================================ */

  const _matCache = {};
  /** 無地の金属マテリアル(キャッシュ付き) */
  function metal(colorKey, roughness = 0.32, metalness = 0.9) {
    const key = colorKey + "_" + roughness + "_" + metalness;
    if (!_matCache[key]) {
      _matCache[key] = new THREE.MeshStandardMaterial({
        color: COLORS[colorKey] || colorKey,
        roughness, metalness,
        envMapIntensity: 0.42
      });
    }
    return _matCache[key];
  }

  /** 鏡面ポリッシュ(面取り・リム・ネジ頭の縁) */
  function polishMat() { return metal("polish", 0.12, 1.0); }

  /**
   * 仕上げ模様つき金属マテリアル
   * @param {string} kind テクスチャ種別
   * @param {number} span 部品のワールド幅(UVスケール計算用)
   * @param {number[]} center 模様の中心 [x, z](省略時は原点)
   */
  function finishedMetal(kind, span, roughness = 0.4, center) {
    const tex = getTexture(kind).clone();
    tex.needsUpdate = true;
    const rep = 1 / span;
    tex.repeat.set(rep, rep);
    // ExtrudeGeometry の UV は shape 座標 (x, -z) がそのまま入るため
    // 部品の中心が canvas の中心 (0.5, 0.5) に来るようオフセット
    const cx = center ? center[0] : 0;
    const cz = center ? -center[1] : 0;
    tex.offset.set(0.5 - cx * rep, 0.5 - cz * rep);
    return new THREE.MeshStandardMaterial({
      map: tex, color: 0xffffff,
      roughness, metalness: 0.9,
      envMapIntensity: 0.4
    });
  }

  /* ---- ルビー(穴石・爪石): 自発光せず、透明感のある宝石表現 ----
     r128 の MeshPhysicalMaterial は transmission 非対応のため、
     深いワインレッド + 高い clearcoat + 薄い透明で宝石感を出す */
  function rubyMat() {
    // 人工ルビー(#EF1B4D): 発光せず、モニター上でも薄いピンクにならない深く鮮やかな赤。
    // 白い反射が全面を覚うと色が薄く見えるため、不透明寄り(opacity 0.96)・
    // 環境反射と反射率を下げて、内部に光を抱えたガラス質の赤石に見せる。
    return new THREE.MeshPhysicalMaterial({
      color: 0xef1b4d, roughness: 0.12, metalness: 0.0,
      clearcoat: 1.0, clearcoatRoughness: 0.04,
      reflectivity: 0.6, envMapIntensity: 0.75,
      transparent: true, opacity: 0.96
    });
  }
  // 側面・深い部分用のやや暗い深紅(立体感を出す)
  function rubyDeepMat() {
    return new THREE.MeshPhysicalMaterial({
      color: 0xb0102f, roughness: 0.16, metalness: 0.0,
      clearcoat: 1.0, clearcoatRoughness: 0.06,
      reflectivity: 0.5, envMapIntensity: 0.6,
      transparent: true, opacity: 0.98
    });
  }
  // 共有インスタンス(ほとんどの穴石はこれを使う)
  const _sharedRuby = rubyMat();
  const _sharedRubyDeep = rubyDeepMat();
  // 軸穴(中心の小さな穴)周辺: ボルドー〜暗い赤(中心に深みを与える)
  const _rubyHole = new THREE.MeshStandardMaterial({ color: 0x4a0512, roughness: 0.3, metalness: 0.1 });

  /* ============================================================
     3) 形状ヘルパー
     注意: Shape は XY 平面で作り rotateX(-90°) で寝かせるため、
     ワールド XZ 座標 (x, z) は Shape 上では (x, -z) になる。
     ============================================================ */

  /** 歯車の輪郭 Shape を作る(先細りの歯) */
  function gearShape(r, teeth, depth, holeR) {
    const shape = new THREE.Shape();
    const seg = (Math.PI * 2) / teeth;
    const rr = r - depth; // 歯底円
    for (let i = 0; i < teeth; i++) {
      const a = i * seg;
      const pts = [
        [rr, a], [rr, a + seg * 0.26],
        [r, a + seg * 0.40], [r, a + seg * 0.58],
        [rr, a + seg * 0.72]
      ];
      pts.forEach(([rad, ang], j) => {
        const x = rad * Math.cos(ang), y = rad * Math.sin(ang);
        (i === 0 && j === 0) ? shape.moveTo(x, y) : shape.lineTo(x, y);
      });
    }
    shape.closePath();
    if (holeR > 0) {
      const hole = new THREE.Path();
      hole.absarc(0, 0, holeR, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    return shape;
  }

  /** Shape を押し出して水平に寝かせたメッシュ (下面が y=0) */
  function extrudeFlat(shape, thickness, mat, bevel) {
    const opts = { depth: thickness, bevelEnabled: false, curveSegments: 32 };
    if (bevel) {
      opts.bevelEnabled = true;
      opts.bevelThickness = 0.16;
      opts.bevelSize = 0.16;
      opts.bevelSegments = 2;
    }
    const geo = new THREE.ExtrudeGeometry(shape, opts);
    geo.rotateX(-Math.PI / 2); // XY → XZ (z = -shapeY)
    if (bevel) geo.translate(0, 0.16, 0); // ベベル分だけ持ち上げて底面を y=0 に
    return new THREE.Mesh(geo, mat);
  }

  /** 2点を結ぶスタジアム型(小判型)Shape。ワールドXZ座標で指定 */
  function stadiumShape(x1, z1, x2, z2, r) {
    const p1 = new THREE.Vector2(x1, -z1);
    const p2 = new THREE.Vector2(x2, -z2);
    const dir = p2.clone().sub(p1);
    const ang = Math.atan2(dir.y, dir.x);
    const shape = new THREE.Shape();
    shape.absarc(p1.x, p1.y, r, ang + Math.PI / 2, ang - Math.PI / 2, false);
    shape.absarc(p2.x, p2.y, r, ang - Math.PI / 2, ang + Math.PI / 2, false);
    shape.closePath();
    return shape;
  }

  /**
   * マイナスネジ: 磨いた頭 + 深いすり割り + ポリッシュの縁
   * @param {number} r 頭の半径
   * @param {boolean} blued 青焼きネジにする
   */
  function makeScrew(r = 0.75, blued = false) {
    const g = new THREE.Group();
    const headMat = blued
      ? new THREE.MeshStandardMaterial({
          color: COLORS.blued, roughness: 0.16, metalness: 0.9, envMapIntensity: 0.9
        })
      : new THREE.MeshStandardMaterial({
          map: (() => {
            const t = getTexture("circularSteel").clone();
            t.needsUpdate = true;
            t.repeat.set(0.9, 0.9); t.offset.set(0.05, 0.05);
            return t;
          })(),
          roughness: 0.14, metalness: 0.95, envMapIntensity: 0.7
        });

    const head = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.94, 0.42, 24), headMat);
    head.position.y = 0.21;
    g.add(head);

    // ポリッシュの縁(面取り)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.92, 0.06, 8, 28), polishMat());
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.42;
    g.add(rim);

    // 深いすり割り(暗い溝 + 溝壁のハイライト)
    const slotDepth = 0.26;
    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(r * 1.9, slotDepth, r * 0.3),
      new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.5, metalness: 0.6 })
    );
    slot.position.y = 0.42 - slotDepth / 2 + 0.02;
    slot.rotation.y = Math.random() * Math.PI;
    g.add(slot);
    return g;
  }

  /** ルビー穴石(宝石表現): 金色シャトンに沈み込み、中央に軸穴。発光なし */
  function makeJewel(topY, r = 0.75) {
    const g = new THREE.Group();

    // 金色シャトン(受け座) — 石を抱く土台
    const chaton = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.28, r + 0.34, 0.36, 28), metal("gold", 0.22, 1.0));
    chaton.position.y = topY - 0.04;
    g.add(chaton);

    // 石: 中央に軸穴を抜いたリング状(埋め込まれて見える)
    const stoneShape = new THREE.Shape();
    stoneShape.absarc(0, 0, r, 0, Math.PI * 2, false);
    const bore = new THREE.Path();
    bore.absarc(0, 0, r * 0.26, 0, Math.PI * 2, true);
    stoneShape.holes.push(bore);
    const stoneGeo = new THREE.ExtrudeGeometry(stoneShape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 28 });
    stoneGeo.rotateX(-Math.PI / 2);
    const stone = new THREE.Mesh(stoneGeo, [_sharedRuby, _sharedRubyDeep]);
    stone.position.y = topY;
    g.add(stone);

    // 軸穴の底(暗い屈折)
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.24, r * 0.24, 0.12, 16), _rubyHole);
    hole.position.y = topY + 0.04;
    g.add(hole);

    // 外周の細いポリッシュリング(明るい反射)
    const outer = new THREE.Mesh(new THREE.TorusGeometry(r + 0.2, 0.05, 8, 30), polishMat());
    outer.rotation.x = Math.PI / 2;
    outer.position.y = topY + 0.16;
    g.add(outer);
    return g;
  }

  /* ============================================================
     4) 部品ビルダー群 — 原点=「据わる面」で Group を返す
     ============================================================ */

  /** 地板: ペルラージュ仕上げ + ポリッシュ縁 + 巻真スロット */
  function buildPlate(p) {
    const g = new THREE.Group();
    const R = p.radius, T = p.thickness;
    const slotHalf = 2.3, slotDepthX = 12.5;

    // スロット(3時方向の切り欠き)付き外形
    const dA = Math.asin(slotHalf / R);
    const shape = new THREE.Shape();
    shape.absarc(0, 0, R, dA, Math.PI * 2 - dA, false);
    shape.lineTo(slotDepthX, -slotHalf);
    shape.lineTo(slotDepthX, slotHalf);
    shape.closePath();

    const body = extrudeFlat(shape, T, finishedMetal("perlage", R * 2, 0.36));
    body.position.y = -T;
    g.add(body);

    // 外縁の鏡面面取りリング
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.35, 0.3, 12, 100), polishMat());
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.06;
    g.add(rim);
    // 下側の縁(側面の締まり)
    const lowRim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.2, 0.22, 10, 100), metal("plate", 0.2));
    lowRim.rotation.x = Math.PI / 2;
    lowRim.position.y = -T + 0.2;
    g.add(lowRim);

    // 地板側の穴石(輪列の下軸受)
    [[0, 0], [7.5, 9], [13, 0.8], [9, -6.8], [3.5, -10], [-5.5, -13]].forEach(([x, z]) => {
      const j = makeJewel(0.02, 0.7);
      j.position.set(x, 0, z);
      g.add(j);
    });

    // 香箱用の座ぐり(サーキュラーブラッシング)
    const recess = new THREE.Mesh(
      new THREE.CylinderGeometry(10.2, 10.2, 0.22, 56),
      new THREE.MeshStandardMaterial({
        map: (() => {
          const t = getTexture("circularSteel").clone();
          t.needsUpdate = true;
          return t;
        })(),
        roughness: 0.3, metalness: 0.92, envMapIntensity: 0.5
      })
    );
    recess.position.set(-13, 0.05, 8.5);
    g.add(recess);

    // --- 文字盤側(裏面 y=-T)の機械加工 ---
    // 反転すると見える面。座ぐり・穴石・ネジ穴・キーレス凹部を作り込む
    const backMat = metal("plate", 0.5, 0.85);
    // 中央のモーションワーク座ぐり(段差)
    const mwRecess = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.0, 0.35, 56),
      new THREE.MeshStandardMaterial({ color: 0x7f858f, roughness: 0.55, metalness: 0.85, envMapIntensity: 0.35 }));
    mwRecess.position.set(0, -T + 0.1, 0);
    g.add(mwRecess);
    const mwRing = new THREE.Mesh(new THREE.TorusGeometry(5.0, 0.12, 8, 64), polishMat());
    mwRing.rotation.x = Math.PI / 2; mwRing.position.set(0, -T + 0.28, 0);
    g.add(mwRing);
    // キーレスワーク凹部(3時側の浅い座ぐり)
    const kw = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 7), backMat);
    kw.position.set(15, -T + 0.1, 0);
    g.add(kw);
    // 穴石(裏面向き): 中心・スモセコ(四番)・分車・その他
    const bj = [[0, 0], [SMALL_SECONDS_CENTER.x, SMALL_SECONDS_CENTER.z], [8, -6], [-6, -8], [-11, 4]];
    bj.forEach(([x, z]) => {
      const j = makeJewel(0, 0.62);
      j.rotation.x = Math.PI;              // 裏面向き(反転後に上を向く)
      j.position.set(x, -T - 0.02, z);
      g.add(j);
    });
    // 文字盤足の穴 + ネジ穴(暗い小円)
    const holeMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.6, metalness: 0.3 });
    [[18, 6], [-18, -6], [6, 18], [-6, -18], [20, -3], [-20, 3]].forEach(([x, z]) => {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.5, 16), holeMat);
      h.position.set(x, -T + 0.05, z);
      g.add(h);
    });
    return g;
  }

  /** 汎用の輪列歯車: 細い歯 + エレガントなスポーク + 段付きハブ + 光るリム */
  function buildWheel(p) {
    const g = new THREE.Group();
    const r = p.radius, teeth = p.teeth || 60;
    const th = 0.7;
    const toothDepth = Math.min(0.75, r * 0.11);
    const mat = metal(p.color || "gilt", 0.24, 0.95);

    // 歯付きリング
    const ring = extrudeFlat(gearShape(r, teeth, toothDepth, r * 0.64), th, mat);
    g.add(ring);

    // 歯底の内側に光るポリッシュリム
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r - toothDepth - 0.12, 0.14, 8, 64), polishMat());
    rim.rotation.x = Math.PI / 2;
    rim.position.y = th + 0.02;
    g.add(rim);
    // スポーク付け根の内周リム
    const innerRim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.64, 0.12, 8, 56), metal(p.color || "gilt", 0.16));
    innerRim.rotation.x = Math.PI / 2;
    innerRim.position.y = th / 2;
    g.add(innerRim);

    // 細いスポーク(中央が僅かに細いテーパー)
    const spokes = p.spokes || 4;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.BoxGeometry(r * 0.66, th * 0.7, 0.5), mat);
      s.position.set(Math.cos(a) * r * 0.33, th / 2, Math.sin(a) * r * 0.33);
      s.rotation.y = -a;
      g.add(s);
    }

    // 段付きハブ(2段 + ポリッシュキャップ)
    const hub1 = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.22, th * 1.6, 24), metal("steel", 0.22));
    hub1.position.y = th * 0.8;
    const hub2 = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.12, r * 0.13, th * 1.2, 20), polishMat());
    hub2.position.y = th * 1.9;
    g.add(hub1, hub2);

    // ホゾ(軸)
    const pivotH = p.pivotH || 3;
    const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, pivotH, 12), metal("steel", 0.15));
    pivot.position.y = pivotH / 2;
    g.add(pivot);
    return g;
  }

  /** ガンギ車: 尖った歯の特殊歯車(磨き鋼) */
  function buildEscapeWheel(p) {
    return buildWheel({
      radius: p.radius, teeth: p.teeth || 15, spokes: 4,
      color: "steel", pivotH: p.pivotH || 2.6
    });
  }

  /** 香箱車: ドラム + 外周歯 + サーキュラーブラッシングの蓋 */
  function buildBarrel(p) {
    const g = new THREE.Group();
    const r = p.radius;

    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.93, r * 0.93, 2.6, 64),
      metal("brass", 0.34)
    );
    drum.position.y = 1.3;
    g.add(drum);

    // 外周の歯(上端)
    const teethRing = extrudeFlat(
      gearShape(r, p.teeth || 84, 0.6, r * 0.9), 0.8, metal("brass", 0.26, 0.95)
    );
    teethRing.position.y = 2.6;
    g.add(teethRing);

    // 蓋: サーキュラーブラッシング仕上げ
    const lid = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.22, 64),
      new THREE.MeshStandardMaterial({
        map: (() => {
          const t = getTexture("circular").clone();
          t.needsUpdate = true;
          return t;
        })(),
        roughness: 0.26, metalness: 0.94, envMapIntensity: 0.6
      })
    );
    lid.position.y = 3.5;
    g.add(lid);

    // 蓋の縁のポリッシュリング
    const lidRim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.86, 0.1, 8, 72), polishMat());
    lidRim.rotation.x = Math.PI / 2;
    lidRim.position.y = 3.58;
    g.add(lidRim);

    // 香箱真(角穴車がはまる四角い芯)
    const arbor = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3.4, 1.5), metal("steel", 0.18));
    arbor.position.y = 3.6;
    g.add(arbor);
    const arborTip = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.2, 12), polishMat());
    arborTip.position.y = 5.6;
    g.add(arborTip);
    return g;
  }

  /** 受け(ブリッジ): コート・ド・ジュネーブ + ベベル + 光る面取り + 穴石 */
  function buildBridge(p) {
    const g = new THREE.Group();
    const th = p.thickness || 1.3;
    const arms = p.arms || [];

    // 模様のUVスケール用にアーム全体のバウンディングを計算
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    arms.forEach((a) => {
      [[a[0], a[1]], [a[2], a[3]]].forEach(([x, z]) => {
        minX = Math.min(minX, x - a[4]); maxX = Math.max(maxX, x + a[4]);
        minZ = Math.min(minZ, z - a[4]); maxZ = Math.max(maxZ, z + a[4]);
      });
    });
    const span = Math.max(maxX - minX, maxZ - minZ) || 10;
    const center = [(minX + maxX) / 2, (minZ + maxZ) / 2];
    // 受けごとに仕上げを変える(すべて同じ模様にしない)。既定はごく薄いコート・ド・ジュネーブ
    const finish = p.finish || "geneva";
    const mat = finish === "hairline" ? finishedMetal("hairline", span * 1.6, 0.34, center)
              : finish === "satin"    ? metal(p.color || "plate", 0.5, 0.85)
              : finishedMetal("geneva", span * 1.15, 0.32, center);

    arms.forEach((a, i) => {
      const mesh = extrudeFlat(stadiumShape(a[0], a[1], a[2], a[3], a[4] - 0.16), th - 0.16, mat, true);
      mesh.position.y = i * 0.03; // 重なり面のZファイティング回避
      g.add(mesh);

      // アーム両端の鏡面面取りリング(アングラージュ)
      [[a[0], a[1]], [a[2], a[3]]].forEach(([x, z]) => {
        const edge = new THREE.Mesh(new THREE.TorusGeometry(a[4] - 0.18, 0.12, 10, 48), polishMat());
        edge.rotation.x = Math.PI / 2;
        edge.position.set(x, th + 0.04 + i * 0.03, z);
        g.add(edge);
      });
    });

    (p.jewels || []).forEach(([x, z]) => {
      const j = makeJewel(th + 0.1, 0.75);
      j.position.set(x, 0, z);
      g.add(j);
    });
    (p.screws || []).forEach(([x, z], i) => {
      // 受けのネジは磨き鋼、最後の1本だけ青焼きでアクセント
      const s = makeScrew(0.8, p.bluedScrews === true || i === (p.screws.length - 1) && p.id !== undefined);
      s.position.set(x, th, z);
      g.add(s);
    });
    return g;
  }

  /** 巻上げ系歯車(丸穴車・角穴車): サンレイ仕上げ + 青焼きネジ */
  function buildRatchet(p) {
    const g = new THREE.Group();
    const r = p.radius;

    const mat = new THREE.MeshStandardMaterial({
      map: (() => {
        const t = getTexture("sunburst").clone();
        t.needsUpdate = true;
        const rep = 1 / (r * 2.15);
        t.repeat.set(rep, rep);
        t.offset.set(0.5, 0.5);
        return t;
      })(),
      roughness: 0.24, metalness: 0.94, envMapIntensity: 0.6
    });

    const disc = extrudeFlat(gearShape(r, p.teeth || 48, Math.min(0.7, r * 0.1), 0), 0.75, mat);
    g.add(disc);

    // 外周内側の光るリム
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.82, 0.1, 8, 64), polishMat());
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.78;
    g.add(rim);

    // 中心の段差ハブ + 青焼きの固定ネジ
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.24, r * 0.26, 0.5, 28), metal("steel", 0.18));
    hub.position.y = 0.9;
    g.add(hub);
    const screw = makeScrew(r * 0.15, true);
    screw.position.y = 1.15;
    g.add(screw);
    return g;
  }

  /** コハゼ: 逆止爪(磨き鋼 + 青焼きネジ) */
  function buildClick(p) {
    const g = new THREE.Group();
    const mat = metal("steel", 0.18, 0.95);
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 1.2), mat);
    body.position.set(1.2, 0.35, 0);
    g.add(body);
    const claw = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.9), mat);
    claw.position.set(3.4, 0.35, -0.7);
    claw.rotation.y = 0.6;
    g.add(claw);
    // バネ部(細い腕)
    const spring = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 0.35), polishMat());
    spring.position.set(-0.6, 0.3, 1.1);
    spring.rotation.y = -0.35;
    g.add(spring);
    const screw = makeScrew(0.7, true);
    screw.position.set(0, 0.7, 0);
    g.add(screw);
    return g;
  }

  /** アンクル: 錨形レバー(鏡面) + ルビー爪石2つ + 軸 */
  function buildPallet(p) {
    const g = new THREE.Group();
    const mat = polishMat();
    const L = p.length || 5;

    const beam = new THREE.Mesh(new THREE.BoxGeometry(L * 1.5, 0.45, 0.6), mat);
    beam.position.y = 0.55;
    g.add(beam);

    // フォーク側(+X, テンプ方向): 二又
    [[0.5], [-0.5]].forEach(([off]) => {
      const prong = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 0.35), mat);
      prong.position.set(L * 0.75 + 0.6, 0.55, off * 0.45);
      prong.rotation.y = off * 0.25;
      g.add(prong);
    });

    // T字アーム(-X, ガンギ車側)
    const tbar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 3.6), mat);
    tbar.position.set(-L * 0.55, 0.55, 0);
    g.add(tbar);
    // ルビー爪石(脱進機の焦点なのでわずかに強調)
    [[-L * 0.55, 1.5], [-L * 0.55, -1.5]].forEach(([x, z], i) => {
      const stone = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.68, 1.3), _sharedRuby);
      stone.position.set(x + 0.5, 0.55, z);
      stone.rotation.y = i ? -0.5 : 0.5;
      g.add(stone);
    });

    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 2.4, 12), metal("steel", 0.15));
    staff.position.y = 1.2;
    g.add(staff);
    return g;
  }

  /** テンプ: 金の磨きリム + 細いアーム + 青いヒゲゼンマイ */
  function buildBalance(p) {
    const g = new THREE.Group();
    const r = p.radius || 7.5;
    const rimY = 2.4;
    const rimMat = metal("gold", 0.13, 1.0);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.52, 20, 90), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = rimY;
    g.add(rim);

    // 細いアーム(2本)
    for (let i = 0; i < 2; i++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(r * 2 - 0.6, 0.38, 0.6), rimMat);
      arm.position.y = rimY;
      arm.rotation.y = i * Math.PI / 2;
      g.add(arm);
    }
    // チラネジ(リム上・磨き鋼)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.55, 12), polishMat());
      s.position.set(Math.cos(a) * r, rimY, Math.sin(a) * r);
      s.rotation.z = Math.PI / 2;
      s.rotation.y = -a;
      g.add(s);
    }

    // テンプ真 + 振り座
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 3.8, 12), metal("steel", 0.12));
    staff.position.y = 1.9;
    g.add(staff);
    const collet = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 18), metal("gold", 0.2));
    collet.position.y = rimY + 0.55;
    g.add(collet);

    // ヒゲゼンマイ(アルキメデス螺旋・焼き入れ青)
    const pts = [];
    const turns = 6, steps = 280;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ang = t * turns * Math.PI * 2;
      const rad = 0.7 + t * (r * 0.52);
      pts.push(new THREE.Vector3(Math.cos(ang) * rad, rimY + 0.85, Math.sin(ang) * rad));
    }
    const spring = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x4a6fe0 })
    );
    g.add(spring);
    return g;
  }

  /** 巻真: 磨き鋼の軸 + 角部 + ネジ部 (X軸方向) */
  function buildStem(p) {
    const g = new THREE.Group();
    const L = p.length || 13, r = p.radius || 0.7;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 20), polishMat());
    shaft.rotation.z = Math.PI / 2;
    g.add(shaft);
    const square = new THREE.Mesh(new THREE.BoxGeometry(L * 0.4, r * 1.7, r * 1.7), metal("steel", 0.22));
    square.position.x = -L * 0.22;
    g.add(square);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 2.4, 12), metal("steel", 0.4));
    tip.rotation.z = Math.PI / 2;
    tip.position.x = L / 2 + 1.2;
    g.add(tip);
    return g;
  }

  /** キチ車・ツヅミ車: X軸まわりの小歯車(磨き鋼) */
  function buildPinionX(p) {
    const g = new THREE.Group();
    const r = p.radius, w = p.width || 1.8;
    const mat = metal("steel", 0.2, 0.95);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.82, r * 0.82, w, 28), mat);
    core.rotation.z = Math.PI / 2;
    g.add(core);
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, r * 0.4, 0.34), mat);
      tooth.position.set(0, Math.cos(a) * r * 0.88, Math.sin(a) * r * 0.88);
      tooth.rotation.x = -a;
      g.add(tooth);
    }
    return g;
  }

  /**
   * 針: ブレゲ針を参考にした3針(短針・長針・秒針)
   * params.style = "hour" | "minute" | "seconds"
   * 先細りのテーパー + ポム(開いた円環) + 深いブルースチール
   */
  function bluedHandMat() {
    // 焼き入れ青: 基本は深い紺、光を受けた面だけ青く反射(発光はしない)
    return new THREE.MeshStandardMaterial({
      color: COLORS.blued, roughness: 0.3, metalness: 0.82, envMapIntensity: 0.6
    });
  }

  /**
   * 針の形状を Shape+ExtrudeGeometry で定義し直す。
   * ・箱を並べる方式をやめ、半幅関数を多数サンプルした連続輪郭にする。
   *   → 先端が「切れて終わる」のではなく、細く収束するシルエットになる。
   * 長さ(ワールド): 短針⇒時字付近まで / 長針⇒分目盛り(外周)付近まで / 秒針⇒スモセコ内。
   */
  function buildHand(p) {
    const g = new THREE.Group();
    const style = p.style || "seconds";
    const L = p.length || (style === "hour" ? 15.5 : style === "minute" ? 19.5 : 4.8);
    const mat = bluedHandMat();
    const H = style === "seconds" ? 0.1 : 0.14; // 針の厚み(Y方向)

    /* 薄い平板シェイプを水平に寢かせて押し出す(下面 y=0)。
       shape の x = 世界 x(長さ方向), shape の y = 世界 -z(左右幅)。 */
    function extrudeHand(shape, thickness) {
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: thickness, bevelEnabled: false, curveSegments: 64
      });
      geo.rotateX(-Math.PI / 2);
      return new THREE.Mesh(geo, mat);
    }

    /* 半幅関数を x 方向にサンプルし、先端まで滑らかに収束する輪郭を作る */
    function taperShape(x0, x1, halfW, N) {
      const s = new THREE.Shape();
      N = N || 60;
      for (let i = 0; i <= N; i++) {
        const x = x0 + (x1 - x0) * (i / N);
        const w = Math.max(halfW(x), 0.0001);
        i === 0 ? s.moveTo(x, w) : s.lineTo(x, w);
      }
      for (let i = N; i >= 0; i--) {
        const x = x0 + (x1 - x0) * (i / N);
        s.lineTo(x, -Math.max(halfW(x), 0.0001));
      }
      s.closePath();
      return s;
    }

    if (style === "seconds") {
      // 極細のブレゲ風秒針: 先端まで滑らかに収束する針 + 尾の小さなカウンターウェイト
      const halfWs = (x) => {
        const t = Math.min(Math.max(x, 0), L) / L;
        return 0.16 * (1 - t) * (1 - t) + 0.028; // 先端へ凸に収束
      };
      const needle = extrudeHand(taperShape(0, L, halfWs, 56), 0.1);
      needle.position.y = 0.34;
      g.add(needle);
      const tail = extrudeHand(taperShape(-1.7, 0, (x) => 0.14 + 0.05 * (1 + x / 1.7), 12), 0.1);
      tail.position.y = 0.34;
      g.add(tail);
      const cw = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 28), mat);
      cw.position.set(-1.55, 0.4, 0);
      g.add(cw);
      const hubS = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.4, 24), mat);
      hubS.position.y = 0.22;
      g.add(hubS);
      return g;
    }

    // 短針・長針: ブレゲ「ポム」針(細い竿 + 先端寄りの開いた真円リング + 細い尖端)
    const w0 = style === "hour" ? 0.5 : 0.42;              // 根元付近の半幅
    const pommeAt = L * (style === "hour" ? 0.78 : 0.80);  // ポム位置
    const pommeR = style === "hour" ? 1.15 : 1.0;
    const nStart = pommeAt - pommeR * 1.05, nEnd = pommeAt + pommeR * 1.05;

    const halfW = (x) => {
      const t = Math.min(Math.max(x, 0), L) / L;
      // 全体: 根元やや太く、先端へ凸に収束
      let base = w0 * (1 - t) * (1 - t) + 0.045;
      // 根元寄りの上品な膛らみ(スペード状)
      base += w0 * 0.45 * Math.exp(-Math.pow((x - L * 0.14) / (L * 0.16), 2));
      // ポムの位置で細くくびれさせ、真円リングの中を開けて見せる
      if (x > nStart && x < nEnd) base = Math.min(base, 0.07);
      return Math.max(base, 0.03);
    };

    const shaft = extrudeHand(taperShape(0, L, halfW, 72), H);
    g.add(shaft);

    // 尾(短い先細り) + 尾端のカウンターウェイト(真円)
    const tailL = style === "hour" ? 3.0 : 3.6;
    const tail = extrudeHand(taperShape(-tailL, 0, (x) => {
      const tt = -x / tailL; // 0(根元)→1(尾端)
      return w0 * (0.85 - tt * 0.5) + 0.03;
    }, 18), H);
    g.add(tail);
    const cw = new THREE.Mesh(new THREE.CylinderGeometry(w0 * 1.15, w0 * 1.15, H, 28), mat);
    cw.position.set(-tailL + w0 * 0.6, H / 2, 0);
    g.add(cw);

    // ポム(開いた真円リング) — 中は透けて見える
    const pomme = new THREE.Mesh(new THREE.TorusGeometry(pommeR, 0.1, 18, 56), mat);
    pomme.rotation.x = Math.PI / 2;
    pomme.position.set(pommeAt, H / 2, 0);
    g.add(pomme);

    // 中心のカノン(小さく上品に)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.54, 0.42, 28), mat);
    hub.position.y = H / 2 - 0.05;
    g.add(hub);
    return g;
  }

  /* ============================================================
     4b) 追加ビルダー — 自動巻 / モーションワーク / 文字盤 / 外装
     ============================================================ */

  /** ローター(回転錘): 左右非対称スケルトンローター
     「細い中央アーム + 外周ウェイト + 大きな肉抜き」の構造。
     ・完全な半円は使わない(スイカ回避)。外周弧は全体の約60%を覆う。
     ・内側の輪郭は幅を角度で変化させて流れる曲線(S字状)にし、左右の端を異なる形で終わらせる。
     ・面を同一平面に重ねないよう y レイヤーを分け、Z-fighting を防ぐ。FrontSide/depthWrite のみ。 */
  function buildRotor(p) {
    const g = new THREE.Group();
    const r = p.radius || 22;

    // ── 素材 ──
    // 本体(アーム/ウェブ): ロジウム調シルバーのサテン仕上げ
    const bodyMat = new THREE.MeshStandardMaterial({
      map: (() => { const t = getTexture("hairline").clone(); t.needsUpdate = true; t.repeat.set(1 / (r * 2), 1 / (r * 2)); t.offset.set(0.5, 0.5); return t; })(),
      color: 0xb6bcc6, roughness: 0.42, metalness: 0.95, envMapIntensity: 0.42
    });
    // 外周ウェイト: 少し暗めのシャンパンゴールド(重厚感)
    const weightMat = new THREE.MeshStandardMaterial({
      map: (() => { const t = getTexture("circular").clone(); t.needsUpdate = true; t.repeat.set(1, 1); return t; })(),
      color: 0xa8894e, roughness: 0.36, metalness: 1.0, envMapIntensity: 0.46
    });
    // 中央軸周辺: 鏡面仕上げのシルバー
    const hubMat = polishMat();

    // 押し出しヘルパー(ベベル付き・下面 y=0)
    const extrude = (shape, depth, bevel) => {
      const opts = { depth, bevelEnabled: !!bevel, curveSegments: 96 };
      if (bevel) { opts.bevelThickness = 0.1; opts.bevelSize = 0.14; opts.bevelSegments = 2; }
      const geo = new THREE.ExtrudeGeometry(shape, opts);
      geo.rotateX(-Math.PI / 2);
      if (bevel) geo.translate(0, 0.1, 0);
      return geo;
    };

    // 1) 外周ウェイト(三日月状の弧) — 内側輪郭を角度で変化させて S字状に
    //    弧の範囲は非対称(約216° ≈ 全体の60%)。両端の幅を変えて形を違える。
    const th0 = -1.98, th1 = 1.79;                 // 非対称な開始/終了角
    const rOut = r;
    const width = (u) => {                          // u: 0(th0端)→1(th1端)
      const base = 3.0 + 2.4 * Math.sin(u * Math.PI);        // 中央が厚い三日月
      const flow = 1.2 * Math.sin(u * Math.PI * 2 + 0.7);    // 流れる S 字のうねり
      const endTaperA = Math.min(u / 0.12, 1);              // th0 端: 細く尖らせる
      const endTaperB = Math.min((1 - u) / 0.2, 1);         // th1 端: やや丸く広めに残す
      return (base + flow) * endTaperA * (0.55 + 0.45 * endTaperB) + 0.6;
    };
    const N = 130;
    const wShape = new THREE.Shape();
    for (let i = 0; i <= N; i++) {
      const th = th0 + (th1 - th0) * (i / N);
      const x = Math.cos(th) * rOut, y = Math.sin(th) * rOut;
      i === 0 ? wShape.moveTo(x, y) : wShape.lineTo(x, y);
    }
    for (let i = N; i >= 0; i--) {
      const u = i / N, th = th0 + (th1 - th0) * u;
      const rin = rOut - width(u);
      wShape.lineTo(Math.cos(th) * rin, Math.sin(th) * rin);
    }
    wShape.closePath();
    const weight = new THREE.Mesh(extrude(wShape, 1.15, true), weightMat);
    weight.position.y = 0.0;                         // y: 0.0 〜 約1.35
    g.add(weight);

    // 2) 細身のアーム(非対称な2本) — 中心ハブから外周ウェイトへ伸びる。
    //    ウェイトとは別 y レイヤー(0.35〜0.95)で、交差はするが面を共有しない。
    const armShape = (r0, r1, hw0, hw1) => {
      const s = new THREE.Shape();
      s.moveTo(r0, hw0); s.lineTo(r1, hw1);
      s.lineTo(r1, -hw1); s.lineTo(r0, -hw0); s.closePath();
      return s;
    };
    const arms = [
      { th: -0.62, r0: 3.0, r1: rOut - 3.2, hw0: 1.7, hw1: 0.95 },
      { th: 0.92, r0: 3.0, r1: rOut - 2.6, hw0: 1.5, hw1: 0.8 }
    ];
    arms.forEach((a) => {
      const m = new THREE.Mesh(extrude(armShape(a.r0, a.r1, a.hw0, a.hw1), 0.6, true), bodyMat);
      m.position.y = 0.35;
      m.rotation.y = -a.th;
      g.add(m);
    });

    // 3) 中央ハブ(鏡面シルバー) + ボールベアリング — アーム内端を覆う上層
    const hubDisc = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.2, 0.8, 44), hubMat);
    hubDisc.position.y = 1.0;                        // y: 0.6 〜 1.4
    g.add(hubDisc);
    const bear1 = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 1.0, 36), metal("steel", 0.22));
    bear1.position.y = 1.5;
    const bear2 = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.4, 30), hubMat);
    bear2.position.y = 1.85;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.18, 12, 44), weightMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 2.15;
    g.add(bear1, bear2, ring);

    // 4) 外周ウェイト上面にごく控えめな刻印(CAL. 02 · TWENTY-ONE JEWELS)
    const engrave = _rotorEngravingTexture();
    if (engrave) {
      const label = new THREE.Mesh(
        new THREE.RingGeometry(rOut - 2.6, rOut - 0.7, 96, 1, -0.5, 1.0),
        new THREE.MeshBasicMaterial({ map: engrave, transparent: true, opacity: 0.5, depthWrite: false })
      );
      label.rotation.x = -Math.PI / 2;
      label.position.y = 1.36;                       // ウェイト上面のわずか上
      g.add(label);
    }
    return g;
  }

  /* ローターの微細刻印テクスチャ(重すぎない 1枚キャッシュ) */
  function _rotorEngravingTexture() {
    if (_texCache.rotorEngrave !== undefined) return _texCache.rotorEngrave;
    const size = 512, cv = makeCanvas(size), ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.fillStyle = "rgba(38,32,18,0.85)";
    ctx.font = "600 26px 'Times New Roman', serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("CAL. 02   \u00b7   TWENTY-ONE JEWELS", 0, -size * 0.36);
    ctx.restore();
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    _texCache.rotorEngrave = tex;
    return tex;
  }

  /** 筒カナ(Cannon Pinion): 細い筒 + 根元の小歯車 */
  function buildCannonPinion(p) {
    const g = new THREE.Group();
    const mat = metal("steel", 0.16, 0.95);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 4.2, 18), mat);
    tube.position.y = 2.1;
    g.add(tube);
    // 根元の小歯車(分針を送る)
    const gear = extrudeFlat(gearShape(1.7, 24, 0.28, 0.55), 0.55, mat);
    g.add(gear);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.6, 18), polishMat());
    collar.position.y = 0.9;
    g.add(collar);
    return g;
  }

  /** 時車(Hour Wheel): 平歯車 + 短針用の太い筒(筒カナに被さる) */
  function buildHourWheel(p) {
    const g = new THREE.Group();
    const mat = metal("brass", 0.22, 0.95);
    const gear = extrudeFlat(gearShape(3.2, 40, 0.4, 1.0), 0.5, mat);
    g.add(gear);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 2.6, 20), metal("brass", 0.18));
    tube.position.y = 1.3;
    g.add(tube);
    const tubeTop = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.4, 20), polishMat());
    tubeTop.position.y = 2.5;
    g.add(tubeTop);
    return g;
  }

  /* ---- 文字盤テクスチャ(サンレイ + インデックス + スモセコ + ブランド) ---- */
  function dialTexture(rWorld) {
    const size = 1024, cv = makeCanvas(size), ctx = cv.getContext("2d");
    const c = size / 2;
    const dark = "#242a33";        // インデックス・目盛り(白地に映える濃紺グレー)
    const blued = "#1e356f";       // ブルースチール目盛り

    // 銀白〜アイボリーの地(ごく弱いサンレイ)
    const base = ctx.createRadialGradient(c, c * 0.9, 30, c, c, c);
    base.addColorStop(0, "#f2efe6");
    base.addColorStop(0.6, "#e9e6db");
    base.addColorStop(1, "#d8d4c7");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    // 微弱なサンレイ(粒子感程度)
    for (let i = 0; i < 720; i++) {
      const a = (i / 720) * Math.PI * 2;
      ctx.strokeStyle = i % 2 ? "rgba(255,255,255,0.05)" : "rgba(120,116,104,0.035)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * 30, c + Math.sin(a) * 30);
      ctx.lineTo(c + Math.cos(a) * c * 0.98, c + Math.sin(a) * c * 0.98);
      ctx.stroke();
    }

    const R = c * 0.9;
    // 分目盛り(レイルウェイ) — 細く上品に
    for (let m = 0; m < 60; m++) {
      const a = (m / 60) * Math.PI * 2 - Math.PI / 2;
      const isH = m % 5 === 0;
      const r1 = R, r2 = R - (isH ? 24 : 12);
      ctx.strokeStyle = dark;
      ctx.lineWidth = isH ? 3 : 1.1;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
      ctx.lineTo(c + Math.cos(a) * r2, c + Math.sin(a) * r2);
      ctx.stroke();
    }
    // ローマ数字風の細いバーインデックス(ブルースチール)
    const scx = c + (SMALL_SECONDS_CENTER.x / rWorld) * R;
    const scy = c + (SMALL_SECONDS_CENTER.z / rWorld) * R; // テクスチャ回転を含めて一致
    for (let h = 0; h < 12; h++) {
      const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
      const rr = R - 38;
      const px = c + Math.cos(a) * rr, py = c + Math.sin(a) * rr;
      // スモセコにかかるインデックスは間引く
      if (Math.hypot(px - scx, py - scy) < R * 0.3) continue;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = blued;
      ctx.fillRect(-2.4, -30, 4.8, 34);
      ctx.restore();
    }
    // スモールセコンド(共通座標に一致)
    const sx = scx, sy = scy;
    ctx.strokeStyle = "rgba(60,66,78,0.55)";
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(sx, sy, R * 0.26, 0, Math.PI * 2); ctx.stroke();
    for (let s = 0; s < 60; s++) {
      const a = (s / 60) * Math.PI * 2;
      const isB = s % 15 === 0, isM = s % 5 === 0;
      const r1 = R * 0.26, r2 = r1 - (isB ? 9 : isM ? 6 : 3);
      ctx.strokeStyle = dark;
      ctx.lineWidth = isM ? 1.6 : 0.8;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1);
      ctx.lineTo(sx + Math.cos(a) * r2, sy + Math.sin(a) * r2);
      ctx.stroke();
    }
    // ブランド表記(上品な濃グレー)
    ctx.fillStyle = dark;
    ctx.textAlign = "center";
    ctx.font = "600 28px 'Times New Roman', serif";
    ctx.fillText("ATELIER  HORLOGER", c, c - R * 0.42);
    ctx.font = "500 18px 'Times New Roman', serif";
    ctx.fillStyle = "#7a6a3c";
    ctx.fillText("Cal.02  Automatic", c, c + R * 0.5);
    ctx.font = "400 14px 'Helvetica', sans-serif";
    ctx.fillStyle = "rgba(90,86,74,0.7)";
    ctx.fillText("21'600 A/h", c, c + R * 0.6);

    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 8;
    tex.center.set(0.5, 0.5);
    tex.rotation = Math.PI / 2;  // 12時を上・スモセコを共通座標に合わせる
    return tex;
  }

  /** 文字盤: 銀白/アイボリーのマット面 + ポリッシュ縁 */
  function buildDial(p) {
    const g = new THREE.Group();
    const r = p.radius || 22;
    const face = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, 0.5, 128),
      new THREE.MeshStandardMaterial({
        map: dialTexture(r), roughness: 0.62, metalness: 0.15, envMapIntensity: 0.28
      })
    );
    face.position.y = 0.25;
    g.add(face);
    // 側面(アイボリー)
    const side = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.5, 128, 1, true),
      new THREE.MeshStandardMaterial({ color: COLORS.ivory, roughness: 0.6, metalness: 0.1 }));
    side.position.y = 0.25;
    g.add(side);
    // 細いポリッシュ縁
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.1, 8, 128), polishMat());
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.5;
    g.add(rim);
    return g;
  }

  /** ケースミドル: ラセ profile の胴 + 4ラグ + 竜頭チューブ */
  function buildCase(p) {
    const g = new THREE.Group();
    const outer = p.outer || 30, inner = p.inner || 24.5, h = p.height || 8;

    // 側面 profile を LatheGeometry で回転
    const pts = [
      new THREE.Vector2(inner, 0),
      new THREE.Vector2(outer - 1.5, 0),
      new THREE.Vector2(outer, 1.2),
      new THREE.Vector2(outer, h - 1.2),
      new THREE.Vector2(outer - 1.2, h),
      new THREE.Vector2(inner + 1.5, h),
      new THREE.Vector2(inner, h - 1.0)
    ];
    const bodyGeo = new THREE.LatheGeometry(pts, 96);
    const brushed = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: 0.32, metalness: 0.95, envMapIntensity: 0.55 });
    const body = new THREE.Mesh(bodyGeo, brushed);
    body.position.y = -h + 4;   // 上端付近を基準に配置
    g.add(body);

    // 上端のポリッシュ面取り
    const topRim = new THREE.Mesh(new THREE.TorusGeometry(outer - 0.6, 0.4, 12, 96), polishMat());
    topRim.rotation.x = Math.PI / 2;
    topRim.position.y = body.position.y + h;
    g.add(topRim);

    // ラグ(12時・6時方向) — ブレスレット取付用
    [-1, 1].forEach((dir) => {
      const lug = new THREE.Mesh(new THREE.BoxGeometry(10, h, 6), brushed);
      lug.position.set(0, body.position.y + h / 2, dir * (outer - 1));
      g.add(lug);
      // ラグ上面の鏡面
      const cap = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 6), polishMat());
      cap.position.set(0, body.position.y + h, dir * (outer - 1));
      g.add(cap);
    });

    // 竜頭チューブ(3時方向 = +X)
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 4, 24), brushed);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(outer + 0.5, body.position.y + h / 2, 0);
    g.add(tube);
    return g;
  }

  /** ムーブメントリング(スペーサー): 環状のダーク樹脂/金属リング */
  function buildSpacer(p) {
    const outer = p.outer || 24.4, inner = p.inner || 22;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const mesh = extrudeFlat(shape, 1.4,
      new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.7, metalness: 0.3 }));
    return mesh;
  }

  /** パッキン: 目立たない暗色のゴムトーラス(ベゼル下に収まる) */
  function buildGasket(p) {
    const r = p.radius || 22.6, t = p.thickness || 0.32;
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(r, t, 12, 120),
      new THREE.MeshStandardMaterial({ color: 0x2a0d0f, roughness: 0.7, metalness: 0.05 })
    );
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  /** 風防(サファイア): 薄いドーム + フラットな縁, 透明ガラス表現 */
  function buildCrystal(p) {
    const g = new THREE.Group();
    const r = p.radius || 23;
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xdfe9ff, transparent: true, opacity: 0.22,
      roughness: 0.02, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.02,
      reflectivity: 0.6, envMapIntensity: 1.0, side: THREE.DoubleSide, depthWrite: false
    });
    // 縁(フラットな円筒)
    const edge = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.0, 96, 1, true), glass);
    edge.position.y = 0.5;
    g.add(edge);
    // ドーム(浅い球冠)
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.9, 64, 24, 0, Math.PI * 2, 0, 0.28), glass
    );
    dome.position.y = 1.0 - r * 1.9 * Math.cos(0.28) + 0.9;
    g.add(dome);
    return g;
  }

  /** ベゼル: 鏡面のリング(額縁) */
  function buildBezel(p) {
    const outer = p.outer || 30, inner = p.inner || 22.5, h = p.height || 1.6;
    const pts = [
      new THREE.Vector2(inner, 0),
      new THREE.Vector2(inner, h * 0.5),
      new THREE.Vector2((inner + outer) / 2, h),
      new THREE.Vector2(outer, h * 0.6),
      new THREE.Vector2(outer, 0)
    ];
    const geo = new THREE.LatheGeometry(pts, 96);
    return new THREE.Mesh(geo, polishMat());
  }

  /** 裏蓋(シースルー): 鋼リング + サファイア窓 */
  function buildCaseBack(p) {
    const g = new THREE.Group();
    const r = p.radius || 27, win = p.window || 20;
    // 外周リング(ローレット風のねじ込み縁)
    const shape = new THREE.Shape();
    shape.absarc(0, 0, r, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, win, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const ring = extrudeFlat(shape, 1.6, metal("steel", 0.3, 0.95));
    g.add(ring);
    // ねじ込みノッチ
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const notch = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 2.2), metal("steel", 0.25));
      notch.position.set(Math.cos(a) * r, 0.9, Math.sin(a) * r);
      notch.rotation.y = -a;
      g.add(notch);
    }
    // サファイア窓
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(win, win, 0.5, 96),
      new THREE.MeshPhysicalMaterial({
        color: 0xdfe9ff, transparent: true, opacity: 0.18,
        roughness: 0.02, metalness: 0, clearcoat: 1, reflectivity: 0.6,
        side: THREE.DoubleSide, depthWrite: false
      })
    );
    glass.position.y = 0.8;
    g.add(glass);
    return g;
  }

  /** 竜頭: ローレット加工(磨き鋼) + 金のメダリオン */
  function buildCrown(p) {
    const g = new THREE.Group();
    const r = p.radius || 3.2, w = p.width || 2.6;
    const mat = metal("steel", 0.2, 0.95);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, w, 48), mat);
    body.rotation.z = Math.PI / 2;
    g.add(body);
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.5, 0.28), metal("steel", 0.34));
      ridge.position.set(0, Math.cos(a) * r, Math.sin(a) * r);
      ridge.rotation.x = -a;
      g.add(ridge);
    }
    // 外側フェイスの金メダリオン
    const face = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.3, 36), metal("gold", 0.16, 1.0));
    face.rotation.z = Math.PI / 2;
    face.position.x = w / 2 + 0.1;
    g.add(face);
    const faceRim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.55, 0.08, 8, 36), polishMat());
    faceRim.rotation.y = Math.PI / 2;
    faceRim.position.x = w / 2 + 0.24;
    g.add(faceRim);
    return g;
  }

  /* ============================================================
     5) ファクトリ本体
     ============================================================ */
  const BUILDERS = {
    plate: buildPlate,
    wheel: buildWheel,
    escapeWheel: buildEscapeWheel,
    barrel: buildBarrel,
    bridge: buildBridge,
    ratchet: buildRatchet,
    click: buildClick,
    pallet: buildPallet,
    balance: buildBalance,
    stem: buildStem,
    pinionX: buildPinionX,
    hand: buildHand,
    crown: buildCrown,
    rotor: buildRotor,
    cannonPinion: buildCannonPinion,
    hourWheel: buildHourWheel,
    dial: buildDial,
    case: buildCase,
    spacer: buildSpacer,
    gasket: buildGasket,
    crystal: buildCrystal,
    bezel: buildBezel,
    caseBack: buildCaseBack
  };

  const PartFactory = {
    /**
     * 部品定義(JSON)から 3D グループを生成する
     * @param {object} def step1.json の parts[i]
     * @returns {THREE.Group}
     */
    create(def) {
      const builder = BUILDERS[def.type];
      if (!builder) throw new Error("未知の部品タイプ: " + def.type);
      const group = builder(def.params || {});
      group.userData.partDef = def;
      return group;
    },

    /**
     * ルビー穴石の発光量を制御(完成演出用)
     * @param {number} k 0(通常)〜1(最大)
     */
    setRubyGlow(k) {
      /* 宝石表現へ変更したため発光は行わない(仕様: ルビーを点滅・発光させない)。
         互換のため関数は残すが no-op。 */
    },

    /* ----------------------------------------------------------
       サムネイル生成: 部品を単体レンダリングして dataURL を返す。
       ---------------------------------------------------------- */
    _thumbSetup() {
      if (this._thumbRenderer) return;
      this._thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this._thumbRenderer.setSize(128, 128);
      this._thumbRenderer.outputEncoding = THREE.sRGBEncoding;
      this._thumbRenderer.toneMapping = THREE.ACESFilmicToneMapping;

      this._thumbScene = new THREE.Scene();
      const hemi = new THREE.HemisphereLight(0xaab4c4, 0x14161a, 0.7);
      const key = new THREE.DirectionalLight(0xffe9cf, 1.5);
      key.position.set(3, 6, 4);
      const rim = new THREE.DirectionalLight(0x8fbfff, 0.8);
      rim.position.set(-4, 2, -4);
      this._thumbScene.add(hemi, key, rim);

      this._thumbCamera = new THREE.PerspectiveCamera(34, 1, 0.1, 500);
    },

    /** 部品グループのサムネイル画像 (dataURL) を生成 */
    thumbnail(group, envTexture) {
      this._thumbSetup();
      this._thumbScene.environment = envTexture || null;
      this._thumbScene.add(group);

      const box = new THREE.Box3().setFromObject(group);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const d = sphere.radius * 2.6;
      this._thumbCamera.position.set(
        sphere.center.x + d * 0.62,
        sphere.center.y + d * 0.72,
        sphere.center.z + d * 0.62
      );
      this._thumbCamera.lookAt(sphere.center);

      this._thumbRenderer.render(this._thumbScene, this._thumbCamera);
      const url = this._thumbRenderer.domElement.toDataURL("image/png");
      this._thumbScene.remove(group);
      return url;
    },

    /** サムネイル用リソースを解放 */
    disposeThumbnailer() {
      if (this._thumbRenderer) {
        this._thumbRenderer.dispose();
        this._thumbRenderer = null;
        this._thumbScene = null;
      }
    },

    COLORS
  };

  WatchSim.PartFactory = PartFactory;
})();
