@echo off
chcp 65001 >nul
echo ========================================
echo   八爪鱼 GitHub打包工具
echo ========================================
echo.

cd /d "%~dp0"

echo 正在创建压缩包...

:: 使用PowerShell压缩（排除私有文件）
powershell -Command "$exclude = @('PRIVATE', 'node_modules', 'data', '.env'); $files = Get-ChildItem -Path . | Where-Object { $exclude -notcontains $_.Name }; Compress-Archive -Path $files.FullName -DestinationPath '..\octopus-github.zip' -Force"

echo.
echo ========================================
echo   完成！
echo   压缩包位置: %~dp0..\octopus-github.zip
echo ========================================
echo.
echo 包含的文件:
echo   - README.md (说明文件)
echo   - LICENSE (开源协议)
echo   - .gitignore (排除配置)
echo   - .env.example (配置示例)
echo   - src/ (源代码)
echo   - scripts/ (脚本)
echo   - docs/ (文档)
echo.
echo 排除的文件:
echo   - PRIVATE/ (核心私有)
echo   - node_modules/ (依赖)
echo   - data/ (数据库)
echo   - .env (密钥)
echo.
pause
