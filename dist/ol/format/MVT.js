/**
 * @module ol/format/MVT
 */
//FIXME Implement projection handling

import {assert} from '../asserts.js';
import PBF from 'pbf';
import FeatureFormat, {transformWithOptions} from '../format/Feature.js';
import FormatType from '../format/FormatType.js';
import GeometryLayout from '../geom/GeometryLayout.js';
import GeometryType from '../geom/GeometryType.js';
import LineString from '../geom/LineString.js';
import MultiLineString from '../geom/MultiLineString.js';
import MultiPoint from '../geom/MultiPoint.js';
import MultiPolygon from '../geom/MultiPolygon.js';
import Point from '../geom/Point.js';
import Polygon from '../geom/Polygon.js';
import {linearRingIsClockwise} from '../geom/flat/orient.js';
import Projection from '../proj/Projection.js';
import Units from '../proj/Units.js';
import RenderFeature from '../render/Feature.js';


/**
 * @typedef {Object} Options
 * @property {function((module:ol/geom/Geometry|Object<string,*>)=)|function(module:ol/geom/GeometryType,Array<number>,(Array<number>|Array<Array<number>>),Object<string,*>,number)} [featureClass]
 * Class for features returned by {@link module:ol/format/MVT#readFeatures}. Set to
 * {@link module:ol/Feature~Feature} to get full editing and geometry support at the cost of
 * decreased rendering performance. The default is {@link module:ol/render/Feature~RenderFeature},
 * which is optimized for rendering and hit detection.
 * @property {string} [geometryName='geometry'] Geometry name to use when creating
 * features.
 * @property {string} [layerName='layer'] Name of the feature attribute that
 * holds the layer name.
 * @property {Array<string>} [layers] Layers to read features from. If not
 * provided, features will be read from all layers.
 */


/**
 * @classdesc
 * Feature format for reading data in the Mapbox MVT format.
 *
 * @param {module:ol/format/MVT~Options=} opt_options Options.
 * @api
 */
