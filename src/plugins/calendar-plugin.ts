/**
 * Calendar Plugin
 * Fetches calendar events from macOS Calendar using icalBuddy
 * Generates AI-powered summaries for today's appointments, work week, personal week, and weekend
 */

import {
  TopixPlugin,
  PluginConfig,
  FetchContext,
  Headline,
  ConfigSchema,
  ValidationResult,
  AuthRequirement,
  AuthCredentials,
  HealthStatus,
  RetentionPolicy,
} from '@/models/types';
import { v4 as uuidv4 } from 'uuid';
import { LLMService } from '@/services/llm-service';
import { TopixDatabase } from '@/models/database';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface CalendarConfig {
  workCalendar: string; // No default - user must select
  personalCalendar: string; // No default - user must select
  llmPromptToday?: string;
  llmPromptPersonalWeek?: string;
  llmPromptWorkWeek?: string;
  llmPromptWeekend?: string;
}

interface CalendarEvent {
  title: string;
  date: Date;
  endDate?: Date;
  calendar: string;
  location?: string;
}

export class CalendarPlugin implements TopixPlugin {
  readonly id = 'calendar';
  readonly name = 'Calendar';
  readonly description = 'Get AI-powered summaries of your calendar events';
  readonly version = '0.1.0';
  readonly author = 'Dave Weaver';

  private config: CalendarConfig = {
    workCalendar: '',
    personalCalendar: '',
  };

  async initialize(config: PluginConfig): Promise<void> {
    this.config = config.config as CalendarConfig;

    // Check if icalBuddy is installed
    try {
      await execAsync('which icalBuddy');
    } catch (error) {
      throw new Error(
        'icalBuddy is not installed. Install with: brew install ical-buddy'
      );
    }

    // Validate calendars exist
    const availableCalendars = await this.getAvailableCalendars();
    if (!availableCalendars.includes(this.config.workCalendar)) {
      throw new Error(`Work calendar "${this.config.workCalendar}" not found`);
    }
    if (!availableCalendars.includes(this.config.personalCalendar)) {
      throw new Error(`Personal calendar "${this.config.personalCalendar}" not found`);
    }
  }

  async shutdown(): Promise<void> {
    // No cleanup needed
  }

  async fetchHeadlines(context: FetchContext): Promise<Headline[]> {
    try {
      const headlines: Headline[] = [];
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0=Sunday, 5=Friday, 6=Saturday

      // 1. Today's upcoming appointments (always create)
      const todayHeadline = await this.generateTodayHeadline(now, context.db);
      if (todayHeadline) {
        headlines.push(todayHeadline);
      }

      // 2. Personal week overview (skip on Friday)
      if (dayOfWeek !== 5) {
        const personalWeekHeadline = await this.generatePersonalWeekHeadline(now, context.db);
        if (personalWeekHeadline) {
          headlines.push(personalWeekHeadline);
        }
      }

      // 3. Work week overview (skip on Friday)
      if (dayOfWeek !== 5) {
        const workWeekHeadline = await this.generateWorkWeekHeadline(now, context.db);
        if (workWeekHeadline) {
          headlines.push(workWeekHeadline);
        }
      }

      // 4. Weekend overview (only Wednesday-Saturday)
      if (dayOfWeek >= 3 && dayOfWeek <= 6) {
        const weekendHeadline = await this.generateWeekendHeadline(now, context.db);
        if (weekendHeadline) {
          headlines.push(weekendHeadline);
        }
      }

      return headlines;
    } catch (error) {
      console.error('Failed to fetch calendar events:', error);
      return [];
    }
  }

  /**
   * Get list of available calendars from icalBuddy
   */
  private async getAvailableCalendars(): Promise<string[]> {
    try {
      const { stdout } = await execAsync('icalBuddy calendars 2>/dev/null');
      // Parse output - calendar names start with •
      const calendars: string[] = [];
      for (const line of stdout.split('\n')) {
        if (line.trim().startsWith('• ')) {
          const calendarName = line.trim().substring(2);
          calendars.push(calendarName);
        }
      }
      return calendars;
    } catch (error) {
      console.error('Failed to get available calendars:', error);
      return [];
    }
  }

