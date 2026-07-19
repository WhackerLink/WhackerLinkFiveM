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
* Copyright (C) 2026 Caleb, K4PHP
*
* Based upon the c++ lib https://github.com/atmatthewat/mdc-encode-decode/
*0
*/

function MdcEncoder(sampleRate) {
    this.sampleRate = sampleRate || 8000;
    this.loaded = 0;
    this.bpos = 0;
    this.ipos = 0;
    this.preambleSet = 0;
    this.preambleCount = 0;
    this.thu = 0;
    this.tthu = 0;
    this.state = 0;
    this.lb = 0;
    this.xorb = 0;
    this.data = new Uint8Array(40);
    this.amplitude = 22282;
    this.incru = Mdc1200.getIncr(this.sampleRate, 1200);
    this.incru18 = Mdc1200.getIncr(this.sampleRate, 1800);
}

MdcEncoder.prototype.setPreamble = function(preambleLength) {
    if (preambleLength < 0) return -1;
    this.preambleSet = preambleLength;
    return 0;
};

MdcEncoder.prototype.setPacket = function(op, arg, unitID) {
    if (this.loaded) return -1;

    let dp = this.encLeader(0);
    this.data[dp] = op & 0xff;
    this.data[dp + 1] = arg & 0xff;
    this.data[dp + 2] = (unitID >> 8) & 0xff;
    this.data[dp + 3] = unitID & 0xff;
    this.encStr(dp);

    this.loaded = 26;
    this.state = 0;
    return 0;
};

MdcEncoder.prototype.setDoublePacket = function(op, arg, unitID, extra0, extra1, extra2, extra3) {
    if (this.loaded) return -1;

    let dp = this.encLeader(0);
    this.data[dp] = op & 0xff;
    this.data[dp + 1] = arg & 0xff;
    this.data[dp + 2] = (unitID >> 8) & 0xff;
    this.data[dp + 3] = unitID & 0xff;
    dp = this.encStr(dp);
    this.data[dp] = extra0 & 0xff;
    this.data[dp + 1] = extra1 & 0xff;
    this.data[dp + 2] = extra2 & 0xff;
    this.data[dp + 3] = extra3 & 0xff;
    this.encStr(dp);

    this.loaded = 40;
    this.state = 0;
    return 0;
};

MdcEncoder.prototype.encLeader = function(offset) {
    for (let i = 0; i < 7; i++) {
        this.data[offset + i] = 0x55;
    }

    this.data[offset + 7] = 0x07;
    this.data[offset + 8] = 0x09;
    this.data[offset + 9] = 0x2a;
    this.data[offset + 10] = 0x44;
    this.data[offset + 11] = 0x6f;

    return offset + 12;
};

MdcEncoder.prototype.encStr = function(offset) {
    const ccrc = Mdc1200.crc(this.data.subarray(offset, offset + 4));
    const csr = new Array(7).fill(0);
    const lbits = new Array(112).fill(0);
    let k;
    let m;

    this.data[offset + 4] = ccrc & 0xff;
    this.data[offset + 5] = (ccrc >> 8) & 0xff;
    this.data[offset + 6] = 0;

    for (let i = 0; i < 7; i++) {
        this.data[offset + i + 7] = 0;
        for (let j = 0; j <= 7; j++) {
            for (k = 6; k > 0; k--) {
                csr[k] = csr[k - 1];
            }

            csr[0] = (this.data[offset + i] >> j) & 0x01;
            const b = csr[0] + csr[2] + csr[5] + csr[6];
            this.data[offset + i + 7] |= (b & 0x01) << j;
        }
    }

    k = 0;
    m = 0;
    for (let i = 0; i < 14; i++) {
        for (let j = 0; j <= 7; j++) {
            lbits[k] = (this.data[offset + i] >> j) & 0x01;
            k += 16;
            if (k > 111) k = ++m;
        }
    }

    k = 0;
    for (let i = 0; i < 14; i++) {
        this.data[offset + i] = 0;
        for (let j = 7; j >= 0; j--) {
            if (lbits[k]) this.data[offset + i] |= 1 << j;
            ++k;
        }
    }

    return offset + 14;
};

MdcEncoder.prototype.getSample = function() {
    const lthu = this.thu;
    this.thu = (this.thu + this.incru) >>> 0;

    if (this.thu < lthu) {
        this.ipos++;
        if (this.ipos > 7) {
            this.ipos = 0;
            if (this.preambleCount === 0) {
                this.bpos++;
            } else {
                this.preambleCount--;
            }

            if (this.bpos >= this.loaded) {
                this.state = 0;
                return 0;
            }
        }

        const b = (this.data[this.bpos] >> (7 - this.ipos)) & 0x01;
        if (b !== this.lb) {
            this.xorb = 1;
            this.lb = b;
        } else {
            this.xorb = 0;
        }
    }

    if (this.xorb) {
        this.tthu = (this.tthu + this.incru18) >>> 0;
    } else {
        this.tthu = (this.tthu + this.incru) >>> 0;
    }

    return Math.round(Math.sin((this.tthu >>> 24) * Math.PI / 128) * this.amplitude);
};

