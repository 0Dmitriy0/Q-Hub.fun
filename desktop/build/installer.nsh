; Q-Hub: доповнення до інсталятора electron-builder (підхоплюється саме з build/installer.nsh).
; Видалення програми прибирає автозапуск з Windows (specs/009 FR-014) — запис «Q-Hub» у Run, який ставить main.cjs.
; Під час оновлення старий деінсталятор теж запускається — тоді запис НЕ чіпаємо, інакше оновлення вимикало б автозапуск (FR-012).
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Q-Hub"
  ${endIf}
!macroend
