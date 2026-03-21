import { goto } from '$app/navigation';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { viewTransitionManager } from '$lib/managers/ViewTransitionManager.svelte';
import { Route } from '$lib/route';
import { tick } from 'svelte';

export function startViewerTransition(
  assetId: string,
  navigate: () => void,
  setTransitionId: (id: string | null) => void,
) {
  void viewTransitionManager.startTransition({
    types: ['viewer'],
    prepareOldSnapshot: () => {
      setTransitionId(assetId);
    },
    performUpdate: async () => {
      setTransitionId(null);
      const ready = eventManager.untilNext('ViewerOpenTransitionReady');
      navigate();
      await ready;
      eventManager.emit('ViewerOpenTransition');
      await tick();
    },
  });
}

let activeOverlay: HTMLElement | undefined;

export function removeCrossfadeOverlay() {
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = undefined;
  }
}

export function navigateToTimeline(
  assetId: string,
  options: { types: string[]; prepareOldSnapshot?: () => void; onFinished?: () => void },
) {
  let heroOverlay: HTMLElement | null = null;
  let hiddenElement: HTMLElement | null = null;

  void viewTransitionManager.startTransition({
    types: options.types,
    prepareOldSnapshot: options.prepareOldSnapshot,
    performUpdate: async () => {
      const scrolled = eventManager.untilNext('TimelineScrolledToAsset');
      await goto(Route.photos({ at: assetId }));
      await scrolled;
      await tick();

      const element = document.querySelector<HTMLElement>(`[data-asset-id="${CSS.escape(assetId)}"]`);
      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const img = element.querySelector('img');

      hiddenElement = element;
      element.style.visibility = 'hidden';

      heroOverlay = document.createElement('div');
      heroOverlay.style.cssText = `
        position: fixed;
        top: ${rect.top}px;
        left: ${rect.left}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        view-transition-name: hero;
        pointer-events: none;
        z-index: -1;
        overflow: hidden;
      `;
      if (img?.src) {
        heroOverlay.style.backgroundImage = `url("${CSS.escape(img.src)}")`;
        heroOverlay.style.backgroundSize = 'cover';
        heroOverlay.style.backgroundPosition = 'center';
      }
      document.body.append(heroOverlay);
    },
    onFinished: () => {
      heroOverlay?.remove();
      heroOverlay = null;
      if (hiddenElement) {
        hiddenElement.style.visibility = '';
        hiddenElement = null;
      }
      options.onFinished?.();
    },
  });
}

export async function crossfadeViewerContent(updateFn: () => void | Promise<void>, duration = 200) {
  const viewerContent = document.querySelector<HTMLElement>('[data-viewer-content]');
  if (!viewerContent) {
    await updateFn();
    return;
  }

  removeCrossfadeOverlay();

  const clone = viewerContent.cloneNode(true) as HTMLElement;
  Object.assign(clone.style, {
    position: 'absolute',
    inset: '0',
    zIndex: '1',
    pointerEvents: 'none',
  });
  delete clone.dataset.viewerContent;
  if (!viewerContent.parentElement) {
    await updateFn();
    return;
  }
  viewerContent.parentElement.append(clone);
  activeOverlay = clone;

  await updateFn();

  try {
    await eventManager.untilNext('ViewerOpenTransitionReady');
  } catch {
    clone.remove();
    if (activeOverlay === clone) {
      activeOverlay = undefined;
    }
    return;
  }

  const fadeOut = clone.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration,
    easing: 'cubic-bezier(0.4, 0, 1, 1)',
    fill: 'forwards',
  });

  void fadeOut.finished.then(() => {
    clone.remove();
    if (activeOverlay === clone) {
      activeOverlay = undefined;
    }
  });
}
