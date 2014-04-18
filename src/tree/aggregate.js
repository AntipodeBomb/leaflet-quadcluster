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
