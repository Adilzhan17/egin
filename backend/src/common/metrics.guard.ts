import { CanActivate, ExecutionContext, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

/** /metrics is hidden (404) unless METRICS_TOKEN is set, and then requires `Authorization: Bearer <token>`. */
@Injectable()
export class MetricsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const token = process.env.METRICS_TOKEN?.trim();
    if (!token) throw new NotFoundException();

    const header: string = context.switchToHttp().getRequest().headers?.authorization ?? '';
    const expected = Buffer.from(`Bearer ${token}`);
    const given = Buffer.from(header);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
