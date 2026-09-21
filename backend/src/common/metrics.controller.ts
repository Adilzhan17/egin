import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import type { Response } from 'express';
import { MetricsGuard } from './metrics.guard';

@SkipThrottle()
@Controller()
export class MetricsController extends PrometheusController {
  @Get()
  @UseGuards(MetricsGuard)
  index(@Res({ passthrough: true }) response: Response) {
    return super.index(response);
  }
}
