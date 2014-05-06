
L.QuadCluster = {
    version: '0.0.1'
};

/**
 *  @overview API to create quadtrees and perform aggregation on them.
 *  @author Christopher Dudley <chris@terainsights.com>
 *  @copyright Tera Insights, LLC 2014
 */

/* global L:true */

(function() {

/**
 *  Creates a new QuadTreeNode.
 *  @constructor
 *
 *  @param {?QuadTreeNode} parent - The parent of the node (if it exists).
 *  @param {L.LatLngBounds} bounds - The bounding box for the node.
 *  @param {function} latAcc - The latitude accessor for points.
 *  @param {function} lngAcc - The longitude accessor for points.
 *  @param {number} epsilon - The difference in latitude/longitude at which
 *      points are considered to be in the same location.
 *  @param {*=} point - A point contained in this node.
 */
function QuadTreeNode(parent, bounds, latAcc, lngAcc, epsilon, point) {
    this.bounds = bounds;
    this.parent = parent;
    this.latAcc = latAcc;
    this.lngAcc = lngAcc;
    this.epsilon = epsilon;
    this.active = true;
    this.leaf = true;

    // Order: [ bottom-left, bottom-right, top-left, top-right ]
    this.nodes = [];
    this.points = [];
    this.activePoints = [];

    if( point ) {
        this.points.push(point);
        this.activePoints.push(point);
        this.lat = latAcc(point);
        this.lng = lngAcc(point);
    }

    this.computeGravityCenter();
}

/*
 *  Adds the given point to a child of the node, creating the child if needed.
 */
QuadTreeNode.prototype.addToChild = function(point, lat, lng) {
    var cLat = (this.bounds.getSouth() + this.bounds.getNorth()) * 0.5;
    var cLng = (this.bounds.getWest() + this.bounds.getEast()) * 0.5;

    // Node bounding box
    var sLat, sLng, eLat, eLng;

    var index = 0;

    if( lat > cLat ) {
        // Point in top half
        index += 2;
        sLat = cLat;
        eLat = this.bounds.getNorth();
    } else {
        sLat = this.bounds.getSouth();
        eLat = cLat;
    }

    if( lng > cLng ) {
        // Point in right half
        index += 1;
        sLng = cLng;
        eLng = this.bounds.getEast();
    } else {
        sLng = this.bounds.getWest();
        eLng = cLng;
    }

    if( ! this.nodes[index] ) {
        var bounds = L.latLngBounds([sLat, sLng], [eLat, eLng]);
        this.nodes[index] = new QuadTreeNode(this, bounds,
                                             this.latAcc, this.lngAcc,
                                             this.epsilon, point);
    } else {
        this.nodes[index].add(point);
    }
};

/*
 *  Converts a leaf node to an internal node, moving the points contained by
 *  the node to a new child.
 */
QuadTreeNode.prototype.convertToInternal = function() {
    if( ! this.leaf ) {
        throw new Error('Node is already internal');
    }

    if( this.points.length === 0 ) {
        throw new Error('Converting node with no points to internal');
    }

    this.leaf = false;

    for( var i = 0; i < this.points.length; i++ ) {
        this.addToChild(this.points[i], this.lat, this.lng);
    }

    this.points = [];
    this.activePoints = [];
    this.lat = null;
    this.lng = null;

    return this;
};

/*
 *  Adds the given point to the tree.
 */
QuadTreeNode.prototype.add = function(point) {
    var lat = this.latAcc(point);
    var lng = this.lngAcc(point);

    if( ! this.leaf ) {
        this.addToChild(point, lat, lng);
        return this;
    }

    if( this.points.length === 0 ) {
        // Just add the point and be done
        this.points.push(point);
        this.activePoints.push(point);
        this.lat = lat;
        this.lng = lng;
        return this;
    }

    var dlat = Math.abs(this.lat - lat);
    var dlng = Math.abs(this.lng - lng);

    if( dlat < this.epsilon && dlng < this.epsilon ) {
        // Point is essentially on the same place. Just add to list of points.
        this.points.push(point);
        this.activePoints.push(point);
    } else {
        // Convert this point to an internal point, then add the point to a
        // child.
        this.convertToInternal();
        this.addToChild(point, lat, lng);
    }

    return this;
};

/*
 *  Computes the gravity center and active state of the node. If computeChild
 *  is truthy, the gravity center for child nodes will be updated before the
 *  gravity center of this node.
 */
QuadTreeNode.prototype.computeGravityCenter = function(computeChild) {
    var cLat = 0,
        cLng = 0,
        nLat = 0,
        nLng = 0,
        tPoints = 0,
        nPoints = 0,
        cWgt, nWgt,
        i, child;

    if( this.leaf ) {
        // Leaf nodes only have points, no nodes.
        for( i = 0; i < this.activePoints.length; i++ ) {
            nLat = this.latAcc(this.activePoints[i]);
            nLng = this.lngAcc(this.activePoints[i]);
            cLat += nLat;
            cLng += nLng;
            tPoints += 1;
        }

        cLat = tPoints > 0 ? cLat / tPoints : 0;
        cLng = tPoints > 0 ? cLng / tPoints : 0;
    } else {
        // Internal nodes have only nodes, no points.
        for( i = 0; i < this.nodes.length; i++ ) {
            if( ! this.nodes[i] ) {
                continue;
            }
            child = this.nodes[i];
            if( computeChild ) {
                child.computeGravityCenter(computeChild);
            }

            if( ! child.active ) {
                continue;
            }

            nLat = child.center.lat;
            nLng = child.center.lng;
            nPoints = child.mass;

            cWgt = tPoints / (tPoints + nPoints);
            nWgt = nPoints / (tPoints + nPoints);

            // Moving average
            cLat = (cLat * cWgt) + (nLat * nWgt);
            cLng = (cLng * cWgt) + (nLng * nWgt);
            tPoints += nPoints;
        }
    }

    this.center = L.latLng(cLat, cLng);
    this.mass = tPoints;
    this.active = tPoints > 0;

    return this;
};

/*
 *  Gets the active points contained in this section of the tree.
 */
QuadTreeNode.prototype.getPoints = function(storage) {
    storage = storage || [];

    if( ! this.active ) {
        return storage;
    }

    if( this.leaf ) {
        for( var i = 0; i < this.activePoints.length; i++ ) {
            storage.push(this.activePoints[i]);
        }
    } else {
        for( var j = 0; j < this.nodes.length; j++ ) {
            if( this.nodes[j] && this.nodes[j].active ) {
                this.nodes[j].getPoints(storage);
            }
        }
    }

    return storage;
};

/*
 *  Computes the new set of active points using the given filtration
 *  function.
 *
 *  The filterFunc should take as an argument a point and return true if the
 *  point should be in the active set.
 */
QuadTreeNode.prototype.filter = function(filterFunc) {
    if( this.leaf ) {
        this.activePoints = this.points.filter(filterFunc);
        this.computeGravityCenter(false);
    } else {
        for( var i = 0; i < this.nodes.length; i++ ) {
            if( this.nodes[i] ) {
                this.nodes[i].filter(filterFunc);
            }
        }
        this.computeGravityCenter(false);
    }
};

/*
 *  Performs aggregation on a tree node and its children.
 *
 *  @param {TreeAggregate} agg - The aggregate information.
 *
 *  @returns {*} The aggregate state or null if no aggregation performed.
 */
QuadTreeNode.prototype.aggregate = function(agg) {
    var state = null;
    var childState;
    var children = this.nodes;

    if( !agg.filter(this) ) {
        state = agg.initialize();
        state = agg.accumulate(state, this);

        for( var i = 0; i < children.length; i++ ) {
            if( children[i] ) {
                childState = children[i].aggregate(agg);
                if( childState !== null ) {
                    state = agg.merge(state, childState, i);
                }
            }
        }

        state = agg.finalize(state, this);
    }

    return state;
};

/**
 *  Shallow interface on top of the QuadTreeNode
 *  @constructor
 */
function QuadTree(bounds, latAcc, lngAcc, epsilon, points) {
    this.root = new QuadTreeNode(null, bounds, latAcc, lngAcc, epsilon);

    for( var i = 0; i < points.length; i++ ) {
        this.root.add(points[i]);
    }

    this.root.computeGravityCenter(true);
}

/*
 *  Adds a new point to the tree and recomputes the gravity centers.
 */
QuadTree.prototype.add = function(point) {
    this.root.add(point);
    this.root.computeGravityCenter(true);
};

/*
 *  Performs a filtration on the tree.
 */
QuadTree.prototype.filter = function(filterFunc) {
    this.root.filter(filterFunc);
};

/*
 *  Performs an aggregation on the tree. If there were no active nodes, then
 *  an empty state is returned.
 */
QuadTree.prototype.aggregate = function(agg) {
    var ret = this.root.aggregate(agg);

    if( ret === null ) {
        ret = agg.initialize();
    }

    return ret;
};

/*
 *  Returns a cut of the tree where all nodes within the cut have their gravity
 *  center within `bounds` and are at most `maxLng` wide.
 */
QuadTree.prototype.cut = function(bounds, maxLng) {
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

            if( ! node.parent ) {
                // Always check root node if it is active and visible.
                return false;
            }

            var diffLng = Math.abs(node.bounds.getEast() - node.bounds.getWest());
            if( diffLng < (maxLng / 2) ) {
                // Parent would be good enough.
                return true;
            }

            // If not filtered out by this point, visit it.
            return false;
        }).init(function() {
            return [];
        }).merge(function(state, oState) {
            for( var i = 0; i < oState.length; i++ ) {
                state.push(oState[i]);
            }
            return state;
        }).finalize(function(state, node) {
            // If no children made the cut, then we are the furthest down
            // node that is good enough.
            if( state.length === 0 ) {
                // Don't bother showing of the node center isn't in the
                // field of view.
                if( bounds.contains(node.center) ) {
                    state.push(node);
                }
            }

            return state;
        })();

    return this.aggregate(agg);
};

