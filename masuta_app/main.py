#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MasuTa! 打刻アプリ
Phase 3: 事業所管理者向け Windows デスクトップアプリ
"""

import sys
import os
import threading

# ============================================================
# パス解決（PyInstaller バンドル対応）
# ============================================================
def resource_path(*parts):
    if getattr(sys, 'frozen', False):
        base = sys._MEIPASS
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, *parts)

GUI_DIR = resource_path('gui')
PORT    = 37731

# ============================================================
# ローカル HTTP サーバー（CORS 回避のため file:// ではなく localhost を使用）
# ============================================================
try:
    from bottle import Bottle, static_file, run as bottle_run
except ImportError:
    print("[ERROR] bottle が見つかりません。pip install bottle を実行してください。")
    sys.exit(1)

_bottle = Bottle()

@_bottle.route('/')
def index():
    return static_file('index.html', root=GUI_DIR)

@_bottle.route('/<filepath:path>')
def assets(filepath):
    return static_file(filepath, root=GUI_DIR)

def _start_server():
    bottle_run(_bottle, host='127.0.0.1', port=PORT, quiet=True)

# ============================================================
# メイン
# ============================================================
def main():
    try:
        import webview
    except ImportError:
        print("[ERROR] pywebview が見つかりません。pip install pywebview を実行してください。")
        sys.exit(1)

    # バックグラウンドでローカルサーバー起動
    t = threading.Thread(target=_start_server, daemon=True)
    t.start()

    # WebView ウィンドウを開く
    window = webview.create_window(
        title           = 'MasuTa! 打刻アプリ',
        url             = f'http://127.0.0.1:{PORT}/',
        width           = 1280,
        height          = 800,
        min_size        = (960, 640),
        background_color= '#f1f5f9',
        text_select     = False,
    )
    webview.start(debug=False)

if __name__ == '__main__':
    main()
