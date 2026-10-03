import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../users/entities/user.entity';
import { CreateFarmActivityDto } from './dto/create-farm-activity.dto';
import { FarmActivitiesService } from './farm-activities.service';

type AuthRequest = {
  user: {
    id: string;
    role: UserRole;
  };
};

@ApiTags('FarmActivities')
@Controller()
export class FarmActivitiesController {
  constructor(private readonly activitiesService: FarmActivitiesService) {}

  @Post('farm-plots/:plotId/activities')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add a work journal entry to a farm plot.' })
  async create(
    @Req() req: AuthRequest,
    @Param('plotId') plotId: string,
    @Body() dto: CreateFarmActivityDto,
  ) {
    const data = await this.activitiesService.create(
      plotId,
      req.user.id,
      req.user.role,
      dto,
    );
    return { success: true, data };
  }

  @Get('farm-plots/:plotId/activities')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List work journal entries for a farm plot.' })
  async findByPlot(
    @Req() req: AuthRequest,
    @Param('plotId') plotId: string,
  ) {
    const data = await this.activitiesService.findByPlot(
      plotId,
      req.user.id,
      req.user.role,
    );
    return { success: true, data };
  }

  @Delete('farm-activities/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a work journal entry.' })
  async remove(@Req() req: AuthRequest, @Param('id') id: string) {
    const data = await this.activitiesService.remove(
      id,
      req.user.id,
      req.user.role,
    );
    return { success: true, data };
  }
}
