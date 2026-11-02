# Komáří nálet

Minihra pro Aktuárskou kariérní hru. Hráč spí a komáři létají k jeho hlavě. Klepnutím je zastavuje dřív, než ukousnou
(8 krevních kapek, 30 sekund). Hra je samostatná webová aplikace (React + TypeScript + Vite) komunikující s hlavní hrou
přes `postMessage` podle `universal-specification.md` (protokol verze 1).

## Příkazy

```
npm install       # závislosti (přesné verze, bez install skriptů – viz .npmrc)
npm run dev       # vývoj; samostatně: http://localhost:5173/?level=2&payload={"duration":20,"blood":5}
npm test          # automatické testy (Node test runner, bez UI, cca 1 s)
npm run typecheck # jen kontrola typů
npm run build     # typecheck + produkční build do dist/
npm run preview   # náhled buildu
```

Vyžaduje Node ≥ 22.18 (testy spouští `.ts` přímo). Žádné další závislosti kromě React.

## Architektura

| Vrstva | Soubory | Poznámka |
|---|---|---|
| Konfigurace | `src/config.ts` | **Všechny** ladicí parametry, okomentované. |
| Simulace | `src/sim.ts`, `src/pacing.ts`, `src/rng.ts` | Čisté TS bez DOMu, deterministické (seedované RNG). Pravidla, spawn, zásahy, série, konec. |
| Průběh kola | `src/controller.ts` | Pevný krok 1/60 s (akumulátor), pauza, prodleva před výsledky, úklid. Bez DOMu → testovatelné. |
| Skóre | `src/scoring.ts` | `successRate`, hodnost, slovní krevní ztráta, hlášky, výstupní `payload`. |
| Integrace | `src/minihra-protokol.ts`, `src/init.ts` | Protokol + validace `level`/`payload` s výchozími hodnotami. |
| Vykreslení | `src/renderer.ts`, `src/scene.ts`, `src/sprites.ts` | Canvas 2D, vše procedurální (žádné externí soubory). Kosmetické efekty žijí jen tady. |
| Prohlížeč | `src/session.ts`, `src/audio.ts` | rAF smyčka, pointer vstup, viditelnost stránky, reduced motion, WebAudio syntezátor. |
| UI | `src/App.tsx`, `src/Game.tsx`, `src/ui.tsx`, `src/styles.css` | React jen pro obrazovky a HUD. |

Důležité principy:
- Pohybující se komáři **nejsou v Reactu**. React dostává snímek HUD jen když se změní (sekunda, krev, skóre, série).
- Simulace běží v pevném kroku, vykreslení interpoluje (`alpha`), takže hra běží stejně na 60 i 120 Hz.
- Svět je vždy 360 jednotek široký, výška se řídí poměrem stran herní plochy (480–900). Při změně velikosti se
  přepočítá výška, ale **postup** každého komára po jeho dráze se zachová, takže nikdo neskočí k cíli.
- HUD a ovládání jsou mimo plátno. Komáři se rodí těsně za okrajem plátna, nikdy pod HUD ani tlačítky, a klepnutí
  na ovládání se nikdy nepočítá jako minutí. Texty a odpočet se kreslí *pod* komáry, takže nikdy nezakryjí cíl.
- Úklid: `GameSession.destroy()` zruší rAF, odebere všechny listenery (pointer, visibility, pagehide, media query) a
  zastaví bzučení. `Game` se při restartu vždy odmontuje a vznikne nová simulace od nuly.

## Výchozí hodnoty (`src/config.ts`)

Vstup od hlavní hry (viz níže): `level` 1–3 (výchozí 1), `payload.duration` 10–120 s (30), `payload.blood` 1–20 (8).

| Parametr | Hodnota |
|---|---|
| Krok simulace | 1/60 s, max 5 kroků na snímek, snímek delší než 0,25 s se ořízne |
| Pomalý komár | 80 j/s, 1 zásah, 10 b., hit area 30 |
| Rychlý komár | 130 j/s, jemný cik-cak (amplituda 14), 1 zásah, 10 b. |
| Boss | 56 j/s, 3 zásahy, 30 b., hit area 42, vždy nejvýš jeden |
| Minimální čas letu (rodiště → cíl) | pomalý 2,4 s, rychlý 1,6 s, boss 4 s |
| Rozestupy | min. 70 j. mezi komáry při spawnu, příletové časy se liší o ≥ 0,4 s (žádné nevyhnutelné kousnutí) |
| Max. souběžně | 7 běžných komárů + boss |
| 0–5 s | interval 1,5→1,4 s, 10 % rychlých |
| 5–15 s | interval 1,3→1,1 s, 50 % rychlých, první boss v 7,5 s (další v 18 s a 25,5 s) |
| 15 s | „Zhasnuto. Začíná peklo.“, skok na interval 0,8→0,55 s, rychlost ×1,2→×1,5, 70 % rychlých |
| 25–30 s | interval 0,5→0,42 s, rychlost ×1,5→×1,6, velký odpočet |
| Skóre | běžný 10, boss 30, každá 5. úspěšná klepnutí v řadě +10 |
| Série | zásah (i nesmrtelný na bosse) +1, minutí = 0, klepnutí na ovládání se nepočítá |
| Úroveň 2 / 3 | rychlost ×1,15 / ×1,3, četnost spawnů ×1,2 / ×1,4 |

