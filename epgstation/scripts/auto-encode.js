'use strict';

// EPGStation recordingFinishCommand: register work in its normal encode queue.
const http = require('http');
const fs = require('fs');

const MODE = 'HEVC';
const DESTINATION = 'converted';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function requestJSON(baseUrl, method, resource, body) {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? undefined : JSON.stringify(body);
        const req = http.request(new URL(resource, baseUrl), {
            method,
            headers: payload === undefined ? {} : {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
        }, res => {
            let text = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { text += chunk; });
            res.on('error', reject);
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    const error = new Error(`${method} ${resource}: HTTP ${res.statusCode}: ${text}`);
                    error.statusCode = res.statusCode;
                    reject(error);
                    return;
                }
                try {
                    resolve(JSON.parse(text));
                } catch (error) {
                    reject(error);
                }
            });
        });
        req.setTimeout(5000, () => req.destroy(new Error(`${method} ${resource}: timeout`)));
        req.on('error', reject);
        req.end(payload);
    });
}

async function enqueue(recordedId, {
    baseUrl = 'http://127.0.0.1:8888',
    attempts = 12,
    retryMs = 5000,
} = {}) {
    if (!Number.isSafeInteger(recordedId) || recordedId <= 0) {
        throw new Error('RECORDEDID must be a positive integer');
    }

    let source;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const recorded = await requestJSON(baseUrl, 'GET', `/api/recorded/${recordedId}?isHalfWidth=false`);
            if (recorded.isRecording !== false) {
                throw new Error(`recording ${recordedId} has not finished`);
            }
            const files = recorded.videoFiles || [];
            if (files.some(file => file.type === 'encoded' && file.name === MODE)) {
                return 'already converted';
            }
            source = files.find(file => file.type === 'ts');
            if (!source) {
                throw new Error(`recording ${recordedId} has no TS video file`);
            }
            const queue = await requestJSON(baseUrl, 'GET', '/api/encode?isHalfWidth=false');
            if ([...queue.runningItems, ...queue.waitItems].some(
                item => item.recorded.id === recordedId && item.mode === MODE,
            )) {
                return 'already queued';
            }
            break;
        } catch (error) {
            // Retry reads while the finished recording / API becomes available.
            if (attempt === attempts || (error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 404)) {
                throw error;
            }
            await sleep(retryMs);
        }
    }

    // Never blindly retry a POST: a lost response may still have queued the job.
    const result = await requestJSON(baseUrl, 'POST', '/api/encode', {
        recordedId,
        sourceVideoFileId: source.id,
        parentDir: DESTINATION,
        mode: MODE,
        removeOriginal: false,
    });
    return `queued encodeId=${result.encodeId}`;
}

function log(message) {
    const line = `${new Date().toISOString()} [recordedId=${process.env.RECORDEDID}] ${message}\n`;
    process.stderr.write(line);
    // EPGStation discards hook stdout/stderr, so keep an operator-visible log.
    fs.appendFileSync('/app/logs/auto-encode.log', line);
}

if (require.main === module) {
    enqueue(Number(process.env.RECORDEDID), { baseUrl: process.argv[2] || 'http://127.0.0.1:8888' })
        .then(log)
        .catch(error => {
            process.exitCode = 1;
            log(`ERROR: ${error.message}; check the encode queue before retrying this recording`);
        });
}

module.exports = { enqueue };
