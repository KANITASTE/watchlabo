/* ============================================================
   ui.js — DOM UI 管理 (Cal.02)
   章表示 / サポート表示 / 工具 / 部品トレイ /
   中央メッセージ / モード切替 / CTA / シネマティック演出
   ============================================================ */
(function () {
  "use strict";
  window.WatchSim = window.WatchSim || {};

  class UI {
    constructor() {
      const $ = (id) => document.getElementById(id);
      this.el = {
        chapterTitle: $("chapter-title"),
        chapterSub: $("chapter-sub"),
        chapterNote: $("chapter-note"),
        stepCounter: $("step-counter"),
        progressFill: $("progress-fill"),
        partNameJa: $("part-name-ja"),
        partNameEn: $("part-name-en"),
        blockRole: $("block-role"), infoRole: $("info-role"),
        blockRel: $("block-relation"), infoRel: $("info-relation"),
        blockDesc: $("block-desc"), infoDesc: $("info-desc"),
        blockTrivia: $("block-trivia"), infoTrivia: $("info-trivia"),
        learningInfo: $("learning-info"),
        examInfo: $("exam-info"),
        traySc: $("tray-scroll"),
        trayLabel: $("tray-label"),
        ghost: $("drag-ghost"),
        ghostImg: document.querySelector("#drag-ghost img"),
        msgLayer: $("message-layer"),
        modeBadge: $("mode-badge"),
        cta: $("cta-btn"),
        resetBtn: $("reset-btn"),
        btnLearning: $("btn-learning"),
        btnExam: $("btn-exam"),
        cinemaCap: $("cinema-caption"),
        calibCap: $("calib-caption"),
        lightStreakEl: $("light-streak"),
        finalCaption: $("final-caption"),
        modeSelect: $("mode-select"),
        completedControls: $("completed-controls"),
        viewControls: $("view-controls"),
        zoomBtn: document.querySelector('#view-controls [data-view="zoom"]'),
        explainBtn: $("explain-switch"),
        explainHint: $("explain-hint"),
        recustomizeBtn: $("recustomize-btn"),
        callout: $("explain-callout"),
        ecLine: $("ec-line"),
        ecDot: $("ec-dot"),
        ecBox: $("ec-box"),
        ecNameJa: $("ec-name-ja"),
        ecNameEn: $("ec-name-en"),
        ecSections: $("ec-sections"),
        shootingStar: $("shooting-star"),
        toolGuide: $("tool-guide"),
        rsMain: $("rs-main"),
        rsTool: $("rs-tool"),
        rsOilRow: $("rs-oil-row"),
        customOverlay: $("custom-overlay"),
        customTitle: $("custom-title"),
        customSub: $("custom-sub"),
        customGroups: $("custom-groups"),
        customConfirm: $("custom-confirm"),
        tools: {
          driver: $("tool-driver"),
          tweezers: $("tool-tweezers"),
          oiler: $("tool-oiler")
        }
      };

      // コールバック(assembly.js が注入)
      this.onDrop = null;
      this.onCardClick = null;
      this.onModeChange = null;
      this.onCTA = null;
      this.onReset = null;
      this.onToolSelect = null;   // (tool) => void
      this.onFinalAction = null;  // (act) => void
      this.onViewAction = null;   // (act) => void  鑑賞ツールバー
      this.onCompletedAction = null; // (act) => void 完成後の組立画面

      this._bindStatic();
    }

    _bindStatic() {
      this.el.btnLearning.addEventListener("click", () => this.onModeChange && this.onModeChange("learning"));
      this.el.btnExam.addEventListener("click", () => this.onModeChange && this.onModeChange("exam"));
      this.el.cta.addEventListener("click", () => this.onCTA && this.onCTA());
      this.el.resetBtn.addEventListener("click", () => this.onReset && this.onReset());
      // 工具のクリック選択
      Object.entries(this.el.tools).forEach(([key, el]) => {
        el.addEventListener("click", () => this.onToolSelect && this.onToolSelect(key));
      });
      // 完成画面の導線ボタン(完成後メニュー・5項目)
      document.querySelectorAll("#final-actions button").forEach((b) => {
        b.addEventListener("click", () => this.onFinalAction && this.onFinalAction(b.dataset.act));
      });
      // 鑑賞ツールバー
      document.querySelectorAll("#view-controls button").forEach((b) => {
        b.addEventListener("click", () => this.onViewAction && this.onViewAction(b.dataset.view));
      });
      // 完成後の組立画面の操作
      document.querySelectorAll("#completed-controls button").forEach((b) => {
        b.addEventListener("click", () => this.onCompletedAction && this.onCompletedAction(b.dataset.cact));
      });
    }

    /* ------------------------------------------------------------
       部品トレイ
       ------------------------------------------------------------ */
    renderTray(parts, placedIds) {
      this.el.traySc.innerHTML = "";
      this._cards = {};
      parts.forEach((part) => {
        const card = document.createElement("div");
        card.className = "part-card";
        card.dataset.partId = part.id;
        if (placedIds.has(part.id)) card.classList.add("placed");

        const img = document.createElement("img");
        img.src = part._thumb || "";
        img.alt = part.name;
        img.draggable = false;

        const name = document.createElement("div");
        name.className = "card-name";
        name.textContent = part.name;

        const order = document.createElement("div");
        order.className = "card-order";
        order.textContent = "N°" + String(part.order).padStart(2, "0");

        card.append(img, name, order);
        this._bindCardPointer(card, part);
        this.el.traySc.appendChild(card);
        this._cards[part.id] = card;
      });
    }

    _bindCardPointer(card, part) {
      card.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        card.setPointerCapture(e.pointerId);
        const start = { x: e.clientX, y: e.clientY };
        let dragging = false;

        const move = (ev) => {
          if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 6) {
            dragging = true;
            this.el.ghostImg.src = part._thumb || "";
            this.el.ghost.style.display = "block";
            card.style.opacity = "0.4";
          }
          if (dragging) {
            this.el.ghost.style.left = ev.clientX + "px";
            this.el.ghost.style.top = ev.clientY + "px";
          }
        };
        const up = (ev) => {
          card.removeEventListener("pointermove", move);
          card.removeEventListener("pointerup", up);
          card.removeEventListener("pointercancel", up);
          card.style.opacity = "";
          this.el.ghost.style.display = "none";
          if (dragging) {
            const target = document.elementFromPoint(ev.clientX, ev.clientY);
            if (target && target.id === "scene-canvas" && this.onDrop) {
              this.onDrop(part.id, ev.clientX, ev.clientY);
            }
          } else if (this.onCardClick) {
            this.onCardClick(part.id);
          }
        };
        card.addEventListener("pointermove", move);
        card.addEventListener("pointerup", up);
        card.addEventListener("pointercancel", up);
      });
    }

    setGlowCard(partId) {
      Object.values(this._cards || {}).forEach((c) => c.classList.remove("glow"));
      if (partId && this._cards[partId]) {
        const card = this._cards[partId];
        card.classList.add("glow");
        const sc = this.el.traySc;
        sc.scrollTo({ left: card.offsetLeft - sc.clientWidth / 2 + card.clientWidth / 2, behavior: "smooth" });
      }
    }

    markPlaced(partId) {
      const c = this._cards && this._cards[partId];
      if (c) { c.classList.remove("glow"); c.classList.add("placed"); }
    }

    /* ------------------------------------------------------------
       章 / 工程表示
       ------------------------------------------------------------ */
    setChapter(chInfo, done, total) {
      if (!chInfo) return;
      this.el.chapterTitle.textContent = chInfo.title;
      this.el.chapterSub.textContent = chInfo.subtitle;
      this.el.chapterNote.textContent = chInfo.note;
      this.el.progressFill.style.width = (total ? (done / total) * 100 : 0) + "%";
    }

    setStepWithinChapter(step, total, globalOrder, grandTotal, overrideLabel) {
      if (overrideLabel) {
        this.el.stepCounter.innerHTML = '<span class="sc-strong">' + overrideLabel + "</span>";
        return;
      }
      this.el.stepCounter.innerHTML =
        'STEP <span class="sc-strong">' + String(step).padStart(2, "0") +
        '</span> <span class="sc-total">/ ' + String(total).padStart(2, "0") + "</span>" +
        '<span class="sc-global">全体 ' + String(globalOrder).padStart(2, "0") +
        " / " + grandTotal + "</span>";
    }

    /** 部品情報(サポート表示) */
    showPartInfo(part) {
      this.el.partNameJa.textContent = part.name;
      this.el.partNameEn.textContent = part.nameEn;
      this._setBlock(this.el.blockRole, this.el.infoRole, part.role);
      this._setBlock(this.el.blockRel, this.el.infoRel, part.relation);
      this._setBlock(this.el.blockDesc, this.el.infoDesc, part.description);
      this._setBlock(this.el.blockTrivia, this.el.infoTrivia, part.trivia);
    }

    /** 章完了などの自由テキスト表示 */
    showPartInfoText(ja, en, body) {
      this.el.partNameJa.textContent = ja;
      this.el.partNameEn.textContent = en;
      this._setBlock(this.el.blockRole, this.el.infoRole, "");
      this._setBlock(this.el.blockRel, this.el.infoRel, "");
      this._setBlock(this.el.blockDesc, this.el.infoDesc, body);
      this._setBlock(this.el.blockTrivia, this.el.infoTrivia, "");
    }

    _setBlock(block, target, text) {
      if (text) { target.textContent = text; block.style.display = ""; }
      else { block.style.display = "none"; }
    }

    /* ------------------------------------------------------------
       工具
       ------------------------------------------------------------ */
    setActiveTool(tool) {
      // 学習モードの「次に使う工具」ハイライト(推奨表示)
      Object.entries(this.el.tools).forEach(([key, el]) => {
        el.classList.toggle("active", key === tool);
      });
    }

    /** ユーザーが選択中の工具(操作に使う) */
    setSelectedTool(tool) {
      Object.entries(this.el.tools).forEach(([key, el]) => {
        el.classList.toggle("selected", key === tool);
      });
    }

    /** 右パネル常設ガイド */
    setToolGuide(text) {
      if (this.el.toolGuide) this.el.toolGuide.textContent = text;
    }

    /** 常設「次の操作」表示(中央メッセージを見逃しても復帰できる) */
    setNextStep(mainText, toolText, oil) {
      if (this.el.rsMain) this.el.rsMain.textContent = mainText || "—";
      if (this.el.rsTool) this.el.rsTool.textContent = toolText || "—";
      if (this.el.rsOilRow) this.el.rsOilRow.hidden = !oil;
      document.body.classList.toggle("oiling", !!oil);
    }

    /* ------------------------------------------------------------
       カスタマイズ選択オーバーレイ
       spec = { title, sub, current:{key:value}, groups:[{key,label,en,options:[{value,name,en,swatch}]}], onConfirm(sel) }
       swatch が # / linear / radial で始まれば背景色、それ以外は SVG などの innerHTML。
       ------------------------------------------------------------ */
    showCustomizer(spec) {
      const ov = this.el.customOverlay, groupsEl = this.el.customGroups;
      if (!ov) { spec.onConfirm && spec.onConfirm(spec.current || {}); return; }
      this.el.customTitle.textContent = spec.title || "仕様を選ぶ";
      this.el.customSub.textContent = spec.sub || "";
      groupsEl.innerHTML = "";
      const sel = Object.assign({}, spec.current);
      (spec.groups || []).forEach((gp) => {
        const gEl = document.createElement("div");
        gEl.className = "custom-group";
        const h = document.createElement("h4");
        h.innerHTML = gp.label + " <span>" + gp.en + "</span>";
        gEl.appendChild(h);
        const opts = document.createElement("div");
        opts.className = "custom-opts";
        gp.options.forEach((o) => {
          const b = document.createElement("div");
          b.className = "custom-opt" + (sel[gp.key] === o.value ? " sel" : "");
          const sw = document.createElement("div");
          sw.className = "custom-swatch";
          if (/^(#|linear|radial|repeating)/.test(o.swatch)) sw.style.background = o.swatch;
          else sw.innerHTML = o.swatch;
          const nm = document.createElement("div"); nm.className = "co-name"; nm.textContent = o.name;
          const en = document.createElement("div"); en.className = "co-en"; en.textContent = o.en;
          b.append(sw, nm, en);
          b.addEventListener("click", () => {
            sel[gp.key] = o.value;
            opts.querySelectorAll(".custom-opt").forEach((x) => x.classList.remove("sel"));
            b.classList.add("sel");
          });
          opts.appendChild(b);
        });
        gEl.appendChild(opts);
        groupsEl.appendChild(gEl);
      });
      this.el.customConfirm.onclick = () => { ov.hidden = true; spec.onConfirm && spec.onConfirm(sel); };
      ov.hidden = false;
    }

    /* ------------------------------------------------------------
       モード切替
       ------------------------------------------------------------ */
    setMode(mode) {
      const exam = mode === "exam";
      document.body.classList.toggle("exam-ui", exam);
      this.el.btnLearning.classList.toggle("active", !exam);
      this.el.btnExam.classList.toggle("active", exam);
      this.el.modeBadge.textContent = exam ? "Exam Mode" : "Learning Mode";
      this.el.modeBadge.classList.toggle("exam", exam);
      this.el.learningInfo.hidden = exam;
      this.el.examInfo.hidden = !exam;
      if (exam) this.setActiveTool(null);
    }

    /* ------------------------------------------------------------
       CTA(章送り・巻上げ等のプライマリボタン)
       ------------------------------------------------------------ */
    setCTA(label, action) {
      this.el.cta.textContent = label;
      this.el.cta.hidden = false;
      this._ctaAction = action;
      // onCTA は _ctaAction を呼ぶよう assembly 側で ctaAction を持つが、
      // ここでは直接ラップしておく
      this.onCTA = () => action && action();
    }
    hideCTA() { this.el.cta.hidden = true; }

    /* ------------------------------------------------------------
       中央メッセージ
       ------------------------------------------------------------ */
    showMessage(text, kind = "ok", sub = "", duration = 1500) {
      this.el.msgLayer.innerHTML = "";
      const div = document.createElement("div");
      div.className = "msg" + (kind && kind !== "ok" ? " " + kind : "");
      div.style.animationDuration = duration + "ms";
      const main = document.createElement("span");
      main.className = "msg-main";
      main.textContent = text;
      div.appendChild(main);
      if (sub) {
        const s = document.createElement("span");
        s.className = "msg-sub";
        s.textContent = sub;
        div.appendChild(s);
      }
      this.el.msgLayer.appendChild(div);
      setTimeout(() => { if (div.parentNode) div.remove(); }, duration + 60);
    }

    /* ------------------------------------------------------------
       シネマティック
       ------------------------------------------------------------ */
    showCinematic(caption) {
      this.el.cinemaCap.textContent = caption;
      this.el.cinemaCap.classList.add("visible");
    }
    hideCinematic() { this.el.cinemaCap.classList.remove("visible"); }

    /** 完成CMモードへ(UIを隠す) */
    enterCinemaMode() { document.body.classList.add("cinema"); }
    exitCinemaMode() {
      document.body.classList.remove("cinema");
      this.el.finalCaption.classList.remove("visible");
    }

    /** 金属エッジを走る光の演出 */
    lightStreak() {
      const el = this.el.lightStreakEl;
      el.classList.remove("run");
      void el.offsetWidth; // リフローで再生をリセット
      el.classList.add("run");
    }

    /** 完成時の控えめな小キャプション(現在時刻同期の合図・自動フェード) */
    showCalibrationCaption(text) {
      const el = this.el.calibCap;
      if (!el) return;
      el.textContent = text;
      el.classList.add("visible");
      clearTimeout(this._calibCapTimer);
      this._calibCapTimer = setTimeout(() => el.classList.remove("visible"), 2200);
    }

    /** 最終キャプション "Cal.02 Automatic" + 完成後メニュー(5項目) */
    showFinalCaption(caliber) {
      this.el.finalCaption.querySelector(".fc-caliber").textContent = caliber;
      this.el.finalCaption.classList.add("visible");
    }
    hideFinalCaption() { this.el.finalCaption.classList.remove("visible"); }

    /* ------------------------------------------------------------
       モード選択画面(「モードを変えて最初から作る」後)
       ------------------------------------------------------------ */
    showModeSelect(onPick) {
      const ov = this.el.modeSelect;
      if (!ov) { onPick && onPick("learning"); return; }
      ov.hidden = false;
      const handler = (e) => {
        const b = e.target.closest("button[data-mode]");
        if (!b) return;
        ov.hidden = true;
        ov.removeEventListener("click", handler);
        onPick && onPick(b.dataset.mode);
      };
      ov.addEventListener("click", handler);
    }

    /* ------------------------------------------------------------
       完成後: モード切替の有効/無効
       ------------------------------------------------------------ */
    setModeToggleEnabled(enabled, tip) {
      [this.el.btnLearning, this.el.btnExam].forEach((b) => {
        if (!b) return;
        b.disabled = !enabled;
        b.classList.toggle("disabled", !enabled);
        if (!enabled && tip) b.title = tip; else b.removeAttribute("title");
      });
    }

    /* ------------------------------------------------------------
       完成後の組立画面(7-5): トレイ非表示・完成用コントロール表示
       ------------------------------------------------------------ */
    enterCompletedAssembly() {
      document.body.classList.remove("cinema");
      document.body.classList.add("completed-ui");
      this.el.finalCaption.classList.remove("visible");
      this.hideViewControls();
    }
    showCompletedControls() { if (this.el.completedControls) this.el.completedControls.hidden = false; }
    hideCompletedControls() { if (this.el.completedControls) this.el.completedControls.hidden = true; }

    /* ------------------------------------------------------------
       鑑賞ツールバー(表/裏/拡大/戻る)
       ------------------------------------------------------------ */
    showViewControls() { if (this.el.viewControls) this.el.viewControls.hidden = false; this.setZoomLabel(false); }
    hideViewControls() { if (this.el.viewControls) this.el.viewControls.hidden = true; }
    setZoomLabel(magnified) {
      if (this.el.zoomBtn) this.el.zoomBtn.textContent = magnified ? "拡大を解除" : "拡大鑑賞";
    }

    /* ------------------------------------------------------------
       解説ON: トグルスイッチ / ヒント / 点＋線＋説明ボックス
       ------------------------------------------------------------ */
    setExplainButton(on) {
      if (!this.el.explainBtn) return;
      this.el.explainBtn.setAttribute("aria-checked", on ? "true" : "false");
      const st = this.el.explainBtn.querySelector(".vcs-state");
      if (st) st.textContent = on ? "ON" : "OFF";
    }
    showExplainHint(on) { if (this.el.explainHint) this.el.explainHint.hidden = !on; }

    /** 説明ボックスの内容をセット(部品が変わったときだけ呼ぶ) */
    setCalloutContent(part) {
      if (!this.el.ecBox) return;
      this.el.ecNameJa.textContent = part.name;
      this.el.ecNameEn.textContent = part.nameEn || "";
      const secs = [];
      if (part.role) secs.push(["役割", part.role, "role"]);
      if (part.relation) secs.push(["伝達・関係", part.relation, ""]);
      if (part.description) secs.push(["解説", part.description, ""]);
      if (part.trivia) secs.push(["豆知識", part.trivia, ""]);
      this.el.ecSections.innerHTML = secs
        .map(([h, , cls]) => '<div class="ec-sec ' + cls + '"><h5></h5><p></p></div>').join("");
      const nodes = this.el.ecSections.querySelectorAll(".ec-sec");
      secs.forEach((s, i) => {
        nodes[i].querySelector("h5").textContent = s[0];
        nodes[i].querySelector("p").textContent = s[1];
      });
    }
    /** 点・線・ボックスの位置を更新(毎フレーム) */
    positionCallout(dot, box, line2) {
      if (!this.el.callout) return;
      if (this.el.callout.hidden) this.el.callout.hidden = false;
      this.el.ecDot.style.left = dot.x + "px";
      this.el.ecDot.style.top = dot.y + "px";
      this.el.ecBox.style.left = box.x + "px";
      this.el.ecBox.style.top = box.y + "px";
      this.el.ecLine.setAttribute("x1", dot.x);
      this.el.ecLine.setAttribute("y1", dot.y);
      this.el.ecLine.setAttribute("x2", line2.x);
      this.el.ecLine.setAttribute("y2", line2.y);
    }
    /** 説明ボックスの実寸(線の接続先計算用) */
    calloutBoxSize() {
      const b = this.el.ecBox;
      return b ? { w: b.offsetWidth || 258, h: b.offsetHeight || 160 } : { w: 258, h: 160 };
    }
    hideCallout() { if (this.el.callout) this.el.callout.hidden = true; }

    /** レスポンシブなボタン(仕様を選び直す) */
    showRecustomize(on, onClick) {
      const b = this.el.recustomizeBtn;
      if (!b) return;
      b.hidden = !on;
      if (on && onClick) b.onclick = onClick;
    }

    /** ごく稀な流れ星(小さく・細く・周辺・ランダム) */
    triggerShootingStar() {
      const el = this.el.shootingStar;
      if (!el) return;
      const ang = 12 + Math.random() * 28;
      const len = 46 + Math.random() * 46;
      const dx = 70 + Math.random() * 80, dy = 26 + Math.random() * 40;
      // 周辺(上部・左右端)にだけ出し、中央(時計)を横切らない
      let leftPct, topPct;
      if (Math.random() < 0.5) { leftPct = 6 + Math.random() * 22; topPct = 6 + Math.random() * 22; }
      else { leftPct = 64 + Math.random() * 26; topPct = 8 + Math.random() * 22; }
      el.style.left = leftPct + "%"; el.style.top = topPct + "%";
      el.style.width = len + "px";
      el.style.setProperty("--star-ang", ang + "deg");
      el.style.setProperty("--star-dx", dx + "px");
      el.style.setProperty("--star-dy", dy + "px");
      el.classList.remove("run"); void el.offsetWidth; el.classList.add("run");
    }
  }

  WatchSim.UI = UI;
})();