var MVT = (function (FeatureFormat) {
  function MVT(opt_options) {
    FeatureFormat.call(this);

    var options = opt_options ? opt_options : {};

    /**
     * @type {module:ol/proj/Projection}
     */
    this.dataProjection = new Projection({
      code: '',
      units: Units.TILE_PIXELS
    });

    /**
     * @private
     * @type {function((module:ol/geom/Geometry|Object<string,*>)=)|
     *     function(module:ol/geom/GeometryType,Array<number>,
     *         (Array<number>|Array<Array<number>>),Object<string,*>,number)}
     */
    this.featureClass_ = options.featureClass ?
      options.featureClass : RenderFeature;

    /**
     * @private
     * @type {string|undefined}
     */
    this.geometryName_ = options.geometryName;

    /**
     * @private
     * @type {string}
     */
    this.layerName_ = options.layerName ? options.layerName : 'layer';

    /**
     * @private
     * @type {Array<string>}
     */
    this.layers_ = options.layers ? options.layers : null;

    /**
     * @private
     * @type {module:ol/extent~Extent}
     */
    this.extent_ = null;

  }

  if ( FeatureFormat ) MVT.__proto__ = FeatureFormat;
  MVT.prototype = Object.create( FeatureFormat && FeatureFormat.prototype );
  MVT.prototype.constructor = MVT;

  /**
   * Read the raw geometry from the pbf offset stored in a raw feature's geometry
   * property.
   * @suppress {missingProperties}
   * @param {Object} pbf PBF.
   * @param {Object} feature Raw feature.
   * @param {Array<number>} flatCoordinates Array to store flat coordinates in.
   * @param {Array<number>} ends Array to store ends in.
   * @private
   */
  MVT.prototype.readRawGeometry_ = function readRawGeometry_ (pbf, feature, flatCoordinates, ends) {
    pbf.pos = feature.geometry;

    var end = pbf.readVarint() + pbf.pos;
    var cmd = 1;
    var length = 0;
    var x = 0;
    var y = 0;
    var coordsLen = 0;
    var currentEnd = 0;

    while (pbf.pos < end) {
      if (!length) {
        var cmdLen = pbf.readVarint();
        cmd = cmdLen & 0x7;
        length = cmdLen >> 3;
      }

      length--;

      if (cmd === 1 || cmd === 2) {
        x += pbf.readSVarint();
        y += pbf.readSVarint();

        if (cmd === 1) { // moveTo
          if (coordsLen > currentEnd) {
            ends.push(coordsLen);
            currentEnd = coordsLen;
          }
        }

        flatCoordinates.push(x, y);
        coordsLen += 2;

      } else if (cmd === 7) {

        if (coordsLen > currentEnd) {
          // close polygon
          flatCoordinates.push(
            flatCoordinates[currentEnd], flatCoordinates[currentEnd + 1]);
          coordsLen += 2;
        }

      } else {
        assert(false, 59); // Invalid command found in the PBF
      }
    }

    if (coordsLen > currentEnd) {
      ends.push(coordsLen);
      currentEnd = coordsLen;
    }

  };

  /**
   * @private
   * @param {Object} pbf PBF
   * @param {Object} rawFeature Raw Mapbox feature.
   * @param {module:ol/format/Feature~ReadOptions=} opt_options Read options.
   * @return {module:ol/Feature|module:ol/render/Feature} Feature.
   */
  MVT.prototype.createFeature_ = function createFeature_ (pbf, rawFeature, opt_options) {
    var type = rawFeature.type;
    if (type === 0) {
      return null;
    }

    var feature;
    var id = rawFeature.id;
    var values = rawFeature.properties;
    values[this.layerName_] = rawFeature.layer.name;

    var flatCoordinates = [];
    var ends = [];
    this.readRawGeometry_(pbf, rawFeature, flatCoordinates, ends);

    var geometryType = getGeometryType(type, ends.length);

    if (this.featureClass_ === RenderFeature) {
      feature = new this.featureClass_(geometryType, flatCoordinates, ends, values, id);
    } else {
      var geom;
      if (geometryType == GeometryType.POLYGON) {
        var endss = [];
        var offset = 0;
        var prevEndIndex = 0;
        for (var i = 0, ii = ends.length; i < ii; ++i) {
          var end = ends[i];
          if (!linearRingIsClockwise(flatCoordinates, offset, end, 2)) {
            endss.push(ends.slice(prevEndIndex, i));
            prevEndIndex = i;
          }
          offset = end;
        }
        if (endss.length > 1) {
          geom = new MultiPolygon(flatCoordinates, GeometryLayout.XY, endss);
        } else {
          geom = new Polygon(flatCoordinates, GeometryLayout.XY, ends);
        }
      } else {
        geom = geometryType === GeometryType.POINT ? new Point(flatCoordinates, GeometryLayout.XY) :
          geometryType === GeometryType.LINE_STRING ? new LineString(flatCoordinates, GeometryLayout.XY) :
            geometryType === GeometryType.POLYGON ? new Polygon(flatCoordinates, GeometryLayout.XY, ends) :
              geometryType === GeometryType.MULTI_POINT ? new MultiPoint(flatCoordinates, GeometryLayout.XY) :
                geometryType === GeometryType.MULTI_LINE_STRING ? new MultiLineString(flatCoordinates, GeometryLayout.XY, ends) :
                  null;
      }
      feature = new this.featureClass_();
      if (this.geometryName_) {
        feature.setGeometryName(this.geometryName_);
      }
      var geometry = transformWithOptions(geom, false, this.adaptOptions(opt_options));
      feature.setGeometry(geometry);
      feature.setId(id);
      feature.setProperties(values);
    }

    return feature;
  };

  /**
   * @inheritDoc
   * @api
   */
  MVT.prototype.getLastExtent = function getLastExtent () {
    return this.extent_;
  };

  /**
   * @inheritDoc
   */
  MVT.prototype.getType = function getType () {
    return FormatType.ARRAY_BUFFER;
  };

  /**
   * @inheritDoc
   * @api
   */
  MVT.prototype.readFeatures = function readFeatures (source, opt_options) {
    var this$1 = this;

    var layers = this.layers_;

    var pbf = new PBF(/** @type {ArrayBuffer} */ (source));
    var pbfLayers = pbf.readFields(layersPBFReader, {});
    /** @type {Array<module:ol/Feature|module:ol/render/Feature>} */
    var features = [];
    for (var name in pbfLayers) {
      if (layers && layers.indexOf(name) == -1) {
        continue;
      }
      var pbfLayer = pbfLayers[name];

      for (var i = 0, ii = pbfLayer.length; i < ii; ++i) {
        var rawFeature = readRawFeature(pbf, pbfLayer, i);
        features.push(this$1.createFeature_(pbf, rawFeature));
      }
      this$1.extent_ = pbfLayer ? [0, 0, pbfLayer.extent, pbfLayer.extent] : null;
    }

    return features;
  };

  /**
   * @inheritDoc
   * @api
   */
  MVT.prototype.readProjection = function readProjection (source) {
    return this.dataProjection;
  };

  /**
   * Sets the layers that features will be read from.
   * @param {Array<string>} layers Layers.
   * @api
   */
  MVT.prototype.setLayers = function setLayers (layers) {
    this.layers_ = layers;
  };

  return MVT;
}(FeatureFormat));


