import {
  computeContentMetrics,
  getContentMetrics,
  getNaturalSize,
  mapContentRectToNatural,
  mapContentToNatural,
  mapNormalizedRectToContent,
  mapNormalizedToContent,
  scaleToCover,
  scaleToFit,
} from '$lib/utils/container-utils';

const mockImage = (props: {
  naturalWidth: number;
  naturalHeight: number;
  width: number;
  height: number;
}): HTMLImageElement => props as unknown as HTMLImageElement;

const mockVideo = (props: {
  videoWidth: number;
  videoHeight: number;
  clientWidth: number;
  clientHeight: number;
}): HTMLVideoElement => {
  const element = Object.create(HTMLVideoElement.prototype);
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(element, key, { value, writable: true, configurable: true });
  }
  return element;
};

describe('scaleToFit', () => {
  it('should return full width when image is wider than container', () => {
    expect(scaleToFit({ width: 2000, height: 1000 }, { width: 800, height: 600 })).toEqual({ width: 800, height: 400 });
  });

  it('should return full height when image is taller than container', () => {
    expect(scaleToFit({ width: 1000, height: 2000 }, { width: 800, height: 600 })).toEqual({ width: 300, height: 600 });
  });

  it('should return exact fit when aspect ratios match', () => {
    expect(scaleToFit({ width: 1600, height: 900 }, { width: 800, height: 450 })).toEqual({ width: 800, height: 450 });
  });

  it('should handle square images in landscape container', () => {
    expect(scaleToFit({ width: 500, height: 500 }, { width: 800, height: 600 })).toEqual({ width: 600, height: 600 });
  });

  it('should handle square images in portrait container', () => {
    expect(scaleToFit({ width: 500, height: 500 }, { width: 400, height: 600 })).toEqual({ width: 400, height: 400 });
  });
});

