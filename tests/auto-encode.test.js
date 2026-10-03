'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { enqueue } = require('../epgstation/scripts/auto-encode');

async function serve(t, handler) {
    const requests = [];
    const server = http.createServer(async (req, res) => {
        let body = '';
        for await (const chunk of req) body += chunk;
        const entry = { method: req.method, url: req.url, body: body ? JSON.parse(body) : undefined };
        requests.push(entry);
        const result = handler(entry);
        if (result.disconnect) {
            req.socket.destroy();
            return;
        }
        res.writeHead(result.status || 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.body));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => {
        server.close(resolve);
        server.closeAllConnections();
    }));
    return {
        requests,
        options: { baseUrl: `http://127.0.0.1:${server.address().port}`, attempts: 3, retryMs: 1 },
    };
}

const recording = {
    id: 12, isRecording: false,
    videoFiles: [{ id: 34, type: 'ts', name: 'TS', filename: '20261003-210000_番組.m2ts' }],
};
const emptyQueue = { runningItems: [], waitItems: [] };

test('waits for recording completion, queues HEVC in converted, keeps TS, and skips repeat invocation', async t => {
    let reads = 0;
    let queued = false;
    const fixture = await serve(t, req => {
        if (req.method === 'POST') {
            queued = true;
            return { status: 201, body: { encodeId: 56 } };
        }
        if (req.url.startsWith('/api/recorded/')) {
            return { body: { ...recording, isRecording: ++reads === 1 } };
        }
        return { body: queued
            ? { runningItems: [], waitItems: [{ mode: 'HEVC', recorded: { id: 12 } }] }
            : emptyQueue };
    });
    assert.equal(await enqueue(12, fixture.options), 'queued encodeId=56');
    assert.equal(await enqueue(12, fixture.options), 'already queued');
    assert.deepEqual(fixture.requests.filter(req => req.method === 'POST'), [{
        method: 'POST', url: '/api/encode',
        body: { recordedId: 12, sourceVideoFileId: 34, parentDir: 'converted', mode: 'HEVC', removeOriginal: false },
    }]);
});

test('does not encode a completed HEVC file again', async t => {
    const fixture = await serve(t, () => ({ body: {
        ...recording, videoFiles: [...recording.videoFiles, { id: 35, type: 'encoded', name: 'HEVC' }],
    } }));
    assert.equal(await enqueue(12, fixture.options), 'already converted');
    assert.equal(fixture.requests.length, 1);
});

test('running HEVC suppresses duplicates, other modes do not suppress HEVC', async t => {
    let mode = 'HEVC';
    const fixture = await serve(t, req => {
        if (req.method === 'POST') return { status: 201, body: { encodeId: 56 } };
        if (req.url.startsWith('/api/recorded/')) return { body: recording };
        return { body: { runningItems: [{ mode, recorded: { id: 12 } }], waitItems: [] } };
    });
    assert.equal(await enqueue(12, fixture.options), 'already queued');
    mode = 'H.264';
    assert.equal(await enqueue(12, fixture.options), 'queued encodeId=56');
});

test('retries temporarily unavailable API reads', async t => {
    let reads = 0;
    const fixture = await serve(t, req => {
        if (++reads === 1) return { status: 503, body: { message: 'starting' } };
        if (req.method === 'POST') return { status: 201, body: { encodeId: 56 } };
        return { body: req.url.startsWith('/api/recorded/') ? recording : emptyQueue };
    });
    assert.equal(await enqueue(12, fixture.options), 'queued encodeId=56');
});

test('does not POST when the recording is unfinished or the TS is absent', async t => {
    let item = { ...recording, isRecording: true };
    const fixture = await serve(t, () => ({ body: item }));
    await assert.rejects(enqueue(12, fixture.options), /has not finished/);
    item = { ...recording, videoFiles: [] };
    await assert.rejects(enqueue(12, fixture.options), /no TS video file/);
    assert.ok(fixture.requests.every(req => req.method === 'GET'));
});

test('never repeats a POST after an ambiguous connection failure', async t => {
    const fixture = await serve(t, req => {
        if (req.method === 'POST') return { disconnect: true };
        return { body: req.url.startsWith('/api/recorded/') ? recording : emptyQueue };
    });
    await assert.rejects(enqueue(12, fixture.options), /socket hang up/);
    assert.equal(fixture.requests.filter(req => req.method === 'POST').length, 1);
});

test('rejects invalid recording IDs before sending any request', async () => {
    for (const id of [0, -1, NaN, 1.5, '12']) {
        await assert.rejects(enqueue(id), /RECORDEDID/);
    }
});
