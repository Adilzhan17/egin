import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getRoot() {
    return {
      name: 'AgriPlan API',
      status: 'ok',
      launchRegion: 'Kazakhstan',
      docsPath: '/api/docs',
      healthPath: '/health',
    };
  }

  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      environment: process.env.APP_ENV || 'development',
    };
  }
}
