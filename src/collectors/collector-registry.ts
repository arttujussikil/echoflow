import { BaseCollector, PlatformInfo } from './base-collector';
import { logger } from '../utils/logger';

export class CollectorRegistry {
  private readonly collectors = new Map<string, BaseCollector>();

  register(collector: BaseCollector): void {
    this.collectors.set(collector.platformId, collector);
    logger.info(`Registered collector: ${collector.platformId} (${collector.displayName})`);
  }

  get(platformId: string): BaseCollector | undefined {
    return this.collectors.get(platformId);
  }

  isSupported(platformId: string): boolean {
    return this.collectors.has(platformId);
  }

  getSupportedPlatforms(): PlatformInfo[] {
    return Array.from(this.collectors.values()).map(c => c.getPlatformInfo());
  }

  getAll(): BaseCollector[] {
    return Array.from(this.collectors.values());
  }
}

export const registry = new CollectorRegistry();
