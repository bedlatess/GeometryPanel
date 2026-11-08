export interface PageActions {
  sheet(title: string, body: string, clicked: (button: HTMLElement) => void): void;
  closeSheet(): void;
  toolbar(body: string, clicked: (button: HTMLElement) => void): void;
  navigate(path: string): void;
  toast(text: string): void;
}
