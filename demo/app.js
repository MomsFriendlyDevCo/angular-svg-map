var app = angular.module('app', [
	'angular-svg-map'
]);

app.controller('demoController', function($scope, $http, collectionAssistant, $timeout) {
	$scope.mapConfig = {
		background: {
			grid: false,
		},
	};
	$scope.mapRegions;
	$scope.mapMarkers;

	$scope.$on('svg-map-click', function(e, x, y, data) {
		console.log('Click on map at', x, y, 'with data', data);
	});

	$scope.$on('svg-map-mousemove', function(e, x, y, data) {
		// console.log('Move over', x, y);
	});


	// Load the map
	$http.get('../data/world.json').success(function(data) {
		$scope.mapRegions = data;
	});

	// Load markers
	$http.get('../data/markers.json').success(function(data) {
		$scope.mapMarkers = data;
	});
});
