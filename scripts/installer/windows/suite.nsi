; HedgeBuddy Suite NSIS Installer Script
; Installs HedgeBuddy (desktop app) + Quills (automation engine) together.
;
; Build with:
;   makensis /DVERSION_HB=0.9.0 /DVERSION_QUILLS=0.9.0 ^
;            /DHB_EXE=path\to\HedgeBuddy.exe ^
;            /DQUILLS_EXE=path\to\quills.exe ^
;            suite.nsi

!include "MUI2.nsh"
!include "FileFunc.nsh"

; ---------------------------------------------------------------------------
; Build-time defines (passed via /D on CLI)
; ---------------------------------------------------------------------------
!ifndef VERSION_HB
  !define VERSION_HB "0.0.0"
!endif
!ifndef VERSION_QUILLS
  !define VERSION_QUILLS "0.0.0"
!endif
!ifndef HB_EXE
  !define HB_EXE "HedgeBuddy.exe"
!endif
!ifndef QUILLS_EXE
  !define QUILLS_EXE "quills.exe"
!endif
!ifndef UPDATER_EXE
  !define UPDATER_EXE "updater.exe"
!endif

; ---------------------------------------------------------------------------
; Installer metadata
; ---------------------------------------------------------------------------
Name "HedgeBuddy Suite"
OutFile "HedgeBuddy-Suite-v${VERSION_HB}-quills-v${VERSION_QUILLS}-Setup.exe"
InstallDir "$LOCALAPPDATA\HedgeBuddy"
InstallDirRegKey HKCU "Software\HedgeBuddy" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!define ICON_PATH "..\..\..\branding\hedgebuddy_icon2.ico"
!define MUI_ICON "${ICON_PATH}"
!define MUI_UNICON "${ICON_PATH}"
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "Welcome to HedgeBuddy Suite"
!define MUI_WELCOMEPAGE_TEXT "This will install HedgeBuddy v${VERSION_HB} and the Quills automation engine v${VERSION_QUILLS} on your computer.$\r$\n$\r$\nClick Next to continue."

; ---------------------------------------------------------------------------
; Variables
; ---------------------------------------------------------------------------
Var StartAtLogin

; ---------------------------------------------------------------------------
; Pages
; ---------------------------------------------------------------------------
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_COMPONENTS

Page custom StartAtLoginPage StartAtLoginPageLeave

!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\HedgeBuddy.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch HedgeBuddy now"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ---------------------------------------------------------------------------
; Custom page: Start Quills at Login
; ---------------------------------------------------------------------------
Function StartAtLoginPage
  nsDialogs::Create 1018
  Pop $0

  ${NSD_CreateLabel} 0 0 100% 20u "Quills runs silently in the background to power automations."
  Pop $1

  ${NSD_CreateCheckbox} 0 28u 100% 12u "Start Quills automatically when I log in (recommended)"
  Pop $StartAtLogin
  ${NSD_Check} $StartAtLogin

  nsDialogs::Show
FunctionEnd

Function StartAtLoginPageLeave
  ${NSD_GetState} $StartAtLogin $0
FunctionEnd

; ---------------------------------------------------------------------------
; Install sections (component-based)
; ---------------------------------------------------------------------------

; Core: always installed (updater + icon + uninstaller + registry)
Section "-Core" SEC_CORE
  SetOutPath "$INSTDIR"

  ; Updater agent (always installed)
  File "/oname=updater.exe" "${UPDATER_EXE}"

  ; Icon for shortcuts
  File "/oname=hedgebuddy.ico" "${ICON_PATH}"

  ; Write uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Start Menu folder + uninstall shortcut
  CreateDirectory "$SMPROGRAMS\HedgeBuddy"
  CreateShortCut "$SMPROGRAMS\HedgeBuddy\Uninstall.lnk" \
    "$INSTDIR\Uninstall.exe"

  ; Registry: install location
  WriteRegStr HKCU "Software\HedgeBuddy" "InstallDir" "$INSTDIR"

  ; Registry: Add/Remove Programs
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HedgeBuddy" \
    "DisplayName" "HedgeBuddy Suite"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HedgeBuddy" \
    "DisplayVersion" "${VERSION_HB}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HedgeBuddy" \
    "Publisher" "shakedex"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HedgeBuddy" \
    "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HedgeBuddy" \
    "DisplayIcon" "$INSTDIR\hedgebuddy.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HedgeBuddy" \
    "URLInfoAbout" "https://github.com/shakedex/hedgebuddy"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HedgeBuddy" \
    "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HedgeBuddy" \
    "NoRepair" 1

  ; Estimated install size
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HedgeBuddy" \
    "EstimatedSize" "$0"
SectionEnd

; HedgeBuddy desktop app (selected by default)
Section "HedgeBuddy (Variable Manager)" SEC_HEDGEBUDDY
  SetOutPath "$INSTDIR"
  File "/oname=HedgeBuddy.exe" "${HB_EXE}"

  CreateShortCut "$SMPROGRAMS\HedgeBuddy\HedgeBuddy.lnk" \
    "$INSTDIR\HedgeBuddy.exe" "" "$INSTDIR\hedgebuddy.ico"

  WriteRegStr HKCU "Software\HedgeBuddy" "VersionHB" "${VERSION_HB}"
SectionEnd

; Quills automation engine (selected by default)
Section "Quills (Automation Engine)" SEC_QUILLS
  SetOutPath "$INSTDIR"
  File "/oname=quills.exe" "${QUILLS_EXE}"

  CreateShortCut "$SMPROGRAMS\HedgeBuddy\Quills Dashboard.lnk" \
    "$INSTDIR\quills.exe" "-no-browser" "$INSTDIR\hedgebuddy.ico"

  WriteRegStr HKCU "Software\HedgeBuddy" "VersionQuills" "${VERSION_QUILLS}"

  ; Auto-start Quills at login (if user opted in)
  ${NSD_GetState} $StartAtLogin $0
  ${If} $0 == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Quills" \
      "$\"$INSTDIR\quills.exe$\" -no-browser"
  ${EndIf}
SectionEnd

; Component descriptions shown in the installer
!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_HEDGEBUDDY} "Desktop app for managing environment variables used by Hedge scripts."
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_QUILLS} "Background automation engine — runs workflows, schedules tasks, and powers the Quills dashboard."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; ---------------------------------------------------------------------------
; Uninstall section
; ---------------------------------------------------------------------------
Section "Uninstall"
  ; Remove Quills auto-start
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Quills"

  ; Remove files
  Delete "$INSTDIR\HedgeBuddy.exe"
  Delete "$INSTDIR\quills.exe"
  Delete "$INSTDIR\updater.exe"
  Delete "$INSTDIR\hedgebuddy.ico"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"

  ; Remove Start Menu shortcuts
  Delete "$SMPROGRAMS\HedgeBuddy\HedgeBuddy.lnk"
  Delete "$SMPROGRAMS\HedgeBuddy\Quills Dashboard.lnk"
  Delete "$SMPROGRAMS\HedgeBuddy\Uninstall.lnk"
  RMDir "$SMPROGRAMS\HedgeBuddy"

  ; Remove registry keys
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HedgeBuddy"
  DeleteRegKey HKCU "Software\HedgeBuddy"
SectionEnd
