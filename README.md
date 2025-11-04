# 🚀 BeaconBay - Web Bluetooth BLE Analyzer

Willkommen bei BeaconBay, einer modularen Web-App zur Echtzeit-Analyse von Bluetooth Low Energy (BLE) Advertisements. Dieses Projekt dient als Blaupause für robuste, skalierbare Web-Anwendungen mit der Web Bluetooth API.



Das Hauptziel dieses Projekts ist **pädagogisch**: Es demonstriert eine strikt modulare, unidirektionale JavaScript-Architektur, die zirkuläre Abhängigkeiten kategorisch ausschließt und auf maximale Wartbarkeit ausgelegt ist.

---

## 🏛️ Architektur-Philosophie

Dieses Projekt folgt einer strengen Regel für Abhängigkeiten, um "Circular Imports" zu verhindern und eine klare "Single Source of Truth" zu gewährleisten. Der Daten- und Kontrollfluss ist strikt unidirektional (von oben nach unten).

Der Abhängigkeits-Graph ist wie folgt definiert:

1.  `errorManager.js` (Keine Abhängigkeiten)
2.  `browser.js` & `utils.js` (Hängen nur von `errorManager.js` ab)
3.  `ui.js` (Hängt von `errorManager.js` & `utils.js` ab)
4.  `bluetooth.js` (Hängt von `errorManager.js`, `utils.js` & `ui.js` ab)
5.  `app.js` (Der "Orchestrator" – hängt von allen ab und verbindet sie)

Diese Struktur stellt sicher, dass tief liegende Module (wie `utils`) nichts von höher liegenden Modulen (wie `ui` oder `bluetooth`) wissen. Die Kommunikation nach "oben" erfolgt ausschließlich über Callbacks, die von `app.js` injiziert werden (Dependency Inversion).

---

## ✨ Features

* **Echtzeit-Scannen:** Nutzt die Web Bluetooth `requestLEScan()` API, um *alle* Advertisement-Pakete in Reichweite zu empfangen.
* **Modulares Parsing:** Integrierte Parser für gängige Formate:
    * **iBeacon** (Apple, Company ID `0x004C`)
    * **RuuviTag** (Data Format 5, Company ID `0x0499`) inkl. Temperatur, Feuchtigkeit, Druck und Batteriespannung.
* **Hersteller-Identifikation:** Löst Company IDs über eine `company_ids.json` auf.
* **Dynamische UI:**
    * Kartenbasierte Ansicht für jedes erkannte Gerät.
    * Live-Aktualisierung der RSSI-Werte, dargestellt als Chart.js Sparkline.
    * Sortierung nach Signalstärke.
    * "Stale"-Modus zum Ausblenden inaktiver Geräte.
* **Robustes Error-Handling:** Globales `window.onerror` und `onunhandledrejection` Fanganetz.
* **Keep-Alive-Modus:** Verhindert den Standby-Modus auf Mobilgeräten während eines Scans (mittels Screen Wake Lock API mit Audio-Fallback).

---

## 🔧 Projektstruktur

Das gesamte Projekt besteht aus 7 Kern-Dateien, die diese Architektur umsetzen:

```
/
├── index.html         # Das UI-Layout und Anwendungs-Container
├── style.css          # Das "Hacker-Theme" Styling
├── company_ids.json   # JSON-Datei der offiziellen Bluetooth Company Identifier
│
└── js/
    ├── app.js             # 🚀 Haupt-Einstiegspunkt, orchestriert alle Module
    ├── errorManager.js  # 🛡️ Globales Error-Handling (0 Abhängigkeiten)
    ├── browser.js         # 🔋 Browser-Interaktion (WakeLock, Audio-Fallback)
    ├── utils.js           # 🛠️ Daten-Parsing (iBeacon, Ruuvi) & Hilfsfunktionen
    ├── ui.js              # 🎨 DOM-Manipulation, Listener & Chart.js-Rendering
    └── bluetooth.js       # 📡 Web Bluetooth API-Logik, Scan-Management
```

---

## 🛠️ Getting Started

Da BeaconBay reines Vanilla JavaScript (ESM) verwendet, ist kein Build-Schritt erforderlich.

1.  **Repository klonen:**
    ```bash
    git clone [https://github.com/](https://github.com/)[Ihr-Username]/BeaconBay.git
    cd BeaconBay
    ```

2.  **Lokal servieren (Erforderlich):**
    Die Web Bluetooth API funktioniert aus Sicherheitsgründen **nur** über `https...` oder `localhost`. Sie können die `index.html` nicht direkt als Datei öffnen.

    Der einfachste Weg ist die Verwendung eines lokalen Servers. Wenn Sie VS Code nutzen, ist die Erweiterung **"Live Server"** ideal.

    Alternativ über Python (falls installiert):
    ```bash
    # Python 3
    python -m http.server 8000
    # Python 2
    python -m SimpleHTTPServer 8000
    ```

3.  **Öffnen:**
    Öffnen Sie `http://localhost:8000` in einem Web-Bluetooth-fähigen Browser (z.B. Chrome auf Desktop oder Android).

---

## 📜 Lizenz

Dieses Projekt ist unter der **MIT-Lizenz** lizenziert. Siehe `LICENSE`-Datei für Details. Es ist frei zur Nutzung, Modifikation und als Lernressource gedacht.
