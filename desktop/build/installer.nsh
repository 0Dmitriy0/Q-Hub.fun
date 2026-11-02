; Q-Hub: доповнення до інсталятора electron-builder (підхоплюється саме з build/installer.nsh).
; Інсталятор «в один клік» (nsis.oneClick): жодних питань — одне невелике темне вікно з логотипом і прогресом,
; далі програма відкривається сама. Ярлик і автозапуск гравець вмикає/вимикає в самій програмі (екран входу, плашка, трей).
; Автооновлення (--updated, specs/006) показує те саме вікно з «Оновлюю з X до Y»; тихе встановлення (/S) — без вікон.
; Запис автозапуску в Run зветься як програма (${PRODUCT_NAME} = «Q-Hub», як LOGIN у main.cjs).
; Файл — UTF-8 з BOM: інакше makensis читає українські рядки в кодовій сторінці системи.

!include nsDialogs.nsh
!include LogicLib.nsh
!include WordFunc.nsh

; чітке вікно при масштабі Windows 125–200 % (без розмитого розтягування бітмапою)
ManifestDPIAware true

; кольори сайту
!define QH_BG 10141a
!define QH_FG f4f7fb
!define QH_MUTED 8b9bb0
!define QH_RUN "Software\Microsoft\Windows\CurrentVersion\Run"
; ті самі кольори для Win32 (COLORREF — 0x00BBGGRR): помаранчевий прогрес на темній доріжці
!define QH_BAR_FG 0x001a7aff
!define QH_BAR_BG 0x0030231a
; розміри вікна, px при 100 % (далі множимо на DPI)
!define QH_W 440
!define QH_H 196

!define MUI_BGCOLOR ${QH_BG}
!define MUI_TEXTCOLOR ${QH_FG}

; тексти, яких electron-builder не має українською (інакше гравець бачить англійську)
!pragma warning disable 6030
LangString installing 1058 "Встановлюю Q-Hub…"
LangString areYouSureToUninstall 1058 "Видалити Q-Hub з цього комп'ютера?$\r$\n$\r$\nОблік, угоди й ціни, які ти вносив, лишаються в акаунті на q-hub.fun."
!pragma warning default 6030

; єдина сторінка «в один клік» — прогрес; оформлюємо її при показі
!define MUI_PAGE_CUSTOMFUNCTION_SHOW qhProgShow

Var qhFontTitle
Var qhFontText

; px при 100 % → px на екрані гравця
!macro qhPx OUT VAL
  IntOp ${OUT} ${VAL} * $R9
  IntOp ${OUT} ${OUT} / 96
!macroend

; статичний текст на сторінці: x y w h (px при 100 %), колір, шрифт
!macro qhLabel TEXT X Y W H COLOR FONT
  !insertmacro qhPx $R1 ${X}
  !insertmacro qhPx $R2 ${Y}
  !insertmacro qhPx $R3 ${W}
  !insertmacro qhPx $R4 ${H}
  System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "${TEXT}", i 0x50000000, i R1, i R2, i R3, i R4, p R0, p 0, p 0, p 0) p .R5'
  SetCtlColors $R5 ${COLOR} ${QH_BG}
  SendMessage $R5 ${WM_SETFONT} ${FONT} 1
!macroend

!macro qhHide PARENT ID
  GetDlgItem $R5 ${PARENT} ${ID}
  ShowWindow $R5 ${SW_HIDE}
!macroend

