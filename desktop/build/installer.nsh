; Q-Hub: доповнення до інсталятора electron-builder (підхоплюється саме з build/installer.nsh).
; Фірмовий інсталятор (specs/008): екран «Старт» у кольорах Q-Hub з параметрами в тому ж вікні, перевірка теки до копіювання,
; «Оновити з X до Y», темний прогрес, «Готово» з Alt+Q; деінсталятор — з прапорцем «видалити мої локальні дані».
; Тихе встановлення й автооновлення (--updated, specs/006) жодного нашого екрана не бачать.
; Запис автозапуску в Run зветься як програма (${PRODUCT_NAME} = «Q-Hub», як LOGIN у main.cjs) — тестова збірка
; «Q-Hub Test» не чіпає запис справжньої.
; Файл — UTF-8 з BOM: інакше makensis читає українські рядки в кодовій сторінці системи.

!include nsDialogs.nsh
!include LogicLib.nsh
!include WordFunc.nsh

; кольори сайту (FR-001)
!define QH_BG 10141a
!define QH_FG f4f7fb
!define QH_MUTED 8b9bb0
!define QH_ACC ff7a1a
!define QH_WARN f59e0b
!define QH_RUN "Software\Microsoft\Windows\CurrentVersion\Run"

; шапка, «Вітання» й «Готово» MUI — темні, текст світлий
!define MUI_BGCOLOR ${QH_BG}
!define MUI_TEXTCOLOR ${QH_FG}

