
L.QuadCluster = {
    version: '0.0.1'
};

/**
 *  @overview API to create quadtrees and perform aggregation on them.
 *  @author Christopher Dudley <chris@terainsights.com>
 *  @copyright Tera Insights, LLC 2014
 */

/* global d3:true, L:true */

(function() {

/**
 *  Creates a new QuadTree generator. The generator can be configured with
 *  with an X accessor, Y accessor, and extent. The generator has defaults
 *  for all of these values.
 */
L.QuadCluster.Tree = function() {
    /*
     *  The X position accessor. By default, for a given value `d`, the
     *  accessor returns `d.x`.
     */
    var _x = function(d) { return d.x; };
    /*
     *  The Y position accessor. By default, for a given value `d`, the
     *  accessor returns `d.y`.
     */
    var _y = function(d) { return d.y; };

    /*
     *  The extent of the area covered by the points. By default, it is calculated
     *  from the points that the tree is initialized with.
     */
    var _extent = null;

    function calculateExtent(points) {
        // Special case for no points
        if( points.length === 0 ) {
            throw new Error('Must specify an extent if no points given during initialization');
        }

        var lower = [Infinity, Infinity];
        var upper = [-Infinity, -Infinity];

        points.forEach(function(d) {
            var x = _x(d);
            var y = _y(d);

            lower[0] = Math.min(x, lower[0]);
            lower[1] = Math.min(y, lower[1]);

            upper[0] = Math.max(x, upper[0]);
            upper[1] = Math.max(y, upper[1]);
        });

        return [lower, upper];
    }

    function squarifyExtent(extent) {
        var x1 = extent[0][0];
        var y1 = extent[0][1];
        var x2 = extent[1][0];
        var y2 = extent[1][1];

        var dx = x2 - x1;
        var dy = y2 - y1;

        // Algorithm taken from D3's quadtree.js
        if( dx > dy ) y2 = y1 + dx;
        else x2 = x1 + dy;

        return [[x1, y1], [x2, y2]];
    }

    /*
     *  The tree factory function.
     */
    var _gen = function(points) {
        var extent = _extent;
        if( !extent ) {
            extent = calculateExtent(points);
        }
        extent = squarifyExtent(extent);
        return createTree(points, _x, _y, extent);
    };


    /*
     *  Gets or sets the X value accessor.
     */
    _gen.x = function(_) {
        if( arguments.length === 0 ) {
            return _x;
        }

        _x = _;
        return _gen;
    };

    /*
     *  Gets or sets the Y value accessor.
     */
    _gen.y = function(_) {
        if( arguments.length === 0 ) {
            return _y;
        }

        _y = _;
        return _gen;
    };

    /*
     *  Gets or sets the extent.
     */
    _gen.extent = function(_) {
        if( arguments.length === 0 ) {
            return _extent;
        }

        _extent = _;
        return _gen;
    };

    return _gen;
};

/*
 *  Creates a new quadtree from a set of points.
 *
 *  Each node has the following properties:
 *
 *  id - a number unique for each node in the tree.
 *  depth - the depth in the tree at which the node resides (root is 0).
 *  bounds - A LatLngBounds that gives the area the node covers
 *  parentID - the id of the parent node, if any.
 *  nodes - a sparse array of the four child nodes in order: bottom-left, bottom-right, top-left, top-right
 *  leaf - a boolean indicating whether the node is a leaf (true) or internal (false)
 *  point - the point associated with this node, if any (can apply to leaves or internal)
 *  x - the x-coordinate of the associated point, if any
 *  y - the y-coordinate of the associated point, if any
 *  active - boolean whether or not the node is active by the most recent filter
 *  mass - the number of active points covered by this node
 *  center - the gravity center of the node
 */
function createTree(points, x, y, extent) {
    var _factory = d3.geom.quadtree()
        .x(x)
        .y(y)
        .extent(extent);

    var _x1 = extent[0][0];
    var _y1 = extent[0][1];
    var _x2 = extent[1][0];
    var _y2 = extent[1][1];

    var _root = _factory(points);

    var _tree = { };

    var _nextID = 1;

    /*
     *  Perform aggregation on the tree.
     */
    _tree.aggregate = function(aggregate) {
        var ret = aggregateNode(aggregate, _root, _x1, _y1, _x2, _y2);

        if( ret === null ) {
            ret = aggregate.initialize();
        }

        return ret;
    };

    /*
     *  Add a new node to the tree.
     */
    _tree.add = function(point) {
        _root.add(point);
        // TODO: Be smarter in how we update the nodes.
        enhanceNode(_root, 0, _x1, _y1, _x2, _y2);
    };

    /*
     *  Add multiple nodes at once.
     */
    _tree.addArray = function(arr) {
        for( var i = 0; i < arr.length; i++ ) {
            _root.add(arr[i]);
        }

        enhanceNode(_root, 0, _x1, _y1, _x2, _y2);
    };

    /*
     *  Returns the root node.
     */
    _tree.root = function() {
        return _root;
    };

    _tree.clear = function() {
        _root = _factory();
        _nextID = 1;
        enhanceNode(_root, 0, _x1, _y1, _x2, _y2);

        return _tree;
    };

    /*
     *  Returns the overall bounds of the points contained within the tree.
     */
    _tree.bounds = function() {
        var bounds = new L.LatLngBounds();
        bounds.extend(_root.bounds);
        return bounds;
    };

    function computeGravityCenter(node) {
        if( ! node.active ) {
            node.mass = 0;
            node.center = L.latLng(0, 0);
            return;
        }

        var cX = 0;
        var cY = 0;

        var totalPoints = 0;
        for( var i = 0; i < 4; i++ ) {
            if( node.nodes[i] && node.nodes[i].active ) {
                var nX = node.nodes[i].center.lng;
                var nY = node.nodes[i].center.lat;
                var nodePoints = node.nodes[i].mass;
                // Moving average
                var cWgt = totalPoints / (totalPoints + nodePoints);
                var nWgt = nodePoints / (totalPoints + nodePoints);
                cX = (cX * cWgt) + (nX * nWgt);
                cY = (cY * cWgt) + (nY * nWgt);
                totalPoints += nodePoints;
            }
        }

        if( node.point ) {
            cX = (cX * (totalPoints / (totalPoints + 1))) + (node.x / (totalPoints + 1));
            cY = (cY * (totalPoints / (totalPoints + 1))) + (node.y / (totalPoints + 1));
            totalPoints += 1;
        }

        node.mass = totalPoints;
        node.center = L.latLng(cY, cX);
        node.active = totalPoints > 0;
    }

    function getPoints(storageArray) {
        storageArray = storageArray || [];

        // Shortcut for inactive nodes
        if( ! this.active ) {
            return storageArray;
        }

        if( this.point ) {
            storageArray.push(this.point);
        }

        for( var i = 0; i < this.nodes.length; i++ ) {
            if( this.nodes[i] ) {
                this.nodes[i].getPoints(storageArray);
            }
        }

        return storageArray;
    }

    function enhanceNode(node, depth, x1, y1, x2, y2) {
        var sx = (x1 + x2) * 0.5;
        var sy = (y1 + y2) * 0.5;

        var children = node.nodes;

        node.depth = depth;
        node.bounds = L.latLngBounds([[y1, x1], [y2, x2]]);

        if( !node.id ) {
            node.id = _nextID++;
            node.active = true;
        }

        if( children[0] ) { // bottom left child
            enhanceNode(children[0], depth+1, x1, y1, sx, sy);
            children[0].parentID = node.id;
        }

        if( children[1] ) { // bottom right child
            enhanceNode(children[1], depth+1, sx, y1, x2, sy);
            children[1].parentID = node.id;
        }

        if( children[2] ) { // top left child
            enhanceNode(children[2], depth+1, x1, sy, sx, y2);
            children[2].parentID = node.id;
        }

        if( children[3] ) { // top right child
            enhanceNode(children[3], depth+1, sx, sy, x2, y2);
            children[3].parentID = node.id;
        }

        computeGravityCenter(node);

        // Added methods
        node.getPoints = getPoints;
    }

    // Uses the given filter function to determine which nodes are active.
    _tree.filter = function(filterFunc) {
        var agg = L.QuadCluster.Aggregate().finalize(function(state, node) {
            node.active = filterFunc(node);
            computeGravityCenter(node);
            return state;
        })();

        _tree.aggregate(agg);
    };

    function nodeArea(node) {
        var width = Math.abs(node.bounds.getEast() - node.bounds.getWest());
        var height = Math.abs(node.bounds.getNorth() - node.bounds.getSouth());
        return width * height;
    }

    // Returns a cut of the tree where the gravity center of all active nodes
    // whose gravity center fits within `bounds` and cover at most `area`
    _tree.cut = function(bounds, area) {
        bounds = L.latLngBounds(bounds);

        var agg = L.QuadCluster.Aggregate()
            .filter(function(node) {
                if( ! node.active ) {
                    // Node isn't active, skip it.
                    return true;
                }

                if( ! bounds.intersects(node.bounds) ) {
                    // Node isn't in field of view, skip.
                    return true;
                }

                // Always check the root node if it is active and visible.
                if( ! node.parentID ) {
                    return false;
                }

                var nArea = nodeArea(node);
                if( nArea <= (area / 4) ) {
                    // Parent would be good enough.
                    return true;
                }

                return false;
            }).init(function() {
                return [];
            }).merge(function(state, oState) {
                return state.concat(oState);
            }).finalize(function(state, node) {
                // If no children made the cut, then we are the furthest
                // down node that is good enough.
                if( state.length === 0 ) {
                    state.push(node);
                }

                return state;
            })();

        return _tree.aggregate(agg);
    };

    // Perform initial enhancement of nodes
    enhanceNode(_root, 0, _x1, _y1, _x2, _y2);

    return _tree;
}

/**
 *  Performs aggregation on a tree node and its children.
 *
 *  @param {TreeAggregate} aggregate - The aggregate information.
 *  @param {object} node - The tree node.
 *
 *  @returns {*} The aggregate state.
 */
function aggregateNode(aggregate, node) {
    var state = null;
    var childState;

    var children = node.nodes;

    if( !aggregate.filter(node) ) {
        state = aggregate.initialize();
        state = aggregate.accumulate(state, node);

        // Note: d3's quadtree has lower Y values being higher up.
        // We need to take this into account.

        if( children[0] ) { // Bottom left child
            childState = aggregateNode(aggregate, children[0]);
            if( childState !== null ) {
                state = aggregate.merge(state, childState, 0);
            }
        }

        if( children[1] ) { // Bottom right child
            childState = aggregateNode(aggregate, children[1]);
            if( childState !== null ) {
                state = aggregate.merge(state, childState, 1);
            }
        }

        if( children[2] ) { // Top left child
            childState = aggregateNode(aggregate, children[2]);
            if( childState !== null ) {
                state = aggregate.merge(state, childState, 2);
            }
        }

        if( children[3] ) { // Top right child
            childState = aggregateNode(aggregate, children[3]);
            if( childState !== null ) {
                state = aggregate.merge(state, childState, 3);
            }
        }

        state = aggregate.finalize(state, node);
    }

    return state;
}

}());

