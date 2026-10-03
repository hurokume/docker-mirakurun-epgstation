'use strict';

// Use the Node.js already included in chinachu/mirakurun; no runtime install.
const fs = require('fs');
const defaultPlist = '/usr/lib/pcsc/drivers/ifd-ccid.bundle/Contents/Info.plist';
const reader = {
    ifdVendorID: '0x0409',
    ifdProductID: '0x018B',
    ifdFriendlyName: 'NEC CK1506-02 Smart Card Reader',
};

function addReader(xml) {
    // Mask comments without changing offsets, preserving the original file.
    const masked = xml.replace(/<!--[\s\S]*?-->/g, comment => ' '.repeat(comment.length));
    const arrays = {};
    for (const key of Object.keys(reader)) {
        const pattern = new RegExp('<key>\\s*' + key + '\\s*</key>\\s*<array>([\\s\\S]*?)</array>', 'g');
        const match = pattern.exec(masked);
        if (!match || pattern.exec(masked)) {
            throw new Error('Expected exactly one array for ' + key);
        }
        const strings = /<string>([^<>]*)<\/string>/g;
        const values = [];
        let item;
        while ((item = strings.exec(match[1])) !== null) {
            values.push(item[1].trim());
        }
        if (match[1].replace(strings, '').trim()) {
            throw new Error('Unexpected array contents for ' + key);
        }
        arrays[key] = {
            values,
            end: match.index + match[0].length - '</array>'.length,
        };
    }

    const vendors = arrays.ifdVendorID.values;
    const products = arrays.ifdProductID.values;
    if (vendors.length !== products.length || vendors.length !== arrays.ifdFriendlyName.values.length) {
        throw new Error('Reader arrays have different lengths; refusing to modify Info.plist');
    }
    for (const id of vendors.concat(products)) {
        if (!/^0x[0-9a-f]{4}$/i.test(id)) {
            throw new Error('Invalid USB ID in Info.plist: ' + id);
        }
    }
    if (vendors.some((vendor, index) =>
        parseInt(vendor, 16) === 0x0409 && parseInt(products[index], 16) === 0x018b)) {
        return xml;
    }

    // Insert from the end so all offsets stay valid. Preserve other settings.
    for (const key of Object.keys(reader).sort((a, b) => arrays[b].end - arrays[a].end)) {
        const end = arrays[key].end;
        xml = xml.slice(0, end) + '\t<string>' + reader[key] + '</string>\n\t' + xml.slice(end);
    }
    return xml;
}

function updateFile(filename) {
    // Debian's bundle Info.plist may point to /etc/libccid_Info.plist.
    // Resolve it before atomic replacement so the symlink is preserved.
    const target = fs.realpathSync(filename);
    const original = fs.readFileSync(target, 'utf8');
    const updated = addReader(original);
    if (updated === original) {
        console.log('[ccid] 0409:018b already registered in ' + target);
        return;
    }
    const temporary = target + '.ccid-' + process.pid + '.tmp';
    let created = false;
    try {
        const descriptor = fs.openSync(temporary, 'wx', fs.statSync(target).mode);
        created = true;
        try {
            fs.writeFileSync(descriptor, updated);
        } finally {
            fs.closeSync(descriptor);
        }
        fs.renameSync(temporary, target);
    } finally {
        if (created && fs.existsSync(temporary)) {
            fs.unlinkSync(temporary);
        }
    }
    console.log('[ccid] Registered 0409:018b (NEC CK1506-02) in ' + target);
}

if (require.main === module) {
    try {
        updateFile(process.argv[2] || defaultPlist);
    } catch (error) {
        console.error('[ccid] ' + error.message);
        process.exitCode = 1;
    }
}

module.exports = { addReader, updateFile };
