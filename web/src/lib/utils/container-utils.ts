// Coordinate spaces used throughout the viewer:
//
// "Normalized": 0–1 range, (0,0) = top-left, (1,1) = bottom-right. Resolution-independent.
//   Example: OCR coordinates, or face coords after dividing by metadata dimensions.
//
// "Content": pixel position within the container after scaling (scaleToFit/scaleToCover)
//   and centering. Used for DOM overlay positioning (face boxes, OCR text).
//
// "Natural": pixel position in the original full-resolution image file (e.g. 4000×3000).
//   Used when cropping or drawing on the source image.
//
// "Metadata pixel space": coordinates from face detection / OCR models, in pixels relative
//   to face.imageWidth/imageHeight. Divide by those dimensions to get normalized coords.

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface ContentMetrics {
  contentWidth: number;
  contentHeight: number;
  offsetX: number;
  offsetY: number;
}

export const scaleToCover = (dimensions: Size, container: Size): Size => {
  const scaleX = container.width / dimensions.width;
  const scaleY = container.height / dimensions.height;
  const scale = Math.max(scaleX, scaleY);
  return {
    width: dimensions.width * scale,
    height: dimensions.height * scale,
  };
};

export const scaleToFit = (dimensions: Size, container: Size): Size => {
  const scaleX = container.width / dimensions.width;
  const scaleY = container.height / dimensions.height;
  const scale = Math.min(scaleX, scaleY);
  return {
    width: dimensions.width * scale,
    height: dimensions.height * scale,
  };
};

const getElementSize = (element: HTMLImageElement | HTMLVideoElement): Size => {
  if (element instanceof HTMLVideoElement) {
    return { width: element.clientWidth, height: element.clientHeight };
  }
  return { width: element.width, height: element.height };
};

export const getNaturalSize = (element: HTMLImageElement | HTMLVideoElement): Size => {
  if (element instanceof HTMLVideoElement) {
    return { width: element.videoWidth, height: element.videoHeight };
  }
  return { width: element.naturalWidth, height: element.naturalHeight };
};

export function computeContentMetrics(
  imageSize: Size,
  containerSize: Size,
  scaleFn: (dimensions: Size, container: Size) => Size = scaleToFit,
) {
  const { width: contentWidth, height: contentHeight } = scaleFn(imageSize, containerSize);
  return {
    contentWidth,
    contentHeight,
    offsetX: (containerSize.width - contentWidth) / 2,
    offsetY: (containerSize.height - contentHeight) / 2,
  };
}

export const getContentMetrics = (element: HTMLImageElement | HTMLVideoElement): ContentMetrics => {
  const natural = getNaturalSize(element);
  const client = getElementSize(element);
  return computeContentMetrics(natural, client);
};

export function mapNormalizedToContent(point: Point, metrics: ContentMetrics): Point {
  return {
    x: point.x * metrics.contentWidth + metrics.offsetX,
    y: point.y * metrics.contentHeight + metrics.offsetY,
  };
}

export function mapContentToNatural(point: Point, metrics: ContentMetrics, naturalSize: Size): Point {
  return {
    x: ((point.x - metrics.offsetX) / metrics.contentWidth) * naturalSize.width,
    y: ((point.y - metrics.offsetY) / metrics.contentHeight) * naturalSize.height,
  };
}

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function mapNormalizedRectToContent(topLeft: Point, bottomRight: Point, metrics: ContentMetrics): Rect {
  const tl = mapNormalizedToContent(topLeft, metrics);
  const br = mapNormalizedToContent(bottomRight, metrics);
  return {
    top: tl.y,
    left: tl.x,
    width: br.x - tl.x,
    height: br.y - tl.y,
  };
}

export function mapContentRectToNatural(rect: Rect, metrics: ContentMetrics, naturalSize: Size): Rect {
  const topLeft = mapContentToNatural({ x: rect.left, y: rect.top }, metrics, naturalSize);
  const bottomRight = mapContentToNatural(
    { x: rect.left + rect.width, y: rect.top + rect.height },
    metrics,
    naturalSize,
  );
  return {
    top: topLeft.y,
    left: topLeft.x,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}
