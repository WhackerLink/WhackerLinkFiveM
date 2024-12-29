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

class ScanManager {
    constructor(codeplug) {
        this.codeplug = codeplug;
    }

    getScanLists() {
        return this.codeplug.scanLists || [];
    }

    getScanListByName(name) {
        return this.getScanLists().find(scanList => scanList.name === name) || null;
    }

    getZones() {
        return this.codeplug.zones || [];
    }

    getZoneByName(name) {
        return this.getZones().find(zone => zone.name === name) || null;
    }

    getChannelsInZone(zoneName) {
        const zone = this.getZoneByName(zoneName);
        return zone ? zone.channels : [];
    }

    getChannelByName(zoneName, channelName) {
        const channels = this.getChannelsInZone(zoneName);
        return channels.find(channel => channel.name === channelName) || null;
    }

    hasScanList(zoneName, channelName) {
        const channel = this.getChannelByName(zoneName, channelName);
        return channel && channel.scanList ? true : false;
    }

    isChannelInCurrentScanList(zoneName, channelName, targetZoneName, targetChannelName) {
        const scanList = this.getScanListForChannel(zoneName, channelName);
        if (!scanList) return false;

        return scanList.channels.some(
            entry => entry.zone === targetZoneName && entry.channel === targetChannelName
        );
    }

    isTgInCurrentScanList(zoneName, channelName, tgid) {
        const scanList = this.getScanListForChannel(zoneName, channelName);
        if (!scanList) {
            console.log("No scan list found for this channel");
            return false;
        }

        // console.log(`TGID to match: ${tgid}`);
        // console.log(`Scan list channels: ${JSON.stringify(scanList.channels)}`);

        return scanList.channels.some(entry => {
            const zone = this.getZoneByName(entry.zone);
            if (!zone) {
                console.log(`Zone "${entry.zone}" not found`);
                return false;
            }
            const channel = zone.channels.find(ch => ch.name === entry.channel);
            if (!channel) {
                console.log(`Channel "${entry.channel}" not found in zone "${entry.zone}"`);
                return false;
            }

            return channel.tgid.toString() === tgid.toString();
        });
    }

    getScanListForChannel(zoneName, channelName) {
        if (this.hasScanList(zoneName, channelName)) {
            const channel = this.getChannelByName(zoneName, channelName);
            return this.getScanListByName(channel.scanList);
        }
        return null;
    }

    getChannelAndZoneForTgInCurrentScanList(zoneName, channelName, tgid) {
        const scanList = this.getScanListForChannel(zoneName, channelName);
        if (!scanList) return null;

        for (const entry of scanList.channels) {
            const zone = this.getZoneByName(entry.zone);
            if (zone) {
                const channel = zone.channels.find(ch => ch.name === entry.channel && ch.tgid.toString() === tgid.toString());
                if (channel) {
                    return {
                        zone: entry.zone,
                        channel: channel.name,
                    };
                }
            }
        }
        return null;
    }

    getChannelsInScanList(scanListName) {
        const scanList = this.getScanListByName(scanListName);
        if (!scanList || !scanList.channels) return [];

        return scanList.channels.map(entry => {
            const zone = this.getZoneByName(entry.zone);
            if (zone) {
                const channel = zone.channels.find(ch => ch.name === entry.channel);
                if (channel) {
                    return { zone: entry.zone, ...channel };
                }
            }
            return null;
        }).filter(Boolean);
    }

    getScanListSummary() {
        const summary = [];
        this.getZones().forEach(zone => {
            zone.channels.forEach(channel => {
                const scanList = this.getScanListForChannel(zone.name, channel.name);
                summary.push({
                    zone: zone.name,
                    channel: channel.name,
                    hasScanList: !!scanList,
                    scanListName: scanList ? scanList.name : null,
                    scanListChannels: scanList ? this.getChannelsInScanList(scanList.name) : [],
                });
            });
        });
        return summary;
    }
}
