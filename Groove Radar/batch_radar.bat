@echo off
mode 110,20
color 1F
title Groove Radar Data Lua Script Generator
pushd %~dp0
set /a numSongs=0
if not exist _radar_cache (mkdir _radar_cache)
if exist "%~dp0radar.txt" del "%~dp0radar.txt"
cls
echo.
echo		Welcome to DDR A-like Groove Radar Data Generator. This requires Perl (e.g. Strawberry Perl)
echo		installed first before proceeding.
echo.
echo		Please note that if this is your first time or if you deleted the _radar_cache folder,
echo		it will take some time to finish.
echo.
echo		For updating radar data, just delete either at least one folder inside _radar_cache folder
echo		or just the lua file of the song inside _radar_cache sub-folders
echo.
echo		Press any key to begin.
pause >nul
for /D %%H in (*.*) do (
	cls
	echo.
	echo		Checking the total number of simfiles to process...
	cd "%%H"
	for /D %%I in (*.*) do (
		cd "%%I"
		for /F "delims=" %%J in ('dir /o-e /b /a-d') do (
			if "%%~xJ"==".SSC" (
				ren "%%J" "%%~nJ.ssc"
				set /a numSongs = numSongs+1
			)
			if "%%~xJ"==".SM" (
				ren "%%J" "%%~nJ.sm"
				if not exist "*.ssc" (
					set /a numSongs = numSongs+1
				)
			)
			if "%%~xJ"==".ssc" (
				set /a numSongs = numSongs+1
			)
			if "%%~xJ"==".sm" (
				if not exist "*.ssc" (
					set /a numSongs = numSongs+1
				)
			)
		)
		cd..
	)
	cd..
)
cls
echo.
echo		Total number of simfiles to process: %numSongs%
ping -n 4 127.0.0.1>nul
set /a index=0
set STARTTIME=%TIME%
for /D %%H in (*.*) do (
	if not "%%H"=="_radar_cache" (
		cls
		echo   ------[%%~nxH]------
		cd "%%H"
		title Current Group Folder:    %%H
		for /D %%I in (*.*) do (
			cd "%%I"
			for /F "delims=" %%J in ('dir /o-e /b /a-d') do (
				if "%%~xJ"==".ssc" (
					set /a index=index+1
					setlocal EnableDelayedExpansion
					echo   [!index! of !numSongs!]:  %%~nxJ
					endlocal
					if not exist "%~dp0_radar_cache\%%H" mkdir "%~dp0_radar_cache\%%H"
					if not exist "%~dp0_radar_cache\%%H\%%I.lua" (
						perl "%~dp0simfile-radar.pl" --no-cache "%%J"
						echo			["%%I"] = {>>%~dp0_radar_cache\%%H\%%I.lua 
						type "%~dp0radar.txt">> %~dp0_radar_cache\%%H\%%I.lua
						echo			},>>%~dp0_radar_cache\%%H\%%I.lua
					)
				)
				if "%%~xJ"==".sm" (
					if not exist "*.ssc" (
						set /a index=index+1
						setlocal EnableDelayedExpansion
						echo   [!index! of !numSongs!]:  %%~nxJ
						endlocal
						if not exist "%~dp0_radar_cache\%%H" mkdir "%~dp0_radar_cache\%%H"
						if not exist "%~dp0_radar_cache\%%H\%%I.lua" (
							perl "%~dp0simfile-radar.pl" --no-cache "%%J"
							echo			["%%I"] = {>>%~dp0_radar_cache\%%H\%%I.lua 
							type "%~dp0radar.txt">> %~dp0_radar_cache\%%H\%%I.lua
							echo			},>>%~dp0_radar_cache\%%H\%%I.lua
						)
					)
				)
				if exist "%~dp0radar.txt" del "%~dp0radar.txt"
			)
			cd..
		)
	)
	cd..
)
cd "%~dp0_radar_cache"
cls
echo.
echo		Generating ddr_groove_data.lua...
if exist "%~dp0ddr_groove_data.lua" del "%~dp0ddr_groove_data.lua"
echo DDR_groove_radar_values = {>>%~dp0ddr_groove_data.lua
for /D %%H in (*.*) do (
	cd "%%H"
	echo		["%%H"] = {>>%~dp0ddr_groove_data.lua
	for /F "delims=" %%J in ('dir /a-d /on /b') do (
		if "%%~xJ"==".lua" (
			type "%%J">>%~dp0ddr_groove_data.lua
		)
	)
	echo		},>>%~dp0ddr_groove_data.lua 
	cd..
)
echo	}>>%~dp0ddr_groove_data.lua 


:Finish
set ENDTIME=%TIME%
rem Change formatting for the start and end times
for /F "tokens=1-4 delims=:.," %%a in ("%STARTTIME%") do (
   set /A "start=(((%%a*60)+1%%b %% 100)*60+1%%c %% 100)*100+1%%d %% 100"
)

for /F "tokens=1-4 delims=:.," %%a in ("%ENDTIME%") do ( 
   IF %ENDTIME% GTR %STARTTIME% set /A "end=(((%%a*60)+1%%b %% 100)*60+1%%c %% 100)*100+1%%d %% 100" 
   IF %ENDTIME% LSS %STARTTIME% set /A "end=((((%%a+24)*60)+1%%b %% 100)*60+1%%c %% 100)*100+1%%d %% 100" 
)

rem Calculate the elapsed time by subtracting values
set /A elapsed=end-start

rem Format the results for output
set /A hh=elapsed/(60*60*100), rest=elapsed%%(60*60*100), mm=rest/(60*100), rest%%=60*100, ss=rest/100, cc=rest%%100
if %hh% lss 10 set hh=0%hh%
if %mm% lss 10 set mm=0%mm%
if %ss% lss 10 set ss=0%ss%
if %cc% lss 10 set cc=0%cc%

set DURATION=%hh%:%mm%:%ss%
title Groove Radar Data Lua Script Generator
cls
echo.
echo.
echo		Finished! Elapsed time to process %numSongs% simfiles: %DURATION%
echo.
echo		Move your ddr_groove_data.lua to your Themes/_fallback/Scripts folder
echo		Remove any instance of ddr_groove_data.lua in your Themes/[current/custom themes]/Scripts folder.
echo.
echo		Press any key to close this window.
pause >nul