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
