type Channel = {
    id: string | number
    name?: string
    description?: string
}

type BindOptions = {
    node: {
        channelIds?: string
        acknowledge?: boolean
    }
    containerSelector: string
}

type LoadOptions = {
    configId: string | undefined
    containerSelector: string
    selectedIds: string[]
}

const toSelectedIds = (value?: string): string[] =>
    String(value || '')
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean)

const createCheckbox = (id: string, checked: boolean): JQuery =>
    $('<input type="checkbox">')
        .addClass('empirbus-channel-checkbox')
        .attr('data-channel-id', id)
        .prop('checked', checked)

const createRow = (
    channel: Channel,
    selectedIds: string[]
): JQuery => {
    const id = String(channel.id)
    const labelText =
        channel.description ||
        channel.name ||
        `Channel ${id}`

    const row = $('<div/>').addClass('empirbus-channel-row')

    const checkbox = createCheckbox(id, selectedIds.includes(id))

    const idLabel = $('<span/>')
        .addClass('empirbus-channel-id')
        .text(id)

    const label = $('<span/>')
        .addClass('empirbus-channel-label')
        .text(labelText)

    row.append(checkbox).append(idLabel).append(label)

    return row
}

const renderChannels = (
    containerSelector: string,
    channels: Channel[],
    selectedIds: string[]
): void => {
    const container = $(containerSelector)
    container.empty()

    channels.forEach(channel => {
        container.append(createRow(channel, selectedIds))
    })
}

const loadChannels = ({
                          configId,
                          containerSelector,
                          selectedIds
                      }: LoadOptions): void => {
    if (!configId)
        return

    $.getJSON(
        `empirbus/${configId}/channels`,
        (channels: Channel[]) =>
            renderChannels(
                containerSelector,
                channels,
                selectedIds
            )
    )
}

const saveSelectedChannelIds = (
    containerSelector: string
): void => {
    const ids: string[] = []

    $(
        `${containerSelector} input[type="checkbox"]:checked`
    ).each(function () {
        const id = $(this).attr('data-channel-id')
        if (id)
            ids.push(id)
    })

    $('#node-input-channelIds').val(ids.join(','))

    const acknowledge =
        $('#node-input-acknowledge').is(':checked')

    $('#node-input-acknowledge').val(
        acknowledge ? 'true' : 'false'
    )
}

const bindConfigChange = ({
                              node,
                              containerSelector
                          }: BindOptions): void => {
        const refresh = (): void => {
            const configId = String(
                $('#node-input-config').val() || ''
            )

            loadChannels({
                configId,
                containerSelector,
                selectedIds: toSelectedIds(node.channelIds)
            })
        }

        $('#node-input-acknowledge').prop(
            'checked',
            !!node.acknowledge
        )

        $('#node-input-config').on('change', refresh)

        refresh()
    }

;(window as unknown as {
    EmpirbusEditor: {
        bindConfigChange: typeof bindConfigChange
        saveSelectedChannelIds: typeof saveSelectedChannelIds
    }
}).EmpirbusEditor = {
    bindConfigChange,
    saveSelectedChannelIds
}