MdcEncoder.prototype.getSamples = function(bufferSize) {
    if (!this.loaded) return new Int16Array(0);

    if (this.state === 0) {
        this.tthu = 0;
        this.thu = 0;
        this.bpos = 0;
        this.ipos = 0;
        this.state = 1;
        this.xorb = 1;
        this.lb = 0;
        this.preambleCount = this.preambleSet;
    }

    const buffer = new Int16Array(bufferSize);
    let i = 0;

    while (i < bufferSize && this.state) {
        buffer[i++] = this.getSample();
    }

    if (this.state === 0) this.loaded = 0;
    return buffer.subarray(0, i);
};

MdcEncoder.prototype.getAllSamples = function(bufferSize) {
    const size = bufferSize || 1024;
    let samples = new Int16Array(0);

    while (true) {
        const chunk = this.getSamples(size);
        if (!chunk.length) break;

        const next = new Int16Array(samples.length + chunk.length);
        next.set(samples, 0);
        next.set(chunk, samples.length);
        samples = next;
    }

    return samples;
};

function MdcDecoder(sampleRate) {
    this.sampleRate = sampleRate || 8000;
    this.incru = Mdc1200.getIncr(this.sampleRate, 1200);
    this.onePoint = this.sampleRate < 16000;
    this.good = 0;
    this.indouble = 0;
    this.callback = null;
    this.packet = null;
    this.du = [];

    const count = this.onePoint ? 4 : 5;

    for (let i = 0; i < count; i++) {
        this.du[i] = {
            thu: (i * 2 * (0x80000000 / count)) >>> 0,
            xorb: 0,
            invert: 0,
            nlstep: i,
            nlevel: new Array(10).fill(0),
            synclow: 0,
            synchigh: 0,
            shstate: -1,
            shcount: 0,
            bits: new Array(112).fill(0)
        };
    }
}

MdcDecoder.prototype.setCallback = function(callback) {
    this.callback = callback;
    return 0;
};

MdcDecoder.prototype.clearBits = function(x) {
    this.du[x].bits.fill(0);
};

MdcDecoder.prototype.goFix = function(data) {
    const csr = new Array(7).fill(0);
    let syn = 0;

    for (let i = 0; i < 7; i++) {
        for (let j = 0; j <= 7; j++) {
            for (let k = 6; k > 0; k--) {
                csr[k] = csr[k - 1];
            }

            csr[0] = (data[i] >> j) & 0x01;
            const b = csr[0] + csr[2] + csr[5] + csr[6];
            syn <<= 1;
            if ((b & 0x01) ^ ((data[i + 7] >> j) & 0x01)) syn |= 1;

            let ec = 0;
            if (syn & 0x80) ++ec;
            if (syn & 0x20) ++ec;
            if (syn & 0x04) ++ec;
            if (syn & 0x02) ++ec;

            if (ec >= 3) {
                syn ^= 0xa6;
                let fixi = i;
                let fixj = j - 7;
                if (fixj < 0) {
                    --fixi;
                    fixj += 8;
                }
                if (fixi >= 0) data[fixi] ^= 1 << fixj;
            }
        }
    }
};

MdcDecoder.prototype.procBits = function(x) {
    const lbits = new Array(112).fill(0);
    const data = new Uint8Array(14);
    let lbc = 0;
    let k;

    for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 7; j++) {
            k = (j * 16) + i;
            lbits[lbc] = this.du[x].bits[k];
            ++lbc;
        }
    }

    for (let i = 0; i < 14; i++) {
        data[i] = 0;
        for (let j = 0; j < 8; j++) {
            k = (i * 8) + j;
            if (lbits[k]) data[i] |= 1 << j;
        }
    }

    this.goFix(data);

    const ccrc = Mdc1200.crc(data.subarray(0, 4));
    const rcrc = (data[5] << 8) | data[4];

    if (ccrc === rcrc) {
        if (this.du[x].shstate === 2) {
            this.packet.extra0 = data[0];
            this.packet.extra1 = data[1];
            this.packet.extra2 = data[2];
            this.packet.extra3 = data[3];

            for (k = 0; k < this.du.length; k++) {
                this.du[k].shstate = -1;
            }

            this.good = 2;
            this.indouble = 0;
        } else {
            if (!this.indouble) {
                this.good = 1;
                this.packet = {
                    frameCount: 1,
                    op: data[0],
                    arg: data[1],
                    unitID: (data[2] << 8) | data[3]
                };

                switch (data[0]) {
                    case 0x35:
                    case 0x55:
                        this.good = 0;
                        this.indouble = 1;
                        this.du[x].shstate = 2;
                        this.du[x].shcount = 0;
                        this.clearBits(x);
                        break;
                    default:
                        for (k = 0; k < this.du.length; k++) {
                            this.du[k].shstate = -1;
                        }
                        break;
                }
            } else {
                this.du[x].shstate = 2;
                this.du[x].shcount = 0;
                this.clearBits(x);
            }
        }
    } else {
        this.du[x].shstate = -1;
    }

    if (this.good && this.callback) {
        const packet = this.currentPacket();
        this.callback(packet);
        this.good = 0;
        this.packet = null;
    }
};

