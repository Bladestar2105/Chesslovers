# Chesslovers – ToDo für die weitere Entwicklung

## 1) Sicherheit & Betrieb
- [ ] Admin-Login auf HttpOnly-Cookies umstellen (statt Token im Browser-Speicher).
- [ ] Optionales 2FA für Admin-Bereich (TOTP).
- [ ] Rate-Limits zentral konfigurierbar machen (Env-Variablen + Admin-Info anzeigen).
- [ ] Sicherheitsrelevante Audit-Logs ergänzen (Login-Fehler, Passwortänderungen, Federation-Änderungen).

## 2) Replay- und Analysefunktionen
- [ ] Replay-Analyse in einen Hintergrund-Job auslagern (Queue), um API-Latenz zu reduzieren.
- [ ] Mehr Analyse-Metriken anzeigen (Centipawn-Loss, Accuracy, Bestmove-Übereinstimmung).
- [ ] Analyse-Ergebnisse serverseitig cachen/persistieren, damit Wiederholungen schneller laden.
- [ ] Analyse-Einstellungen pro Nutzer (Tiefe/Level, maximale Plies) konfigurierbar machen.

## 3) UX/UI Verbesserungen
- [ ] Einheitliches Toast-/Modal-System als wiederverwendbare Komponente extrahieren.
- [ ] Mobile-Optimierung für Game-Controls und Move-History.
- [ ] Barrierefreiheit verbessern (ARIA-Rollen, Fokusfallen in Modals, Tastatursteuerung).
- [ ] Bessere Fehlermeldungen inkl. lokalisierter Texte (DE/EN) für alle Admin-Aktionen.

## 4) Matchmaking & Federation
- [ ] Federated Matchmaking observability (Metriken: Queue-Zeit, Match-Erfolg, Partner-Timeouts).
- [ ] Federation-Link Health-Checks im Admin-Dashboard detaillierter darstellen.
- [ ] Version-/Kompatibilitätsprüfung um semver-Regeln erweitern.
- [ ] Konfliktlösung bei Replay-Sync verbessern (Duplikate/Updates mit klarer Priorität).

## 5) Qualitätssicherung
- [ ] API-Integrationstests für `/api/admin/login` und `/api/analyze/replay` (isolierte Test-DB).
- [ ] E2E-Tests für Admin-Dialoge (Delete/Sync/Password-Reset).
- [ ] Lasttests für Analyse-Endpunkte (Stockfish-Prozessanzahl und Timeouts).
- [ ] CI-Pipeline erweitern: getrennte Jobs für Unit, Lint, Build, E2E.
