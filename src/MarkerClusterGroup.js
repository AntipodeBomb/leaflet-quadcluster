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

        singlesOnZoom: 14,  // Individual markers past this zoom level
        clusterEpsilon: 0.01,   // How close two points have to be to be the
                                // same location
        useGravityCenter: true
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
            .lat(function(d) { return d.getLatLng().lat; })
            .epsilon(this.options.clusterEpsilon);

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

    _newLayersClustered: function(bounds, width) {
        var nodes = this._tree.cut(bounds, width);

        var newLayers = [];
        var i, j, markers, node;

        for( i = 0; i < nodes.length; i++ ) {
            node = nodes[i];

            if( node.mass === 1 ) {
                markers = node.getPoints();
                for( j = 0; j < markers.length; j++ ) {
                    newLayers.push(markers[j]);
                }
            } else {
                if( ! node.marker ) {
                    node.marker = this._createMarkerCluster(node);
                }
                node.marker._updateIcon();
                newLayers.push(node.marker);
            }
        }

        this._currentCut = nodes;
        return newLayers;
    },

    _newLayersSingles: function(bounds) {
        var nodes = this._tree.cutLeaves(bounds);
        this._currentCut = nodes;

        var markers = [];
        for( var i = 0; i < nodes.length; i++ ) {
            var points = nodes[i].getPoints();
            for( var j = 0; j < points.length; j++ ) {
                if( bounds.contains(points[j].getLatLng()) ) {
                    markers.push(points[j]);
                }
            }
        }

        return markers;
    },

    _updateCutStats: function() {
        var minMass = Infinity;
        var maxMass = -Infinity;
        var totalMass = 0;
        var cut = this._currentCut;

        for( var i = 0; i < cut.length; i++ ) {
            var node = cut[i];

            totalMass += node.mass;
            minMass = Math.min(minMass, node.mass);
            maxMass = Math.max(maxMass, node.mass);
        }

        minMass = totalMass > 0 ? minMass : 0;
        maxMass = totalMass > 0 ? maxMass : 0;
        this.cutStats = {
            mass: totalMass,
            points: cut.length,
            massRange: [ minMass, maxMass ]
        };
    },

    _refreshVisible: function() {
        if( ! this._map ) {
            return;
        }

        var newVisibleBounds = this._getExpandedVisibleBounds();
        var clusterWidth = this._getClusterWidth();
        var zoom = this._map.getZoom();

        var newLayers;
        if( zoom < this.options.singlesOnZoom ) {
            newLayers = this._newLayersClustered(newVisibleBounds, clusterWidth);
        } else {
            newLayers = this._newLayersSingles(newVisibleBounds);
        }

        this._updateCutStats();

        this._featureGroup.clearLayers();
        for( j = 0; j < newLayers.length; j++ ) {
            this._featureGroup.addLayer(newLayers[j]);
        }

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
        var c = 'quadtree-cluster quadtree-cluster-';
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
