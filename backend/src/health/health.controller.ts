import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { parseEnvNumber } from '../common/utils/env.util';

const MB = 1024 * 1024;
import {
  HealthCheckService,
  HealthCheck,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
} from '@nestjs/terminus';

@SkipThrottle()
@Controller('api/health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      // Limits are configurable so normal growth does not flag a healthy service as down.
      () => this.memory.checkHeap('memory_heap', parseEnvNumber(process.env.HEALTH_MAX_HEAP_MB, 768) * MB),
      () => this.memory.checkRSS('memory_rss', parseEnvNumber(process.env.HEALTH_MAX_RSS_MB, 1024) * MB),
    ]);
  }
}
