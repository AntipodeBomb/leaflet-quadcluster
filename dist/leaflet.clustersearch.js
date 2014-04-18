!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),(f.leaflet||(f.leaflet={})).clustersearch=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){

var tree = _dereq_('./tree/api.js');

module.exports = {
    tree: tree
};

},{"./tree/api.js":3}],2:[function(_dereq_,module,exports){
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
 *
 */
function AggregateFactory() {
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
}

module.exports = AggregateFactory;

},{}],3:[function(_dereq_,module,exports){
/**
 *  @overview Overall API for the tree submodule.
 *  @author Christopher Dudley <chris@terainsights.com>
 *  @copyright Tera Insights, LLC 2014
 */

module.exports = {
    tree: _dereq_('./tree.js'),
    aggregate: _dereq_('./aggregate.js')
};

},{"./aggregate.js":2,"./tree.js":4}],4:[function(_dereq_,module,exports){
/**
 *  @overview API to create quadtrees and perform aggregation on them.
 *  @author Christopher Dudley <chris@terainsights.com>
 *  @copyright Tera Insights, LLC 2014
 */

/* global d3:true */

/**
 *  Creates a new QuadTree generator. The generator can be configured with
 *  with an X accessor, Y accessor, and extent. The generator has defaults
 *  for all of these values.
 */
function TreeGenerator() {
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

        var lower = [Infinity, -Infinity];
        var upper = [Infinity, -Infinity];

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
}

/*
 *  Creates a new quadtree from a set of points.
 *
 *  Each node has the following properties:
 *
 *  id - a number unique for each node in the tree.
 *  depth - the depth in the tree at which the node resides (root is 0).
 *  bounds - an array [[x1, y1], [x2, y2]] giving the area the node covers.
 *  parentID - the id of the parent node, if any.
 *  nodes - a sparse array of the four child nodes in order: bottom-left, bottom-right, top-left, top-right
 *  leaf - a boolean indicating whether the node is a leaf (true) or internal (false)
 *  point - the point associated with this node, if any (can apply to leaves or internal)
 *  x - the x-coordinate of the associated point, if any
 *  y - the y-coordinate of the associated point, if any
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
        aggregateNode(aggregate, _root, _x1, _y1, _x2, _y2);
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
     *  Returns the root node.
     */
    _tree.root = function() {
        return _root;
    };

    function enhanceNode(node, depth, x1, y1, x2, y2) {
        var sx = (x1 + x2) * 0.5;
        var sy = (y1 + y2) * 0.5;

        var children = node.nodes;

        node.depth = depth;
        node.bounds = [[x1, y1], [x2, y2]];

        if( !node.id ) {
            node.id = _nextID++;
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
    }

    // Perform initial enhancement of nodes
    enhanceNode(_root, 0, _x1, _y1, _x2, _y2);

    return tree;
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

module.exports = TreeGenerator;

},{}]},{},[1])
(1)
});;