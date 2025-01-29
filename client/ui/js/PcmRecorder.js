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
* Copyright (C) 2025 Caleb, K4PHP
*
* Derived from github, majorly refactored
*
*/

class MicCapture {
    constructor(onAudioFrameReadyCallback) {
        this.source = null;
        this.node = null;
        this.gainNode = null;
        this.stream = null;
        this.audioContext = null;
        this.callbackOnComplete = null;
        this.gain = 1;

        this.airCommsEffect = false;
        this.rotorSoundEnabled = false;

        this.highPassFilter = null;
        this.lowPassFilter = null;

        this.noiseSource = null;
        this.noiseGainNode = null;

        this.noiseSourceStarted = false;

        this.onAudioFrameReadyCallback = onAudioFrameReadyCallback || this.defaultOnAudioFrameReady;
    }

    async captureMicrophone(cb) {
        const constraints = {
            audio: {
                sampleRate: 48000,
                channelCount: 1,
                volume: 1.0,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
            },
            video: false,
        };
        this.callbackOnComplete = cb;

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
                this.successCallback(mediaStream);
            } catch (err) {
                this.failureCallback(err);
            }
        } else {
            alert('Microphone access denied (navigator.mediaDevices not supported).');
        }
    }

    stopCapture() {
        if (this.source) this.source.disconnect();
        if (this.gainNode) this.gainNode.disconnect();
        if (this.node) this.node.disconnect();
        if (this.highPassFilter) this.highPassFilter.disconnect();
        if (this.lowPassFilter) this.lowPassFilter.disconnect();
        if (this.noiseSource) this.noiseSource.disconnect();
        if (this.noiseGainNode) this.noiseGainNode.disconnect();
        if (this.stream) this.stream.getTracks().forEach(track => track.stop());

        this.source = null;
        this.gainNode = null;
        this.node = null;
        this.highPassFilter = null;
        this.lowPassFilter = null;
        this.noiseSource = null;
        this.noiseGainNode = null;
        this.stream = null;
        if (this.audioContext) this.audioContext.close();
        this.audioContext = null;
    }

    failureCallback(err) {
        alert(`Failed to capture microphone: ${err.message}`);
    }

    successCallback(mediaStream) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
            latencyHint: 'interactive',
        });

        this.stream = mediaStream;
        this.source = this.audioContext.createMediaStreamSource(mediaStream);
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = this.gain;

        this.highPassFilter = this.audioContext.createBiquadFilter();
        this.highPassFilter.type = "highpass";
        this.highPassFilter.frequency.value = 1000;
        this.highPassFilter.Q.value = 1.5;

        this.lowPassFilter = this.audioContext.createBiquadFilter();
        this.lowPassFilter.type = "lowpass";
        this.lowPassFilter.frequency.value = 1000;
        this.lowPassFilter.Q.value = 1.5;

        this.noiseSource = this.audioContext.createBufferSource();
        this.noiseSource.buffer = this.createWhiteNoiseBuffer();
        this.noiseSource.loop = true;

        this.noiseGainNode = this.audioContext.createGain();
        this.noiseGainNode.gain.value = 0.1;

        this.node = this.audioContext.createScriptProcessor(1024, 1, 1);
        const samplesPerFrame = 160;
        const frame = new ArrayBuffer(samplesPerFrame * 2);
        const view = new DataView(frame);
        let outputSamples = 0;
        let sum = 0.0;

        this.node.onaudioprocess = event => {
            const inBuffer = event.inputBuffer.getChannelData(0);
            const downsampled = this.downsampleBuffer(inBuffer, event.inputBuffer.sampleRate, 8000);
            downsampled.forEach(sample => {
                const sample16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
                view.setInt16(outputSamples * 2, sample16, true);
                outputSamples++;
                sum += sample16 * sample16;

                if (outputSamples >= samplesPerFrame) {
                    const rms = Math.sqrt(sum / samplesPerFrame) / 32767.0;
                    this.onAudioFrameReadyCallback(new Uint8Array(frame), rms * 30.0);
                    outputSamples = 0;
                    sum = 0.0;
                }
            });
        };

        this.source.connect(this.gainNode);

        if (this.airCommsEffect) {
            this.enableAirCommsEffect();
        } else {
            this.gainNode.connect(this.node);
        }

        this.node.connect(this.audioContext.destination);

        if (this.callbackOnComplete) this.callbackOnComplete();
    }

    createWhiteNoiseBuffer() {
        const bufferSize = this.audioContext.sampleRate * 2;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        return buffer;
    }

    enableAirCommsEffect() {
        this.airCommsEffect = true;

        if (!this.noiseSource || !this.noiseSourceStarted) {
            this.noiseSource = this.audioContext.createBufferSource();
            this.noiseSource.buffer = this.createWhiteNoiseBuffer();
            this.noiseSource.loop = true;

            this.noiseGainNode = this.audioContext.createGain();
            this.noiseGainNode.gain.value = 0.1;

            this.noiseSource.connect(this.noiseGainNode);
            this.noiseGainNode.connect(this.gainNode);
            this.noiseSource.start();
            this.noiseSourceStarted = true;
        }

        if (this.gainNode && this.highPassFilter && this.lowPassFilter) {
            this.gainNode.disconnect();
            this.gainNode.connect(this.highPassFilter);
            this.highPassFilter.connect(this.lowPassFilter);
            this.lowPassFilter.connect(this.node);
        }
    }

    disableAirCommsEffect() {
        this.airCommsEffect = false;

        if (this.noiseSource && this.noiseSourceStarted) {
            this.noiseSource.stop();
            this.noiseSource.disconnect();
            this.noiseSource = null;
            this.noiseSourceStarted = false;
        }

        if (this.gainNode) {
            this.gainNode.disconnect();
            this.highPassFilter.disconnect();
            this.lowPassFilter.disconnect();
            this.gainNode.connect(this.node);
        }
    }

    async enableRotorSound(rotorSoundUrl) {
        if (!this.audioContext) {
            console.error("AudioContext is not initialized. Ensure microphone capture is started before enabling rotor sound.");
            return;
        }

        this.rotorSoundEnabled = true;

        if (!this.rotorSource) {
            try {
                const response = await fetch(rotorSoundUrl);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

                this.rotorSource = this.audioContext.createBufferSource();
                this.rotorSource.buffer = audioBuffer;
                this.rotorSource.loop = true;

                this.rotorGainNode = this.audioContext.createGain();
                this.rotorGainNode.gain.value = 0.5;

                this.rotorSource.connect(this.rotorGainNode);
                this.rotorGainNode.connect(this.gainNode);

                this.rotorSource.start();
                console.log("Rotor sound enabled.");
            } catch (error) {
                console.error("Failed to enable rotor sound:", error.message);
            }
        }
    }


    disableRotorSound() {
        this.rotorSoundEnabled = false;

        if (this.rotorSource) {
            this.rotorSource.stop();
            this.rotorSource.disconnect();
            this.rotorSource = null;
        }

        if (this.rotorGainNode) {
            this.rotorGainNode.disconnect();
            this.rotorGainNode = null;
        }
    }


    downsampleBuffer(buffer, inputSampleRate, targetSampleRate) {
        if (targetSampleRate >= inputSampleRate) return buffer;
        const ratio = inputSampleRate / targetSampleRate;
        const newLength = Math.round(buffer.length / ratio);
        const result = new Float32Array(newLength);

        for (let i = 0; i < newLength; i++) {
            const start = Math.round(i * ratio);
            const end = Math.min(buffer.length, Math.round((i + 1) * ratio));
            result[i] = buffer.subarray(start, end).reduce((sum, val) => sum + val, 0) / (end - start);
        }
        return result;
    }

    defaultOnAudioFrameReady(frame, rms) {
        console.log('Audio frame ready:', frame, 'RMS:', rms);
    }
}
