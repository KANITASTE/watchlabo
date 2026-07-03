/* ============================================================
   scene.js — Three.js シーン管理
   カメラ / ライティング / 環境反射 / オービット操作 / レイキャスト
   ============================================================ */
(function () {
  "use strict";
  window.WatchSim = window.WatchSim || {};

  class SceneManager {
    /**
     * @param {HTMLCanvasElement} canvas 描画先キャンバス
     */
    constructor(canvas) {
      this.canvas = canvas;

      /* ---- レンダラー ---- */
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setClearColor(0x000000, 0); // 背景の机画像を透過して見せる
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.0;

      /* ---- シーン ---- */
      this.scene = new THREE.Scene();
      this.scene.background = null;                 // CSS の机背景を透かす
      this.scene.fog = new THREE.Fog(0x0b0b0d, 190, 360);

      /* ---- カメラ(球面座標で管理する自作オービット) ---- */
      this.camera = new THREE.PerspectiveCamera(
        42, window.innerWidth / window.innerHeight, 1, 1000
      );
      this.target = new THREE.Vector3(0, 1, 0);
      // 現在値と目標値を分けて持ち、毎フレーム補間する(慣性つき)
      this.orbit = { theta: -0.5, phi: 0.95, radius: 92 };
      this.orbitGoal = { theta: -0.5, phi: 0.95, radius: 92 };

      /* ---- ライティング ---- */
      this._setupLights();
      this._setupEnvironment();
      this._setupGround();

      /* ---- レイキャスト ---- */
      this.raycaster = new THREE.Raycaster();
      this._pointerNdc = new THREE.Vector2();
      this._dragImpulse = 0;   // ローター慣性へ渡す、直近フレームのドラッグ方位量

      /* ---- コールバック ---- */
      this.tickHandlers = [];       // 毎フレーム: fn(dt, elapsed)
      this.partClickHandlers = [];  // 配置済み部品クリック: fn(partGroup)

      this.clock = new THREE.Clock();

      this._bindControls();
      window.addEventListener("resize", () => this._onResize());
    }

    /* ------------------------------------------------------------
       ライト: 時計師の作業机を模したスタジオライティング
       ------------------------------------------------------------ */
    _setupLights() {
      // 環境光(弱め・落ち着いたニュートラルグレー)
      const hemi = new THREE.HemisphereLight(0x9098a4, 0x0c0d10, 0.32);
      this.scene.add(hemi);

      // キーライト(大きく柔らかい主光源のつもり・暖色をごく僅か)
      const key = new THREE.DirectionalLight(0xfdf4e6, 0.95);
      key.position.set(35, 78, 34);
      this.scene.add(key);

      // フィルライト(手前から弱く・白飛び/黒つぶれを防ぐ)
      const fill = new THREE.DirectionalLight(0xd6dae2, 0.28);
      fill.position.set(-32, 36, 58);
      this.scene.add(fill);

      // 背面の弱いリムライト(輪郭を出す・青みは控えめで安定した平行光)
      const rim = new THREE.DirectionalLight(0x9fb4d8, 0.22);
      rim.position.set(-55, 28, -60);
      this.scene.add(rim);
    }

    /* ------------------------------------------------------------
       環境反射: 発光パネルを配置した簡易スタジオをPMREM化し、
       金属マテリアルに映り込みを与える(アルミ削り出しの質感)
       ------------------------------------------------------------ */
    _setupEnvironment() {
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x0a0a0c);

      const mkPanel = (w, h, color, intensity, x, y, z, ry) => {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshBasicMaterial({ color })
        );
        m.material.color.multiplyScalar(intensity);
        m.position.set(x, y, z);
        m.rotation.y = ry;
        m.lookAt(0, 0, 0);
        envScene.add(m);
      };
      // 大型ソフトボックス3枚(上・左・右)
      mkPanel(120, 60, 0xffffff, 1.5, 0, 100, 20, 0);
      mkPanel(60, 120, 0xdfe8ff, 0.8, -100, 30, -40, 0);
      mkPanel(60, 100, 0xffe9c8, 0.6, 90, 20, -60, 0);

      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const envRT = pmrem.fromScene(envScene, 0.04);
      this.scene.environment = envRT.texture;
      pmrem.dispose();
    }

    /* ------------------------------------------------------------
       接地シャドウ: 机マット上にムーブメントが乗って見えるよう、
       中央だけ柔らかい暗がりを敷く(透明フェードのソフトコンタクトシャドウ)
       ------------------------------------------------------------ */
    _setupGround() {
      const size = 512;
      const cv = document.createElement("canvas");
      cv.width = cv.height = size;
      const ctx = cv.getContext("2d");
      const g = ctx.createRadialGradient(size / 2, size / 2, 20, size / 2, size / 2, size / 2);
      g.addColorStop(0, "rgba(0,0,0,0.42)");
      g.addColorStop(0.5, "rgba(0,0,0,0.24)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);

      const tex = new THREE.CanvasTexture(cv);
      tex.encoding = THREE.sRGBEncoding;
      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(120, 64),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -6.5;
      this.scene.add(ground);
    }

    /* ------------------------------------------------------------
       オービット操作(ドラッグ回転 / ホイール・ピンチでズーム)
       ------------------------------------------------------------ */
    _bindControls() {
      const el = this.canvas;
      let dragging = false;
      let lastX = 0, lastY = 0;
      let moved = 0;
      const pinch = { active: false, dist: 0 };
      const touches = new Map();

      el.addEventListener("pointerdown", (e) => {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) {
          // ピンチ開始
          const pts = [...touches.values()];
          pinch.active = true;
          pinch.dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          dragging = false;
          return;
        }
        dragging = true;
        moved = 0;
        lastX = e.clientX; lastY = e.clientY;
        el.setPointerCapture(e.pointerId);
      });

      el.addEventListener("pointermove", (e) => {
        if (touches.has(e.pointerId)) {
          touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }
        if (pinch.active && touches.size === 2) {
          const pts = [...touches.values()];
          const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          this.orbitGoal.radius = this._clampRadius(this.orbitGoal.radius * (pinch.dist / Math.max(d, 1)));
          pinch.dist = d;
          return;
        }
        if (!dragging) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        moved += Math.abs(dx) + Math.abs(dy);
        lastX = e.clientX; lastY = e.clientY;
        this.orbitGoal.theta -= dx * 0.005;
        this.orbitGoal.phi = Math.min(1.42, Math.max(0.18, this.orbitGoal.phi - dy * 0.004));
        // ローターの慣性入力用にドラッグ量(方位変化)を蓄積する
        this._dragImpulse += -dx * 0.005;
      });

      const endPointer = (e) => {
        touches.delete(e.pointerId);
        if (touches.size < 2) pinch.active = false;
        if (!dragging) return;
        dragging = false;
        // ほぼ動いていなければ「クリック」→ 配置済み部品の判定
        if (moved < 6) this._handleClick(e.clientX, e.clientY);
      };
      el.addEventListener("pointerup", endPointer);
      el.addEventListener("pointercancel", endPointer);

      el.addEventListener("wheel", (e) => {
        e.preventDefault();
        this.orbitGoal.radius = this._clampRadius(this.orbitGoal.radius * (1 + e.deltaY * 0.0012));
      }, { passive: false });
    }

    _clampRadius(r) { return Math.min(200, Math.max(38, r)); }

    /* クリックされた配置済み部品を通知 */
    _handleClick(cx, cy) {
      if (!this._clickTargets || !this._clickTargets.length) return;
      const hit = this.raycastObjects(cx, cy, this._clickTargets);
      if (!hit) return;
      // ヒットしたメッシュから部品グループ(userData.partDef を持つ親)を遡って探す
      let obj = hit.object;
      while (obj && !obj.userData.partDef) obj = obj.parent;
      if (obj) this.partClickHandlers.forEach((fn) => fn(obj));
    }

    /** クリック判定の対象(配置済み部品グループ)を設定 */
    setClickTargets(groups) { this._clickTargets = groups; }

    /** ローター慣性用: 蓄積したドラッグ方位量を取り出して 0 に戻す */
    consumeDragImpulse() { const v = this._dragImpulse; this._dragImpulse = 0; return v; }

    /* ------------------------------------------------------------
       レイキャストヘルパー
       ------------------------------------------------------------ */
    _setRayFromScreen(cx, cy) {
      this._pointerNdc.set(
        (cx / window.innerWidth) * 2 - 1,
        -(cy / window.innerHeight) * 2 + 1
      );
      this.raycaster.setFromCamera(this._pointerNdc, this.camera);
    }

    /** 画面座標 → 高さ planeY の水平面上のワールド座標 */
    screenToPlane(cx, cy, planeY) {
      this._setRayFromScreen(cx, cy);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
      const out = new THREE.Vector3();
      return this.raycaster.ray.intersectPlane(plane, out) ? out : null;
    }

    /** 画面座標でオブジェクト群をレイキャスト */
    raycastObjects(cx, cy, objects) {
      this._setRayFromScreen(cx, cy);
      const hits = this.raycaster.intersectObjects(objects, true);
      return hits.length ? hits[0] : null;
    }

    /* ------------------------------------------------------------
       メインループ
       ------------------------------------------------------------ */
    onTick(fn) { this.tickHandlers.push(fn); }
    onPartClick(fn) { this.partClickHandlers.push(fn); }

    start() {
      const loop = () => {
        requestAnimationFrame(loop);
        const dt = Math.min(this.clock.getDelta(), 0.05);
        const elapsed = this.clock.elapsedTime;

        // オービットの慣性補間(イージング)
        const o = this.orbit, g = this.orbitGoal;
        const k = 1 - Math.pow(0.001, dt); // フレームレート非依存の減衰
        o.theta += (g.theta - o.theta) * k;
        o.phi += (g.phi - o.phi) * k;
        o.radius += (g.radius - o.radius) * k;

        this.camera.position.set(
          this.target.x + o.radius * Math.sin(o.phi) * Math.sin(o.theta),
          this.target.y + o.radius * Math.cos(o.phi),
          this.target.z + o.radius * Math.sin(o.phi) * Math.cos(o.theta)
        );
        this.camera.lookAt(this.target);

        this.tickHandlers.forEach((fn) => fn(dt, elapsed));
        this.renderer.render(this.scene, this.camera);
      };
      loop();
    }

    /* 通常背景へ戻す(メニュー復帰時): 机画像を見せる */
    setNormalBackground() {
      this.scene.background = null;
      this.scene.fog = new THREE.Fog(0x0b0b0d, 190, 360);
    }

    /* 完成シネマティック: 背景を黒〜濃紺のグラデーションへ */
    setCinemaBackground() {
      const size = 512;
      const cv = document.createElement("canvas");
      cv.width = cv.height = size;
      const ctx = cv.getContext("2d");
      const g = ctx.createRadialGradient(size / 2, size * 0.42, 40, size / 2, size / 2, size * 0.75);
      g.addColorStop(0, "#141a2e");
      g.addColorStop(0.5, "#0a0d1a");
      g.addColorStop(1, "#040509");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      const tex = new THREE.CanvasTexture(cv);
      tex.encoding = THREE.sRGBEncoding;
      this.scene.background = tex;
      this.scene.fog = new THREE.Fog(0x070a14, 150, 340);
    }

    _onResize() {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  WatchSim.SceneManager = SceneManager;
})();