  /**
   * Fetch events using icalBuddy
   */
  private async fetchEvents(command: string): Promise<CalendarEvent[]> {
    try {
      // Use -iep to include event properties (title,datetime) for proper time parsing
      const { stdout } = await execAsync(`icalBuddy -n -iep "title,datetime" ${command} 2>/dev/null`);
      return this.parseIcalBuddyOutput(stdout);
    } catch (error) {
      console.error('Failed to fetch events:', error);
      return [];
    }
  }

  /**
   * Parse icalBuddy output into structured events
   */
  private parseIcalBuddyOutput(output: string): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    const lines = output.split('\n');
    let currentEvent: Partial<CalendarEvent> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Match bullet point lines (event titles with calendar in parentheses)
      // Format: • Event Title (Calendar Name)
      if (trimmed.startsWith('• ')) {
        // Finalize previous event
        if (currentEvent?.title && currentEvent?.calendar) {
          events.push(this.finalizeEvent(currentEvent));
        }

        // Extract title and calendar from the line
        // Use greedy match for title to capture everything up to the LAST set of parentheses
        const match = trimmed.match(/^• (.+) \(([^)]+)\)$/);
        if (match) {
          currentEvent = {
            title: match[1],
            calendar: match[2],
          };
        } else {
          // Fallback - just get title without calendar
          currentEvent = {
            title: trimmed.substring(2).trim(),
          };
        }
        continue;
      }

      if (!currentEvent) {
        continue;
      }

      // Skip empty lines
      if (trimmed === '') {
        continue;
      }

      // Match property lines (key: value)
      // Key must start with a letter (not a digit) to avoid matching times like "7:00 AM"
      const propertyMatch = trimmed.match(/^([a-zA-Z]\w*):\s*(.+)$/);
      if (propertyMatch) {
        const [, key, value] = propertyMatch;

        if (key === 'location') {
          currentEvent.location = value;
        }
        // We'll parse the date from the date/time line separately
        continue;
      }

      // Check if this is a date/time line (no key, just date info)
      if (!propertyMatch && trimmed.length > 0) {
        const dateTimeStr = this.parseDateTimeLine(trimmed);
        if (dateTimeStr) {
          currentEvent.date = dateTimeStr;
        }
      }
    }

    // Don't forget the last event
    if (currentEvent?.title && currentEvent?.calendar) {
      events.push(this.finalizeEvent(currentEvent));
    }

    return events;
  }

  /**
   * Parse a date/time line from icalBuddy output
   */
  private parseDateTimeLine(line: string): Date | null {
    // Try various date formats from icalBuddy

    // Format: "tomorrow at 1:00 PM - 4:00 PM"
    // Format: "day after tomorrow at 6:00 PM - 7:30 PM"
    // Format: "2025-10-28 07:00 at 7:00 AM - 11:00 AM"
    // Format: "2025-10-20 00:00 - 2025-10-30 23:59"
    // Format: "Oct 31, 2025" or "Oct 31, 2025 at 2:00 PM"

    // Try to extract date from various formats
    const now = new Date();

    // IMPORTANT: Check "day after tomorrow" BEFORE "tomorrow"
    // (since "day after tomorrow" contains "tomorrow")
    if (line.includes('day after tomorrow')) {
      const dayAfter = new Date(now);
      dayAfter.setDate(dayAfter.getDate() + 2);

      const timeMatch = line.match(/at (\d{1,2}):(\d{2})\s*(AM|PM)/);
      if (timeMatch) {
        const [, hour, minute, ampm] = timeMatch;
        let hours = parseInt(hour);
        if (ampm === 'PM' && hours !== 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        dayAfter.setHours(hours, parseInt(minute), 0, 0);
        return dayAfter;
      }
      return dayAfter;
    }

    // Check for "tomorrow"
    if (line.includes('tomorrow')) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const timeMatch = line.match(/at (\d{1,2}):(\d{2})\s*(AM|PM)/);
      if (timeMatch) {
        const [, hour, minute, ampm] = timeMatch;
        let hours = parseInt(hour);
        if (ampm === 'PM' && hours !== 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        tomorrow.setHours(hours, parseInt(minute), 0, 0);
        return tomorrow;
      }
      return tomorrow;
    }

    // Check for explicit date format: "2025-10-28 07:00"
    const dateMatch = line.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
    if (dateMatch) {
      const [, year, month, day, hour, minute] = dateMatch;
      return new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute)
      );
    }

    // Check for "today at HH:MM"
    // Note: icalBuddy uses narrow no-break space (U+202F) between time and AM/PM
    if (line.includes('today')) {
      const today = new Date(now);
      const timeMatch = line.match(/at (\d{1,2}):(\d{2})\s*(AM|PM)/);
      if (timeMatch) {
        const [, hour, minute, ampm] = timeMatch;
        let hours = parseInt(hour);
        if (ampm === 'PM' && hours !== 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        today.setHours(hours, parseInt(minute), 0, 0);
        return today;
      }
      return today;
    }

    // Check for simple time format: "1:00 PM - 1:45 PM" (today's events)
    const simpleTimeMatch = line.match(/^\s*(\d{1,2}):(\d{2})\s*(AM|PM)/);
    if (simpleTimeMatch) {
      const [, hour, minute, ampm] = simpleTimeMatch;
      const today = new Date(now);
      let hours = parseInt(hour);
      if (ampm === 'PM' && hours !== 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      today.setHours(hours, parseInt(minute), 0, 0);
      return today;
    }

    // Check for "Oct 31, 2025" or "Oct 31, 2025 at 2:00 PM" format
    const monthDayYearMatch = line.match(/([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/);
    if (monthDayYearMatch) {
      const [, monthStr, day, year] = monthDayYearMatch;

      // Map month abbreviations to numbers
      const monthMap: { [key: string]: number } = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
      };

      const month = monthMap[monthStr];
      if (month !== undefined) {
        const date = new Date(parseInt(year), month, parseInt(day));

        // Check for optional time
        const timeMatch = line.match(/at (\d{1,2}):(\d{2})\s*(AM|PM)/);
        if (timeMatch) {
          const [, hour, minute, ampm] = timeMatch;
          let hours = parseInt(hour);
          if (ampm === 'PM' && hours !== 12) hours += 12;
          if (ampm === 'AM' && hours === 12) hours = 0;
          date.setHours(hours, parseInt(minute), 0, 0);
        }

        return date;
      }
    }

    return null;
  }

  /**
   * Finalize event by ensuring date is set
   */
  private finalizeEvent(event: Partial<CalendarEvent>): CalendarEvent {
    // If date is not set, use current time as fallback
    if (!event.date) {
      event.date = new Date();
    }

    return event as CalendarEvent;
  }

  /**
   * Filter events by calendar name
   */
  private filterEventsByCalendar(events: CalendarEvent[], calendar: string): CalendarEvent[] {
    return events.filter((event) => event.calendar === calendar);
  }

  /**
   * Filter events to only those starting from now onwards
   */
  private filterUpcomingEvents(events: CalendarEvent[], fromTime: Date): CalendarEvent[] {
    return events.filter((event) => event.date >= fromTime);
  }

  /**
   * Filter events to only weekdays (Monday-Friday, excluding Saturday and Sunday)
   */
  private filterWeekdayEvents(events: CalendarEvent[]): CalendarEvent[] {
    return events.filter((event) => {
      const dayOfWeek = event.date.getDay();
      // 0 = Sunday, 6 = Saturday - exclude both
      return dayOfWeek !== 0 && dayOfWeek !== 6;
    });
  }

  /**
   * Filter events to only weekends (Saturday and Sunday only)
   */
  private filterWeekendEvents(events: CalendarEvent[]): CalendarEvent[] {
    return events.filter((event) => {
      const dayOfWeek = event.date.getDay();
      // 0 = Sunday, 6 = Saturday - include only these
      return dayOfWeek === 0 || dayOfWeek === 6;
    });
  }

  /**
   * Format events for LLM prompt
   */
  private formatEventsForLLM(events: CalendarEvent[]): string {
    if (events.length === 0) {
      return 'No events scheduled';
    }

    return events
      .map((event) => {
        const dateStr = event.date.toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
        let line = `- ${event.title} (${dateStr})`;
        if (event.location) {
          line += ` at ${event.location}`;
        }
        return line;
      })
      .join('\n');
  }

  /**
   * Generate today's upcoming appointments headline
   */
  private async generateTodayHeadline(
    now: Date,
    db: TopixDatabase
  ): Promise<Headline | null> {
    // Fetch today's events from both calendars
    const todayEvents = await this.fetchEvents('eventsToday');
    const upcomingEvents = this.filterUpcomingEvents(todayEvents, now);

    // Filter by work and personal calendars
    const workEvents = this.filterEventsByCalendar(upcomingEvents, this.config.workCalendar);
    const personalEvents = this.filterEventsByCalendar(
      upcomingEvents,
      this.config.personalCalendar
    );

    const allUpcoming = [...workEvents, ...personalEvents].sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );

    if (allUpcoming.length === 0) {
      // No upcoming appointments today
      return {
        id: uuidv4(),
        pluginId: this.id,
        title: 'No upcoming appointments today',
        description: 'Your calendar is clear for the rest of the day',
        pubDate: now,
        createdAt: now,
        category: 'calendar',
        tags: ['today', 'appointments'],
        importanceScore: 0.3,
        isImportant: false,
        metadata: {},
        read: false,
        starred: false,
        archived: false,
      };
    }

    // Generate AI summary
    const promptTemplate =
      this.config.llmPromptToday ||
      `Summarize these upcoming appointments for today in one concise sentence. Focus on what's important and urgent. Keep it brief and natural.

Events:
{events}

Create a brief, natural headline:`;

    const prompt = promptTemplate.replace('{events}', this.formatEventsForLLM(allUpcoming));

    let headlineText: string;
    try {
      const llmService = new LLMService(db);
      headlineText = await llmService.generateText(prompt);
    } catch (error) {
      console.warn('Failed to generate AI headline for today, using fallback:', error);
      headlineText = `${allUpcoming.length} upcoming appointment${allUpcoming.length > 1 ? 's' : ''} today`;
    }

    return {
      id: uuidv4(),
      pluginId: this.id,
      title: `Today: ${headlineText}`,
      description: this.formatEventsForLLM(allUpcoming),
      pubDate: now,
      createdAt: now,
      category: 'calendar',
      tags: ['today', 'appointments'],
      importanceScore: 0.7,
      isImportant: true,
      metadata: {
        eventCount: allUpcoming.length,
      },
      read: false,
      starred: false,
      archived: false,
    };
  }

  /**
   * Generate personal week overview headline
   */
  private async generatePersonalWeekHeadline(
    now: Date,
    db: TopixDatabase
  ): Promise<Headline | null> {
    // Fetch next 7 days from personal calendar
    const weekEvents = await this.fetchEvents('eventsToday+7');
    const personalEvents = this.filterEventsByCalendar(weekEvents, this.config.personalCalendar);

    // Filter to only upcoming events (remove past events)
    const upcomingPersonalEvents = this.filterUpcomingEvents(personalEvents, now);

    // Filter to only weekday events (Monday-Friday, exclude weekends)
    const weekdayPersonalEvents = this.filterWeekdayEvents(upcomingPersonalEvents);

    if (weekdayPersonalEvents.length === 0) {
      return null; // Don't create headline if no personal events
    }

    // Generate AI summary
    const promptTemplate =
      this.config.llmPromptPersonalWeek ||
      `Create a brief summary (1-2 sentences) of what's coming up in the next weekdays. Use natural, forward-looking language.

Events:
{events}

Summary:`;

    const prompt = promptTemplate.replace('{events}', this.formatEventsForLLM(weekdayPersonalEvents));

    let headlineText: string;
    try {
      const llmService = new LLMService(db);
      headlineText = await llmService.generateText(prompt);
    } catch (error) {
      console.warn('Failed to generate AI headline for personal week, using fallback:', error);
      headlineText = `${weekdayPersonalEvents.length} personal event${weekdayPersonalEvents.length > 1 ? 's' : ''} this week`;
    }

    return {
      id: uuidv4(),
      pluginId: this.id,
      title: `This week at home: ${headlineText}`,
      description: this.formatEventsForLLM(weekdayPersonalEvents),
      pubDate: now,
      createdAt: now,
      category: 'calendar',
      tags: ['personal', 'week'],
      importanceScore: 0.5,
      isImportant: false,
      metadata: {
        eventCount: weekdayPersonalEvents.length,
      },
      read: false,
      starred: false,
      archived: false,
    };
  }

  /**
   * Generate work week overview headline
   */
  private async generateWorkWeekHeadline(
    now: Date,
    db: TopixDatabase
  ): Promise<Headline | null> {
    // Fetch next 7 days from work calendar
    const weekEvents = await this.fetchEvents('eventsToday+7');
    const workEvents = this.filterEventsByCalendar(weekEvents, this.config.workCalendar);

    // Filter to only upcoming events (remove past events)
    const upcomingWorkEvents = this.filterUpcomingEvents(workEvents, now);

    // Filter to only weekday events (Monday-Friday, exclude weekends)
    const weekdayWorkEvents = this.filterWeekdayEvents(upcomingWorkEvents);

    if (weekdayWorkEvents.length === 0) {
      return null; // Don't create headline if no work events
    }

    // Generate AI summary
    const promptTemplate =
      this.config.llmPromptWorkWeek ||
      `Create a brief summary (1-2 sentences) of what's coming up in the next work week. Use natural, forward-looking language.

Events:
{events}

Summary:`;

    const prompt = promptTemplate.replace('{events}', this.formatEventsForLLM(weekdayWorkEvents));

    let headlineText: string;
    try {
      const llmService = new LLMService(db);
      headlineText = await llmService.generateText(prompt);
    } catch (error) {
      console.warn('Failed to generate AI headline for work week, using fallback:', error);
      headlineText = `${weekdayWorkEvents.length} work event${weekdayWorkEvents.length > 1 ? 's' : ''} this week`;
    }

    return {
      id: uuidv4(),
      pluginId: this.id,
      title: `This week at work: ${headlineText}`,
      description: this.formatEventsForLLM(weekdayWorkEvents),
      pubDate: now,
      createdAt: now,
      category: 'calendar',
      tags: ['work', 'week'],
      importanceScore: 0.6,
      isImportant: true,
      metadata: {
        eventCount: weekdayWorkEvents.length,
      },
      read: false,
      starred: false,
      archived: false,
    };
  }

  /**
   * Generate weekend overview headline
   */
  private async generateWeekendHeadline(
    now: Date,
    db: TopixDatabase
  ): Promise<Headline | null> {
    // Fetch next 7 days (to catch the upcoming weekend)
    const allEvents = await this.fetchEvents('eventsToday+7');

    // Filter to only upcoming events (remove past events)
    const upcomingEvents = this.filterUpcomingEvents(allEvents, now);

    // Filter to only weekend events (Saturday and Sunday)
    const upcomingWeekendEvents = this.filterWeekendEvents(upcomingEvents);

    if (upcomingWeekendEvents.length === 0) {
      return null; // Don't create headline if no weekend events
    }

    // Generate AI summary
    const promptTemplate =
      this.config.llmPromptWeekend ||
      `Summarize what's happening this weekend in 1-2 sentences. Mention key events.

Events:
{events}

Create a brief, natural summary:`;

    const prompt = promptTemplate.replace('{events}', this.formatEventsForLLM(upcomingWeekendEvents));

    let headlineText: string;
    try {
      const llmService = new LLMService(db);
      headlineText = await llmService.generateText(prompt);
    } catch (error) {
      console.warn('Failed to generate AI headline for weekend, using fallback:', error);
      headlineText = `${upcomingWeekendEvents.length} event${upcomingWeekendEvents.length > 1 ? 's' : ''} this weekend`;
    }

    return {
      id: uuidv4(),
      pluginId: this.id,
      title: `This weekend: ${headlineText}`,
      description: this.formatEventsForLLM(upcomingWeekendEvents),
      pubDate: now,
      createdAt: now,
      category: 'calendar',
      tags: ['weekend'],
      importanceScore: 0.5,
      isImportant: false,
      metadata: {
        eventCount: upcomingWeekendEvents.length,
      },
      read: false,
      starred: false,
      archived: false,
    };
  }

  getConfigSchema(): ConfigSchema {
    return {
      type: 'object',
      properties: {
        workCalendar: {
          type: 'string',
          description: 'Calendar for work events',
          // NO DEFAULT - user must select
        },
        personalCalendar: {
          type: 'string',
          description: 'Calendar for personal events',
          // NO DEFAULT - user must select
        },
        llmPromptToday: {
          type: 'string',
          description: 'Prompt for today\'s appointments summary',
          default: `Summarize these upcoming appointments for today in one concise sentence. Focus on what's important and urgent. Keep it brief and natural.

Events:
{events}

Create a brief, natural headline:`,
        },
        llmPromptPersonalWeek: {
          type: 'string',
          description: 'Prompt for personal week summary',
          default: `Create a brief summary (1-2 sentences) of what's coming up in the next weekdays. Use natural, forward-looking language.

Events:
{events}

Summary:`,
        },
        llmPromptWorkWeek: {
          type: 'string',
          description: 'Prompt for work week summary',
          default: `Create a brief summary (1-2 sentences) of what's coming up in the next work week. Use natural, forward-looking language.

Events:
{events}

Summary:`,
        },
        llmPromptWeekend: {
          type: 'string',
          description: 'Prompt for weekend summary',
          default: `Summarize what's happening this weekend in 1-2 sentences. Mention key events.

Events:
{events}

Create a brief, natural summary:`,
        },
      },
      required: ['workCalendar', 'personalCalendar'],
    };
  }

  validateConfig(config: unknown): ValidationResult {
    const errors: string[] = [];

    if (typeof config !== 'object' || config === null) {
      return { valid: false, errors: ['Config must be an object'] };
    }

    const cfg = config as Record<string, any>;

    if (!cfg.workCalendar || typeof cfg.workCalendar !== 'string') {
      errors.push('workCalendar is required and must be a string');
    }

    if (!cfg.personalCalendar || typeof cfg.personalCalendar !== 'string') {
      errors.push('personalCalendar is required and must be a string');
    }

    if (cfg.workCalendar === cfg.personalCalendar) {
      errors.push('Work and personal calendars should be different');
    }

    if (cfg.llmPromptToday && typeof cfg.llmPromptToday !== 'string') {
      errors.push('llmPromptToday must be a string');
    }

    if (cfg.llmPromptPersonalWeek && typeof cfg.llmPromptPersonalWeek !== 'string') {
      errors.push('llmPromptPersonalWeek must be a string');
    }

    if (cfg.llmPromptWorkWeek && typeof cfg.llmPromptWorkWeek !== 'string') {
      errors.push('llmPromptWorkWeek must be a string');
    }

    if (cfg.llmPromptWeekend && typeof cfg.llmPromptWeekend !== 'string') {
      errors.push('llmPromptWeekend must be a string');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  getAuthRequirements(): AuthRequirement | null {
    // No authentication required - uses macOS Calendar via icalBuddy
    return null;
  }

  setAuthCredentials(_credentials: AuthCredentials): void {
    // No authentication needed
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      // Check if icalBuddy is accessible
      await execAsync('which icalBuddy');

      // Try to fetch calendars
      const calendars = await this.getAvailableCalendars();
      if (calendars.length === 0) {
        return {
          healthy: false,
          message: 'icalBuddy is installed but returned no calendars',
          lastChecked: new Date(),
        };
      }

      return {
        healthy: true,
        message: `icalBuddy is working, ${calendars.length} calendars available`,
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        message: `icalBuddy is not installed or not accessible: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastChecked: new Date(),
      };
    }
  }

  getRetentionPolicy(): RetentionPolicy {
    // Calculate expected headline count based on current day
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sunday, 5=Friday, 6=Saturday

    let expectedCount = 1; // Always have "today"

    // Personal week (skip on Friday)
    if (dayOfWeek !== 5) {
      expectedCount++;
    }

    // Work week (skip on Friday)
    if (dayOfWeek !== 5) {
      expectedCount++;
    }

    // Weekend (only Wednesday-Saturday)
    if (dayOfWeek >= 3 && dayOfWeek <= 6) {
      expectedCount++;
    }

    // Keep the expected count for today to ensure old headlines are cleaned up
    return { type: 'count', value: expectedCount };
  }
}

// Export plugin instance
export default new CalendarPlugin();
