; Quills NSIS Installer Script
; Builds with: makensis /DVERSION=0.9.0 /DEXE_PATH=..\..\bin\quills.exe quills.nsi

!include "MUI2.nsh"
!include "FileFunc.nsh"

; ---------------------------------------------------------------------------
; Build-time defines (pass via /D on CLI)
; ---------------------------------------------------------------------------
!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef EXE_PATH
  !define EXE_PATH "..\..\bin\quills.exe"
!endif

; ---------------------------------------------------------------------------
; Installer metadata
; ---------------------------------------------------------------------------
Name "Quills ${VERSION}"
OutFile "Quills-${VERSION}-Setup.exe"
InstallDir "$LOCALAPPDATA\Quills"
InstallDirRegKey HKCU "Software\Quills" "InstallDir"
RequestExecutionLevel user ; no admin needed
SetCompressor /SOLID lzma

!define MUI_ICON "..\..\..\branding\hedgebuddy_icon2.ico"
!define MUI_UNICON "..\..\..\branding\hedgebuddy_icon2.ico"
!define MUI_ABORTWARNING

; ---------------------------------------------------------------------------
; Variables
; ---------------------------------------------------------------------------
Var StartAtLogin

; ---------------------------------------------------------------------------
; Pages
; ---------------------------------------------------------------------------
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY

; Custom page: ask about auto-start
Page custom StartAtLoginPage StartAtLoginPageLeave

!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\quills.exe"
!define MUI_FINISHPAGE_RUN_PARAMETERS "-no-browser"
!define MUI_FINISHPAGE_RUN_TEXT "Launch Quills now"
!insertmacro MUI_PAGE_FINISH

; Uninstaller pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ---------------------------------------------------------------------------
; Custom page: Start at Login
; ---------------------------------------------------------------------------
Function StartAtLoginPage
  nsDialogs::Create 1018
  Pop $0

  ${NSD_CreateCheckbox} 0 0 100% 12u "Start Quills automatically when I log in"
  Pop $StartAtLogin
  ${NSD_Check} $StartAtLogin ; checked by default

  nsDialogs::Show
FunctionEnd

Function StartAtLoginPageLeave
  ${NSD_GetState} $StartAtLogin $0
FunctionEnd

; ---------------------------------------------------------------------------
; Install section
; ---------------------------------------------------------------------------
Section "Install"
  SetOutPath "$INSTDIR"

  ; Main binary
  File "${EXE_PATH}"

  ; Icon for shortcuts
  File "/oname=quills.ico" "..\..\..\branding\hedgebuddy_icon2.ico"

  ; Write uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Start Menu shortcuts
  CreateDirectory "$SMPROGRAMS\Quills"
  CreateShortCut "$SMPROGRAMS\Quills\Quills.lnk" "$INSTDIR\quills.exe" \
    "-no-browser" "$INSTDIR\quills.ico"
  CreateShortCut "$SMPROGRAMS\Quills\Uninstall Quills.lnk" "$INSTDIR\Uninstall.exe"

  ; Registry: install location
  WriteRegStr HKCU "Software\Quills" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Quills" "Version" "${VERSION}"

  ; Registry: Add/Remove Programs
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Quills" \
    "DisplayName" "Quills"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Quills" \
    "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Quills" \
    "Publisher" "Hedge"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Quills" \
    "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Quills" \
    "DisplayIcon" "$INSTDIR\quills.ico"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Quills" \
    "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Quills" \
    "NoRepair" 1

  ; Estimated size for Add/Remove Programs
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Quills" \
    "EstimatedSize" "$0"

  ; Auto-start at login (if user opted in)
  ${NSD_GetState} $StartAtLogin $0
  ${If} $0 == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Quills" \
      "$\"$INSTDIR\quills.exe$\" -no-browser"
  ${EndIf}
SectionEnd

; ---------------------------------------------------------------------------
; Uninstall section
; ---------------------------------------------------------------------------
Section "Uninstall"
  ; Remove auto-start
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Quills"

  ; Remove files
  Delete "$INSTDIR\quills.exe"
  Delete "$INSTDIR\quills.ico"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"

  ; Remove Start Menu shortcuts
  Delete "$SMPROGRAMS\Quills\Quills.lnk"
  Delete "$SMPROGRAMS\Quills\Uninstall Quills.lnk"
  RMDir "$SMPROGRAMS\Quills"

  ; Remove registry keys
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Quills"
  DeleteRegKey HKCU "Software\Quills"
SectionEnd
