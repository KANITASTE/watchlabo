/* ============================================================
   ui.js — DOM UI 管理 (Cal.02)
   章表示 / サポート表示 / 工具 / 部品トレイ /
   中央メッセージ / モード切替 / CTA / シネマティック演出
   ============================================================ */
(function () {
  "use strict";
  window.WatchSim = window.WatchSim || {};

  /* ============================================================
     竜頭アート(共通定義)
     時計の側面から見た「横向き」の竜頭を1つの定義から描く。
     仕様選択の見本(スウォッチ)・完成予想プレビューが同じ形を共有し、
     3Dの竜頭(parts.js buildCrown)とも見た目を揃える。
     構造: ケース側の短い接続軸 → 円筒本体 → 側面の細かい溝 →
           金属側面ハイライト → 外側端面 → デザイン装飾。
     style: "fluted"(メダリオン=溝＋端面の金装飾) / "cabochon"(青い石)
     ============================================================ */
  WatchSim.CrownArt = {
    /** cx,cy 中心 / s 単位長(px)。斜め(約35°)から見た竜頭。
        外側の円い端面が楕円として見え、円筒本体とケース側への接続方向も分かる。
        style: "fluted"(端面の金メダリオン) / "cabochon"(端面に埋まった低い青の半球) */
    fragment(cx, cy, s, style) {
      const X = (x) => (cx + x * s).toFixed(2);
      const Y = (y) => (cy + y * s).toFixed(2);
      const N = (v) => (v * s).toFixed(2);
      const Ff = [1.3, 0.35], rx = 1.05, ry = 1.7;      // 外側端面(手前)の中心と半径
      const dx = -2.0, dy = -0.85;                       // 奥行き方向(ケース側=左奥へ)
      const Fb = [Ff[0] + dx, Ff[1] + dy];               // 奥側端面の中心
      const ftop = [Ff[0], Ff[1] - ry], fbot = [Ff[0], Ff[1] + ry];
      const btop = [Fb[0], Fb[1] - ry], bbot = [Fb[0], Fb[1] + ry];
      const P = (p) => X(p[0]) + "," + Y(p[1]);
      const L = (t, a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      let out = "";
      // 1) ケース側への接続軸(左奥へ伸びる) — 接続方向を示す
      out += '<line x1="' + X(Fb[0]) + '" y1="' + Y(Fb[1]) + '" x2="' + X(Fb[0] + dx * 0.9) + '" y2="' + Y(Fb[1] + dy * 0.9) + '" stroke="#7f858f" stroke-width="' + N(1.0) + '" stroke-linecap="round"/>';
      // 2) 奥側端面(暗め・ほぼ隠れる)
      out += '<ellipse cx="' + X(Fb[0]) + '" cy="' + Y(Fb[1]) + '" rx="' + N(rx) + '" ry="' + N(ry) + '" fill="#8b909a"/>';
      // 3) 円筒本体(奥端面→手前端面をつなぐ帯) + 上ハイライト・下シャドウ
      out += '<polygon points="' + P(btop) + ' ' + P(ftop) + ' ' + P(fbot) + ' ' + P(bbot) + '" fill="#b4bac4"/>';
      out += '<polygon points="' + P(btop) + ' ' + P(ftop) + ' ' + P(L(0, [Ff[0], Ff[1] - ry * 0.5], ftop)) + ' ' + P([Fb[0], Fb[1] - ry * 0.5]) + '" fill="rgba(255,255,255,0.30)"/>';
      out += '<polygon points="' + P([Fb[0], Fb[1] + ry * 0.5]) + ' ' + P([Ff[0], Ff[1] + ry * 0.5]) + ' ' + P(fbot) + ' ' + P(bbot) + '" fill="rgba(0,0,0,0.18)"/>';
      // 4) 側面の溝(円周方向・数本)。奥→手前へ均等配置。
      const ridges = style === "cabochon" ? 4 : 6;
      out += '<g stroke="#6c737d" stroke-width="' + N(0.1) + '" stroke-linecap="round">';
      for (let i = 1; i < ridges; i++) {
        const t = i / ridges;
        const tp = L(t, btop, ftop), bp = L(t, bbot, fbot);
        out += '<line x1="' + X(tp[0]) + '" y1="' + Y(tp[1]) + '" x2="' + X(bp[0]) + '" y2="' + Y(bp[1]) + '"/>';
      }
      out += "</g>";
      // 5) 外側端面(手前・明るい金属面)
      out += '<ellipse cx="' + X(Ff[0]) + '" cy="' + Y(Ff[1]) + '" rx="' + N(rx) + '" ry="' + N(ry) + '" fill="#cdd3db" stroke="#7f858f" stroke-width="' + N(0.08) + '"/>';
      if (style === "cabochon") {
        // 端面に埋め込まれた低い半球のカボション + 金属枠(前へ大きく飛び出さない)
        out += '<ellipse cx="' + X(Ff[0]) + '" cy="' + Y(Ff[1]) + '" rx="' + N(0.62) + '" ry="' + N(1.02) + '" fill="none" stroke="#c9a85f" stroke-width="' + N(0.16) + '"/>';
        out += '<ellipse cx="' + X(Ff[0]) + '" cy="' + Y(Ff[1]) + '" rx="' + N(0.5) + '" ry="' + N(0.9) + '" fill="#274a9e"/>';
        out += '<ellipse cx="' + X(Ff[0] - 0.12) + '" cy="' + Y(Ff[1] - 0.34) + '" rx="' + N(0.13) + '" ry="' + N(0.3) + '" fill="rgba(255,255,255,0.6)"/>';
      } else {
        // メダリオン: 端面中央の金の装飾
        out += '<ellipse cx="' + X(Ff[0]) + '" cy="' + Y(Ff[1]) + '" rx="' + N(0.55) + '" ry="' + N(0.95) + '" fill="#c9a85f" stroke="#e6d29a" stroke-width="' + N(0.1) + '"/>';
      }
      return out;
    },
    /** 見本用の独立SVG(横向き) */
    svg(style, w, h) {
      w = w || 58; h = h || 26;
      const s = h / 4.6;
      const cx = w * 0.46, cy = h * 0.5;
      return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
        this.fragment(cx, cy, s, style) + "</svg>";
    }
  };

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
        verifyLayer: $("verify-layer"),
        modeBadge: $("mode-badge"),
        cta: $("cta-btn"),
        resetBtn: $("reset-btn"),
        undoBtn: $("undo-btn"),
        hintBtn: $("hint-btn"),
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
        customCard: $("custom-card"),
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
      this.onUndo = null;         // () => void 一つ前の工程へ戻る
      this.onHint = null;         // () => void Exam Mode: 次の配置場所をヒント表示

      this._bindStatic();
    }

    _bindStatic() {
      this.el.btnLearning.addEventListener("click", () => this.onModeChange && this.onModeChange("learning"));
      this.el.btnExam.addEventListener("click", () => this.onModeChange && this.onModeChange("exam"));
      this.el.cta.addEventListener("click", () => this.onCTA && this.onCTA());
      this.el.resetBtn.addEventListener("click", () => this.onReset && this.onReset());
      if (this.el.undoBtn) this.el.undoBtn.addEventListener("click", () => this.onUndo && this.onUndo());
      if (this.el.hintBtn) this.el.hintBtn.addEventListener("click", () => this.onHint && this.onHint());
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
      const ov = this.el.customOverlay, groupsEl = this.el.customGroups, card = this.el.customCard || this.el.customGroups.parentNode;
      if (!ov) { spec.onConfirm && spec.onConfirm(spec.current || {}); return; }
      this.el.customTitle.textContent = spec.title || "仕様を選ぶ";
      this.el.customSub.textContent = spec.sub || "";
      groupsEl.innerHTML = "";

      // 免責＋同意チェック(TOP画面のみ)。チェックしないと開始ボタンをdisabledにする。
      const _oldDz = card && card.querySelector(".custom-disclaimer");
      if (_oldDz) _oldDz.remove();
      let ackOk = true;
      if (spec.disclaimer && card) {
        const dz = spec.disclaimer;
        ackOk = !dz.requireAck || !!dz.acked;
        const banner = document.createElement("div");
        banner.className = "custom-disclaimer";
        const dp = document.createElement("p");
        dp.className = "cd-text"; dp.textContent = dz.text;
        banner.appendChild(dp);
        const lab = document.createElement("label");
        lab.className = "cd-check";
        const cb = document.createElement("input");
        cb.type = "checkbox"; cb.checked = ackOk;
        const cs = document.createElement("span");
        cs.textContent = dz.checkLabel || "上記内容を理解しました";
        lab.append(cb, cs);
        banner.appendChild(lab);
        card.insertBefore(banner, groupsEl);
        cb.addEventListener("change", () => {
          const on = cb.checked;
          this.el.customConfirm.disabled = !on;
          this.el.customConfirm.classList.toggle("disabled", !on);
          if (on && dz.onAck) dz.onAck();
        });
      }
      const sel = Object.assign({}, spec.current);
      const twoCol = !!spec.preview;
      if (card) card.classList.toggle("two-col", twoCol);

      // ---- レイアウト: PCは左=プレビュー+選択仕様+決定 / 右=選択項目(2列) ----
      let leftCol = null, rightCol = null, groupTarget = groupsEl;
      let previewHost = null, summaryEl = null;
      if (twoCol) {
        const cols = document.createElement("div");
        cols.className = "custom-cols";
        leftCol = document.createElement("div"); leftCol.className = "custom-col-left";
        rightCol = document.createElement("div"); rightCol.className = "custom-col-right";
        cols.append(leftCol, rightCol);

        if (spec.lockNote) {
          const ln = document.createElement("div");
          ln.className = "custom-locknote";
          ln.textContent = spec.lockNote;
          leftCol.appendChild(ln);
        }
        previewHost = document.createElement("div");
        previewHost.className = "spec-preview";
        leftCol.appendChild(previewHost);
        const note = document.createElement("div");
        note.className = "sp-note"; note.textContent = "完成予想 · Preview";
        leftCol.appendChild(note);
        summaryEl = document.createElement("div");
        summaryEl.className = "spec-summary";
        leftCol.appendChild(summaryEl);

        groupsEl.appendChild(cols);
        groupTarget = rightCol;
      } else if (spec.lockNote) {
        const ln = document.createElement("div");
        ln.className = "custom-locknote";
        ln.textContent = spec.lockNote;
        groupsEl.appendChild(ln);
      }

      /* ---- 完成予想プレビュー(選択内容をSVGで正確に反映) ---- */
      const buildPreviewSVG = (s) => {
        const cx = 80, cy = 78, R = 62;
        const DIALG = { silver: ["#f4f0e7", "#d6d2c5"], slate: ["#3d434b", "#191d22"], navy: ["#2a3b60", "#101a30"] };
        const dg = DIALG[s.dial] || DIALG.silver;
        const light = (s.dial === "silver");
        const ink = light ? "#3a3f47" : "#dfe4ee";
        const idxCol = light ? "#262b33" : "#eef2fa";
        const HANDC = { blued: "#3a5bd6", gold: "#d8b56a", rhodium: "#e4e8ee" };
        const hc = HANDC[s.handColor] || HANDC.blued;
        const BEZEL = { polished: { o: "#e4e8ee", i: "#8b909a" }, gold: { o: "#e2c579", i: "#9c7d3f" }, fluted: { o: "#dfe4ec", i: "#969ca6" } };
        const bz = BEZEL[s.bezel] || BEZEL.polished;
        const ROMAN = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
        const ARABIC = ["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];

        // インデックス(12箇所それぞれ正しい位置・向き)
        let idx = "";
        for (let h = 0; h < 12; h++) {
          if (h === 3) continue;               // 3時はスモールセコンド
          const th = h * Math.PI / 6, rr = R * 0.80;
          const x = cx + Math.sin(th) * rr, y = cy - Math.cos(th) * rr;
          if (s.dialIndex === "roman" || s.dialIndex === "arabic") {
            const lab = (s.dialIndex === "roman" ? ROMAN : ARABIC)[h];
            idx += '<text x="' + x.toFixed(1) + '" y="' + (y + 3.4).toFixed(1) + '" text-anchor="middle" font-family="Times New Roman, serif" font-size="' + (s.dialIndex === "roman" ? 9 : 10) + '" fill="' + idxCol + '">' + lab + '</text>';
          } else {
            const isC = h % 3 === 0, len = isC ? 8.5 : 6, w = 2.4;
            idx += '<rect x="' + (x - w / 2).toFixed(1) + '" y="' + (y - len / 2).toFixed(1) + '" width="' + w + '" height="' + len + '" rx="1" fill="' + idxCol + '" transform="rotate(' + (h * 30) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"/>';
          }
        }

        // 針(形状ごとに輪郭が違う)
        const hand = (th, len, bw) => {
          const dxu = Math.sin(th), dyu = -Math.cos(th), pxu = Math.cos(th), pyu = Math.sin(th);
          const tx = cx + dxu * len, ty = cy + dyu * len;
          if (s.handShape === "dauphine") {
            const b1x = cx + pxu * bw, b1y = cy + pyu * bw, b2x = cx - pxu * bw, b2y = cy - pyu * bw;
            return '<polygon points="' + b1x.toFixed(1) + ',' + b1y.toFixed(1) + ' ' + tx.toFixed(1) + ',' + ty.toFixed(1) + ' ' + b2x.toFixed(1) + ',' + b2y.toFixed(1) + '" fill="' + hc + '"/>';
          }
          const ra = 0.80, rx = cx + dxu * len * ra, ry = cy + dyu * len * ra;
          return '<line x1="' + cx + '" y1="' + cy + '" x2="' + rx.toFixed(1) + '" y2="' + ry.toFixed(1) + '" stroke="' + hc + '" stroke-width="' + bw + '" stroke-linecap="round"/>' +
            '<circle cx="' + rx.toFixed(1) + '" cy="' + ry.toFixed(1) + '" r="' + (bw * 1.7).toFixed(1) + '" fill="none" stroke="' + hc + '" stroke-width="1.4"/>' +
            '<line x1="' + rx.toFixed(1) + '" y1="' + ry.toFixed(1) + '" x2="' + tx.toFixed(1) + '" y2="' + ty.toFixed(1) + '" stroke="' + hc + '" stroke-width="1.3" stroke-linecap="round"/>';
        };
        const hourTh = 300 * Math.PI / 180, minTh = 66 * Math.PI / 180;

        // ベゼル
        let bezelSVG;
        if (s.bezel === "fluted") {
          bezelSVG = '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R + 4) + '" fill="none" stroke="' + bz.o + '" stroke-width="6" stroke-dasharray="2.4 2.6"/><circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="' + bz.i + '" stroke-width="1.2"/>';
        } else {
          bezelSVG = '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R + 3) + '" fill="none" stroke="' + bz.o + '" stroke-width="6"/><circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="' + bz.i + '" stroke-width="1.2"/>';
        }

        // 竜頭(横から見た形状・CrownArt共通定義から生成。見本・3Dと形を揃える)
        const crownSVG = WatchSim.CrownArt.fragment(cx + R + 6, cy, 3.4, s.crown === "cabochon" ? "cabochon" : "fluted");

        // スモールセコンド(3時)
        const ssx = cx + R * 0.44;
        const subdial = '<circle cx="' + ssx.toFixed(1) + '" cy="' + cy + '" r="8.5" fill="none" stroke="' + ink + '" stroke-width="0.8" opacity="0.5"/><line x1="' + ssx.toFixed(1) + '" y1="' + cy + '" x2="' + ssx.toFixed(1) + '" y2="' + (cy - 6.5) + '" stroke="' + hc + '" stroke-width="1"/><circle cx="' + ssx.toFixed(1) + '" cy="' + cy + '" r="1.2" fill="' + hc + '"/>';

        return '<svg width="160" height="150" viewBox="0 0 160 150">' +
          '<defs><radialGradient id="spdg" cx="40%" cy="34%" r="72%"><stop offset="0" stop-color="' + dg[0] + '"/><stop offset="1" stop-color="' + dg[1] + '"/></radialGradient></defs>' +
          '<line x1="' + (cx + R - 2) + '" y1="' + cy + '" x2="' + (cx + R + 3) + '" y2="' + cy + '" stroke="#8b909a" stroke-width="5"/>' +
          crownSVG + bezelSVG +
          '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R - 1) + '" fill="url(#spdg)"/>' +
          idx + subdial +
          hand(hourTh, R * 0.5, 2.7) + hand(minTh, R * 0.72, 2.0) +
          '<circle cx="' + cx + '" cy="' + cy + '" r="3" fill="' + hc + '"/></svg>';
      };

      const updatePreview = () => {
        if (previewHost) previewHost.innerHTML = buildPreviewSVG(sel);
        if (summaryEl) {
          summaryEl.innerHTML = (spec.groups || []).map((gp) => {
            const o = gp.options.find((op) => op.value === sel[gp.key]);
            return '<div class="ss-row"><span class="ss-k">' + gp.label + '</span><span class="ss-v">' + (o ? o.name : "—") + '</span></div>';
          }).join("");
        }
      };

      // 1グループ(例: 文字盤の色)のDOMを組み立てて返す
      const renderGroup = (gp) => {
        const gEl = document.createElement("div");
        gEl.className = "custom-group" + (gp.locked ? " locked" : "");
        const h = document.createElement("h4");
        h.innerHTML = gp.label + " <span>" + gp.en + "</span>" +
          (gp.locked ? '<span class="lock-tag">🔒 取付済み・変更不可</span>' : "");
        gEl.appendChild(h);
        const opts = document.createElement("div");
        opts.className = "custom-opts";
        gp.options.forEach((o) => {
          const b = document.createElement("div");
          b.className = "custom-opt" + (sel[gp.key] === o.value ? " sel" : "") + (gp.locked ? " disabled" : "");
          const sw = document.createElement("div");
          const isBg = /^(#|linear|radial|repeating)/.test(o.swatch);
          sw.className = "custom-swatch" + (isBg ? "" : " svg");
          if (isBg) sw.style.background = o.swatch;
          else sw.innerHTML = o.swatch;
          const nm = document.createElement("div"); nm.className = "co-name"; nm.textContent = o.name;
          const en = document.createElement("div"); en.className = "co-en"; en.textContent = o.en;
          b.append(sw, nm, en);
          if (!gp.locked) {
            b.addEventListener("click", () => {
              sel[gp.key] = o.value;
              opts.querySelectorAll(".custom-opt").forEach((x) => x.classList.remove("sel"));
              b.classList.add("sel");
              updatePreview();
            });
          }
          opts.appendChild(b);
        });
        gEl.appendChild(opts);
        return gEl;
      };

      // ブロック(文字盤 / 針 / ベゼル / 竜頭)ごとに区切って描画する。
      // spec.blocks が無ければ従来どおりグループを平坦に並べる。
      if (spec.blocks && spec.blocks.length) {
        const byKey = {};
        (spec.groups || []).forEach((g) => { byKey[g.key] = g; });
        spec.blocks.forEach((bl) => {
          const keys = (bl.keys || []).filter((k) => byKey[k]);
          if (!keys.length) return;
          const anyLocked = keys.some((k) => byKey[k].locked);
          const blockEl = document.createElement("div");
          blockEl.className = "spec-block" + (anyLocked ? " locked" : "");
          const head = document.createElement("div");
          head.className = "sb-head";
          head.innerHTML =
            '<span class="sb-icon">' + (bl.icon || "") + "</span>" +
            '<span class="sb-title">' + bl.title + "</span>" +
            (bl.en ? '<span class="sb-en">' + bl.en + "</span>" : "") +
            (anyLocked ? '<span class="sb-lock">🔒</span>' : "");
          blockEl.appendChild(head);
          const bodyEl = document.createElement("div");
          bodyEl.className = "sb-body";
          keys.forEach((k) => bodyEl.appendChild(renderGroup(byKey[k])));
          blockEl.appendChild(bodyEl);
          groupTarget.appendChild(blockEl);
        });
      } else {
        (spec.groups || []).forEach((gp) => groupTarget.appendChild(renderGroup(gp)));
      }
      updatePreview();

      // 決定ボタン。左カラム(プレビュー側)へ寄せ、常に見えるようにする。
      // confirmLabel に改行(\n)があれば明示的に複数行バタンとして描画(自動改行に任せない)。
      const cLabel = spec.confirmLabel || "この仕様で仕立てる";
      if (cLabel.indexOf("\n") >= 0) {
        this.el.customConfirm.innerHTML = "";
        cLabel.split("\n").forEach((ln) => {
          const sp = document.createElement("span");
          sp.className = "cc-line";
          sp.textContent = ln;
          this.el.customConfirm.appendChild(sp);
        });
      } else {
        this.el.customConfirm.textContent = cLabel;
      }
      this.el.customConfirm.onclick = () => { ov.hidden = true; spec.onConfirm && spec.onConfirm(sel); };
      // 同意チェック未完了なら開始ボタンを無効(見た目も無効状態)。disabledなボタンはonclickが発火しない。
      this.el.customConfirm.disabled = !ackOk;
      this.el.customConfirm.classList.toggle("disabled", !ackOk);
      if (twoCol && leftCol) leftCol.appendChild(this.el.customConfirm);
      else if (card) card.appendChild(this.el.customConfirm);
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

    /** 「一つ前の工程へ戻る」ボタンの表示制御 */
    setUndoAvailable(on) {
      if (this.el.undoBtn) this.el.undoBtn.hidden = !on;
    }

    /* ------------------------------------------------------------
       中央メッセージ
       opts.persistent = true のときは自動消去せず、クリックで閉じる(重要な説明・動作確認結果用)。
       ------------------------------------------------------------ */
    showMessage(text, kind = "ok", sub = "", duration = 1500, opts = {}) {
      // 再操作が必要な警告(error)は必ずpersistent(自動で消えない・「閉じる」ボタンでのみ閉じる)。
      // 成功・軽い案内(ok/accent/oil)は従来どおり自動消去。
      const persistent = !!opts.persistent || kind === "error";

      // 同じ警告が連続発生した場合: 何枚も重ねず、既存の警告を軽い揺れで再通知する。
      if (persistent) {
        const existing = this.el.msgLayer.querySelector(".msg.persistent");
        if (existing && existing.dataset.mtext === text && existing.dataset.msub === (sub || "")) {
          existing.classList.remove("shake"); void existing.offsetWidth; existing.classList.add("shake");
          return;
        }
      }

      this.el.msgLayer.innerHTML = "";
      const div = document.createElement("div");
      div.className = "msg" + (kind && kind !== "ok" ? " " + kind : "") + (persistent ? " persistent" : "");
      div.dataset.mtext = text; div.dataset.msub = sub || "";
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
      if (persistent) {
        // 自動では消えない。背景クリック・hover・本体クリックでは閉じず、
        // 専用の「閉じる」ボタンでのみ閉じる。
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "msg-dismiss";
        btn.textContent = "閉じる";
        btn.addEventListener("click", (e) => { e.stopPropagation(); if (div.parentNode) div.remove(); });
        div.appendChild(btn);
        div.style.pointerEvents = "auto";
        div.style.animation = "msg-appear 0.5s var(--ease) forwards";
      } else {
        div.style.animationDuration = duration + "ms";
        setTimeout(() => { if (div.parentNode) div.remove(); }, duration + 60);
      }
      this.el.msgLayer.appendChild(div);
    }

    /* ------------------------------------------------------------
       動作確認専用の常設メッセージ(persistent)
       通常通知(showMessage)とは別レイヤー。マウスオーバー・hover通知では消えず、
       クリックしたときだけ閉じる。画面下部中央(トレイの少し上)に小さく表示。
       ------------------------------------------------------------ */
    showVerifyMessage(text, sub = "", kind = "accent", opts = {}) {
      const layer = this.el.verifyLayer;
      if (!layer) { this.showMessage(text, kind, sub, 2200, { persistent: true }); return; }
      const closable = opts.closable !== false;   // 既定で「閉じる」ボタンを付ける
      layer.innerHTML = "";               // verify専用レイヤー。通常通知(msgLayer)とは分離。
      const div = document.createElement("div");
      div.className = "vmsg" + (kind && kind !== "ok" ? " " + kind : "");
      const main = document.createElement("div");
      main.className = "vmsg-main";
      // 改行(\n)を<br>で明示的に反映(例:「連動を/確認しました」)
      String(text).split("\n").forEach((ln, i) => {
        if (i) main.appendChild(document.createElement("br"));
        main.appendChild(document.createTextNode(ln));
      });
      div.appendChild(main);
      if (sub) {
        const s = document.createElement("div");
        s.className = "vmsg-sub";
        s.textContent = sub;
        div.appendChild(s);
      }
      if (closable) {
        const close = document.createElement("button");
        close.type = "button";
        close.className = "vmsg-close";
        close.textContent = "閉じる";
        // 「閉じる」ボタンでのみ閉じる。本体・背景・hoverでは閉じず、自動でも閉じない。
        // 閉じたときだけ onClose を呼び、次工程へ進む(二重進行しないようボタンはdivごと除去される)。
        close.addEventListener("click", (e) => {
          e.stopPropagation();
          if (div.parentNode) div.remove();
          if (opts.onClose) opts.onClose();
        });
        div.appendChild(close);
      }
      layer.appendChild(div);
    }
    hideVerifyMessage() { if (this.el.verifyLayer) this.el.verifyLayer.innerHTML = ""; }

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

    /** 完成後メニュー(4項目)を単独で再表示する(鑑賞からの帰還用) */
    showFinalMenu(caliber) {
      document.body.classList.remove("completed-ui");
      document.body.classList.add("cinema");
      this.hideViewControls();
      this.hideCompletedControls();
      this.showFinalCaption(caliber);
    }

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
      // 点 → ボックスへの細い直線
      this.el.ecLine.setAttribute("points", dot.x + "," + dot.y + " " + line2.x + "," + line2.y);
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
