# node-red-contrib-garmin-empirbus

Node-RED-Nodes für die Anbindung an eine Garmin EmpirBus MCU oder ein Garmin Serv7 Display, das als MCU arbeitet.

Das Paket nutzt [`garmin-empirbus-ts`](https://www.npmjs.com/package/garmin-empirbus-ts) für die eigentliche EmpirBus-Kommunikation. Die Node-RED-Nodes bilden darauf eine möglichst einfache, konsistente API für Status, Schalter, Taster, Dimmer und erweiterte Befehle ab.

## Deutsch

### Installation

```bash
cd ~/.node-red
npm install node-red-contrib-garmin-empirbus
```

Danach Node-RED vollständig neu starten.

### Grundkonzept

Zuerst wird ein **EmpirBus Config**-Node mit der WebSocket-Adresse des Garmin-Geräts angelegt. Beispiel:

```text
ws://192.168.1.1:8888/ws
```

Wenn genau eine EmpirBus-Konfiguration vorhanden ist, wird sie beim Hinzufügen neuer EmpirBus-Nodes automatisch ausgewählt.

Die meisten Nodes können einen Kanal auf mehrere Arten bestimmen. Die Priorität ist:

1. ausgewählte Channel-Checkboxen im Node,
2. dynamische Channel ID aus der Nachricht, z. B. `msg.topic = "empirbus/87"`,
3. einzelne konfigurierte Channel ID,
4. Channel Name.

Mehrere ausgewählte Channel IDs werden unterstützt.

### EmpirBus Config

Stellt die gemeinsame WebSocket-Verbindung zur Garmin EmpirBus MCU bereit. Alle anderen EmpirBus-Nodes referenzieren diesen Config-Node.

**Typischer Einsatz:** genau ein Config-Node pro Garmin-MCU.

### EmpirBus State

Empfängt Statusänderungen und gibt einen normalisierten Zustand aus.

Beispiel:

```javascript
msg.topic = "empirbus/27";
msg.payload = {
    state: {
        power: "ON",
        unavailable: false,
        error1: false,
        error2: false
    }
};
```

Je nach Kanal kann `msg.payload.state` unter anderem enthalten:

- `power`
- `brightness`
- `percentage`
- `temperature`
- `thermostatSetPoint`
- `rangeValue`
- `unavailable`
- `error1`
- `error2`

Nach jedem Deploy oder Neustart wird der erste empfangene Zustand jedes relevanten Kanals immer ausgegeben. Anschließend werden identische Zustände unterdrückt.

### EmpirBus Switch

Setzt einen Kanal auf den gewünschten Ein-/Aus-Zustand. Der Node erkennt anhand der zuletzt empfangenen MFD-Statusmeldung automatisch, ob der Kanal in EmpirBus als Pulse/Switch oder als Momentary-Kanal arbeitet.

Bevorzugte Eingaben:

```javascript
msg.payload = "ON";
msg.payload = "OFF";
```

Strings werden unabhängig von Groß-/Kleinschreibung ausgewertet. Ebenfalls unterstützt werden:

```javascript
msg.payload = true;
msg.payload = false;
msg.payload = 1;
msg.payload = 0;
msg.payload = { state: { power: "ON" } };
```

Bei Pulse-Kanälen wird der gewünschte Zustand direkt gesendet. Bei Momentary-Kanälen vergleicht der Node den gewünschten Zustand mit dem zuletzt gemeldeten <code>onOffStatus</code> und sendet nur bei einer Abweichung einen kurzen Press/Release-Impuls von 150 ms. Ist Typ oder Zustand noch unbekannt, wird kein Befehl gesendet. Der tatsächliche EmpirBus-Status bleibt die Source of Truth.

### EmpirBus Button

Entspricht einem **Button / SendMomentary in der Garmin-Original-UI**.

Der Node besitzt drei Betriebsarten:

#### Short Press

Jede Eingangsnachricht löst einen kurzen Tastendruck aus:

```text
Press -> 150 ms -> Release
```

#### Long Press

Wie Short Press, aber mit frei einstellbarer Dauer zwischen 10 und 60000 ms.

#### Direct

Der Flow steuert Press und Release selbst:

```javascript
msg.payload = "PRESS";
msg.payload = "RELEASE";
```

`PRESS` und `RELEASE` sind die bevorzugten Werte. Zusätzlich werden case-insensitive `ON`/`OFF`, `true`/`false` und `1`/`0` unterstützt.

Für mehrere Kanäle stehen zwei Ausführungsarten zur Verfügung:

- **Sequential** (Standard): Jeder Kanal wird vollständig nacheinander gedrückt und losgelassen. Zwischen den Kanälen kann eine Pause von 0 bis 1000 ms eingestellt werden; Standard sind 5 ms.
- **Parallel**: Press wird zunächst für alle Kanäle gesendet, danach wird gewartet und anschließend Release für alle Kanäle gesendet.

Während Short Press oder Long Press ausgeführt wird, werden weitere Trigger ignoriert.

### EmpirBus Dimmer

Setzt einen Dimmwert. Der Eingabemodus wird im Node gewählt:

- **Raw:** Ganzzahl `0...255`
- **Percent:** `0...100`
- **Normalized:** `0.0...1.0`

Beispiel im Percent-Modus:

```javascript
msg.payload = 50;
```

Für <code>ON</code> kann im Feld <b>ON level</b> ein eigener Einschaltwert hinterlegt werden. Der Wert verwendet dasselbe Format wie der gewählte Eingabemodus. Bleibt das Feld leer, wird der jeweilige Maximalwert verwendet. <code>OFF</code> setzt immer 0.

Ungültige Werte werden abgelehnt und nicht automatisch begrenzt.

### EmpirBus Toggle

Kehrt den zuletzt bekannten Ein-/Aus-Zustand eines Kanals um.

Der Node benötigt dafür einen bekannten Zustand. Ist der Zustand eines ausgewählten Kanals noch unbekannt, wird kein Befehl gesendet. Bei mehreren Kanälen wird die Aktion nicht teilweise ausgeführt.

Wenn der Zielzustand bereits bekannt ist, sollte statt Toggle der **EmpirBus Switch** verwendet werden.

### EmpirBus Command

Erweiterter Node für Spezialfälle, Diagnose und zukünftige Funktionen ohne eigenen Node.

Der Node akzeptiert ausschließlich ein Rohtelegramm-Objekt in `msg.payload`. High-Level-Kurzformen oder JSON-Strings werden bewusst nicht unterstützt. Das Objekt wird vor dem Senden validiert; ein fehlendes `size` wird aus der Datenlänge bestimmt.

Für normale Flows sollten **Switch**, **Button**, **Toggle** und **Dimmer** bevorzugt werden. Details des Telegrammformats gehören in die technische Dokumentation von `garmin-empirbus-ts`.

### Acknowledge

Bei aktiven Nodes ist **Acknowledge standardmäßig deaktiviert**.

- Acknowledge aus: kein Ausgang.
- Acknowledge an: ein Ausgang mit dem bestehenden Alexa-kompatiblen Acknowledge-Format.

Das Format bestehender Acknowledge-Nachrichten wird aus Kompatibilitätsgründen nicht inkompatibel verändert.

### Beispiele

Ein importierbarer Beispiel-Flow liegt unter [`examples/flow.json`](examples/flow.json). Er enthält Beispiele für State, Switch, Button, Dimmer, Toggle und Debug. Der EmpirBus-Debug-Node ist dort direkt mit einem normalen Node-RED-Debug-Node verbunden. Die verwendeten Channel IDs sind Beispiele und müssen an die eigene EmpirBus-Konfiguration angepasst werden.

## English

### Installation

```bash
cd ~/.node-red
npm install node-red-contrib-garmin-empirbus
```

Restart Node-RED afterwards.

### Basic concept

Create an **EmpirBus Config** node first and configure the WebSocket URL of the Garmin device. If exactly one EmpirBus configuration exists, newly added EmpirBus nodes select it automatically.

Most nodes can resolve channels from selected channel checkboxes, a dynamic `msg.topic` such as `empirbus/87`, a configured Channel ID, or a Channel Name. Multiple selected channels are supported.

### Node overview

- **EmpirBus Config** — shared Garmin EmpirBus WebSocket connection.
- **EmpirBus State** — receives and normalizes channel state changes.
- **EmpirBus Switch** — sets a requested ON/OFF target and automatically uses pulse or momentary control based on the last received MFD status type.
- **EmpirBus Button** — equivalent to a Garmin UI **Button / SendMomentary** and supports Short Press, Long Press and Direct control.
- **EmpirBus Dimmer** — accepts raw, percent or normalized dimming values and supports a configurable ON level.
- **EmpirBus Toggle** — inverts the last known channel state and requires a known state.
- **EmpirBus Command** — advanced raw-command escape hatch for special cases and diagnostics.
- **EmpirBus Debug** — passively observes and filters raw RX/TX EmpirBus traffic.

The Node-RED editor contains detailed bilingual help for every node, with German first and English second.

### Examples

An importable example flow is available at [`examples/flow.json`](examples/flow.json). The channel IDs in the example are placeholders and need to be adapted to the target EmpirBus installation. The example also connects EmpirBus Debug to a standard Node-RED Debug node.

---

All product names, logos and brands are property of their respective owners. They are used in this project for identification purposes only.

## EmpirBus Debug

### Deutsch

`EmpirBus Debug` beobachtet die rohe Kommunikation zwischen Node-RED und EmpirBus, ohne sie zu verändern. Der Node besitzt keinen Eingang und einen Ausgang, der üblicherweise mit einem normalen Node-RED-`debug`-Node verbunden wird.

Filterbar sind die Richtung (`Both`, `Received`, `Sent`), alle oder ausgewählte Kanal-IDs sowie die Verkehrskategorien `Control commands`, `Status messages`, `System traffic` und `Heartbeat`. Standardmäßig werden Steuerbefehle und Statusmeldungen in beide Richtungen ausgegeben; Systemverkehr und Heartbeats sind deaktiviert.

Die Ausgabe enthält `direction`, `channelId` soweit vorhanden, `category`, `command`, `timestamp` und das unveränderte Rohtelegramm unter `message`. Beispiel: `EmpirBus Debug -> Debug`.

### English

`EmpirBus Debug` observes raw communication between Node-RED and EmpirBus without modifying it. It has no input and one output, normally connected to a standard Node-RED `debug` node.

Filters are available for direction (`Both`, `Received`, `Sent`), all or selected channel IDs, and the traffic categories `Control commands`, `Status messages`, `System traffic`, and `Heartbeat`. By default control commands and status messages are emitted in both directions, while system traffic and heartbeats are disabled.

The output contains `direction`, `channelId` when available, `category`, `command`, `timestamp`, and the unchanged raw telegram under `message`.
