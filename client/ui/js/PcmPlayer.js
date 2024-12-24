/*
 * Copyright 2017 samirkumardas
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
*/
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
* Derived from https://github.com/samirkumardas/pcm-player/
*
*/


function PCMPlayer(option) {
    this.init(option);
}

PCMPlayer.prototype.init = function(option) {
    var defaults = {
        encoding: '16bitInt',
        channels: 1,
        sampleRate: 8000,
        flushingTime: 1000
    };
    this.option = Object.assign({}, defaults, option);
    this.samples = new Float32Array();
    this.flush = this.flush.bind(this);
    this.interval = setInterval(this.flush, this.option.flushingTime);
    this.maxValue = this.getMaxValue();
    this.typedArray = this.getTypedArray();
    this.createContext();
};

PCMPlayer.prototype.getMaxValue = function () {
    var encodings = {
        '8bitInt': 128,
        '16bitInt': 32768,
        '32bitInt': 2147483648,
        '32bitFloat': 1
    }

    return encodings[this.option.encoding] ? encodings[this.option.encoding] : encodings['16bitInt'];
};

PCMPlayer.prototype.getTypedArray = function () {
    var typedArrays = {
        '8bitInt': Int8Array,
        '16bitInt': Int16Array,
        '32bitInt': Int32Array,
        '32bitFloat': Float32Array
    }

    return typedArrays[this.option.encoding] ? typedArrays[this.option.encoding] : typedArrays['16bitInt'];
};

PCMPlayer.prototype.createContext = function() {
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // context needs to be resumed on iOS and Safari (or it will stay in "suspended" state)
    this.audioCtx.resume();
    this.audioCtx.onstatechange = () => console.log(this.audioCtx.state);   // if you want to see "Running" state in console and be happy about it

    this.gainNode = this.audioCtx.createGain();
    this.gainNode.gain.value = 1;
    this.gainNode.connect(this.audioCtx.destination);
    this.startTime = this.audioCtx.currentTime;
    console.debug("Audio context created!!");
};

PCMPlayer.prototype.isTypedArray = function(data) {
    return (data.byteLength && data.buffer && data.buffer.constructor == ArrayBuffer);
};

PCMPlayer.prototype.feed = function(data) {
    if (!this.isTypedArray(data)){
        console.log("audio data is a not typed array; Data: " + data);
        return;
    }
    data = this.getFormatedValue(data);
    var tmp = new Float32Array(this.samples.length + data.length);
    tmp.set(this.samples, 0);
    tmp.set(data, this.samples.length);
    this.samples = tmp;
};

PCMPlayer.prototype.getFormatedValue = function(data) {
    var data = new this.typedArray(data.buffer),
        float32 = new Float32Array(data.length),
        i;

    for (i = 0; i < data.length; i++) {
        float32[i] = data[i] / this.maxValue;
    }
    return float32;
};

PCMPlayer.prototype.volume = function(volume) {
    if (volume < 0 || volume > 1) {
        console.warn("Volume should be between 0 and 1. Clamping value.");
        volume = Math.max(0, Math.min(1, volume));
    }
    this.gainNode.gain.value = volume;
    console.log("Volume set to:", volume);
};

PCMPlayer.prototype.destroy = function() {
    if (this.interval) {
        clearInterval(this.interval);
    }
    this.samples = null;
    this.audioCtx.close();
    this.audioCtx = null;
};

PCMPlayer.prototype.flush = function() {
    if (!this.samples.length) return;

    var bufferSource = this.audioCtx.createBufferSource(),
        length = Math.floor(this.samples.length / this.option.channels),
        audioBuffer = this.audioCtx.createBuffer(this.option.channels, length, this.option.sampleRate),
        audioData,
        channel,
        offset,
        i;

    for (channel = 0; channel < this.option.channels; channel++) {
        audioData = audioBuffer.getChannelData(channel);
        offset = channel;
        for (i = 0; i < length; i++) {
            audioData[i] = this.samples[offset];
            offset += this.option.channels;
        }
    }

    if (this.startTime < this.audioCtx.currentTime) {
        console.warn(`Adjusting startTime: ${this.startTime} -> ${this.audioCtx.currentTime}`);
        this.startTime = this.audioCtx.currentTime;
    }

    bufferSource.buffer = audioBuffer;
    bufferSource.connect(this.gainNode);
    bufferSource.start(this.startTime);
    this.startTime += audioBuffer.duration;

    // Carry over excess samples
    const excessSamples = this.samples.slice(length * this.option.channels);
    this.samples = new Float32Array(excessSamples.length);
    this.samples.set(excessSamples);
};

PCMPlayer.prototype.clear = function() {
    console.log("Clearing audio buffer and resetting state...");
    this.samples = new Float32Array();
    if (this.audioCtx) {
        this.startTime = this.audioCtx.currentTime;
    }
};