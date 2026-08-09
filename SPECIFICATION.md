# node-red-contrib-garmin-empirbus — Technical Specification

## 1. Scope

`node-red-contrib-garmin-empirbus` exposes Garmin EmpirBus functionality as idiomatic Node-RED nodes. It is an adapter around `garmin-empirbus-ts`, not an independent protocol implementation.

Responsibilities:

- maintain a shared EmpirBus connection through a config node,
- provide channel selection in the editor,
- resolve configured and dynamic channel IDs,
- normalize Node-RED payloads,
- call the correct `garmin-empirbus-ts` operation,
- expose connection and operation status,
- emit compatibility-stable acknowledgement and state messages,
- provide bilingual Node-RED help.

Out of scope:

- low-level protocol byte construction except validating raw telegrams passed to the Command node,
- FlowFuse widget behavior,
- application-specific camper/heating logic,
- automatic migration of existing dashboard flows.

## 2. Package baseline

Current package metadata:

- Package: `node-red-contrib-garmin-empirbus`
- Current baseline version: `1.1.44`
- Node.js: `>=18`
- npm: `>=9`
- Node-RED: `>=4`
- Dependency: `garmin-empirbus-ts ^0.1.27`

Registered nodes:

```text
empirbus-config
empirbus-state
empirbus-switch
empirbus-button
empirbus-dim
empirbus-toggle
empirbus-command
```

## 3. Architectural rules

The package should remain thin:

```text
Node-RED editor/runtime
        ↓
normalize input
        ↓
resolve channels
        ↓
validate
        ↓
garmin-empirbus-ts repository
        ↓
EmpirBus
```

Shared behavior belongs in helpers rather than node-specific duplication.

Current shared areas include:

- `bindEmpirbusClientStatus`
- `channelHandling`
- `deriveChannelState`
- `getRepository`
- `inputPayload`
- `resultHandling`
- editor helper resources

## 4. Coding conventions

- Prefer self-documenting code.
- Avoid comments unless they document a protocol/compatibility constraint or unavoidable workaround.
- Use descriptive names and small focused functions.
- Keep function parameter lists and calls on one line when there are five or fewer parameters.
- Omit curly braces for single-statement `if` branches. Keep the single statement on the following indented line. Use braces whenever a branch contains more than one statement.
- Do not add framework-independent business logic to individual nodes.
- Preserve existing message contracts unless a breaking change is explicitly approved.

## 5. Configuration node

`EmpirBus Config` owns the shared connection/repository lifecycle.

It provides the repository to runtime nodes and channel data to the editor.

The editor exposes channel discovery through the existing administrative route/API.

### 5.1 Automatic config selection

When a new EmpirBus runtime node is added to the workspace:

- exactly one EmpirBus config exists → assign it immediately,
- zero configs exist → do not create one automatically,
- multiple configs exist → do not choose one,
- an existing selection → never overwrite it.

The automatic assignment is registered centrally through the Node-RED editor `nodes:add` event. Opening the edit dialog is not required. The edit lifecycle may apply the same rule only as a fallback for existing or imported nodes that still have no config selected.

## 6. Connection and node status

All runtime nodes should use the shared status binder.

Canonical states are based on repository/client connection state, for example:

- connected,
- connecting,
- disconnected,
- error,
- unconfigured.

A node may temporarily show an operation-specific status such as:

- `busy`,
- `invalid command`.

After temporary status ends, restore the real connection-derived status rather than blindly showing `connected`.

`EmpirBus State` may use `listening` as its connected text.

## 7. Channel addressing

### 7.1 Configured channels

Nodes support one or multiple configured channel IDs. Multiple IDs are a supported feature and must not be removed.

### 7.2 Dynamic addressing

Dynamic channel selection is supported through messages. The established topic format is:

```text
empirbus/<id>
```

Example:

```js
msg.topic = "empirbus/87";
```

Other existing dynamic channel forms supported by `channelHandling` should remain backward compatible.

