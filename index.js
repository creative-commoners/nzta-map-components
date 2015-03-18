/**
 * @file A collection of Backbone components useful for building NZTA maps.
 */

/*jshint multistr: true */

(function (root, factory) {

    var Backbone = require('backbone'),
        _ = require('underscore'),
        Cocktail = require('backbone.cocktail'),
        L = global.L = require('leaflet'),
        geoJsonExtent = require('geojson-extent');

    Backbone.$ = require('jquery');
    Backbone.Marionette = require('backbone.marionette');

    require('leaflet.markercluster');

    module.exports = factory(Backbone, _, Cocktail, L, geoJsonExtent);

}(window, function (Backbone, _, Cocktail, L, geoJsonExtent) {

    var NZTAComponents = {};

    var Router = Backbone.Marionette.AppRouter.extend({

        routes: {
            '': '_handleNav',
            ':action/:type(/:id)': '_handleNav'
        },

        _previousFragment: null,

        _handleNav: function(action, type, id) { }
    });

    var router = new Router();

    var browserHelpersMixin = {
        _isIE: function () {
            return navigator.appVersion.indexOf("MSIE ") !== -1;
        },
        _isIE9: function () {
            return navigator.appVersion.indexOf("MSIE 9.") !== -1;
        }
    };

    var eventsMixin = {
        initialize: function () {
            // Add hook for routing
            this.listenTo(router, 'route', function (handler, params) {
                if (typeof this._onRoute === 'function') {
                    this._onRoute(handler, params);
                }
            }, this);

            // Add hook for new data becoming available.
            this.listenTo(this.options.vent, 'map.update.all', function (features) {
                if (typeof this._onMapData === 'function') {
                    this._onMapData(features);
                }
            }, this);
        }
    };

    var featureHelpersMixin = {
        /**
         * @func _getRelationsForFeature
         * @param {Array} relatedModels - The models related to your feature.
         * @param {String} featureType - The type of feature you have e.g. 'regions'.
         * @param {String} featureId - The the ID of the feature you have.
         * @return {Array}
         * @desc Given a feature, get all related models of a specific type.
         */
        _getRelationsForFeature: function (relatedModels, featureType, featureId) {
            return _
                .chain(relatedModels)
                .filter(function (model) {
                    var relationArray = model.get('properties')[featureType];

                    // Make sure the featureType exists on the model.
                    if (relationArray === void 0 || relationArray.length === 0) {
                        return false;
                    }

                    return _.findWhere(relationArray, { id: featureId }) !== void 0;
                })
                .unique(function (model) {
                    return model.get('properties').id;
                })
                .value();
        }
    };

    /**
     * @module Application
     * @extends Marionette.Application
     * @desc An application constructor which hooks into the NZTAComponents router and Backbone instance.
     */
    NZTAComponents.Application = Backbone.Marionette.Application.extend({
        /**
         * @func initialize
         * @param {object} [options]
         * @param {string} [options.rootPath] - Your application root.
         */
        initialize: function (options) {
            var rootPath = (options !== void 0 && options.rootPath !== void 0) ? options.rootPath : '/';

            this.router = router;

            this.on('start', function () {
                if (Backbone.history) {
                    Backbone.history.start({ 
                        pushState: true,
                        root: rootPath
                    });
                }
            });
        }
    });

    /**
     * @module DrillDownMenuView
     * @extends Marionette.LayoutView
     * @param {object} vent - Backbone.Wreqr.EventAggregator instance.
     * @param {function} defaultPanel - Constructor for the panel shown by default.
     * @param {string} defaultCollectionKey - The key of the collection to display by default.
     * @desc Top level component for creating a Drill Down Menu. Has child {@link DrillDownPanelView} components.
     * @todo Look at refactoring the DrillDownMenu component. DrillDownMenuPanels would be more flexible as LayoutViews.
     */
    NZTAComponents.DrillDownMenuView = Backbone.Marionette.LayoutView.extend({

        /**
         * @func initialize
         * @param {object} options
         * @param {object} options.model - Backbone.Model instance.
         * @param {object} options.defaultPanel - NZTAComponents.DropDownPanelView constructor.
         * @param {string} options.defaultCollectionKey
         */
        initialize: function (options) {
            var defaultPanel;

            this._panelViews = [];

            this.model = options.model;

            defaultPanel = this._createPanel(options.defaultPanel, options.defaultCollectionKey);

            this.model.set({
                baseUrlSegment: this.options.baseUrlSegment || '',
                currentPanelViewCid: defaultPanel.cid,
                backUrlSegment: null,
                currentUrlSegment: null
            });
        },

        /**
         * @func onRender
         * @override
         */
        onRender: function () {
            // Render the default panel view.
            this.defaultPanelRegion.show(this._panelViews[0]);
        },

        /**
         * @func _getPanelByUrlSegment
         * @param {string} urlSegment - The URL segment of the panel you're looking for.
         * @return {object}
         * @desc Get a panel by it's URL segment.
         */
        _getPanelByUrlSegment: function (urlSegment) {
            return _.filter(this._panelViews, function (panelView) {
                if (panelView.model === void 0) {
                    return false;
                }

                return panelView.model.get('urlSegment') === urlSegment;
            });
        },

        /**
         * @func _showNewPanelView
         * @param {Object} panelView
         */
        _showNewPanelView: function (panelView) {
            var panelRegion = null;

            // Hide previous panels that may be shown
            for (var i = 0; i < this._panelViews.length - 1; i++) {
                this._panelViews[i].$el.hide();
            };

            panelRegion = this._createPanelRegion(panelView.cid);
            panelRegion.show(panelView);
        },

        /**
         * @func _setBackUrlSegment
         * @return {string} The URL segment being navigated away from.
         * @desc Set the 'back' URL segment. Called before navigating to a new route.
         */
        _setBackUrlSegment: function () {
            var baseUrlSegment = this.model.get('baseUrlSegment'),
                backUrlSegment = this.model.get('backUrlSegment'),
                currentUrlSegment = this.model.get('currentUrlSegment');

            if (backUrlSegment === null || backUrlSegment === baseUrlSegment) {
                currentUrlSegment = baseUrlSegment;
            } else {
                currentUrlSegment = currentUrlSegment;
            }

            this.model.set('backUrlSegment', currentUrlSegment);

            return currentUrlSegment;
        },

        /**
         * @func _navigateMenuForward
         * @param {string} urlSegment - The URL segment we're navigating to.
         * @desc Navigates the menu forward one step.
         */
        _navigateMenuForward: function (urlSegment) {
            var forwardUrl = this.model.get('baseUrlSegment') + urlSegment;

            this._setBackUrlSegment();

            // Remove the previous panel if it's not the default panel.
            if (this._panelViews.length > 1) {
                this._removePanel(this.model.get('currentPanelViewCid'));
            }

            this.model.set('currentUrlSegment', forwardUrl);

            router.navigate(forwardUrl, { trigger: true });
        },

        /**
         * @func _navigateMenuBack
         * @param {string} cid - The CID of the current panel.
         * @desc Navigates the menu back one step.
         */
        _navigateMenuBack: function (cid) {
            var backUrlSegment = this._setBackUrlSegment(),
                trigger = backUrlSegment === '' ? true : false,
                currentPanel = this._panelViews[this._panelViews.length - 2];
            
            this.model.set({
                currentPanelViewCid: currentPanel.cid,
            });

            currentPanel.$el.addClass('anim-reveal').show();

            this._removePanel(cid);

            this.model.set('currentUrlSegment', backUrlSegment);

            router.navigate(backUrlSegment, { trigger: trigger });
        },

        /**
         * @func _createPanelRegion
         * @param {Object} cid
         * @desc Create a DOM element and region object for a panel view.
         */
        _createPanelRegion: function (cid) {
            this.$el.append('<div class="view-absolute panel-region-' + cid + '"></div>');

            return this.addRegion('panelRegion' + cid, '.panel-region-' + cid);
        },

        /**
         * @func _removePanel
         * @param {Object} cid
         * @desc Remove a panel from the DrillDownMenuView.
         */
        _removePanel: function (cid) {
            // Remove the view from _panelViews.
            this._panelViews = _.without(this._panelViews, _.findWhere(this._panelViews, { cid: cid }));

            // Remove the view's region. This also destroys the view instance.
            this.removeRegion('panelRegion' + cid);

            // Remove the view wrapper from the DOM
            this.$el.find('.panel-region-' + cid).remove();
        },

        /**
         * @func _createPanel
         * @param {Object} ViewConstructor Constructor for the view you want put inside the panel.
         * @return {Object} The newly created View.
         * @desc Create a panel within the DrillDownMenuView.
         */
        _createPanel: function (ViewConstructor, collectionKey, collectionFilter, modelValues) {
            var panelView = new ViewConstructor({ vent: this.options.vent }),
                models;

            this.listenTo(panelView, 'drillDownMenu.navigate.forward', this._navigateMenuForward, this);
            this.listenTo(panelView, 'drillDownMenu.navigate.back', this._navigateMenuBack, this);

            // Populate the panel's model
            if (modelValues !== void 0) {
                panelView.model.set(modelValues);
            }

            // Populate the panel's collection
            if (collectionFilter !== void 0) {
                models = this._getRelationsForFeature(this.model[collectionKey].models, collectionFilter.key, collectionFilter.value);
            } else {
                models = this.model[collectionKey].models;
            }
            panelView.collection.add(models);

            this._panelViews.push(panelView);

            return panelView;
        }
    });
    Cocktail.mixin(NZTAComponents.DrillDownMenuView, eventsMixin, browserHelpersMixin, featureHelpersMixin);

    /**
     * @module DrillDownPanelView
     * @extends Marionette.CompositeView
     * @param {object} vent - Backbone.Wreqr.EventAggregator instance.
     * @desc A sub-component used to create Drill Down Menus. Child of {@link DrillDownMenuView}. Has {@link DrillDownItemView} child components.
     */
    NZTAComponents.DrillDownPanelView = Backbone.Marionette.CompositeView.extend({

        childView: NZTAComponents.DrillDownItemView,

        childViewContainer: '.items',

        /**
         * @func templateHelpers
         * @override
         */
        templateHelpers: function () {
            return {
                items: this.collection.toJSON()
            };
        },

        events: {
            'click .back': '_navigateMenuBack',
            'click .list__link': '_navigateMenuForward'
        },

        /**
         * @func initialize
         * @param {object} [options]
         * @param {object} [options.model] - Backbone.Model instance.
         * @param {object} [options.collection] - Backbone.Collection instance.
         */
        initialize: function (options) {
            this.model = (options.model !== void 0 && options.model !== void 0) ? options.model : new Backbone.Model();
            this.collection = (options.collection !== void 0 && options.collection !== void 0) ? options.collection : new Backbone.Collection();

            // Automatically re-render the view when the collection changes.
            this.listenTo(this.collection, 'change', function () {
                this.render();
            }, this);
        },

        /**
         * @func onShow
         * @override
         */
        onShow: function () {
            this.$el.find('.view-absolute').addClass('anim-reveal');
        },

        /**
         * @func _navigateMenuForward
         * @param {object} e - Event object.
         * @desc Navigate the menu forward (drill down).
         */
        _navigateMenuForward: function (e) {
            this.trigger('drillDownMenu.navigate.forward', Backbone.$(e.currentTarget).data('feature'));
        },

        /**
         * @func _navigateMenuBack
         * @desc Navigate the menu back.
         */
        _navigateMenuBack: function () {
            this.trigger('drillDownMenu.navigate.back', this.cid);
        }
    });
    Cocktail.mixin(NZTAComponents.DrillDownPanelView, eventsMixin, browserHelpersMixin, featureHelpersMixin);

    /**
     * @module DrillDownItemView
     * @extends Marionette.ItemView
     * @desc Child component of {@link DrillDownPanelView}. Used in creating Drill Down Menus.
     */
    NZTAComponents.DrillDownItemView = Backbone.Marionette.ItemView.extend({

        /**
         * @func onShow
         * @override
         */
        onShow: function () {
            this.$el.closest('.view-absolute').addClass('anim-reveal');
        }

    });
    Cocktail.mixin(NZTAComponents.DrillDownItemView, browserHelpersMixin, featureHelpersMixin);

    /**
     * @module GeoJsonCollection
     * @extends Backbone.Collection
     * @desc For dealing with {@link GeoJsonModel} models.
     */
    NZTAComponents.GeoJsonCollection = Backbone.Collection.extend({

        /**
         * @function initialize
         */
        initialize: function (options) {
            this._clusterRadius = (options !== void 0 && options.radius !== void 0) ? options.radius : 8;
            this._clusterFillColor = (options !== void 0 && options.fillColor !== void 0) ? options.fillColor : 'transparent';
            this._clusterColor = (options !== void 0 && options.color !== void 0) ? options.color : 'transparent';
            this._clusterWeight = (options !== void 0 && options.weight !== void 0) ? options.weight : 1;
            this._clusterOpacity = (options !== void 0 && options.opacity !== void 0) ? options.opacity : 1;
            this._clusterFillOpacity = (options !== void 0 && options.fillOpacity !== void 0) ? options.fillOpacity : 0.8;
            this._iconClass = (options !== void 0 && options.iconClass !== void 0) ? options.iconClass : 'cluster-icon';
            this._iconUrl = (options !== void 0 && options.iconUrl !== void 0) ? options.iconUrl : '';
            this._iconSize = (options !== void 0 && options.iconSize !== void 0) ? options.iconSize : [26, 34];
            this._iconAnchor = (options !== void 0 && options.iconAnchor !== void 0) ? options.iconAnchor : [13, 34];
            this._style = (options !== void 0 && options.style !== void 0) ? options.style : null;
        },

        /**
         * @func fetch
         * @override
         * @desc Preprocessing GeoJSON response before populating models. We're overriding this because we need to deal with `resp.features` property inside the success callback, rather than the standard `resp` property.
         */
        fetch: function(options) {
            options = options ? _.clone(options) : {};

            if (options.parse === void 0) {
                options.parse = true;
            }

            var success = options.success;
            var collection = this;

            options.success = function(resp) {
                var method = options.reset ? 'reset' : 'set';
                collection[method](resp.features, options);

                if (success) {
                    success(collection, resp, options);
                }

                collection.trigger('sync', collection, resp, options);
            };

            return this.sync('read', this, options);
        },

        /**
         * @func _getFeaturesByPropertyValue
         * @param {string} key - The key on the GeoJSON feature's `properties` to check against.
         * @param {string} value - The value of `key`.
         * @desc Get list of GeoJSON features filtered by a `properties` value.
         */
        _getFeaturesByPropertyValue: function (key, value) {
            return _.filter(this.models, function (featureModel) {
                return featureModel.get('properties')[key] === value;
            });
        },

        /**
         * @func _getFeatureById
         * @param {string} featureId - The ID of the feature you're looking for.
         * @return {object}
         */
        _getFeatureById: function (featureId) {
            return _.filter(this.models, function (featureModel) {
                return featureModel.get('properties').id === featureId;
            })[0];
        },

        /**
         * @func _getFeaturesByRelation
         * @param {string} relationKey - The property where the relation is on the model.
         * @param {string} relationId - The ID of the relation.
         * @return {array} - Filtered list of models
         * @desc Filter the collection by related data.
         */
        _getFeaturesByRelation: function (relationKey, relationId) {
            return _.filter(this.models, function (geoJsonModel) {
                var relation = geoJsonModel.get('properties')[relationKey];

                // Make sure the relation exists on the model.
                if (relation === void 0 || relation.length === 0) {
                    return false;
                }

                return _.findWhere(relation, { id: relationId }) !== void 0;
            });
        }
    });
    
    /**
     * @module GeoJsonModel
     * @extends Backbone.Model
     * @desc Represents a GeoJSON feature.
     */
    NZTAComponents.GeoJsonModel = Backbone.Model.extend({

        /**
         * @func _getBounds
         * @return {array}
         * @desc Get the feature's bounds.
         */
        _getBounds: function () {
            var bounds;

            if (this.get('geometry').type === 'Polygon') {
                bounds = geoJsonExtent.polygon(this.attributes).coordinates[0];
            } else {
                bounds = geoJsonExtent(this.attributes);
            }

            return bounds;
        },

        /**
         * @func _getDisplayTime
         * @return {string}
         * @desc Get a display friendly string representing the time it will take to travel the feature.
         */
        _getDisplayTime: function() {
            var displayTime = null,
                length = parseFloat(this.get('properties').totalLength),
                speed = parseFloat(this.get('properties').speed),
                timeMinute = 0,
                timeHours = 0,
                timeMinuteStr = '',
                timeHourStr = '';

            // Are there any errors in the data?
            if (isNaN(length) || isNaN(speed) || speed <= 0 || length <= 0) {
                return displayTime;
            }

            // Calculate the time (distance/speed per minute)
            timeMinute = Math.ceil(length / (speed / 60));

            // If this is too big, show with hours too.
            if (timeMinute > 60) {
                timeHours = Math.floor(timeMinute / 60);
                timeMinute -= timeHours * 60;
            }

            timeMinuteStr = timeMinute === 1 ? '1 min' : timeMinute + ' mins';
            timeHourStr = timeHours === 1 ? '1 hour' : timeHours + ' hours';

            if (timeHours > 0 && timeMinute === 0) {
                displayTime = timeHourStr;
            } else if (timeHours > 0) {
                displayTime = timeHourStr + ' ' + timeMinuteStr;
            } else {
                displayTime = timeMinuteStr;
            }

            return displayTime;
        }

    });

    /**
     * @module MapModel
     * @extends Backbone.Model
     * @desc The model for {@link MapView}.
     */
    NZTAComponents.MapModel = Backbone.Model.extend({

        defaults: {
            polling: false,
            popupFeatureId: null
        },

        /**
         * @func _getFeatureTypeById
         * @param {string} collectionKey - MapModel key where the collection is.
         * @param {string} featureId - ID of the feature you want.
         * @return {object} GeoJSON feature.
         * @desc Get a feature model ID.
         */
        _getFeatureTypeById: function (collectionKey, featureId) {
            return _.filter(this[collectionKey].models, function (featureModel) {
                return featureModel.get('properties').id === featureId;
            })[0];
        },

        /**
         * @func _doFetch
         * @desc Fetch data for your Map. Override this method on your MapModel.
         * @example Example _doFetch method. In this example, your MapView would define a listener like, this.listenTo(this.model, 'allDataFetched', function (data) {}).
         * // _doFetch: function () {
         * //     var self = this;
         * //
         * //     $.when(
         * //         this.collection1.fetch(),
         * //         this.collection2.fetch(),
         * //         this.collection3.fetch()
         * //     ).done(function (collection1XHR, collection2XHR, collection3XHR) {
         * //         self.trigger('allDataFetched', {
         * //             collection1: self.collection1,
         * //             collection2: self.collection2,
         * //             collection3: self.collection3
         * //         });
         * //     });
         * // }
         */
        _doFetch: function () {
            throw new Error('You need to define a _doFetch method on your MapModel.');
        },

        /**
         * @func _startPolling
         * @param {integer} [interval] - The number of miliseconds between each fetch (defaults to 60000).
         * @desc Starts updating the model's collections at a set interval.
         */
        _startPolling: function (interval) {
            var self = this,
                n = interval || 60000;

            this._doFetch();

            this.pollingInterval = setInterval(function () {
                self._doFetch();
            }, n);

            this.set('polling', true);
        },

        /**
         * @func _stopPolling
         * @desc Stops polling the model's collection endpoints.
         */
        _stopPolling: function () {
            clearTimeout(this.pollingInterval);

            this.set('polling', false);
        }
    });

    /**
     * @module MapView
     * @extends Marionette.ItemView
     * @param {object} vent - Backbone.Wreqr.EventAggregator instance.
     * @desc Used for displaying the Map.
     */
    NZTAComponents.MapView = Backbone.Marionette.ItemView.extend({

        el: '#map',

        template: false,

        /**
         * @func initialize
         * @param {object} options
         * @param {object} options.model - Backbone.Model instance.
         * @override
         */
        initialize: function (options) {

            this.model = (options !== void 0 && options.model !== void 0) ? options.model : new NZTAComponents.MapModel();

            this.mapLayers = [];

            this._addMap();

            // Remove default map controls
            this.map.removeControl(this.map.zoomControl);

            this.listenTo(this.options.vent, 'userControls.zoomIn', function () {
                this._zoomIn();
            }, this);

            this.listenTo(this.options.vent, 'userControls.zoomOut', function () {
                this._zoomOut();
            }, this);

            this.listenTo(this.options.vent, 'userControls.locateUser', function () {
                this._locateUser();
            }, this);

            this.listenTo(this.options.vent, 'userControls.startPolling', function (interval) {
                this._startPolling(interval);
            }, this);

            this.listenTo(this.options.vent, 'userControls.stopPolling', function () {
                this._stopPolling();
            }, this);

            this.listenTo(this.options.vent, 'userControls.toggleMapLayer', function (layerName) {
                this._toggleMapLayer(layerName);
            }, this);

            this.listenTo(this.model, 'data.all', function (features) {
                this.options.vent.trigger('map.update.all', features);
            }, this);
        },

        /**
         * @func _addMap
         * @param {object} [options]
         * @param {array} [options.bounds] - Northing-easting to set the map view.
         * @param {integer} [options.zoom] - Initial zoom level.
         * @param {integer} [options.maxZoom] - Maximum zoom level.
         * @param {integer} [options.zIndex] - z-index for the map.
         * @param {string} [options.tileLayer] - Tile layer URI.
         * @param {array} [options.subdomains] - Tile layer sub domains.
         * @param {string} [options.attribution] - Map attribution.
         * @return Leaflet map instance.
         * @desc Add a Leaflet map to the MapView.
         */
        _addMap: function (options) {
            var bounds = (options !== void 0 && options.bounds !== void 0) ? options.bounds : [-40.866119, 174.143780],
                zoom = (options !== void 0 && options.zoom !== void 0) ? options.zoom : 5,
                tileLayer = (options !== void 0 && options.tileLayer !== void 0) ? options.tileLayer : 'http://{s}.tile.osm.org/{z}/{x}/{y}.png';

            var opt = {
                attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 18,
                zIndex: 10
            };

            if (options !== void 0 && options.maxZoom !== void 0) {
                opt.maxZoom = options.maxZoom;
            }

            if (options !== void 0 && options.zIndex !== void 0) {
                opt.zIndex = options.zIndex;
            }

            if (options !== void 0 && options.subdomains !== void 0) {
                opt.subdomains = options.subdomains;
            }

            if (options !== void 0 && options.attribution !== void 0) {
                opt.attribution = options.attribution;
            }

            this.map = L.map('map').setView(bounds, zoom);

            L.tileLayer(tileLayer, opt).addTo(this.map);

            return this.map;
        },

        /**
         * @func _onMapData
         * @param {object} features - Key value pairs of GeoJsonCollections.
         * @desc Called when new map data is available as a result of MapModel._doFetch().
         */
        _onMapData: function (features) {
            // Add a map layer for each feature set.
            _.each(features, function (geoJsonCollection, key) {
                var mapLayer = this._getMapLayerById(key);

                if (mapLayer === void 0) {
                    // The map layer doesn't exist yet, so create it.
                    this._addMapLayer(key);
                } else if (this._mapLayerVisible(key)) {
                    // The map layer exists and has not been turned off by the user, so update the markers.
                    this._updateMapLayer(key);
                }
            }, this);
        },

        /**
         * @func _zoomIn
         * @desc Zoom the map in one level.
         */
        _zoomIn: function () {
            this.map.zoomIn();
        },

        /**
         * @func _zoomOut
         * @desc Zoom the map out one level.
         */
        _zoomOut: function () {
            this.map.zoomOut();
        },

        /**
         * @func _locateUser
         * @desc Move the map to the user's current location.
         */
        _locateUser: function () {
            this.map.locate({ setView: true, maxZoom: this.map.getZoom() });
        },

        /**
         * @func _setMapBounds
         * @param {array} northingEasting - E.g. [ [654.321, 123.456], [654.321, 123.456] ]
         * @desc Set the map's bounds.
         */
        _setMapBounds: function (northingEasting) {
            this.map.fitBounds(northingEasting);
        },

        /**
         * @func _moveToFeature
         * @param {object} geoJsonModel - GeoJsonModel instance.
         * @desc Center the map on a GeoJsonFeature.
         */
        _moveToFeature: function (geoJsonModel) {
            var bounds = geoJsonModel._getBounds(),
                northingEasting;

            if (geoJsonModel.get('geometry').type === 'Polygon') {
                northingEasting = [
                    [bounds[0][1], bounds[0][0]],
                    [bounds[2][1], bounds[2][0]]
                ];
            } else {
                northingEasting = [
                    [bounds[1], bounds[0]],
                    [bounds[3], bounds[2]]
                ];
            }

            this._setMapBounds(northingEasting);
        },

        /**
         * @func _getMapLayerById
         * @param {string} layerId - The ID of the map layer you're looking for. Should match a GeoJsonCollection name e.g. 'cameras'.
         * @desc Get a map layer by ID.
         */
        _getMapLayerById: function (layerId) {
            return _.findWhere(this.mapLayers, { id: layerId });
        },

        /**
         * @func _toggleMapLayer
         * @param {string} layerId - The ID of the layer to add / remove.
         * @desc Add / remove a layer from the map.
         */
        _toggleMapLayer: function (layerId) {
            var layer;

            if (layerId === void 0) {
                return;
            }

            layer = this._getMapLayerById(layerId);

            if (this._mapLayerVisible(layerId)) {
                this._removeMapLayer(layerId);
            } else {
                this._updateMapLayer(layerId);
            }
        },

        /**
         * @func _updateMapLayer
         * @param {string} layerId - The ID of the layer to update.
         * @desc Update an existing map layer with new data.
         * @example Data is retrieved from MapModel, so layerId should match the MapModel property name where your GeoJsonCollection is stored.
         * // ...
         * //
         * // mapModel.cameras = new NZTAComponents.GeoJsonCollection();
         * // mapModel.cameras.fetch();
         * // 
         * // ...
         * //
         * // this._updateMapLayer('cameras'); // the 'cameras' layer is updated with data from mapModel.cameras
         */
        _updateMapLayer: function (layerId) {
            var geoJsonCollection = this.model[layerId],
                mapLayer = this._getMapLayerById(layerId),
                geoJsonLayer;

            // Remove the current cluster group if it exists, so we don't end up with
            // multiple cluster groups displaying the same data.
            this._removeMapLayer(layerId);

            geoJsonLayer = L.geoJson(null, {
                pointToLayer: function(feature, latlng) {
                    var icon = L.icon({
                        iconUrl: geoJsonCollection._iconUrl,
                        iconSize: geoJsonCollection._iconSize,
                        iconAnchor: geoJsonCollection._iconAnchor
                    });

                    return L.marker(latlng, { icon: icon });
                },
                // Add a click handler to each feature marker.
                onEachFeature: function (feature, layer) {
                    layer.on('click', function () {
                        NZTAComponents.router._previousFragment = Backbone.history.fragment;
                        NZTAComponents.router.navigate(layerId + '/' + feature.properties.id, { trigger: true });
                    });
                },
                style: geoJsonCollection._style
            });

            // Add each geoJson feature to the new layer.
            _.each(geoJsonCollection.models, function (geoJsonModel) {
                geoJsonLayer.addData(geoJsonModel.attributes);
            });

            mapLayer.markers.addLayer(geoJsonLayer);
        },

        /**
         * @func _addMapLayer
         * @param {string} layerId - The ID of the layer as it would be in this.mapLayers.
         * @example The layerId should match the GeoJsonCollection name.
         * // 'cameras'
         */
        _addMapLayer: function (layerId) {
            var geoJsonCollection = this.model[layerId],
                mapLayer = {};

            mapLayer.id = layerId;
            mapLayer.markers = L.markerClusterGroup({ 
                showCoverageOnHover: false,
                iconCreateFunction: function (cluster) {
                    var html = '<div class="' + geoJsonCollection._iconClass + '"><div class="cluster-count">' + cluster.getChildCount() + '</div></div>';

                    return L.divIcon({html: html});
                }
            });

            this.map.addLayer(mapLayer.markers);

            this.mapLayers.push(mapLayer);

            this._updateMapLayer(layerId);
        },

        /**
         * @func _addMapLayer
         * @param {string} layerId - The ID of the layer in this.mapLayers you want to remove.
         * @example The layerId should match the GeoJsonCollection collection name.
         * // 'cameras'
         */
        _removeMapLayer: function (layerId) {
            var geoJsonLayer = this._getMapLayerById(layerId);

            geoJsonLayer.markers.clearLayers();
        },

        _mapLayerVisible: function (layerId) {
            var mapLayer = this._getMapLayerById(layerId),
                markersArray;

            // If the layer doesn't exist, it's not visible.
            if (mapLayer === void 0) {
                return false;
            }

            markersArray = mapLayer.markers.getLayers();

            return mapLayer !== void 0 && markersArray.length > 0;
        },

        _startPolling: function (interval) {
            this.model._startPolling(interval);
        },

        _stopPolling: function () {
            this.model._stopPolling();
        }

    });
    Cocktail.mixin(NZTAComponents.MapView, eventsMixin, browserHelpersMixin);

    /**
     * @module PopupModel
     * @extends Backbone.Model
     * @desc The model for {@link PopupView}.
     */
    NZTAComponents.PopupModel = Backbone.Model.extend({

        defaults: {
            hidden: true,
            featureType: null // Used for conditional template switching.
        },

        initialize: function () {
            this.feature = new NZTAComponents.GeoJsonModel();
        }

    });

    /**
     * @module PopupView
     * @extends Marionette.LayoutView
     * @param {object} vent - Backbone.Wreqr.EventAggregator instance.
     * @desc Used for displaying detailed information about a Map feature.
     */
    NZTAComponents.PopupView = Backbone.Marionette.LayoutView.extend({

        events: {
            'click .close': '_closePopup'
        },

        /**
         * @func initialize
         * @param {object} [options]
         * @param {object} [options.model] - Backbone.Model instance.
         */
        initialize: function (options) {
            this.model = (options !== void 0 && options.model !== void 0) ? options.model : new NZTAComponents.PopupModel();
        },

        templateHelpers: function () {
            var self = this;

            return {
                feature: self.model.feature.get('properties') || {}
            };
        },

        /**
         * @func onRender
         * @override
         */
        onRender: function () {
            if (this.model.get('hidden') === false) {
                // Add a display class to <body> which animates the Popup into view and hides the Sidebar.
                // Not an ideal solution, but it's how the Pattern Library works.
                // We're using a _.defer to apply the CSS class after rendering happens.
                // This is because the popup needs to transition into view, and adding the
                // class during the render cycle means the animation doesn't happen.
                _.defer(function () {
                    Backbone.$('body').addClass('modal-active');
                });
            } else {
                _.defer(function () {
                    Backbone.$('body').removeClass('modal-active');
                });
            }
        },

        /**
         * @func _openPopup
         * @param {Object} featureModel - Backbone Model representing the feature.
         * @desc Open the Popup and display some feature data.
         */
        _openPopup: function (featureModel) {
            this.model.set({
                'hidden': false,
                'featureType': featureModel.get('properties').featureType
            });

            this.model.feature = featureModel;

            this.render();

            this.options.vent.trigger('popup.afterOpen', this.model.feature);
        },

        /**
         * @func _closePopup
         * @desc Close the popup and reset it's state.
         */
        _closePopup: function () {
            var backFragment = router._previousFragment !== null ? router._previousFragment : '';

            // Reset the model
            this.model.set({
                'hidden': true
            });

            this.render();

            router.navigate(backFragment, { trigger: false });
            router._previousFragment = null;

            this.options.vent.trigger('popup.afterClose');
        }
    });
    Cocktail.mixin(NZTAComponents.PopupView, eventsMixin, browserHelpersMixin);

    /**
     * @module router
     * @extends Marionette.AppRouter
     * @desc A singleton router instance.
     */
    NZTAComponents.router = router;

    /**
     * @module UserControlsView
     * @extends Marionette.ItemView
     * @param {object} vent - Backbone.Wreqr.EventAggregator instance.
     * @desc User controls for the Map.
     */
    NZTAComponents.UserControlsView = Backbone.Marionette.ItemView.extend({

        /**
         * @func initialize
         * @param {object} [options]
         * @param {object} [options.model] - Backbone.Model instance.
         */
        initialize: function (options) {
            this.model = (options !== void 0 && options.model !== void 0) ? options.model : new Backbone.Model();

            this.model.set('mapLayerFiltersOpen', false);
        },

        events: {
            'click #zoomIn': '_zoomIn',
            'click #zoomOut': '_zoomOut',
            'click #locate': '_locateUser',
            'click #mapLayerFilters': '_toggleMapLayerFilters',
            'click #mobile-control-map-button': '_handleMobileControlMapButton',
            'click #mobile-control-list-button': '_handleMobileControlListButton',
            'click .map-layer-filter': '_toggleMapLayer'
        },

        /**
         * @func _zoomIn
         * @desc Zooms the Map in.
         */
        _zoomIn: function () {
            this.options.vent.trigger('userControls.zoomIn');
        },

        /**
         * @func _zoomOut
         * @desc Zooms the Map out.
         */
        _zoomOut: function () {
            this.options.vent.trigger('userControls.zoomOut');
        },

        /**
         * @func _locateUser
         * @desc Pan to the user's location on the Map.
         */
        _locateUser: function () {
            this.options.vent.trigger('userControls.locateUser');
        },

        /**
         * @func _toggleMapLayerFilters
         * @desc Shows / hides the layer checkboxes.
         */
        _toggleMapLayerFilters: function () {
            // Toggle the mapLayerFiltersOpen value.
            this.model.set('mapLayerFiltersOpen', this.model.get('mapLayerFiltersOpen') === false);

            $('body').toggleClass('tools-active');
        },

        /**
         * @func _toggleMapLayer
         * @param {object} e - An event object.
         * @desc Trigger an events which toggles a map layer.
         */
        _toggleMapLayer: function (e) {
            this.options.vent.trigger('userControls.toggleMapLayer', Backbone.$(e.currentTarget).data('layer'));
        },

        /**
         * @func _handleMobileControlMapButton
         * @desc Hides the mobile specific controls.
         */
        _handleMobileControlMapButton: function () {
            $('body').removeClass('list-active');
        },

        /**
         * @func _handleMobileControlListButton
         * @desc Shows the mobile specific controls.
         */
        _handleMobileControlListButton: function () {
            $('body').addClass('list-active');
        }
    });
    Cocktail.mixin(NZTAComponents.UserControlsView, eventsMixin, browserHelpersMixin);

    return NZTAComponents;
}));