/**
 *  @overview API for creation of aggregates over quad trees.
 *  @author Christopher Dudley <chris@terainsights.com>
 *  @copyright Tera Insights, LLC 2014
 */

/* global L:true */

(function() {

/**
 *  An object that represents an aggregation over the tree.
 *  @constructor
 */
function TreeAggregate(init, filter, merge, acc, finalize) {
    this.initialize = init;
    this.filter = filter;
    this.merge = merge;
    this.accumulate = acc;
    this.finalize = finalize;
}

/*
 *  Returns a factory that can be used to configure and create new tree
 *  aggregates.
 */
L.QuadCluster.Aggregate = function () {
    var _init = function() { return {}; };
    var _filter = function() { return false; };
    var _acc = function(state) { return state; };
    var _merge = function(state) { return state; };
    var _finalize = function(state) { return state; };

    var _factory = function() {
        return new TreeAggregate(_init, _filter, _merge, _acc, _finalize);
    };

    /*
     *  Gets or sets the state initialization function.
     *
     *  The initialization function should take no arguments and return a
     *  new state for use in the aggregation of the current node.
     *
     *  The default initialization function returns an empty object.
     */
    _factory.init = function(_) {
        if( arguments.length === 0 ) {
            return _init;
        }
        _init = _;
        return _factory;
    };

    /*
     *  Gets or sets the node filtration function.
     *
     *  The node filtration function takes as arguments the current node
     *  and bounding box. The function should return true
     *  if the node should be filtered (skipped).
     *
     *  The function should have the following form:
     *
     *  `filter(node)`
     *
     *  `node` is the current node.
     *
     *  The default filtration function always returns false.
     */
    _factory.filter = function(_) {
        if( arguments.length === 0 ) {
            return _filter;
        }
        _filter = _;
        return _factory;
    };

    /*
     *  Gets or sets the state accumulation function.
     *
     *  The node accumulation function takes the current state, the node
     *  being added, and the bounding box, and returns the new state.
     *  This function is called before child nodes are processed.
     *
     *  The function should have the following form:
     *
     *  `accumulate(state, node)`
     *
     *  `state` is the current state.
     *  `node` is the current node.
     *
     *  The default accumulation function simply returns the current state.
     */
    _factory.accumulate = function(_) {
        if( arguments.length === 0 ) {
            return _acc;
        }
        _acc = _;
        return _factory;
    };

    /*
     *  Gets or sets the state merging function.
     *
     *  The merge function is called after `accumulate`, but before `finalize`.
     *  The merge function will be called exactly once for each existing child.
     *
     *  The merge function should have the following form:
     *
     *  `merge(curState, otherState[, position])`
     *
     *  `curState` is the current state.
     *  `otherState` is the state being merged.
     *  `position` is an integer specifying in what quadrant otherState was built.
     *      It will be one of 4 values:
     *      0 - bottom-left
     *      1 - bottom-right
     *      2 - top-left
     *      3 - top-right
     *
     *  The merge function should return the new state.
     *
     *  The default merge function simply returns the current state.
     */
    _factory.merge = function(_) {
        if( arguments.length === 0 ) {
            return _merge;
        }
        _merge = _;
        return _factory;
    };

    /*
     *  Gets or sets the state finalization function.
     *
     *  The finalization function is called after `accumulate` and all `merge`s.
     *
     *  The function should have the following form:
     *
     *  `finalize(state[, node])`
     *
     *  `state` is the current state.
     *  `node` is the current node.
     *
     *  The finalization function should return the new state.
     *
     *  The default finalization function simply returns the current state.
     */
    _factory.finalize = function(_) {
        if( arguments.length === 0 ) {
            return _finalize;
        }
        _finalize = _;
        return _factory;
    };

    return _factory;
};

}());

