var app = angular.module('app', [
	'ng-collection-assistant'
]);

app.controller('demoController', function($scope, $http, collectionAssistant, $timeout) {
	$scope.mapRegions = [];
	$scope.mapConfig = {
		contour: {
			stroke: 'gray',
			width: 10
		},
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
	});

	// ... and conquer the world!
	$scope.redInvasion = function(freq) {
		$timeout(function(){
			if ($scope.mapRegions.length) {
				var region = $scope.mapRegions[_.random(0, $scope.mapRegions.length - 1)];
				if (region.code != 'US' && region.code != 'RU') {
					var fill = 'red';
					fill = (region.fill != 'red') ? 'red' : 'blue';
					region.fill = fill
				}
			}
			$scope.redInvasion(freq);
		},freq)
	};
	$scope.redInvasion(200);
});
