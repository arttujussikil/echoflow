/**
 * Platform auth/env configuration.
 * Collector metadata (capabilities, display names) lives in each collector class.
 * Add credentials here when a collector requires authentication.
 */
export const platformConfig: Record<string, { apiKey?: string; clientId?: string; clientSecret?: string }> = {
  twitter: {
    apiKey: process.env.TWITTER_API_KEY,
    clientId: process.env.TWITTER_CLIENT_ID,
    clientSecret: process.env.TWITTER_CLIENT_SECRET,
  },
};