Function qhProgShow
  System::Call 'user32::GetDpiForWindow(p $HWNDPARENT) i .R9'
  ${if} $R9 < 96
    StrCpy $R9 96
  ${endif}
  CreateFont $qhFontTitle "Segoe UI Semibold" 17 600
  CreateFont $qhFontText "Segoe UI" 10 400

  ; темний заголовок вікна (Windows 10 20H1+ / 11; на старіших виклик просто нічого не робить)
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4)'

  ; з вікна MUI лишаємо лише сторінку: без шапки, ліній, підпису й системних кнопок
  SetCtlColors $HWNDPARENT ${QH_FG} ${QH_BG}
  !insertmacro qhHide $HWNDPARENT 1
  !insertmacro qhHide $HWNDPARENT 2
  !insertmacro qhHide $HWNDPARENT 3
  !insertmacro qhHide $HWNDPARENT 1028
  !insertmacro qhHide $HWNDPARENT 1034
  !insertmacro qhHide $HWNDPARENT 1035
  !insertmacro qhHide $HWNDPARENT 1036
  !insertmacro qhHide $HWNDPARENT 1037
  !insertmacro qhHide $HWNDPARENT 1038
  !insertmacro qhHide $HWNDPARENT 1039
  !insertmacro qhHide $HWNDPARENT 1045
  !insertmacro qhHide $HWNDPARENT 1256

  ; вікно — компактне, по центру екрана: рамку беремо з різниці між вікном і його вмістом
  System::Call '*(i,i,i,i) p .R8'
  System::Call 'user32::GetWindowRect(p $HWNDPARENT, p R8)'
  System::Call '*$R8(i .R1, i .R2, i .R3, i .R4)'
  IntOp $R6 $R3 - $R1
  IntOp $R7 $R4 - $R2
  System::Call 'user32::GetClientRect(p $HWNDPARENT, p R8)'
  System::Call '*$R8(i, i, i .R3, i .R4)'
  System::Free $R8
  IntOp $R6 $R6 - $R3
  IntOp $R7 $R7 - $R4
  !insertmacro qhPx $R3 ${QH_W}
  !insertmacro qhPx $R4 ${QH_H}
  IntOp $R6 $R6 + $R3
  IntOp $R7 $R7 + $R4
  System::Call 'user32::GetSystemMetrics(i 0) i .R1'
  System::Call 'user32::GetSystemMetrics(i 1) i .R2'
  IntOp $R1 $R1 - $R6
  IntOp $R1 $R1 / 2
  IntOp $R2 $R2 - $R7
  IntOp $R2 $R2 / 2
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i R1, i R2, i R6, i R7, i 0x14)'

  ; сторінка на все вікно
  FindWindow $R0 "#32770" "" $HWNDPARENT
  System::Call 'user32::SetWindowPos(p R0, p 0, i 0, i 0, i R3, i R4, i 0x14)'
  SetCtlColors $R0 ${QH_FG} ${QH_BG}
  !insertmacro qhHide $R0 1006
  !insertmacro qhHide $R0 1016
  !insertmacro qhHide $R0 1027

  ; знак Q-Hub — іконка самого інсталятора (є розміри до 256 px, тож чітко при будь-якому масштабі)
  !insertmacro qhPx $R3 48
  System::Call 'kernel32::GetModuleHandleW(p 0) p .R6'
  System::Call 'user32::LoadImageW(p R6, p 103, i 1, i R3, i R3, i 0) p .R6'
  !insertmacro qhPx $R1 28
  !insertmacro qhPx $R2 28
  System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "", i 0x50000003, i R1, i R2, i R3, i R3, p R0, p 0, p 0, p 0) p .R5'
  SetCtlColors $R5 ${QH_FG} ${QH_BG}
  SendMessage $R5 0x0172 1 $R6

  ; що відбувається: нове встановлення, оновлення чи перевстановлення (реєстр ще з попередньою версією)
  ReadRegStr $R7 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" DisplayVersion
  ${if} $R7 == ""
    StrCpy $R7 "Встановлюю версію ${VERSION} — кілька секунд"
  ${else}
    ${VersionCompare} "$R7" "${VERSION}" $R6
    ${if} $R6 == "0"
      StrCpy $R7 "Перевстановлюю версію ${VERSION}"
    ${elseif} $R6 == "2"
      StrCpy $R7 "Оновлюю з $R7 до ${VERSION}"
    ${else}
      StrCpy $R7 "Повертаю версію ${VERSION} замість $R7"
    ${endif}
  ${endif}

  !insertmacro qhLabel "Q-Hub" 90 26 320 32 ${QH_FG} $qhFontTitle
  !insertmacro qhLabel "$R7" 90 58 320 22 ${QH_MUTED} $qhFontText

  ; прогрес: без теми Windows (зелений), суцільний, помаранчевий, тонкий
  GetDlgItem $R5 $R0 1004
  System::Call 'uxtheme::SetWindowTheme(p R5, w " ", w " ")'
  System::Call 'user32::GetWindowLongW(p R5, i -16) i .R6'
  IntOp $R6 $R6 | 1
  IntOp $R6 $R6 & 0xFF7FFFFF
  System::Call 'user32::SetWindowLongW(p R5, i -16, i R6)'
  System::Call 'user32::GetWindowLongW(p R5, i -20) i .R6'
  IntOp $R6 $R6 & 0xFFFDFDFF
  System::Call 'user32::SetWindowLongW(p R5, i -20, i R6)'
  SendMessage $R5 0x0409 0 ${QH_BAR_FG}
  SendMessage $R5 0x2001 0 ${QH_BAR_BG}
  !insertmacro qhPx $R1 28
  !insertmacro qhPx $R2 112
  !insertmacro qhPx $R3 384
  !insertmacro qhPx $R4 6
  System::Call 'user32::SetWindowPos(p R5, p 0, i R1, i R2, i R3, i R4, i 0x34)'

  !insertmacro qhLabel "Після встановлення Q-Hub відкриється сам. У грі плашка — Alt+Q." 28 134 384 40 ${QH_MUTED} $qhFontText
