/* ============================================================
   assembly.js — 組立ロジック (Cal.02 Automatic)
   3章構成: ムーブメント → 文字盤側 → ケーシング(裏蓋工程なし)
   章進行 / スナップ配置 / 学習・試験モード /
   注油ガイド(青い輪) / 180°反転 / 完成シネマティック /
   完成後メニュー / 鑑賞 / 明示的な状態管理 / 安全なリセット・復元
   ============================================================ */
(function () {
  "use strict";
  window.WatchSim = window.WatchSim || {};

  /* 進捗保存(バージョン付き)。旧バージョンのデータは破棄して安全に初期化する。 */
  const STORAGE_KEY = "watchsim.cal02.v4";
  const SAVE_VERSION = 4;                    // v4: 仕様(custom)・specChosenを保存。構造変更のため旧データは安全に初期化。
  const MODESELECT_KEY = "watchsim.pendingModeSelect.v4";

  /* アプリの明示的な状態。各状態で許可される操作を限定し、状態の混在を防ぐ。
     ASSEMBLING: 部品配置・工具操作 / OILING: 注油操作のみ /
     COMPLETED: 完成後メニュー / CINEMATIC: 入力停止 /
     VIEWING: 自由回転・表裏切替・拡大鑑賞 / RESETTING: 操作禁止 */
  const AppState = {
    START: "start", ASSEMBLING: "assembling", OILING: "oiling",
    COMPLETED: "completed", CINEMATIC: "cinematic", VIEWING: "viewing", RESETTING: "resetting"
  };
  WatchSim.AppState = AppState;

  /* 中間動作確認(工程の要所)。learning はガイド文、exam はガイドなし。
     完全な物理シミュレーションは不要。視覚的な連動確認と完了条件があればよい。 */
  const VERIFY = {
    trainBridge: {
      title: "輪列の連動確認", en: "Train Wheel Check", dur: 2.8,
      guide: "二番車を動かすと三番車・四番車・ガンギ車が連動して回ります。輪列が正しかみ合っている証拠です。",
      exam: "輪列が正しく連動するか確認します。",
      gears: { centerWheel: 0.5, thirdWheel: -1.0, fourthWheel: 1.6, escapeWheel: -4.2 }
    },
    palletBridge: {
      title: "アンクルの動作確認", en: "Pallet Fork Check", dur: 2.8,
      guide: "アンクルが左右に振れ、ガンギ車を一歯ずつ解放します。脱進機が成立しているか確認します。",
      exam: "アンクルとガンギ車の関係を確認します。",
      pallet: true
    },
    balanceCock: {
      title: "テンプの振動確認", en: "Balance Check", dur: 3.2,
      guide: "テンプが自然に左右へ往復振動すれば正常です。これが時間の基準になります。",
      exam: "テンプが振動するか確認します。",
      balance: true
    },
    secondsHand: {
      title: "針の干渉確認", en: "Hands Clearance Check", dur: 3.2,
      guide: "リューズ操作を模して時針・分針を回し、針同士・文字盤との干渉がないか確認します。",
      exam: "針の干渉がないか確認します。",
      hands: true
    },
    crown: {
      title: "巻上げ・時刻合わせの確認", en: "Winding & Setting Check", dur: 3.0,
      guide: "竜頭を回すとゼンマイが巻き上がり、引き出して回すと針を合わせられます（本教材では簡略化）。巻真＋竜頭が一つの操作ユニットとして働きます。",
      exam: "竜頭による巻上げ・引き出し・時刻合わせを確認します。",
      crown: true
    }
  };

  class Assembly {
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
      this.runT = 0;
      this.windT = null;
      this.rotorVel = 0;
      this.selectedTool = null;
      this.pendingOil = null;    // 注油待ちの部品id(nullなら無し)
      this.flipping = false;
      this.finalState = null;    // 完成シネマティックの状態
      this.busy = false;         // 演出中は操作を止める
      this.ctaAction = null;

      /* ---- 工程履歴スタック(一つ前へ戻る用) ----
         一工程完了ごとに1件 push し、「一つ前の工程へ戻る」で pop する。
         placed だけに頼らず、注油・完了フラグ・中間確認結果も工程単位で管理する。 */
      this.history = [];
      this.undoCount = 0;        // Exam Mode: やり直し回数を記録する
      this.pendingVerify = null; // 中間動作確認の待ち {partId, cfg}
      this.verifyAnim = null;    // 動作確認アニメーション
      this.specChosen = false;   // 組立前の仕様選択を済ませたか

      /* ---- 明示的な状態管理 ---- */
      this.appState = AppState.ASSEMBLING;
      this.completed = false;    // 完成済みか
      this.magnified = false;    // 拡大鑑賞中か

      /* ---- 一時タイマー(破棄時にクリア) ---- */
      this._timers = [];

      /* ---- カスタマイズ ---- */
      this.custom = Object.assign(
        { dial: "silver", dialIndex: "bar", handColor: "blued", handShape: "breguet", bezel: "polished", crown: "fluted" },
        this._restoreCustom()
      );

      /* ---- 時刻合わせ ---- */
      this.timeSync = false;
      this._calibrating = false;
      this._calibStarted = false;
      this._calib = null;
      this._onVisibility = () => { if (!document.hidden && this.timeSync) this._updateClock(); };
      document.addEventListener("visibilitychange", this._onVisibility);

      /* ---- watch / movementInner ---- */
      this.watch = new THREE.Group();
      this.movementInner = new THREE.Group();
      this.watch.add(this.movementInner);
      this.sceneMgr.scene.add(this.watch);

      this._buildTargetRing();
      this._buildOilRing();
      this._buildAxisGuide();

      /* ---- 完成後の解説ON / 鑑賞演出 ---- */
      this.explainOn = false;
      this.viewSide = "front";                  // 現在の鑑賞面(front=表側 / back=ムーブメント)
      this._explainTarget = null;              // {group, def, anchorLocal}
      this._hoverShownId = null;               // 現在表示中の部品ID
      this._hoverPendingId = undefined;        // 200ms待機中の部品ID
      this._hoverTimer = null;                 // 表示遅延タイマー
      this._hoverClearTimer = null;            // 消去猶予タイマー
      this._starT = 0; this._starNext = 12 + Math.random() * 14;
      /* 風防反射: カメラ/時計が動いているときだけ短く光らせる */
      this._camPrev = null; this._glintCool = 0;
    }

    /* ============================================================
       初期化
       ============================================================ */
    init() {
      const PF = WatchSim.PartFactory;

      this.parts.forEach((part) => {
        this._applyCustomParams(part);
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
      this.ui.onReset = () => this.restart();
      this.ui.onToolSelect = (t) => this.selectTool(t);
      this.ui.onFinalAction = (act) => this.finalAction(act);
      this.ui.onViewAction = (act) => this.viewAction(act);
      this.ui.onCompletedAction = (act) => this.completedAction(act);
      this.ui.onUndo = () => this.undoLast();
      this.sceneMgr.onPartClick((group, point) => this.handlePartClick(group.userData.partDef.id, point));
      this.sceneMgr.onOilClick((isHit) => this.handleOilClick(isHit));
      this.sceneMgr.onHover((g, point) => this._onExplainHover(g, point));
      this.sceneMgr.onTick((dt, t) => this.update(dt, t));

      this.ui.setMode(this.mode);
      this._syncChapterState();

      // ブラウザの戻る・進む(bfcache)で復帰した場合は、状態不整合を避けるため再読込する
      this._onPageShow = (e) => { if (e.persisted) location.reload(); };
      window.addEventListener("pageshow", this._onPageShow);
      this._onPageHide = () => this.destroy();
      window.addEventListener("pagehide", this._onPageHide);

      // 「モードを変えて最初から作る」からの復帰: モード選択画面を表示
      let pendingModeSelect = false;
      try { pendingModeSelect = localStorage.getItem(MODESELECT_KEY) === "1"; } catch (e) {}

      if (pendingModeSelect) {
        try { localStorage.removeItem(MODESELECT_KEY); } catch (e) {}
        this.busy = true;
        this.appState = AppState.START;
        this.ui.showModeSelect((mode) => {
          this.mode = (mode === "exam") ? "exam" : "learning";
          this.ui.setMode(this.mode);
          this._save();
          // モード選択→仕様選択→組立開始
          this._beginStart();
        });
        return;
      }

      if (this.completed) {
        this._enterCompletedRestore();
      } else if (!this.specChosen && this.placed.size === 0) {
        // 新しい開始フロー: 組立前に仕様を選ぶ
        this._beginStart();
      } else {
        this._refresh();
        this._maybeTutorial();
      }
    }

    /* 組立前の仕様選択 → 確定したら組立開始 */
    _beginStart() {
      this._openStartCustomizer(() => {
        this._refresh();
        this._maybeTutorial();
        this.ui.showMessage("Ready", "accent",
          "選んだ仕様で組み立てを始めます。地板から順に配置してください。", 2600);
      });
    }

    /* ---- 工具名 ---- */
    toolName(t) { return { driver: "ドライバー", tweezers: "ピンセット", oiler: "オイラー" }[t] || t; }
    toolUse(t) {
      return {
        driver: "ネジやブリッジの締め付けに使います。対象を選んで配置してください。",
        tweezers: "歯車・受け・小部品をつかんで配置します。カードをドラッグしてください。",
        oiler: "注油に使います。注油工程では、青く点滅している輪の中心をクリックして注油してください。"
      }[t] || "";
    }

    selectTool(tool) {
      if (this.appState !== AppState.ASSEMBLING && this.appState !== AppState.OILING) return;
      this.selectedTool = tool;
      this.ui.setSelectedTool(tool);
      if (this.pendingOil && tool === "oiler") {
        this.ui.setToolGuide("青く点滅している輪の中心をクリックして注油してください。");
      } else {
        this.ui.setToolGuide(this.toolUse(tool));
      }
    }

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

    get current() {
      return this.chapterParts(this.activeChapter).find((p) => !this.placed.has(p.id)) || null;
    }
    isChapterComplete(chId) {
      return this.chapterParts(chId).every((p) => this.placed.has(p.id));
    }
    get isAllComplete() { return this.placed.size >= this.total; }

    /* ============================================================
       次の配置位置リング(学習モード)
       ============================================================ */
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

    /* ============================================================
       注油ガイドの青い輪(落ち着いたパルス・強い発光にしない)
       正確な注油座標(oilPoint)にだけ重ね、注油完了後に消す。
       ============================================================ */
    _buildOilRing() {
      const g = new THREE.Group();
      // 外側の太めの輪(はっきりした青 — 正しい注油点だとすぐ分かる)
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.72, 1.0, 72),
        new THREE.MeshBasicMaterial({ color: 0x2f86ff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, depthTest: false })
      );
      ring.rotation.x = -Math.PI / 2;
      // 中心の小さな青点(注油位置の芯)
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.22, 28),
        new THREE.MeshBasicMaterial({ color: 0x5aa8ff, transparent: true, opacity: 1.0, side: THREE.DoubleSide, depthWrite: false, depthTest: false })
      );
      dot.rotation.x = -Math.PI / 2;
      g.add(ring, dot);
      g.renderOrder = 999;
      g.visible = false;
      this.oilRing = g;
      this.oilRingMesh = ring;
      this.sceneMgr.scene.add(g);
    }

    /* ============================================================
       巻真・ツヅミ車・キチ車 の軸挿入ガイド(巻真軸=X方向)
       円形の地面ガイドではなく、軸線・矢印・収まる位置のリングで
       「3時側から軸に沿って横から差し込む」ことを示す。
       ============================================================ */
    _buildAxisGuide() {
      const col = 0x6fb2ff;
      const g = new THREE.Group();
      // 巻真軸線(X方向へ伸びる細い光る棒。挿入レーンを示す)
      const axis = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.13, 24, 12),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, depthWrite: false, depthTest: false })
      );
      axis.rotation.z = Math.PI / 2;          // Y軸 → X軸
      axis.position.x = 11;                   // 座から+X（挿入レーン）側へ
      g.add(axis);
      // 収まる位置を示す縦リング（X軸に正対）
      const seat = new THREE.Mesh(
        new THREE.RingGeometry(1.7, 2.15, 44),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, depthTest: false })
      );
      seat.rotation.y = Math.PI / 2;          // 面をX軸へ
      g.add(seat);
      // 挿入方向の矢印（レーン上で -X へ向けて、座へ差し込む）
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.75, 1.7, 18),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false })
      );
      arrow.rotation.z = Math.PI / 2;         // 先端を -X へ
      arrow.position.x = 6;
      g.add(arrow);
      g.renderOrder = 998;
      g.visible = false;
      this.axisGuide = g;
      this.axisGuideSeat = seat;
      this.axisGuideArrow = arrow;
      this.sceneMgr.scene.add(g);
    }

    /** 巻真軸に沿って横から差し込む部品か(巻真・ツヅミ車・キチ車) */
    _isAxialInsert(part) {
      return !!part && (part.id === "stem" || part.id === "tsuzumiWheel" || part.id === "windingPinion");
    }

    _showAxisGuide(cur) {
      if (!this.axisGuide) return;
      this.axisGuide.position.set(cur.position[0], cur.position[1], cur.position[2]);
      this.axisGuide.visible = true;
    }
    _hideAxisGuide() { if (this.axisGuide) this.axisGuide.visible = false; }

    /** 現在の注油点(oilPoint)。専用座標を使い、部品の hitRadius は使わない。 */
    _currentOilPoint() {
      if (!this.pendingOil) return null;
      const op = this.parts.find((p) => p.id === this.pendingOil);
      return op && op.oilPoint ? op.oilPoint : null;
    }

    _updateRingTarget() {
      // 注油中は配置リングを消す(注油ガイドは _updateOilGuide が担当)
      if (this.pendingOil) { this.ring.visible = false; this._hideAxisGuide(); return; }
      const cur = this.current;
      if (!cur || this.mode !== "learning" || this.busy || this.appState !== AppState.ASSEMBLING) {
        this.ring.visible = false; this._hideAxisGuide(); return;
      }
      // 巻真・ツヅミ車・キチ車は円形の地面ガイドではなく軸挿入ガイドを出す
      if (this._isAxialInsert(cur)) {
        this.ring.visible = false;
        this._showAxisGuide(cur);
        return;
      }
      this._hideAxisGuide();
      const r = (cur.hitRadius || 5) * 1.1;
      this.ring.scale.set(r, r, 1);
      this.ring.position.set(cur.position[0], cur.position[1] + 0.6, cur.position[2]);
      this.ring.visible = true;
    }

    /** 注油ガイド(青い輪)の表示制御。初級のみ表示、上級は非表示。座標は共通。 */
    _updateOilGuide() {
      const op = this._currentOilPoint();
      const learn = this.mode === "learning";
      if (op && this.appState === AppState.OILING) {
        // クリック判定は常に oilPoint 座標で行う(初級・上級で正解位置は不変)
        const pos = new THREE.Vector3().fromArray(op.position);
        this.sceneMgr.setOilTarget(pos, op.hitRadius || 2);
        // 視覚ガイドの輪は初級モードのみ
        if (learn) {
          const r = op.hitRadius || 2;
          this.oilRing.scale.set(r, 1, r);
          this.oilRing.position.copy(pos);
          this.oilRing.visible = true;
        } else {
          this.oilRing.visible = false;
        }
      } else {
        this.sceneMgr.clearOilTarget();
        this.oilRing.visible = false;
      }
    }

    /* ============================================================
       UI 更新
       ============================================================ */
    _refresh() {
      if (this.completed) return;  // 完成後は完成用UIが担当
      const cur = this.current;
      const chInfo = this.chapterInfo(this.activeChapter);
      const chParts = this.chapterParts(this.activeChapter);
      const done = chParts.filter((p) => this.placed.has(p.id)).length;

      this.ui.setChapter(chInfo, done, chParts.length);
      this.ui.renderTray(chParts, this.placed);

      // 中間動作確認待ち: 次の部品へ進む前に「動作を確認する」を促す
      if (this.pendingVerify) {
        const vcfg = this.pendingVerify.cfg;
        this.ui.setGlowCard(null);
        this.ring.visible = false;
        this.oilRing.visible = false;
        if (this.mode === "learning") this.ui.showPartInfoText(vcfg.title, vcfg.en, vcfg.guide);
        else this.ui.setToolGuide(vcfg.exam);
        this.ui.setStepWithinChapter(null, null, null, this.total, vcfg.title);
        this.ui.setNextStep("動作確認：" + vcfg.title, "—", false);
        this.ui.setCTA("動作を確認する", () => this.runVerify());
        this.ui.setUndoAvailable(this.canUndo());
        this.ui.showRecustomize(false);
        this.sceneMgr.setClickTargets([...this.placed].map((id) => this.groups[id]));
        return;
      }

      if (cur) {
        this.ui.setStepWithinChapter(done + 1, chParts.length, cur.order, this.total);
        if (this.mode === "learning") {
          this.ui.showPartInfo(cur);
          this.ui.setActiveTool(cur.tool);
          if (!this.pendingOil) this.selectTool(cur.tool);
          this.ui.setGlowCard(cur.id);
        } else {
          this.ui.setGlowCard(null);
          this.ui.setToolGuide("工具を選択し、作業対象をクリックしてください。");
        }
        if (this.pendingOil) {
          this.ui.setActiveTool("oiler");
          this.ui.setToolGuide(this.mode === "learning"
            ? "『オイラー』を選び、青く点滅している輪の中心をクリックして注油してください。"
            : "『オイラー』を選び、正しい注油位置をクリックしてください。");
        }
        const oilNow = !!this.pendingOil;
        this.ui.setNextStep(
          oilNow ? "青く点滅している輪の中心をクリックして注油" : cur.name + "（" + cur.nameEn + "）を配置",
          oilNow ? "オイラー" : this.toolName(cur.tool),
          oilNow
        );
        this.ui.hideCTA();
      } else if (!this.busy) {
        this.ui.setNextStep("この章は完了です — 次の工程へ", "—", false);
        this._onChapterComplete(this.activeChapter);
      }
      this._updateRingTarget();
      this._updateOilGuide();
      this.ui.setUndoAvailable(this.canUndo());
      this.sceneMgr.setClickTargets([...this.placed].map((id) => this.groups[id]));
      // 仕様を確認・変更する導線。組立中(完成前)は常に開ける。取付済部品はロック表示。
      this.ui.showRecustomize(
        !this.busy && this.appState === AppState.ASSEMBLING && !this.pendingVerify && !this.pendingOil,
        () => this._openSpecReview()
      );
    }

    /** 後方互換: 仕様の確認・変更を開く */
    reopenCustomizer() { this._openSpecReview(); }

    /* ============================================================
       解説ON: 点＋L字線＋説明ボックス(完成後の鑑賞中のみ)
       ============================================================ */
    /** 現在の鑑賞面で解説対象になる部品グループを返す。
       表側は風防のみ / ムーブメント側は主要部品(movement章)。 */
    _explainTargetGroups() {
      let ids;
      if (this.viewSide === "front") {
        ids = this.parts.filter((p) => p.type === "crystal" || p.id === "crown").map((p) => p.id);
      } else {
        ids = this.chapterParts("movement").map((p) => p.id);
      }
      return ids.filter((id) => this.placed.has(id)).map((id) => this.groups[id]).filter(Boolean);
    }

    /** 解説点のローカルアンカーを決める。該当パーツの中心を指す。
       (中心は自転軸上にあるため、テンプ等が動いても点はぶれない) */
    _resolveAnchorLocal(group, def, intersectionPoint) {
      const box = new THREE.Box3().setFromObject(group);
      const c = box.getCenter(new THREE.Vector3());
      return group.worldToLocal(c);
    }

    /** 現在の解説対象を設定し、説明ボックスの内容を更新する。同時表示は常に1部品。 */
    _setExplainTarget(group, def, intersectionPoint) {
      const anchorLocal = this._resolveAnchorLocal(group, def, intersectionPoint);
      this._explainTarget = { group, def, anchorLocal };
      this._hoverShownId = def.id;
      this.ui.setCalloutContent(def);
      this.ui.showExplainHint(false);
      this._updateCalloutPos();
    }

    _clearExplainTarget() {
      this._explainTarget = null;
      this._hoverShownId = null;
      this.ui.hideCallout();
      if (this.explainOn) this.ui.showExplainHint(true);
    }

    /** 対象部品の画面位置を求め、点・L字線・ボックス位置を更新(毎フレーム)。
       回転・拡大してもアンカーを再計算して追従する。 */
    _updateCalloutPos() {
      const t = this._explainTarget;
      if (!t) return;
      // 部品自体の回転(テンプの振動・歯車の回転など)でアンカーが毎フレーム揺れて
      // ボックスがぶるぶる動くのを防ぐため、アンカー計算のときだけ自転を基準姿勢
      // (baseRotY)へ一時的に戻して安定した位置を求める。時計全体の反転・ドラッグ・
      // ズームには従来どおり追従する。
      const g = t.group;
      const savedRotY = g.rotation.y;
      const baseRotY = (g.userData && g.userData.baseRotY) || 0;
      let worldPos;
      if (savedRotY !== baseRotY) {
        g.rotation.y = baseRotY;
        g.updateWorldMatrix(true, false);
        worldPos = g.localToWorld(t.anchorLocal.clone());
        g.rotation.y = savedRotY;
        g.updateWorldMatrix(true, false);
      } else {
        worldPos = g.localToWorld(t.anchorLocal.clone());
      }
      const s = this.sceneMgr.worldToScreen(worldPos);
      const W = window.innerWidth, H = window.innerHeight;
      const dot = { x: s.x, y: s.y };
      const sz = this.ui.calloutBoxSize();
      const margin = 24;
      // 説明枠は時計の外(画面端の余白)へ固定する。部品が右寄りなら右端、左寄りなら左端。
      const toRight = s.x >= W * 0.5;
      const bx = toRight ? (W - sz.w - margin) : margin;
      let by = s.y - sz.h * 0.5;
      by = Math.max(70, Math.min(H - sz.h - 12, by));
      // 線は点 → ボックスの内側の辺の中央へ(細い直線)
      const line2 = { x: toRight ? bx : bx + sz.w, y: Math.max(by + 18, Math.min(by + sz.h - 18, s.y)) };
      this.ui.positionCallout(dot, { x: bx, y: by }, line2);
    }

    /** 解説ON/OFF 切替(鑑賞中のみ。拡大鑑賞中も使える) */
    toggleExplain() {
      if (this.appState !== AppState.VIEWING) return;
      this.explainOn = !this.explainOn;
      this.ui.setExplainButton(this.explainOn);
      this._cancelHoverTimers();
      if (this.explainOn) {
        const groups = this._explainTargetGroups();
        this.sceneMgr.setHoverTargets(groups);
        this.sceneMgr.setClickTargets(groups);
        this.sceneMgr.enableHover(true);
        this.ui.showExplainHint(true);
        this.ui.hideCallout();
        this._explainTarget = null; this._hoverShownId = null; this._hoverPendingId = undefined;
      } else {
        this.sceneMgr.enableHover(false);
        this.sceneMgr.setClickTargets([]);
        this.ui.showExplainHint(false);
        this.ui.hideCallout();
        this._explainTarget = null; this._hoverShownId = null; this._hoverPendingId = undefined;
      }
    }

    /** 鑑賞面を切り替えたときに解説対象を再計算する(解説ONのときのみ) */
    _refreshExplainTargets() {
      if (!this.explainOn) return;
      this._cancelHoverTimers();
      const groups = this._explainTargetGroups();
      this.sceneMgr.setHoverTargets(groups);
      this.sceneMgr.setClickTargets(groups);
      this._explainTarget = null; this._hoverShownId = null; this._hoverPendingId = undefined;
      this.ui.hideCallout();
      this.ui.showExplainHint(true);
    }

    _cancelHoverTimers() {
      if (this._hoverTimer) { clearTimeout(this._hoverTimer); this._hoverTimer = null; }
      if (this._hoverClearTimer) { clearTimeout(this._hoverClearTimer); this._hoverClearTimer = null; }
      this._hoverPendingId = undefined;
    }

    /** ホバー(PC): 0.2秒その部品に留まったときだけ解説を表示する。同じ部品内の微動ではリセットしない。 */
    _onExplainHover(group, point) {
      if (!this.explainOn || this.appState !== AppState.VIEWING) return;
      const def = group && group.userData && group.userData.partDef;
      const id = def && this.placed.has(def.id) ? def.id : null;

      // すでに表示中の部品の上: 何もしない(点は固定、タイマーはリセットしない)
      if (id && id === this._hoverShownId) {
        if (this._hoverClearTimer) { clearTimeout(this._hoverClearTimer); this._hoverClearTimer = null; }
        this._cancelPendingTimer();
        return;
      }
      if (id === null) {
        // 部品から外れた: 待機中タイマーを破棄、表示中なら短い猶予を設けて消す(チラつき防止)
        this._cancelPendingTimer();
        if (this._hoverShownId && !this._hoverClearTimer) {
          this._hoverClearTimer = setTimeout(() => {
            this._hoverClearTimer = null;
            this._clearExplainTarget();
          }, 260);
        }
        return;
      }
      // 別の部品へ: 新しい200msタイマーを開始(既存待機と同じなら何もしない)
      if (this._hoverClearTimer) { clearTimeout(this._hoverClearTimer); this._hoverClearTimer = null; }
      if (id !== this._hoverPendingId) {
        this._cancelPendingTimer();
        this._hoverPendingId = id;
        const g = this.groups[id];
        const pt = point ? point.clone() : null;
        this._hoverTimer = setTimeout(() => {
          this._hoverTimer = null; this._hoverPendingId = undefined;
          if (this.explainOn && this.appState === AppState.VIEWING && this.placed.has(id)) {
            this._setExplainTarget(g, def, pt);
          }
        }, 200);
      }
    }
    _cancelPendingTimer() {
      if (this._hoverTimer) { clearTimeout(this._hoverTimer); this._hoverTimer = null; }
      this._hoverPendingId = undefined;
    }

    /* ============================================================
       クリック: 注油・部品情報
       ============================================================ */
    handlePartClick(partId, point) {
      // 鑑賞中 + 解説ON: タップ/クリックで部品解説を表示(タッチ端末対応。同時は1部品だけ)
      if (this.appState === AppState.VIEWING) {
        if (this.explainOn) {
          const part = this.parts.find((p) => p.id === partId);
          const g = this.groups[partId];
          // 解説対象外(例: 表側で風防以外)は反応させない
          const allowed = this._explainTargetGroups().includes(g);
          if (part && g && allowed) {
            this._cancelHoverTimers();
            this._setExplainTarget(g, part, point || null);
          }
        }
        return;
      }
      // 注油中は注油クリック(handleOilClick)が座標で判定するため、部品クリックは情報表示のみ
      if (this.appState === AppState.OILING) return;
      if (this.appState !== AppState.ASSEMBLING) return;
      this.inspectPart(partId);
    }

    /** 注油クリック: oilPoint 座標に対する当たり判定の結果を受ける */
    handleOilClick(isHit) {
      if (this.appState !== AppState.OILING || !this.pendingOil) return;
      if (this.selectedTool !== "oiler") {
        this.ui.showMessage("Wrong Tool", "error", "注油には『オイラー』を使います。右の工具から選んでください。", 2400);
        return;
      }
      if (!isHit) {
        this.ui.showMessage("Off Target", "error",
          this.mode === "learning"
            ? "青く点滅している輪の中心をねらってクリックしてください。"
            : "注油位置が違います。軸受(ルビー)の中心を正確にねらってください。", 2400);
        return;
      }
      const part = this.parts.find((p) => p.id === this.pendingOil);
      this.pendingOil = null;
      this.appState = AppState.ASSEMBLING;
      // 直前の工程履歴に注油完了を記録
      const _rec = this.history[this.history.length - 1];
      if (_rec && part && _rec.stepId === part.id) _rec.verificationState = "oiled";
      this.oilRing.visible = false;
      this.sceneMgr.clearOilTarget();
      document.body.classList.remove("oiling");
      this.ui.showMessage("Oiling Complete", "ok", (part ? part.name : "") + "の軸受に適量を注油しました。", 1400);
      this._addTimer(setTimeout(() => this._maybeVerify(part), 900));
    }

    inspectPart(partId) {
      if (this.mode === "exam") return;
      const part = this.parts.find((p) => p.id === partId);
      if (part) this.ui.showPartInfo(part);
    }

    /* ============================================================
       一つ前の工程へ戻る(履歴スタックを pop)
       ・最後に完了した工程だけを戻せる(飛び越し・下層の先取りは不可)
       ・完成後は使用不可 縡 「最初から作る」を使う
       ============================================================ */
    canUndo() {
      // running(ムーブメント駆動)は第2・3章中も継続するため戻る可否の判定には使わない。
      return (this.appState === AppState.ASSEMBLING || this.appState === AppState.OILING)
        && !this.busy && !this.completed && this.history.length > 0;
    }

    _isFirstOfChapter(part) {
      const chParts = this.chapterParts(part.chapter);
      let first = chParts[0];
      chParts.forEach((p) => { if (p.order < first.order) first = p; });
      return first.id === part.id;
    }

    undoLast() {
      if (!this.canUndo()) return;
      const rec = this.history[this.history.length - 1];
      const part = this.parts.find((p) => p.id === rec.stepId);
      if (!part) { this.history.pop(); this._save(); this._refresh(); return; }

      // 章をまたぐ戻り(前章へ) は専用処理で安全に巻き戻す
      if (this._isFirstOfChapter(part)) { this._undoAcrossChapter(part); return; }

      // 確認アラートは出さず即座に一工程戻す(短い通知のみ)
      this.history.pop();
      if (this.mode === "exam") this.undoCount++;
      this.pendingVerify = null; this.verifyAnim = null;

      // 注油待ちだった部品を戻す場合は注油状態も解除
      if (this.pendingOil === part.id) {
        this.pendingOil = null;
        this.appState = AppState.ASSEMBLING;
        this.oilRing.visible = false;
        this.sceneMgr.clearOilTarget();
        document.body.classList.remove("oiling");
      }

      this.placed.delete(part.id);
      // ムーブメント部品を戻したら「騆動中の完成ムーブメント」ではなくなるので騆動を止める
      if (part.chapter === "movement" && this.running) { this.running = false; this.windT = null; }
      this.busy = true;
      this.ring.visible = false;
      this.ui.setUndoAvailable(false);

      const g = this.groups[part.id];
      if (g && g.parent) {
        const from = g.position.clone();
        const to = from.clone(); to.y += 16;   // 逆方向へ持ち上げてから取り外す
        this.anims.push({
          group: g, from, to, t: 0, dur: 0.45,
          onDone: () => {
            if (g.parent) g.parent.remove(g);
            this.busy = false;
            this._save();
            this._refresh();
            const extra = this.mode === "exam" ? "（やり直し回数 " + this.undoCount + "）" : "";
            this.ui.showMessage("Reverted", "accent", part.name + " を取り外し、トレイへ戻しました。" + extra, 1800);
          }
        });
      } else {
        this.busy = false;
        this._save();
        this._refresh();
      }
    }

    /* ============================================================
       中間動作確認(輪列・アンクル・テンプ・針干渉)
       ============================================================ */
    _maybeVerify(part) {
      const cfg = VERIFY[part.id];
      if (cfg) {
        this.pendingVerify = { partId: part.id, cfg };
        this.appState = AppState.ASSEMBLING;
      }
      this._refresh();
    }

    runVerify() {
      if (this.busy || !this.pendingVerify) return;
      const cfg = this.pendingVerify.cfg;
      this.busy = true;
      this.ui.hideCTA();
      this.ui.setUndoAvailable(false);
      this.ui.showMessage(cfg.title, "accent",
        this.mode === "learning" ? cfg.guide : cfg.exam, 2200, { persistent: true });
      this.verifyAnim = { t: 0, dur: cfg.dur || 2.8, cfg };
    }

    _updateVerify(dt) {
      const v = this.verifyAnim;
      v.t += dt;
      const k = Math.min(v.t / v.dur, 1);
      const ramp = Math.sin(Math.min(k * 2.2, 1) * Math.PI / 2) * Math.min((1 - k) * 3, 1);
      const c = v.cfg;
      if (c.gears) {
        Object.keys(c.gears).forEach((id) => {
          const g = this.groups[id];
          if (g && this.placed.has(id)) g.rotation.y += c.gears[id] * ramp * dt;
        });
      }
      if (c.pallet) {
        const pg = this.groups.pallet;
        if (pg) pg.rotation.y = (pg.userData.baseRotY || 0) + Math.tanh(Math.sin(v.t * this.beatHz * Math.PI * 2) * 4) * 0.14;
        const eg = this.groups.escapeWheel;
        if (eg) eg.rotation.y -= 3.4 * ramp * dt;
      }
      if (c.balance) {
        const bg = this.groups.balance;
        if (bg) bg.rotation.y = (bg.userData.baseRotY || 0) + Math.sin(v.t * this.beatHz * Math.PI * 2) * 2.4;
      }
      if (c.hands) {
        const hh = this.groups.hourHand, mh = this.groups.minuteHand;
        if (hh) hh.rotation.y += 0.5 * ramp * dt;
        if (mh) mh.rotation.y += 6.0 * ramp * dt;
      }
      if (c.crown) {
        // 竜頭は巻真軸(X方向)まわりに回す。定位置のまま自転させ、位置はずらさない。
        const cr = this.groups.crown; if (cr) cr.rotation.x += 2.4 * ramp * dt;
        // 巻真軸上の小歯車(キチ車・ツヅミ車)も X まわり
        ["windingPinion", "tsuzumiWheel"].forEach((id) => {
          const g = this.groups[id]; if (g && this.placed.has(id)) g.rotation.x += 1.6 * ramp * dt;
        });
        // 平歯車(角穴車・丸穴車)は従来通り Y まわり
        ["ratchetWheel", "crownWheel"].forEach((id) => {
          const g = this.groups[id]; if (g && this.placed.has(id)) g.rotation.y += 1.6 * ramp * dt;
        });
      }
      if (k >= 1) this._finishVerify();
    }

    _finishVerify() {
      this.verifyAnim = null;
      const rec = this.history[this.history.length - 1];
      if (rec) rec.verificationState = "passed";
      this.pendingVerify = null;
      this.busy = false;
      this._save();
      this.ui.showMessage("Check Passed", "ok", "連動を確認しました。メッセージを閉じると次の工程へ進みます。", 1600, { persistent: true });
      this._addTimer(setTimeout(() => this._refresh(), 400));
    }

    /* 章をまたぐ戻り: 前章へ安全に巻き戻す(反転・巻上げも復元) */
    _undoAcrossChapter(part) {
      const prevChapter = part.chapter === "dial" ? "movement" : part.chapter === "case" ? "dial" : null;
      if (!prevChapter) {
        this.ui.showMessage("最初の工程です", "accent", "地板より前の工程はありません。", 2200);
        return;
      }
      const prevInfo = this.chapterInfo(prevChapter);
      const prevName = prevInfo ? prevInfo.title.trim() : prevChapter;
      // 章をまたぐ場合も確認アラートは出さず即座に戻す

      this.history.pop();
      if (this.mode === "exam") this.undoCount++;
      this.pendingVerify = null; this.verifyAnim = null;
      if (this.pendingOil === part.id) {
        this.pendingOil = null; this.oilRing.visible = false;
        this.sceneMgr.clearOilTarget(); document.body.classList.remove("oiling");
      }
      this.appState = AppState.ASSEMBLING;

      // 部品を取り外す(重複生成しないよう parent から確実に除去)
      this.placed.delete(part.id);
      const g = this.groups[part.id];
      if (g && g.parent) g.parent.remove(g);

      const cam = this.sceneMgr;
      if (prevChapter === "movement") {
        this.activeChapter = "movement";
        this.running = false; this.runT = 0; this.windT = null;
        this.movementInner.rotation.x = 0;
        this.movementInner.position.y = 0;
        this.watch.rotation.x = 0;
        cam.orbitGoal.phi = 0.6; cam.orbitGoal.theta = 0.1; cam.orbitGoal.radius = 96;
        this.ui.showCinematic("ムーブメント側へ戻します");
        this._addTimer(setTimeout(() => this.ui.hideCinematic(), 1500));
      } else {
        this.activeChapter = "dial";
        cam.orbitGoal.radius = 96;
      }
      this.busy = false;
      this._save();
      this._refresh();
      this.ui.showMessage("前の章へ戻りました", "accent",
        part.name + " を取り外し、「" + prevName + "」へ戻りました。", 2600);
    }

    /* ============================================================
       ドロップ処理
       ============================================================ */
    handleDrop(partId, clientX, clientY) {
      if (this.busy || this.appState !== AppState.ASSEMBLING) return;
      const cur = this.current;
      if (!cur) return;
      const dropped = this.parts.find((p) => p.id === partId);

      if (this.pendingOil) {
        const op = this.parts.find((p) => p.id === this.pendingOil);
        this.ui.showMessage("Oiling Required", "error",
          "先に注油を完了してください。オイラーを選び、" + (op ? op.name : "注油点") + "の青い輪をクリックします。", 2600);
        return;
      }

      if (this.pendingVerify) {
        this.ui.showMessage("動作確認が必要です", "error",
          "先に「動作を確認する」を押して、動きを確認してください。", 2400);
        return;
      }

      if (partId !== cur.id) {
        const why = dropped && this.placed.has(partId)
          ? dropped.name + " は既に取り付け済みです。"
          : "いま必要なのは「" + cur.name + "(" + cur.nameEn + ")」です。" +
            (dropped ? dropped.name + "はこの後の工程で使います。" : "");
        this.ui.showMessage("Incorrect Component", "error", why, 2600);
        return;
      }

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

      const world = this.sceneMgr.screenToPlane(clientX, clientY, cur.position[1]);
      if (!world) return;

      if (this._isAxialInsert(cur)) {
        // 巻真軸挿入: 単純な円内ドロップではなく、「3時側の挿入レーン上・軸線に合っているか」で判定する。
        const dz = Math.abs(world.z - cur.position[2]);          // 軸線からのずれ
        const dxFromSeat = world.x - cur.position[0];            // >0 = 3時(+X)側
        if (dz > 5 || dxFromSeat < -2.5 || dxFromSeat > 24) {
          this.ui.showMessage("Insert From the Side", "error",
            cur.name + "は上から置くのではなく、3時方向の挿入口から巻真の軸に沿って、右(3時)側からまっすぐ差し込んでください。", 3000);
          return;
        }
        this._placePart(cur, world);
        return;
      }

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

    _parentFor(part) {
      // 竜頭はケース(表面)側の部品。ムーブメント反転の影響を受けないよう watch に付ける。
      if (part.id === "crown") return this.watch;
      return part.chapter === "movement" ? this.movementInner : this.watch;
    }

    _placePart(part, dropWorld) {
      const group = this.groups[part.id];
      const parent = this._parentFor(part);
      parent.updateMatrixWorld(true);

      const isInsert = this._isAxialInsert(part);
      const worldTo = new THREE.Vector3().fromArray(part.position);
      // 巻真軸挿入は 3時(+X)側から水平にスライドさせて入れる(上から降ろさない)。
      const worldFrom = isInsert
        ? worldTo.clone().add(new THREE.Vector3(20, 0, 0))
        : (dropWorld
            ? new THREE.Vector3(dropWorld.x, part.position[1] + 16, dropWorld.z)
            : worldTo.clone().setY(part.position[1] + 16));

      const localTo = parent.worldToLocal(worldTo.clone());
      const localFrom = parent.worldToLocal(worldFrom.clone());
      group.position.copy(localFrom);
      group.rotation.y = part.rotationY || 0;
      parent.add(group);

      this.anims.push({
        group, from: localFrom, to: localTo, t: 0, dur: isInsert ? 0.85 : 0.55,
        onDone: () => {
          if (isInsert) {
            this.ui.showMessage("Seated", "ok",
              part.name + " — 軸に沿ってカチッと収まりました。", 1400);
          } else {
            this.ui.showMessage("Assembly Complete", "ok", part.name + " — " + part.nameEn, 1000);
          }
          if (part.oil) {
            this.pendingOil = part.id;
            this.appState = AppState.OILING;
            document.body.classList.add("oiling");
            this._addTimer(setTimeout(() => {
              this.ui.showMessage("Oiling Required", "accent",
                "『オイラー』を選び、" + (this.mode === "learning"
                  ? "青く点滅している輪の中心をクリックして注油します。"
                  : "正しい注油位置をクリックして注油します。"), 3000);
              this._refresh();
            }, 1050));
          } else {
            this._maybeVerify(part);
          }
        }
      });

      this.placed.add(part.id);
      this.ui.markPlaced(part.id);
      // 工程履歴へ push(注油待ちの場合も即座に記録。注油完了は handleOilClick で更新)
      this.history.push({
        stepId: part.id, chapter: part.chapter,
        action: part.oil ? "placeAndOil" : "place",
        partIds: [part.id], screwIds: [], oil: !!part.oil, verificationState: null
      });
      this._save();
      this.ring.visible = false;
    }

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

    /* ============================================================
       章完了 → 次のアクション
       ============================================================ */
    _onChapterComplete(chId) {
      if (chId === "movement") {
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

    /* ============================================================
       第1章: 動作確認
       ============================================================ */
    startWinding() {
      if (this.busy || this.running) return;
      this.busy = true;
      this.ui.hideCTA();
      this.ui.setUndoAvailable(false);
      this.windT = 0;
      this.rotorVel = 12;
      this.ui.showMessage("Automatic Winding", "accent", "ローターが回転しゼンマイを巻き上げます", 2000);
    }

    _finishWinding() {
      this.windT = null;
      this.running = true;
      this.runT = 0;
      this.busy = false;
      this._save();
      this.ui.showMessage("Movement Running", "ok", "毎時21,600振動 — 3Hz", 2200);
      this._addTimer(setTimeout(() => this._refresh(), 2400));
    }

    /* ============================================================
       第1章→第2章: 180°反転
       ============================================================ */
    flipToDial() {
      if (this.busy) return;
      this.busy = true;
      this.flipping = true;
      this.appState = AppState.CINEMATIC;
      this.ui.hideCTA();
      this.ui.setUndoAvailable(false);
      this.ui.showCinematic("ムーブメントを反転します");
      this._flipCapSwapped = false;

      const cam = this.sceneMgr;
      const startTheta = cam.orbitGoal.theta;
      const startRad = cam.orbitGoal.radius;
      cam.orbitGoal.radius = startRad * 1.18;
      cam.orbitGoal.phi = 0.62;

      this._tween({
        dur: 3.0, ease: easeInOut,
        onUpdate: (k) => {
          this.movementInner.rotation.x = Math.PI * k;
          this.movementInner.position.y = -3 * k;
          cam.orbitGoal.theta = startTheta + Math.PI * 0.5 * k;
          if (k > 0.5 && !this._flipCapSwapped) {
            this._flipCapSwapped = true;
            this.ui.showCinematic("文字盤側を上にします");
          }
        },
        onDone: () => {
          this.movementInner.rotation.x = Math.PI;
          this.movementInner.position.y = -3;
          cam.orbitGoal.phi = 0.9;
          cam.orbitGoal.radius = startRad;
          this.flipping = false;
          this.activeChapter = "dial";
          this.appState = AppState.ASSEMBLING;
          this.busy = false;
          this._save();
          this.ui.hideCinematic();
          this.ui.showMessage("Dial-Side Assembly", "accent", "第2章 — 文字盤側の組立を始めます", 2200);
          this._addTimer(setTimeout(() => this._refresh(), 400));
        }
      });
    }

    /* ============================================================
       第2章→第3章: ケーシング
       ============================================================ */
    startCase() {
      if (this.busy) return;
      this.busy = true;
      this.appState = AppState.CINEMATIC;
      this.ui.hideCTA();
      this.ui.setUndoAvailable(false);
      this.ui.showRecustomize(false);       // 選び直す導線を確実に閉じる
      const cam = this.sceneMgr;
      this._tween({
        dur: 1.4, ease: easeInOut,
        onUpdate: (k) => { cam.orbitGoal.radius = lerp(cam.orbit.radius, 108, k * 0.5 + 0.5); },
        onDone: () => {
          cam.orbitGoal.radius = 108;
          this.activeChapter = "case";
          this.appState = AppState.ASSEMBLING;
          this.busy = false;
          this._save();
          this.ui.showMessage("Casing", "accent", "第3章 — ケーシング(外装組立)", 2200);
          this._addTimer(setTimeout(() => this._refresh(), 400));
        }
      });
    }

    /* ============================================================
       完成シネマティック
       ============================================================ */
    runFinalCinematic() {
      if (this.busy) return;
      this.busy = true;
      this.running = true;
      this.appState = AppState.CINEMATIC;
      this.ui.hideCTA();
      this.ui.enterCinemaMode();
      this.sceneMgr.setCinemaBackground();

      const cam = this.sceneMgr;
      cam.orbitGoal.phi = 0.72;
      cam.orbitGoal.radius = 120;
      cam.orbitGoal.theta = -0.4;

      this.finalState = { t: 0, phase: 0, captionShown: false, streaks: 0 };
    }

    /* ============================================================
       完成後メニュー(5項目)
       1 時計を鑑賞する / 2 ムーブメントを見る /
       3 最初から作る / 4 モードを変えて最初から作る /
       5 メインメニューへ戻る(=組立画面へ戻る)
       ============================================================ */
    finalAction(act) {
      if (act === "restart") { this.restart(); return; }
      if (act === "changeMode") { this.changeMode(); return; }

      // 自動シーケンスを止める
      this.finalState = null;

      if (act === "view") {
        this._beginViewing("front");
      } else if (act === "movement") {
        this._beginViewing("back");
      }
    }

    /* 完成後メニューへ直接戻る共通処理。
       時計鑑賞・ムーブメント鑑賞の両方から同じ挙動で呼べる。 */
    _returnToFinalMenu() {
      // 1 解説表示をOFF
      this.explainOn = false;
      this._cancelHoverTimers();
      this.sceneMgr.enableHover(false);
      this.sceneMgr.setClickTargets([]);
      this.ui.setExplainButton(false);
      this.ui.showExplainHint(false);
      // 2 表示中の説明ボックス・点・L字線・ハイライトを消す
      this.ui.hideCallout();
      this._explainTarget = null; this._hoverShownId = null; this._hoverPendingId = undefined;
      // 3 拡大鑑賞状態を解除
      this.magnified = false;
      this.ui.setZoomLabel(false);
      // 4 時計を完成時の基準位置・基準倍率へ
      this.finalState = null;
      this.busy = false;
      this.appState = AppState.COMPLETED;
      this.watch.rotation.x = 0;
      this.ui.hideViewControls();
      this.ui.hideCompletedControls();
      this.ui.showRecustomize(false);
      this.sceneMgr.setCinemaBackground();
      this._setFinalCamera();
      // 5 完成後メニューを再表示
      this.ui.showFinalMenu(this.data.caliber || "Cal.02 Automatic");
    }

    /* 完成後のコントロール(互換用: 現在は未使用だがボタンが残っても安全に動く) */
    completedAction(act) {
      if (act === "restart") { this.restart(); return; }
      if (act === "view") { this._beginViewing("front"); return; }
      if (act === "movement") { this._beginViewing("back"); return; }
      if (act === "postmenu") { this._returnToFinalMenu(); }
    }

    /* 鑑賞モード開始(表側 / 裏側) */
    _beginViewing(side) {
      this.appState = AppState.VIEWING;
      this.magnified = false;
      this.finalState = null;
      this.viewSide = (side === "back") ? "back" : "front";
      // 解説ONは鑑賞ごとにリセットしておく
      this.explainOn = false;
      this._cancelHoverTimers();
      this.ui.setExplainButton(false);
      this.ui.showExplainHint(false);
      this.ui.hideCallout();
      this.ui.setZoomLabel(false);
      this.sceneMgr.enableHover(false);
      this._explainTarget = null; this._hoverShownId = null; this._hoverPendingId = undefined;
      const cam = this.sceneMgr;
      this.ui.enterCinemaMode();            // 通常UIは隠す
      this.ui.hideFinalCaption();
      this.ui.hideCompletedControls();
      this.sceneMgr.setCinemaBackground();
      cam.target.set(0, 3, 0);
      if (this.viewSide === "front") {
        this.watch.rotation.x = 0;
        cam.orbitGoal.phi = 0.5; cam.orbitGoal.theta = 0.06; cam.orbitGoal.radius = this._fitRadius();
      } else {
        this.watch.rotation.x = Math.PI;
        cam.orbitGoal.phi = 0.62; cam.orbitGoal.theta = 0.35; cam.orbitGoal.radius = this._fitRadius() + 6;
      }
      this.ui.showViewControls();
    }

    /* 鑑賞ツールバーのボタン(表/裏/拡大/解説/完成後メニューを再表示) */
    viewAction(act) {
      const cam = this.sceneMgr;
      if (act === "front") {
        this.viewSide = "front";
        this.watch.rotation.x = 0;
        cam.orbitGoal.phi = 0.5; cam.orbitGoal.theta = 0.06;
        cam.orbitGoal.radius = this.magnified ? this._fitRadius() * 0.62 : this._fitRadius();
        this._refreshExplainTargets();
      } else if (act === "back") {
        this.viewSide = "back";
        this.watch.rotation.x = Math.PI;
        cam.orbitGoal.phi = 0.62; cam.orbitGoal.theta = 0.35;
        cam.orbitGoal.radius = (this.magnified ? this._fitRadius() * 0.62 : this._fitRadius()) + 6;
        this._refreshExplainTargets();
      } else if (act === "zoom") {
        this.magnified = !this.magnified;
        const base = this._fitRadius();
        // 画面外へ消えないよう範囲を制限。解説は拡大中もそのまま使える。
        cam.orbitGoal.radius = this.magnified ? Math.max(42, base * 0.6) : base;
        this.ui.setZoomLabel(this.magnified);
      } else if (act === "explain") {
        this.toggleExplain();
      } else if (act === "menu") {
        this._returnToFinalMenu();
      }
    }

    _updateFinal(dt) {
      const fs = this.finalState;
      fs.t += dt;
      const t = fs.t;
      const w = this.watch;

      if (fs.phase === 0) {
        w.rotation.x = Math.PI;
        w.rotation.y = 0;
        if (t < 0.1 && !fs.pushed) { this.rotorVel = 2.2; fs.pushed = true; }
        if (t > 3.6) { fs.phase = 1; fs.flipStart = t; }
      } else if (fs.phase === 1) {
        const k = easeInOut(Math.min((t - fs.flipStart) / 2.4, 1));
        w.rotation.x = Math.PI * (1 - k);
        if (k >= 1) {
          w.rotation.x = 0; w.rotation.y = 0; fs.phase = 2;
          this._setFinalCamera();
          this.startTimeCalibration();
        }
      }
    }

    /* ============================================================
       完成後: 時刻合わせ演出 → 端末時刻へ同期
       ============================================================ */
    _currentHandAngles(offsetSec) {
      const now = new Date(Date.now() + (offsetSec || 0) * 1000);
      let s = now.getSeconds() + now.getMilliseconds() / 1000;
      s = Math.floor(s * 6) / 6;
      const m = now.getMinutes() + now.getSeconds() / 60;
      const h = (now.getHours() % 12) + now.getMinutes() / 60;
      return {
        seconds: (s / 60) * Math.PI * 2,
        minute: (m / 60) * Math.PI * 2,
        hour: (h / 12) * Math.PI * 2
      };
    }

    _handRotY(baseRotY, theta) { return WatchSim.HAND.rotY(baseRotY, theta); }

    startTimeCalibration() {
      if (this._calibStarted) return;
      this._calibStarted = true;
      this._calibrating = true;
      const dur = 3.6;
      const ang = this._currentHandAngles(dur);
      const mk = (id, targetAng, turns) => {
        const g = this.groups[id];
        if (!g) return null;
        const base = g.userData.baseRotY || 0;
        const targetRotY = this._handRotY(base, targetAng);
        const startRotY = targetRotY - turns * Math.PI * 2;
        g.rotation.y = startRotY;
        return { g, startRotY, targetRotY };
      };
      this._calib = {
        t: 0, dur,
        hands: [
          mk("secondsHand", ang.seconds, 8),
          mk("minuteHand", ang.minute, 3),
          mk("hourHand", ang.hour, 1)
        ].filter(Boolean)
      };
    }

    _updateCalibration(dt) {
      const c = this._calib;
      if (!c) { this._calibrating = false; return; }
      c.t += dt;
      const k = easeOutCubic(Math.min(c.t / c.dur, 1));
      c.hands.forEach((h) => {
        h.g.rotation.y = h.startRotY + (h.targetRotY - h.startRotY) * k;
      });
      if (c.t >= c.dur) {
        this._calibrating = false;
        this.timeSync = true;
        this._calib = null;
        this._updateClock();
        // 完成が確定 — 状態を保存
        this.completed = true;
        this.appState = AppState.COMPLETED;
        this._save();
        this.ui.showCalibrationCaption("CALIBRATED TO LOCAL TIME");
        clearTimeout(this._finalCapTimer);
        this._finalCapTimer = setTimeout(() => {
          this.ui.showFinalCaption(this.data.caliber || "Cal.02 Automatic");
        }, 2400);
      }
    }

    _updateClock() {
      const a = this._currentHandAngles();
      const set = (id, ang) => {
        const g = this.groups[id];
        if (g) g.rotation.y = this._handRotY(g.userData.baseRotY || 0, ang);
      };
      set("secondsHand", a.seconds);
      set("minuteHand", a.minute);
      set("hourHand", a.hour);
    }

    _fitRadius() {
      const agg = Math.min(window.innerWidth, window.innerHeight);
      const r = 104 * Math.max(1, 720 / Math.max(agg, 320));
      return Math.min(190, r);
    }

    _setFinalCamera() {
      const cam = this.sceneMgr;
      cam.target.set(0, 3, 0);
      cam.orbitGoal.phi = 0.44;
      cam.orbitGoal.theta = 0.06;
      cam.orbitGoal.radius = this._fitRadius();
    }

    /* ============================================================
       モード切替(完成後は禁止)
       ============================================================ */
    setMode(mode) {
      if (this.completed) {
        this.ui.showMessage("Locked", "accent",
          "完成後はモードを変更できません。「モードを変えて最初から作る」を選んでください。", 2600);
        return;
      }
      if (this.appState !== AppState.ASSEMBLING && this.appState !== AppState.START) return;
      this.mode = mode;
      this.ui.setMode(mode);
      this._refresh();
      this._save();
    }

    /* ============================================================
       保存 / 復元(バージョン付き)
       ============================================================ */
    _save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          version: SAVE_VERSION,
          mode: this.mode,
          placedParts: [...this.placed],
          currentChapter: this.activeChapter,
          running: this.running,
          completed: this.completed,
          history: this.history,
          undoCount: this.undoCount,
          custom: this.custom,
          specChosen: this.specChosen
        }));
      } catch (e) {}
    }

    _restore() {
      try {
        let raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          // v2 → v3 移行: 進行中の組立を失わないように置き換える(履歴は空で開始)
          const old = localStorage.getItem("watchsim.cal02.v2");
          if (old) {
            try {
              const os = JSON.parse(old);
              if (os && os.version === 2) {
                const migrated = {
                  version: SAVE_VERSION, mode: os.mode,
                  placedParts: Array.isArray(os.placedParts) ? os.placedParts : [],
                  currentChapter: os.currentChapter || "movement",
                  running: !!os.running, completed: !!os.completed,
                  history: [], undoCount: 0
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
                raw = JSON.stringify(migrated);
              }
            } catch (e) {}
            try { localStorage.removeItem("watchsim.cal02.v2"); } catch (e) {}
          }
        }
        if (!raw) return;
        const s = JSON.parse(raw);
        // バージョン不一致の古いデータは破棄して安全に初期化する
        if (!s || s.version !== SAVE_VERSION) {
          localStorage.removeItem(STORAGE_KEY);
          return;
        }
        if (s.mode === "exam" || s.mode === "learning") this.mode = s.mode;
        if (s.currentChapter) this.activeChapter = s.currentChapter;
        if (s.running) this.running = true;
        if (s.completed) this.completed = true;
        if (Array.isArray(s.history)) this.history = s.history;
        if (typeof s.undoCount === "number") this.undoCount = s.undoCount;
        if (s.custom && typeof s.custom === "object") Object.assign(this.custom, s.custom);
        if (s.specChosen) this.specChosen = true;
        this._savedPlaced = Array.isArray(s.placedParts) ? s.placedParts : [];
      } catch (e) {
        try { localStorage.removeItem(STORAGE_KEY); } catch (e2) {}
      }
    }

    /** 復元: 古い部品を残さず、保存済み進捗だけを安全に再現する。 */
    _syncChapterState() {
      const saved = this._savedPlaced || [];
      const movementDone = this.chapterParts("movement").every((p) => saved.includes(p.id));
      if (movementDone && (this.activeChapter === "dial" || this.activeChapter === "case")) {
        this.movementInner.rotation.x = Math.PI;
        this.movementInner.position.y = -3;
        this.running = true;
      }
      if (this.activeChapter === "case") this.sceneMgr.orbitGoal.radius = 108;

      // 同じ部品IDが二重生成されないよう、set は _placeInstant 内で管理される
      this.parts.forEach((p) => { if (saved.includes(p.id) && !this.placed.has(p.id)) this._placeInstant(p); });
    }

    /** 復元時に完成済みだった場合: 演出は再生せず、鑑賞可能な完成状態にする */
    _enterCompletedRestore() {
      // 完成状態を確定(全部品配置 / 反転 / 針同期)
      this.parts.forEach((p) => { if (!this.placed.has(p.id)) this._placeInstant(p); });
      this.movementInner.rotation.x = Math.PI;
      this.movementInner.position.y = -3;
      this.watch.rotation.x = 0;
      this.running = true;
      this.activeChapter = "case";
      this._calibStarted = true; this._calibrating = false; this._calib = null;
      this.timeSync = true;
      this._updateClock();
      this._setFinalCamera();
      this.sceneMgr.setClickTargets([...this.placed].map((id) => this.groups[id]));
      // 復元後はいきなり鑑賞・途中カメラへ入らず、完成後メニューを最初に表示する
      this.viewSide = "front";
      this._returnToFinalMenu();
    }

    /* ============================================================
       [\u30c1\u30a7\u30c3\u30af\u7528] \u5148\u982d\u304b\u3089\u5b8c\u6210\u5f8c\u30e1\u30cb\u30e5\u30fc\u3078\u4e00\u767a\u3067\u98db\u3076\n       \u2014 \u5168\u90e8\u54c1\u3092\u5373\u5ea7\u306b\u914d\u7f6e\u3057\u3001\u5b8c\u6210\u72b6\u614b\u3092\u78ba\u5b9a\u3057\u3066\u5b8c\u6210\u5f8c\u30e1\u30cb\u30e5\u30fc\u3092\u8868\u793a\u3059\u308b\u3002\n       ============================================================ */
    jumpToCompleteMenu() {
      // \u9032\u884c\u4e2d\u306e\u30bf\u30a4\u30de\u30fc\u30fb\u6f14\u51fa\u3092\u6b62\u3081\u308b\n      this.finalState = null;
      this._cancelHoverTimers && this._cancelHoverTimers();
      this.busy = false;
      this.completed = true;
      this.appState = AppState.COMPLETED;
      this.activeChapter = "case";
      this._enterCompletedRestore();
      this._save();
    }

    /* ============================================================
       カスタマイズ
       ============================================================ */
    _applyCustomParams(part) {
      const p = part.params || (part.params = {});
      if (part.type === "dial") { p.dialStyle = this.custom.dial; p.dialIndex = this.custom.dialIndex; }
      else if (part.type === "hand") {
        p.handColor = this.custom.handColor;
        if (p.style !== "seconds") p.handShape = this.custom.handShape;
      } else if (part.type === "bezel") p.bezelFinish = this.custom.bezel === "polished" ? null : this.custom.bezel;
      else if (part.type === "crown") p.crownStyle = this.custom.crown;
    }

    _rebuildPart(id) {
      const part = this.parts.find((p) => p.id === id);
      if (!part) return;
      this._applyCustomParams(part);
      const old = this.groups[id];
      const wasPlaced = this.placed.has(id);
      const parent = old && old.parent;
      if (parent) parent.remove(old);
      // 旧グループのリソースを解放(重複メッシュ防止・メモリリーク防止)
      if (old) this._disposeGroup(old);
      const PF = WatchSim.PartFactory;
      const g = PF.create(part);
      g.userData.baseRotY = part.rotationY || 0;
      this.groups[id] = part._group = g;
      part._thumb = PF.thumbnail(g, this.sceneMgr.scene.environment);
      PF.disposeThumbnailer();
      if (wasPlaced) this._placeInstant(part);
    }

    _disposeGroup(group) {
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => { if (m && m.dispose && !m.__shared) m.dispose(); });
        }
      });
    }

    _restoreCustom() {
      try { const raw = localStorage.getItem("watchsim.custom.v1"); return raw ? JSON.parse(raw) : null; }
      catch (e) { return null; }
    }
    _saveCustom() {
      try { localStorage.setItem("watchsim.custom.v1", JSON.stringify(this.custom)); } catch (e) {}
    }

    _openDialCustomizer(done) {
      this.busy = true;
      this.ui.showCustomizer({
        title: "文字盤と針を仕立てる",
        sub: "Dial & Hands — あなたの一本を選ぶ",
        current: { dial: this.custom.dial, dialIndex: this.custom.dialIndex, handColor: this.custom.handColor, handShape: this.custom.handShape },
        groups: [
          { key: "dial", label: "文字盤の色", en: "Dial Colour", options: [
            { value: "silver", name: "シルバー", en: "Silver Opaline", swatch: "radial-gradient(circle at 38% 32%, #f3efe6, #d6d2c5)" },
            { value: "slate", name: "スレート", en: "Slate Grey", swatch: "radial-gradient(circle at 38% 32%, #3c424a, #1b1f25)" },
            { value: "navy", name: "ミッドナイト", en: "Midnight Blue", swatch: "radial-gradient(circle at 38% 32%, #2c3d64, #101a30)" }
          ] },
          { key: "dialIndex", label: "インデックス", en: "Index Style", options: [
            { value: "bar", name: "バー", en: "Applied Bar", swatch: '<svg width="30" height="30" viewBox="0 0 30 30"><rect x="14" y="3" width="2" height="5" fill="#cdd2da"/><rect x="14" y="22" width="2" height="5" fill="#cdd2da"/><rect x="3" y="14" width="5" height="2" fill="#cdd2da"/><rect x="22" y="14" width="5" height="2" fill="#cdd2da"/></svg>' },
            { value: "roman", name: "ローマ数字", en: "Roman", swatch: '<svg width="30" height="30" viewBox="0 0 30 30"><text x="15" y="20" text-anchor="middle" font-family="Times New Roman, serif" font-size="11" fill="#cdd2da">XII</text></svg>' },
            { value: "arabic", name: "アラビア数字", en: "Arabic", swatch: '<svg width="30" height="30" viewBox="0 0 30 30"><text x="15" y="21" text-anchor="middle" font-family="Times New Roman, serif" font-size="14" fill="#cdd2da">12</text></svg>' }
          ] },
          { key: "handColor", label: "針の仕上げ", en: "Hand Finish", options: [
            { value: "blued", name: "ブルースチール", en: "Blued Steel", swatch: "linear-gradient(135deg, #2f50ad, #16264d)" },
            { value: "gold", name: "ゴールド", en: "Yellow Gold", swatch: "linear-gradient(135deg, #e8c880, #b8923f)" },
            { value: "rhodium", name: "ロジウム", en: "Rhodium", swatch: "linear-gradient(135deg, #eef1f6, #bfc5cf)" }
          ] },
          { key: "handShape", label: "針の形状", en: "Hand Style", options: [
            { value: "breguet", name: "ブレゲ", en: "Breguet", swatch: '<svg width="30" height="30" viewBox="0 0 30 30"><line x1="15" y1="27" x2="15" y2="11" stroke="#cdd2da" stroke-width="2"/><circle cx="15" cy="8.5" r="3.6" fill="none" stroke="#cdd2da" stroke-width="1.6"/></svg>' },
            { value: "dauphine", name: "ドーフィン", en: "Dauphine", swatch: '<svg width="30" height="30" viewBox="0 0 30 30"><polygon points="15,4 18.2,26 11.8,26" fill="#cdd2da"/></svg>' }
          ] }
        ],
        onConfirm: (sel) => {
          Object.assign(this.custom, sel);
          this._saveCustom();
          ["dial", "hourHand", "minuteHand", "secondsHand"].forEach((id) => this._rebuildPart(id));
          this.busy = false;
          this.ui.showMessage("仕様を決定", "accent", "選んだ文字盤と針で仕立てます", 1800);
          if (done) done();
        }
      });
    }

    _openCaseCustomizer(done) {
      this.busy = true;
      this.ui.showCustomizer({
        title: "ベゼルと竜頭を仕立てる",
        sub: "Bezel & Crown — 外装の意匠",
        current: { bezel: this.custom.bezel, crown: this.custom.crown },
        groups: [
          { key: "bezel", label: "ベゼル", en: "Bezel", options: [
            { value: "polished", name: "ポリッシュ", en: "Polished Steel", swatch: "linear-gradient(135deg, #eef1f6, #aeb4be)" },
            { value: "gold", name: "ゴールド", en: "Yellow Gold", swatch: "linear-gradient(135deg, #e8c880, #b8923f)" },
            { value: "fluted", name: "コインエッジ", en: "Fluted", swatch: "repeating-linear-gradient(90deg, #d3d8e0 0 3px, #969ca6 3px 5px)" }
          ] },
          { key: "crown", label: "竜頭", en: "Crown", options: [
            { value: "fluted", name: "メダリオン", en: "Fluted / Medallion", swatch: "radial-gradient(circle at 50% 50%, #c9a85f 0 30%, #9aa0aa 33%)" },
            { value: "cabochon", name: "カボション", en: "Cabochon", swatch: "radial-gradient(circle at 40% 35%, #4a6bd0, #16264d)" }
          ] }
        ],
        onConfirm: (sel) => {
          Object.assign(this.custom, sel);
          this._saveCustom();
          ["bezel", "crown"].forEach((id) => this._rebuildPart(id));
          this.busy = false;
          this.ui.showMessage("仕様を決定", "accent", "選んだベゼルと竜頭で仕上げます", 1800);
          if (done) done();
        }
      });
    }

    /* 仕様選択の全グループ定義(組立前選択と仕様確認の両方で共用) */
    _specGroups() {
      return [
        { key: "dial", label: "文字盤の色", en: "Dial Colour", options: [
          { value: "silver", name: "シルバー", en: "Silver Opaline", swatch: "radial-gradient(circle at 38% 32%, #f3efe6, #d6d2c5)" },
          { value: "slate", name: "スレート", en: "Slate Grey", swatch: "radial-gradient(circle at 38% 32%, #3c424a, #1b1f25)" },
          { value: "navy", name: "ミッドナイト", en: "Midnight Blue", swatch: "radial-gradient(circle at 38% 32%, #2c3d64, #101a30)" }
        ] },
        { key: "dialIndex", label: "インデックス", en: "Index Style", options: [
          { value: "bar", name: "バー", en: "Applied Bar", swatch: '<svg width="30" height="30" viewBox="0 0 30 30"><rect x="14" y="3" width="2" height="5" fill="#cdd2da"/><rect x="14" y="22" width="2" height="5" fill="#cdd2da"/><rect x="3" y="14" width="5" height="2" fill="#cdd2da"/><rect x="22" y="14" width="5" height="2" fill="#cdd2da"/></svg>' },
          { value: "roman", name: "ローマ数字", en: "Roman", swatch: '<svg width="30" height="30" viewBox="0 0 30 30"><text x="15" y="20" text-anchor="middle" font-family="Times New Roman, serif" font-size="11" fill="#cdd2da">XII</text></svg>' },
          { value: "arabic", name: "アラビア数字", en: "Arabic", swatch: '<svg width="30" height="30" viewBox="0 0 30 30"><text x="15" y="21" text-anchor="middle" font-family="Times New Roman, serif" font-size="14" fill="#cdd2da">12</text></svg>' }
        ] },
        { key: "handColor", label: "針の仕上げ", en: "Hand Finish", options: [
          { value: "blued", name: "ブルースチール", en: "Blued Steel", swatch: '<svg width="58" height="24" viewBox="0 0 58 24"><path d="M8 12 L44 9.4 L52 12 L44 14.6 Z" fill="#3a5bd6"/><circle cx="11" cy="12" r="4.2" fill="#3a5bd6"/></svg>' },
          { value: "gold", name: "ゴールド", en: "Yellow Gold", swatch: '<svg width="58" height="24" viewBox="0 0 58 24"><path d="M8 12 L44 9.4 L52 12 L44 14.6 Z" fill="#d8b56a"/><circle cx="11" cy="12" r="4.2" fill="#d8b56a"/></svg>' },
          { value: "rhodium", name: "ロジウム", en: "Rhodium", swatch: '<svg width="58" height="24" viewBox="0 0 58 24"><path d="M8 12 L44 9.4 L52 12 L44 14.6 Z" fill="#e4e8ee"/><circle cx="11" cy="12" r="4.2" fill="#e4e8ee"/></svg>' }
        ] },
        { key: "handShape", label: "針の形状", en: "Hand Style", options: [
          { value: "breguet", name: "ブレゲ", en: "Breguet", swatch: '<svg width="58" height="24" viewBox="0 0 58 24"><line x1="9" y1="12" x2="39" y2="12" stroke="#d3d8e0" stroke-width="2.4" stroke-linecap="round"/><circle cx="44.5" cy="12" r="4.6" fill="none" stroke="#d3d8e0" stroke-width="1.8"/><line x1="49" y1="12" x2="53" y2="12" stroke="#d3d8e0" stroke-width="1.6" stroke-linecap="round"/></svg>' },
          { value: "dauphine", name: "ドーフィン", en: "Dauphine", swatch: '<svg width="58" height="24" viewBox="0 0 58 24"><polygon points="9,8.6 9,15.4 53,12" fill="#d3d8e0"/><line x1="9" y1="12" x2="53" y2="12" stroke="#8b909a" stroke-width="0.8"/></svg>' }
        ] },
        { key: "bezel", label: "ベゼル", en: "Bezel", options: [
          { value: "polished", name: "ポリッシュ", en: "Polished Steel", swatch: '<svg width="40" height="40" viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" fill="#191c22"/><circle cx="22" cy="22" r="19" fill="none" stroke="#dfe4ec" stroke-width="4.5"/><circle cx="22" cy="22" r="15" fill="none" stroke="#7f858f" stroke-width="1"/></svg>' },
          { value: "gold", name: "ゴールド", en: "Yellow Gold", swatch: '<svg width="40" height="40" viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" fill="#191c22"/><circle cx="22" cy="22" r="19" fill="none" stroke="#e2c579" stroke-width="4.5"/><circle cx="22" cy="22" r="15" fill="none" stroke="#9c7d3f" stroke-width="1"/></svg>' },
          { value: "fluted", name: "コインエッジ", en: "Fluted", swatch: '<svg width="40" height="40" viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" fill="#191c22"/><circle cx="22" cy="22" r="18" fill="none" stroke="#dfe4ec" stroke-width="5" stroke-dasharray="2.2 2.4"/><circle cx="22" cy="22" r="14.5" fill="none" stroke="#969ca6" stroke-width="1"/></svg>' }
        ] },
        { key: "crown", label: "竜頭", en: "Crown", options: [
          { value: "fluted", name: "メダリオン", en: "Fluted / Medallion", swatch: '<svg width="44" height="30" viewBox="0 0 44 30"><rect x="3" y="13" width="10" height="4" rx="1" fill="#8b909a"/><rect x="13" y="6" width="16" height="18" rx="2.5" fill="#aab0ba"/><g stroke="#6c737d" stroke-width="1"><line x1="16" y1="7" x2="16" y2="23"/><line x1="19.5" y1="7" x2="19.5" y2="23"/><line x1="23" y1="7" x2="23" y2="23"/><line x1="26.5" y1="7" x2="26.5" y2="23"/></g><circle cx="34" cy="15" r="5" fill="#c9a85f"/><circle cx="34" cy="15" r="5" fill="none" stroke="#e6d29a" stroke-width="1"/></svg>' },
          { value: "cabochon", name: "カボション", en: "Cabochon", swatch: '<svg width="44" height="30" viewBox="0 0 44 30"><rect x="3" y="13" width="10" height="4" rx="1" fill="#8b909a"/><rect x="13" y="6" width="16" height="18" rx="2.5" fill="#aab0ba"/><g stroke="#6c737d" stroke-width="1"><line x1="16" y1="7" x2="16" y2="23"/><line x1="20" y1="7" x2="20" y2="23"/><line x1="24" y1="7" x2="24" y2="23"/></g><circle cx="33.5" cy="15" r="5.6" fill="#2f50ad"/><circle cx="33.5" cy="15" r="5.6" fill="none" stroke="#c9a85f" stroke-width="1.2"/><circle cx="31.8" cy="13.3" r="1.6" fill="rgba(255,255,255,0.6)"/></svg>' }
        ] }
      ];
    }

    /* 仕様のロック状態を現在の配置済部品から再計算(固定値で持たない) */
    _specLocks() {
      return {
        dial: this.placed.has("dial"),
        hands: this.placed.has("hourHand") || this.placed.has("minuteHand") || this.placed.has("secondsHand"),
        bezel: this.placed.has("bezel"),
        crown: this.placed.has("crown")
      };
    }

    /* 組立開始前の仕様選択(全項目＋プレビュー) */
    _openStartCustomizer(done) {
      this.busy = true;
      this.appState = AppState.START;
      this.ui.showCustomizer({
        title: "時計の仕様を選ぶ",
        sub: "Design Your Watch — 組立を始める前に仕様を決めます",
        confirmLabel: "この仕様で組み立てを始める",
        preview: true,
        current: Object.assign({}, this.custom),
        groups: this._specGroups(),
        onConfirm: (sel) => {
          Object.assign(this.custom, sel);
          this._saveCustom();
          ["dial", "hourHand", "minuteHand", "secondsHand", "bezel", "crown"].forEach((id) => this._rebuildPart(id));
          this.specChosen = true;
          this.busy = false;
          this.appState = AppState.ASSEMBLING;
          this._save();
          if (done) done();
        }
      });
    }

    /* 組立中の仕様確認・変更(取付前の部品だけ変更可) */
    _openSpecReview() {
      if (this.busy || this.completed) return;
      const locks = this._specLocks();
      const groups = this._specGroups().map((g) => {
        let locked = false;
        if (g.key === "dial" || g.key === "dialIndex") locked = locks.dial;
        else if (g.key === "handColor" || g.key === "handShape") locked = locks.hands;
        else if (g.key === "bezel") locked = locks.bezel;
        else if (g.key === "crown") locked = locks.crown;
        return Object.assign({}, g, { locked });
      });
      this.busy = true;
      this.ui.showCustomizer({
        title: "仕様を確認・変更",
        sub: "Specifications — 取付前の部品だけ変更できます",
        confirmLabel: "変更を反映する",
        preview: true,
        lockNote: "取付済みの部品は変更できません（🔒）。一つ前の工程へ戻して取り外すと再び変更できます。",
        current: Object.assign({}, this.custom),
        groups,
        onConfirm: (sel) => {
          const changed = {};
          Object.keys(sel).forEach((k) => { if (sel[k] !== this.custom[k]) changed[k] = sel[k]; });
          Object.assign(this.custom, sel);
          this._saveCustom();
          const rebuild = new Set();
          if ("dial" in changed || "dialIndex" in changed) rebuild.add("dial");
          if ("handColor" in changed || "handShape" in changed) ["hourHand", "minuteHand", "secondsHand"].forEach((id) => rebuild.add(id));
          if ("bezel" in changed) rebuild.add("bezel");
          if ("crown" in changed) rebuild.add("crown");
          // 未配置(未取付)の部品だけ安全に再生成。取付済は触らない。
          rebuild.forEach((id) => { if (!this.placed.has(id)) this._rebuildPart(id); });
          this.busy = false;
          this._save();
          this._refresh();
          const n = [...rebuild].filter((id) => !this.placed.has(id)).length;
          this.ui.showMessage("仕様を更新", "accent",
            n ? "未取付の部品に反映しました。" : "取付済部品は変更されません。", 1800);
        }
      });
    }

    /* ============================================================
       リセット系
       ============================================================ */
    /** 最初から作る: 進行状況を削除し、現在のモードを維持して最初の工程から開始 */
    restart() {
      if (!confirm("現在の組立状況を削除して、最初から始めますか？")) return;
      this.appState = AppState.RESETTING;
      // 現在のモードだけ維持した初期状態を保存 → 完全再読込でシーンを破棄・再初期化
      try {
        localStorage.removeItem(MODESELECT_KEY);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          version: SAVE_VERSION, mode: this.mode, placedParts: [],
          currentChapter: "movement", running: false, completed: false,
          history: [], undoCount: 0, custom: this.custom, specChosen: false
        }));
      } catch (e) {}
      location.reload();
    }

    /** モードを変えて最初から作る: 完全リセット → モード選択 → 最初から */
    changeMode() {
      if (!confirm("モードを変更すると、現在の組立状況はリセットされます。続けますか？")) return;
      this.appState = AppState.RESETTING;
      try {
        localStorage.removeItem(STORAGE_KEY);           // 進行データを完全に削除
        localStorage.setItem(MODESELECT_KEY, "1");      // 復帰後にモード選択画面を出す
      } catch (e) {}
      location.reload();
    }

    /* ============================================================
       破棄(ページ離脱時 / bfcache): Three.js を完全に解放
       ============================================================ */
    destroy() {
      if (this._destroyed) return;
      this._destroyed = true;
      this._timers.forEach((t) => clearTimeout(t));
      this._timers.length = 0;
      clearTimeout(this._finalCapTimer);
      document.removeEventListener("visibilitychange", this._onVisibility);
      window.removeEventListener("pageshow", this._onPageShow);
      window.removeEventListener("pagehide", this._onPageHide);
      this.anims.length = 0;
      this.tweens.length = 0;
      this.finalState = null;
      try { this.sceneMgr.dispose(); } catch (e) {}
    }

    _addTimer(id) { this._timers.push(id); return id; }

    /* ============================================================
       汎用トゥイーン
       ============================================================ */
    _tween(t) { t.t = 0; this.tweens.push(t); }

    /* ============================================================
       毎フレーム更新
       ============================================================ */
    update(dt, elapsed) {
      // 配置リングの明滅
      if (this.ring.visible) {
        this.ring.material.opacity = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(elapsed * 3.4));
      }
      // 注油ガイドの青い輪(はっきりと見える青で、ゲームとしてパルスさせる)
      if (this.oilRing.visible) {
        const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.6);   // ゆっくりしたテンポ
        this.oilRingMesh.material.opacity = 0.64 + 0.32 * pulse;
        const breathe = 1 + 0.07 * pulse;
        this.oilRing.children[0].scale.setScalar(breathe); // 外輪だけ呼吸
      }
      // 軸挿入ガイド(巻真・ツヅミ車・キチ車)の明滅
      if (this.axisGuide && this.axisGuide.visible) {
        const p = 0.5 + 0.5 * Math.sin(elapsed * 3.0);
        if (this.axisGuideSeat) this.axisGuideSeat.material.opacity = 0.4 + 0.35 * p;
        if (this.axisGuideArrow) this.axisGuideArrow.material.opacity = 0.5 + 0.4 * p;
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

      // 中間動作確認アニメーション
      if (this.verifyAnim) this._updateVerify(dt);

      // 巻上げ演出
      if (this.windT !== null) {
        this.windT += dt;
        const k = Math.min(this.windT / 2.4, 1);
        const spd = Math.sin(k * Math.PI) * 14;
        const rev = this.groups.reversingWheel;
        if (rev && this.placed.has("reversingWheel")) rev.rotation.y += spd * 0.6 * dt;
        const rw = this.groups.ratchetWheel;
        if (rw && this.placed.has("ratchetWheel")) rw.rotation.y += spd * 0.3 * dt;
        const red = this.groups.reductionWheel;
        if (red && this.placed.has("reductionWheel")) red.rotation.y += spd * 0.45 * dt;
        if (k >= 1) this._finishWinding();
      }

      // ローターの慣性回転
      if (this.placed.has("rotor")) {
        const impulse = this.sceneMgr.consumeDragImpulse();
        this.rotorVel += impulse * 7.5;
        this.rotorVel = Math.max(-16, Math.min(16, this.rotorVel));
        if (Math.abs(this.rotorVel) > 1e-4) {
          this.groups.rotor.rotation.y += this.rotorVel * dt;
          this.rotorVel *= Math.pow(0.5, dt * 0.85);
          if (Math.abs(this.rotorVel) < 0.012) this.rotorVel = 0;
        }
      }

      // ムーブメント駆動
      if (this.running) { this.runT += dt; this._updateRunning(dt, this.runT); }

      // 時刻合わせ / 現在時刻同期
      if (this._calibrating) this._updateCalibration(dt);
      else if (this.timeSync) this._updateClock();

      // 完成シネマティック
      if (this.finalState) this._updateFinal(dt);

      // 鑑賞/完成演出中の上品な演出(ごく稀な流れ星のみ)
      if (this.appState === AppState.VIEWING || this.appState === AppState.CINEMATIC || this.finalState) {
        this._starT += dt;
        if (this._starT >= this._starNext) {
          this._starT = 0; this._starNext = 20 + Math.random() * 26;   // 間隔もランダム・長め
          this.ui.triggerShootingStar();
        }
      }
      // 解説ONの点＋ボックスを部品に追従させる
      if (this.explainOn && this._explainTarget) this._updateCalloutPos();
    }

    _updateRunning(dt, t) {
      const beat = this.beatHz;
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
            if (this.timeSync || this._calibrating) break;
            const period = run.hand === "hour" ? 43200 : run.hand === "minute" ? 3600 : 60;
            let sec = local * handSpeed;
            if (run.hand === "seconds") sec = Math.floor(sec * 6) / 6;
            const ang = sec / period * Math.PI * 2;
            g.rotation.y = this._handRotY(g.userData.baseRotY || 0, ang);
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
