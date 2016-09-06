goog.provide('ol.interaction.Select');
goog.provide('ol.interaction.SelectEvent');
goog.provide('ol.interaction.SelectEventType');

goog.require('goog.asserts');
goog.require('ol');
goog.require('ol.functions');
goog.require('ol.Collection');
goog.require('ol.Feature');
goog.require('ol.array');
goog.require('ol.events');
goog.require('ol.events.Event');
goog.require('ol.events.condition');
goog.require('ol.geom.GeometryType');
goog.require('ol.interaction.Interaction');
goog.require('ol.style.Style');

/**
 * @enum {string}
 */
ol.interaction.SelectEventType = {
  /**
   * Triggered when feature(s) has been (de)selected.
   * @event ol.interaction.SelectEvent#select
   * @api
   */
  SELECT: 'select'
};


/**
 * @classdesc
 * Events emitted by {@link ol.interaction.Select} instances are instances of
 * this type.
 *
 * @param {string} type The event type.
 * @param {Array.<ol.Feature>} selected Selected features.
 * @param {Array.<ol.Feature>} deselected Deselected features.
 * @param {ol.MapBrowserEvent} mapBrowserEvent Associated
 *     {@link ol.MapBrowserEvent}.
 * @implements {oli.SelectEvent}
 * @extends {ol.events.Event}
 * @constructor
 */
ol.interaction.SelectEvent = function(type, selected, deselected, mapBrowserEvent) {
  ol.events.Event.call(this, type);

  /**
   * Selected features array.
   * @type {Array.<ol.Feature>}
   * @api
   */
  this.selected = selected;

  /**
   * Deselected features array.
   * @type {Array.<ol.Feature>}
   * @api
   */
  this.deselected = deselected;

  /**
   * Associated {@link ol.MapBrowserEvent}.
   * @type {ol.MapBrowserEvent}
   * @api
   */
  this.mapBrowserEvent = mapBrowserEvent;
};
ol.inherits(ol.interaction.SelectEvent, ol.events.Event);


/**
 * @classdesc
 * Interaction for selecting vector features. By default, selected features are
 * styled differently, so this interaction can be used for visual highlighting,
 * as well as selecting features for other actions, such as modification or
 * output. There are three ways of controlling which features are selected:
 * using the browser event as defined by the `condition` and optionally the
 * `toggle`, `add`/`remove`, and `multi` options; a `layers` filter; and a
 * further feature filter using the `filter` option.
 *
 * Selected features are added to an internal unmanaged layer.
 *
 * @constructor
 * @extends {ol.interaction.Interaction}
 * @param {olx.interaction.SelectOptions=} opt_options Options.
 * @fires ol.interaction.SelectEvent
 * @api stable
 */
