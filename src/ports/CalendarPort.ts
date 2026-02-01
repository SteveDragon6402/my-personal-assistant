export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  description?: string;
  location?: string;
}

export interface CalendarPort {
  getTodayEvents(): Promise<CalendarEvent[]>;
  getEvents(startDate: Date, endDate: Date): Promise<CalendarEvent[]>;
}