FunctionEnd

; Тека для нового встановлення — D:\Q-Hub, якщо D — локальний диск з правом запису й місцем; інакше типова
; (…\AppData\Local\Programs). Вже встановлену програму не переносимо: оновлення, ярлики й автозапуск ведуть у її теку.
; Чужу непорожню D:\Q-Hub не беремо — видалення програми стирає її теку повністю.
!macro customInit
  ReadRegStr $R0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${StdUtils.GetParameter} $R1 "D" ""
  ${if} $R0 == ""
  ${andIf} $R1 == ""
    System::Call 'kernel32::GetDriveTypeW(w "D:\") i .R2'
    ${if} $R2 == 3
      ${DriveSpace} "D:\" "/D=F /S=M" $R3
      ${if} $R3 >= 1024
        StrCpy $R4 "D:\Q-Hub"
        StrCpy $R5 "ok"
        StrCpy $R6 "0"
        ${if} ${FileExists} "$R4\*.*"
          ${ifNot} ${FileExists} "$R4\${PRODUCT_FILENAME}.exe"
            FindFirst $R7 $R8 "$R4\*.*"
            ${do}
              ${if} $R8 == ""
                ${break}
              ${endif}
              ${if} $R8 != "."
              ${andIf} $R8 != ".."
                StrCpy $R5 "busy"
                ${break}
              ${endif}
              FindNext $R7 $R8
            ${loop}
            FindClose $R7
          ${endif}
        ${else}
          StrCpy $R6 "1"
        ${endif}
        ${if} $R5 == "ok"
          ClearErrors
          CreateDirectory "$R4"
          FileOpen $R7 "$R4\.qhub-write-test" w
          ${if} ${Errors}
            StrCpy $R5 "denied"
          ${else}
            FileClose $R7
            Delete "$R4\.qhub-write-test"
          ${endif}
        ${endif}
        ${if} $R5 == "ok"
          StrCpy $INSTDIR "$R4"
        ${elseif} $R6 == "1"
          RMDir "$R4"
        ${endif}
      ${endif}
    ${endif}
  ${endif}
!macroend

; Видалення програми прибирає автозапуск з Windows (specs/009 FR-014) — запис у Run, який ставить main.cjs.
; Під час оновлення старий деінсталятор теж запускається — тоді нічого не чіпаємо, інакше оновлення вимикало б
; автозапуск (FR-012). Вхід і налаштування в %APPDATA%\Q-Hub лишаються — на випадок, якщо гравець повернеться.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "${QH_RUN}" "${PRODUCT_NAME}"
  ${endIf}
!macroend
