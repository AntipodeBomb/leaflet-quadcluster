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
        _root = _factory([]);
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
