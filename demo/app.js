var app = angular.module('app', [
	'angular-svg-map'
]);

app.controller('demoController', function($scope, $http, collectionAssistant, $timeout) {
	$scope.mapRegions = [];
	$scope.mapConfig = {
		events: {
			click: function(x,y,data) {
				//console.log('Mouse click at position', [x,y], "width data bound:",data);
			},
			dblclick: function(x,y,data) {
				//console.log('Double click at position', [x,y]);
			},
		},
	};

	$http.get('../data/world.json').success(function(data) {
		// Let's load the world's map ...
		$scope.mapRegions = data;
		// Load cities
		$http.get('../data/cities.json').success(function(data) {
			_.each(data, function(city) { $scope.mapRegions.push(city); })
		});
		// Load markers
		$http.get('../data/markers.json').success(function(data) {
			_.each(data, function(marker) { $scope.mapRegions.push(marker); })
		})
	});
});
