const Mdc1200 = require('../client/ui/js/Mdc1200');

function pcmBytes(int16) {
    return new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
}

function decodeInFrames(pcm) {
    const decoder = new Mdc1200.Decoder(8000);
    let packet = null;

    for (let i = 0; i < pcm.byteLength; i += 320) {
        const frame = pcm.subarray(i, Math.min(i + 320, pcm.byteLength));
        const rv = decoder.processSamples(frame);

        if (rv === 1) packet = decoder.getPacket();
        if (rv === 2) packet = decoder.getDoublePacket();
    }

    return packet;
}

function decodeInByteFrames(pcm, frameSize) {
    const decoder = new Mdc1200.Decoder(8000);
    let packet = null;

    for (let i = 0; i < pcm.byteLength; i += frameSize) {
        const frame = pcm.subarray(i, Math.min(i + frameSize, pcm.byteLength));
        const rv = decoder.processSamples(frame);

        if (rv === 1) packet = decoder.getPacket();
        if (rv === 2) packet = decoder.getDoublePacket();
    }

    return packet;
}

function mdcPttBytes(unitId) {
    const lead = 0;
    const tail = 0;
    const samples = Mdc1200.encodePacket(0x01, 0x00, unitId, { sampleRate: 8000, preamble: 0 });
    const pcm = new Uint8Array((lead + samples.length + tail) * 2);
    let offset = lead * 2;

    for (let i = 0; i < samples.length; i++) {
        pcm[offset++] = samples[i] & 0xff;
        pcm[offset++] = (samples[i] >> 8) & 0xff;
    }

    return pcm;
}

function assertPacket(packet, expected) {
    if (!packet) throw new Error('no packet decoded');

    for (const key of Object.keys(expected)) {
        if (packet[key] !== expected[key]) {
            throw new Error(`${key} expected ${expected[key]} got ${packet[key]}`);
        }
    }
}

const single = Mdc1200.encodePacket(0x12, 0x34, 0x5678, { sampleRate: 8000 });
const singlePcm = new Int16Array(single.length + 800);
singlePcm.set(single, 0);
assertPacket(decodeInFrames(pcmBytes(singlePcm)), {
    frameCount: 1,
    op: 0x12,
    arg: 0x34,
    unitID: 0x5678
});

const decoded = Mdc1200.decodePcm(pcmBytes(singlePcm), { sampleRate: 8000, frameSize: 160 });
assertPacket(decoded[0], {
    frameCount: 1,
    op: 0x12,
    arg: 0x34,
    unitID: 0x5678
});

assertPacket(decodeInByteFrames(mdcPttBytes(0x1234), 320), {
    frameCount: 1,
    op: 0x01,
    arg: 0x00,
    unitID: 0x1234
});

const doublePacket = Mdc1200.encodeDoublePacket(0x55, 0x34, 0x5678, 0x0a, 0x0b, 0x0c, 0x0d, { sampleRate: 16000 });
const doublePcm = new Int16Array(doublePacket.length + 1600);
doublePcm.set(doublePacket, 0);

const doubleDecoder = new Mdc1200.Decoder(16000);
let doubleDecoded = null;

for (let i = 0; i < doublePcm.length; i += 320) {
    const rv = doubleDecoder.processSamples(doublePcm.subarray(i, Math.min(i + 320, doublePcm.length)));
    if (rv === 2) doubleDecoded = doubleDecoder.getDoublePacket();
}

assertPacket(doubleDecoded, {
    frameCount: 2,
    op: 0x55,
    arg: 0x34,
    unitID: 0x5678,
    extra0: 0x0a,
    extra1: 0x0b,
    extra2: 0x0c,
    extra3: 0x0d
});

console.log(`MDC1200 8000 PCM single ok (${single.length} samples)`);
console.log('MDC1200 8000 PCM pre-id framed ok');
console.log(`MDC1200 16000 PCM double ok (${doublePacket.length} samples)`);
