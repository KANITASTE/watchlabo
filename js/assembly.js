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
  const STORAGE_KEY = "watchsim.cal02.v2";
  const SAVE_VERSION = 2;
  const MODESELECT_KEY = "watchsim.pendingModeSelect.v2";

  /* アプリの明示的な状態。各状態で許可される操作を限定し、状態の混在を防ぐ。
     ASSEMBLING: 部品配置・工具操作 / OILING: 注油操作のみ /
     COMPLETED: 完成後メニュー / CINEMATIC: 入力停止 /
     VIEWING: 自由回転・表裏切替・拡大鑑賞 / RESETTING: 操作禁止 */
  const AppState = {
    START: "start", ASSEMBLING: "assembling", OILING: "oiling",
    COMPLETED: "completed", CINEMATIC: "cinematic", VIEWING: "viewing", RESETTING: "resetting"
  };
  WatchSim.AppState = AppState;

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

      /* ---- 完成後の解説ON / 鑑賞演出 ---- */
      this.explainOn = false;
      this._explainTarget = null;              // {group, def, worldPos}
      this._starT = 0; this._starNext = 12 + Math.random() * 14;
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
      this.sceneMgr.onPartClick((group) => this.handlePartClick(group.userData.partDef.id));
      this.sceneMgr.onOilClick((isHit) => this.handleOilClick(isHit));
      this.sceneMgr.onHover((g) => this._onExplainHover(g));
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
          this.busy = false;
          this.appState = AppState.ASSEMBLING;
          this._save();
          this._refresh();
          this.ui.showMessage("Ready", "accent",
            (this.mode === "exam" ? "Exam Mode" : "Learning Mode") + " で最初から組み立てます。", 2200);
        });
        return;
      }

      if (this.completed) {
        this._enterCompletedRestore();
      } else {
        this._refresh();
        this._maybeTutorial();
      }
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

    /** 現在の注油点(oilPoint)。専用座標を使い、部品の hitRadius は使わない。 */
    _currentOilPoint() {
      if (!this.pendingOil) return null;
      const op = this.parts.find((p) => p.id === this.pendingOil);
      return op && op.oilPoint ? op.oilPoint : null;
    }

    _updateRingTarget() {
      // 注油中は配置リングを消す(注油ガイドは _updateOilGuide が担当)
      if (this.pendingOil) { this.ring.visible = false; return; }
      const cur = this.current;
      if (!cur || this.mode !== "learning" || this.busy || this.appState !== AppState.ASSEMBLING) {
        this.ring.visible = false; return;
      }
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
      this.sceneMgr.setClickTargets([...this.placed].map((id) => this.groups[id]));
      // 文字盤/外装を選び直す導線(第2・第3章の組立中のみ)
      this.ui.showRecustomize(
        !this.busy && this.appState === AppState.ASSEMBLING &&
          (this.activeChapter === "dial" || this.activeChapter === "case"),
        () => this.reopenCustomizer()
      );
    }

    /** 現在の章に応じたカスタマイズを開き直す(選択状態は保持)。工程は進めない。 */
    reopenCustomizer() {
      if (this.busy) return;
      if (this.activeChapter === "dial") {
        this._openDialCustomizer(() => { this._refresh(); });
      } else if (this.activeChapter === "case") {
        this._openCaseCustomizer(() => { this._refresh(); });
      }
    }

    /* ============================================================
       解説ON: 点＋線＋説明ボックス(完成後の鑑賞中のみ)
       ============================================================ */
    /** 現在の解説対象を設定し、説明ボックスの内容を更新する */
    _setExplainTarget(group, def) {
      this._explainTarget = { group, def, worldPos: new THREE.Vector3() };
      group.getWorldPosition(this._explainTarget.worldPos);
      this.ui.setCalloutContent(def);
      this.ui.showExplainHint(false);
      this._updateCalloutPos();
    }

    _clearExplainTarget() {
      this._explainTarget = null;
      this.ui.hideCallout();
      if (this.explainOn) this.ui.showExplainHint(true);
    }

    /** 対象部品の画面位置を求め、点・線・ボックス位置を更新する(毎フレーム) */
    _updateCalloutPos() {
      const t = this._explainTarget;
      if (!t) return;
      t.group.getWorldPosition(t.worldPos);
      const s = this.sceneMgr.worldToScreen(t.worldPos);
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

    /** 解説ON/OFF 切替(鑑賞中のみ) */
    toggleExplain() {
      if (this.appState !== AppState.VIEWING) return;
      this.explainOn = !this.explainOn;
      this.ui.setExplainButton(this.explainOn);
      if (this.explainOn) {
        const groups = [...this.placed].map((id) => this.groups[id]);
        this.sceneMgr.setHoverTargets(groups);
        this.sceneMgr.setClickTargets(groups);
        this.sceneMgr.enableHover(true);
        this.ui.showExplainHint(true);
        this.ui.hideCallout();
        this._explainTarget = null;
      } else {
        this.sceneMgr.enableHover(false);
        this.sceneMgr.setClickTargets([]);
        this.ui.showExplainHint(false);
        this.ui.hideCallout();
        this._explainTarget = null;
      }
    }

    /** ホバー(PC): 部品に点＋線＋ボックスで解説を表示。1つずつだけ反応させる。 */
    _onExplainHover(group) {
      if (!this.explainOn || this.appState !== AppState.VIEWING) return;
      const def = group && group.userData && group.userData.partDef;
      if (def && this.placed.has(def.id)) {
        if (!this._explainTarget || this._explainTarget.def.id !== def.id) this._setExplainTarget(group, def);
      } else {
        this._clearExplainTarget();
      }
    }

    /* ============================================================
       クリック: 注油・部品情報
       ============================================================ */
    handlePartClick(partId) {
      // 鑑賞中 + 解説ON: タップ/クリックで部品解説を表示(スマホ・タブレット対応)
      if (this.appState === AppState.VIEWING) {
        if (this.explainOn) {
          const part = this.parts.find((p) => p.id === partId);
          const g = this.groups[partId];
          if (part && g) this._setExplainTarget(g, part);
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
      this.oilRing.visible = false;
      this.sceneMgr.clearOilTarget();
      document.body.classList.remove("oiling");
      this.ui.showMessage("Oiling Complete", "ok", (part ? part.name : "") + "の軸受に適量を注油しました。", 1400);
      this._addTimer(setTimeout(() => this._refresh(), 900));
    }

    inspectPart(partId) {
      if (this.mode === "exam") return;
      const part = this.parts.find((p) => p.id === partId);
      if (part) this.ui.showPartInfo(part);
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
      return part.chapter === "movement" ? this.movementInner : this.watch;
    }

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
          this.ui.showMessage("Assembly Complete", "ok", part.name + " — " + part.nameEn, 1000);
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
            this._refresh();
          }
        }
      });

      this.placed.add(part.id);
      this.ui.markPlaced(part.id);
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
      this.ui.showCinematic("ムーブメントを反転 — 文字盤側へ");

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
        },
        onDone: () => {
          this.movementInner.rotation.x = Math.PI;
          this.movementInner.position.y = -3;
          cam.orbitGoal.phi = 0.9;
          cam.orbitGoal.radius = startRad;
          this.flipping = false;
          this.activeChapter = "dial";
          this.appState = AppState.ASSEMBLING;
          this._save();
          this.ui.hideCinematic();
          this._openDialCustomizer(() => {
            this.ui.showMessage("Dial-Side Assembly", "accent", "第2章 — 文字盤側の組立を始めます", 2200);
            this._addTimer(setTimeout(() => this._refresh(), 400));
          });
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
      const cam = this.sceneMgr;
      this._tween({
        dur: 1.4, ease: easeInOut,
        onUpdate: (k) => { cam.orbitGoal.radius = lerp(cam.orbit.radius, 108, k * 0.5 + 0.5); },
        onDone: () => {
          cam.orbitGoal.radius = 108;
          this.activeChapter = "case";
          this.appState = AppState.ASSEMBLING;
          this._save();
          this._openCaseCustomizer(() => {
            this.ui.showMessage("Casing", "accent", "第3章 — ケーシング(外装組立)", 2200);
            this._addTimer(setTimeout(() => this._refresh(), 400));
          });
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
      } else if (act === "menu") {
        this._goToCompletedAssembly();
      }
    }

    /* 完成後の「組立画面へ戻る」ボタン群(7-5) */
    completedAction(act) {
      if (act === "restart") { this.restart(); return; }
      if (act === "view") { this._beginViewing("front"); return; }
      if (act === "movement") { this._beginViewing("back"); return; }
      if (act === "postmenu") {
        // 完成後メニュー(5項目)を再表示
        this.appState = AppState.COMPLETED;
        this.magnified = false;
        this.ui.hideCompletedControls();
        this.ui.enterCinemaMode();
        this.sceneMgr.setCinemaBackground();
        this._setFinalCamera();
        this.ui.showFinalCaption(this.data.caliber || "Cal.02 Automatic");
      }
    }

    /* 鑑賞モード開始(表側 / 裏側) */
    _beginViewing(side) {
      this.appState = AppState.VIEWING;
      this.magnified = false;
      this.finalState = null;
      // 解説ONは鑑賞ごとにリセットしておく
      this.explainOn = false;
      this.ui.setExplainButton(false);
      this.ui.showExplainHint(false);
      this.ui.hideCallout();
      this.sceneMgr.enableHover(false);
      this._explainTarget = null;
      const cam = this.sceneMgr;
      this.ui.enterCinemaMode();            // 通常UIは隠す
      this.ui.hideFinalCaption();
      this.ui.hideCompletedControls();
      this.sceneMgr.setCinemaBackground();
      cam.target.set(0, 3, 0);
      if (side === "front") {
        this.watch.rotation.x = 0;
        cam.orbitGoal.phi = 0.5; cam.orbitGoal.theta = 0.06; cam.orbitGoal.radius = this._fitRadius();
      } else {
        this.watch.rotation.x = Math.PI;
        cam.orbitGoal.phi = 0.62; cam.orbitGoal.theta = 0.35; cam.orbitGoal.radius = this._fitRadius() + 6;
      }
      this.ui.showViewControls();
    }

    /* 鑑賞ツールバーのボタン(表/裏/拡大/戻る) */
    viewAction(act) {
      const cam = this.sceneMgr;
      if (act === "front") {
        this.watch.rotation.x = 0;
        cam.orbitGoal.phi = 0.5; cam.orbitGoal.theta = 0.06;
        cam.orbitGoal.radius = this.magnified ? this._fitRadius() * 0.62 : this._fitRadius();
      } else if (act === "back") {
        this.watch.rotation.x = Math.PI;
        cam.orbitGoal.phi = 0.62; cam.orbitGoal.theta = 0.35;
        cam.orbitGoal.radius = (this.magnified ? this._fitRadius() * 0.62 : this._fitRadius()) + 6;
      } else if (act === "zoom") {
        this.magnified = !this.magnified;
        const base = this._fitRadius();
        // 画面外へ消えないよう範囲を制限
        cam.orbitGoal.radius = this.magnified ? Math.max(42, base * 0.6) : base;
        this.ui.setZoomLabel(this.magnified);
      } else if (act === "explain") {
        this.toggleExplain();
      } else if (act === "menu") {
        this._goToCompletedAssembly();
      }
    }

    /* 完成済みの時計を保持したまま、通常の組立画面UI(完成後版)へ戻す */
    _goToCompletedAssembly() {
      this.appState = AppState.VIEWING;
      this.magnified = false;
      this.finalState = null;
      this.busy = false;
      // 解説ONを解除
      this.explainOn = false;
      this.sceneMgr.enableHover(false);
      this.ui.setExplainButton(false);
      this.ui.showExplainHint(false);
      this.ui.hideCallout();
      this._explainTarget = null;
      this.watch.rotation.x = 0;
      this.ui.hideViewControls();
      this.ui.hideFinalCaption();
      this.ui.exitCinemaMode();
      this.sceneMgr.setNormalBackground();
      this._setFinalCamera();
      this.ui.enterCompletedAssembly();     // topbar表示・モード切替は無効・トレイ非表示
      this.ui.showCompletedControls();
      this.ui.setModeToggleEnabled(false,
        "完成後にモードを変更するには「モードを変えて最初から作る」を選択してください。");
      this.ui.showPartInfoText("完成", "Completed",
        "Cal.02 は完成しています。時計を鑑賞するか、最初から作り直すことができます。");
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
          completed: this.completed
        }));
      } catch (e) {}
    }

    _restore() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
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
      // 完成後の組立画面(7-5)へ
      this._goToCompletedAssembly();
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
          currentChapter: "movement", running: false, completed: false
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

      // 鑑賞/完成演出中の上品な演出(ごく稀な流れ星のみ。画面をなぞる光帯は廃止済み)
      if (this.appState === AppState.VIEWING || this.appState === AppState.CINEMATIC || this.finalState) {
        this._starT += dt;
        if (this._starT >= this._starNext) {
          this._starT = 0; this._starNext = 20 + Math.random() * 26;   // 間隔もランダム・長め
          this.ui.triggerShootingStar();
        }
      }
      // 解説ONの点＋線＋ボックスを部品に追従させる
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
