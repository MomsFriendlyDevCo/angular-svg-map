#!/usr/bin/env node
/**
* Extremely simple static website serving script
* This is provided in case you need to deploy a quick demo
*
* Install + run:
*
* 		# from parent directory
*		bower install
*
*		cd demo
*		npm install
*		node server
*
*/


var express = require('express');
global.app = express();
app.use(express.static(__dirname));

app.use('/bower_components', express.static(__dirname + '/../bower_components'));
app.use('/data', express.static(__dirname + '/../data'));
app.use('/markers', express.static(__dirname + '/../markers'));

app.get('/angular-svg-map.js', function(req, res) {
	res.sendFile('angular-svg-map.js', {root: __dirname + '/..'});
});

app.use(function(err, req, res, next){
	console.error(err.stack);
	res.send(500, 'Something broke!').end();
});

var port = process.env.PORT || process.env.VMC_APP_PORT || 80;
var server = app.listen(port, function() {
	console.log('Web interface listening on port', port);
});
