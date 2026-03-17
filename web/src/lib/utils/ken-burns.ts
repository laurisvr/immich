import type { Faces } from '$lib/stores/people.store';
import { SlideshowLook } from '$lib/stores/slideshow.store';
import type { Point } from '$lib/utils/container-utils';
import { TUNABLES } from '$lib/utils/tunables';
import { clamp } from 'lodash-es';
import smartcrop from 'smartcrop';

const KEN_BURNS_MAX_ZOOM_SPEED = 0.08;
const KEN_BURNS_MAX_PAN_SPEED = 8;

export interface KenBurnsKeyframes {
  startTransform: string;
  endTransform: string;
  duration: number;
}

interface KenBurnsInput {
  faces: Faces[];
  fallbackFaces: Faces[];
  smartCropCenter: Point | undefined;
  contentWidth: number;
  contentHeight: number;
  containerWidth: number;
  containerHeight: number;
  slideshowLook: SlideshowLook;
  isCoverMode: boolean;
  slideshowDelay: number;
  assetId: string;
}

export async function computeSmartCropCenter(
  imgRef: HTMLImageElement,
  faces: Faces[],
  containerWidth: number,
  containerHeight: number,
): Promise<Point | undefined> {
  if (!TUNABLES.KEN_BURNS.SMARTCROP) {
    return undefined;
  }
  if (!TUNABLES.KEN_BURNS.FACE_BOOST && faces.length > 0) {
    return undefined;
  }

  const boosts =
    TUNABLES.KEN_BURNS.FACE_BOOST && faces.length > 0
      ? faces.map((face) => ({
          x: (face.boundingBoxX1 / face.imageWidth) * imgRef.naturalWidth,
          y: (face.boundingBoxY1 / face.imageHeight) * imgRef.naturalHeight,
          width: ((face.boundingBoxX2 - face.boundingBoxX1) / face.imageWidth) * imgRef.naturalWidth,
          height: ((face.boundingBoxY2 - face.boundingBoxY1) / face.imageHeight) * imgRef.naturalHeight,
          weight: 1,
        }))
      : undefined;

  const result = await smartcrop.crop(imgRef, {
    width: containerWidth,
    height: containerHeight,
    ...(boosts && { boost: boosts }),
  });

  const { x, y, width, height } = result.topCrop;
  return {
    x: (x + width / 2) / imgRef.naturalWidth,
    y: (y + height / 2) / imgRef.naturalHeight,
  };
}

const selectKenBurnsFace = (faces: Faces[]): Faces | null => {
  let best: Faces | null = null;
  let bestArea = 0;
  for (const face of faces) {
    const area = (face.boundingBoxX2 - face.boundingBoxX1) * (face.boundingBoxY2 - face.boundingBoxY1);
    if (area > bestArea) {
      best = face;
      bestArea = area;
    }
  }
  return best;
};

