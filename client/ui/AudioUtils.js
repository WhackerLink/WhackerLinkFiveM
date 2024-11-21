function simulatePacketLoss(audioBuffer, lossProbability) {
    const audio = new Int16Array(audioBuffer);
    for (let i = 0; i < audio.length; i++) {
        if (Math.random() < lossProbability) {
            audio[i] = 0;
        }
    }
    return audio.buffer;
}

function addStaticNoise(audioBuffer, noiseLevel) {
    const audio = new Int16Array(audioBuffer);
    for (let i = 0; i < audio.length; i++) {
        audio[i] += Math.floor(Math.random() * noiseLevel - noiseLevel / 2);
    }
    return audio.buffer;
}

function insertDropouts(audioBuffer, gapLength, gapFrequency) {
    const audio = new Int16Array(audioBuffer);
    for (let i = 0; i < audio.length; i += gapLength) {
        if (Math.random() < gapFrequency) {
            audio.fill(0, i, Math.min(i + gapLength, audio.length));
        }
    }
    return audio.buffer;
}

function reduceBitDepth(audioBuffer, bits) {
    const audio = new Int16Array(audioBuffer);
    const mask = (1 << bits) - 1;
    for (let i = 0; i < audio.length; i++) {
        audio[i] = audio[i] & mask;
    }
    return audio.buffer;
}

function modulateFrequency(audioBuffer, sampleRate, modulationFrequency, depth) {
    const audio = new Int16Array(audioBuffer);
    const modIncrement = (2 * Math.PI * modulationFrequency) / sampleRate;
    let modPhase = 0;

    for (let i = 0; i < audio.length; i++) {
        audio[i] = audio[i] * (1 + depth * Math.sin(modPhase));
        modPhase += modIncrement;
        if (modPhase > 2 * Math.PI) modPhase -= 2 * Math.PI;
    }
    return audio.buffer;
}

function applyClipping(audioBuffer, threshold) {
    const audio = new Int16Array(audioBuffer);
    for (let i = 0; i < audio.length; i++) {
        if (audio[i] > threshold) audio[i] = threshold;
        else if (audio[i] < -threshold) audio[i] = -threshold;
    }
    return audio.buffer;
}

function simulateFringeCoverage(audioBuffer, sampleRate) {
    let buffer = audioBuffer;
    buffer = simulatePacketLoss(buffer, 0.1);
    buffer = addStaticNoise(buffer, 300);
    buffer = insertDropouts(buffer, 100, 0.05);
    buffer = modulateFrequency(buffer, sampleRate, 0.5, 0.2);
    buffer = applyClipping(buffer, 20000);
    return buffer;
}