function QuadTreeFactory() {
    var _lat = function(d) { return d.lat; };
    var _lng = function(d) { return d.lng; };
    var _bounds = null;
    var _epsilon = 0.1;

    function calculateBounds(points) {
        if( points.length === 0 ) {
            throw new Error('Must specify bounds of no points given for QuadTree initialization');
        }

        var south = Infinity;
        var west = Infinity;
        var north = -Infinity;
        var east = -Infinity;

        var i, point, lat, lng;

        for( i = 0; i < points.length; i++ ) {
            point = points[i];
            lat = _lat(point);
            lng = _lng(point);

            south = Math.min(lat, south);
            west = Math.min(lng, west);

            north = Math.max(lat, north);
            east = Math.max(lng, east);
        }

        return L.latLngBounds([south, west], [north, east]);
    }

    function squarifyBounds(bounds) {
        var lat1 = bounds.getSouth();
        var lat2 = bounds.getNorth();
        var lng1 = bounds.getWest();
        var lng2 = bounds.getEast();

        var dlat = lat2 - lat1;
        var dlng = lng2 - lng1;

        if( dlng > dlat ) {
            lat2 = lat1 + dlng;
        } else {
            lng2 = lng1 + dlat;
        }

        return L.latLngBounds([lat1, lng1], [lat2, lng2]);
    }

    /*
     *  Tree factory function.
     */
    var _gen = function(points) {
        var bounds = _bounds;
        if( !bounds ) {
            bounds = calculateBounds(points);
        }
        bounds = squarifyBounds(bounds);

        return new QuadTree(bounds, _lat, _lng, _epsilon, points);
    };

    /*
     *  Gets or sets longitude accessor.
     */
    _gen.x = _gen.lng = function(_) {
        if( arguments.length === 0 ) {
            return _lng;
        }

        _lng = _;
        return _gen;
    };

    /*
     *  Gets or sets latitude accessor.
     */
    _gen.y = _gen.lat = function(_) {
        if( arguments.length === 0 ) {
            return _lat;
        }

        _lat = _;
        return _gen;
    };

    /*
     *  Gets or sets bounds.
     */
    _gen.extent = _gen.bounds = function(_) {
        if( arguments.length === 0 ) {
            return _bounds;
        }

        _bounds = _;
        return _gen;
    };

    /*
     *  Gets or sets epsilon.
     */
    _gen.epsilon = function(_) {
        if( arguments.length === 0 ) {
            return _epsilon;
        }

        _epsilon = _;
        return _gen;
    };

    return _gen;
}

