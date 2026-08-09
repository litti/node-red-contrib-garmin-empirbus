export type AcknowledgeMode = 'none' | 'immediate' | 'completed'

export const resolveAcknowledgeMode = (mode: unknown, legacyAcknowledge: unknown): AcknowledgeMode => {
    if (mode === 'immediate' || mode === 'completed' || mode === 'none')
        return mode

    return legacyAcknowledge === true ? 'completed' : 'none'
}

export const sendAcknowledge = (mode: AcknowledgeMode, expectedMode: AcknowledgeMode, msg: any, send: (msg: any) => void, payload?: unknown) => {
    if (mode !== expectedMode)
        return

    msg.acknowledge = true
    if (payload !== undefined)
        msg.payload = payload
    send(msg)
}
