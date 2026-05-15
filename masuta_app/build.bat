@echo off
chcp 65001 > nul
echo =============================================
echo  MasuTa! 打刻アプリ ビルド
echo =============================================
echo.

:: 依存パッケージ確認
pip show pywebview > nul 2>&1
if errorlevel 1 (
    echo [セットアップ] 依存パッケージをインストールします...
    pip install -r requirements.txt
)

echo [ビルド] exe を作成しています...
pyinstaller ^
  --onefile ^
  --windowed ^
  --name "MasuTa" ^
  --add-data "gui;gui" ^
  --hidden-import bottle ^
  --hidden-import webview ^
  main.py

echo.
if exist "dist\MasuTa.exe" (
    echo [完了] dist\MasuTa.exe が作成されました。
    echo        各事業所に配布してください。
) else (
    echo [エラー] ビルドに失敗しました。
)
echo.
pause
