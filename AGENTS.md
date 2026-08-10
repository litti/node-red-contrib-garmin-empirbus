# AGENTS.md

## Project purpose

`node-red-contrib-garmin-empirbus` is the Node-RED adapter for `garmin-empirbus-ts`. It translates Node-RED messages and editor configuration into typed repository operations and translates channel updates into stable Node-RED state messages.

Keep protocol byte construction in `garmin-empirbus-ts`. This package should normalize, validate, route, and present data, not reimplement the Garmin protocol.

## Supported nodes

- `EmpirBus Config`
- `EmpirBus State`
- `EmpirBus Switch`
- `EmpirBus Button`
- `EmpirBus Dimmer`
- `EmpirBus Toggle`
- `EmpirBus Command`

Node names remain English.

## Garmin UI equivalence

Documentation must make these semantics clear:

- Original Garmin UI **Switch** → `EmpirBus Switch`
- Original Garmin UI **Button / SendMomentary** → `EmpirBus Button`

Do not expose message bytes or `messagecmd` details in normal Node-RED help. Protocol internals belong in the TypeScript library specification.

## Coding style

- Prefer self-explanatory code over comments.
- Use comments only for protocol quirks, compatibility constraints, or non-obvious workarounds.
- Use descriptive names and small functions.
- With five or fewer function parameters, keep parameters on one line in definitions and calls.
- For a single-statement `if`, omit curly braces and keep the body on the following indented line. Use braces for multi-statement branches.
- Centralize shared message normalization, channel resolution, status handling, and result handling.
- Do not duplicate helper logic in individual nodes.

## Config-node behavior

If exactly one EmpirBus config node exists, assign it immediately when a new EmpirBus runtime node is added to the workspace. Use the editor open lifecycle only as a fallback for existing/imported nodes that still have no config selected.

Do not:

- create a config node automatically,
- override an existing selection,
- guess when multiple config nodes exist.

## Channel resolution

Support multiple configured channel IDs and dynamic channel resolution through existing shared helpers.

`msg.topic = "empirbus/<id>"` is a first-class dynamic channel format and must remain supported.

Do not duplicate channel-selection logic inside individual nodes.

## Acknowledge compatibility

Active command nodes use optional `acknowledge`.

- Default is off.
- Off means zero outputs in the editor.
- On means one output.
- Existing acknowledgement message fields are compatibility-critical because Alexa flows consume them.
- Never remove, rename, retype, or incompatibly restructure existing acknowledgement fields.
- New fields may be additive only.

`EmpirBus State` always has its state output and uses the existing `acknowledge: true` field as part of its established state message contract; this is not the same as the active-node acknowledgement option.

## Switch

Switch is explicit target-state control. Cache must not suppress the command.

Accept:

- strings `ON`/`OFF` in any capitalization,
- `true`/`false`,
- `1`/`0`,
- supported structured state payloads such as `{ state: { power: "ON" } }`.

Multiple channel IDs are supported.

## Button

Button maps to Garmin momentary behavior.

Modes:

- Short Press: fixed 150 ms press duration.
- Long Press: configurable 10..60000 ms.
- Direct: the flow explicitly sends press/release actions.

Direct input accepts case-insensitive `PRESS`/`RELEASE`, and compatibility forms `ON`/`OFF`, `true`/`false`, `1`/`0`.

Multiple-channel execution:

- default `Sequential`,
- optional `Parallel`,
- sequential inter-channel delay defaults to 5 ms and is configurable from 0..1000 ms.

While Short/Long Press is active, ignore additional triggers. Do not queue or restart them.

## Toggle

Toggle depends on the repository's known channel state.

If any requested channel has unknown state:

- send nothing,
- surface a clear Node-RED error/warning/status,
- do not partially execute.

## Dimmer

Plain numeric payloads use the explicitly configured semantic mode:

- Raw: `0..1000` integer.
- Percent: `0..100`, converted to raw `0..1000`.
- Normalized: `0..1`, converted to raw `0..1000`.

Do not infer source identity from a plain number. Legacy `inputMode: "auto"` may remain supported for backwards compatibility, but do not expose Auto as the preferred configuration for new flows.

HomeKit `{ Brightness: 0..100 }` is always percent regardless of configured numeric payload mode. HomeKit `{ On: true }` uses the configured ON level; `{ On: false }` sends zero.

