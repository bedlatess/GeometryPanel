export interface PageActions {
  sheet(title: string, body: any, clicked?: (button: HTMLElement) => void): void;
  toolbar(body?: unknown, clicked?: (button: HTMLElement) => void): void;
  closeSheet(): void;
  navigate(path: string): void;
  toast(text: string): void;
}
