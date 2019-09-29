import ImageWrapper from '../../../../src/ol/Image.js';
import Map from '../../../../src/ol/Map.js';
import View from '../../../../src/ol/View.js';
import Layer from '../../../../src/ol/layer/Layer.js';
import TileLayer from '../../../../src/ol/layer/Tile.js';
import ImageLayer from '../../../../src/ol/layer/Image.js';
import LayerRenderer from '../../../../src/ol/renderer/Layer.js';
import XYZ from '../../../../src/ol/source/XYZ.js';
import {fromKey} from '../../../../src/ol/tilecoord.js';
import Static from '../../../../src/ol/source/ImageStatic.js';

const redPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQYV2P4z8Dw'
  + 'HwAFAAH/plybXQAAAABJRU5ErkJggg==';

describe('ol.renderer.Layer', function() {
  let renderer;
  const eventType = 'change';

  beforeEach(function() {
    const layer = new Layer({});
    renderer = new LayerRenderer(layer);
  });

  describe('#loadImage', function() {
    let image;
    let imageLoadFunction;

    beforeEach(function() {
      const extent = [];
      const resolution = 1;
      const pixelRatio = 1;
      const src = '';
      const crossOrigin = '';
      imageLoadFunction = sinon.spy();
      image = new ImageWrapper(extent, resolution, pixelRatio, src, crossOrigin, imageLoadFunction);
    });

    describe('load IDLE image', function() {

      it('returns false', function() {
        const loaded = renderer.loadImage(image);
        expect(loaded).to.be(false);
      });

      it('registers a listener', function() {
        renderer.loadImage(image);
        const listeners = image.listeners_[eventType];
        expect(listeners).to.have.length(1);
      });

    });

    describe('load LOADED image', function() {

      it('returns true', function() {
        image.state = 2; // LOADED
        const loaded = renderer.loadImage(image);
        expect(loaded).to.be(true);
      });

      it('does not register a listener', function() {
        image.state = 2; // LOADED
        const loaded = renderer.loadImage(image);
        expect(loaded).to.be(true);
      });

    });

    describe('load LOADING image', function() {

      beforeEach(function() {
        renderer.loadImage(image);
        expect(image.getState()).to.be(1); // LOADING
      });

      it('returns false', function() {
        const loaded = renderer.loadImage(image);
        expect(loaded).to.be(false);
      });

      it('does not register a new listener', function() {
        renderer.loadImage(image);
        const listeners = image.listeners_[eventType];
        expect(listeners).to.have.length(1);
      });

    });

  });

  describe('manageTilePyramid behavior', function() {
    let target, map, view, source;

    beforeEach(function(done) {
      target = document.createElement('div');
      Object.assign(target.style, {
        position: 'absolute',
        left: '-1000px',
        top: '-1000px',
        width: '360px',
        height: '180px'
      });
      document.body.appendChild(target);

      view = new View({
        center: [0, 0],
        multiWorld: true,
        zoom: 0
      });

      source = new XYZ({
        url: '#{x}/{y}/{z}'
      });

      map = new Map({
        target: target,
        view: view,
        layers: [
          new TileLayer({
            source: source
          })
        ]
      });
      map.once('postrender', function() {
        done();
      });
    });

    afterEach(function() {
      map.dispose();
      document.body.removeChild(target);
    });

    it('accesses tiles from current zoom level last', function(done) {
      // expect most recent tile in the cache to be from zoom level 0
      const key = source.tileCache.peekFirstKey();
      const tileCoord = fromKey(key);
      expect(tileCoord[0]).to.be(0);

      map.once('moveend', function() {
        // expect most recent tile in the cache to be from zoom level 4
        const key = source.tileCache.peekFirstKey();
        const tileCoord = fromKey(key);
        expect(tileCoord[0]).to.be(4);
        done();
      });
      view.setZoom(4);
    });
  });

  describe('getRenderedPixelFromViewportPixel', function() {
    let target, map, layer;

    beforeEach(function(done) {
      target = document.createElement('div');
      Object.assign(target.style, {
        width: '100px',
        height: '100px'
      });
      document.body.appendChild(target);

      layer = new ImageLayer({
        source: new Static({
          url: redPixel,
          imageExtent: [-100, -100, 100, 100]
        })
      });

      map = new Map({
        target: target,
        view: new View({
          zoom: 12,
          center: [1000, 0]
        }),
        layers: [layer]
      });

      layer.getSource().on('imageloadend', function () {
        done();
      });
    });

    afterEach(function() {
      map.dispose();
      document.body.removeChild(target);
    });

    it('returns viewport pixel if not rotated', function(done) {
      map.renderSync();
      const layerCanvas = target.querySelector('canvas');
      const context = layerCanvas.getContext('2d');
      const viewPortPixel = map.getPixelFromCoordinate([0, 0]);
      const renderedPixel = layer.getRenderedPixelFromViewportPixel(viewPortPixel);
      const imageData = context.getImageData(renderedPixel[0], renderedPixel[1], 1, 1);
      expect(viewPortPixel[0]).to.be.equal(renderedPixel[0]);
      expect(viewPortPixel[1]).to.be.equal(renderedPixel[1]);
      expect(imageData.data[0]).to.be.equal(255);
      done();
    });

    it('returns the correct pixel on the rotated canvas', function(done) {
      map.getView().setRotation(2);
      map.renderSync();
      const layerCanvas = target.querySelector('canvas');
      const context = layerCanvas.getContext('2d');
      const viewPortPixel = map.getPixelFromCoordinate([0, 0]);
      const renderedPixel = layer.getRenderedPixelFromViewportPixel(viewPortPixel);
      let imageData = context.getImageData(viewPortPixel[0], viewPortPixel[1], 1, 1);
      expect(imageData.data[0]).not.to.be.equal(255);
      imageData = context.getImageData(renderedPixel[0], renderedPixel[1], 1, 1);
      expect(imageData.data[0]).to.be.equal(255);
      done();
    });
  });
});
