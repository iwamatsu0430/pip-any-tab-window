console.log("PiP Any Tab/Window: Popup opened");

const openPipButton = document.getElementById("openPip") as HTMLButtonElement;
const errorDiv = document.getElementById("error") as HTMLDivElement;

function showError(message: string): void {
  errorDiv.textContent = message;
}

function clearError(): void {
  errorDiv.textContent = "";
}

async function openDocumentPipInTab(): Promise<{ success: boolean; error?: string }> {
  const documentPiP = (window as Window & { documentPictureInPicture?: DocumentPictureInPicture })
    .documentPictureInPicture;

  if (!documentPiP) {
    return { success: false, error: "Document PiP API is not supported in this browser." };
  }

  try {
    const pipWindow = await documentPiP.requestWindow({
      width: 400,
      height: 300,
    });

    pipWindow.document.body.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        margin: 0;
        background: #1a1a1a;
        color: #fff;
        font-family: system-ui, sans-serif;
      ">
        <p>PiP Window Active</p>
      </div>
    `;

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
      func: openDocumentPipInTab,
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
