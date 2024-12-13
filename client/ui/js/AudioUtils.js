/*
* WhackerLink - WhackerLinkFiveM
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*
* Copyright (C) 2024 Caleb, K4PHP
*
*/

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
    let buffer = new Int16Array(audioBuffer);

    buffer = new Int16Array(simulatePacketLoss(buffer.buffer, 0.60));
    buffer = new Int16Array(insertDropouts(buffer.buffer, 200, 0.50));

    return buffer;
}
