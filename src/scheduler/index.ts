import cron from 'node-cron';
import { createLogger } from '../utils/logger.js';
import type { DailyDigestJob } from './DailyDigestJob.js';

const logger = createLogger({ component: 'scheduler' });

export function scheduleDailyDigest(job: DailyDigestJob, digestTime: string, timezone: string): void {
  const [hourStr, minuteStr] = digestTime.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error(`Invalid DIGEST_TIME format: ${digestTime}`);
  }

  const cronExpression = `${minute} ${hour} * * *`;
  logger.info({ cronExpression, timezone }, 'Scheduling daily digest job');

  cron.schedule(
    cronExpression,
    () => {
      job.run().catch((error) => {
        logger.error({ error }, 'Daily digest job failed');
      });
    },
    { timezone }
  );
}