Všechny časy pacingu jsou **zlomky délky kola**, takže jiná `duration` zachová stejný tvar kola.

### Duplicitní vstup
Tři vrstvy: (1) jen `pointerdown` s `preventDefault`, ignoruje se stejný `pointerId` + `timeStamp` a jiná než hlavní tlačítka myši;
(2) simulace zahodí klepnutí do 0,04 s a 6 jednotek od předchozího; (3) jedno klepnutí zasáhne nejvýš jednoho (nejbližšího) komára.

## Integrace podle `universal-specification.md` (zkontrolováno)

**`level`**: 1–3, výchozí 1 (násobí rychlost a četnost spawnu). Neplatná hodnota → výchozí.

**Vstupní `payload`** (vše nepovinné, neznámá pole se ignorují, neplatná hodnota → výchozí):

| Pole | Rozsah | Výchozí |
|---|---|---|
| `duration` | celé číslo 10–120 (s) | 30 |
| `blood` | celé číslo 1–20 | 8 |
| `allowReplay` | `true` | `false` |

Payload, který není objekt (řetězec, číslo, pole), vyvolá `ERROR` `INVALID_PAYLOAD` a chybovou obrazovku. Žádný
payload ani `level` není chyba. Nový `INIT` (i po `FINISH` nebo po chybě) začne znovu od úvodní obrazovky.

**`successRate`** = 0,5 · (přežitý čas / délka kola) + 0,5 · (zbylá krev / začáteční krev, jen když kolo skončilo uplynutím času).
Dokonalá noc = 1, přežití s jednou kapkou ≈ 0,56, smrt v polovině ≈ 0,25, vzdání se = 0. Vždy konečné číslo v 0–1.

**Výstupní `payload`** (`FINISH`): `{ level, survived, endReason ("timeUp"|"bloodOut"|"gaveUp"), timeSurvivedSec, eliminated,
bossesEliminated, bites, bloodLeft, bloodMax, score, bestStreak, accuracy, rank }`.

Kontrola proti specifikaci:

| Požadavek | Stav |
|---|---|
| `startMinihra` hned po startu, do `INIT` jen „Načítám…“ | ano (`App.tsx`) |
| Funguje bez `level` a bez `payload` | ano (ověřeno v prohlížeči i testem) |
| Jediný `FINISH`, tlačítko **Pokračovat** | ano; tlačítko se po odeslání zablokuje, `finish()` navíc chrání proti dvojímu odeslání |
| `succesRate` s překlepem se posílá | ano (obstarává `minihra-protokol.ts`) |
| `ERROR` `INVALID_PAYLOAD` / `INTERNAL` | ano; `INTERNAL` z error boundary |
| „Vzdát se“ vždy dostupné | ano, ve spodní liště po celou hru |
| Jasný konec, nelze uvíznout | čas, krev, vzdání se |
| Bez `localStorage`/cookies/`alert`/`confirm`/drag & drop/externích odkazů | ano (ověřeno prohledáním `src/`) |
| Zvuk až po prvním dotyku, vypnutelný, hratelné bez něj | ano; `AudioContext` vzniká v obsluze klepnutí |
| Texty česky, neutrální oslovení | ano (imperativy, trpný rod) |
| Písmo s českou diakritikou | systémový zásobník (Trebuchet MS / Segoe UI / Roboto) |
| Stejná rychlost na 60 a 120 Hz | pevný krok, test pro 60/120/144 Hz |
| Cíle ≥ 44 px, portrét 360–430 px bez vodorovného posunu | tlačítka ≥ 48 px; ověřeno na 390 px (scrollWidth = šířka okna) |

Rozpory a rozhodnutí:
1. **Referenční soubor protokolu.** Kód ve specifikaci neumí `VITE_ALLOWED_PARENT_ORIGINS`, ačkoli text v části Security
   ho zmiňuje. Použita je varianta ze sousedních miniher v repozitáři (`skladani_karty`), která je rozšířením se stejným
   API. Chování bez nastavené proměnné je shodné. Příklad: `.env.example`.
