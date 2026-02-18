const captureTabButton = document.getElementById("captureTab") as HTMLButtonElement;
const selectOtherButton = document.getElementById("selectOther") as HTMLButtonElement;
const errorDiv = document.getElementById("error") as HTMLDivElement;

function showError(message: string): void {
  errorDiv.textContent = message;
  errorDiv.classList.add("show");
}

function clearError(): void {
  errorDiv.textContent = "";
  errorDiv.classList.remove("show");
}

// Function to capture current tab (runs in content script context)
async function captureCurrentTab(tabId: number): Promise<{ success: boolean; error?: string }> {
  const documentPiP = (window as Window & { documentPictureInPicture?: DocumentPictureInPicture })
    .documentPictureInPicture;

  if (!documentPiP) {
    return { success: false, error: "Document PiP API is not supported in this browser." };
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: "getMediaStreamId", tabId });

    if (response.error) {
      return { success: false, error: response.error };
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: response.streamId,
        },
      } as MediaTrackConstraints,
      audio: false,
    });

    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.autoplay = true;

    await new Promise<void>((resolve) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    });

    await video.play();

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    const aspectRatio = videoWidth / videoHeight;

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
      const maxTranslateX = ((scale - 1) * containerWidth) / 2;
      const maxTranslateY = ((scale - 1) * containerHeight) / 2;
      translateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, translateX));
      translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, translateY));
    }

    pipWindow.document.body.style.cssText =
      "margin: 0; padding: 0; overflow: hidden; background: #000; display: flex; align-items: center; justify-content: center; height: 100vh;";
    video.style.cssText =
      "max-width: 100%; max-height: 100%; object-fit: contain; transform-origin: center center; cursor: default;";
    pipWindow.document.body.appendChild(video);

    video.addEventListener("dblclick", () => {
      if (scale === 1) {
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
      video.style.cursor = scale > 1 ? "grab" : "default";
    });

    video.addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey) {
          e.preventDefault();
          const zoomFactor = 0.01;
          const delta = -e.deltaY * zoomFactor;
          const newScale = Math.max(minScale, Math.min(maxScale, scale + delta));
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
            video.style.cursor = scale > 1 ? "grab" : "default";
          }
        } else if (scale > 1) {
          e.preventDefault();
          translateX -= e.deltaX;
          translateY -= e.deltaY;
          clampTranslate();
          updateTransform();
        }
      },
      { passive: false },
    );

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

    video.addEventListener("mouseenter", () => {
      video.style.cursor = scale > 1 ? "grab" : "default";
    });

    pipWindow.addEventListener("pagehide", () => {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

// Function to select and capture other sources (runs in content script context)
async function selectAndCapture(): Promise<{ success: boolean; error?: string }> {
  const documentPiP = (window as Window & { documentPictureInPicture?: DocumentPictureInPicture })
    .documentPictureInPicture;

  if (!documentPiP) {
    return { success: false, error: "Document PiP API is not supported in this browser." };
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });

    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.autoplay = true;

    await new Promise<void>((resolve) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    });

    await video.play();

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    const aspectRatio = videoWidth / videoHeight;

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
      const maxTranslateX = ((scale - 1) * containerWidth) / 2;
      const maxTranslateY = ((scale - 1) * containerHeight) / 2;
      translateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, translateX));
      translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, translateY));
    }

    pipWindow.document.body.style.cssText =
      "margin: 0; padding: 0; overflow: hidden; background: #000; display: flex; align-items: center; justify-content: center; height: 100vh;";
    video.style.cssText =
      "max-width: 100%; max-height: 100%; object-fit: contain; transform-origin: center center; cursor: default;";
    pipWindow.document.body.appendChild(video);

    video.addEventListener("dblclick", () => {
      if (scale === 1) {
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
      video.style.cursor = scale > 1 ? "grab" : "default";
    });

    video.addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey) {
          e.preventDefault();
          const zoomFactor = 0.01;
          const delta = -e.deltaY * zoomFactor;
          const newScale = Math.max(minScale, Math.min(maxScale, scale + delta));
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
            video.style.cursor = scale > 1 ? "grab" : "default";
          }
        } else if (scale > 1) {
          e.preventDefault();
          translateX -= e.deltaX;
          translateY -= e.deltaY;
          clampTranslate();
          updateTransform();
        }
      },
      { passive: false },
    );

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

    video.addEventListener("mouseenter", () => {
      video.style.cursor = scale > 1 ? "grab" : "default";
    });

    pipWindow.addEventListener("pagehide", () => {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

async function handleCaptureTab(): Promise<void> {
  clearError();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      showError("No active tab found.");
      return;
    }

    if (tab.url?.startsWith("chrome://")) {
      showError("Cannot capture chrome:// pages.");
      return;
    }

    const tabId = tab.id;

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: captureCurrentTab,
      args: [tabId],
    });

    const result = results[0]?.result;

    if (!result?.success) {
      showError(result?.error ?? "Failed to capture tab.");
      return;
    }

    window.close();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    showError(`Failed to capture tab: ${message}`);
  }
}

async function handleSelectOther(): Promise<void> {
  clearError();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      showError("No active tab found.");
      return;
    }

    if (tab.url?.startsWith("chrome://")) {
      showError("Cannot run on chrome:// pages.");
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: selectAndCapture,
    });

    const result = results[0]?.result;

    if (!result?.success) {
      showError(result?.error ?? "Failed to select source.");
      return;
    }

    window.close();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    showError(`Failed to select source: ${message}`);
  }
}

captureTabButton.addEventListener("click", handleCaptureTab);
selectOtherButton.addEventListener("click", handleSelectOther);
