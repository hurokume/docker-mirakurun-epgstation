'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { addReader } = require('../mirakurun/add-ccid-reader');

const script = path.resolve(__dirname, '../mirakurun/add-ccid-reader.js');
const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>ifdLogLevel</key><string>0x0003</string>
    <key>ifdVendorID</key><array><string>0x0409</string><string>0x1234</string></array>
    <key>ifdProductID</key><array><string>0x0148</string><string>0x018B</string></array>
    <key>ifdFriendlyName</key><array><string>Other NEC reader</string><string>Other vendor</string></array>
</dict></plist>`;

function values(xml, key) {
    const body = xml.match(new RegExp('<key>' + key + '</key>\\s*<array>([\\s\\S]*?)</array>'))[1];
    return Array.from(body.matchAll(/<string>(.*?)<\/string>/g), match => match[1]);
}

test('appends aligned VID/PID/name despite separate matches for VID and PID', () => {
    const updated = addReader(fixture);
    assert.deepEqual(values(updated, 'ifdVendorID'), ['0x0409', '0x1234', '0x0409']);
    assert.deepEqual(values(updated, 'ifdProductID'), ['0x0148', '0x018B', '0x018B']);
    assert.deepEqual(values(updated, 'ifdFriendlyName'), [
        'Other NEC reader', 'Other vendor', 'NEC CK1506-02 Smart Card Reader',
    ]);
    assert.ok(updated.includes('<key>ifdLogLevel</key><string>0x0003</string>'));
    assert.ok(updated.startsWith(fixture.slice(0, fixture.indexOf('<plist'))));
});

test('repeated startup is byte-for-byte idempotent', () => {
    const updated = addReader(fixture);
    assert.equal(addReader(updated), updated);
});

test('preserves an existing pair with lowercase PID and a different name', () => {
    const existing = fixture.replace('0x0148', '0x018b');
    assert.equal(addReader(existing), existing);
});

test('ignores commented-out keys and entries', () => {
    const comment = '<!-- <key>ifdVendorID</key><array><string>0x0409</string></array> -->';
    const original = fixture.replace('<dict>', '<dict>' + comment)
        .replace('<string>0x0148</string>', '<!-- <string>0x018B</string> --><string>0x0148</string>');
    const updated = addReader(original);
    assert.ok(updated.includes(comment));
    assert.ok(updated.includes('NEC CK1506-02 Smart Card Reader'));
    assert.equal(addReader(updated), updated);
});

test('rejects mismatched arrays, missing keys, duplicate keys and invalid entries', () => {
    assert.throws(() => addReader(fixture.replace('<string>Other vendor</string>', '')), /different lengths/);
    assert.throws(() => addReader(fixture.replace('ifdVendorID', 'missing')), /exactly one array/);
    assert.throws(() => addReader(fixture.replace('</dict>', '<key>ifdVendorID</key><array></array></dict>')), /exactly one array/);
    assert.throws(() => addReader(fixture.replace('0x1234', 'not-an-id')), /Invalid USB ID/);
    assert.throws(() => addReader(fixture.replace('<string>0x1234</string>', '<integer>1234</integer>')), /Unexpected array/);
});

test('CLI persists the update and leaves a malformed file untouched on failure', t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ccid-reader-test-'));
    const target = path.join(directory, 'Info.plist');
    t.after(() => {
        fs.unlinkSync(target);
        fs.rmdirSync(directory);
    });
    fs.writeFileSync(target, fixture);
    const first = spawnSync(process.execPath, [script, target], { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Registered 0409:018b/);
    const updated = fs.readFileSync(target, 'utf8');
    const second = spawnSync(process.execPath, [script, target], { encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /already registered/);
    assert.equal(fs.readFileSync(target, 'utf8'), updated);
    const malformed = fixture.replace('<string>Other vendor</string>', '');
    fs.writeFileSync(target, malformed);
    const failed = spawnSync(process.execPath, [script, target], { encoding: 'utf8' });
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /different lengths/);
    assert.equal(fs.readFileSync(target, 'utf8'), malformed);
    assert.deepEqual(fs.readdirSync(directory), ['Info.plist']);
});
