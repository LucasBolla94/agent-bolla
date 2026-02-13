export interface NotifierChannel {
  notifyOwner(text: string): Promise<void>;
}
