angular.module('angular-svg-map', ['ng-collection-assistant'])
.directive('svgMap', function() {
	return {
		scope: {
			config: '=', // Configuration settings object (see $scope.defaults for details)
			regions: '=', // Array of regions (see $scope.drawRegion)
			markers: '=', // Array of markers (see $scope.drawMaker)
		},
		restrict: 'AE',
		template: // {{{
			'<svg id="canvas">' +
			'	<defs>' +
			'		<pattern id="smallGrid" ng-attr-width="{{config.grid.small}}" ng-attr-height="{{config.grid.small}}" patternUnits="userSpaceOnUse">' +
			'			<path ng-attr-d="M {{config.grid.small	}} 0 L 0 0 0 {{config.grid.small}}" fill="none" stroke="gray" stroke-width="0.5"/>' +
			'		</pattern>' +
			'		<pattern id="grid" ng-attr-width="{{config.grid.large}}" ng-attr-height="{{config.grid.large}}" patternUnits="userSpaceOnUse">' +
			'		<rect ng-attr-width="{{config.grid.large}}" ng-attr-height="{{config.grid.large}}" fill="url(#smallGrid)"/>' +
			'			<path ng-attr-d="M {{config.grid.large}} 0 L 0 0 0 {{config.grid.large}}" fill="none" stroke="gray" stroke-width="1"/>' +
			'		</pattern>' +
			'	</defs>' +
			'</svg>', // }}}
		controller: function($scope, collectionAssistant) {
			// Parse config {{{
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
					strokeWidth: 0.8, // stroke width
					fill: null, // fill colour
					fillOpacity: 0.5, // fill opacity
					strokeOpacity: 1, // stroke opacity
					radius: 1 // default radius for circles
				},

				grid: {
					small: 10,
					large: 100,
				},

				background: { // Styles for map background
					grid: true, // Draw (or do not draw grid)
					fill: '#FFF', // Background colour
					stroke: '#FFF', // Border colour
					strokeWidth: 1, // Border width
				},

				events: { // Mouse event callbacks
					click: null,
					dblclick: null,
					mouseup: null,
					mousedown: null,
					mousemove: null,
					mouseout: null,
					mouseover: null,
				},

				markers: {
					dateParsing: ['HHmm', 'YYYY-MM-DD HH:mm'],
				},
			};

			// Settings that should not be overridden by user configuration
			$scope.hardDefaults = {
				zoom: {
					min: 1,
				},
				map: { // Map dimensions
					height: 0,
					width: 0
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
					height: "100%",
					width: "100%"
				})

			// SVG where map is shown
			$scope.zoomArea = $scope.svg
				.svg()
				.attr({
					id: 'zoom-area',
					x: 0,
					y: 0
				});

			// Remove "Created with SNAP" descriptions. It is annoying
			Snap.selectAll('desc').remove();

			// Main layer
			$scope.layer = $scope.zoomArea
				.group()
				.attr('id', 'layer')
				.transform(Snap.matrix());

			// Group for background info
			$scope.background = $scope.layer
				.group()
				.attr('id', 'background');

			// Contour styles
			$scope.background
				.rect(0, 0, '100%', '100%')
				.attr('fill', $scope.config.background.fill)
				.attr('stroke', $scope.config.background.stroke)
				.attr('stroke-width', $scope.config.background.strokeWidth)

			// Grid
			if ($scope.config.background.grid) {
				$scope.background
					.rect(0, 0, '100%', '100%')
					.attr('fill', "url(#grid)")
			}

			// Container for regions (e.g., countries). Should appear
			// before the container with map markers, so markers do not
			// appear below countries
			$scope.svgRegions = $scope.layer
				.group()
				.attr({id: 'regions'})

			// Container for markers -- SVG icons that appea on a map and can be moved around
			$scope.svgMarkers = $scope.layer
				.group()
				.attr({id: 'markers'})
			// }}}

			// .drawRegion() {{{
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
					var element = null;
					if (region.path) {
						element = $scope.svg.path()
							.attr('d', region.path);
					} else if (region.circle) {
						element = $scope.svg.circle()
							.attr({
								cx: region.circle[0],
								cy: region.circle[1],
								r: region.radius || $scope.config.region.radius
							});
					}

					element.data(region)

					svg = $scope.svg
						.group(element)
						.attr('id',region.code)
						.append(element);

					$scope.svgRegions.append(svg);
				}

				svg.attr({
					fill: region.fill ||  $scope.config.region.fill || $scope.randomColor(),
					stroke: region.stroke || $scope.config.region.stroke,
					strokeWidth: region.strokeWidth || $scope.config.region.strokeWidth,
					fillOpacity: region.fillOpacity || $scope.config.region.fillOpacity,
					strokeOpacity: region.strokeOpacity || $scope.config.region.strokeOpacity
				})
			}
			/// }}}

			// .drawMarker() {{{
			/** Draw a marker on a map
			 * {
			 *	 id: <unique id>
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
				var svg = Snap('#' + item.id + ' > svg');

				if (!svg) {
					// Doesn't exist yet - load it and call this func back
					svg = $scope.svg
						.group()
						.attr('id', item.code);

					return Snap.load(item.icon, function(xml) {
						$scope.svgMarkers.append(svg);
						var newItem = svg.append(xml);
						newItem.attr({id: item.id});
						$scope.drawMarker(item);
					});
				}

				// Simple X, Y position
				if (item.x && item.y) {
					svg.attr({
						x: item.x,
						y: item.y,
					});
				} else if (item.positions) {
					var previousPosition, nextPosition;
					item.positions.some(function(position) {
						if (moment(position.at, $scope.config.markers.dateParsing).isAfter(moment())) {
							nextPosition = position;
							return true;
						} else {
							previousPosition = position;
						}
					});
					if (!nextPosition) {
						console.log('FIXME: Outside boundries of marker!');
					} else {
						var startEpoc = moment(previousPosition.at, $scope.config.markers.dateParsing).unix();
						var endEpoc = moment(nextPosition.at, $scope.config.markers.dateParsing).unix();;
						var percentAlong = startEpoc / endEpoc;

						svg.attr({
							x: Math.floor(previousPosition.x + ((nextPosition.x - previousPosition.x) * percentAlong)),
							y: Math.floor(previousPosition.y + ((nextPosition.y - previousPosition.y) * percentAlong)),
						});

						if (previousPosition.r) {
							var matrix = new Snap.Matrix(1,0,0,1,100,100);
							var bbox = svg.getBBox();
							matrix.rotate(previousPosition.r, bbox.cx, bbox.cy);
							svg.attr('transform', matrix);
						}
					}
				} else if (item.animate) { // Legacy animation transformations
					var start = [item.x, item.y];
					if (svg.matrix)
						start = [svg.matrix.e, svg.matrix.f];

					Snap.animate(start, item.animate.destination, function (coord) {
						svg.attr({
							x: coord[0],
							y: coord[1],
						})
					}, item.animate.duration, mina[item.animate.easing]);
					item.animate = null;
				}
				
			};
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
					.translate(translation[0], translation[1])

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
				// Note, since scaling is applied to group withing
				// an SVG container that has coordinates, these coordinates
				// have to be taken into account during zoom
				$scope.scale([
					e.x - $scope.zoomArea.attr('x'),
					e.y - $scope.zoomArea.attr('y')
				], scale, $scope.layer)

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

			// Events {{{
			$scope.layer
				.click(function(e, x, y) {
					$scope.$emit('svg-map-click', x, y, Snap(e.target).data());
				})
				.dblclick(function(e, x, y) {
					$scope.$emit('svg-map-dblclick', x, y, Snap(e.target).data());
				})
				.mouseup(function(e, x, y) {
					$scope.$emit('svg-map-mouseup', x, y, Snap(e.target).data());
				})
				.mousedown(function(e, x, y) {
					$scope.$emit('svg-map-mousedown', x, y, Snap(e.target).data());
				})
				.mousemove(function(e, x, y) {
					$scope.$emit('svg-map-mousemove', x, y, Snap(e.target).data());
				})
				.mouseout(function(e, x, y) {
					$scope.$emit('svg-map-mouseout', x, y, Snap(e.target).data());
				})
				.mouseover(function(e, x, y) {
					$scope.$emit('svg-map-mouseover', x, y, Snap(e.target).data());
				})
			// }}}

			// Resizing {{{
			$(window).resize(function(e) {
				$scope.upscaleMap(e);
			});

			// Scale map to fit top-level container (horizontally first)
			$scope.upscaleMap = function(dimension) {
				// Get dimensions of a parent container
				var parWidth = $("#canvas").parent().width(),
					parHeight = $("#canvas").parent().height();

				// Compute height based on the aspect ration
				var width = parWidth;
				var height = parWidth/$scope.map.ratio;

				// Readjust height and width if the height of the parent is too small
				if (parHeight < height) {
					height = parHeight;
					width = height*$scope.map.ratio;
				}

				// Kill scale of regions so it is not in the way
				$scope.svgRegions.attr({transform: ""});
				var bbox = $scope.svgRegions.getBBox();

				// Scale regions container to fit the outer SVG container (zoom-area)
				$scope.scale([0, 0], width/bbox.width, $scope.svgRegions);

				// Update dimensions of the inner SVG so it is displayed properly
				bbox = $scope.svgRegions.getBBox();
				$scope.zoomArea.attr({
					width: bbox.width,
					height: bbox.height,
					x: (parWidth - bbox.width)/2,
					y: (parHeight - bbox.height)/2
				});

				// Capture new height and width of the map so zooming
				// knows where the boundaries are
				$scope.map.width = bbox.width;
				$scope.map.height = bbox.height;
			};
			// }}}

			// Watchers {{{
			var regionsUnwatch = $scope.$watchCollection('regions', function(regions) {
				// Assume that the initial load of regions is atomic (well, ish)
				// Also, assume that regions come as an array of paths, that is,
				// draw will be synchronous, otherwise draw need to return some notion
				// of draw being completed. This is required to "upscale" the map
				// to fit the top-level container
				if (!regions || !regions.length) return false;

				// During initial load: draw each region
				_.forEach(regions, $scope.drawRegion);

				// Get map width/height ratio
				var bbox = $scope.svgRegions.getBBox();
				$scope.map.ratio = bbox.width/bbox.height;

				// Scale map to fit top-level container
				$scope.upscaleMap();
				// Unregister previous watch ...
				regionsUnwatch();

				// ... and set up deep watch of all elements of $scope.regions
				$scope.$watch('regions', function(newV, oldV) {
					collectionAssistant(newV, oldV)
						.indexBy('code')
						.deepComparison()
						.on('new', $scope.drawRegion)
						.on('deleted', $scope.drawRegion)
						.on('update', $scope.drawRegion);
				}, true)
			})

			var markersUnwatch = $scope.$watchCollection('markers', function(markers) {
				if (!markers || !markers.length) return;

				_.forEach(markers, $scope.drawMarker);

				markersUnwatch();

				$scope.$watch('markers', function(newV, oldV) {
					collectionAssistant(newV, oldV)
						.indexBy('id')
						.deepComparison()
						.on('new', $scope.drawMarker)
						.on('deleted', $scope.drawMarker)
						.on('update', $scope.drawMarker);
				}, true)
			});
			// }}}
		}
	}
});