/**
 * Reader callback for parsing layers.
 * @param {number} tag The tag.
 * @param {Object} layers The layers object.
 * @param {Object} pbf The PBF.
 */
function layersPBFReader(tag, layers, pbf) {
  if (tag === 3) {
    var layer = {
      keys: [],
      values: [],
      features: []
    };
    var end = pbf.readVarint() + pbf.pos;
    pbf.readFields(layerPBFReader, layer, end);
    layer.length = layer.features.length;
    if (layer.length) {
      layers[layer.name] = layer;
    }
  }
}

/**
 * Reader callback for parsing layer.
 * @param {number} tag The tag.
 * @param {Object} layer The layer object.
 * @param {Object} pbf The PBF.
 */
function layerPBFReader(tag, layer, pbf) {
  if (tag === 15) {
    layer.version = pbf.readVarint();
  } else if (tag === 1) {
    layer.name = pbf.readString();
  } else if (tag === 5) {
    layer.extent = pbf.readVarint();
  } else if (tag === 2) {
    layer.features.push(pbf.pos);
  } else if (tag === 3) {
    layer.keys.push(pbf.readString());
  } else if (tag === 4) {
    var value = null;
    var end = pbf.readVarint() + pbf.pos;
    while (pbf.pos < end) {
      tag = pbf.readVarint() >> 3;
      value = tag === 1 ? pbf.readString() :
        tag === 2 ? pbf.readFloat() :
          tag === 3 ? pbf.readDouble() :
            tag === 4 ? pbf.readVarint64() :
              tag === 5 ? pbf.readVarint() :
                tag === 6 ? pbf.readSVarint() :
                  tag === 7 ? pbf.readBoolean() : null;
    }
    layer.values.push(value);
  }
}

/**
 * Reader callback for parsing feature.
 * @param {number} tag The tag.
 * @param {Object} feature The feature object.
 * @param {Object} pbf The PBF.
 */
function featurePBFReader(tag, feature, pbf) {
  if (tag == 1) {
    feature.id = pbf.readVarint();
  } else if (tag == 2) {
    var end = pbf.readVarint() + pbf.pos;
    while (pbf.pos < end) {
      var key = feature.layer.keys[pbf.readVarint()];
      var value = feature.layer.values[pbf.readVarint()];
      feature.properties[key] = value;
    }
  } else if (tag == 3) {
    feature.type = pbf.readVarint();
  } else if (tag == 4) {
    feature.geometry = pbf.pos;
  }
}


/**
 * Read a raw feature from the pbf offset stored at index `i` in the raw layer.
 * @suppress {missingProperties}
 * @param {Object} pbf PBF.
 * @param {Object} layer Raw layer.
 * @param {number} i Index of the feature in the raw layer's `features` array.
 * @return {Object} Raw feature.
 */
function readRawFeature(pbf, layer, i) {
  pbf.pos = layer.features[i];
  var end = pbf.readVarint() + pbf.pos;

  var feature = {
    layer: layer,
    type: 0,
    properties: {}
  };
  pbf.readFields(featurePBFReader, feature, end);
  return feature;
}


/**
 * @suppress {missingProperties}
 * @param {number} type The raw feature's geometry type
 * @param {number} numEnds Number of ends of the flat coordinates of the
 * geometry.
 * @return {module:ol/geom/GeometryType} The geometry type.
 */
function getGeometryType(type, numEnds) {
  /** @type {module:ol/geom/GeometryType} */
  var geometryType;
  if (type === 1) {
    geometryType = numEnds === 1 ?
      GeometryType.POINT : GeometryType.MULTI_POINT;
  } else if (type === 2) {
    geometryType = numEnds === 1 ?
      GeometryType.LINE_STRING :
      GeometryType.MULTI_LINE_STRING;
  } else if (type === 3) {
    geometryType = GeometryType.POLYGON;
    // MultiPolygon not relevant for rendering - winding order determines
    // outer rings of polygons.
  }
  return geometryType;
}

export default MVT;

//# sourceMappingURL=MVT.js.map