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

(function(global) {
    const PacketType = {
        UNKOWN: 0x00,
        AUDIO_DATA: 0x01,
        GRP_AFF_REQ: 0x02,
        GRP_AFF_RSP: 0x03,
        AFF_UPDATE: 0x04,
        GRP_VCH_REQ: 0x05,
        GRP_VCH_RLS: 0x06,
        GRP_VCH_RSP: 0x07,
        U_REG_REQ: 0x08,
        U_REG_RSP: 0x09,
        U_DE_REG_REQ: 0x10,
        U_DE_REG_RSP: 0x11,
        EMRG_ALRM_REQ: 0x12,
        EMRG_ALRM_RSP: 0x13,
        CALL_ALRT: 0x14,
        CALL_ALRT_REQ: 0x15,
        AUTH_DEMAND: 0x16,
        AUTH_REPLY: 0x17,
        REL_DEMAND: 0x18,
        LOC_BCAST: 0x19,
        STS_BCAST: 0x21,
        SPEC_FUNC: 0x22,
        ACK_RSP: 0x23,
        GRP_VCH_UPD: 0x24
    };

    const PacketTypeReverse = Object.fromEntries(
        Object.entries(PacketType).map(([key, value]) => [value, key])
    );

    function packetToEnum(value) {
        return PacketTypeReverse[value] || null;
    }

    function packetToNumber(enumValue) {
        return PacketType[enumValue] !== undefined ? PacketType[enumValue] : null;
    }

    global.PacketType = PacketType;
    global.packetToEnum = packetToEnum;
    global.packetToNumber = packetToNumber;

}(window));