### 7.3 Resolution

Channel-resolution rules must remain centralized in `channelHandling`.

Do not independently parse `msg.topic`, `msg.channelId`, channel names, or configured ID lists inside each node.

## 8. Acknowledge contract

### 8.1 Active nodes

The active control nodes use an optional `acknowledge` setting.

Normative behavior:

- default: disabled,
- disabled: zero outputs in the editor,
- enabled: one output.

This applies consistently to:

- Switch,
- Button,
- Dimmer,
- Toggle,
- Command.

### 8.2 Compatibility

Acknowledgement message structure is a compatibility contract because existing Alexa flows consume it.

Existing fields and shapes must not be removed, renamed, retyped, or moved incompatibly.

Additive fields are permitted when useful.

Existing patterns include:

```js
msg.acknowledge = true;
```

Switch acknowledgements also provide:

```js
msg.payload = {
    state: {
        power: "ON"
    }
};
```

Dimmer acknowledgements provide a brightness state.

### 8.3 State-node distinction

`EmpirBus State` always emits a state output and includes `acknowledge: true` as part of its established state-message format. This is not controlled by the active-node Acknowledge checkbox.

## 9. EmpirBus State

### 9.1 Purpose

Converts repository `Channel` updates into stable Node-RED state messages suitable for downstream flows, dashboards, and compatibility consumers such as Alexa.

### 9.2 Output contract

```js
{
    acknowledge: true,
    endpointId: "87",
    topic: "empirbus/87",
    payload: {
        state: {
            // derived fields
        }
    }
}
```

The envelope is compatibility-critical.

### 9.3 Derived states

`deriveChannelState()` can emit state structures including:

```js
{ power: "ON" }
```

```js
{
    power: "OFF",
    unavailable: true,
    error1: false,
    error2: false
}
```

```js
{ brightness: 50, percentage: 50 }
```

```js
{ percentage: 75 }
```

```js
{ temperature: 21.5 }
```

```js
{ thermostatSetPoint: 22 }
```

```js
{ rangeValue: 10000 }
```

The helper uses channel metadata and decoded fields to determine the appropriate representation.

### 9.4 State flags

When `Channel.onOffStatus` is available, power comes from that decoded boolean rather than blindly interpreting `rawValue`.

When present, the following flags are propagated:

- `unavailable`,
- `error1`,
- `error2`.

This is important for Garmin states whose raw status byte may be 128/129.

### 9.5 Deduplication

Deduplicate on the complete derived `state` object, not only `rawValue`.

Deduplication storage must be in-memory for the runtime node instance, not persistent Node-RED context.

Therefore:

> The first relevant status received after every deploy/restart is always emitted.

After that, identical complete states may be suppressed.

### 9.6 Filters

The state node supports multiple selected IDs, a fallback single ID, and channel name filtering according to existing editor/runtime precedence.

Invalid numeric configuration must not accidentally become `NaN`-based filtering.

## 10. EmpirBus Switch

### 10.1 Purpose

`EmpirBus Switch` means “make this channel reach the requested ON/OFF target state”.

The user does not select a protocol control mode. The repository learns the required control behavior from the most recently received MFD status type for each channel.

- incoming MFD `messagecmd = 0` → `pulse`
- incoming MFD `messagecmd = 1` → `momentary`

### 10.2 Accepted inputs

Preferred:

```js
msg.payload = "ON";
msg.payload = "OFF";
```

String matching is case-insensitive. Also accepted:

```js
msg.payload = true;
msg.payload = false;
msg.payload = 1;
msg.payload = 0;
msg.payload = { state: { power: "ON" } };
```

### 10.3 Pulse channels

For a channel whose last MFD status type is `pulse`, every valid target request is sent explicitly. Cached ON/OFF state must not suppress the command.

### 10.4 Momentary channels

For a channel whose last MFD status type is `momentary`, the requested target is compared with the repository `onOffStatus`.