export function computeKenBurnsKeyframes({
  faces,
  fallbackFaces,
  smartCropCenter,
  contentWidth,
  contentHeight,
  containerWidth,
  containerHeight,
  slideshowLook,
  isCoverMode,
  slideshowDelay,
  assetId,
}: KenBurnsInput): KenBurnsKeyframes {
  const blurredBackground = slideshowLook === SlideshowLook.BlurredBackground;

  const minZoom =
    !blurredBackground && contentWidth > 0 && contentHeight > 0
      ? Math.min(Math.max(containerWidth / contentWidth, containerHeight / contentHeight), 2)
      : 1;

  const slideDurationMs = slideshowDelay * 1000;
  const maxZoomChange = KEN_BURNS_MAX_ZOOM_SPEED * (slideDurationMs / 1000);

  const face = selectKenBurnsFace(faces) ?? selectKenBurnsFace(fallbackFaces);

  let targetScale: number;
  let endX = 0;
  let endY = 0;

  if (face && contentWidth > 0) {
    const faceHeightFraction = (face.boundingBoxY2 - face.boundingBoxY1) / face.imageHeight;
    const faceTargetZoom = (0.4 * containerHeight) / (faceHeightFraction * contentHeight);
    targetScale = clamp(faceTargetZoom, Math.max(minZoom, 1.2), 2);
    targetScale = clamp(targetScale, Math.max(minZoom, 1.2), minZoom + maxZoomChange);

    const targetNormalizedX =
      TUNABLES.KEN_BURNS.FACE_BOOST && smartCropCenter
        ? smartCropCenter.x
        : (face.boundingBoxX1 + face.boundingBoxX2) / 2 / face.imageWidth;
    const targetNormalizedY =
      TUNABLES.KEN_BURNS.FACE_BOOST && smartCropCenter
        ? smartCropCenter.y
        : (face.boundingBoxY1 + face.boundingBoxY2) / 2 / face.imageHeight;

    endX = (((0.5 - targetNormalizedX) * contentWidth) / containerWidth) * 100;
    endY = (((0.5 - targetNormalizedY) * contentHeight) / containerHeight) * 100;
  } else {
    targetScale = clamp(minZoom, 1.2, 2);
    targetScale = clamp(targetScale, Math.max(minZoom, 1.2), minZoom + maxZoomChange);

    if (smartCropCenter && contentWidth > 0) {
      endX = (((0.5 - smartCropCenter.x) * contentWidth) / containerWidth) * 100;
      endY = (((0.5 - smartCropCenter.y) * contentHeight) / containerHeight) * 100;
    }
  }

  const clampWidth = blurredBackground || isCoverMode ? containerWidth : contentWidth;
  const clampHeight = blurredBackground || isCoverMode ? containerHeight : contentHeight;
  const maxTranslateX = Math.max(0, (clampWidth / (2 * containerWidth) - 1 / (2 * targetScale)) * 100);
  const maxTranslateY = Math.max(0, (clampHeight / (2 * containerHeight) - 1 / (2 * targetScale)) * 100);
  endX = clamp(endX, -maxTranslateX, maxTranslateX);
  endY = clamp(endY, -maxTranslateY, maxTranslateY);

  const panDist = Math.hypot(endX, endY);
  const maxPan = KEN_BURNS_MAX_PAN_SPEED * (slideDurationMs / 1000);
  if (panDist > maxPan && panDist > 0) {
    const ratio = maxPan / panDist;
    endX *= ratio;
    endY *= ratio;
  }

  const zoomIn = Number.parseInt(assetId.at(-1) ?? '0', 16) < 8;

  const startTransform = zoomIn
    ? `scale(${minZoom}) translate(0%, 0%)`
    : `scale(${targetScale}) translate(${endX}%, ${endY}%)`;
  const endTransform = zoomIn
    ? `scale(${targetScale}) translate(${endX}%, ${endY}%)`
    : `scale(${minZoom}) translate(0%, 0%)`;

  return { startTransform, endTransform, duration: slideDurationMs };
}

export class KenBurnsAnimation {
  #animation: Animation | undefined;
  #element: HTMLElement | undefined;
  #cancelToken: { value: boolean } | undefined;

  async startWithSmartCrop(
    element: HTMLElement,
    input: Omit<KenBurnsInput, 'smartCropCenter'> & { imgRef: HTMLImageElement },
  ) {
    this.cancel();
    const token = { value: false };
    this.#cancelToken = token;

    const { imgRef, faces, fallbackFaces, containerWidth, containerHeight, ...rest } = input;
    const allFaces = faces.length > 0 ? faces : fallbackFaces;
    const smartCropCenter = await computeSmartCropCenter(imgRef, allFaces, containerWidth, containerHeight);

    if (token.value) {
      return;
    }

    const keyframes = computeKenBurnsKeyframes({
      faces,
      fallbackFaces,
      smartCropCenter,
      containerWidth,
      containerHeight,
      ...rest,
    });
    this.start(element, keyframes);
  }

  start(element: HTMLElement, { startTransform, endTransform, duration }: KenBurnsKeyframes) {
    this.cancel();
    this.#element = element;

    element.style.transformOrigin = '50% 50%';
    element.style.transform = startTransform;

    const keyframes: Keyframe[] = [{ transform: startTransform, easing: 'ease-in-out' }, { transform: endTransform }];
    this.#animation = element.animate(keyframes, { duration, fill: 'forwards' });
  }

  freeze() {
    if (!this.#animation || !this.#element) {
      return;
    }
    const frozen = getComputedStyle(this.#element).transform;
    this.#animation.cancel();
    this.#animation = undefined;
    if (frozen && frozen !== 'none') {
      this.#element.style.transform = frozen;
    }
  }

  pause() {
    this.#animation?.pause();
  }

  resume() {
    this.#animation?.play();
  }

  cancel() {
    if (this.#cancelToken) {
      this.#cancelToken.value = true;
      this.#cancelToken = undefined;
    }
    this.#animation?.cancel();
    this.#animation = undefined;
    this.#element?.style.removeProperty('transform-origin');
    this.#element = undefined;
  }
}
