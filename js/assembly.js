/* ============================================================
   assembly.js — 組立ロジック (Cal.02 Automatic)
   3章構成: ムーブメント → 文字盤側 → ケーシング
   章進行 / スナップ配置 / 学習・試験モード /
   180°反転シネマティック / 完成シネマティック演出
   ============================================================ */
(function () {
  "use strict";
  window.WatchSim = window.WatchSim || {};

  const STORAGE_KEY = "watchsim.cal02.v1"; // 進捗保存キー(このアプリ専用)

  class Assembly {
    /**
     * @param {WatchSim.SceneManager} sceneMgr
     * @param {WatchSim.UI} ui
     * @param {object} data movement/cal02.json の内容
     */
    constructor(sceneMgr, ui, data) {
      this.sceneMgr = sceneMgr;
      this.ui = ui;
      this.data = data;

      this.parts = [...data.parts].sort((a, b) => a.order - b.order);
      this.chapters = data.chapters;
      this.total = this.parts.length;
      this.beatHz = data.beatHz || 3.0;

      this.groups = {};          // partId -> THREE.Group
      this.placed = new Set();
      this.mode = "learning";
      this.activeChapter = "movement";

      this.anims = [];           // スナップ配置アニメーション
      this.tweens = [];          // 汎用トゥイーン(シネマティック)
      this.running = false;      // ムーブメント駆動中
      this.runT = 0;             // 駆動経過時間
      this.windT = null;         // 巻上げ演出の経過(null=非表示)
      this.rotorVel = 0;         // ロータの角速度(慣性回転用)
      this.selectedTool = null;  // ユーザーが選択中の工具
      this.pendingOil = null;    // 注油待ちの部品id(nullなら無し)
      this.flipping = false;
      this.finalState = null;    // 完成シネマティックの状態
      this.busy = false;         // 演出中は操作を止める
      this.ctaAction = null;     // プライマリボタンの現在の動作

      /* ---- 時刻合わせ(完成後に端末の現在時刻へ同期) ---- */
      this.timeSync = false;      // 現在時刻に同期中
      this._calibrating = false;  // 時刻合わせ演出中
      this._calibStarted = false; // 二重開始防止
      this._calib = null;
      // タブ復帰時に現在時刻へ再同期(ズレ蓄積を防ぐ)
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && this.timeSync) this._updateClock();
      });

      /* ---- 2つの入れ子グループ ----
         watch          : 時計全体(完成シネマティックで回転)
           movementInner: 機械側(第1章)。文字盤側へ反転する
         文字盤・ケース部品は watch 直下に置く(常に +Y が上) */
      this.watch = new THREE.Group();
      this.movementInner = new THREE.Group();
      this.watch.add(this.movementInner);
      this.sceneMgr.scene.add(this.watch);

      this._buildTargetRing();
    }

    /* ------------------------------------------------------------
       初期化
       ------------------------------------------------------------ */
    init() {
      const PF = WatchSim.PartFactory;

      this.parts.forEach((part) => {
        const group = PF.create(part);
        group.userData.baseRotY = part.rotationY || 0;
        this.groups[part.id] = part._group = group;
        part._thumb = PF.thumbnail(group, this.sceneMgr.scene.environment);
      });
      PF.disposeThumbnailer();

      this._restore();

      // UI 配線
      this.ui.onDrop = (id, x, y) => this.handleDrop(id, x, y);
      this.ui.onCardClick = (id) => this.handlePartClick(id);
      this.ui.onModeChange = (m) => this.setMode(m);
      this.ui.onCTA = () => { if (this.ctaAction) this.ctaAction(); };
      this.ui.onReset = () => this.reset();
      this.ui.onToolSelect = (t) => this.selectTool(t);
      this.ui.onFinalAction = (act) => this.finalAction(act);
      this.sceneMgr.onPartClick((group) => this.handlePartClick(group.userData.partDef.id));
      this.sceneMgr.onTick((dt, t) => this.update(dt, t));

      this.ui.setMode(this.mode);
      this._syncChapterState();  // 章の状態に応じて配置済みを反映
      this._refresh();
      this._maybeTutorial();
    }

    /* ---- 工具名(日本語) ---- */
    toolName(t) { return { driver: "ドライバー", tweezers: "ピンセット", oiler: "オイラー" }[t] || t; }
    toolUse(t) {
      return {
        driver: "ネジやブリッジの締め付けに使います。対象を選んで配置してください。",
        tweezers: "歯車・受け・小部品をつかんで配置します。カードをドラッグしてください。",
        oiler: "注油に使います。青く示された注油点(ルビー軸受)をクリックしてください。"
      }[t] || "";
    }

    /* ---- 工具の選択 ---- */
    selectTool(tool) {
      this.selectedTool = tool;
      this.ui.setSelectedTool(tool);
      if (this.pendingOil && tool === "oiler") {
        this.ui.setToolGuide("注油点(青いルビー軸受)をクリックしてください。");
      } else {
        this.ui.setToolGuide(this.toolUse(tool));
      }
    }

    /* ---- 初回チュートリアル(1回だけ) ---- */
    _maybeTutorial() {
      try {
        if (localStorage.getItem("watchsim.tut.v1")) return;
        localStorage.setItem("watchsim.tut.v1", "1");
      } catch (e) {}
      this.ui.showMessage("ようこそ", "accent",
        "左に工程、右に工具。工具を選び、下の部品をドラッグして組み立てます。オイラーは注油工程で使います。", 3600);
    }

    /* ---- 章ごとの部品 ---- */
    chapterParts(chId) { return this.parts.filter((p) => p.chapter === chId); }
    chapterInfo(chId) { return this.chapters.find((c) => c.id === chId); }

    /* ---- 次に組む部品(activeChapter 内の未配置で最小 order) ---- */
    get current() {
      return this.chapterParts(this.activeChapter).find((p) => !this.placed.has(p.id)) || null;
    }

    isChapterComplete(chId) {
      return this.chapterParts(chId).every((p) => this.placed.has(p.id));
    }
    get isAllComplete() { return this.placed.size >= this.total; }

    /* ------------------------------------------------------------
       ターゲットリング(次の配置位置を示す発光リング / 学習モード)
       ------------------------------------------------------------ */
    _buildTargetRing() {
      const geo = new THREE.RingGeometry(0.9, 1.0, 72);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x6fb2ff, transparent: true, opacity: 0.5,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
      });
      this.ring = new THREE.Mesh(geo, mat);
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.visible = false;
      this.sceneMgr.scene.add(this.ring);
    }

    _updateRingTarget() {
      // 注油待ちなら注油点(その部品)にリングを出す
      if (this.pendingOil) {
        const op = this.parts.find((p) => p.id === this.pendingOil);
        if (op) {
          const r = (op.hitRadius || 5) * 1.1;
          this.ring.scale.set(r, r, 1);
          this.ring.position.set(op.position[0], op.position[1] + 0.6, op.position[2]);
          this.ring.visible = true;
          return;
        }
      }
      const cur = this.current;
      if (!cur || this.mode !== "learning" || this.busy) { this.ring.visible = false; return; }
      const r = (cur.hitRadius || 5) * 1.1;
      this.ring.scale.set(r, r, 1);
      this.ring.position.set(cur.position[0], cur.position[1] + 0.6, cur.position[2]);
      this.ring.visible = true;
    }

    /* ------------------------------------------------------------
       UI 更新
       ------------------------------------------------------------ */
    _refresh() {
      const cur = this.current;
      const chInfo = this.chapterInfo(this.activeChapter);
      const chParts = this.chapterParts(this.activeChapter);
      const done = chParts.filter((p) => this.placed.has(p.id)).length;

      this.ui.setChapter(chInfo, done, chParts.length);
      this.ui.renderTray(chParts, this.placed);

      if (cur) {
        this.ui.setStepWithinChapter(done + 1, chParts.length, cur.order, this.total);
        if (this.mode === "learning") {
          this.ui.showPartInfo(cur);
          this.ui.setActiveTool(cur.tool);
          // 学習モードでは適切な工具を自動選択(操作を妨げない)
          if (!this.pendingOil) this.selectTool(cur.tool);
          this.ui.setGlowCard(cur.id);
        } else {
          this.ui.setGlowCard(null);
          this.ui.setToolGuide("工具を選択し、作業対象をクリックしてください。");
        }
        // 注油待ちのあいだはオイラーへ促す
        if (this.pendingOil) {
          this.ui.setActiveTool("oiler");
          this.ui.setToolGuide("『オイラー』を選び、青いルビー軸受をクリックして注油してください。");
        }
        this.ui.hideCTA();
      } else if (!this.busy) {
        // 章が完了 → 次のアクション
        this._onChapterComplete(this.activeChapter);
      }
      this._updateRingTarget();
      this.sceneMgr.setClickTargets([...this.placed].map((id) => this.groups[id]));
    }

    /* ------------------------------------------------------------
       部品/作業対象のクリック: 注油工程・部品情報
       ------------------------------------------------------------ */
    handlePartClick(partId) {
      // 注油待ちなら、注油操作を優先処理
      if (this.pendingOil) {
        if (partId === this.pendingOil) {
          if (this.selectedTool !== "oiler") {
            this.ui.showMessage("Wrong Tool", "error", "注油には『オイラー』を使います。右の工具から選んでください。", 2400);
            return;
          }
          const part = this.parts.find((p) => p.id === this.pendingOil);
          this.pendingOil = null;
          this.ui.showMessage("Oiling Complete", "ok", part.name + "の軸受に適量を注油しました。", 1400);
          setTimeout(() => this._refresh(), 900);
          return;
        } else if (this.selectedTool === "oiler") {
          this.ui.showMessage("Do Not Oil Here", "error", "この箇所には注油しません。青く示された注油点を選んでください。", 2400);
          return;
        }
      }
      this.inspectPart(partId);
    }

    inspectPart(partId) {
      if (this.mode === "exam") return;
      const part = this.parts.find((p) => p.id === partId);
      if (part) this.ui.showPartInfo(part);
    }

    /* ------------------------------------------------------------
       ドロップ処理: 正誤判定(部品 → 工具 → 位置)
       ------------------------------------------------------------ */
    handleDrop(partId, clientX, clientY) {
      if (this.busy) return;
      const cur = this.current;
      if (!cur) return;
      const dropped = this.parts.find((p) => p.id === partId);

      // 注油待ちのあいだは次の部品を置けない
      if (this.pendingOil) {
        const op = this.parts.find((p) => p.id === this.pendingOil);
        this.ui.showMessage("Oiling Required", "error",
          "先に注油を完了してください。オイラーを選び、" + (op ? op.name : "注油点") + "をクリックします。", 2600);
        return;
      }

      // 1) 部品の正誤 — なぜ違うかを説明
      if (partId !== cur.id) {
        const why = dropped && this.placed.has(partId)
          ? dropped.name + " は既に取り付け済みです。"
          : "いま必要なのは「" + cur.name + "(" + cur.nameEn + ")」です。" +
            (dropped ? dropped.name + "はこの後の工程で使います。" : "");
        this.ui.showMessage("Incorrect Component", "error", why, 2600);
        return;
      }

      // 2) 工具の正誤 — この部品に適した工具か
      if (this.selectedTool && this.selectedTool !== cur.tool) {
        this.ui.showMessage("Wrong Tool", "error",
          cur.name + "には『" + this.toolName(cur.tool) + "』を使います。右の工具から選び直してください。", 2600);
        return;
      }
      if (!this.selectedTool) {
        this.ui.showMessage("Select a Tool", "error",
          "まず右のパネルで『" + this.toolName(cur.tool) + "』を選んでください。", 2600);
        return;
      }

      // 3) 位置の正誤 — なぜその位置かを説明
      const world = this.sceneMgr.screenToPlane(clientX, clientY, cur.position[1]);
      if (!world) return;
      const dx = world.x - cur.position[0];
      const dz = world.z - cur.position[2];
      const dist = Math.hypot(dx, dz);
      const threshold = Math.max(6, (cur.hitRadius || 5) * 1.15);

      if (dist > threshold) {
        this.ui.showMessage("Alignment Error", "error",
          cur.wrongReason || (cur.name + "の取り付け位置が違います。"), 2600);
        return;
      }

      this._placePart(cur, world);
    }

    /** 部品の親グループ(章によって決まる) */
    _parentFor(part) {
      return part.chapter === "movement" ? this.movementInner : this.watch;
    }

    /** 部品を配置(吸い付くスナップアニメーション) */
    _placePart(part, dropWorld) {
      const group = this.groups[part.id];
      const parent = this._parentFor(part);
      parent.updateMatrixWorld(true);

      const worldTo = new THREE.Vector3().fromArray(part.position);
      const worldFrom = dropWorld
        ? new THREE.Vector3(dropWorld.x, part.position[1] + 16, dropWorld.z)
        : worldTo.clone().setY(part.position[1] + 16);

      const localTo = parent.worldToLocal(worldTo.clone());
      const localFrom = parent.worldToLocal(worldFrom.clone());
      group.position.copy(localFrom);
      group.rotation.y = part.rotationY || 0;
      parent.add(group);

      this.anims.push({
        group, from: localFrom, to: localTo, t: 0, dur: 0.55,
        onDone: () => {
          this.ui.showMessage("Assembly Complete", "ok",
            part.name + " — " + part.nameEn, 1000);
          // 脱進機の要(ガンギ車・アンクル)は配置後に注油工程が必要
          if (part.oil) {
            this.pendingOil = part.id;
            setTimeout(() => {
              this.ui.showMessage("Oiling Required", "accent",
                "『オイラー』を選び、" + part.name + "の軸受(青いルビー)をクリックして注油します。", 3000);
              this._refresh();
            }, 1050);
          } else {
            this._refresh();
          }
        }
      });

      this.placed.add(part.id);
      this.ui.markPlaced(part.id);
      this._save();
      this.ring.visible = false;
    }

    /** 復元時: アニメーションなしで即時配置 */
    _placeInstant(part) {
      const group = this.groups[part.id];
      const parent = this._parentFor(part);
      parent.updateMatrixWorld(true);
      const localTo = parent.worldToLocal(new THREE.Vector3().fromArray(part.position));
      group.position.copy(localTo);
      group.rotation.y = part.rotationY || 0;
      parent.add(group);
      this.placed.add(part.id);
    }

    /* ------------------------------------------------------------
       章完了 → 次のアクションを提示
       ------------------------------------------------------------ */
    _onChapterComplete(chId) {
      if (chId === "movement") {
        // まだ動作確認していなければ「巻いて動作確認」、済んでいれば「文字盤側へ」
        if (!this.running) {
          this.ui.setStepWithinChapter(null, null, null, this.total, "ムーブメント完成");
          this.ui.showPartInfoText("ムーブメント完成", "Movement Complete",
            "心臓部が完成しました。自動巻ローターを回してゼンマイを巻き上げ、動作を確認しましょう。");
          this.ui.setCTA("ゼンマイを巻いて動作確認", () => this.startWinding());
        } else {
          this.ui.showPartInfoText("動作確認 OK", "Movement Running",
            "テンプが振動し、輪列が回転しています。ムーブメントを反転させ、文字盤側の組立へ進みます。");
          this.ui.setCTA("文字盤側を組み立てる →", () => this.flipToDial());
        }
      } else if (chId === "dial") {
        this.ui.showPartInfoText("文字盤側 完成", "Dial Side Complete",
          "三針が揃い、時刻を表示できるようになりました。最後にケースへ収め、腕時計として仕上げます。");
        this.ui.setCTA("ケースを組み立てる →", () => this.startCase());
      } else if (chId === "case") {
        this.ui.showPartInfoText("組立 完了", "Assembly Complete",
          "すべての工程が完了しました。Cal.02 を起動し、完成した時計をご覧ください。");
        this.ui.setCTA("Cal.02 を起動する", () => this.runFinalCinematic());
      }
    }

    /* ------------------------------------------------------------
       第1章: 自動巻の動作確認(ローターを回して巻き上げ→駆動)
       ------------------------------------------------------------ */
    startWinding() {
      if (this.busy || this.running) return;
      this.busy = true;
      this.ui.hideCTA();
      this.windT = 0;
      this.rotorVel = 12;   // ローターを勢いよく回して巻き上げ→摩擦で減速
      this.ui.showMessage("Automatic Winding", "accent", "ローターが回転しゼンマイを巻き上げます", 2000);
    }

    _finishWinding() {
      this.windT = null;
      this.running = true;
      this.runT = 0;
      this.busy = false;
      this._save();
      this.ui.showMessage("Movement Running", "ok", "毎時21,600振動 — 3Hz", 2200);
      setTimeout(() => this._refresh(), 2400);
    }

    /* ------------------------------------------------------------
       第1章→第2章: 180°反転シネマティック
       ------------------------------------------------------------ */
    flipToDial() {
      if (this.busy) return;
      this.busy = true;
      this.flipping = true;
      this.ui.hideCTA();
      this.ui.showCinematic("ムーブメントを反転 — 文字盤側へ");

      const cam = this.sceneMgr;
      const startTheta = cam.orbitGoal.theta;
      const startPhi = cam.orbitGoal.phi;
      const startRad = cam.orbitGoal.radius;

      // カメラを一度引いてゆっくり回り込む
      cam.orbitGoal.radius = startRad * 1.18;
      cam.orbitGoal.phi = 0.62;

      this._tween({
        dur: 3.0, ease: easeInOut,
        onUpdate: (k) => {
          this.movementInner.rotation.x = Math.PI * k;
          this.movementInner.position.y = -3 * k;
          cam.orbitGoal.theta = startTheta + Math.PI * 0.5 * k;
        },
        onDone: () => {
          this.movementInner.rotation.x = Math.PI;
          this.movementInner.position.y = -3;
          cam.orbitGoal.phi = 0.9;
          cam.orbitGoal.radius = startRad;
          this.flipping = false;
          this.busy = false;
          this.activeChapter = "dial";
          this._save();
          this.ui.hideCinematic();
          this.ui.showMessage("Dial-Side Assembly", "accent", "第2章 — 文字盤側の組立を始めます", 2200);
          setTimeout(() => this._refresh(), 600);
        }
      });
    }

    /* ------------------------------------------------------------
       第2章→第3章: ケーシングへ
       ------------------------------------------------------------ */
    startCase() {
      if (this.busy) return;
      this.busy = true;
      this.ui.hideCTA();
      const cam = this.sceneMgr;
      // ケース全体が見えるよう少し引く
      this._tween({
        dur: 1.4, ease: easeInOut,
        onUpdate: (k) => { cam.orbitGoal.radius = lerp(cam.orbit.radius, 108, k * 0.5 + 0.5); },
        onDone: () => {
          cam.orbitGoal.radius = 108;
          this.busy = false;
          this.activeChapter = "case";
          this._save();
          this.ui.showMessage("Casing", "accent", "第3章 — ケーシング(外装組立)", 2200);
          setTimeout(() => this._refresh(), 600);
        }
      });
    }

    /* ------------------------------------------------------------
       最終: 完成シネマティック(8〜12秒・CM風)
       ------------------------------------------------------------ */
    runFinalCinematic() {
      if (this.busy) return;
      this.busy = true;
      this.running = true;
      this.ui.hideCTA();
      this.ui.enterCinemaMode();     // UI を隠しシネマ演出へ

      // 背景を黒〜濃紺のグラデーションへ
      this.sceneMgr.setCinemaBackground();

      const cam = this.sceneMgr;
      cam.orbitGoal.phi = 0.72;
      cam.orbitGoal.radius = 120;
      cam.orbitGoal.theta = -0.4;

      this.finalState = { t: 0, phase: 0, captionShown: false, streaks: 0 };
    }

    /* ------------------------------------------------------------
       完成画面の導線ボタン
       ------------------------------------------------------------ */
    finalAction(act) {
      const cam = this.sceneMgr;
      if (act === "restart") { this.reset(); return; }

      // 自動シーケンスを止め、ユーザー操作へ
      this.finalState = null;

      if (act === "view") {
        // 文字盤側をゆっくり鑑賞
        this.watch.rotation.x = 0;
        cam.orbitGoal.phi = 0.5; cam.orbitGoal.theta = -0.2; cam.orbitGoal.radius = 116;
      } else if (act === "movement") {
        // 裏側(ムーブメント/ローター)を見る
        this.watch.rotation.x = Math.PI;
        cam.orbitGoal.phi = 0.7; cam.orbitGoal.theta = 0.4; cam.orbitGoal.radius = 116;
      } else if (act === "menu") {
        // メインの組立ビューへ戻る(UIを復帰)
        this.busy = false;
        this.watch.rotation.x = 0;
        this.ui.exitCinemaMode();
        this.sceneMgr.setNormalBackground();
        cam.orbitGoal.phi = 0.9; cam.orbitGoal.theta = -0.5; cam.orbitGoal.radius = 108;
      }
    }

    _updateFinal(dt) {
      const fs = this.finalState;
      fs.t += dt;
      const t = fs.t;
      const w = this.watch;

      if (fs.phase === 0) {
        // 裏側(ローター側)を静かに見せる。ローターを一度だけゆっくり慣性で振る
        w.rotation.x = Math.PI;
        w.rotation.y = 0;
        if (t < 0.1 && !fs.pushed) { this.rotorVel = 2.2; fs.pushed = true; }
        if (t > 3.6) { fs.phase = 1; fs.flipStart = t; }
      } else if (fs.phase === 1) {
        // 文字盤側へゆっくり反転(裏 → 表)
        const k = easeInOut(Math.min((t - fs.flipStart) / 2.4, 1));
        w.rotation.x = Math.PI * (1 - k);
        if (k >= 1) {
          w.rotation.x = 0; w.rotation.y = 0; fs.phase = 2;
          // 文字盤側が現れた: 最終カメラへ寄せ、現在時刻へ時刻合わせを開始
          this._setFinalCamera();
          this.startTimeCalibration();
        }
      }
      // phase 2 以降の針の動きと完成演出は _updateCalibration / _updateClock に委ねる
    }

    /* ------------------------------------------------------------
       完成後: 針を現在時刻へ合わせる演出 → 以後は端末時刻に同期
       ------------------------------------------------------------ */

    /** 現在(またはoffsetSec秒後)のローカル時刻から各針の回転角を求める */
    _currentHandAngles(offsetSec) {
      const now = new Date(Date.now() + (offsetSec || 0) * 1000);
      let s = now.getSeconds() + now.getMilliseconds() / 1000;
      s = Math.floor(s * 6) / 6;                       // 21,600振動: 毎秒6ステップ運針
      const m = now.getMinutes() + now.getSeconds() / 60;
      const h = (now.getHours() % 12) + now.getMinutes() / 60;
      return {
        seconds: (s / 60) * Math.PI * 2,
        minute: (m / 60) * Math.PI * 2,
        hour: (h / 12) * Math.PI * 2
      };
    }

    /** 時刻合わせ演出の開始(必ず時計回りに複数周してから現在時刻へ) */
    startTimeCalibration() {
      if (this._calibStarted) return;
      this._calibStarted = true;
      this._calibrating = true;
      const dur = 3.6;
      // 演出終了時刻(=約dur秒後)に一致させると、同期モードへの引き継ぎが滑らか
      const ang = this._currentHandAngles(dur);
      const mk = (id, targetAng, turns) => {
        const g = this.groups[id];
        if (!g) return null;
        const base = g.userData.baseRotY || 0;
        const targetRotY = base - targetAng;                     // 最終静止角
        const startRotY = targetRotY + turns * Math.PI * 2;      // 上から時計回りに回してくる
        g.rotation.y = startRotY;                                // 開始位置へ
        return { g, startRotY, targetRotY };
      };
      this._calib = {
        t: 0, dur,
        hands: [
          mk("secondsHand", ang.seconds, 8),   // 秒針 8周
          mk("minuteHand", ang.minute, 3),     // 長針 3周
          mk("hourHand", ang.hour, 1)          // 短針 1周
        ].filter(Boolean)
      };
    }

    _updateCalibration(dt) {
      const c = this._calib;
      if (!c) { this._calibrating = false; return; }
      c.t += dt;
      const k = easeOutCubic(Math.min(c.t / c.dur, 1)); // 自然な減速(逆回転しない)
      c.hands.forEach((h) => {
        h.g.rotation.y = h.startRotY + (h.targetRotY - h.startRotY) * k;
      });
      if (c.t >= c.dur) {
        this._calibrating = false;
        this.timeSync = true;
        this._calib = null;
        this._updateClock();                              // 正確な現在時刻へスナップ
        // 控えめな完成演出: 光が一度走り、小さな文字を短く表示
        this.ui.lightStreak();
        this.ui.showCalibrationCaption("CALIBRATED TO LOCAL TIME");
        clearTimeout(this._finalCapTimer);
        this._finalCapTimer = setTimeout(() => {
          this.ui.showFinalCaption(this.data.caliber || "Cal.02 Automatic");
        }, 2400);
      }
    }

    /** 毎フレーム: 端末の現在時刻に針を同期(ズレ蓄積なし) */
    _updateClock() {
      const a = this._currentHandAngles();
      const set = (id, ang) => {
        const g = this.groups[id];
        if (g) g.rotation.y = (g.userData.baseRotY || 0) - ang;
      };
      set("secondsHand", a.seconds);
      set("minuteHand", a.minute);
      set("hourHand", a.hour);
    }

    /** 完成状態のカメラ: ごくわずかに斜め上・斜め横から。端末サイズで距離調整 */
    _fitRadius() {
      const agg = Math.min(window.innerWidth, window.innerHeight);
      const r = 104 * Math.max(1, 720 / Math.max(agg, 320));
      return Math.min(190, r);
    }

    _setFinalCamera() {
      const cam = this.sceneMgr;
      cam.target.set(0, 3, 0);
      cam.orbitGoal.phi = 0.6;      // わずかに斜め上
      cam.orbitGoal.theta = 0.34;   // わずかに斜め横
      cam.orbitGoal.radius = this._fitRadius();
    }

    /* ------------------------------------------------------------
       モード切替
       ------------------------------------------------------------ */
    setMode(mode) {
      this.mode = mode;
      this.ui.setMode(mode);
      this._refresh();
      this._save();
    }

    /* ------------------------------------------------------------
       保存 / 復元
       ------------------------------------------------------------ */
    _save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          placed: [...this.placed], mode: this.mode,
          activeChapter: this.activeChapter, running: this.running
        }));
      } catch (e) {}
    }

    _restore() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const s = JSON.parse(raw);
        if (s.mode === "exam" || s.mode === "learning") this.mode = s.mode;
        if (s.activeChapter) this.activeChapter = s.activeChapter;
        if (s.running) this.running = true;
        this._savedPlaced = Array.isArray(s.placed) ? s.placed : [];
      } catch (e) {}
    }

    /** 復元した進捗に合わせて実際に配置・反転状態を作る */
    _syncChapterState() {
      const saved = this._savedPlaced || [];
      // 機械側が完了していれば反転状態を先に作る
      const movementDone = this.chapterParts("movement").every((p) => saved.includes(p.id));
      if (movementDone && (this.activeChapter === "dial" || this.activeChapter === "case")) {
        this.movementInner.rotation.x = Math.PI;
        this.movementInner.position.y = -3;
        this.running = true;
      }
      if (this.activeChapter === "case") this.sceneMgr.orbitGoal.radius = 108;

      this.parts.forEach((p) => { if (saved.includes(p.id)) this._placeInstant(p); });
    }

    reset() {
      if (!confirm("組立の進捗をすべてリセットしますか?")) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      location.reload();
    }

    /* ------------------------------------------------------------
       汎用トゥイーン
       ------------------------------------------------------------ */
    _tween(t) { t.t = 0; this.tweens.push(t); }

    /* ------------------------------------------------------------
       毎フレーム更新
       ------------------------------------------------------------ */
    update(dt, elapsed) {
      // ターゲットリングの明滅
      if (this.ring.visible) {
        this.ring.material.opacity = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(elapsed * 3.4));
      }

      // スナップ配置
      for (let i = this.anims.length - 1; i >= 0; i--) {
        const a = this.anims[i];
        a.t += dt;
        const k = Math.min(a.t / a.dur, 1);
        const e = 1 - Math.pow(1 - k, 3);
        a.group.position.lerpVectors(a.from, a.to, e);
        if (k >= 1) { a.group.position.copy(a.to); this.anims.splice(i, 1); a.onDone && a.onDone(); }
      }

      // 汎用トゥイーン
      for (let i = this.tweens.length - 1; i >= 0; i--) {
        const tw = this.tweens[i];
        tw.t += dt;
        const k = Math.min(tw.t / tw.dur, 1);
        tw.onUpdate && tw.onUpdate(tw.ease ? tw.ease(k) : k);
        if (k >= 1) { this.tweens.splice(i, 1); tw.onDone && tw.onDone(); }
      }

      // 巻上げ演出(ローター高速回転)
      if (this.windT !== null) {
        this.windT += dt;
        const k = Math.min(this.windT / 2.4, 1);
        const spd = Math.sin(k * Math.PI) * 14;
        const rotor = this.groups.rotor;
        // ロータは慣性モデルで回す(ここでは直接回転させない)
        const rev = this.groups.reversingWheel;
        if (rev && this.placed.has("reversingWheel")) rev.rotation.y += spd * 0.6 * dt;
        const rw = this.groups.ratchetWheel;
        if (rw && this.placed.has("ratchetWheel")) rw.rotation.y += spd * 0.3 * dt;
        const red = this.groups.reductionWheel;
        if (red && this.placed.has("reductionWheel")) red.rotation.y += spd * 0.45 * dt;
        if (k >= 1) this._finishWinding();
      }

      // ローターの慣性回転: 摩擦で徐々に減速し、自然に静止する(永久回転・点滅なし)
      if (this.placed.has("rotor") && Math.abs(this.rotorVel) > 0.0005) {
        this.groups.rotor.rotation.y += this.rotorVel * dt;
        this.rotorVel *= Math.pow(0.5, dt * 1.05);
        if (Math.abs(this.rotorVel) < 0.02) this.rotorVel = 0;
      }

      // ムーブメント駆動
      if (this.running) { this.runT += dt; this._updateRunning(dt, this.runT); }

      // 時刻合わせ演出 / 現在時刻同期(針は _updateRunning の後に上書きする)
      if (this._calibrating) this._updateCalibration(dt);
      else if (this.timeSync) this._updateClock();

      // 完成シネマティック
      if (this.finalState) this._updateFinal(dt);
    }

    /**
     * 駆動アニメーション:
     * 香箱 → 二番 → 三番 → 四番 → ガンギ → アンクル → テンプ、
     * さらに配置済みなら 筒カナ/分車/時車/三針 も連動する。
     */
    _updateRunning(dt, t) {
      const beat = this.beatHz;
      // 完成演出でも高速回転させない。針は常に実時間比で進む。
      const handSpeed = 1;

      this.parts.forEach((part) => {
        const run = part.run;
        if (!run || run.type === "wind" || !this.placed.has(part.id)) return;
        const g = this.groups[part.id];
        if (!g) return;
        const local = t - (run.delay || 0);
        if (local <= 0) return;
        const ramp = Math.min(local / 1.2, 1);

        switch (run.type) {
          case "spin":
            g.rotation.y += run.speed * ramp * dt;
            break;
          case "rotor":
            // ロータは run ループでは駆動せず、下記の慣性モデルで回す(永久回転しない)
            break;
          case "balance": {
            const phase = local * beat * Math.PI * 2;
            g.rotation.y = g.userData.baseRotY + Math.sin(phase) * 2.5 * ramp;
            break;
          }
          case "pallet": {
            const phase = local * beat * Math.PI * 2;
            g.rotation.y = g.userData.baseRotY + Math.tanh(Math.sin(phase) * 4) * 0.14 * ramp;
            break;
          }
          case "escape": {
            const phase = local * beat * Math.PI * 2;
            const beats = Math.floor(phase / Math.PI);
            g.rotation.y = g.userData.baseRotY - beats * (Math.PI * 2 / part.params.teeth / 2);
            break;
          }
          case "hand": {
            // 完成後の現在時刻同期・時刻合わせ演出中は、針は専用処理(_updateClock/_updateCalibration)に委ねる
            if (this.timeSync || this._calibrating) break;
            // 針: hour=12時間/回転, minute=1時間/回転, seconds=1分/回転
            // 実時間比。秒針は 21,600振動(毎秒6ビート)に合わせ毎秒6ステップで進む。
            const period = run.hand === "hour" ? 43200 : run.hand === "minute" ? 3600 : 60;
            let sec = local * handSpeed;
            if (run.hand === "seconds") sec = Math.floor(sec * 6) / 6;
            const ang = sec / period * Math.PI * 2;
            g.rotation.y = g.userData.baseRotY - ang;
            break;
          }
        }
      });
    }
  }

  /* ---- イージング / 補間 ---- */
  function easeInOut(k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
  function easeOutCubic(k) { return 1 - Math.pow(1 - k, 3); }
  function lerp(a, b, k) { return a + (b - a) * k; }

  WatchSim.Assembly = Assembly;
})();
