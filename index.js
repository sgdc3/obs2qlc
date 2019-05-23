"use strict";

const FileSystem = require('fs');
const WebSocket = require('ws');
const Request = require('request-promise');
const CheerIO = require('cheerio');

const obsWsAddress = 'ws://127.0.0.1:4444';
const qlcWsAddress = 'ws://127.0.0.1:9999/qlcplusWS';
const qlcAddress = 'http://127.0.0.1:9999';

var sceneMappings = {};
var widgets = {};

var obsSocket;
var obsConnected = false;

function initializeObsSocket() {
	obsSocket = new WebSocket(obsWsAddress);

	obsSocket.on('open', () => {
		obsConnected = true;
		console.log('Connected to the OBS WebSocket!');
	});

	obsSocket.on('close', () => {
		obsConnected = false;
		console.log('Disconnected from the OBS WebSocket!');
		setTimeout(initializeObsSocket, 1000);
	});

	obsSocket.on('error', (err) => {
		console.log(err);
		setTimeout(initializeObsSocket, 1000);
	});

	obsSocket.on('message', (data) => {
		var parsedData = JSON.parse(data);
		if(parsedData['update-type'] == 'SwitchScenes') {
			var sceneName = parsedData['scene-name'];
			console.log('Switched to scene ' + sceneName);

			if(!qlcConnected) {
				console.log('QLC is disconnected, ignoring...');
				return;
			}

			var buttonId = sceneMappings[sceneName];

			// Stop running show
			for(var sceneName in sceneMappings) {
				var currentButtonId = sceneMappings[sceneName];
				if(buttonId == currentButtonId) {
					continue;
				}
				var currentButton = widgets[currentButtonId];
				if(currentButton.active) {
					// Flip
					qlcSocket.send(currentButtonId + '|255');
					qlcSocket.send(currentButtonId + '|0');
					console.log(currentButton.text + ' was active... disabled.');
				}
			}

			// Find new light show
			if(buttonId != undefined) {
				var button = widgets[buttonId];
				if(button != undefined) {
					console.log('Using light show ' + button.text);
					if(!button.active) {
						qlcSocket.send(buttonId + '|255');
						qlcSocket.send(buttonId + '|0');
					} else {
						console.log('The show was already running!');
					}
				}
			}
		}
	});
};

var qlcSocket;
var qlcConnected = false;

function initializeQlcSocket() {
	qlcSocket = new WebSocket(qlcWsAddress);

	qlcSocket.on('open', () => {
		// Update widget status...
		widgets = {};
		Request(qlcAddress)
			.then(html => {
				var $ = CheerIO.load(html);
				$('.vcbutton').each((index, entry) => {
					var style = entry.attribs['style'];
					var button = {
						id: entry.attribs['id'],
						text: $(entry).text(),
						active: style.includes('border: 3px solid #00E600;'),
						monitoring: style.includes('border: 3px solid #FFAA00;')
					};
					widgets[button.id] = button;
				});
				qlcConnected = true;
				console.log('Connected to the QLC WebSocket!');
			});
	});

	qlcSocket.on('close', () => {
		if(!qlcConnected) {
			return;
		}
		qlcConnected = false;
		console.log('Disconnected from the QLC WebSocket!');
		setTimeout(initializeQlcSocket, 1000);
	});

	qlcSocket.on('error', (err) => {
		if(err.code != 'ECONNREFUSED') {
			console.log(err);
		}
		setTimeout(initializeQlcSocket, 1000);
	});

	qlcSocket.on('message', (data) => {
		var splitted = data.split('|');
		if(splitted[1] == 'BUTTON') {
			var id = splitted[0];
			var button = widgets[id];
			var value = splitted[2];
			if(button != undefined) {
			   button.active = value == 255;
			   button.monitoring = value == 127;
			   //console.log('Updated button ' + button.text + ' status! Act: ' + button.active + ' Mon: ' + button.monitoring);
			}
		}
	});	
};

// Initialize
sceneMappings = JSON.parse(FileSystem.readFileSync('mappings.json'));
initializeObsSocket();
initializeQlcSocket();
console.log('Ready!');
