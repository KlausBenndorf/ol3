/**
 * @module ol/format/IGC
 */
import Feature from '../Feature.js';
import {transformWithOptions} from '../format/Feature.js';
import TextFeature from '../format/TextFeature.js';
import GeometryLayout from '../geom/GeometryLayout.js';
import LineString from '../geom/LineString.js';
import {get as getProjection} from '../proj.js';

/**
 * IGC altitude/z. One of 'barometric', 'gps', 'none'.
 * @enum {string}
 */
var IGCZ = {
  BAROMETRIC: 'barometric',
  GPS: 'gps',
  NONE: 'none'
};

/**
 * @const
 * @type {RegExp}
 */
var B_RECORD_RE =
    /^B(\d{2})(\d{2})(\d{2})(\d{2})(\d{5})([NS])(\d{3})(\d{5})([EW])([AV])(\d{5})(\d{5})/;


/**
 * @const
 * @type {RegExp}
 */
var H_RECORD_RE = /^H.([A-Z]{3}).*?:(.*)/;


/**
 * @const
 * @type {RegExp}
 */
var HFDTE_RECORD_RE = /^HFDTE(\d{2})(\d{2})(\d{2})/;


/**
 * A regular expression matching the newline characters `\r\n`, `\r` and `\n`.
 *
 * @const
 * @type {RegExp}
 */
var NEWLINE_RE = /\r\n|\r|\n/;


/**
 * @typedef {Object} Options
 * @property {IGCZ|string} [altitudeMode='none'] Altitude mode. Possible
 * values are `'barometric'`, `'gps'`, and `'none'`.
 */


/**
 * @classdesc
 * Feature format for `*.igc` flight recording files.
 *
 * As IGC sources contain a single feature,
 * {@link module:ol/format/IGC~IGC#readFeatures} will return the feature in an
 * array
 *
 * @api
 */
var IGC = (function (TextFeature) {
  function IGC(opt_options) {
    TextFeature.call(this);

    var options = opt_options ? opt_options : {};

    /**
     * @inheritDoc
     */
    this.dataProjection = getProjection('EPSG:4326');

    /**
     * @private
     * @type {IGCZ}
     */
    this.altitudeMode_ = options.altitudeMode ? options.altitudeMode : IGCZ.NONE;
  }

  if ( TextFeature ) IGC.__proto__ = TextFeature;
  IGC.prototype = Object.create( TextFeature && TextFeature.prototype );
  IGC.prototype.constructor = IGC;

  /**
   * @inheritDoc
   */
  IGC.prototype.readFeatureFromText = function readFeatureFromText (text, opt_options) {
    var altitudeMode = this.altitudeMode_;
    var lines = text.split(NEWLINE_RE);
    /** @type {Object<string, string>} */
    var properties = {};
    var flatCoordinates = [];
    var year = 2000;
    var month = 0;
    var day = 1;
    var lastDateTime = -1;
    var i, ii;
    for (i = 0, ii = lines.length; i < ii; ++i) {
      var line = lines[i];
      var m = (void 0);
      if (line.charAt(0) == 'B') {
        m = B_RECORD_RE.exec(line);
        if (m) {
          var hour = parseInt(m[1], 10);
          var minute = parseInt(m[2], 10);
          var second = parseInt(m[3], 10);
          var y = parseInt(m[4], 10) + parseInt(m[5], 10) / 60000;
          if (m[6] == 'S') {
            y = -y;
          }
          var x = parseInt(m[7], 10) + parseInt(m[8], 10) / 60000;
          if (m[9] == 'W') {
            x = -x;
          }
          flatCoordinates.push(x, y);
          if (altitudeMode != IGCZ.NONE) {
            var z = (void 0);
            if (altitudeMode == IGCZ.GPS) {
              z = parseInt(m[11], 10);
            } else if (altitudeMode == IGCZ.BAROMETRIC) {
              z = parseInt(m[12], 10);
            } else {
              z = 0;
            }
            flatCoordinates.push(z);
          }
          var dateTime = Date.UTC(year, month, day, hour, minute, second);
          // Detect UTC midnight wrap around.
          if (dateTime < lastDateTime) {
            dateTime = Date.UTC(year, month, day + 1, hour, minute, second);
          }
          flatCoordinates.push(dateTime / 1000);
          lastDateTime = dateTime;
        }
      } else if (line.charAt(0) == 'H') {
        m = HFDTE_RECORD_RE.exec(line);
        if (m) {
          day = parseInt(m[1], 10);
          month = parseInt(m[2], 10) - 1;
          year = 2000 + parseInt(m[3], 10);
        } else {
          m = H_RECORD_RE.exec(line);
          if (m) {
            properties[m[1]] = m[2].trim();
          }
        }
      }
    }
    if (flatCoordinates.length === 0) {
      return null;
    }
    var layout = altitudeMode == IGCZ.NONE ? GeometryLayout.XYM : GeometryLayout.XYZM;
    var lineString = new LineString(flatCoordinates, layout);
    var feature = new Feature(transformWithOptions(lineString, false, opt_options));
    feature.setProperties(properties);
    return feature;
  };

  /**
   * @inheritDoc
   */
  IGC.prototype.readFeaturesFromText = function readFeaturesFromText (text, opt_options) {
    var feature = this.readFeatureFromText(text, opt_options);
    if (feature) {
      return [feature];
    } else {
      return [];
    }
  };

  return IGC;
}(TextFeature));

export default IGC;

//# sourceMappingURL=IGC.js.map