- requested state already reached → no telegram
- requested state differs → press, wait 150 ms, release
- current state unknown → fail without sending

The repository must not optimistically change `onOffStatus`. The next received EmpirBus status remains the source of truth.

### 10.5 Unknown or unsupported type

If the MFD type is unknown, or the channel type is not valid for switch semantics, no command is sent and the operation fails.

### 10.6 Multiple channels

All channels are validated before transmission. If one selected channel has an unknown/unsupported MFD type or a momentary channel has no known ON/OFF state, the whole request fails without partial transmission.

Mixed pulse and momentary channels are allowed once all channels can be validated.

## 11. EmpirBus Button

### 11.1 Garmin UI equivalent

`EmpirBus Button` corresponds to a **Button / SendMomentary control in the original Garmin UI**.

Press and release are distinct operations.

### 11.2 Modes

Three modes are required.

#### Short Press

```text
press
wait 150 ms
release
```

150 ms is fixed for this mode.

#### Long Press

```text
press
wait configured duration
release
```

Duration is configured in milliseconds:

```text
minimum: 10 ms
maximum: 60000 ms
```

#### Direct

The flow explicitly controls press and release. No automatic duration/timer is applied.

### 11.3 Direct input normalization

Preferred semantic inputs:

```js
msg.payload = "PRESS";
msg.payload = "RELEASE";
```

Strings are case-insensitive.

Compatibility inputs:

```text
true  → press
false → release
1     → press
0     → release
ON    → press
OFF   → release
```

If structured action formats are supported, preserve them for compatibility.

### 11.4 Multiple channels

Two execution strategies are required.

#### Sequential — default

For every channel:

```text
press channel
wait press duration
release channel
wait inter-channel delay
```

Then process the next channel.

Inter-channel delay:

```text
default: 5 ms
minimum: 0 ms
maximum: 1000 ms
```

#### Parallel

“Parallel” means grouped without intentional delay, not physically simultaneous bus transmission:

```text
press ID 1
press ID 2
press ID 3
wait duration
release ID 1
release ID 2
release ID 3
```

Every channel still receives an individual EmpirBus telegram.

### 11.5 Busy behavior

For Short Press and Long Press:

- set node operation state to busy while the sequence runs,
- if another trigger arrives while busy, ignore it,
- do not queue it,
- do not restart the current action.

Direct mode is event-driven and is not subject to the same press-duration busy lock.

Temporary busy status must restore the true connection status when the action completes.

## 12. EmpirBus Toggle

Toggle means “invert the currently known state”.

The repository owns current-state interpretation.

If current state is unknown for any requested channel:

- no command is sent for any of them,
- surface a warning/error in Node-RED,
- show an appropriate temporary node status where useful.

Multi-channel toggle must avoid partial execution caused by state validation failure.

## 13. EmpirBus Dimmer

### 13.1 Supported semantic formats

The adapter supports three value domains.

#### Raw

```text
integer 0..255
```

Example:

```js
msg.payload = 128;
```

#### Percent

```text
number 0..100
```

Conversion:

```text
raw = round(percent / 100 * 255)
```

#### Normalized

```text
number 0..1
```

Conversion:

```text
raw = round(normalized * 255)
```

### 13.2 Input-mode representation

The current implementation exposes the semantic input mode through node configuration. The desired external API must remain unambiguous: a plain numeric value must never be guessed simultaneously as raw, percent, and normalized.

If a future message-level unit form is added, it should use an explicit shape such as:

```js
{ value: 50, unit: "percent" }
```

or:

```js
{ value: 0.5, unit: "normalized" }
```

without breaking the configured-mode behavior.

### 13.3 Validation

Invalid values are rejected.

Do not silently clamp:

- raw outside `0..255`,
- percent outside `0..100`,
- normalized outside `0..1`.


### 13.4 ON level

The node supports a configurable `ON level`.

- it uses the same unit/domain as the configured input mode,
- empty means the maximum value of that input mode,
- an `ON` input sends the configured ON level,
- an `OFF` input always sends zero,
- direct numeric dimmer values continue to use the configured input mode.

