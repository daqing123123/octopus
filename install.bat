@echo off
set PATH=C:\Program Files\nodejs;%PATH%
set npm_config_registry=https://registry.npmmirror.com

echo Installing backend dependencies...
cd /d %~dp0src\backend
call npm install

echo Installing frontend dependencies...
cd /d %~dp0src\frontend
call npm install

echo Done!
