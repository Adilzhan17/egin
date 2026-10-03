import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(private readonly usersService: UsersService) {}

  async onApplicationBootstrap() {
    const phone = process.env.ADMIN_PHONE?.trim();
    const password = process.env.ADMIN_PASSWORD?.trim();

    if (!phone || !password) {
      this.logger.log(
        'Admin bootstrap skipped: ADMIN_PHONE or ADMIN_PASSWORD is not configured',
      );
      return;
    }

    await this.usersService.ensureAdminUser({
      phone,
      password,
      fullName: process.env.ADMIN_FULL_NAME?.trim() || 'Platform Admin',
      region: process.env.ADMIN_REGION?.trim() || 'Алматинская область',
      district: process.env.ADMIN_DISTRICT?.trim() || 'Талгар',
    });

    this.logger.log(`Admin account is ready for ${phone}`);
  }
}
