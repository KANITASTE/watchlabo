/* ============================================================
   main.js — エントリーポイント
   ムーブメント定義(JSON)を読み込み、各モジュールを起動する。
   別のムーブメントに差し替える場合は MOVEMENT_URL を変えるだけ。
   ============================================================ */
(function () {
  "use strict";

  const MOVEMENT_URL = "movement/cal02.json";

  /** 致命的エラー表示(JSON読込失敗など) */
  function fatal(message) {
    const el = document.getElementById("fatal-error");
    el.querySelector("p").textContent = message;
    el.classList.add("visible");
    document.getElementById("loading").classList.add("done");
  }

  async function boot() {
    // Three.js の読込確認(CDN障害時)
    if (typeof THREE === "undefined") {
      fatal("Three.js を読み込めませんでした。ネットワーク接続を確認してください。");
      return;
    }

    // ムーブメント定義の読込
    let data;
    try {
      const res = await fetch(MOVEMENT_URL);
      if (!res.ok) throw new Error(res.status);
      data = await res.json();
    } catch (e) {
      fatal("ムーブメント定義(" + MOVEMENT_URL + ")を読み込めませんでした。" +
            "ローカルで開く場合は簡易サーバー(例: python3 -m http.server)経由でアクセスしてください。");
      return;
    }

    // 各モジュール起動
    const canvas = document.getElementById("scene-canvas");
    const sceneMgr = new WatchSim.SceneManager(canvas);
    const ui = new WatchSim.UI();
    const assembly = new WatchSim.Assembly(sceneMgr, ui, data);

    assembly.init();     // メッシュ生成・サムネイル・進捗復元
    sceneMgr.start();    // 描画ループ開始

    // デバッグ・拡張用の参照(コンソールから操作可能)
    WatchSim.app = { sceneMgr, ui, assembly };

    // ローディング画面を閉じる
    document.getElementById("loading").classList.add("done");
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