/**
 *  @overview Defines a new type of marker that represents a cluster of markers.
 *  @author Christopher Dudley <chris@terainsights.com>
 *  @copyright 2014 Tera Insights, LLC. All Rights Reserved.
 *
 *  Inspired by the MarkerCluster class in Leaflet.markercluster.
 *  Leaflet.markercluster: Copyright 2012 David Leaver
 *                         Licensed via MIT License
 */

/**
 *  A class that represents a group of points.
 */
L.QuadCluster.MarkerCluster = L.Marker.extend({
    initialize: function(group, node) {
        L.Marker.prototype.initialize.call(this, node.center, {icon: this});

        this._group = group;
        this._node = node;

        this._iconNeedsUpdate = true;
    },

    // Creates markers for all of the individual points contained by this cluster.
    getAllChildMarkers: function(storageArray) {
        storageArray = storageArray || [];

        node.getPoints(storageArray);
        return storageArray;
    },

    // Number of points contained by the cluster.
    getChildCount: function() {
        return this._node.mass;
    },

    zoomToBounds: function() {
        var map = this._group._map;

        map.fitBounds(this._node.bounds);
    },

    getBounds: function() {
        var bounds = new L.LatLngBounds();
        bounds.extend(this._node.bounds);
        return bounds;
    },

    _updateIcon: function() {
        this._iconNeedsUpdate = true;
        if( this._icon ) {
            this.setIcon(this);
        }
    },
    createIcon: function() {
        if( this._iconNeedsUpdate ) {
            this._iconObj = this._group.options.iconCreateFunction(this);
            this._iconNeedsUpdate = false;
        }

        return this._iconObj.createIcon();
    },
    createShadow: function() {
        return this._iconObj.createShadow();
    }
});

