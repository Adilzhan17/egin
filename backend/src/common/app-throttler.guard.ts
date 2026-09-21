import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limit per real client. Behind the Cloudflare Tunnel every request comes from the local
 * cloudflared process, so the client IP is taken from CF-Connecting-IP (the API only listens on
 * 127.0.0.1, so the header cannot be supplied by a client directly).
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const cf = req.headers?.['cf-connecting-ip'];
    return (Array.isArray(cf) ? cf[0] : cf) || req.ips?.[0] || req.ip || 'unknown';
  }
}
