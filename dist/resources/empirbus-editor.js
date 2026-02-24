"use strict";
const toSelectedIds = (value) => String(value || '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
const createCheckbox = (id, checked) => $('<input type="checkbox">')
    .addClass('empirbus-channel-checkbox')
    .attr('data-channel-id', id)
    .prop('checked', checked);
const createRow = (channel, selectedIds) => {
    const id = String(channel.id);
    const labelText = channel.description ||
        channel.name ||
        `Channel ${id}`;
    const row = $('<div/>').addClass('empirbus-channel-row');
    const checkbox = createCheckbox(id, selectedIds.includes(id));
    const idLabel = $('<span/>')
        .addClass('empirbus-channel-id')
        .text(id);
    const label = $('<span/>')
        .addClass('empirbus-channel-label')
        .text(labelText);
    row.append(checkbox).append(idLabel).append(label);
    return row;
};
const renderChannels = (containerSelector, channels, selectedIds) => {
    const container = $(containerSelector);
    container.empty();
    channels.forEach(channel => {
        container.append(createRow(channel, selectedIds));
    });
};
const loadChannels = ({ configId, containerSelector, selectedIds }) => {
    if (!configId)
        return;
    $.getJSON(`empirbus/${configId}/channels`, (channels) => renderChannels(containerSelector, channels, selectedIds));
};
const saveSelectedChannelIds = (containerSelector) => {
    const ids = [];
    $(`${containerSelector} input[type="checkbox"]:checked`).each(function () {
        const id = $(this).attr('data-channel-id');
        if (id)
            ids.push(id);
    });
    $('#node-input-channelIds').val(ids.join(','));
    const acknowledge = $('#node-input-acknowledge').is(':checked');
    $('#node-input-acknowledge').val(acknowledge ? 'true' : 'false');
};
const bindConfigChange = ({ node, containerSelector }) => {
    const refresh = () => {
        const configId = String($('#node-input-config').val() || '');
        loadChannels({
            configId,
            containerSelector,
            selectedIds: toSelectedIds(node.channelIds)
        });
    };
    $('#node-input-acknowledge').prop('checked', !!node.acknowledge);
    $('#node-input-config').on('change', refresh);
    refresh();
};
window.EmpirbusEditor = {
    bindConfigChange,
    saveSelectedChannelIds
};
//# sourceMappingURL=empirbus-editor.js.map