ol.interaction.Select = function(opt_options) {

  ol.interaction.Interaction.call(this, {
    handleEvent: ol.interaction.Select.handleEvent
  });

  var options = opt_options ? opt_options : {};

  /**
   * @private
   * @type {ol.EventsConditionType}
   */
  this.condition_ = options.condition ?
      options.condition : ol.events.condition.singleClick;

  /**
   * @private
   * @type {ol.EventsConditionType}
   */
  this.addCondition_ = options.addCondition ?
      options.addCondition : ol.events.condition.never;

  /**
   * @private
   * @type {ol.EventsConditionType}
   */
  this.removeCondition_ = options.removeCondition ?
      options.removeCondition : ol.events.condition.never;

  /**
   * @private
   * @type {ol.EventsConditionType}
   */
  this.toggleCondition_ = options.toggleCondition ?
      options.toggleCondition : ol.events.condition.shiftKeyOnly;

  /**
   * @private
   * @type {boolean}
   */
  this.multi_ = options.multi ? options.multi : false;

  /**
   * @private
   * @type {ol.SelectFilterFunction}
   */
  this.filter_ = options.filter ? options.filter :
      ol.functions.TRUE;

  var style = options.style;

  if (style !== undefined) {
    if (goog.isFunction(style)) {
      style = function(resolution) {
        return /** @type {ol.StyleFunction} */ (style)(this, resolution);
      };
    }
  } else {
    style = ol.interaction.Select.getDefaultStyleFunction();
  }

  /**
   * @private
   * @type {ol.style.Style|Array.<ol.style.Style>|ol.FeatureStyleFunction|null}
   */
  this.style_ = style;

  /**
   * An association between selected feature (key)
   * and original style (value)
   * @private
   * @type {Object.<number, ol.style.Style|Array.<ol.style.Style>|ol.FeatureStyleFunction>}
   */
  this.featureStyleAssociation_ = {};

  /**
   * @private
   * @type {ol.Collection}
   */
  this.features_ = options.features || new ol.Collection();

  /** @type {function(ol.layer.Layer): boolean} */
  var layerFilter;
  if (options.layers) {
    if (typeof options.layers === 'function') {
      layerFilter = options.layers;
    } else {
      var layers = options.layers;
      layerFilter = function(layer) {
        goog.asserts.assertFunction(options.layers);
        return ol.array.includes(layers, layer);
      };
    }
  } else {
    layerFilter = ol.functions.TRUE;
  }

  /**
   * @private
   * @type {function(ol.layer.Layer): boolean}
   */
  this.layerFilter_ = layerFilter;

  ol.events.listen(this.features_, ol.Collection.EventType.ADD,
    this.addFeature_, this);
  ol.events.listen(this.features_, ol.Collection.EventType.REMOVE,
    this.removeFeature_, this);

};
ol.inherits(ol.interaction.Select, ol.interaction.Interaction);


/**
 * @param {ol.Collection.Event} evt Event.
 * @private
 */
ol.interaction.Select.prototype.addFeature_ = function(evt) {
  var feature = evt.element;
  goog.asserts.assertInstanceof(feature, ol.Feature,
    'feature should be an ol.Feature');
  if (this.style_) {
    this.giveSelectedStyle_(feature);
  }
};


/**
 * Deselects the given features and fires a select event.
 * @param {Array.<ol.Feature>} deselected Features.
 * @api stable
 */
ol.interaction.Select.prototype.deselect = function(deselected) {
  if (deselected.length > 0) {
    var i;
    for (i = deselected.length - 1; i >= 0; --i) {
      this.features_.remove(deselected[i]);
    }
    this.dispatchEvent(
      new ol.interaction.SelectEvent(ol.interaction.SelectEventType.SELECT,
        [], deselected, null));
  }
};


/**
 * Get the selected features.
 * @return {ol.Collection.<ol.Feature>} Features collection.
 * @api stable
 */
ol.interaction.Select.prototype.getFeatures = function() {
  return this.features_;
};


/**
 * @param {ol.Feature} feature Feature
 * @private
 */
ol.interaction.Select.prototype.giveSelectedStyle_ = function(feature) {
  var key = ol.getUid(feature);
  this.featureStyleAssociation_[key] = feature.getStyle();
  feature.setStyle(this.style_);
};


/**
 * Handles the {@link ol.MapBrowserEvent map browser event} and may change the
 * selected state of features.
 * @param {ol.MapBrowserEvent} mapBrowserEvent Map browser event.
 * @return {boolean} `false` to stop event propagation.
 * @this {ol.interaction.Select}
 * @api
 */