/**
 *  @overview A layer that automatically clusters markers.
 *  @author Christopher Dudley <chris@terainsights.com>
 *  @copyright 2014 Tera Insights, LLC. All Rights Reserved.
 *
 *  Inspired by the MarkerClusterGroup class in Leaflet.markercluster.
 *  Leaflet.markercluster:  Copyright 2012 Dave Leaver
 *                          Licensed via the MIT License
 */

/**
 *  Extends L.FeatureGroup by clustering the markers it contains.
 */
L.QuadCluster.MarkerClusterGroup = L.FeatureGroup.extend({
    options: {
        /*
         *  A cluster will cover at most a square of size maxClusterSize^2
         *  pixels.
         */
        maxClusterSize: 160,
        iconCreateFunction: null,

    },
    initialize: function(markers, options) {
        L.Util.setOptions(this, options);
        if( !this.options.iconCreateFunction) {
            this.options.iconCreateFunction = this._defaultIconCreateFunction;
        }

        this._featureGroup = L.featureGroup();
        this._featureGroup.on(L.FeatureGroup.EVENTS, this._propagateEvent, this);

        this._nonPointGroup = L.featureGroup();
        this._nonPointGroup.on(L.FeatureGroup.EVENTS, this._propagateEvent, this);

        var treeGen = L.QuadCluster.Tree()
            .x(function(d) { return d.getLatLng().lng; })
            .y(function(d) { return d.getLatLng().lat; });

        this._markers = markers;

        // Ensure each marker has a unique ID
        for( var i = 0; i < this._markers.length; i++ ) {
            L.stamp(this._markers[i]);
        }

        // TODO: Support adding points in after the fact. Would require
        // the bounds to be specified beforehand.
        this._tree = treeGen(markers);
    },

    hasLayer: function(layer) {
        if( !layer ) {
            return false;
        }

        for( var i = 0; i < this._markers.length; i++ ) {
            if( layer === this._markers[i] ) {
                return true;
            }
        }

        return this._nonPointGroup.hasLayer(layer);
    },

    addLayer: function(layer) {
        if( layer instanceof L.LayerGroup ) {
            var arr = [];
            for( var i in layer._layers ) {
                arr.push(layer._layers[i]);
            }
            return this.addLayers(arr);
        }

        // Don't cluster on non-point data
        if( ! layer.getLatLng ) {
            this._nonPointGroup.addLayer(layer);
            return this;
        }

        // Don't add duplicates
        if( this.hasLayer(layer) ) {
            return this;
        }

        L.stamp(layer);
        this._markers.push(layer);
        this._tree.add(layer);

        this._refreshVisible();

        return this;
    },

    addLayers: function(layers) {
        for( var i = 0; i < layers.length; i++ ) {
            var layer = layers[i];

            if( ! layer.getLatLng ) {
                this._nonPointGroup.addLayer(layer);
                continue;
            }

            if( this.hasLayer(layer) ) {
                continue;
            }

            this._markers.push(layer);
            this._tree.add(layer);
        }

        this._refreshVisible();
        return this;
    },
    removeLayer: function(layer) {
        // Requires the tree to be completely rebuilt if layer being removed is
        // clustered.
        throw new Error("removeLayer not yet implemented.");
    },

    // Overrides LayerGroup.eachLayer
    eachLayer: function(method, context) {
        // TODO: Probably need to iterate over all layers, not just visible.
        this._featureGroup.eachLayer(method, context);
        this._nonPointGroup.eachLayer(method, context);

        return this;
    },

    // Overrides LayerGroup.getLayers
    getLayers: function() {
        var layers = [];
        this.eachLayer(function(d) {
            layers.push(d);
        });
        return layers;
    },

    // Overrides LayerGroup.getLayer
    getLayer: function(id) {
        if( this._featureGroup.hasLayer(id) ) {
            return this._featureGroup.getLayer(id);
        }

        if( this._nonPointGroup.hasLayer(id) ) {
            return this._nonPointGroup.getLayer(id);
        }

        for( var i = 0; i < this._markers.length; i++ ) {
            if( L.stamp(this._markers[i]) === id ) {
                return this._markers[i];
            }
        }

        return null;
    },

    // Overrides  LayerGroup.clearLayers
    clearLayers: function() {
        this._markers = [];
        this._tree.clear();

        this._featureGroup.clearLayers();
        this._nonPointGroup.clearLayers();

        return this;
    },

    // Overrides FeatureGroup.onAdd
    onAdd: function(map) {
        this._map = map;

        this._refreshVisible();

        this._featureGroup.onAdd(map);
        this._nonPointGroup.onAdd(map);

        this._map.on('zoomend', this._zoomEnd, this);
        this._map.on('moveend', this._moveEnd, this);
    },

    // Overrides FeatureGroup.onRemove
    onRemove: function(map) {
        map.off('zoomend', this._zoomEnd, this);
        map.off('moveend', this._moveEnd, this);

        this._featureGroup.onRemove(map);
        this._nonPointGroup.onRemove(map);

        this._map = null;
    },

    _getExpandedVisibleBounds: function() {
        var map = this._map,
            bounds = map.getBounds(),
            sw = bounds.getSouthWest(),
            ne = bounds.getNorthEast(),
            //latDiff = L.Browser.mobile ? 0 : Math.abs(sw.lat - ne.lat),
            //lngDiff = L.Browser.mobile ? 0 : Math.abs(sw.lng - ne.lng);
            latDiff = 0,
            lngDiff = 0;

        return L.latLngBounds(
            L.latLng(sw.lat - latDiff, sw.lng - lngDiff),
            L.latLng(ne.lat + latDiff, ne.lng + lngDiff)
        );
    },

    _getClusterArea: function() {
        var map = this._map;
        var size = this.options.maxClusterSize;

        var mapBounds = map.getBounds();
        var mapSize = map.getSize();

        var latDiff = Math.abs(mapBounds.getNorth() - mapBounds.getSouth());
        var lngDiff = Math.abs(mapBounds.getEast() - mapBounds.getWest());

        var latPerPixel = latDiff / mapSize.y;
        var lngPerPixel = lngDiff / mapSize.x;

        var lat = latPerPixel * size;
        var lng = lngPerPixel * size;

        return lat * lng;
    },

    _refreshVisible: function() {
        if( ! this._map ) {
            return;
        }

        var newVisibleBounds = this._getExpandedVisibleBounds();
        var clusterArea = this._getClusterArea();

        var nodes = this._tree.cut(newVisibleBounds, clusterArea);

        var newLayers = [];
        for( var i = 0; i < nodes.length; i++ ) {
            var node = nodes[i];

            if( node.mass === 1 ) {
                newLayers.push(node.getPoints()[0]);
            } else {
                // TODO: Allow customization of cluster nodes.
                // (e.g., binding popups, etc)
                newLayers.push(new L.QuadCluster.MarkerCluster(this, node));
            }
        }

        this._featureGroup.clearLayers();
        for( var j = 0; j < newLayers.length; j++ ) {
            this._featureGroup.addLayer(newLayers[j]);
        }
    },

    /*
     *  Taken from Leaflet.markercluster.
     */
    _isOrIsParent: function(el, oel) {
        while( oel ) {
            if( el === oel ) {
                return true;
            }
            oel = oel.parentNode;
        }
        return false;
    },

    /*
     *  Taken from Leaflet.markercluster.
     */
    _propagateEvent: function(e) {
        if( e.layer instanceof L.QuadCluster.MarkerCluster ) {
            // Prevent multiple clustermouseover/off events if the icon
            // is made up of stacked divs.
            // Doesn't work in IE<=8, no relatedTarget.
            if( e.originalEvent && this._isOrIsParent(e.layer._icon, e.originalEvent.relatedTarget)) {
                return;
            }
            e.type = 'cluster' + e.type;
        }

        this.fire(e.type, e);
    },

    // Default functionality for icon creation
    _defaultIconCreateFunction: function(cluster) {
        var childCount = cluster.getChildCount();

        // TODO: Dynamically create gradient based on currently visible clusters.
        var c = 'marker-cluster marker-cluster-';
        if( childCount < 10 ) {
            c += 'small';
        } else if( childCount < 100 ) {
            c += 'medium';
        } else {
            c += 'large';
        }

        return new L.DivIcon({
            html: '<div><span>' + childCount + '</span></div>',
            className: c,
            iconSize: new L.Point(40, 40)
        });
    },

    _zoomEnd: function() {
        if( !this._map ) {
            return;
        }

        this._refreshVisible();
    },

    _moveEnd: function() {
        this._refreshVisible();
    }
});

L.QuadCluster.markerClusterGroup = function(markers, options) {
    return new L.QuadCluster.MarkerClusterGroup(markers, options);
};