Examples:

```text
input mode: percent, ON level: 20
input mode: raw, ON level: 144
input mode: normalized, ON level: 0.2
```

The configured ON level is validated with the same rules as a normal dimmer value.

### 13.5 Acknowledge

When enabled, preserve the established brightness acknowledgement shape.

## 14. EmpirBus Command

### 14.1 Purpose

The Command node is the low-level escape hatch for protocol commands not covered by specialized nodes.

It is not a second high-level operation API.

### 14.2 Accepted input

Only a raw telegram object in `msg.payload`:

```js
msg.payload = {
    messagetype: 17,
    messagecmd: 1,
    data: [7, 0, 1]
};
```

Optional explicit size:

```js
msg.payload = {
    messagetype: 17,
    messagecmd: 1,
    size: 3,
    data: [7, 0, 1]
};
```

Do not support operation aliases such as:

```js
{ operation: "dim", id: 7, value: 50 }
```

Specialized nodes exist for those operations.

### 14.3 Validation

Required validation:

- payload is a non-array object,
- `messagetype` is an integer `0..255`,
- `messagecmd` is an integer `0..255`,
- `data` is an array,
- every data member is an integer `0..255`,
- data length is at most 255,
- if `size` is omitted, use `data.length`,
- if supplied, `size` is an integer byte and equals `data.length`.

Extra input properties are tolerated but must not be forwarded as protocol fields.

The node must create its own telegram copy and must not mutate `msg.payload` or its data array.

JSON strings are not accepted; users can use standard Node-RED JSON/change/function nodes upstream.

### 14.4 Failure behavior

Invalid commands:

- are not sent,
- result in Node-RED error reporting,
- may set temporary `invalid command` status,
- must return to connection-derived status after subsequent valid state/operation handling.

## 15. Help system

Every node's HTML help section is bilingual.

Order:

1. German.
2. English.

Recommended structure for each language:

- Description / Beschreibung
- Garmin UI equivalent / Entsprechung in der Garmin UI
- Input / Eingang
- Configuration / Konfiguration
- Output / Ausgang
- Examples / Beispiele
- Notes / Hinweise

Normal user help must not expose protocol-byte implementation details such as `messagecmd`, bit masks, or raw byte layouts.

The important semantic distinction is UI-level:

- Garmin Switch → EmpirBus Switch
- Garmin Button → EmpirBus Button

## 16. Markdown documentation

Recommended repository documentation:

```text
README.md
docs/
    nodes.md
    examples.md
    migration.md
```

Low-level protocol documentation belongs in `garmin-empirbus-ts`, not here.

Existing flow migration should be performed only after the package behavior is stable and only when explicitly requested.

## 17. Icons

Use individual monochrome SVG icons with the following semantic mapping:

| Node | Icon concept |
|---|---|
| Config | network connection |
| State | incoming radio waves |
| Switch | classic toggle switch |
| Button | finger/push button |
| Dimmer | sun with slider |
| Toggle | two circular arrows |
| Command | terminal `>_` |

Requirements:

- visually distinct,
- readable at palette/node size,
- simple geometry,
- compatible with light/dark Node-RED themes,
- no unnecessary detail.

## 18. Editor consistency

Common editor behavior should live in `resources/empirbus-editor` / its TypeScript source.

Do not copy channel-selection or config-auto-selection JavaScript into every node HTML file when it can be centralized.

Editor fields should only appear when relevant. Examples:

- Long Press duration only when Long Press is selected.
- Inter-channel delay only when sequential multi-channel execution uses it.
- Acknowledge output count reflects checkbox state.

## 19. Status consistency

Use common connection status as the baseline for all nodes.

Operation-specific status should be minimal and meaningful.

Examples:

- Button: `busy` while an automatic press sequence is running.
- Command: `invalid command` after input validation failure.
- Toggle: error/warning when current state is unknown.