Explicit values `{ value, unit }` override the configured numeric payload mode. Supported units are `raw`, `percent`, and `normalized`.

ON level has its own unit and must not depend on the numeric payload mode. If `onLevelMode` is absent, default to Percent.

Preserve acknowledgement compatibility.

## State

State output is compatibility-critical:

```js
{
    acknowledge: true,
    endpointId: "<id>",
    topic: "empirbus/<id>",
    payload: { state: { ... } }
}
```

Deduplicate based on the complete derived state, not only `rawValue`.

Deduplication state is in-memory only. The first received state after deploy/restart must always be emitted.

## Command

Command is a low-level escape hatch only.

Accept raw telegram objects in `msg.payload`. Do not add high-level aliases such as `{ operation: "dim" }`.

Validation is strict. `size` may be derived from `data.length` when omitted; supplied size must match. Ignore extra metadata fields and do not mutate input objects.

## Node status

Use the shared connection-status behavior. Add temporary statuses only when useful, such as `busy` or input validation failures, and restore the correct connection status afterward.

Keep status vocabulary consistent across nodes.

## Help and documentation

Node help is bilingual:

1. German first.
2. English second.

Help should describe:

- purpose,
- Garmin UI equivalent,
- inputs,
- configuration,
- outputs,
- examples,
- important warnings.

Do not document low-level telegram bytes in normal Node help.

## Icons

Use semantic monochrome SVG icons:

- Config → network connection
- State → incoming radio waves
- Switch → classic toggle switch
- Button → finger/push button
- Dimmer → sun with slider
- Toggle → two circular arrows
- Command → terminal `>_`

Icons must remain readable at Node-RED palette size and work with light/dark themes.

## Non-goals

Do not implement dashboard-specific repeat-while-held behavior in this package. That belongs in FlowFuse/UI flow logic and will be addressed separately.

Do not migrate existing user dashboard flows unless explicitly requested; migration is a final downstream step after package behavior is stable.

## Verification

For changes:

1. Build TypeScript and resources.
2. Ensure HTML files are copied to `dist`.
3. Verify node registrations in `package.json`.
4. Preserve acknowledgement compatibility.
5. Test dynamic `empirbus/<id>` channel resolution.
6. Test multiple channel IDs.
7. Test both configured and dynamic inputs.

- `EmpirBus Debug` is passive and must never send traffic. Keep its output suitable for a standard Node-RED Debug node.
- In `EmpirBus Button`, show `Duration (ms)` only for Long Press. Short Press is fixed at 150 ms.

## Switch MFD-type handling

- Do not expose a manual pulse/momentary selector in the Switch node.
- Use the repository-learned MFD status type.
- Pulse status (`messagecmd 0`) uses explicit ON/OFF switch commands.
- Momentary status (`messagecmd 1`) uses a 150 ms press/release only when the requested state differs from `onOffStatus`.
- Never optimistically update the cached state after a momentary switch request.
- Validate all selected channels before a multi-channel switch operation to avoid partial execution.

## Dimmer ON level

- Preserve the configurable ON level.
- ON level has its own explicit domain: raw, percent, or normalized.
- If no ON-level domain is stored, default to percent.
- Empty ON level means the maximum for the selected domain.
- OFF always maps to zero.


## Acknowledge modes

Active command nodes support `None`, `Immediately`, and `After execution`. `Immediately` means the command was validated and execution started; it does not mean that a physical state change was confirmed by EmpirBus. Existing flows with `acknowledge: true` and no `acknowledgeMode` are interpreted as `After execution`. The existing acknowledgement message format remains backward compatible.

For switch semantics, both `pulse` and `momentary` channels require a known `onOffStatus`. The Switch node only sends a command when the requested state differs from the last state reported by EmpirBus. This prevents a repeated `ON` request from toggling an already-on pulse channel off. EmpirBus state remains the source of truth.

## HomeKit input compatibility

Preserve direct compatibility with common `node-red-contrib-homekit-bridged` payloads:

- Switch: `{ On: boolean }` maps to ON/OFF.
- Dimmer: `{ Brightness: number }` is percent 0..100 regardless of configured input mode; `{ On: boolean }` maps to ON/OFF and uses the configured ON level for ON.
- Button Direct: `{ On: boolean }` maps to press/release.
- Do not infer thermostat behavior from `TargetTemperature` or `TargetHeatingCoolingState`; those require explicit domain mapping.

Existing payload formats remain backward compatible.
