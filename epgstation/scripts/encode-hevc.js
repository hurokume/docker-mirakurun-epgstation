'use strict';

const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const readline = require('readline');

async function main() {
    const { FFMPEG, FFPROBE, INPUT, OUTPUT, AUDIOCOMPONENTTYPE } = process.env;
    if (!FFMPEG || !FFPROBE || !INPUT || !OUTPUT) {
        throw new Error('FFMPEG, FFPROBE, INPUT and OUTPUT are required');
    }
    const { stdout } = await promisify(execFile)(FFPROBE, [
        '-v', 'error', '-show_format', '-of', 'json', INPUT,
    ]);
    const duration = Number(JSON.parse(stdout).format.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error('Could not determine the recording duration');
    }

    const args = [
        '-y', '-nostdin', '-fix_sub_duration', '-i', INPUT,
        '-map', '0:v:0', '-c:v', 'libx265', '-vf', 'yadif',
        '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '26', '-tag:v', 'hvc1',
    ];
    if (Number(AUDIOCOMPONENTTYPE) === 2) {
        args.push(
            '-filter_complex', '[0:a:0]channelsplit=channel_layout=stereo[FL][FR]',
            '-map', '[FL]', '-map', '[FR]',
            '-metadata:s:a:0', 'language=jpn', '-metadata:s:a:1', 'language=eng', '-ac', '1',
        );
    } else {
        args.push('-map', '0:a?');
    }
    args.push(
        '-c:a', 'aac', '-b:a', '192k',
        '-map', '0:s?', '-c:s', 'mov_text',
        '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', OUTPUT,
    );

    const child = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'inherit'] });
    const lines = readline.createInterface({ input: child.stdout });
    let seconds = 0;
    lines.on('line', line => {
        const [key, value] = line.split('=');
        if (key === 'out_time_us' && Number.isFinite(Number(value))) {
            seconds = Number(value) / 1000000;
        } else if (key === 'progress') {
            console.log(JSON.stringify({
                type: 'progress',
                percent: Math.max(0, Math.min(1, seconds / duration)),
                log: `HEVC ${seconds.toFixed(1)} / ${duration.toFixed(1)} sec`,
            }));
        }
    });

    const interrupt = () => child.kill('SIGINT');
    const terminate = () => child.kill('SIGTERM');
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', terminate);
    try {
        await new Promise((resolve, reject) => {
            child.on('error', reject);
            child.on('close', (code, signal) => {
                if (code === 0) resolve();
                else reject(new Error(`FFmpeg failed: ${signal || code}`));
            });
        });
    } finally {
        process.removeListener('SIGINT', interrupt);
        process.removeListener('SIGTERM', terminate);
        lines.close();
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