2. **„Ještě jednu noc“ vs. jediný `FINISH`.** Opakování uvnitř iframu by dovolilo hráči vybírat výsledek. Proto se
   nabízí jen (a) při samostatném spuštění, nebo (b) v iframu, když hlavní hra pošle `payload.allowReplay: true`, a to jen
   *před* stisknutím **Pokračovat**. Po odeslání výsledku už jen čeká na další `INIT`. Přerušené kolo se bez `FINISH` zahodí.
3. **Pozastavení.** Při skrytí stránky se hra zastaví a ukáže dialog „Pauza“ s tlačítkem **Hrát dál** (žádné automatické
   pokračování, aby návrat nezpůsobil okamžitou prohru).
4. **Zajímavosti o komárech** na obrazovce výsledků jsou vynechány: fakta jsem neověřoval, a zadání je při nejistotě
   vylučuje.

## Ruční kontrolní seznam

Mobil (skutečný telefon, portrét 360–430 px):
- [ ] Klepání prstem zasahuje komáry přesně tam, kde je vidět; více prstů zároveň funguje, jedno klepnutí zasáhne jen jednoho.
- [ ] Stránka se nikdy neposouvá, nepřibližuje (pinch, double-tap) a neoznačuje text.
- [ ] HUD nahoře a lišta dole jsou celé vidět (i s výřezem/notchem a spodní lištou prohlížeče); **Vzdát se** a **Zvuk** se trefí palcem.
- [ ] Komáři vlétají zpoza okraje herní plochy, nikdy ne zpod HUD nebo tlačítek.
- [ ] Klepnutí na **Vzdát se** / **Zvuk** neresetuje sérii.

Změna velikosti:
- [ ] Otočení telefonu a změna velikosti okna uprostřed kola: komáři nikam neskáčou, nikdo se neobjeví u cíle, kolo pokračuje.
- [ ] Široké okno na desktopu: herní plocha je uprostřed, vše použitelné myší.

Zvuk:
- [ ] Do prvního klepnutí je ticho; po **Začít** zní plácnutí, série, kousnutí, zhasnutí, konec.
- [ ] Boss bzučí hlouběji; bzučení zmizí po jeho smrti, pauze i konci kola.
- [ ] **Zvuk/Ticho** funguje na úvodní obrazovce i v průběhu hry; hra je plně hratelná v tichu.

Na pozadí:
- [ ] Přepnutí na jinou kartu/aplikaci uprostřed kola → po návratu je vidět „Pauza“, čas ani krev se nezměnily; **Hrát dál** pokračuje.
- [ ] Zamknutí telefonu totéž. Po několika minutách na pozadí nejsou žádná kousnutí navíc.

Obtížnost:
- [ ] 0–5 s: hlavně pomalí, žádný tlak. 5–15 s: první velký komár kolem 7–8 s, tři zásahy ho zabijí a ukazatele se ubírají.
- [ ] V 15 s ztmavne místnost, objeví se „Zhasnuto. Začíná peklo.“ a tempo je znatelně vyšší, ale pořád zvládnutelné.
- [ ] Posledních 5 s: velký odpočet na pozadí (nezakrývá komáry), HUD čas zčervená.
- [ ] Nehrající hráč prohraje (krev dojde cca ve 13. s), pozorný hráč kolo obvykle přežije.
- [ ] Série: každé 5. úspěšné klepnutí → „Plácací série!“ a +10 b.; minutí sérii vynuluje, ale nebere krev.

Protokol (tester <https://tester-eight-sandy.vercel.app>):
- [ ] Prázdný payload, nesmyslné hodnoty (`{"duration":500}`), payload jako řetězec (→ `INVALID_PAYLOAD`), okamžité vzdání se.
- [ ] Právě jeden `FINISH`; po novém `INIT` hra začíná od úvodní obrazovky.

## Co bylo a nebylo ověřeno

Ověřeno: `npm test` (44 testů: boss na tři zásahy, kousnutí a krev, série a bonusy, konec kola, čistý restart, duplicitní
vstup, pauza, 60/120/144 Hz, změna velikosti, pacing, validace INIT, skóre), `npm run build`, a běh v prohlížeči
(úvod, hra, zhasnutí, pauza při skrytí stránky, výsledky, široké okno, iframe s hostitelskou stránkou: `READY`, `INIT`,
jediný `FINISH`, `ERROR`, nový `INIT`).

Neověřeno: skutečný dotyk na telefonu, slyšitelný zvuk, chování na 120 Hz displeji (pokryto jen testem simulace)
a obtížnost lidským hráčem (testy používají jen boty). Ladění proveďte v `src/config.ts`.
