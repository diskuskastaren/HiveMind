# Bugg- och UI/UX-genomgång — Combobulator v1.5.6

Genomgång av hela kodbasen (`supplier-notes/`, ~14 200 rader) 2026-09-08.
Varje punkt har `fil:rad` så den går att åtgärda direkt.

Prioritering:
- **P0** — dataförlust eller funktion som är helt trasig
- **P1** — funktion som inte gör vad den utger sig för att göra
- **P2** — UX-problem och inkonsekvenser
- **P3** — kodhälsa / underhållsskuld

---

## P0 — Dataförlust

### 1. Återställning från backup är trasig i båda vägarna
`store/store.ts:679` · `store/store.ts:727` · `components/CommandPalette.tsx:204`

`getExportData()` skriver `version: 5`, men:

- **Settings → Import backup:** `importData()` kontrollerar bara
  `data.version === 2 || 3 || 4`. En v5-backup faller i else-grenen, som kastar
  bort **alla projekt** och skapar ett enda `"Imported Project"`. Leverantörer och
  anteckningar behåller sina gamla `projectIds`, som nu inte pekar på något
  existerande projekt → allt försvinner ur gränssnittet. Användaren ser
  "Data imported successfully!" och en tom app.
- **Ctrl+K → Restore from backup:** accepterar bara `version === 1 || 2` och
  svarar `"Unrecognized backup format."` på appens egna backupfiler.

Det här är den allvarligaste buggen: backupen som ska skydda mot dataförlust
orsakar den i stället.