; встановлення лише для поточного користувача, без UAC (FR-013): сторінки «Для кого встановити» немає
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!ifndef BUILD_UNINSTALLER

  !define MUI_ABORTWARNING
  !define MUI_ABORTWARNING_TEXT "Скасувати встановлення Q-Hub? На комп'ютері нічого не зміниться."
  !define MUI_FINISHPAGE_TITLE "Готово"
  !define MUI_FINISHPAGE_TEXT "$qhDoneText"
  !define MUI_FINISHPAGE_RUN_TEXT "Запустити Q-Hub"

  Var qhInit     ; 1 — гравець бачив «Старт» (не тихе встановлення й не автооновлення)
  Var qhOld      ; встановлена версія або ""
  Var qhDir      ; тека, яку вибрав гравець
  Var qhDesk     ; ярлик на робочому столі: 1 / 0
  Var qhAuto     ; автозапуск з Windows: 1 / 0
  Var qhDoneText
  Var qhFontTitle
  Var qhFontText
  Var qhLogo
  Var qhOptsLink
  Var qhOptLbl
  Var qhDirEdit
  Var qhDirBtn
  Var qhDeskChk
  Var qhAutoChk

  !macro customWelcomePage
    Page custom qhStart qhStartLeave

  Function qhStart
    ${if} ${isUpdated}
      Abort
    ${endif}
    ${if} $qhInit != "1"
      StrCpy $qhInit "1"
      ReadRegStr $qhOld HKCU "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
      StrCpy $qhDir $INSTDIR
      StrCpy $qhDesk "1"
      StrCpy $qhAuto "1"
      ; перевстановлення: як зараз у гравця
      ${if} $qhOld != ""
        ${ifNot} ${FileExists} "$DESKTOP\${SHORTCUT_NAME}.lnk"
          StrCpy $qhDesk "0"
        ${endif}
        ReadRegStr $0 HKCU "${QH_RUN}" "${PRODUCT_NAME}"
        ${if} $0 == ""
          StrCpy $qhAuto "0"
        ${endif}
      ${endif}
      CreateFont $qhFontTitle "Segoe UI Semibold" 20 600
      CreateFont $qhFontText "Segoe UI" 9 400
      InitPluginsDir
      File /oname=$PLUGINSDIR\qh-logo.bmp "${BUILD_RESOURCES_DIR}\installer-logo.bmp"
    ${endif}

    ${if} $qhOld == ""
      !insertmacro MUI_HEADER_TEXT "Встановлення Q-Hub" "Програма поверх гри для гравців QuantRP"
    ${else}
      !insertmacro MUI_HEADER_TEXT "Оновлення Q-Hub" "Твій вхід, персонаж і налаштування збережуться"
    ${endif}

    !insertmacro qhFrame
    nsDialogs::Create 1018
    Pop $0
    SetCtlColors $0 ${QH_FG} ${QH_BG}

    ${NSD_CreateBitmap} 0 2u 72 72 ""
    Pop $1
    ${NSD_SetImage} $1 "$PLUGINSDIR\qh-logo.bmp" $qhLogo

    ${NSD_CreateLabel} 56u 0 -56u 18u "Q-Hub ${VERSION}"
    Pop $1
    !insertmacro qhDark $1 ${QH_FG}
    SendMessage $1 ${WM_SETFONT} $qhFontTitle 0

    ${NSD_CreateLabel} 56u 20u -56u 26u "Облік, ціни скупників, правила й мапа — у плашці Alt+Q просто поверх гри."
    Pop $1
    !insertmacro qhDark $1 ${QH_MUTED}

    ; що зараз станеться (FR-014)
    ${if} $qhOld == ""
      StrCpy $2 "Встановлюється лише для тебе — права адміністратора не потрібні."
      StrCpy $3 ${QH_MUTED}
    ${else}
      ${VersionCompare} "$qhOld" "${VERSION}" $4
      ${if} $4 == "0"
        StrCpy $2 "Ця версія вже встановлена — Q-Hub буде перевстановлено в ту саму теку."
        StrCpy $3 ${QH_MUTED}
      ${elseif} $4 == "2"
        StrCpy $2 "Оновлення з $qhOld до ${VERSION} — у ту саму теку."
        StrCpy $3 ${QH_ACC}
      ${else}
        StrCpy $2 "Увага: у тебе новіша версія $qhOld. Ця — старіша (${VERSION}). Встановити її все одно?"
        StrCpy $3 ${QH_WARN}
      ${endif}
    ${endif}
    ${NSD_CreateLabel} 56u 48u -56u 18u "$2"
    Pop $1
    !insertmacro qhDark $1 $3

    ${NSD_CreateLink} 56u 70u 140u 10u "Параметри встановлення ▾"
    Pop $qhOptsLink
    !insertmacro qhDark $qhOptsLink ${QH_ACC}
    ${NSD_OnClick} $qhOptsLink qhToggleOpts

    ${NSD_CreateLabel} 56u 86u 30u 10u "Тека:"
    Pop $qhOptLbl
    !insertmacro qhDark $qhOptLbl ${QH_MUTED}
    ${NSD_CreateText} 86u 84u -146u 12u "$qhDir"
    Pop $qhDirEdit
    SendMessage $qhDirEdit ${EM_SETREADONLY} 1 0
    SendMessage $qhDirEdit ${WM_SETFONT} $qhFontText 0
    ${NSD_CreateButton} -56u 83u 56u 14u "Змінити…"
    Pop $qhDirBtn
    SendMessage $qhDirBtn ${WM_SETFONT} $qhFontText 0
    ${NSD_OnClick} $qhDirBtn qhPickDir
    ${if} $qhOld != ""
      EnableWindow $qhDirBtn 0
    ${endif}

    ${NSD_CreateCheckbox} 56u 102u -56u 12u "Ярлик на робочому столі"
    Pop $qhDeskChk
    !insertmacro qhDark $qhDeskChk ${QH_FG}
    ${if} $qhDesk == "1"
      ${NSD_Check} $qhDeskChk
    ${endif}
    ${NSD_CreateCheckbox} 56u 116u -56u 12u "Запускати разом з Windows (тихо, у треї)"
    Pop $qhAutoChk
    !insertmacro qhDark $qhAutoChk ${QH_FG}
    ${if} $qhAuto == "1"
      ${NSD_Check} $qhAutoChk
    ${endif}
    Call qhHideOpts

    ; головна кнопка — дієсловом (FR-004)
    GetDlgItem $1 $HWNDPARENT 1
    ${if} $qhOld == ""
      SendMessage $1 ${WM_SETTEXT} 0 "STR:Встановити"
    ${elseif} $4 == "2"
      SendMessage $1 ${WM_SETTEXT} 0 "STR:Оновити"
    ${else}
      ; перевстановлення й старіша версія — пояснює рядок над кнопкою, у системну кнопку довше слово не вміщається
      SendMessage $1 ${WM_SETTEXT} 0 "STR:Встановити"
    ${endif}

    nsDialogs::Show
    ${NSD_FreeImage} $qhLogo
  FunctionEnd

  ; параметри згорнуті за замовчуванням (FR-007)
  Function qhHideOpts
    ShowWindow $qhOptLbl ${SW_HIDE}
    ShowWindow $qhDirEdit ${SW_HIDE}
    ShowWindow $qhDirBtn ${SW_HIDE}
    ShowWindow $qhDeskChk ${SW_HIDE}
    ShowWindow $qhAutoChk ${SW_HIDE}
  FunctionEnd
  Function qhToggleOpts
    Pop $0
    ShowWindow $qhOptLbl ${SW_SHOW}
    ShowWindow $qhDirEdit ${SW_SHOW}
    ShowWindow $qhDirBtn ${SW_SHOW}
    ShowWindow $qhDeskChk ${SW_SHOW}
    ShowWindow $qhAutoChk ${SW_SHOW}
    ShowWindow $qhOptsLink ${SW_HIDE}
  FunctionEnd

  ; тека: завжди з підтекою програми, як типова (…\Programs\Q-Hub)
  Function qhPickDir
    Pop $0
    nsDialogs::SelectFolderDialog "Обери теку, куди встановити Q-Hub" "$qhDir"
    Pop $0
    ${if} $0 == "error"
    ${orIf} $0 == ""
      Return
    ${endif}
    StrCpy $1 $0 1 -1
    ${if} $1 == "\"
      StrCpy $0 $0 -1
    ${endif}
    StrLen $2 "\${APP_FILENAME}"
    StrCpy $1 $0 "" -$2
    ${if} $1 != "\${APP_FILENAME}"
      StrCpy $0 "$0\${APP_FILENAME}"
    ${endif}
    StrCpy $qhDir $0
    ${NSD_SetText} $qhDirEdit $qhDir
  FunctionEnd

  ; до копіювання: права на запис і місце на диску (FR-009)
  Function qhStartLeave
    ${NSD_GetState} $qhDeskChk $qhDesk
    ${NSD_GetState} $qhAutoChk $qhAuto
    StrCpy $R9 "0"
    ${ifNot} ${FileExists} "$qhDir\*.*"
      StrCpy $R9 "1"
    ${endif}
    ClearErrors
    CreateDirectory "$qhDir"
    FileOpen $0 "$qhDir\.qhub-write-test" w
    ${if} ${Errors}
      ${if} $R9 == "1"
        RMDir "$qhDir"
      ${endif}
      MessageBox MB_ICONEXCLAMATION|MB_OK "Немає дозволу записувати в теку:$\r$\n$qhDir$\r$\n$\r$\nВідкрий «Параметри встановлення» й обери іншу теку — наприклад, на диску D."
      Abort
    ${endif}
    FileClose $0
    Delete "$qhDir\.qhub-write-test"
    ${if} $R9 == "1"
      RMDir "$qhDir"
    ${endif}
    ${GetRoot} "$qhDir" $1
    ${DriveSpace} "$1\" "/D=F /S=M" $2
    SectionGetSize 0 $3
    IntOp $3 $3 / 1024
    IntOp $3 $3 + 50
    ${if} $2 < $3
      MessageBox MB_ICONEXCLAMATION|MB_OK "На диску $1 бракує місця: Q-Hub потребує близько $3 МБ, а вільно $2 МБ.$\r$\n$\r$\nЗвільни місце або обери теку на іншому диску в «Параметрах встановлення»."
      Abort
    ${endif}
  FunctionEnd

  !macroend

  ; перед копіюванням: тека з «Старту» (electron-builder між ними ще раз ставить типову) і темна сторінка прогресу
  !macro customPageAfterChangeDir
    Page custom qhApplyDir
    !define MUI_PAGE_HEADER_TEXT "Встановлюю Q-Hub"
    !define MUI_PAGE_HEADER_SUBTEXT "Кілька секунд — розпаковую файли програми."
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW qhFilesShow
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE qhFilesLeave

  Function qhApplyDir
    ${if} $qhDir != ""
      StrCpy $INSTDIR $qhDir
    ${endif}
    Abort
  FunctionEnd

  ; автооновлення (--updated, specs/006 і 008 US5): після прогресу «Готово» не показуємо; програма просила перезапуск
  ; (--force-run) — запускаємо її самі: electron-builder робить це лише в тихому режимі, а оновлення йде з вікном прогресу
  Function qhFilesLeave
    ${if} ${isUpdated}
      ${if} ${isForceRun}
        ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "--updated"
      ${endif}
      SetErrorLevel 0
      Quit
    ${endif}
  FunctionEnd

  ; прогрес — у тих самих кольорах: тло, підпис кроку, список подробиць (COLORREF — 0x00BBGGRR)
  Function qhFilesShow
    !insertmacro qhFrame
    ; далі — «Готово»: її галочку «Запустити Q-Hub» тема Windows малює чорним текстом; без теми працюють кольори MUI
    System::Call "uxtheme::SetThemeAppProperties(i 1)"
    FindWindow $0 "#32770" "" $HWNDPARENT
    SetCtlColors $0 ${QH_FG} ${QH_BG}
    GetDlgItem $1 $0 1006
    SetCtlColors $1 ${QH_FG} ${QH_BG}
    GetDlgItem $1 $0 1016
    SendMessage $1 0x1001 0 0x001a1410
    SendMessage $1 0x1026 0 0x001a1410
    SendMessage $1 0x1024 0 0x00b09b8b
  FunctionEnd

  !macroend

  ; функції сторінок — усередині макросів-хуків: цей файл підключається раніше за MUI2, а хуки вставляються вже після нього

  ; усе вікно інсталятора темне, не лише сторінка: тло й підпис внизу (кнопки Windows лишаються системними)
  !macro qhFrame
    SetCtlColors $HWNDPARENT ${QH_FG} ${QH_BG}
    GetDlgItem $R8 $HWNDPARENT 1028
    SetCtlColors $R8 ${QH_MUTED} ${QH_BG}
    GetDlgItem $R8 $HWNDPARENT 1256
    SetCtlColors $R8 ${QH_MUTED} ${QH_BG}
    GetDlgItem $R8 $HWNDPARENT 1035
    ShowWindow $R8 ${SW_HIDE}
  !macroend

  ; темне тло й світлий текст; тему Windows знімаємо, бо з нею прапорці малюють чорний текст
  !macro qhDark HWND FG
    System::Call 'uxtheme::SetWindowTheme(p ${HWND}, w " ", w " ")'
    SetCtlColors ${HWND} ${FG} ${QH_BG}
    SendMessage ${HWND} ${WM_SETFONT} $qhFontText 0
  !macroend

  !macro customInstall
    ${if} $qhOld == ""
    ${andIfNot} ${isUpdated}
      StrCpy $qhDoneText "Q-Hub встановлено.$\r$\n$\r$\nУ грі плашка відкривається клавішами Alt+Q. Увійди через Discord — і облік, ціни скупників, правила й мапа будуть під рукою."
    ${else}
      StrCpy $qhDoneText "Q-Hub ${VERSION} готовий.$\r$\n$\r$\nПлашка, як і раніше, — Alt+Q у грі. Вхід, персонаж і налаштування на місці."
    ${endif}
    ; вибір зі «Старту» — лише коли гравець його бачив; тихе встановлення й автооновлення лишають усе як є
    ${if} $qhInit == "1"
      ${if} $qhDesk == "1"
        ${ifNot} ${FileExists} "$newDesktopLink"
          CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
          WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
        ${endif}
      ${else}
        WinShell::UninstShortcut "$newDesktopLink"
        Delete "$newDesktopLink"
      ${endif}
      ; автозапуск ставить сама програма (specs/009) — лишаємо їй вибір гравця, вона прочитає його й видалить файл
      CreateDirectory "$APPDATA\${PRODUCT_NAME}"
      FileOpen $0 "$APPDATA\${PRODUCT_NAME}\installer.json" w
      ${if} $qhAuto == "1"
        FileWrite $0 '{"autostart":true}'
      ${else}
        FileWrite $0 '{"autostart":false}'
      ${endif}
      FileClose $0
    ${endif}
  !macroend