Do not invent many per-node status vocabularies.

## 20. Dashboard repeat-while-held behavior

A future dashboard feature may repeatedly trigger short button presses while a user holds a FlowFuse UI button, for example temperature up/down.

This is explicitly not part of the EmpirBus Node-RED package at this stage.

It belongs to FlowFuse/UI flow behavior and may later use pointer-down/pointer-up handling, repeat delay, repeat rate, and safety timeout.

Do not add it to `EmpirBus Button` without a separate explicit design decision.

## 21. Verification matrix

Changes should cover at least the following behaviors.

### Config

- single config auto-selection,
- no automatic creation,
- no auto-selection with multiple configs.

### State

- first update emitted after deploy/restart,
- repeated identical complete state suppressed,
- change in `unavailable` emitted even if the primary value is unchanged,
- `empirbus/<id>` topic preserved,
- output envelope compatibility preserved.

### Switch

- all capitalization variants of ON/OFF,
- boolean and numeric forms,
- structured power state,
- repeated ON still calls repository switch,
- multiple channel IDs.

### Button

- 150 ms short press,
- long press min/max validation,
- direct PRESS/RELEASE and compatibility forms,
- sequential default,
- 5 ms default inter-channel delay,
- parallel grouped execution,
- busy trigger ignored,
- multiple channels.

### Toggle

- known state toggles,
- unknown state sends nothing,
- multi-channel prevalidation prevents partial execution.

### Dimmer

- raw boundaries,
- percent boundaries/conversion,
- normalized boundaries/conversion,
- invalid values rejected,
- acknowledgement preserved.

### Command

- valid raw telegram,
- omitted size derived,
- mismatched size rejected,
- non-byte data rejected,
- >255-byte payload rejected,
- extra metadata ignored,
- input object not mutated.

### Acknowledge

- off by default,
- zero outputs when off,
- one output when on,
- existing Alexa-compatible fields unchanged.

## 22. Rules Codex must not violate

Do not:

- implement Garmin protocol bytes separately in Switch/Button/Dimmer nodes,
- merge Switch and Button semantics,
- make Switch state-dependent,
- make Toggle state-independent,
- silently clamp invalid dimmer values,
- persist State deduplication across deploy/restart,
- incompatibly change acknowledgement message structures,
- break `empirbus/<id>` dynamic addressing,
- remove multiple channel support,
- add raw protocol internals to user-facing Node help,
- implement FlowFuse dashboard repeat-while-held inside this package,
- migrate existing dashboard flows as part of unrelated package work.

## EmpirBus Debug

`EmpirBus Debug` is a passive observer. It has no input, always has one output, has no acknowledgement option, and must never modify or trigger EmpirBus traffic.

It consumes `EmpirBusChannelRepository.onCommunication()` and supports direction (`both`, `rx`, `tx`), scope (`all`, `selected`), multi-channel selection, and independent filters for control commands, status messages, system traffic, and heartbeat. Defaults are both directions, all channels, control enabled, status enabled, system disabled, heartbeat disabled.

Its output topic is `empirbus/debug/{direction}/{channelId|system}`. Payload contains direction, optional channelId, category, readable command, timestamp, and the raw message.

For the Button editor, `Duration (ms)` is visible only in `Long Press` mode. `Short Press` always uses the fixed 150 ms duration and must not expose a duration field.


## Acknowledge modes

Active command nodes support `None`, `Immediately`, and `After execution`. `Immediately` means the command was validated and execution started; it does not mean that a physical state change was confirmed by EmpirBus. Existing flows with `acknowledge: true` and no `acknowledgeMode` are interpreted as `After execution`. The existing acknowledgement message format remains backward compatible.

For switch semantics, both `pulse` and `momentary` channels require a known `onOffStatus`. The Switch node only sends a command when the requested state differs from the last state reported by EmpirBus. This prevents a repeated `ON` request from toggling an already-on pulse channel off. EmpirBus state remains the source of truth.
