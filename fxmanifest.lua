fx_version 'bodacious'
game 'gta5'

client_script 'client/client.js'
server_script 'server/server.js'

ui_page 'client/ui/index.html'

files {
    'configs/*.yml',
    'client/ui/models/**/*.png',
    'client/ui/models/**/icons/*.png',
    'client/ui/models/**/style.css',
    'client/ui/models',
    'client/ui/index.html',
	'client/ui/audio/*.wav',
    'client/ui/style/*.css',
    'client/ui/js/*.js',
    'client/ui/radio.png'
}

dependencies {
  'yarn'
}

author 'Caleb, K4PHP (_php_)'
version 'R03.01.00'
description 'WhackerLink FiveM Plugin'