describe('getContentMetrics', () => {
  it('should compute zero offsets when aspect ratios match', () => {
    const img = mockImage({ naturalWidth: 1600, naturalHeight: 900, width: 800, height: 450 });
    expect(getContentMetrics(img)).toEqual({
      contentWidth: 800,
      contentHeight: 450,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it('should compute horizontal letterbox offsets for tall image', () => {
    const img = mockImage({ naturalWidth: 1000, naturalHeight: 2000, width: 800, height: 600 });
    const metrics = getContentMetrics(img);
    expect(metrics.contentWidth).toBe(300);
    expect(metrics.contentHeight).toBe(600);
    expect(metrics.offsetX).toBe(250);
    expect(metrics.offsetY).toBe(0);
  });

  it('should compute vertical letterbox offsets for wide image', () => {
    const img = mockImage({ naturalWidth: 2000, naturalHeight: 1000, width: 800, height: 600 });
    const metrics = getContentMetrics(img);
    expect(metrics.contentWidth).toBe(800);
    expect(metrics.contentHeight).toBe(400);
    expect(metrics.offsetX).toBe(0);
    expect(metrics.offsetY).toBe(100);
  });

  it('should use clientWidth/clientHeight for video elements', () => {
    const video = mockVideo({ videoWidth: 1920, videoHeight: 1080, clientWidth: 800, clientHeight: 600 });
    const metrics = getContentMetrics(video);
    expect(metrics.contentWidth).toBe(800);
    expect(metrics.contentHeight).toBe(450);
    expect(metrics.offsetX).toBe(0);
    expect(metrics.offsetY).toBe(75);
  });
});

describe('getNaturalSize', () => {
  it('should return naturalWidth/naturalHeight for images', () => {
    const img = mockImage({ naturalWidth: 4000, naturalHeight: 3000, width: 800, height: 600 });
    expect(getNaturalSize(img)).toEqual({ width: 4000, height: 3000 });
  });

  it('should return videoWidth/videoHeight for videos', () => {
    const video = mockVideo({ videoWidth: 1920, videoHeight: 1080, clientWidth: 800, clientHeight: 600 });
    expect(getNaturalSize(video)).toEqual({ width: 1920, height: 1080 });
  });
});

describe('scaleToCover', () => {
  it('should scale up to cover container when image is smaller', () => {
    expect(scaleToCover({ width: 400, height: 300 }, { width: 800, height: 600 })).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('should use height scale when image is wider than container', () => {
    expect(scaleToCover({ width: 2000, height: 1000 }, { width: 800, height: 600 })).toEqual({
      width: 1200,
      height: 600,
    });
  });

  it('should use width scale when image is taller than container', () => {
    expect(scaleToCover({ width: 1000, height: 2000 }, { width: 800, height: 600 })).toEqual({
      width: 800,
      height: 1600,
    });
  });
});

describe('computeContentMetrics', () => {
  it('should compute metrics with scaleToFit by default', () => {
    expect(computeContentMetrics({ width: 2000, height: 1000 }, { width: 800, height: 600 })).toEqual({
      contentWidth: 800,
      contentHeight: 400,
      offsetX: 0,
      offsetY: 100,
    });
  });

  it('should accept scaleToCover as scale function', () => {
    expect(computeContentMetrics({ width: 2000, height: 1000 }, { width: 800, height: 600 }, scaleToCover)).toEqual({
      contentWidth: 1200,
      contentHeight: 600,
      offsetX: -200,
      offsetY: 0,
    });
  });

  it('should compute zero offsets when aspect ratios match', () => {
    expect(computeContentMetrics({ width: 1600, height: 900 }, { width: 800, height: 450 })).toEqual({
      contentWidth: 800,
      contentHeight: 450,
      offsetX: 0,
      offsetY: 0,
    });
  });
});

// Coordinate space glossary:
//
// "Normalized" coordinates: values in the 0–1 range, where (0,0) is the top-left
// of the image and (1,1) is the bottom-right. Resolution-independent.
//
// "Content" coordinates: pixel positions within the container, after the image
// has been scaled (scaleToFit/scaleToCover) and offset (centered). This is what
// CSS and DOM layout use for positioning overlays like face boxes and OCR text.
//
// "Natural" coordinates: pixel positions in the original image file at its full
// resolution (e.g. 4000×3000). Used when cropping or drawing on the source image.
//
// "Metadata pixel space": the coordinate system used by face detection / OCR
// models, where positions are in pixels relative to the image dimensions stored
// in metadata (face.imageWidth/imageHeight). These may differ from the natural
// dimensions if the image was resized. To convert to normalized, divide by
// the metadata dimensions (e.g. face.boundingBoxX1 / face.imageWidth).

describe('mapNormalizedToContent', () => {
  const metrics = { contentWidth: 800, contentHeight: 400, offsetX: 0, offsetY: 100 };

  it('should map top-left corner', () => {
    expect(mapNormalizedToContent({ x: 0, y: 0 }, metrics)).toEqual({ x: 0, y: 100 });
  });

  it('should map bottom-right corner', () => {
    expect(mapNormalizedToContent({ x: 1, y: 1 }, metrics)).toEqual({ x: 800, y: 500 });
  });

  it('should map center point', () => {
    expect(mapNormalizedToContent({ x: 0.5, y: 0.5 }, metrics)).toEqual({ x: 400, y: 300 });
  });

  it('should apply offsets correctly for letterboxed content', () => {
    const letterboxed = { contentWidth: 300, contentHeight: 600, offsetX: 250, offsetY: 0 };
    expect(mapNormalizedToContent({ x: 0, y: 0 }, letterboxed)).toEqual({ x: 250, y: 0 });
    expect(mapNormalizedToContent({ x: 1, y: 1 }, letterboxed)).toEqual({ x: 550, y: 600 });
  });
});

describe('mapContentToNatural', () => {
  const metrics = { contentWidth: 800, contentHeight: 400, offsetX: 0, offsetY: 100 };
  const natural = { width: 4000, height: 2000 };

  it('should map content origin to natural origin', () => {
    expect(mapContentToNatural({ x: 0, y: 100 }, metrics, natural)).toEqual({ x: 0, y: 0 });
  });

  it('should map content bottom-right to natural bottom-right', () => {
    expect(mapContentToNatural({ x: 800, y: 500 }, metrics, natural)).toEqual({ x: 4000, y: 2000 });
  });

  it('should map content center to natural center', () => {
    expect(mapContentToNatural({ x: 400, y: 300 }, metrics, natural)).toEqual({ x: 2000, y: 1000 });
  });

  it('should be the inverse of mapNormalizedToContent', () => {
    const normalized = { x: 0.3, y: 0.7 };
    const contentPoint = mapNormalizedToContent(normalized, metrics);
    const naturalPoint = mapContentToNatural(contentPoint, metrics, natural);
    expect(naturalPoint.x).toBeCloseTo(normalized.x * natural.width);
    expect(naturalPoint.y).toBeCloseTo(normalized.y * natural.height);
  });
});

describe('mapNormalizedRectToContent', () => {
  const metrics = { contentWidth: 800, contentHeight: 400, offsetX: 0, offsetY: 100 };

  it('should map a normalized rect to content pixel coordinates', () => {
    const rect = mapNormalizedRectToContent({ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.75 }, metrics);
    expect(rect).toEqual({ left: 200, top: 200, width: 400, height: 200 });
  });

  it('should map full image rect', () => {
    const rect = mapNormalizedRectToContent({ x: 0, y: 0 }, { x: 1, y: 1 }, metrics);
    expect(rect).toEqual({ left: 0, top: 100, width: 800, height: 400 });
  });

  it('should handle letterboxed content with horizontal offsets', () => {
    const letterboxed = { contentWidth: 300, contentHeight: 600, offsetX: 250, offsetY: 0 };
    const rect = mapNormalizedRectToContent({ x: 0, y: 0 }, { x: 1, y: 1 }, letterboxed);
    expect(rect).toEqual({ left: 250, top: 0, width: 300, height: 600 });
  });
});

describe('mapContentRectToNatural', () => {
  const metrics = { contentWidth: 800, contentHeight: 400, offsetX: 0, offsetY: 100 };
  const natural = { width: 4000, height: 2000 };

  it('should map a content rect to natural image coordinates', () => {
    const rect = mapContentRectToNatural({ left: 200, top: 200, width: 400, height: 200 }, metrics, natural);
    expect(rect).toEqual({ left: 1000, top: 500, width: 2000, height: 1000 });
  });

  it('should map full content rect to full natural dimensions', () => {
    const rect = mapContentRectToNatural({ left: 0, top: 100, width: 800, height: 400 }, metrics, natural);
    expect(rect).toEqual({ left: 0, top: 0, width: 4000, height: 2000 });
  });

  it('should be the inverse of mapNormalizedRectToContent', () => {
    const normalized = { topLeft: { x: 0.2, y: 0.3 }, bottomRight: { x: 0.8, y: 0.9 } };
    const contentRect = mapNormalizedRectToContent(normalized.topLeft, normalized.bottomRight, metrics);
    const naturalRect = mapContentRectToNatural(contentRect, metrics, natural);
    expect(naturalRect.left).toBeCloseTo(normalized.topLeft.x * natural.width);
    expect(naturalRect.top).toBeCloseTo(normalized.topLeft.y * natural.height);
    expect(naturalRect.width).toBeCloseTo((normalized.bottomRight.x - normalized.topLeft.x) * natural.width);
    expect(naturalRect.height).toBeCloseTo((normalized.bottomRight.y - normalized.topLeft.y) * natural.height);
  });
});