**Åtgärd:** låt `importData` acceptera alla versioner som har `projects`
(`data.projects` finns → använd dem), och synka versionslistan i CommandPalette.
Lägg till en bekräftelsedialog före import ("skriver över X projekt,
Y anteckningar — exportera först?") och validera filens form innan `set()`.

### 2. Datafilen skrivs oatomiskt — vid varje tangenttryck
`electron/main.cjs:91` · `store/store.ts:317`

`store:write` gör `fs.writeFileSync(DATA_FILE, data)` rakt över den enda
befintliga filen. `updateNote` anropas per tangenttryck i editorn, så hela
databasen serialiseras och skrivs om kontinuerligt under skrivandet. Kraschar
appen, tar strömmen slut eller tappar nätverksenheten kontakten mitt i en
skrivning är filen trunkerad och **all data borta**.

**Åtgärd:** skriv till `DATA_FILE + '.tmp'` och `fs.renameSync` över originalet.
Rotera minst en `.bak`. Debounca skrivningen (500–1000 ms) i stället för att
skriva per tangenttryck.

### 3. Skyddet för fjärrlagringsmapp är bortrevat
`electron/main.cjs:80-99`

Commit `aefb974` ("Protect remote data store — fail-closed on unreachable custom
dir") revertades bort i `051eb96`. I nuvarande kod finns inget skydd kvar:

- `store:read` returnerar `null` om filen inte går att läsa — appen startar tom.
- `store:write` gör `mkdirSync` och skriver, så första ändringen skriver
  **en tom databas** till platsen.

Är datamappen en nätverksenhet eller en VPN-mapp som inte är uppkopplad när appen
startar, ser användaren en tom app och kan skriva över sin riktiga data.

**Åtgärd:** återinför fail-closed-logiken (blockera skrivning + visa tydlig
banner "datamappen är inte nåbar") för anpassade datamappar. Koden finns i
`git show aefb974 -- supplier-notes/electron/main.cjs`.

### 4. Import nollställer inte öppna flikar/anteckning
`store/store.ts:679-724`

`importData` sätter `projects/suppliers/notes/...` men rör inte `openTabs`,
`activeTabId` eller `activeNoteId`. Efter en import pekar de på ID:n som inte
längre finns.

**Åtgärd:** nollställ `openTabs: []`, `activeTabId: null`, `activeNoteId: null`
och sätt `activeProjectId` till första importerade projektet.

---

## P1 — Funktioner som inte fungerar

### 5. "Kanban board" i kommandopaletten gör ingenting
`components/CommandPalette.tsx:164-174` · `components/KanbanBoard.tsx`

Kommandot anropar `toggleKanban()`, men `<KanbanBoard />` renderas ingenstans i
`App.tsx`. Komponenten (297 rader) importeras inte från någon fil. Klickar man på
kommandot händer bokstavligen ingenting.

**Åtgärd:** antingen montera `{kanbanOpen && <KanbanBoard />}` i `App.tsx`, eller
ta bort kommandot, komponenten och `kanbanOpen`/`toggleKanban` ur storen.
(Dashboard → Tasks har redan en kanban-vy, så borttagning är troligen rätt.)

### 6. `/Collapsible`-blocket är helt trasigt
`components/editor/CollapsibleExtension.tsx:52-55`

Noden deklarerar attribut som en toppnivå-`attrs`-nyckel. Tiptap bygger nodens
schema-attribut **enbart** från `addAttributes()` — verifierat i
`node_modules/@tiptap/core/dist/index.cjs:493`, där `attrs` sätts från
`getAttributesFromExtensions()`. Toppnivå-`attrs` läses aldrig. Följd:

- `node.attrs.open` är `undefined` → `{open && <NodeViewContent />}` renderar
  aldrig innehållet. Text man skriver i blocket blir osynlig och oåtkomlig.
- `updateAttributes({ open: !open })` filtreras bort → **blocket kan aldrig
  öppnas**, klick på rubriken gör inget.
- `<input value={undefined}>` → okontrollerad input, rubriken går inte att skriva i
  och sparas inte.

**Åtgärd:** byt `attrs: {...}` mot
`addAttributes() { return { title: { default: 'Section' }, open: { default: true } }; }`.

### 7. Leverantörer går inte att pinna — men "Pinned" visas
`store/store.ts:327` · `App.tsx:177-195`

`togglePinSupplier` anropas från **noll** ställen i UI:t. Startsidan har en
"Pinned"-sektion som därför aldrig kan innehålla något (utom för seed-data).

**Åtgärd:** lägg till "Pin/Unpin" i högerklicksmenyn i sidomenyn
(`Sidebar.tsx:596`), där även "Byt namn på leverantör" saknas.

### 8. Modellvalet `o1-mini` gör AI-sammanfattningar omöjliga
`components/SettingsModal.tsx:43` · `utils/summarize.ts:57-72`

Väljer man `o1-mini` i Settings misslyckas **varje** sammanfattning, på tre punkter
samtidigt: o1-modeller stödjer inte `max_tokens` (kräver `max_completion_tokens`),
stödjer inte `temperature` ≠ 1, och stödjer inte rollen `system`. Alla tre skickas.

**Åtgärd:** ta bort `o1-mini` ur listan, eller specialhantera reasoning-modeller.
Passa på att uppdatera modell- och prislistan (`MODEL_PRICING`, rad 47) — den är
hårdkodad och föråldrad.

### 9. Teams-reglaget stänger inte av Teams-overlayen
`App.tsx:449` · `electron/main.cjs:650-673`

`settings.teamsEnabled` läses aldrig i huvudprocessen. `connectToTeams(win)` körs
villkorslöst vid start och `showOverlay()` visar det alltid-överst 500×190-fönstret
så fort ett Teams-möte upptäcks. Reglaget döljer bara den interna modalen.
Texten "ändringar träder i kraft efter omstart" (rad 722) hjälper inte —
overlayen kommer tillbaka ändå.

**Åtgärd:** skicka `teamsEnabled` till huvudprocessen (spara i `app-config.json`
eller via IPC) och skippa `connectToTeams`/`showOverlay` när den är av.

### 10. Transkribering är låst till engelska
`hooks/useTranscription.ts:238` · `utils/summarize.ts:5-14`

- Mikrofonläget sätter `recognition.lang = 'en-US'` hårdkodat. Svenska möten
  transkriberas som engelska → obrukbart resultat.
- Whisper-anropet till Groq skickar **ingen** `language`-parameter. Groqs egen
  dokumentation anger att språk i ISO-639-1 (`sv`) förbättrar både träffsäkerhet
  och latens. Utan den språkdetekterar Whisper per 60-sekunderssegment, vilket ger
  språkbyten mitt i mötet och ibland spontan översättning.

**Åtgärd:** lägg till "Transkriberingsspråk" i Settings → Recording, skicka det
till både `recognition.lang` och Whisper-anropets `language`-fält.

### 11. Debug-instrumentering ligger kvar i produktionsbygget
21 `#region agent log`-block i `App.tsx`, `TranscriptTab.tsx`,
`TeamsRecordingPrompt.tsx`, `useTranscription.ts`, `main.cjs`, `preload.cjs`

Värst:

- `electron/main.cjs:24-33` — **varje** ohanterat undantag och avvisat promise
  öppnar en systemdialog med texten
  `"[Combobulator debug] Uncaught exception — please screenshot"` plus stacktrace.
  Det är vad en användare möter vid ett fel.
- `hooks/useTranscription.ts:8` — `console.error('[transcript-debug]', ...)` körs
  vid varje `appendText` och varje ljudsegment.
- `components/TranscriptTab.tsx:560` — `debugStatus` visas för användaren i gul
  monospace mitt i inspelningsvyn.
- `electron/main.cjs:652` — startloggen påstår `version:'1.2.2'` (appen är 1.5.6).
- `electron/main.cjs:36` — loggsökväg pekar in i ASAR-arkivet, som är skrivskyddat
  i det paketerade bygget.

**Åtgärd:** ta bort alla `#region agent log`-block. Ersätt `showErrorBox`-dialogerna
med tyst loggning till fil + en diskret notis i UI:t.

### 12. Ljudvisualiseringen skalas fel i systemljudsläge
`components/AudioVisualizer.tsx:95-103`

I stream-vägen görs `ctx.scale(dpr, dpr)` efter storleksändring (rad 72). I
IPC-levels-vägen — den som används för systemljud — sätts `canvas.width/height`
men `ctx.scale()` anropas **aldrig**. Eftersom `drawBars()` ritar i CSS-pixlar
hamnar staplarna i ett hörn på alla skärmar med skalning ≠ 100 % (mycket vanligt
i Windows). Det förklarar noteringen "Audio visualizer not working with other
audio than mic" i `Bugs_Improvements`.

**Åtgärd:** lägg till `ctx.scale(dpr, dpr)` direkt efter storleksändringen på rad 102.

### 13. Live-texten under inspelning visas dubbelt
`components/TranscriptTab.tsx:533,552-556`

```
const displayedLive = (inProgressTranscript?.rawText ?? '') + (liveText ? liveText : '');
...
{displayedLive}
{liveText && <span …> {liveText}</span>}
```

`liveText` ingår redan i `displayedLive` och renderas sedan en gång till. Preliminär
taligenkänningstext dyker upp i dubbel uppsättning under hela inspelningen.

**Åtgärd:** ta bort `liveText` ur `displayedLive` och behåll bara span-varianten.

### 14. Misslyckad inspelning lämnar kvar en tom transkription
`hooks/useTranscription.ts:453-468`

`addTranscript()` körs **innan** `startSystemRecording()`/`startMicRecording()`.
Returnerar de `false` (saknad API-nyckel, nekad mikrofon, ingen skärmkälla) står
den tomma posten kvar i anteckningen. Efter några misslyckade försök har
anteckningen en lista med "Recording 3 · 0m 0s"-poster utan innehåll.

**Åtgärd:** skapa transkriptionsposten först efter att `success === true`, eller
ta bort den i felgrenen.

### 15. Räknaren i Sök & ersätt uppdateras inte
`components/editor/FindReplace.tsx:182-184,229-243`

`matchCount`/`currentMatch` läses via `getPluginState()` under render, men
komponenten prenumererar inte på editorns transaktioner. `next()`/`prev()` sätter
ingen React-state → **"1/5" står kvar på 1** när man klickar Nästa. Dessutom
scrollar `prev()` inte till träffen (bara `next()` gör `scrollIntoView`).

**Åtgärd:** prenumerera på `editor.on('transaction')` och tvinga omrendering, eller
spegla plugin-state i React-state. Lägg till `.scrollIntoView()` i `prev()`.

### 16. Oåtkomlig död kod i systemljudsinspelningen
`hooks/useTranscription.ts:382-427`

`return true;` på rad 382 följs av 45 raders kod (`chunkHandler`, `sysInitChunkRef`,
en andra `processChunks`, ett andra `setInterval`) som aldrig kan köras. `sysInitChunkRef`
sätts därmed aldrig men läses fortfarande på rad 415 — rester från en gammal
implementation.

**Åtgärd:** ta bort rad 384–427 och `sysInitChunkRef` helt.

### 17. `NextMeetingPrep` är död kod som inte kompilerar
`components/NextMeetingPrep.tsx:6,8,23`

Komponenten läser `nextMeetingPrepSupplierId` och `setNextMeetingPrepSupplier` ur
storen — fält som inte finns. Filen importeras inte från någonstans. Tre av de 27
TypeScript-felen kommer härifrån.

**Åtgärd:** ta bort filen (eller koppla in funktionen och lägg till state i storen).

---

## P2 — UI/UX

### Uppföljningar (matchar din egen anteckning i `Bugs_Improvements`)

**18. Länkad uppföljning visas inte begripligt** —
`components/TaskModal.tsx:425-456`: rubriken "Linked Follow-up" täcker två helt
olika saker som båda ritas som lila boxar med bokmärkesikon: `task.isFollowUp`
(bara en flagga) och `linkedFollowUp` (en riktig FollowUp-post). De är inte
åtskilda för användaren.

`components/Dashboard.tsx:889-1140`: ett länkat par renderas som **två separata
rader** i uppföljningslistan, där varje rad visar den andra som "länkad". Samma sak
förekommer alltså två gånger. En uppgift som både är `isFollowUp` och länkad till
en FollowUp dyker upp tre gånger.

`components/FollowUpsPanel.tsx:202-254`: här visas `linkedTaskId` **inte alls** —
panelen under editorn känner inte till länkningen.

**Åtgärd:** slå ihop paret till en rad med en "↔ uppgift"-chip; separera
bokmärkesflaggan visuellt från den riktiga länken; visa länken även i
`FollowUpsPanel`.

**19. Uppföljningar går bara att redigera på ett av tre ställen** —
`Dashboard.tsx:941` har inline-redigering. `FollowUpsPanel.tsx` (bältet under
editorn, där man mest jobbar) har **ingen** redigering alls, bara kryssa av och
radera. Det är punkten "Make it possible to edit follow-ups created".

**Åtgärd:** lyft ut raden till en delad komponent med redigering, och använd den
på båda ställena.

**20. Radering utan bekräftelse** — uppföljningar (`FollowUpsPanel.tsx:139`,
`Dashboard.tsx:1130`), uppgifter (`RightPanel.tsx:243`, `Dashboard.tsx:532`) och
beslut (`RightPanel.tsx:510,601`, `Dashboard.tsx:792`) raderas direkt vid klick på
en papperskorgsikon som dyker upp vid hover. Anteckningar, projekt och leverantörer
har bekräftelsedialog. Inkonsekvent och lätt att råka ut för — ikonen sitter
dessutom precis intill "öppna"-ytan.

**Åtgärd:** använd `openConfirmDialog` överallt, eller inför ångra.

### Redigering och dataförlust i formulär

**21. Task-modalen tappar osparade ändringar** — `components/TaskModal.tsx:135-149`.
`useEffect(..., [task])` körs om varje gång uppgiftsobjektet byter referens. Länkar
man en uppföljning (som skriver till storen direkt, rad 469-501) **nollställs
titel, beskrivning och progress-anteckningar** som ännu inte sparats. Dessutom
kastas allt bort utan varning vid Escape, klick utanför eller "Cancel" — inklusive
progress-anteckningar man tryckt "Add" på (de ligger i lokal state till Save).

**Åtgärd:** byt effektberoende till `[editingTaskId]`, och varna vid stängning med
osparade ändringar.

**22. Escape avbryter inte inline-redigering** — `RightPanel.tsx:466-485,545-564`,
`Sidebar.tsx:266-284`, `Dashboard.tsx:941-962`. Alla följer samma mönster: Escape
sätter bara `editingId = null` och nollställer aldrig utkasttexten, medan `onBlur`
sparar villkorslöst. Det finns alltså ingen implementerad väg att ångra en
redigering — klickar man bort sparas den alltid.

**Åtgärd:** nollställ utkastet i Escape-grenen och sätt en `cancelledRef` som
`onBlur` respekterar.

**23. Mall skriver över innehållet utan varning** — `NoteEditor.tsx:496-502`.
`applyTemplate` gör `editor.commands.setContent(content)` rakt av. Knappen visas
visserligen bara när editorn är tom (`editor.isEmpty`, rad 993), men "tom" gäller
bara brödtexten — inget varnar och det finns ingen ångra efter `setContent`.

### Navigation och upptäckbarhet

**24. Flikar finns i state men syns aldrig** — `store.ts:96-97`, `TabBar.tsx`.
Storen har `openTabs`, `App.tsx:426` binder Ctrl+1–9 till "byt flik" och Ctrl+W
till "stäng flik", och både startsidan (`App.tsx:325-326`) och hjälpen
(`HelpModal.tsx:383-384`) dokumenterar dem. Men `TabBar` renderar bara en
brödsmula — **inga flikar visas**. Genvägarna styr osynligt tillstånd.

**Åtgärd:** rendera de öppna flikarna i `TabBar`, eller ta bort genvägarna och
dokumentationen av dem.

**25. Sökmodalen saknar tangentbordsnavigering** — `SearchModal.tsx:174` har
bokstavligen `onKeyDown={() => {}}`. Ctrl+Shift+F öppnar sökningen, men man kan
inte pila ner i träffarna eller trycka Enter — man måste ta musen. Kommandopaletten
har navigering (`CommandPalette.tsx:237`), sökningen inte.

**26. `CustomSelect` går inte att använda med tangentbordet** —
`components/ui/CustomSelect.tsx`. Ingen piltangentshantering, inget Enter, inget
Escape, ingen `role="listbox"`. Används för Status, Priority och alla filter.

**27. Popup-menyer hamnar utanför fönstret** — ingen av dem vänder sig uppåt när
det inte får plats nedåt:
- slash-menyn `SlashCommandExtension.tsx:236` (`top = rect.bottom + 4`)
- @-omnämnanden `MentionSuggestion.tsx:107`
- högerklicksmenyn i sidomenyn `Sidebar.tsx:601` (`left/top` = musposition, ingen clamp)
- `CustomSelect.tsx:45` (`top-full`)

Skriver man `/` längst ner i en lång anteckning syns menyn inte alls.

**28. Två olika "Dashboard" med samma etiketter och olika siffror** —
`App.tsx:162-174` (vyn `dashboard`) visar projektfiltrerad statistik;
`Dashboard.tsx:1270-1275` (vyn `tasks`) visar **ofiltrerad** global statistik med
samma fyra etiketter. Dessutom räknar statistikrutan "Follow-ups" bara fristående
uppföljningar medan flikbadgen strax under (`Dashboard.tsx:1265`) räknar
uppföljningar **plus** flaggade uppgifter — två olika tal för samma sak på samma skärm.

**29. Projekt kan arkiveras i datamodellen men inte i UI:t** — `types/index.ts:5`
har `archived` och nio ställen filtrerar på `!p.archived`, men ingenting sätter
någonsin flaggan. Projekt kan bara raderas.

**30. Bekräftelsetexten för projektradering stämmer inte** — `Sidebar.tsx:298`
säger att alla anteckningar tas bort, men `deleteProject` (`store.ts:246`) behåller
anteckningar som är länkade till flera projekt.

### Export och e-post

**31. Filnamn saneras inte** — `NoteEditor.tsx:1044,1066` skickar
`${note.title}.md` rakt in i `downloadFile`. Titlar med `/ \ : * ? " < > |` ger
ogiltiga Windows-filnamn.

**32. Markdown-exporten tappar innehåll** — `utils/export.ts:10-37`. Regex-baserad
HTML→Markdown utan stöd för tabeller, bilder eller checkboxar. Catch-all-regexen
`md.replace(/<[^>]+>/g, '')` på rad 34 **stryker alla bilder** ur exporten och
plattar ut tabeller till löpande text.

**33. "Email summary" trunkerar tyst** — `export.ts:68` klipper anteckningen vid
400 tecken, `export.ts:131` klipper mailto-texten vid 1500. Inget i UI:t antyder det.

**34. Outlook-ämnesraden hanterar inte åäö** — `electron/main.cjs:258` skriver
`Subject: ${subject}` som rå ASCII-header i .eml-filen. Svenska tecken i
anteckningstiteln blir förvanskade i Outlook. (Radbrytning i titeln möjliggör
dessutom header-injektion.) Behöver RFC 2047-kodning.

**35. Sammanfattningens HTML escapas inte** — `export.ts:91-111`. Innehåller
sammanfattningen `<` eller `&` blir Outlook-HTML:en trasig.

**36. Rå transkriptionstext injiceras som HTML i anteckningen** —
`TranscriptTab.tsx:117`: `<p …>${transcript.rawText.trim()}</p>` utan escaping.
`<`-tecken i transkriptionen förstör anteckningens innehåll.

### Övrigt

**37. Stavningskontrollen är engelsk** — `electron/main.cjs:613-632` bygger en
kontextmeny med `dictionarySuggestions` men anropar aldrig
`session.setSpellCheckerLanguages(['sv','en-US'])`. Svenska anteckningar blir helt
rödmarkerade.

**38. Native `alert`/`confirm`/`prompt` på 15 ställen** — bl.a.
`useTranscription.ts` (7 st), `SettingsModal.tsx:274,276,310`,
`CommandPalette.tsx:73,207,210`, `App.tsx:440`. Blockerande systemdialoger i en app
som annars har egen `ConfirmDialog`. `prompt('Project name:')` i kommandopaletten
är särskilt malplacerad.

**39. Automatiskt stopp sker tyst** — `useTranscription.ts:475`. Efter
`autoStopHours` (standard 4 h) kallas `stop()` utan att användaren informeras.
Man tror man spelar in.

**40. AI-sammanfattning som misslyckas efter inspelning sväljs** —
`TranscriptTab.tsx:522-524`: tom `catch`. Användaren ser bara att ingen
sammanfattning dök upp.

**41. Tillgänglighet saknas helt** — 0 `aria-label` på 213 `<button>`, varav de
flesta är ikonknappar utan text. Ingen av de åtta modalerna har `role="dialog"`,
`aria-modal`, fokusfälla eller fokusåterställning. Tangentbordsanvändare kan
tabba ut bakom en öppen modal.

**42. Högerpanelen har fast bredd** — `RightPanel.tsx:287` `w-96` utan
storleksdrag. Transkriptionsfliken är dessutom bara en ikon utan etikett, till
skillnad från de två andra flikarna.

**43. Teams-prompten startar inspelning via en timing-hack** —
`TeamsRecordingPrompt.tsx:44-47`: `setTimeout(… 50 ms)` + ett window-CustomEvent.
Hinner panelen inte monteras startar inspelningen tyst aldrig.

---

## P3 — Kodhälsa

**44. 27 TypeScript-fel — och bygget kollar inte typer.** `npm run build` kör bara
`vite build`; det finns inget `typecheck`-script och tsc ingår inte i bygget. Alla
27 fel går därför obemärkta hela vägen till release. Fördelning: `seed.ts` (20,
använder borttagna fält `projectId`/`tags`), `NextMeetingPrep.tsx` (3),
`TranscriptTab.tsx:421-422` (`maxTokens`/`autoMaxTokens` finns inte i `AppSettings`
— rester efter reverten), `SettingsModal.tsx:422` + `Sidebar.tsx:590`
(`import.meta.env` saknar `vite/client`-typer).

**Åtgärd:** lägg `"types": ["vite/client"]` i `tsconfig.json`, fixa felen och gör
`"build": "tsc --noEmit && vite build"`.

**45. ~760 rader död kod.** `NextMeetingPrep.tsx` (181), `KanbanBoard.tsx` (297),
`utils/seed.ts` (281) importeras aldrig. Därtill `TranscriptList` i
`TranscriptTab.tsx:351-408` (58 rader, dupliceras inline på rad 694-754),
`getTemplateContent` och `TEMPLATE_OPTIONS` i `templates.ts:46-54`, och
`setSupplierTemplate` — `Supplier.defaultTemplate` finns i modellen men mallar
appliceras aldrig automatiskt på nya anteckningar.

**46. Död persisterad state.** `releaseVersionDraft`, `releaseNotesDraft` och
`releaseHistory` (`store.ts:16-22`) läses inte från någon komponent — fliken
"Version history" hämtar numera från GitHub-API:et. De skrivs ändå till disk vid
varje sparning.

**47. Hjälpfunktioner kopierade i tre filer.** `ownerInitials`, `ownerHue`,
`getDueDateUrgency`, `formatDueDate`, `formatTimeLeft`, `PRIORITY_BORDER`,
`PRIORITY_LABEL`, `DUE_DATE_CLASSES`, `NEXT_STATUS` finns identiska i
`RightPanel.tsx:58-101`, `Dashboard.tsx:30-97` och delvis `TaskModal.tsx:6-14`.

**48. Komponenter definierade inuti `Sidebar`.** `ColorDot` (rad 123) och
`SupplierRow` (rad 161) skapas på nytt vid varje render av `Sidebar`, vilket gör dem
till nya komponenttyper → React monterar om hela underträdet. Färgväljarens
öppet-läge nollställs vid varje omrendering av sidomenyn.

**49. Persistering vid varje tangenttryck.** `NoteEditor.tsx:317-321` anropar
`updateNote` per `onUpdate` från Tiptap. Varje anslag serialiserar hela storen till
JSON och skickar den över IPC till disk. Med några hundra anteckningar blir det
märkbar fördröjning i skrivandet. Samma sak gäller `htmlPreview`
(`Sidebar.tsx:116`) och `htmlToText` (`SearchModal.tsx:45`) som bygger DOM-noder
för varje anteckning vid varje render respektive tangenttryck i sökrutan.

**50. `btoa(String.fromCharCode(...new Uint8Array(buf)))`** — `NoteEditor.tsx:159`.
Spread av en stor array spränger anropsstacken vid inklistring av större bilder
(gäller webbläsarläget; Electron-vägen går via `electronImages.save`).

**51. Bundlen är 969 kB** (277 kB gzip) i en enda chunk. Ingen kodsplittring —
Tiptap-tilläggen laddas även för användare som aldrig öppnar editorn.

**52. Ladysucker-temat är ~180 rader `!important`-överskrivningar** av
Tailwind-klassnamn (`index.css:247-428`), inklusive `.ladysucker * { border-color:
… !important }`. Varje ny färgklass i en komponent måste läggas till manuellt,
annars går temat sönder punktvis. (Värt att notera inför delning med kollegor,
tillsammans med NDA-punkten i `Bugs_Improvements`: temat heter så i UI:t.)

**53. API-nycklar lagras i klartext** i `Combobulator-data.json` (`store.ts` →
`partialize` inkluderar `settings`). De ingår inte i exporten, men ligger oskyddade
på disk — och i den delade nätverksmappen om man använder funktionen "Change
folder". Electrons `safeStorage` skulle kryptera dem mot användarens OS-konto.

**54. Overlay-fönstret får hela preload-API:t** — `electron/main.cjs:296` laddar
samma `preload.cjs` som huvudfönstret, så Teams-overlayen kan läsa och skriva hela
datalagret trots att den bara behöver två IPC-anrop.

**55. Prompten har en stavfel-artefakt** — `utils/summarize.ts:29` slutar med
`"appropriate.."` (dubbelt punkttecken). (Själva prompten är däremot redan generisk,
så punkten "AI summary instructions not good" i `Bugs_Improvements` är i praktiken
redan åtgärdad.)

---

## Föreslagen ordning

1. **Punkt 1–4** först. Backup/återställning och atomiska skrivningar — allt annat
   är meningslöst om data kan försvinna. (~en dags arbete)
2. **Punkt 11** — ta bort debug-instrumenteringen. Enda punkten som direkt påverkar
   hur appen upplevs vid fel, och den är mekanisk.
3. **Punkt 44** — slå på typkontroll i bygget, städa punkt 45–46 samtidigt. Fångar
   framtida regressioner av samma slag som 17 och 44.
4. **Punkt 10, 12, 13, 14** — transkriberingskedjan, som är appens kärnvärde.
5. **Punkt 18–20** — dina egna noteringar om uppföljningar.
6. Resten efter behov.
