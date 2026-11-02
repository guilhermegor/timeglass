export interface LoginSession {
  open(url: string): Promise<void>;
  isLoggedIn(): Promise<boolean>;
  storageState(): Promise<unknown>;
  close(): Promise<void>;
}
