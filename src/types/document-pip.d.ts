interface DocumentPictureInPictureOptions {
  width?: number;
  height?: number;
}

interface DocumentPictureInPicture {
  requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>;
  window: Window | null;
}

interface Window {
  documentPictureInPicture?: DocumentPictureInPicture;
}
