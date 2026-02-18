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
    video.style.cssText = "width: 100%; height: 100%; object-fit: contain; background: #000;";

    const pipWindow = await documentPiP.requestWindow({
      width: 480,
      height: 270,
    });

    pipWindow.document.body.style.cssText = "margin: 0; padding: 0; overflow: hidden;";
    pipWindow.document.body.appendChild(video);

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
