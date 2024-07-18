const { Server } = require('@citizenfx/server');
const fs = require('fs');
const yaml = require('js-yaml');

let codeplugs = {};
let sites;

displayStartupMessage();
loadCodeplugs();
loadSitesConfig();

on('playerConnecting', (name, setKickReason, deferrals) => {
    // console.debug(`${name} is connecting to the server.`);
});

on('playerDropped', (reason) => {
    // console.debug(`A player has left the server: ${reason}`);
});

onNet('getSitesConfig', () => {
    console.debug(`Player ${source} requested sites config.`);
    emitNet('receiveSitesConfig', source, sites);
});

function loadCodeplugs() {
    try {
        const codeplugDir = GetResourcePath(GetCurrentResourceName()) + '/codeplugs/';
        const modelsDir = GetResourcePath(GetCurrentResourceName()) + '/client/ui/models/';

        fs.readdirSync(codeplugDir).forEach(file => {
            if (file.endsWith('.yml')) {
                const codeplugName = file.slice(0, -4);
                const fileContents = fs.readFileSync(codeplugDir + file, 'utf8');
                const codeplug = yaml.load(fileContents);

                const modelConfigPath = `${modelsDir}${codeplug.radioWide.model}/config.yml`;
                console.log('Model config path:', modelConfigPath)
                const modelConfigPathVehicle = `${modelsDir}${codeplug.radioWide.inCarMode}/config.yml`;
                console.log('Model config path:', modelConfigPathVehicle)
                if (fs.existsSync(modelConfigPath)) {
                    const modelConfigContents = fs.readFileSync(modelConfigPath, 'utf8');
                    codeplug.modelConfig = yaml.load(modelConfigContents);
                    // console.log('Model config loaded:', codeplug.modelConfig);
                }

                if (fs.existsSync(modelConfigPathVehicle)) {
                    const modelConfigContents = fs.readFileSync(modelConfigPathVehicle, 'utf8');
                    codeplug.inCarModeConfig = yaml.load(modelConfigContents);
                    console.log('Model config loaded:', codeplug.inCarModeConfig);
                }

                codeplugs[codeplugName] = codeplug;
            }
        });
        // console.debug('Codeplugs loaded:', Object.keys(codeplugs));
    } catch (e) {
        console.error('Error loading codeplugs:', e);
    }
}
function loadSitesConfig() {
    try {
        const fileContents = fs.readFileSync( GetResourcePath(GetCurrentResourceName()) + '/sites.yml', 'utf8');
        sites = yaml.load(fileContents).sites;
        // console.debug('Sites config loaded:', sites);
    } catch (e) {
        console.error('Error loading sites config:', e);
    }
}

RegisterCommand('set_codeplug', (source, args, rawCommand) => {
    const codeplugName = args[0];
    console.debug(codeplugs[codeplugName])
    if (codeplugs[codeplugName]) {
        // console.debug(`Setting codeplug for player ${source}: ${codeplugName}`);
        emitNet('receiveCodeplug', source, codeplugs[codeplugName]);
    } else {
        console.debug(`Codeplug not found: ${codeplugName}`);
    }
});

function displayStartupMessage() {
    console.log('============================================================');
    console.log('==                                                        ==');
    console.log('==                   WhackerLinkFiveM                     ==');
    console.log('==             Author: Caleb, KO4UYJ (_php_)              ==');
    console.log('==             GitHub: https://github.com/WhackerLink     ==');
    console.log('==                                                        ==');
    console.log('============================================================');
}