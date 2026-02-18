async function openPipWithDisplayMedia(): Promise<void> {
  const documentPiP = (window as Window & { documentPictureInPicture?: DocumentPictureInPicture })
    .documentPictureInPicture;

  if (!documentPiP) {
    console.error("Document PiP API is not supported in this browser.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });

    const video = document.createElement("video");
    video.srcObject = stream;
    video.autoplay = true;
    video.muted = true;

    // Wait for video metadata to get dimensions
    await new Promise<void>((resolve) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    });

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    const aspectRatio = videoWidth / videoHeight;

    // Calculate initial PiP window size maintaining aspect ratio
    const maxWidth = 480;
    const maxHeight = 360;
    let pipWidth: number;
    let pipHeight: number;

    if (aspectRatio > maxWidth / maxHeight) {
      pipWidth = maxWidth;
      pipHeight = Math.round(maxWidth / aspectRatio);
    } else {
      pipHeight = maxHeight;
      pipWidth = Math.round(maxHeight * aspectRatio);
    }

    const pipWindow = await documentPiP.requestWindow({
      width: pipWidth,
      height: pipHeight,
    });

    // State for zoom and pan
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let lastTranslateX = 0;
    let lastTranslateY = 0;

    const minScale = 1;
    const maxScale = 4;

    function updateTransform(): void {
      video.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }

    function clampTranslate(): void {
      if (scale <= 1) {
        translateX = 0;
        translateY = 0;
        return;
      }

      const container = pipWindow.document.body;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;

      // Calculate max translation based on scale
      const maxTranslateX = ((scale - 1) * containerWidth) / 2;
      const maxTranslateY = ((scale - 1) * containerHeight) / 2;

      translateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, translateX));
      translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, translateY));
    }

    // Style the PiP window with flexbox for centering
    pipWindow.document.body.style.cssText =
      "margin: 0; padding: 0; overflow: hidden; background: #000; display: flex; align-items: center; justify-content: center; height: 100vh;";
    video.style.cssText =
      "max-width: 100%; max-height: 100%; object-fit: contain; transform-origin: center center; cursor: grab;";
    pipWindow.document.body.appendChild(video);

    // Double-click to toggle between 100% and fit-to-window
    video.addEventListener("dblclick", () => {
      if (scale === 1) {
        // Calculate scale to show video at 100% (actual pixels)
        const containerWidth = pipWindow.document.body.clientWidth;
        const containerHeight = pipWindow.document.body.clientHeight;
        const scaleX = videoWidth / containerWidth;
        const scaleY = videoHeight / containerHeight;
        scale = Math.max(scaleX, scaleY, 1);
      } else {
        scale = 1;
      }
      translateX = 0;
      translateY = 0;
      updateTransform();
    });

    // Wheel event: pinch zoom (ctrlKey) or scroll pan (no ctrlKey)
    video.addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey) {
          // Pinch zoom
          e.preventDefault();

          const zoomFactor = 0.01;
          const delta = -e.deltaY * zoomFactor;
          const newScale = Math.max(minScale, Math.min(maxScale, scale + delta));

          // Zoom towards cursor position
          if (newScale !== scale) {
            const rect = video.getBoundingClientRect();
            const cursorX = e.clientX - rect.left - rect.width / 2;
            const cursorY = e.clientY - rect.top - rect.height / 2;

            const scaleChange = newScale / scale;
            translateX = cursorX - (cursorX - translateX) * scaleChange;
            translateY = cursorY - (cursorY - translateY) * scaleChange;

            scale = newScale;
            clampTranslate();
            updateTransform();
          }
        } else if (scale > 1) {
          // Scroll to pan (only when zoomed in)
          e.preventDefault();

          translateX -= e.deltaX;
          translateY -= e.deltaY;
          clampTranslate();
          updateTransform();
        }
      },
      { passive: false },
    );

    // Drag to pan (when zoomed in)
    video.addEventListener("mousedown", (e) => {
      if (scale <= 1) return;

      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      lastTranslateX = translateX;
      lastTranslateY = translateY;
      video.style.cursor = "grabbing";
      e.preventDefault();
    });

    pipWindow.document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;

      translateX = lastTranslateX + (e.clientX - dragStartX);
      translateY = lastTranslateY + (e.clientY - dragStartY);
      clampTranslate();
      updateTransform();
    });

    pipWindow.document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        video.style.cursor = scale > 1 ? "grab" : "default";
      }
    });

    // Update cursor based on zoom level
    video.addEventListener("mouseenter", () => {
      video.style.cursor = scale > 1 ? "grab" : "default";
    });

    // Clean up when PiP window closes
    pipWindow.addEventListener("pagehide", () => {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    });
  } catch (error) {
    console.error("Failed to open PiP:", error);
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) {
    console.error("No tab ID found");
    return;
  }

  if (tab.url?.startsWith("chrome://")) {
    console.error("Cannot run on chrome:// pages");
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: openPipWithDisplayMedia,
    });
  } catch (error) {
    console.error("Failed to execute script:", error);
  }
});