!else

  !define MUI_FINISHPAGE_TITLE "Q-Hub видалено"
  !define MUI_FINISHPAGE_TEXT "Облік, угоди й ціни, які ти вносив, лишаються в акаунті на q-hub.fun.$\r$\n$\r$\nПовернутися можна будь-коли — програма на сторінці «Програма»."

  Var qhWipe
  Var qhWipeChk
  Var qhFontText

  !macro customUnWelcomePage
    UninstPage custom un.qhBye un.qhByeLeave

  Function un.qhBye
    !insertmacro MUI_HEADER_TEXT "Видалення Q-Hub" "Програма зникне з цього комп'ютера"
    CreateFont $qhFontText "Segoe UI" 9 400
    SetCtlColors $HWNDPARENT ${QH_FG} ${QH_BG}
    GetDlgItem $R8 $HWNDPARENT 1028
    SetCtlColors $R8 ${QH_MUTED} ${QH_BG}
    GetDlgItem $R8 $HWNDPARENT 1256
    SetCtlColors $R8 ${QH_MUTED} ${QH_BG}
    GetDlgItem $R8 $HWNDPARENT 1035
    ShowWindow $R8 ${SW_HIDE}
    nsDialogs::Create 1018
    Pop $0
    SetCtlColors $0 ${QH_FG} ${QH_BG}
    ${NSD_CreateLabel} 0 0 100% 40u "Q-Hub буде видалено разом з ярликами й автозапуском.$\r$\n$\r$\nТвій облік, угоди й ціни нікуди не зникнуть — вони в акаунті на сайті."
    Pop $1
    System::Call 'uxtheme::SetWindowTheme(p $1, w " ", w " ")'
    SetCtlColors $1 ${QH_FG} ${QH_BG}
    SendMessage $1 ${WM_SETFONT} $qhFontText 0
    ${NSD_CreateCheckbox} 0 50u 100% 12u "Видалити також мої локальні дані (вхід, налаштування, черга записів)"
    Pop $qhWipeChk
    System::Call 'uxtheme::SetWindowTheme(p $qhWipeChk, w " ", w " ")'
    SetCtlColors $qhWipeChk ${QH_FG} ${QH_BG}
    SendMessage $qhWipeChk ${WM_SETFONT} $qhFontText 0
    GetDlgItem $1 $HWNDPARENT 1
    SendMessage $1 ${WM_SETTEXT} 0 "STR:Видалити"
    nsDialogs::Show
  FunctionEnd

  Function un.qhByeLeave
    ${NSD_GetState} $qhWipeChk $qhWipe
  FunctionEnd

  !macroend


!endif

; Видалення програми прибирає автозапуск з Windows (specs/009 FR-014) — запис у Run, який ставить main.cjs.
; Під час оновлення старий деінсталятор теж запускається — тоді нічого не чіпаємо, інакше оновлення вимикало б
; автозапуск (FR-012) і стирало б дані.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "${QH_RUN}" "${PRODUCT_NAME}"
    ${if} $qhWipe == "1"
      RMDir /r "$APPDATA\${PRODUCT_NAME}"
    ${endif}
  ${endIf}
!macroend