L.QuadCluster.Tree = QuadTreeFactory;

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
    },

    spiderfy: function() {
        // TODO: Implement
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
        clusterSizeScalingFactor: 1.4,
        iconCreateFunction: null,

        zoomToBoundsOnClick: true,
        spiderfyOnMaxZoom: true,
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
            .lng(function(d) { return d.getLatLng().lng; })
            .lat(function(d) { return d.getLatLng().lat; });

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

        if( this.options.zoomToBoundsOnClick || this.options.spiderfyOnMaxZoom ) {
            this.on('clusterclick', this._zoomOrSpiderfy, this);
        }
    },

    // Overrides FeatureGroup.onRemove
    onRemove: function(map) {
        map.off('zoomend', this._zoomEnd, this);
        map.off('moveend', this._moveEnd, this);

        this._featureGroup.onRemove(map);
        this._nonPointGroup.onRemove(map);

        this._map = null;

        if( this.options.zoomToBoundsOnClick || this.options.spiderfyOnMaxZoom ) {
            this.off('clusterclick', this._zoomOrSpiderfy, this);
        }
    },

    filter: function(filterFunction) {
        this._tree.filter(filterFunction);
        this._refreshVisible();
    },

    getVisible: function() {
        return this._featureGroup.getLayers();
    },

    getVisibleMarkers: function() {
        var allVis = this.getVisible();
        var ret = [];

        allVis.forEach(function(d) {
            if( !(d instanceof L.QuadCluster.MarkerCluster) ) {
                ret.push(d);
            }
        });

        return ret;
    },

    getVisibleClusters: function() {
        var allVis = this.getVisible();
        var ret = [];

        allVis.forEach(function(d) {
            if( d instanceof L.QuadCluster.MarkerCluster ) {
                ret.push(d);
            }
        });

        return ret;
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

    _getClusterWidth: function() {
        var map = this._map;
        var size = this.options.maxClusterSize;
        var scale = this.options.clusterSizeScalingFactor;
        var zoom = map.getZoom();

        return (size * scale) / Math.pow(2, zoom);
    },

    _refreshVisible: function() {
        if( ! this._map ) {
            return;
        }

        var newVisibleBounds = this._getExpandedVisibleBounds();
        var clusterWidth = this._getClusterWidth();

        var nodes = this._tree.cut(newVisibleBounds, clusterWidth);

        var newLayers = [];
        for( var i = 0; i < nodes.length; i++ ) {
            var node = nodes[i];

            if( node.mass === 1 ) {
                newLayers.push(node.getPoints()[0]);
            } else {
                if( ! node.marker ) {
                    node.marker = this._createMarkerCluster(node);
                }
                node.marker._updateIcon();
                newLayers.push(node.marker);
            }
        }

        this._featureGroup.clearLayers();
        for( var j = 0; j < newLayers.length; j++ ) {
            this._featureGroup.addLayer(newLayers[j]);
        }

        this._currentCut = nodes;

        this.fire('refresh', newLayers);
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

    _createMarkerCluster: function(node) {
        // TODO: Allow configuration (bind popups, etc.)
        var marker = new L.QuadCluster.MarkerCluster(this, node);
        L.stamp(marker);

        return marker;
    },

    _zoomEnd: function() {
        if( !this._map ) {
            return;
        }

        this._refreshVisible();
    },

    _moveEnd: function() {
        this._refreshVisible();
    },

    _zoomOrSpiderfy: function(e) {
        var map = this._map;
        if( map.getMaxZoom() == map.getZoom()) {
            if( this.options.spiderfyOnMaxZoom ) {
                e.layer.spiderfy();
            }
        } else if( this.options.zoomToBoundsOnClick ) {
            e.layer.zoomToBounds();
        }

        // Focus the map again for keyboard users
        if( e.originalEvent && e.originalEvent.keyCode === 13 ) {
            map._container.focus();
        }
    }
});

L.QuadCluster.markerClusterGroup = function(markers, options) {
    return new L.QuadCluster.MarkerClusterGroup(markers, options);
};