MdcDecoder.prototype.shiftIn = function(x) {
    let bit = this.du[x].xorb;
    let gcount;

    switch (this.du[x].shstate) {
        case -1:
            this.du[x].synchigh = 0;
            this.du[x].synclow = 0;
            this.du[x].shstate = 0;
        case 0:
            this.du[x].synchigh = (this.du[x].synchigh << 1) >>> 0;
            if (this.du[x].synclow & 0x80000000) this.du[x].synchigh |= 1;
            this.du[x].synclow = (this.du[x].synclow << 1) >>> 0;
            if (bit) this.du[x].synclow |= 1;

            gcount = Mdc1200.oneBits(0x000000ff & (0x00000007 ^ this.du[x].synchigh));
            gcount += Mdc1200.oneBits((0x092a446f ^ this.du[x].synclow) >>> 0);

            if (gcount <= 5) {
                this.du[x].shstate = 1;
                this.du[x].shcount = 0;
                this.clearBits(x);
            } else if (gcount >= 35) {
                this.du[x].shstate = 1;
                this.du[x].shcount = 0;
                this.du[x].xorb = this.du[x].xorb ? 0 : 1;
                this.du[x].invert = this.du[x].invert ? 0 : 1;
                this.clearBits(x);
            }
            return;
        case 1:
        case 2:
            this.du[x].bits[this.du[x].shcount] = bit;
            this.du[x].shcount++;
            if (this.du[x].shcount > 111) this.procBits(x);
            return;
    }
};

MdcDecoder.prototype.nlproc = function(x) {
    let vnow;
    let vpast;

    switch (this.du[x].nlstep) {
        case 3:
            vnow = (-0.60 * this.du[x].nlevel[3]) + (0.97 * this.du[x].nlevel[1]);
            vpast = (-0.60 * this.du[x].nlevel[7]) + (0.97 * this.du[x].nlevel[9]);
            break;
        case 8:
            vnow = (-0.60 * this.du[x].nlevel[8]) + (0.97 * this.du[x].nlevel[6]);
            vpast = (-0.60 * this.du[x].nlevel[2]) + (0.97 * this.du[x].nlevel[4]);
            break;
        default:
            return;
    }

    this.du[x].xorb = vnow > vpast ? 1 : 0;
    if (this.du[x].invert) this.du[x].xorb = this.du[x].xorb ? 0 : 1;
    this.shiftIn(x);
};

MdcDecoder.prototype.processSamples = function(samples) {
    const source = Mdc1200.sampleSource(samples);

    for (let i = 0; i < source.length; i++) {
        const value = source.get(i) / 65536.0;

        for (let j = 0; j < this.du.length; j++) {
            const lthu = this.du[j].thu;
            this.du[j].thu = (this.du[j].thu + ((this.onePoint ? 1 : this.du.length) * this.incru)) >>> 0;
            if (this.du[j].thu < lthu) {
                if (this.onePoint) {
                    this.du[j].xorb = value > 0 ? 1 : 0;
                    if (this.du[j].invert) this.du[j].xorb = this.du[j].xorb ? 0 : 1;
                    this.shiftIn(j);
                } else {
                    this.du[j].nlstep++;
                    if (this.du[j].nlstep > 9) this.du[j].nlstep = 0;
                    this.du[j].nlevel[this.du[j].nlstep] = value;
                    this.nlproc(j);
                }
            }
        }
    }

    return this.good;
};

MdcDecoder.prototype.currentPacket = function() {
    if (!this.packet) return null;

    const packet = {
        frameCount: this.good || this.packet.frameCount,
        op: this.packet.op,
        arg: this.packet.arg,
        unitID: this.packet.unitID
    };

    if (packet.frameCount === 2) {
        packet.extra0 = this.packet.extra0;
        packet.extra1 = this.packet.extra1;
        packet.extra2 = this.packet.extra2;
        packet.extra3 = this.packet.extra3;
    }

    return packet;
};