ol.interaction.Select.handleEvent = function(mapBrowserEvent) {
  if (!this.condition_(mapBrowserEvent)) {
    return true;
  }
  var add = this.addCondition_(mapBrowserEvent);
  var remove = this.removeCondition_(mapBrowserEvent);
  var toggle = this.toggleCondition_(mapBrowserEvent);
  var set = !add && !remove && !toggle;
  var map = mapBrowserEvent.map;
  var features = this.features_;
  var deselected = [];
  var selected = [];
  if (set) {
    // Replace the currently selected feature(s) with the feature(s) at the
    // pixel, or clear the selected feature(s) if there is no feature at
    // the pixel.
    map.forEachFeatureAtPixel(mapBrowserEvent.pixel,
        /**
         * @param {ol.Feature|ol.render.Feature} feature Feature.
         * @param {ol.layer.Layer} layer Layer.
         * @return {boolean|undefined} Continue to iterate over the features.
         */
        function(feature, layer) {
          if (this.filter_(feature, layer)) {
            selected.push(feature);
            return !this.multi_;
          }
        }, this, this.layerFilter_);
    var i;
    for (i = features.getLength() - 1; i >= 0; --i) {
      var feature = features.item(i);
      var index = selected.indexOf(feature);
      if (index > -1) {
        // feature is already selected
        selected.splice(index, 1);
      } else {
        features.remove(feature);
        deselected.push(feature);
      }
    }
    if (selected.length !== 0) {
      features.extend(selected);
    }
  } else {
    // Modify the currently selected feature(s).
    map.forEachFeatureAtPixel(mapBrowserEvent.pixel,
        /**
         * @param {ol.Feature|ol.render.Feature} feature Feature.
         * @param {ol.layer.Layer} layer Layer.
         * @return {boolean|undefined} Continue to iterate over the features.
         */
        function(feature, layer) {
          if (this.filter_(feature, layer)) {
            if ((add || toggle) &&
                !ol.array.includes(features.getArray(), feature)) {
              selected.push(feature);
            } else if ((remove || toggle) &&
                ol.array.includes(features.getArray(), feature)) {
              deselected.push(feature);
            }
            return !this.multi_;
          }
        }, this, this.layerFilter_);
    var j;
    for (j = deselected.length - 1; j >= 0; --j) {
      features.remove(deselected[j]);
    }
    features.extend(selected);
  }
  if (selected.length > 0 || deselected.length > 0) {
    this.dispatchEvent(
        new ol.interaction.SelectEvent(ol.interaction.SelectEventType.SELECT,
            selected, deselected, mapBrowserEvent));
  }
  return ol.events.condition.pointerMove(mapBrowserEvent);
};


/**
 * @param {ol.Feature} feature Feature
 * @private
 */
ol.interaction.Select.prototype.removeSelectedStyle_ = function(feature) {
  var key = goog.getUid(feature);
  feature.setStyle(this.featureStyleAssociation_[key]);
  delete this.featureStyleAssociation_[key];
};


/**
 * Selects the given features and fires a select event.
 * @param {Array.<ol.Feature>} selected Features.
 * @api stable
 */
ol.interaction.Select.prototype.select = function(selected) {
  if (selected.length > 0) {
    this.features_.extend(selected);
    this.dispatchEvent(
      new ol.interaction.SelectEvent(ol.interaction.SelectEventType.SELECT,
        selected, [], null));
  }
};


/**
 * Remove the interaction from its current map, if any,  and attach it to a new
 * map, if any. Pass `null` to just remove the interaction from the current map.
 * @param {ol.Map} map Map.
 * @api stable
 */
ol.interaction.Select.prototype.setMap = function(map) {
  var currentMap = this.getMap();
  if (currentMap && this.style_) {
    this.features_.forEach(this.removeSelectedStyle_, this);
  }
  ol.interaction.Interaction.prototype.setMap.call(this, map);
  if (map && this.style_) {
    this.features_.forEach(this.giveSelectedStyle_, this);
  }
};


/**
 * @return {ol.FeatureStyleFunction} Styles.
 */
ol.interaction.Select.getDefaultStyleFunction = function() {
  var styles = ol.style.Style.createDefaultEditing();
  ol.array.extend(styles[ol.geom.GeometryType.POLYGON],
      styles[ol.geom.GeometryType.LINE_STRING]);
  ol.array.extend(styles[ol.geom.GeometryType.GEOMETRY_COLLECTION],
      styles[ol.geom.GeometryType.LINE_STRING]);

  return function(resolution) {
    return styles[this.getGeometry().getType()];
  };
};


/**
 * @param {ol.Collection.Event} evt Event.
 * @private
 */
ol.interaction.Select.prototype.removeFeature_ = function(evt) {
  var feature = /** @type {ol.Feature} */ (evt.element);
  if (this.style_) {
    this.removeSelectedStyle_(feature);
  }
};
