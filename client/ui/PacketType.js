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
        UNKNOWN: 0,
        AUDIO_DATA: 1,
        GRP_AFF_REQ: 2,
        GRP_AFF_RSP: 3,
        AFF_UPDATE: 4,
        GRP_VCH_REQ: 5,
        GRP_VCH_RLS: 6,
        GRP_VCH_RSP: 7,
        U_REG_REQ: 8,
        U_REG_RSP: 9,
        U_DE_REG_REQ: 10,
        U_DE_REG_RSP: 11,
        EMRG_ALRM_REQ: 12,
        EMRG_ALRM_RSP: 13,
        CALL_ALRT: 14,
        CALL_ALRT_REQ: 15
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