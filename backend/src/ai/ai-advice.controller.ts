import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../users/entities/user.entity';
import { AiAdviceService } from './ai-advice.service';

type AuthRequest = {
  user: {
    id: string;
    role: UserRole;
  };
};

@ApiTags('AI')
@Controller('farm-plots/:plotId/ai-advice')
export class AiAdviceController {
  constructor(private readonly aiAdviceService: AiAdviceService) {}

  @Get()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get an AI-assisted practical advice for a farm plot.',
  })
  async getPlotAdvice(
    @Req() req: AuthRequest,
    @Param('plotId', ParseUUIDPipe) plotId: string,
    @Query('language') language?: string,
  ) {
    const data = await this.aiAdviceService.getPlotAdvice(
      plotId,
      req.user.id,
      req.user.role,
      language === 'kk' ? 'kk' : 'ru',
    );
    return { success: true, data };
  }
}

@ApiTags('Weather')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('farm-plots/:plotId/conditions')
export class PlotConditionsController {
  constructor(private readonly aiAdviceService: AiAdviceService) {}

  @Get()
  async getConditions(
    @Req() req: AuthRequest,
    @Param('plotId', ParseUUIDPipe) plotId: string,
  ) {
    return {
      success: true,
      data: await this.aiAdviceService.getPlotConditions(
        plotId,
        req.user.id,
        req.user.role,
      ),
    };
  }
}
