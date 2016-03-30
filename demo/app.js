var app = angular.module('app', [
	'angular-svg-map'
]);

app.controller('demoController', function($scope, $http, collectionAssistant, $timeout) {
	$scope.mapRegions = [];
	$scope.mapConfig = {
		background: {
			grid: false,
		},
	};

	$scope.$on('svg-map-click', function(e, x, y, data) {
		console.log('Click on map at', x, y, 'with data', data);
	});

	$scope.$on('svg-map-mousemove', function(e, x, y, data) {
		// console.log('Move over', x, y);
	});

	$http.get('../data/world.json').success(function(data) {
		// Load the world map ...
		$scope.mapRegions = data;

		// Load cities
		$http.get('../data/cities.json').success(function(data) {
			_.each(data, function(city) { $scope.mapRegions.push(city); })
		});

		// Load markers
		$http.get('../data/markers.json').success(function(data) {
			_.each(data, function(marker) { $scope.mapRegions.push(marker); })
		});
	});
});