MdcDecoder.prototype.getPacket = function() {
    if (this.good !== 1) return null;
    const packet = this.currentPacket();
    this.good = 0;
    this.packet = null;
    return packet;
};

MdcDecoder.prototype.getDoublePacket = function() {
    if (this.good !== 2) return null;
    const packet = this.currentPacket();
    this.good = 0;
    this.packet = null;
    return packet;
};

const Mdc1200 = {
    Encoder: MdcEncoder,
    Decoder: MdcDecoder,

    getIncr: function(sampleRate, tone) {
        if (tone === 1200) {
            if (sampleRate === 8000) return 644245094;
            if (sampleRate === 16000) return 322122547;
            if (sampleRate === 22050) return 233739716;
            if (sampleRate === 32000) return 161061274;
            if (sampleRate === 44100) return 116869858;
            if (sampleRate === 48000) return 107374182;
        }

        if (tone === 1800) {
            if (sampleRate === 8000) return 966367642;
            if (sampleRate === 16000) return 483183820;
            if (sampleRate === 22050) return 350609575;
            if (sampleRate === 32000) return 241591910;
            if (sampleRate === 44100) return 175304788;
            if (sampleRate === 48000) return 161061274;
        }

        return Math.floor(tone * 2 * (0x80000000 / sampleRate));
    },

    flip: function(crc, bitnum) {
        let crcout = 0;
        let j = 1;

        for (let i = 1 << (bitnum - 1); i; i >>= 1) {
            if (crc & i) crcout |= j;
            j <<= 1;
        }

        return crcout & 0xffff;
    },

    crc: function(data) {
        let crc = 0x0000;

        for (let i = 0; i < data.length; i++) {
            const c = Mdc1200.flip(data[i], 8);

            for (let j = 0x80; j; j >>= 1) {
                let bit = crc & 0x8000;
                crc = (crc << 1) & 0xffff;
                if (c & j) bit ^= 0x8000;
                if (bit) crc ^= 0x1021;
            }
        }

        crc = Mdc1200.flip(crc, 16);
        crc ^= 0xffff;
        return crc & 0xffff;
    },

    oneBits: function(n) {
        let i = 0;
        n >>>= 0;

        while (n) {
            ++i;
            n = (n & (n - 1)) >>> 0;
        }

        return i;
    },

    sampleSource: function(samples) {
        if (samples instanceof Int16Array) {
            return {
                length: samples.length,
                get: i => samples[i]
            };
        }

        if (samples instanceof ArrayBuffer) {
            const view = new DataView(samples);
            return {
                length: view.byteLength / 2,
                get: i => view.getInt16(i * 2, true)
            };
        }

        if (samples && samples.buffer instanceof ArrayBuffer && samples.BYTES_PER_ELEMENT === 1) {
            const view = new DataView(samples.buffer, samples.byteOffset, samples.byteLength);
            return {
                length: view.byteLength / 2,
                get: i => view.getInt16(i * 2, true)
            };
        }

        if (samples && typeof samples.length === 'number') {
            return {
                length: samples.length,
                get: i => samples[i]
            };
        }

        return {
            length: 0,
            get: () => 0
        };
    },

    encodePacket: function(op, arg, unitID, options) {
        const opts = options || {};
        const encoder = new MdcEncoder(opts.sampleRate || 8000);
        if (opts.preamble) encoder.setPreamble(opts.preamble);
        encoder.setPacket(op, arg, unitID);
        return encoder.getAllSamples(opts.bufferSize || 1024);
    },

    encodeDoublePacket: function(op, arg, unitID, extra0, extra1, extra2, extra3, options) {
        const opts = options || {};
        const encoder = new MdcEncoder(opts.sampleRate || 8000);
        if (opts.preamble) encoder.setPreamble(opts.preamble);
        encoder.setDoublePacket(op, arg, unitID, extra0, extra1, extra2, extra3);
        return encoder.getAllSamples(opts.bufferSize || 1024);
    },

    decodePcm: function(samples, options) {
        const opts = options || {};
        const decoder = new MdcDecoder(opts.sampleRate || 8000);
        const source = Mdc1200.sampleSource(samples);
        const frameSize = opts.frameSize || 160;
        const packets = [];

        for (let i = 0; i < source.length; i += frameSize) {
            const chunk = new Int16Array(Math.min(frameSize, source.length - i));
            for (let j = 0; j < chunk.length; j++) {
                chunk[j] = source.get(i + j);
            }

            const rv = decoder.processSamples(chunk);
            if (rv === 1) packets.push(decoder.getPacket());
            if (rv === 2) packets.push(decoder.getDoublePacket());
        }

        return packets;
    }
};

//arggg
if (typeof window !== 'undefined') {
    window.Mdc1200 = Mdc1200;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Mdc1200;
}
