app.directive('svgMap', function() {
	return {
		scope: {
			regions: '=',
            config: '='
		},
		restrict: 'AE',
		template:
			'<svg id=canvas>' +
			'	<defs>' +
			'		<pattern id="smallGrid" ng-attr-width="{{ config.grid.small }}" ng-attr-height="{{ config.grid.small }}" patternUnits="userSpaceOnUse">' +
			'			<path ng-attr-d="M {{ config.grid.small	}} 0 L 0 0 0 {{ config.grid.small }}" fill="none" stroke="gray" stroke-width="0.5"/>' +
			'		</pattern>' +
			'		<pattern id="grid" ng-attr-width="{{ config.grid.large }}" ng-attr-height="{{ config.grid.large }}" patternUnits="userSpaceOnUse">' +
			'		<rect ng-attr-width="{{ config.grid.large }}" ng-attr-height="{{ config.grid.large }}" fill="url(#smallGrid)"/>' +
			'			<path ng-attr-d="M {{ config.grid.large }} 0 L 0 0 0 {{ config.grid.large }}" fill="none" stroke="gray" stroke-width="1"/>' +
			'		</pattern>' +
			'	</defs>' +
			'</svg>',
		controller: function($scope, collectionAssistant, $timeout) {
			$scope.regions = []; // Array of regions

			// Configuration {{{
	 		if (!$scope.config)
                $scope.config = {};

            $scope.defaults = {
				map: { // Map dimensions
					height: 450,
					width: 900
				},
				// Zoom parameters
                zoom: {
                    min: 1,		// Minimal zoom
                    max: 10,	// Maximal zoom
                    step: 0.2	// Zoom step
                },
				// Common configurations per map region. Over-ridden by
				// same setting in regions (if provided)
				region: {
					stroke: 'black',
					width: 1,
					fill: null,
					scale: 1
				},
				grid: {
					small: 10,
					large: 100
				},
				contour: {
					stroke: 'black',
					width: 4,
					fill: 'none',
					dasharray: "",
					rounded: 0,
				},
				background: {
					grid: true,
					color: '#DCDCDC'
				},
				events: {
					click: null,
					dblclick: null,
					mouseup: null,
					mousedown: null,
					mousemove: null,
					mouseout: null,
					mouseover: null
				}
            };

             _.defaultsDeep($scope.config, $scope.defaults);
			 // }}}

			 // Config shortcuts {{{
			$scope.map = $scope.config.map;
			 // }}}

			// Utils {{{
			/** Generate random RGB colour */
			$scope.randomColor = function() {
				return sprintf("RGB(%d,%d,%d)", _.random(0,255),_.random(0,255),_.random(0,255));
			}

			$scope.getBBox = function(element, matrix) {
				var box = element.getBBox();

				if (!matrix)
					matrix = element.matrix.clone().invert();

				var newbox = {
					x: matrix.x(box.x, box.y),
					y: matrix.y(box.x, box.y),
					x2: matrix.x(box.x2, box.y2),
					y2: matrix.y(box.x2, box.y2),
					cx: matrix.x(box.cx, box.cy),
					cy: matrix.y(box.cx, box.cy)
				};

				newbox.width = newbox.w = newbox.x2 - newbox.x;
				newbox.height = newbox.h = newbox.y2 - newbox.y;
				return newbox;
			}
			// }}}

			// SVG canvas {{{
            $scope.svg = Snap("#canvas")
                .attr({
                    height: $scope.map.height,
                    width: $scope.map.width,
                })

            $scope.layer = $scope.svg.group().attr('id', 'layer')
			$scope.layer.transform(Snap.matrix());

            $scope.contour = $scope.svg
				.rect(0, 0, $scope.map.width, $scope.map.height, $scope.config.contour.rounded, $scope.config.contour.rounded)
				.attr('fill', $scope.config.contour.fill)
				.attr('stroke', $scope.config.contour.stroke)
				.attr('stroke-width', $scope.config.contour.width)
				.attr('stroke-dasharray', $scope.config.contour.dasharray)
				.attr('id', 'contour')

            $scope.backgroundColor = $scope.svg
				.rect(0, 0, $scope.map.width, $scope.map.height, $scope.config.contour.rounded, $scope.config.contour.rounded)
				.attr('fill', $scope.config.background.color)
				.attr('id', 'backgroundColor')
			$scope.layer.append($scope.backgroundColor);

			if ($scope.config.background.grid) {
				$scope.backgroundGrid = $scope.svg
					.rect(0, 0, $scope.map.width, $scope.map.height, $scope.config.contour.rounded, $scope.config.contour.rounded)
					.attr('fill', "url(#grid)")
					.attr('id', 'backgroundGrid')
				$scope.layer.append($scope.backgroundGrid);
			}

			/** Draw or redraw a region on a map */
            $scope.drawRegion = function(region, oldRegion) {
				var path = null,
					pathId = region.code + '-path';
				if (!oldRegion) {
					path = $scope.svg.path()
						.attr('d', region.path)
						.attr('id', pathId)
						.data(region)

				 	var group = $scope.svg
						.group(path)
						.attr('id',region.code)
						.transform('scale(' + $scope.config.region.scale + ')')
						.append(path)
						$scope.layer.append(group);
				} else
					path = Snap('#' + pathId);

				if (!path)
					console.error('Cannot find element by id', pathId)
				else {
					path.attr({
						'fill': region.fill ||  $scope.config.region.fill || $scope.randomColor(),
						'stroke': region.stroke || $scope.config.region.stroke,
						'stroke-width': region.width || $scope.config.region.width
					})
				}
            }

			$scope.eraseRegion = function(region) {
				if (_.get('element.code')) {
					var element = Snap('#' + code);
					if (element)
						element.remove();
					else
						console.error('Cannot find element by id', element.code)
				} else
					console.error('Invalid region', region)
			}
			/// }}}

			// Zoom {{{

			/** Scroll callback */
            $scope.zoom = function(e) {
				// Transformation matrix of the layer
				var matrix = $scope.layer.matrix.clone();

				// Layer's bounding box before transformations
				var origBox = $scope.getBBox($scope.layer);

				// Zoom configuration shortcuts
                var step = $scope.config.zoom.step,
                    min = $scope.config.zoom.min,
                    max = $scope.config.zoom.max;

				// Current scale
				var scale = matrix.a;

				// New scale
                scale += (e.wheelDelta > 0) ? step : - step;
                scale = (scale > max) ? max :
                   (scale < min) ? min : scale

				// Current bounding box of the map
                var box = $scope.layer.getBBox();

				// Set scale transformation via matrix
                matrix.a = scale;
                matrix.d = scale;

				// Centre points of the scaled matrix
				var cx = matrix.x(origBox.cx, origBox.cy),
					cy = matrix.y(origBox.cx, origBox.cy);

				matrix.e -= cx - box.cx;
				matrix.f -= cy - box.cy;

				var x = matrix.x(origBox.x, origBox.y),
					y = matrix.y(origBox.x, origBox.y),
					x2 = matrix.x(origBox.x2, origBox.y2),
					y2 = matrix.y(origBox.x2, origBox.y2)

				if (origBox.x - x < 0)
					matrix.e += origBox.x - x;
				if (origBox.y - y < 0)
					matrix.f += origBox.y - y;

				if (x2 - origBox.x2 < 0)
					matrix.e += origBox.x2 - x2;
				if (y2 - origBox.y2 < 0)
					matrix.f += origBox.y2 - y2;

				$scope.layer.transform(matrix)
            }

			// Setup scroll event listeners
			$scope.svg.node.addEventListener('mousewheel', $scope.zoom);
            $scope.svg.node.addEventListener('DOMMouseScroll', $scope.zoom);
			// }}}

			// Layer pan {{{
			$scope.layer.drag(
				function(dx,dy,x,y,e) {
					var box = $scope.layer.getBBox();
					var move = [
						 x - $scope.lastmove[0],
						 y - $scope.lastmove[1]
					];

					if (box.x + move[0] > 0)
						$scope.layer.matrix.e = 0;
					else if (box.x2 + move[0] <= $scope.map.width)
						$scope.layer.matrix.e =  $scope.map.width - box.width;
					else
						$scope.layer.matrix.e += move[0];

					if (box.y + move[1] > 0)
						$scope.layer.matrix.f = 0;
					else if (box.y2 + move[1] <= $scope.map.height)
						$scope.layer.matrix.f =  $scope.map.height - box.height;
					else
						$scope.layer.matrix.f += move[1];

					$scope.layer.transform($scope.layer.matrix);
					$scope.lastmove = [x,y];
				},
				function(x,y) {
					$scope.lastmove = [x,y];
				}
			);
			// }}}

			// Clicks {{{
			$scope.clickCallback = function(ename,e,x,y) {
				var data = null;
				var element = Snap(e.target);
				if (element)
					data = element.data();

				var callback = $scope.config.events[ename];
				if (_.isFunction(callback))
					callback(x,y,data);
			}

			$scope.setLayerEventCallback = function(ename) {
				$scope.layer[ename](_.partial($scope.clickCallback,ename));
			}

			$scope.setLayerEventCallback('click');
			$scope.setLayerEventCallback('dblclick');
			$scope.setLayerEventCallback('mouseup');
			$scope.setLayerEventCallback('mousedown');
			$scope.setLayerEventCallback('mousemove');
			$scope.setLayerEventCallback('mouseout');
			$scope.setLayerEventCallback('mouseover');
			// }}}

			// Watchers {{{
			$scope.regionWatcherPrevious = null;
			$scope.$watch('regions', function(newV, oldV) {
				var ca = collectionAssistant(newV, oldV)
					.indexBy('code')
					.deepComparison()
					.on('new', $scope.drawRegion)
					.on('deleted', $scope.eraseRegion)
					.on('update', $scope.drawRegion);
				$scope.regionWatcherPrevious = newV;
			}, true)
			// }}}
		}
	}
});
