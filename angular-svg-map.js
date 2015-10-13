angular.module('angular-svg-map', ['ng-collection-assistant'])
.directive('svgMap', function() {
	return {
		scope: {
			regions: '=', // Array or regions (see $scope.drawRegion for details of region structure)
			config: '='   // Configuration settings object (see $scope.defaults for details)
		},
		restrict: 'AE',
		template: // {{{
			'<svg id="canvas">' +
			'	<defs>' +
			'		<pattern id="smallGrid" ng-attr-width="{{ config.grid.small }}" ng-attr-height="{{ config.grid.small }}" patternUnits="userSpaceOnUse">' +
			'			<path ng-attr-d="M {{ config.grid.small	}} 0 L 0 0 0 {{ config.grid.small }}" fill="none" stroke="gray" stroke-width="0.5"/>' +
			'		</pattern>' +
			'		<pattern id="grid" ng-attr-width="{{ config.grid.large }}" ng-attr-height="{{ config.grid.large }}" patternUnits="userSpaceOnUse">' +
			'		<rect ng-attr-width="{{ config.grid.large }}" ng-attr-height="{{ config.grid.large }}" fill="url(#smallGrid)"/>' +
			'			<path ng-attr-d="M {{ config.grid.large }} 0 L 0 0 0 {{ config.grid.large }}" fill="none" stroke="gray" stroke-width="1"/>' +
			'		</pattern>' +
			'	</defs>' +
			'</svg>', // }}}
		controller: function($scope, collectionAssistant) {
			// Configuration {{{
	 		if (!$scope.config) $scope.config = {};
			if (!$scope.regions) $scope.regions = [];

			// Default settings
			$scope.defaults = {
				zoom: {
					min: 1, // Minimal zoom
					max: 10, // Maximal zoom
					step: 0.2 // Zoom step
				},

				// Common configurations per map region. Over-ridden by
				// same setting in regions (if provided)
				region: {
					stroke: 'black', // colour
					strokeWidth: 1, // stroke width
					fill: null, // fill colour
					scale: 1, // scale factor
				},

				grid: {
					small: 10,
					large: 100,
				},

				background: { // Styles for map background
					grid: true, // Draw (or do not draw grid)
					fill: '#DCDCDC', // Background colour
                    stroke: 'black', // stroke colour
					strokeWidth: 1 // stroke width
				},

				events: { // Mouse event callbacks
					click: null,
					dblclick: null,
					mouseup: null,
					mousedown: null,
					mousemove: null,
					mouseout: null,
					mouseover: null,
				}
			};

			// Settings that should not be overridden by user configuration
			$scope.hardDefaults = {
				zoom: {
					min: 1,
				},
				map: { // Map dimensions
					height: "100%",
					width: "100%"
				}
			}

			// Apply user-specified settings
			_.defaultsDeep($scope.config, $scope.defaults);
			_.merge($scope.config, $scope.hardDefaults);
			// }}}

			// Config shortcuts {{{
			$scope.map = $scope.config.map;
			// }}}

			// Utils {{{
			/** Generate random RGB colour */
			$scope.randomColor = function() {
				var colors = [ _.random(0,255), _.random(0,255), _.random(0,255) ];
				return 'RGB(' + colors.join(',') + ')';
			}

			/** Recompute bounding box of an element using a transformation matrix.
			 * If a matrix is not gien, the inverse of a matrix of element is used */
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

			// Stripped out version of d3.svg.transform to facilitate specification of values of transform attribute
			// Copyright (c) 2013 Erik Cunningham, Spiros Eliopoulos
			// https://github.com/trinary/d3-transform
			function d3transform(chain) {
				var transforms = [];
				if (chain !== undefined)
					transforms.push(chain);

				function push(kind, args) {
					var n = args.length;
					transforms.push(function() {
						return kind + '(' + (n == 1 && typeof args[0] == 'function'
							? args[0].apply(this, arr(arguments)) : args) + ')';
					});
				};

				function arr(args) {
					return Array.prototype.slice.call(args);
				}

				var my = function() {
					var that = this,
						args = arr(arguments);

					return transforms.map(function(f) {
						return f.apply(that, args);
					}).join(' ');
				};

				['translate', 'rotate', 'scale', 'matrix', 'skewX', 'skewY'].forEach(function(t) {
					my[t] = function() {
						push(t, arr(arguments));
						return my;
					};
				});
				return my;
			};
			// }}}

			// SVG canvas {{{
			$scope.svg = Snap("#canvas") // Main SVG canvas
				.attr({
					height: $scope.map.height,
					width: $scope.map.width,
                    fill: 'green'
				})

			// Main layer (a group under canvas)
			$scope.layer = $scope.svg.group().attr('id', 'layer')
			$scope.layer.transform(Snap.matrix());

			$scope.zoomArea = $scope.svg
				.group()
				.attr({id: 'zoom-area'})
			$scope.layer.append($scope.zoomArea);

			// Contour styles
			$scope.background = $scope.zoomArea
				.rect(0, 0, '100%', '100%')
				.attr('fill', $scope.config.background.fill)
				.attr('stroke', $scope.config.background.stroke)
				.attr('stroke-width', $scope.config.background.strokeWidth)
				.attr('id', 'background')

			// Grid
			if ($scope.config.background.grid) {
			    $scope.grid = $scope.zoomArea
			        .rect(0, 0, '100%', '100%')
			        .attr('fill', "url(#grid)")
			        .attr('id', 'grid')
			}

			// Container for regions (e.g., countries). Should appear
			// before the container with map markers, so markers do not
			// appear below countries
			$scope.svgRegions = $scope.svg
				.group()
				.attr({id: 'regions'})
			$scope.zoomArea.append($scope.svgRegions);

			// Container for markers -- SVG icons that appea on a map
			// and can be moved around
			$scope.svgMarkers = $scope.svg
				.group()
				.attr({id: 'markers'})
			$scope.zoomArea.append($scope.svgMarkers);

			/** Draw a region on a map. Region is a static closed path that
			 *   outlines a specific map area (e.g., country, island etc).
			 * {
			 *	 code: <unique id>
			 *	 path: <SVG path specification>
			 *	 fill: <CSS fill colour specification>
			 *	 stroke: <stroke width>
			 * }
			*/
			$scope.drawRegion = function(region) {
				var svg = Snap('#' + region.code);
				if (!svg) {
					var path = $scope.svg.path()
						.attr('d', region.path)
						.data(region)

				 	svg = $scope.svg
						.group(path)
						.attr('id',region.code)
						.append(path);

					$scope.svgRegions.append(svg);
				}

				svg.attr({
					'fill': region.fill ||  $scope.config.region.fill || $scope.randomColor(),
					'stroke': region.stroke || $scope.config.region.stroke,
					'stroke-width': region.strokeWidth || $scope.config.region.strokeWidth
				})
			}
            /// }}}

            // Markers and regions {{{
			/** Draw a marker on a map
			 * {
			 *	 code: <unique id>
			 *	 icon: path to SVG file
			 *	 fill: <CSS fill colour specification>
			 *	 stroke: <stroke width>
             *	 animate: {
             *	    destination: [X, Y] // Destination point on a map
             *	    duration: Number, // Duration in milliseconds required to reach the destination point
             *	    callback: Function // Callback executed after transformation stops
             *	 }
			 * }
			*/
			$scope.drawMarker = function(item) {
				var svg = Snap('#' + item.code);
				if (!svg) {
                    svg = $scope.svg
                        .group()
                        .attr('id', item.code);

					Snap.load(item.icon, function(xml) {
						$scope.svgMarkers.append(svg);
						svg.append(xml);
                        $scope.drawMarker(item);
                        svg.drag();
					})
				} else {
                    // Enable animation transformations
                    if (item.animate) {
                        var start = [0, 0];
                        if (svg.matrix)
                            start = [svg.matrix.e, svg.matrix.f];

                        Snap.animate(start, item.animate.destination, function (coord) {
                            svg.attr({
                                transform: d3transform().translate(coord[0], coord[1])()
                            })
                        }, item.animate.duration, item.animate.easing, item.animate.callback);
                        item.animate = null;
                    }
				}
			}

            /** Draw a svg representation of a region or a marker */
			$scope.drawItem = function(item) {
				var func = (item.icon) ? $scope.drawMarker : $scope.drawRegion;
				func(item);
			}
            // }}}

			// Zoom {{{
			// Scale at a givent coordinate
			$scope.scale = function(point, factor, element) {
				// If matrix is undefined (element is not transformed)
				// create a matrix with no transformations
				if (!element.matrix)
					element.matrix = Snap.matrix();

				// Translate given point into the point without current
				// transformations  by reverting transformations of the
				// "current" matrix
				var unscaled = [
					element.matrix.invert().x(point[0], point[1]),
					element.matrix.invert().y(point[0], point[1])
				];

				// Compute translation for the unscaled point
				// This will bring the region to the "unscaled" coordinates
				var translation = [
					(point[0] - unscaled[0]*factor)/factor,
					(point[1] - unscaled[1]*factor)/factor
				];

				// Create transform string
				var transform = d3transform()
					.scale(factor)
					.translate(translation[0], translation[1]);

				// Run transformations
				element.transform(transform());
			}

			/** Zoom layer. Bound to scroll events */
			$scope.zoom = function(e) {
				// Layer's bounding box before transformations
				var origBox = $scope.getBBox($scope.layer);

				// Zoom configuration shortcuts
				var step = $scope.config.zoom.step;
				var min = $scope.config.zoom.min;
				var max = $scope.config.zoom.max;

				// Current scale factor
				var scale = $scope.layer.matrix.a;

				// New scale factor
				scale += (e.wheelDelta > 0) ? step : - step;
				scale = (scale > max) ? max :
					(scale < min) ? min : scale

				// Transform layer applying new scale factor
				$scope.scale([e.x, e.y], scale, $scope.layer)

				var box = $scope.layer.getBBox();
				var matrix = $scope.layer.matrix;

				// Adjust map if it has gobe off the visible area
				if (origBox.x - box.x < 0)
					matrix.e += origBox.x - box.x;
				if (origBox.y - box.y < 0)
					matrix.f += origBox.y - box.y;

				if (box.x2 - origBox.x2 < 0)
					matrix.e += origBox.x2 - box.x2;
				if (box.y2 - origBox.y2 < 0)
					matrix.f += origBox.y2 - box.y2;

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
				function(x,y) { // Drag start
                    $scope.layer.attr('cursor','move');
					$scope.lastmove = [x,y];
				},
				function(x,y) { // Drag stop
                    $scope.layer.attr('cursor','default');
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

			$(window).resize(function(e) {
				$scope.upscaleMap(e);
			});

			/** Scale map to fit top-level container (horizontal) */
			$scope.upscaleMap = function(dimension) {
				var parWidth = $("#canvas").parent().width(),
				    parHeight = $("#canvas").parent().height();

                var width = parWidth;
                var height = parWidth/$scope.map.ratio;

                if (parHeight < height) {
                    height = parHeight;
                    width = height*$scope.map.ratio;
                }

                // Kill scale of regions so it is not in the way
                $scope.svgRegions.attr({transform: ""});
				var bbox = $scope.svgRegions.getBBox();

				var scaleFactor = width/bbox.width;
				$scope.scale([0, 0], scaleFactor, $scope.svgRegions);

				bbox = $scope.svgRegions.getBBox();

				var matrix = $scope.svgRegions.matrix.translate(
                    ((parWidth - bbox.width)/2)/scaleFactor,
                    ((parHeight - bbox.height)/2)/scaleFactor
                );
				$scope.svgRegions.transform(matrix)

                var attr = _.pick($scope.svgRegions.getBBox(), ['x','y','width','height'])
                $scope.background.attr(attr);
                $scope.grid.attr(attr);
			}

			// Watchers {{{
			var unregister = $scope.$watchCollection('regions', function(regions) {
				// Assume that the initial load of regions is atomic (well, ish)
				// Also, assume that regions come as an array of paths, that is,
				// draw will be synchronous, otherwise draw need to return some notion
				// of draw being completed. This is required to "upscale" the map
				// to fit the top-level container
				if (regions.length) {
					// During initial load: draw each region
					_.forEach(regions, $scope.drawItem);

                    // Get map width/height ratio
                    var bbox = $scope.svgRegions.getBBox();
                    $scope.map.ratio = bbox.width/bbox.height;

                    // Scale map to fit top-level container
					$scope.upscaleMap();
					// Unregister previous watch ...
					unregister();

					// ... and set up deep watch of all elements of $scope.regions
					$scope.$watch('regions', function(newV, oldV) {
						collectionAssistant(newV, oldV)
							.indexBy('code')
							.deepComparison()
							.on('new', $scope.drawItem)
							.on('deleted', $scope.drawItem)
							.on('update', $scope.drawItem);
					}, true)
				}
			})
			// }}}
		}
	}
});
