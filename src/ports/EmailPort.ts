export interface Newsletter {
  id: string;
  subject: string;
  sender: string;
  body: string;
  receivedAt: Date;
  url?: string;
}

export interface EmailPort {
  getUnreadNewsletters(since: Date): Promise<Newsletter[]>;
}
