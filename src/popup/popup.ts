console.log("PiP Any Tab/Window: Popup opened");

const openPipButton = document.getElementById("openPip") as HTMLButtonElement;
const errorDiv = document.getElementById("error") as HTMLDivElement;

function showError(message: string): void {
  errorDiv.textContent = message;
}

function clearError(): void {
  errorDiv.textContent = "";
}

async function captureTabAndOpenPip(): Promise<{ success: boolean; error?: string }> {
  const documentPiP = (window as Window & { documentPictureInPicture?: DocumentPictureInPicture })
    .documentPictureInPicture;

  if (!documentPiP) {
    return { success: false, error: "Document PiP API is not supported in this browser." };
  }

  try {
    // Request stream ID from background script
    const response = await chrome.runtime.sendMessage({ type: "getMediaStreamId" });

    if (response.error) {
      return { success: false, error: response.error };
    }

    const { streamId } = response;

    // Get media stream using the stream ID
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      } as MediaTrackConstraints,
      audio: false,
    });

    // Create video element
    const video = document.createElement("video");
    video.srcObject = stream;
    video.autoplay = true;
    video.muted = true;
    video.style.cssText = "width: 100%; height: 100%; object-fit: contain; background: #000;";

    // Open Document PiP window
    const pipWindow = await documentPiP.requestWindow({
      width: 480,
      height: 270,
    });

    // Style the PiP window
    pipWindow.document.body.style.cssText = "margin: 0; padding: 0; overflow: hidden;";
    pipWindow.document.body.appendChild(video);

    // Clean up when PiP window closes
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

async function openPipWindow(): Promise<void> {
  clearError();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      showError("No active tab found.");
      return;
    }

    if (tab.url?.startsWith("chrome://")) {
      showError("Cannot open PiP on chrome:// pages.");
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: captureTabAndOpenPip,
    });

    const result = results[0]?.result;

    if (!result?.success) {
      showError(result?.error ?? "Failed to open PiP window.");
      return;
    }

    console.log("PiP window opened successfully");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    showError(`Failed to open PiP window: ${message}`);
    console.error("Failed to open PiP window:", error);
  }
}

openPipButton.addEventListener("click", openPipWindow);
