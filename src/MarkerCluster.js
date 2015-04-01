/**
 *  @overview Defines a new type of marker that represents a cluster of markers.
 *  @author Christopher Dudley <chris@terainsights.com>
 *  @copyright 2014 Tera Insights, LLC. 2014
 *  @license MIT
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
        var center;
        if( group.options.useGravityCenter ) {
            center = node.center;
        } else {
            center = node.bounds.getCenter();
        }

        L.Marker.prototype.initialize.call(this, center, {icon: this});

        this._group = group;
        this._node = node;

        this._iconNeedsUpdate = true;
    },

    // Creates markers for all of the individual points contained by this cluster.
    getAllChildMarkers: function(storageArray) {
        storageArray = storageArray || [];

        this._node.getPoints(storageArray);
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
